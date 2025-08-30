
// File: /api/proxy.js
// This is a Vercel Serverless Function that acts as a multi-API proxy.
// It routes requests to Google Gemini, OpenAI, or DeepSeek based on the model name.

import { GoogleGenAI } from "@google/genai";
import { extractRawText } from "mammoth";
import JSZip from "jszip";
import { createRequire } from "module"; // NEW: For robust CJS module loading

// --- Create a require function for CJS compatibility ---
const require = createRequire(import.meta.url);

// --- API Key Configuration ---
// Vercel will inject these from your project's environment variables.
const GEMINI_API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// --- API Clients & Endpoints ---
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGE_API_URL = 'https://api.openai.com/v1/images/generations';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';


// --- Helper Functions ---

/**
 * A set of MIME types that are safe to read as plain text.
 * This prevents trying to decode binary files like .docx or .pdf.
 */
const TEXT_MIME_TYPES = new Set([
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/javascript',
    'text/xml',
    'text/csv',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/x-sh',
    'application/x-httpd-php',
    'application/rtf',
    'image/svg+xml' // SVG is XML-based and readable
]);

/**
 * Transforms a standard message history into the format required by OpenAI/DeepSeek.
 * (e.g., role 'model' becomes 'assistant', 'parts' becomes 'content')
 */
function formatHistoryForOpenAI(messages) {
    return messages
      .filter(msg => (msg.role === 'user' || msg.role === 'model') && !msg.attachments) // Only include user/model messages, no attachments
      .map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.text,
      }));
}

/**
 * Handles streaming responses from OpenAI-compatible APIs (like DeepSeek).
 * It reads the upstream stream and pipes it to the client in a consistent format.
 */
async function handleOpenAIStream(res, apiUrl, apiKey, payload, isWebSearchEnabled, isDeepThink) {
    let history = formatHistoryForOpenAI(payload.history);
    
    // Prepend system instruction if it exists
    if (payload.systemInstruction) {
        history.unshift({ role: 'system', content: payload.systemInstruction });
    }
    
    // The main handler already processes attachments, so payload.newMessage has text context
    // and payload.attachment has the single image.
    const userMessage = { role: 'user', content: payload.newMessage };

    // If there's an image attachment, format the content as a multi-part array
    if (payload.attachment && payload.attachment.mimeType.startsWith('image/')) {
        userMessage.content = [
            { type: 'text', text: payload.newMessage },
            {
                type: 'image_url',
                image_url: {
                    url: `data:${payload.attachment.mimeType};base64,${payload.attachment.data}`
                }
            }
        ];
    }
    
    history.push(userMessage);

    // Set headers for streaming to our client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Send initial status based on flags
    if (isWebSearchEnabled) {
        res.write(`data: ${JSON.stringify({ status: "Researching..." })}\n\n`);
    } else if (isDeepThink) {
        res.write(`data: ${JSON.stringify({ status: "Đang suy nghĩ..." })}\n\n`);
    }

    const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: payload.model,
            messages: history,
            stream: true,
        }),
    });

    if (!apiResponse.ok) {
        const error = await apiResponse.json();
        throw new Error(`[${apiResponse.status}] OpenAI/DeepSeek API Error: ${error.error?.message || 'Unknown error'}`);
    }

    const reader = apiResponse.body.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6).trim();
                    if (jsonStr === '[DONE]') {
                        break;
                    }
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                            // Forward in the format our frontend expects
                            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                        }
                    } catch (e) {
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }
        }
    } finally {
        res.end();
    }
}


// --- Main Handler ---
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body;
        const model = payload?.model || '';
        let result;

        switch (action) {
            case 'generateContent':
                 throw new Error(`Action 'generateContent' is deprecated. Use 'generateContentStream'.`);

            case 'generateContentStream': { // Use block scope for variables
                const { model, history, newMessage, attachments, isWebSearchEnabled, isDeepThinkEnabled, systemInstruction } = payload;

                if (isWebSearchEnabled && !model.startsWith('gemini')) {
                   throw new Error(`Web Search is not supported for the '${model}' model. Please use a Gemini model.`);
                }
                
                let finalNewMessage = newMessage;
                let imageAttachment = null;
                const textContents = [];
                
                if (attachments && attachments.length > 0) {
                    // FIX: Use `require` for `pdf-parse` to ensure correct CJS module loading and path resolution,
                    // preventing the library's internal test code from crashing the server.
                    const pdf = require("pdf-parse");

                    for (const att of attachments) {
                        const buffer = Buffer.from(att.data, 'base64');
                        const fileNameLower = att.fileName.toLowerCase();

                        try {
                            if (att.mimeType === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
                                const data = await pdf(buffer);
                                textContents.push(`The user attached a PDF file named "${att.fileName}". Its extracted text content is:\n\n--- FILE CONTENT ---\n${data.text || '(No text content found)'}\n--- END FILE ---`);
                            
                            } else if (att.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileNameLower.endsWith('.docx')) {
                                const { value } = await extractRawText({ buffer });
                                textContents.push(`The user attached a Word document named "${att.fileName}". Its extracted text content is:\n\n--- FILE CONTENT ---\n${value || '(No text content found)'}\n--- END FILE ---`);
                            
                            } else if (att.mimeType === 'application/zip' || fileNameLower.endsWith('.zip')) {
                                const zip = await JSZip.loadAsync(buffer);
                                const fileList = Object.keys(zip.files).filter(name => !zip.files[name].dir);
                                if (fileList.length > 0) {
                                     textContents.push(`The user attached a ZIP archive named "${att.fileName}". The contents of the files inside this ZIP archive cannot be read. The archive contains the following files:\n- ${fileList.join('\n- ')}\n\nAcknowledge that you have seen this file list but could not access the content within the files.`);
                                } else {
                                     textContents.push(`The user attached an empty ZIP archive named "${att.fileName}".`);
                                }
                            
                            } else if (TEXT_MIME_TYPES.has(att.mimeType) || att.mimeType.startsWith('text/')) {
                                const fileContent = buffer.toString('utf-8');
                                textContents.push(`The user has attached a file named "${att.fileName}". Its content is:\n\n--- FILE CONTENT ---\n${fileContent}\n--- END FILE ---`);
                            
                            } else if (att.mimeType.startsWith('image/') && att.mimeType !== 'image/svg+xml' && !imageAttachment) {
                                // This is a primary image for multimodal input, handle it separately.
                                imageAttachment = att;
                            
                            } else {
                                // Fallback for other binary types (or secondary images)
                                textContents.push(`The user has attached a file named "${att.fileName}". This is a binary file whose content type (${att.mimeType}) is not supported for reading. Acknowledge that the file was received but could not be read.`);
                            }
                        } catch (e) {
                            console.error(`Failed to parse attachment "${att.fileName}":`, e.message);
                            textContents.push(`The user attached a file named "${att.fileName}", but an error occurred while trying to read its content. Please inform the user that reading this specific file failed.`);
                        }
                    }
                }
                
                if (textContents.length > 0) {
                    finalNewMessage = `${textContents.join('\n\n')}\n\nBased on the content of the file(s) above, please respond to the following user prompt:\n\n--- USER PROMPT ---\n${newMessage}`;
                }

                // Create a unified payload for downstream functions
                const updatedPayload = { ...payload, newMessage: finalNewMessage, attachment: imageAttachment, attachments: null, systemInstruction };
        
                if (model.startsWith('gemini')) {
                    if (!ai) throw new Error("Gemini API key not configured or missing.");

                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.flushHeaders();

                    if (isWebSearchEnabled) {
                        res.write(`data: ${JSON.stringify({ status: "Researching..." })}\n\n`);
                    } else if (attachments && attachments.length > 0) {
                        res.write(`data: ${JSON.stringify({ status: "Processing files..." })}\n\n`);
                    }
                    
                    let conversationHistory = [ ...history ];
                    conversationHistory = conversationHistory.filter(m =>
                        (m.role === 'user' || m.role === 'model') && m.text?.trim() && !m.attachments
                    );
                    
                    const sdkHistory = conversationHistory.map(msg => ({
                        role: msg.role,
                        parts: [{ text: msg.text }]
                    }));

                    const userMessageParts = [{ text: finalNewMessage }];
                    if (imageAttachment) {
                         userMessageParts.unshift({ // Add image first
                            inlineData: {
                                mimeType: imageAttachment.mimeType,
                                data: imageAttachment.data,
                            },
                        });
                    }

                    const contents = [
                        ...sdkHistory,
                        { role: 'user', parts: userMessageParts }
                    ];

                    const streamResult = await ai.models.generateContentStream({
                        model: payload.model,
                        contents: contents,
                        config: {
                            ...(isWebSearchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
                            ...(systemInstruction ? { systemInstruction: systemInstruction } : {}),
                        },
                    });
                    
                    let metadataSent = false;
                    for await (const chunk of streamResult) {
                        // Always send the text chunk if it exists
                        if (chunk.text) {
                            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
                        }

                        // Check for grounding metadata and send it once
                        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                        if (groundingChunks && groundingChunks.length > 0 && !metadataSent) {
                            res.write(`data: ${JSON.stringify({ groundingMetadata: groundingChunks })}\n\n`);
                            metadataSent = true; // Ensure metadata is only sent once per stream
                        }
                    }
                    res.end();
                    return;

                } else if (model.startsWith('gpt-')) {
                    if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
                    await handleOpenAIStream(res, OPENAI_API_URL, OPENAI_API_KEY, updatedPayload, isWebSearchEnabled, false);
                    return;

                } else if (model.startsWith('deepseek')) {
                    if (!DEEPSEEK_API_KEY) throw new Error("DeepSeek API key not configured.");
                    await handleOpenAIStream(res, DEEPSEEK_API_URL, DEEPSEEK_API_KEY, updatedPayload, isWebSearchEnabled, isDeepThinkEnabled);
                    return;

                } else {
                    throw new Error(`Unsupported model for streaming: ${model}`);
                }
            }

            case 'generateSpeech': {
                if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
                const { text } = payload;
                if (!text) {
                    return res.status(400).json({ error: "Missing text in payload" });
                }

                const response = await fetch('https://api.openai.com/v1/audio/speech', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'tts-1',
                        input: text,
                        voice: 'echo',
                        speed: 1.0,
                        response_format: 'mp3'
                    }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(`[${response.status}] OpenAI TTS API Error: ${error.error?.message || 'Unknown error'}`);
                }

                const audioBuffer = await response.arrayBuffer();
                const base64Audio = Buffer.from(audioBuffer).toString('base64');
                
                return res.status(200).json({ audioContent: base64Audio });
            }

            case 'getTranslation': {
                if (!ai) throw new Error("Gemini API key not configured.");
                const { text, targetLanguage } = payload;
                if (!text || !targetLanguage) {
                    return res.status(400).json({ error: "Missing text or targetLanguage in payload" });
                }
                const prompt = `Translate the following to ${targetLanguage}. Output ONLY the translated text, without any introduction, labels, or explanation.\n\nTEXT: "${text}"`;
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });
                return res.status(200).json({ translatedText: response.text.trim() });
            }

            case 'generateImages': {
                const { model, prompt, config } = payload;
                if (model === 'dall-e-3') {
                    if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");

                    const aspectRatioToSize = {
                        '1:1': '1024x1024',
                        '16:9': '1792x1024',
                        '9:16': '1024x1792',
                    };
                    const size = aspectRatioToSize[config.aspectRatio] || '1024x1024';

                    const response = await fetch(OPENAI_IMAGE_API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        },
                        body: JSON.stringify({
                            model: 'dall-e-3',
                            prompt: prompt,
                            n: config.numberOfImages || 1,
                            size: size,
                            response_format: 'b64_json',
                            quality: config.quality || 'standard',
                            style: config.style || 'vivid',
                        }),
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        const errorMessage = error.error?.message || 'Unknown error';
                        if (errorMessage.includes('blocked by our content filters')) {
                           throw new Error(`Your prompt was blocked by the safety system. Please modify your prompt and try again.`);
                        }
                        throw new Error(`[${response.status}] DALL-E 3 API Error: ${errorMessage}`);
                    }
                    const data = await response.json();
                    // Reformat to match Gemini's output
                    result = {
                        generatedImages: data.data.map(img => ({
                            image: { imageBytes: img.b64_json }
                        }))
                    };
                } else {
                    // Default to Gemini
                    if (!ai) throw new Error("Gemini API key not configured for image generation.");
                    result = await ai.models.generateImages(payload);
                }
                break;
            }

            case 'editImage': {
                if (!ai) throw new Error("Gemini API key not configured for image editing.");
                const { prompt, image, config } = payload;
                 const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image-preview',
                    contents: {
                        parts: [
                          {
                            inlineData: {
                              data: image.data,
                              mimeType: image.mimeType,
                            },
                          },
                          {
                            text: prompt,
                          },
                        ],
                    },
                    config: {
                        responseModalities: ['IMAGE', 'TEXT'],
                    },
                });

                const parts = response.candidates?.[0]?.content?.parts || [];
                const textPart = parts.find(p => p.text)?.text || '';
                const imagePart = parts.find(p => p.inlineData);
                const attachments = [];
                if (imagePart) {
                    attachments.push({
                        data: imagePart.inlineData.data,
                        mimeType: imagePart.inlineData.mimeType || 'image/png',
                        fileName: 'edited-image.png'
                    });
                }
                result = { text: textPart, attachments: attachments };
                break;
            }
            
            case 'swapFace': {
                const { targetImage, sourceImage } = payload;
                const GRADIO_PUBLIC_URL = "https://1eb54d8183e8cef40d.gradio.live"; // <-- URL mới nhất
                
                // --- BƯỚC 1 & 2: UPLOAD VÀ JOIN QUEUE (Không thay đổi) ---
                const uploadFileAndGetRef = async (image) => {
                    const UPLOAD_ENDPOINT = "/gradio_api/upload";
                    const buffer = Buffer.from(image.data, 'base64');
                    const formData = new FormData();
                    formData.append("files", new Blob([buffer], { type: image.mimeType }), image.fileName);
                    const uploadResponse = await fetch(`${GRADIO_PUBLIC_URL}${UPLOAD_ENDPOINT}`, { method: "POST", body: formData });
                    if (!uploadResponse.ok) throw new Error(`[${uploadResponse.status}] Failed to upload file ${image.fileName}.`);
                    const uploadResult = await uploadResponse.json();
                    if (!uploadResult || uploadResult.length === 0) throw new Error("Gradio upload returned no file reference.");
                    const fileRef = { path: uploadResult[0], url: `${GRADIO_PUBLIC_URL}/gradio_api/file=${uploadResult[0]}`, orig_name: image.fileName, mime_type: image.mimeType, size: buffer.length, meta: { _type: "gradio.FileData" } };
                    console.log(`Proxy: Successfully uploaded ${image.fileName}.`);
                    return fileRef;
                };
                const sourceFileRef = await uploadFileAndGetRef(sourceImage);
                const targetFileRef = await uploadFileAndGetRef(targetImage);
                const JOIN_ENDPOINT = "/gradio_api/queue/join";
                const FN_INDEX_FOR_SWAP_FACE = 0;
                const sessionHash = Math.random().toString(36).substring(2);
                console.log(`Proxy: Joining Gradio queue with file references...`);
                const joinResponse = await fetch(`${GRADIO_PUBLIC_URL}${JOIN_ENDPOINT}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fn_index: FN_INDEX_FOR_SWAP_FACE, data: [sourceFileRef, targetFileRef], session_hash: sessionHash }),
                });
                if (!joinResponse.ok) throw new Error(`[${joinResponse.status}] Failed to join Gradio queue.`);
                console.log("Proxy: Successfully joined queue. Now polling for result...");

                // --- BƯỚC 3: HỎI THĂM KẾT QUẢ (PHIÊN BẢN HOÀN CHỈNH) ---
                const DATA_ENDPOINT = `/gradio_api/queue/data?session_hash=${sessionHash}`;
                const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
                
                let attempts = 0;
                const maxAttempts = 90;

                while (attempts < maxAttempts) {
                    await sleep(1000);
                    attempts++;

                    const dataResponse = await fetch(`${GRADIO_PUBLIC_URL}${DATA_ENDPOINT}`);
                    if (!dataResponse.ok) throw new Error(`[${dataResponse.status}] Error while polling.`);

                    const responseText = await dataResponse.text();
                    if (!responseText.trim()) continue;
                    
                    console.log(`[Attempt ${attempts}/${maxAttempts}] RAW RESPONSE:\n---\n${responseText}\n---`);

                    // *** LOGIC QUAN TRỌNG NHẤT LÀ Ở ĐÂY ***
                    // Duyệt qua TẤT CẢ các sự kiện trong phản hồi
                    const eventLines = responseText.trim().split('\n\n');
                    for (const line of eventLines) {
                        if (!line.startsWith('data:')) continue;
                        
                        const jsonString = line.substring(5).trim();
                        const responseData = JSON.parse(jsonString);

                        // Tìm sự kiện 'process_completed'
                        if (responseData.msg === "process_completed") {
                            console.log("Proxy: Found 'process_completed' event! Processing result.");
                            const resultFileRef = responseData.output?.data?.[0];

                            if (!resultFileRef || !resultFileRef.url) {
                                throw new Error("Result event is missing the output file URL.");
                            }

                            // --- BƯỚC 4: TẢI KẾT QUẢ VỀ ---
                            console.log(`Proxy: Downloading result from ${resultFileRef.url}`);
                            const resultResponse = await fetch(resultFileRef.url);
                            if (!resultResponse.ok) throw new Error("Failed to download the final image.");
                            
                            const resultBuffer = await resultResponse.arrayBuffer();
                            const resultBase64 = Buffer.from(resultBuffer).toString('base64');
                            const resultMimeType = resultResponse.headers.get('content-type') || 'image/jpeg';
                            
                            result = {
                                data: resultBase64,
                                mimeType: resultMimeType,
                                fileName: `swapped_${targetImage.fileName}`
                            };
                            return res.status(200).json(result); 
                        }
                    } // Kết thúc vòng lặp for
                } // Kết thúc vòng lặp while
                
                throw new Error("Polling for Gradio result timed out.");
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Error in proxy function:', error);
        return res.status(500).json({
            error: 'An internal server error occurred.',
            details: error.message
        });
    }
}
