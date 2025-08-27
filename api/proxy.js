// File: /api/proxy.js
// This is a Vercel Serverless Function that acts as a multi-API proxy.
// It routes requests to Google Gemini, OpenAI, or DeepSeek based on the model name.

import { GoogleGenAI } from "@google/genai";

// --- API Key Configuration ---
// Vercel will inject these from your project's environment variables.
const GEMINI_API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// --- API Clients & Endpoints ---
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';


// --- Helper Functions ---

/**
 * Transforms a standard message history into the format required by OpenAI/DeepSeek.
 * (e.g., role 'model' becomes 'assistant', 'parts' becomes 'content')
 */
function formatHistoryForOpenAI(messages) {
    return messages
      .slice(1) // Exclude initial system message
      .filter(msg => !msg.attachments) // Exclude attachments from history
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
    const history = formatHistoryForOpenAI(payload.history);
    
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
                const { model, history, newMessage, attachments, isWebSearchEnabled, isDeepThinkEnabled } = payload;

                if (isWebSearchEnabled && !model.startsWith('gemini')) {
                   throw new Error(`Web Search is not supported for the '${model}' model. Please use a Gemini model.`);
                }

                let finalNewMessage = newMessage;
                let imageAttachment = null;
                const textContents = [];
                
                if (attachments && attachments.length > 0) {
                    for (const att of attachments) {
                        if (att.mimeType.startsWith('image/') && !imageAttachment) {
                            imageAttachment = att;
                        } else {
                             try {
                                const fileContent = Buffer.from(att.data, 'base64').toString('utf-8');
                                textContents.push(`The user has attached a file named "${att.fileName}". Its content is:\n\n--- FILE CONTENT ---\n${fileContent}\n--- END FILE ---`);
                             } catch (e) {
                                console.error("Failed to decode attachment:", att.fileName);
                                textContents.push(`[Could not read attached file: ${att.fileName}]`);
                             }
                        }
                    }
                }
                
                if (textContents.length > 0) {
                    finalNewMessage = `${textContents.join('\n\n')}\n\nPlease use the content from the file(s) above to inform your response to the following user prompt:\n\n--- USER PROMPT ---\n${newMessage}`;
                }

                // Create a unified payload for downstream functions
                const updatedPayload = { ...payload, newMessage: finalNewMessage, attachment: imageAttachment, attachments: null };
        
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
                        config: isWebSearchEnabled ? { tools: [{ googleSearch: {} }] } : undefined,
                    });

                    for await (const chunk of streamResult) {
                        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
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

            case 'generateImages':
                 if (!ai) throw new Error("Gemini API key not configured for image generation.");
                 result = await ai.models.generateImages(payload);
                 break;

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