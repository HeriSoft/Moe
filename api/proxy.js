// File: /api/proxy.js
// This is a Vercel Serverless Function that acts as a multi-API proxy.
// It uses ioredis for logging and IP management.

import { GoogleGenAI } from "@google/genai";
import pg from 'pg';
import { extractRawText } from "mammoth";
import JSZip from "jszip";
import { createRequire } from "module";
import IORedis from 'ioredis';

// --- Create a require function ---
const require = createRequire(import.meta.url);

// --- Redis Setup ---
let redis = null;
if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
}
const isRedisConfigured = !!redis;

// --- API Key Configuration ---
const GEMINI_API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ADMIN_EMAIL = 'heripixiv@gmail.com';


// --- API Clients & Endpoints ---
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGE_API_URL = 'https://api.openai.com/v1/images/generations';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// --- Database Connection Setup (with SSL fix) ---
const { Pool } = pg;
let connectionString = process.env.POSTGRES_URL;
if (connectionString) {
    connectionString = connectionString.includes('sslmode=')
        ? connectionString.replace(/sslmode=[^&]*/, 'sslmode=no-verify')
        : `${connectionString}${connectionString.includes('?') ? '&' : '?'}sslmode=no-verify`;
}
const pool = new Pool({ connectionString });


// --- DB TABLE INITIALIZATION ---
async function createTables() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                image_url TEXT,
                subscription_status VARCHAR(50) DEFAULT 'inactive',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Safely add new columns for membership and moderator features
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN NOT NULL DEFAULT false;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS exp INTEGER NOT NULL DEFAULT 0;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;');


        console.log("Table 'users' is ready.");
    } catch (error) {
        console.error("Error creating/altering users table:", error);
        throw new Error("Failed to initialize database tables.");
    } finally {
        client.release();
    }
}
let isDbInitialized = false;


// --- Pro Feature Check ---
async function isUserPro(email) {
    if (!email) return false;

    // 1. Check cache first
    if (isRedisConfigured) {
        try {
            const cachedStatus = await redis.get(`user-pro-status:${email}`);
            if (cachedStatus !== null) {
                return cachedStatus === 'true';
            }
        } catch (e) {
            console.error("Redis cache check error:", e);
        }
    }

    // 2. If not in cache, check database using both methods for compatibility
    let isPro = false;
    try {
        const { rows } = await pool.query(
            `SELECT id FROM users WHERE email = $1 AND (subscription_status = 'active' OR (subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()));`,
            [email]
        );
        isPro = rows.length > 0;
    } catch (e) {
        console.error("Database check error:", e.message);
        // If DB check fails, deny pro access to be safe and prevent unexpected costs.
        return false;
    }

    // 3. Store result in cache
    if (isRedisConfigured) {
        try {
            // Cache for 5 minutes
            await redis.set(`user-pro-status:${email}`, isPro, 'EX', 300);
        } catch (e) {
            console.error("Redis cache set error:", e);
        }
    }
    
    return isPro;
}


// --- Helper & Logging Functions ---
const getExpForLevel = (level) => {
    // New scaling formula to match the frontend.
    return 100 + (level * 50) + (level * level * 5);
};

async function logAction(email, message) {
    if (!isRedisConfigured || !email) return;
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] ${email} ${message}`;
        await redis.lpush('user_logs', logEntry);
        await redis.ltrim('user_logs', 0, 999);
    } catch (e) {
        console.error("Redis Logging Error:", e);
    }
}
// ... (Các hàm helper khác như TEXT_MIME_TYPES, formatHistoryForOpenAI, handleOpenAIStream giữ nguyên) ...

const TEXT_MIME_TYPES = new Set([
    'text/plain', 'text/markdown', 'text/html', 'text/css', 'text/javascript',
    'text/xml', 'text/csv', 'application/json', 'application/javascript',
    'application/xml', 'application/x-sh', 'application/x-httpd-php',
    'application/rtf', 'image/svg+xml'
]);

function formatHistoryForOpenAI(messages) {
    return messages
      .filter(msg => (msg.role === 'user' || msg.role === 'model') && !msg.attachments)
      .map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.text,
      }));
}

async function handleOpenAIStream(res, apiUrl, apiKey, payload, isWebSearchEnabled, isDeepThink) {
    let history = formatHistoryForOpenAI(payload.history);
    if (payload.systemInstruction) {
        history.unshift({ role: 'system', content: payload.systemInstruction });
    }
    const userMessage = { role: 'user', content: payload.newMessage };
    if (payload.attachment && payload.attachment.mimeType.startsWith('image/')) {
        userMessage.content = [
            { type: 'text', text: payload.newMessage },
            {
                type: 'image_url',
                image_url: { url: `data:${payload.attachment.mimeType};base64,${payload.attachment.data}` }
            }
        ];
    }
    history.push(userMessage);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    if (isWebSearchEnabled) res.write(`data: ${JSON.stringify({ status: "Researching..." })}\n\n`);
    else if (isDeepThink) res.write(`data: ${JSON.stringify({ status: "Đang suy nghĩ..." })}\n\n`);

    const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: payload.model, messages: history, stream: true }),
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
                    if (jsonStr === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                    } catch (e) {}
                }
            }
        }
    } finally {
        res.end();
    }
}

// --- Main Handler ---
export default async function handler(req, res) {
    // --- DB INITIALIZATION ---
    if (!isDbInitialized) {
        try {
            await createTables();
            isDbInitialized = true;
        } catch (initError) {
            console.error("Database initialization failed inside handler:", initError);
            return res.status(503).json({
                error: 'Service Unavailable',
                details: 'The database could not be initialized. Please try again later.'
            });
        }
    }
    // --- IP Blocking Middleware ---
    if (isRedisConfigured) {
        const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress;
        try {
            const isBlocked = await redis.sismember('blocked_ips', userIp);
            if (isBlocked) {
                return res.status(403).json({ error: 'Access Denied', details: 'Your IP address has been blocked.' });
            }
        } catch (e) {
            console.error("Redis IP Block Check Error:", e);
        }
    }
    // --- End IP Blocking Middleware ---

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { action, payload } = req.body;
        const userEmail = payload?.user?.email;
        const isAdmin = userEmail === ADMIN_EMAIL;

        // --- FEATURE GATING ---
        const proActions = ['swapFace', 'generateImages', 'editImage', 'generateSpeech'];
        const proModels = ['gpt-4.1', 'gpt-5', 'o3'];

        const isProAction = proActions.includes(action);
        const isProModel = action === 'generateContentStream' && proModels.includes(payload.model);

        if ((isProAction || isProModel) && !isAdmin) {
            const userIsPro = await isUserPro(userEmail);
            if (!userIsPro) {
                const featureName = isProModel ? `the ${payload.model} model` : 'this feature';
                return res.status(403).json({
                    error: 'Forbidden',
                    details: `This is a Pro feature. Please upgrade your account to use ${featureName}.`
                });
            }
        }
        // --- END FEATURE GATING ---
        
        let result;

        switch (action) {
            case 'logLogin': {
                const { user } = payload;
                if (!user || !user.email) {
                    return res.status(400).json({ error: 'User profile is required.' });
                }

                // Log to Redis
                if (isRedisConfigured) {
                    await logAction(user.email, 'logged in');
                    const userIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress;
                    await redis.hset('user_ips', user.email, userIp);
                }
                
                // Upsert user into PostgreSQL database
                try {
                    await pool.query(`
                        INSERT INTO users (email, name, image_url)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (email) DO UPDATE SET
                            name = EXCLUDED.name,
                            image_url = EXCLUDED.image_url,
                            updated_at = CURRENT_TIMESTAMP;
                    `, [user.email, user.name, user.imageUrl]);

                    // Fetch the complete, updated profile from the database
                    const { rows } = await pool.query(
                        `SELECT id, name, email, image_url, subscription_expires_at, is_moderator, level, exp, points FROM users WHERE email = $1;`,
                        [user.email]
                    );
                    
                    if (rows.length > 0) {
                        const dbUser = rows[0];
                        const fullUserProfile = {
                            id: dbUser.id,
                            name: dbUser.name,
                            email: dbUser.email,
                            imageUrl: dbUser.image_url,
                            subscriptionExpiresAt: dbUser.subscription_expires_at,
                            isModerator: dbUser.is_moderator,
                            isPro: dbUser.subscription_expires_at && new Date(dbUser.subscription_expires_at) > new Date(),
                            level: dbUser.level,
                            exp: dbUser.exp,
                            points: dbUser.points,
                        };
                        return res.status(200).json({ success: true, user: fullUserProfile });
                    }
                    
                    return res.status(404).json({ error: 'User not found after login.' });

                } catch (dbError) {
                    console.error("Database error during user login/profile fetch:", dbError);
                    return res.status(500).json({ error: 'Database operation failed.' });
                }
            }
            
            case 'add_exp': {
                const { amount } = payload;
                const email = userEmail;
                if (!email || !amount) {
                    return res.status(400).json({ error: 'User and amount are required.' });
                }

                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const { rows } = await client.query('SELECT id, level, exp FROM users WHERE email = $1 FOR UPDATE;', [email]);
                    if (rows.length === 0) {
                        throw new Error('User not found.');
                    }

                    let { id, level, exp } = rows[0];
                    if (level >= 100) {
                        await client.query('COMMIT');
                        return res.status(200).json({ success: true, user: { level, exp } });
                    }

                    exp += amount;
                    let expToNextLevel = getExpForLevel(level);

                    while (level < 100 && exp >= expToNextLevel) {
                        exp -= expToNextLevel;
                        level++;
                        expToNextLevel = getExpForLevel(level);
                    }

                    if (level >= 100) {
                        exp = 0; // Cap EXP at max level
                    }

                    await client.query('UPDATE users SET level = $1, exp = $2, updated_at = NOW() WHERE id = $3;', [level, exp, id]);
                    await client.query('COMMIT');
                    
                    result = { success: true, user: { level, exp } };
                } catch (dbError) {
                    await client.query('ROLLBACK');
                    console.error("Database error during EXP update:", dbError);
                    return res.status(500).json({ error: 'Database operation failed.' });
                } finally {
                    client.release();
                }
                break;
            }
            
            case 'add_points': {
                const { amount } = payload;
                const email = userEmail;
                 if (!email) {
                    return res.status(400).json({ error: 'User is required.' });
                }

                try {
                    const { rows } = await pool.query(
                        `UPDATE users SET points = GREATEST(0, points + $1), updated_at = NOW() WHERE email = $2 RETURNING points;`,
                        [amount, email]
                    );
                    if (rows.length === 0) {
                        throw new Error('User not found.');
                    }
                    result = { success: true, user: { points: rows[0].points } };
                } catch (dbError) {
                    console.error("Database error during points update:", dbError);
                    return res.status(500).json({ error: 'Database operation failed.' });
                }
                break;
            }

            case 'generateContentStream': {
                await logAction(userEmail, `chatted using ${payload.model}`);
                const { model, history, newMessage, attachments, isWebSearchEnabled, isDeepThinkEnabled, systemInstruction } = payload;

                if (isWebSearchEnabled && !model.startsWith('gemini')) {
                   throw new Error(`Web Search is not supported for the '${model}' model.`);
                }
                
                let finalNewMessage = newMessage;
                let imageAttachment = null;
                const textContents = [];
                
                if (attachments && attachments.length > 0) {
                    const pdf = require("pdf-parse");
                    for (const att of attachments) {
                        const buffer = Buffer.from(att.data, 'base64');
                        const fileNameLower = att.fileName.toLowerCase();
                        try {
                            if (att.mimeType === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
                                const data = await pdf(buffer);
                                textContents.push(`PDF Attachment "${att.fileName}":\n${data.text || '(No text content found)'}`);
                            } else if (att.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileNameLower.endsWith('.docx')) {
                                const { value } = await extractRawText({ buffer });
                                textContents.push(`Word Attachment "${att.fileName}":\n${value || '(No text content found)'}`);
                            } else if (att.mimeType === 'application/zip' || fileNameLower.endsWith('.zip')) {
                                const zip = await JSZip.loadAsync(buffer);
                                const fileList = Object.keys(zip.files).filter(name => !zip.files[name].dir);
                                textContents.push(`ZIP Attachment "${att.fileName}" contains:\n- ${fileList.join('\n- ')}`);
                            } else if (TEXT_MIME_TYPES.has(att.mimeType) || att.mimeType.startsWith('text/')) {
                                const fileContent = buffer.toString('utf-8');
                                textContents.push(`Text Attachment "${att.fileName}":\n${fileContent}`);
                            } else if (att.mimeType.startsWith('image/') && att.mimeType !== 'image/svg+xml' && !imageAttachment) {
                                imageAttachment = att;
                            } else {
                                textContents.push(`Unsupported Attachment: "${att.fileName}"`);
                            }
                        } catch (e) {
                            console.error(`Failed to parse attachment "${att.fileName}":`, e.message);
                            textContents.push(`Failed to read attachment: "${att.fileName}"`);
                        }
                    }
                }
                
                if (textContents.length > 0) {
                    finalNewMessage = `${textContents.join('\n\n')}\n\nUser Prompt: ${newMessage}`;
                }

                const updatedPayload = { ...payload, newMessage: finalNewMessage, attachment: imageAttachment, attachments: null, systemInstruction };
        
                const openAICompatibleModels = ['gpt-4.1', 'gpt-5-mini', 'gpt-5', 'o3', 'o3-mini'];

                if (model.startsWith('gemini')) {
                    if (!ai) throw new Error("Gemini API key not configured.");
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.flushHeaders();

                    if (isWebSearchEnabled) res.write(`data: ${JSON.stringify({ status: "Researching..." })}\n\n`);
                    else if (attachments && attachments.length > 0) res.write(`data: ${JSON.stringify({ status: "Processing files..." })}\n\n`);
                    
                    let conversationHistory = [ ...history ].filter(m => (m.role === 'user' || m.role === 'model') && m.text?.trim() && !m.attachments);
                    const sdkHistory = conversationHistory.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }));
                    const userMessageParts = [{ text: finalNewMessage }];
                    if (imageAttachment) userMessageParts.unshift({ inlineData: { mimeType: imageAttachment.mimeType, data: imageAttachment.data } });

                    const contents = [ ...sdkHistory, { role: 'user', parts: userMessageParts } ];
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
                        if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
                        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                        if (groundingChunks && groundingChunks.length > 0 && !metadataSent) {
                            res.write(`data: ${JSON.stringify({ groundingMetadata: groundingChunks })}\n\n`);
                            metadataSent = true;
                        }
                    }
                    res.end();
                    return;

                } else if (openAICompatibleModels.includes(model)) {
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
            
            // ... (Các case khác giữ nguyên: generateSpeech, getTranslation, generateImages, editImage)
            case 'generateSpeech': {
                await logAction(userEmail, 'used Text-to-Speech');
                if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
                const { text } = payload;
                if (!text) return res.status(400).json({ error: "Missing text in payload" });

                const response = await fetch('https://api.openai.com/v1/audio/speech', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'tts-1', input: text, voice: 'echo', speed: 1.0, response_format: 'mp3' }),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(`[${response.status}] OpenAI TTS API Error: ${error.error?.message || 'Unknown error'}`);
                }
                const audioBuffer = await response.arrayBuffer();
                const base64Audio = Buffer.from(audioBuffer).toString('base64');
                result = { audioContent: base64Audio };
                break;
            }

            case 'getTranslation': {
                await logAction(userEmail, `translated text to ${payload.targetLanguage}`);
                if (!ai) throw new Error("Gemini API key not configured.");
                const { text, targetLanguage } = payload;
                if (!text || !targetLanguage) return res.status(400).json({ error: "Missing text or targetLanguage" });
                const prompt = `Translate the following to ${targetLanguage}. Output ONLY the translated text.\n\nTEXT: "${text}"`;
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
                result = { translatedText: response.text.trim() };
                break;
            }

            case 'generateImages': {
                await logAction(userEmail, `generated an image with ${payload.model}`);
                const { model, prompt, config } = payload;
                if (model === 'dall-e-3') {
                    if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
                    const size = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' }[config.aspectRatio] || '1024x1024';
                    const response = await fetch(OPENAI_IMAGE_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
                        body: JSON.stringify({ model: 'dall-e-3', prompt, n: config.numberOfImages || 1, size, response_format: 'b64_json', quality: config.quality || 'standard', style: config.style || 'vivid' }),
                    });
                    if (!response.ok) {
                        const error = await response.json();
                        const errorMessage = error.error?.message || 'Unknown error';
                        if (errorMessage.includes('blocked by our content filters')) throw new Error(`Your prompt was blocked by the safety system.`);
                        throw new Error(`[${response.status}] DALL-E 3 API Error: ${errorMessage}`);
                    }
                    const data = await response.json();
                    result = { generatedImages: data.data.map(img => ({ image: { imageBytes: img.b64_json } })) };
                } else {
                    if (!ai) throw new Error("Gemini API key not configured for image generation.");
                    result = await ai.models.generateImages(payload);
                }
                break;
            }

            case 'editImage': {
                await logAction(userEmail, 'edited an image');
                if (!ai) throw new Error("Gemini API key not configured.");
                const { prompt, images } = payload;
                const imageParts = images.map(img => ({
                    inlineData: { data: img.data, mimeType: img.mimeType }
                }));
                const textPart = { text: prompt };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image-preview',
                    contents: { parts: [...imageParts, textPart] },
                    config: { responseModalities: ['IMAGE', 'TEXT'] },
                });
                const parts = response.candidates?.[0]?.content?.parts || [];
                const textPartResponse = parts.find(p => p.text)?.text || '';
                const imagePartResponse = parts.find(p => p.inlineData);
                const attachments = imagePartResponse ? [{ data: imagePartResponse.inlineData.data, mimeType: imagePartResponse.inlineData.mimeType || 'image/png', fileName: 'edited-image.png' }] : [];
                result = { text: textPartResponse, attachments: attachments };
                break;
            }

            case 'swapFace': {
                // ... (Logic của case này không thay đổi, giữ nguyên như file gốc của bạn)
                await logAction(userEmail, 'played Swapface');
                const { targetImage, sourceImage } = payload;
                const GRADIO_PUBLIC_URL = "https://87dfe633f24cc394a3.gradio.live";
                
                const uploadFileAndGetRef = async (image) => {
                    const buffer = Buffer.from(image.data, 'base64');
                    const formData = new FormData();
                    formData.append("files", new Blob([buffer], { type: image.mimeType }), image.fileName);
                    const uploadResponse = await fetch(`${GRADIO_PUBLIC_URL}/gradio_api/upload`, { method: "POST", body: formData });
                    if (!uploadResponse.ok) throw new Error(`[${uploadResponse.status}] Failed to upload file ${image.fileName}.`);
                    const uploadResult = await uploadResponse.json();
                    if (!uploadResult || uploadResult.length === 0) throw new Error("Gradio upload returned no file reference.");
                    return { path: uploadResult[0], url: `${GRADIO_PUBLIC_URL}/gradio_api/file=${uploadResult[0]}`, orig_name: image.fileName, mime_type: image.mimeType, size: buffer.length, meta: { _type: "gradio.FileData" } };
                };
                const sourceFileRef = await uploadFileAndGetRef(sourceImage);
                const targetFileRef = await uploadFileAndGetRef(targetImage);
                const sessionHash = Math.random().toString(36).substring(2);

                console.log(`Proxy: Joining Gradio queue with file references...`);
                const joinResponse = await fetch(`${GRADIO_PUBLIC_URL}/gradio_api/queue/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fn_index: 0, data: [sourceFileRef, targetFileRef], session_hash: sessionHash }),
                });
                if (!joinResponse.ok) throw new Error(`[${joinResponse.status}] Failed to join Gradio queue.`);
                console.log("Proxy: Successfully joined queue. Now polling for result...");

                const DATA_ENDPOINT = `/gradio_api/queue/data?session_hash=${sessionHash}`;
                const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
                let attempts = 0;
                while (attempts < 90) {
                    await sleep(1000);
                    attempts++;
                    const dataResponse = await fetch(`${GRADIO_PUBLIC_URL}${DATA_ENDPOINT}`);
                    if (!dataResponse.ok) throw new Error(`[${dataResponse.status}] Error while polling.`);
                    const responseText = await dataResponse.text();
                    if (!responseText.trim()) continue;
                    
                    const eventLines = responseText.trim().split('\n\n');
                    for (const line of eventLines) {
                        if (!line.startsWith('data:')) continue;
                        const responseData = JSON.parse(line.substring(5).trim());

                        if (responseData.msg === "process_completed") {
                            console.log("Proxy: Found 'process_completed' event! Processing result.");
                            const resultFileRef = responseData.output?.data?.[0];
                            if (!resultFileRef || !resultFileRef.url) throw new Error("Result event is missing the output file URL.");
                            
                            console.log(`Proxy: Downloading result from ${resultFileRef.url}`);
                            const resultResponse = await fetch(resultFileRef.url);
                            if (!resultResponse.ok) throw new Error("Failed to download the final image.");
                            
                            const resultBuffer = await resultResponse.arrayBuffer();
                            result = {
                                data: Buffer.from(resultBuffer).toString('base64'),
                                mimeType: resultResponse.headers.get('content-type') || 'image/jpeg',
                                fileName: `swapped_${targetImage.fileName}`
                            };
                            return res.status(200).json(result); 
                        }
                    }
                }
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
