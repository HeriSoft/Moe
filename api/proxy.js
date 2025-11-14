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
const GROK_API_KEY = process.env.GROK_API_KEY;
const ADMIN_EMAIL = 'heripixiv@gmail.com';


// --- API Clients & Endpoints ---
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_IMAGE_API_URL = 'https://api.openai.com/v1/images/generations';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const GROK_API_URL = 'https://api.xai.com/v1/chat/completions';

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
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS has_permanent_name_color BOOLEAN NOT NULL DEFAULT false;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS has_sakura_banner BOOLEAN NOT NULL DEFAULT false;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS unlocked_starter_languages TEXT[];');
        
        // NEW: Table for Study Zone stats
        await client.query(`
            CREATE TABLE IF NOT EXISTS study_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                language VARCHAR(50) NOT NULL,
                exp_gained INTEGER NOT NULL,
                completed_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log("Tables 'users' and 'study_log' are ready.");
    } catch (error) {
        console.error("Error creating/altering tables:", error);
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

    // 2. If not in cache, check database
    let isPro = false;
    try {
        // FIX: The query now relies solely on a future expiration date.
        // The previous logic (`subscription_status = 'active' OR ...`) was flawed,
        // as a user's status might not be updated immediately upon expiration,
        // incorrectly granting them continued access to Pro features.
        const { rows } = await pool.query(
            `SELECT id FROM users WHERE email = $1 AND subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW();`,
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

// Invalidate user pro status cache
async function invalidateUserProCache(email) {
    if (isRedisConfigured && email) {
        try {
            await redis.del(`user-pro-status:${email}`);
        } catch (e) {
            console.error("Redis cache invalidation error:", e);
        }
    }
}

// --- New Credit Deduction Helper ---
async function deductCredits(email, amount) {
    if (!email || amount <= 0) return false;
    try {
        const { rowCount } = await pool.query(
            `UPDATE users SET credits = credits - $1 WHERE email = $2 AND credits >= $1;`,
            [amount, email]
        );
        return rowCount > 0;
    } catch (e) {
        console.error(`Credit deduction error for ${email}:`, e);
        return false;
    }
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

const TEXT_MIME_TYPES = new Set([
    'text/plain', 'text/markdown', 'text/html', 'text/css', 'text/javascript',
    'text/xml', 'text/csv', 'application/json', 'application/javascript',
    'application/xml', 'application/x-sh', 'application/x-httpd-php',
    'application/rtf', 'image/svg+xml'
]);

function formatHistoryForOpenAI(messages) {
    return messages
      .filter(msg => (msg.role === 'user' || msg.role === 'model') && (msg.text || (msg.attachments && msg.attachments.length > 0)))
      .map(msg => {
        const role = msg.role === 'model' ? 'assistant' : 'user';
        
        const imageAttachments = msg.attachments?.filter(att => att.mimeType.startsWith('image/'));

        if (imageAttachments && imageAttachments.length > 0) {
            const contentParts = [{ type: 'text', text: msg.text }];
            imageAttachments.forEach(att => {
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: `data:${att.mimeType};base64,${att.data}` }
                });
            });
            return { role, content: contentParts };
        } else {
            return { role, content: msg.text };
        }
      });
}

async function handleChatCompletionStream(res, apiUrl, apiKey, payload, isWebSearchEnabled, isDeepThink) {
    let history = formatHistoryForOpenAI(payload.history);
    if (payload.systemInstruction) {
        history.unshift({ role: 'system', content: payload.systemInstruction });
    }
    
    const userMessageContent = [{ type: 'text', text: payload.newMessage }];
    if (payload.attachments && payload.attachments.length > 0) {
        payload.attachments.forEach(att => {
            if (att.mimeType.startsWith('image/')) {
                userMessageContent.push({
                    type: 'image_url',
                    image_url: { url: `data:${att.mimeType};base64,${att.data}` }
                });
            }
        });
    }

    const userMessage = { 
        role: 'user', 
        content: (userMessageContent.length === 1 && userMessageContent[0].type === 'text')
            ? payload.newMessage 
            : userMessageContent
    };
    
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
        throw new Error(`[${apiResponse.status}] Chat Completion API Error: ${error.error?.message || 'Unknown error'}`);
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

async function getAndReturnStudyStats(client, userId) {
    const [statsRes, todayRes, langRes] = await Promise.all([
        client.query('SELECT COALESCE(SUM(exp_gained), 0) as total_exp_earned, COUNT(*) as total_lessons_completed FROM study_log WHERE user_id = $1;', [userId]),
        client.query("SELECT COUNT(*) as today_lessons_completed FROM study_log WHERE user_id = $1 AND completed_at >= current_date;", [userId]),
        client.query('SELECT array_agg(DISTINCT language) as languages_studied FROM study_log WHERE user_id = $1;', [userId])
    ]);

    const stats = {
        total_exp_earned: parseInt(statsRes.rows[0].total_exp_earned, 10),
        total_lessons_completed: parseInt(statsRes.rows[0].total_lessons_completed, 10),
        today_lessons_completed: parseInt(todayRes.rows[0].today_lessons_completed, 10),
        languages_studied: langRes.rows[0].languages_studied || []
    };
    return stats;
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
        const proModels = ['gpt-4.1', 'gpt-5', 'o3', 'gemini-2.5-pro', 'grok-4'];

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
                        `SELECT id, name, email, image_url, subscription_expires_at, is_moderator, level, exp, points, credits, has_permanent_name_color, has_sakura_banner, unlocked_starter_languages FROM users WHERE email = $1;`,
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
                            credits: dbUser.credits,
                            hasPermanentNameColor: dbUser.has_permanent_name_color,
                            hasSakuraBanner: dbUser.has_sakura_banner,
                            unlocked_starter_languages: dbUser.unlocked_starter_languages || [],
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

            case 'awardPrize': {
                const { prizeId } = payload;
                if (!userEmail || !prizeId) {
                    return res.status(400).json({ error: 'User and prizeId are required.' });
                }
                
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    
                    // Atomically deduct points for the spin and get the user's current state
                    const pointsResult = await client.query(
                        `UPDATE users SET points = points - 1000 WHERE email = $1 AND points >= 1000 RETURNING id, level, exp;`,
                        [userEmail]
                    );
            
                    if (pointsResult.rows.length === 0) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ error: 'Forbidden', details: 'Not enough points to spin.' });
                    }
            
                    let { id, level, exp } = pointsResult.rows[0];
                    await logAction(userEmail, `spent 1000 points and won prize ${prizeId} from lucky wheel`);

                    let expToAdd = 0;
                    switch (prizeId) {
                        case 'exp_5': expToAdd = 5; break;
                        case 'exp_10': expToAdd = 10; break;
                        case 'exp_15': expToAdd = 15; break;
                        case 'exp_50': expToAdd = 50; break;
                        case 'exp_100': expToAdd = 100; break;
                        case 'exp_500': expToAdd = 500; break;
                        case 'exp_2000': expToAdd = 2000; break;
                        case 'credits_2':
                            await client.query('UPDATE users SET credits = credits + 2, updated_at = NOW() WHERE id = $1;', [id]);
                            break;
                        case 'credits_10':
                            await client.query('UPDATE users SET credits = credits + 10, updated_at = NOW() WHERE id = $1;', [id]);
                            break;
                        case 'ticket_1':
                            await client.query('UPDATE users SET points = points + 1000, updated_at = NOW() WHERE id = $1;', [id]);
                            break;
                        case 'sakura_banner':
                            await client.query('UPDATE users SET has_sakura_banner = true, updated_at = NOW() WHERE id = $1;', [id]);
                            break;
                        case 'lose': break;
                        default: throw new Error('Invalid prizeId');
                    }
            
                    if (expToAdd > 0) {
                        exp += expToAdd;
                        let expToNextLevel = getExpForLevel(level);
                        while (level < 100 && exp >= expToNextLevel) {
                            exp -= expToNextLevel;
                            level++;
                            expToNextLevel = getExpForLevel(level);
                        }
                        if (level >= 100) exp = 0;
                        await client.query('UPDATE users SET level = $1, exp = $2, updated_at = NOW() WHERE id = $3;', [level, exp, id]);
                    }
                    
                    await client.query('COMMIT');

                    const { rows } = await pool.query(
                        `SELECT id, name, email, image_url, subscription_expires_at, is_moderator, level, exp, points, credits, has_permanent_name_color, has_sakura_banner, unlocked_starter_languages FROM users WHERE id = $1;`,
                        [id]
                    );
                    const dbUser = rows[0];
                    const fullUserProfile = {
                        id: dbUser.id, name: dbUser.name, email: dbUser.email, imageUrl: dbUser.image_url,
                        subscriptionExpiresAt: dbUser.subscription_expires_at, isModerator: dbUser.is_moderator,
                        isPro: dbUser.subscription_expires_at && new Date(dbUser.subscription_expires_at) > new Date(),
                        level: dbUser.level, exp: dbUser.exp, points: dbUser.points,
                        credits: dbUser.credits,
                        hasPermanentNameColor: dbUser.has_permanent_name_color, hasSakuraBanner: dbUser.has_sakura_banner,
                        unlocked_starter_languages: dbUser.unlocked_starter_languages || [],
                    };
                    result = { success: true, user: fullUserProfile };
                } catch (dbError) {
                    await client.query('ROLLBACK');
                    throw dbError;
                } finally {
                    client.release();
                }
                break;
            }

            case 'generateContentStream': {
                await logAction(userEmail, `chatted using ${payload.model}`);
                const { model, history, newMessage, attachments, isWebSearchEnabled, isDeepThinkEnabled, systemInstruction } = payload;

                const historyForProcessing = [...history];
                const lastMessageInHistory = historyForProcessing[historyForProcessing.length - 1];
            
                if (lastMessageInHistory && lastMessageInHistory.role === 'user' && lastMessageInHistory.text === newMessage) {
                    historyForProcessing.pop();
                }
                
                let finalNewMessage = newMessage;
                const imageAttachments = [];
                const textContents = [];
                
                if (attachments && attachments.length > 0) {
                    const pdf = require("pdf-parse");
                    for (const att of attachments) {
                        const buffer = Buffer.from(att.data, 'base64');
                        const fileNameLower = att.fileName.toLowerCase();
                        try {
                            if (att.mimeType.startsWith('image/') && att.mimeType !== 'image/svg+xml') {
                                imageAttachments.push(att);
                            } else if (att.mimeType === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
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
        
                const openAIModels = ['gpt-4.1', 'gpt-5-mini', 'gpt-5', 'o3', 'o3-mini'];
                const grokModels = ['grok-4'];

                if (model.startsWith('gemini')) {
                    if (!ai) throw new Error("Gemini API key not configured.");
                    if (isWebSearchEnabled && !model.startsWith('gemini')) {
                        throw new Error(`Web Search is not supported for the '${model}' model.`);
                    }

                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.flushHeaders();

                    if (isWebSearchEnabled) res.write(`data: ${JSON.stringify({ status: "Researching..." })}\n\n`);
                    else if (isDeepThinkEnabled) res.write(`data: ${JSON.stringify({ status: "Đang suy nghĩ..." })}\n\n`);
                    else if (attachments && attachments.length > 0) res.write(`data: ${JSON.stringify({ status: "Processing files..." })}\n\n`);
                    
                    let conversationHistory = [ ...historyForProcessing ].filter(m => (m.role === 'user' || m.role === 'model') && (m.text?.trim() || (m.attachments && m.attachments.length > 0)));
                    const sdkHistory = conversationHistory.map(msg => {
                        const parts = [];
                        if (msg.text) parts.push({ text: msg.text });
                        if (msg.attachments) {
                            msg.attachments.forEach(att => {
                                if (att.mimeType.startsWith('image/')) {
                                    parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
                                }
                            });
                        }
                        return { role: msg.role, parts };
                    });

                    const userMessageParts = [{ text: finalNewMessage }];
                    if (imageAttachments.length > 0) {
                        imageAttachments.forEach(att => {
                            userMessageParts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
                        });
                    }

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
                } else {
                    let apiUrl, apiKey;
                    let finalModel = model;
                    if (openAIModels.includes(model)) {
                        if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
                        apiUrl = OPENAI_API_URL;
                        apiKey = OPENAI_API_KEY;
                    } else if (model.startsWith('deepseek')) {
                        if (!DEEPSEEK_API_KEY) throw new Error("DeepSeek API key not configured.");
                        apiUrl = DEEPSEEK_API_URL;
                        apiKey = DEEPSEEK_API_KEY;
                    } else if (grokModels.includes(model)) {
                        if (!GROK_API_KEY) throw new Error("Grok API key not configured.");
                        apiUrl = GROK_API_URL;
                        apiKey = GROK_API_KEY;
                        if (model === 'grok-4') {
                            finalModel = 'grok-4-latest';
                        }
                    } else {
                        throw new Error(`Unsupported model for streaming: ${model}`);
                    }
                    
                    const updatedPayload = { ...payload, model: finalModel, history: historyForProcessing, newMessage: finalNewMessage, attachments: imageAttachments, systemInstruction };
                    await handleChatCompletionStream(res, apiUrl, apiKey, updatedPayload, isWebSearchEnabled, isDeepThinkEnabled);
                    return;
                }
            }
            
            case 'generateSpeech': {
                await logAction(userEmail, 'used Text-to-Speech');
                if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured.");
                const { text, voice = 'echo', speed = 1.0 } = payload;
                if (!text) return res.status(400).json({ error: "Missing text in payload" });

                const response = await fetch('https://api.openai.com/v1/audio/speech', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'tts-1', input: text, voice: voice, speed: speed, response_format: 'mp3' }),
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
                const GENERATE_COST = 4;
                if (!isAdmin) {
                    const canAfford = await deductCredits(userEmail, GENERATE_COST);
                    if (!canAfford) {
                        return res.status(403).json({ error: 'Forbidden', details: 'Not enough credits to generate images.' });
                    }
                }
                await logAction(userEmail, `generated an image with ${payload.model} (cost: ${GENERATE_COST} credits)`);
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
                const EDIT_COST = 4;
                if (!isAdmin) {
                    const canAfford = await deductCredits(userEmail, EDIT_COST);
                    if (!canAfford) {
                        return res.status(403).json({ error: 'Forbidden', details: 'Not enough credits to edit this image.' });
                    }
                }
                await logAction(userEmail, `edited an image (cost: ${EDIT_COST} credits)`);
                if (!ai) throw new Error("Gemini API key not configured.");
                const { prompt, images, config: payloadConfig } = payload;
                const imageParts = images.map(img => ({
                    inlineData: { data: img.data, mimeType: img.mimeType }
                }));
                const textPart = { text: prompt };
                
                const finalConfig = {
                    responseModalities: ['IMAGE', 'TEXT'],
                    ...(payloadConfig || {}) // Merge config from the frontend payload
                };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [...imageParts, textPart] },
                    config: finalConfig,
                });
                
                const parts = response.candidates?.[0]?.content?.parts || [];
                const textPartResponse = parts.find(p => p.text)?.text || '';
                const imagePartResponse = parts.find(p => p.inlineData);
                const attachments = imagePartResponse ? [{ data: imagePartResponse.inlineData.data, mimeType: imagePartResponse.inlineData.mimeType || 'image/png', fileName: 'edited-image.png' }] : [];
                result = { text: textPartResponse, attachments: attachments };
                break;
            }

            case 'swapFace': {
                const SWAP_COST = 2;
                if (!isAdmin) {
                    const canAfford = await deductCredits(userEmail, SWAP_COST);
                    if (!canAfford) {
                        return res.status(403).json({ error: 'Forbidden', details: 'Not enough credits for face swap.' });
                    }
                }
                await logAction(userEmail, `played Swapface (cost: ${SWAP_COST} credits)`);
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

            case 'generateReadingLesson': {
                await logAction(userEmail, `generated a ${payload.level} ${payload.language} study lesson`);
                if (!ai) throw new Error("Gemini API key not configured.");
                const { language, level, isStarterOnly } = payload;
                if (!language || !level) return res.status(400).json({ error: "Language and level are required." });

                let prompt;
                if (isStarterOnly) {
                    prompt = `
                    Generate a starter lesson for a 'Beginner' level student learning '${language}'. The goal is to learn the basic alphabet/characters.
                    The response MUST be a single, valid JSON object with the exact structure below. Do not include any markdown formatting.

                    The "alphabet_name" should be the name of the primary alphabet for the language (e.g., Hiragana for Japanese, Hangul for Korean).
                    "characters_to_learn" should be an array of 10-15 fundamental characters.
                    "quiz" MUST contain exactly 10 multiple-choice questions to test character recognition.

                    {
                      "starter": {
                        "alphabet_name": "Name of the alphabet",
                        "characters_to_learn": [
                          { "character": "あ", "pronunciation": "a", "example_word": "あさ (asa)", "example_translation": "morning" }
                        ],
                        "quiz": [
                          { "question_text": "Which character is 'ka'?", "options": ["か", "き", "く", "け"], "correct_answer_index": 0, "explanation": "'か' is pronounced 'ka'." }
                        ]
                      }
                    }
                    `;
                } else {
                    prompt = `
                    Generate a comprehensive, multi-skill language lesson for a '${level}' level student learning '${language}'.
                    The lesson should be engaging and cover Reading, Listening, Speaking, Writing, and general knowledge.
                    The response MUST be a single, valid JSON object with the exact structure below. Do not include any markdown formatting like \`\`\`json.
                
                    {
                      "reading": {
                        "passage": "A short reading passage in ${language}, approximately 100-200 words.",
                        "passage_translation": "The full Vietnamese translation of the passage.",
                        "questions": [
                          { "question_text": "A multiple-choice question in Vietnamese about the passage's main idea.", "options": ["Option A.", "Option B.", "Option C.", "Option D."], "correct_answer_index": 0, "explanation": "A brief explanation in Vietnamese." },
                          { "question_text": "A vocabulary question in Vietnamese based on a word from the passage.", "options": ["Option A.", "Option B.", "Option C.", "Option D."], "correct_answer_index": 2, "explanation": "A brief explanation in Vietnamese." },
                          { "question_text": "A grammar or context question in Vietnamese related to the passage.", "options": ["Option A.", "Option B.", "Option C.", "Option D."], "correct_answer_index": 1, "explanation": "A brief explanation in Vietnamese." }
                        ]
                      },
                      "listening": [
                        { "audio_text": "A short sentence in ${language} to be read aloud.", "question_text": "A multiple-choice question in Vietnamese about the audio content.", "options": ["Option A.", "Option B.", "Option C."], "correct_answer_index": 0 }
                      ],
                      "speaking": { "prompt": "A simple question or a sentence to read aloud in ${language}." },
                      "writing": { "prompt": "A simple writing task in Vietnamese, like 'Translate this sentence to ${language}: ...' or 'Write the character for...'" },
                      "general_questions": [
                        { "question_text": "A general multiple-choice grammar question in Vietnamese.", "options": ["Option A.", "Option B.", "Option C."], "correct_answer_index": 1, "explanation": "Explanation in Vietnamese." },
                        { "question_text": "A fill-in-the-blank vocabulary question in Vietnamese.", "options": ["word A", "word B", "word C"], "correct_answer_index": 2, "explanation": "Explanation in Vietnamese." },
                        { "question_text": "A cultural or common phrase question in Vietnamese.", "options": ["Option A.", "Option B.", "Option C."], "correct_answer_index": 0, "explanation": "Explanation in Vietnamese." }
                      ]
                    }`;
                }

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: prompt,
                    config: { responseMimeType: 'application/json' }
                });
                const lessonJson = JSON.parse(response.text);
                result = { lesson: lessonJson };
                break;
            }

            case 'gradeReadingAnswers': {
                await logAction(userEmail, `submitted a lesson for grading`);
                if (!ai) throw new Error("Gemini API key not configured.");
                const { lesson, userAnswers } = payload;
                
                const textGradingData = {
                    reading: {
                        questions: lesson.reading?.questions.map((q, i) => ({
                            question: q.question_text,
                            correct_answer: q.options[q.correct_answer_index],
                            user_answer: q.options[userAnswers.reading[i]]
                        })) || []
                    },
                    listening: {
                        questions: lesson.listening?.map((q, i) => ({
                            question: q.question_text,
                            correct_answer: q.options[q.correct_answer_index],
                            user_answer: q.options[userAnswers.listening[i]]
                        })) || []
                    },
                    writing_prompt: lesson.writing?.prompt,
                    general_questions: {
                         questions: lesson.general_questions?.map((q, i) => ({
                            question: q.question_text,
                            correct_answer: q.options[q.correct_answer_index],
                            user_answer: q.options[userAnswers.quiz[i]]
                        })) || []
                    },
                    starter_quiz: {
                        questions: lesson.starter?.quiz.map((q, i) => ({
                            question: q.question_text,
                            correct_answer: q.options[q.correct_answer_index],
                            user_answer: q.options[userAnswers.starter?.[i]]
                        })) || []
                    },
                };
            
                const promptText = `
                You are an AI language tutor. A student has completed a lesson. Grade their performance based on the provided data and, if applicable, the attached image for the writing task.
                
                Here is the data for the text-based parts:
                ${JSON.stringify(textGradingData, null, 2)}
                
                If a writingImage is attached, it is the student's handwritten answer to the writing prompt. Evaluate the handwriting for accuracy and legibility.
                
                Your task is to provide a complete evaluation in Vietnamese. The response MUST be a single, valid JSON object with the exact structure below.
                - For each skill that has data ('Reading', 'Listening', 'Writing', 'Quiz', 'Starter'), calculate a score from 0-100.
                - If grading a 'Starter' quiz, a score of 100 means all 10 questions were correct.
                - For 'Writing', if there's an image, base the score on it. If the score is below 70, you MUST set "rewrite": true.
                - Provide brief, encouraging, and constructive feedback in Vietnamese for each skill.
                - Calculate a 'totalScore' which is the average of all available skill scores.
                - Do not include any markdown formatting like \`\`\`json.
            
                {
                  "totalScore": 0,
                  "skillResults": [
                    { "skill": "Reading", "score": 0, "feedback": "" },
                    { "skill": "Listening", "score": 0, "feedback": "" },
                    { "skill": "Writing", "score": 0, "feedback": "", "rewrite": false },
                    { "skill": "Quiz", "score": 0, "feedback": "" },
                    { "skill": "Starter", "score": 0, "feedback": "" }
                  ]
                }`;

                const promptParts = [{ text: promptText }];
                if (userAnswers.writingImage) {
                    promptParts.push({
                        inlineData: {
                            mimeType: 'image/png',
                            data: userAnswers.writingImage
                        }
                    });
                }

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: [{ parts: promptParts }],
                    config: { responseMimeType: 'application/json' }
                });
                const gradingResult = JSON.parse(response.text);
                result = { result: gradingResult };
                break;
            }
            
            case 'unlock_starter_language': {
                const { language } = payload;
                if (!userEmail || !language) return res.status(400).json({ error: 'User and language are required.' });
                
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const { rows } = await client.query('SELECT id, unlocked_starter_languages FROM users WHERE email = $1 FOR UPDATE;', [userEmail]);
                    if (rows.length === 0) throw new Error('User not found.');
                    
                    const { id, unlocked_starter_languages: currentLangs } = rows[0];
                    const unlocked = new Set(currentLangs || []);
                    unlocked.add(language);
                    
                    await client.query('UPDATE users SET unlocked_starter_languages = $1 WHERE id = $2;', [Array.from(unlocked), id]);
                    await client.query('COMMIT');
            
                    const { rows: updatedRows } = await client.query(
                        `SELECT id, name, email, image_url, subscription_expires_at, is_moderator, level, exp, points, credits, has_permanent_name_color, has_sakura_banner, unlocked_starter_languages FROM users WHERE id = $1;`,
                        [id]
                    );
                    const dbUser = updatedRows[0];
                    const fullUserProfile = {
                        id: dbUser.id, name: dbUser.name, email: dbUser.email, imageUrl: dbUser.image_url,
                        subscriptionExpiresAt: dbUser.subscription_expires_at, isModerator: dbUser.is_moderator,
                        isPro: dbUser.subscription_expires_at && new Date(dbUser.subscription_expires_at) > new Date(),
                        level: dbUser.level, exp: dbUser.exp, points: dbUser.points, credits: dbUser.credits,
                        hasPermanentNameColor: dbUser.has_permanent_name_color, hasSakuraBanner: dbUser.has_sakura_banner,
                        unlocked_starter_languages: dbUser.unlocked_starter_languages || [],
                    };
            
                    result = { success: true, user: fullUserProfile };
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
                break;
            }

            case 'get_study_stats': {
                if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });
                const client = await pool.connect();
                try {
                    const { rows } = await client.query('SELECT id FROM users WHERE email = $1;', [userEmail]);
                    if (rows.length === 0) throw new Error('User not found.');
                    const userId = rows[0].id;
                    const stats = await getAndReturnStudyStats(client, userId);
                    result = { stats };
                } finally {
                    client.release();
                }
                break;
            }

            case 'log_lesson_completion': {
                if (!userEmail) return res.status(401).json({ error: 'Unauthorized' });
                const { language, expGained } = payload;
                const client = await pool.connect();
                try {
                    const { rows } = await client.query('SELECT id FROM users WHERE email = $1;', [userEmail]);
                    if (rows.length === 0) throw new Error('User not found.');
                    const userId = rows[0].id;

                    await client.query(
                        'INSERT INTO study_log (user_id, language, exp_gained) VALUES ($1, $2, $3);',
                        [userId, language, expGained]
                    );

                    const stats = await getAndReturnStudyStats(client, userId);
                    result = { stats };
                } finally {
                    client.release();
                }
                break;
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
