// File: /api/cctalk.js
// Handles all database interactions for the CCTalk feature.

import pg from 'pg';
import IORedis from 'ioredis';

const { Pool } = pg;

// --- Database Connection Setup (with SSL fix) ---
let connectionString = process.env.POSTGRES_URL;
if (connectionString) {
    connectionString = connectionString.includes('sslmode=')
        ? connectionString.replace(/sslmode=[^&]*/, 'sslmode=no-verify')
        : `${connectionString}${connectionString.includes('?') ? '&' : '?'}sslmode=no-verify`;
}

const pool = new Pool({ connectionString });
const ADMIN_EMAIL = 'heripixiv@gmail.com';

// --- Redis Setup (optional, for caching if needed) ---
let redis = null;
if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
}

// --- Helper Functions ---
async function createTables() {
    try {
        // Extend existing users table with CCTalk specific fields
        const usersTableQueries = [
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS cctalk_role VARCHAR(50) DEFAULT 'user';`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS cctalk_is_banned BOOLEAN DEFAULT false;`,
        ];
        for (const query of usersTableQueries) {
            await pool.query(query);
        }

        // Create a simple key-value table for CCTalk configurations like pinned messages
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cctalk_config (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT
            );
        `);
        console.log("Database tables for CCTalk are ready.");
    } catch (error) {
        console.error("Error creating/altering CCTalk tables:", error);
        throw new Error("Failed to initialize database tables for CCTalk.");
    }
}

let isDbInitialized = false;

// --- Main Handler ---
export default async function handler(req, res) {
    if (!isDbInitialized) {
        try {
            await createTables();
            isDbInitialized = true;
        } catch (initError) {
            return res.status(503).json({ error: 'Service Unavailable', details: 'Database could not be initialized for CCTalk.' });
        }
    }

    try {
        const { action, ...payload } = req.method === 'GET' ? req.query : req.body;
        const userEmail = req.headers['x-user-email'];

        // Security check: an email must be provided for most actions
        if (!userEmail && action !== 'get_user_status') {
            return res.status(401).json({ error: 'Unauthorized', details: 'User email is required.' });
        }

        switch (action) {
            // --- PUBLIC/LOGGED-IN USER ACTIONS ---
            case 'get_user_status': {
                 if (!payload.email) return res.status(400).json({ error: 'Email is required' });
                 const { rows } = await pool.query("SELECT subscription_status FROM users WHERE email = $1 AND subscription_status = 'active';", [payload.email]);
                 return res.status(200).json({ isPro: rows.length > 0 });
            }
            
            case 'get_lobby_state': {
                const [moderatorsResult, premiumResult, bannedResult, pinnedResult] = await Promise.all([
                    pool.query("SELECT email FROM users WHERE cctalk_role = 'moderator';"),
                    pool.query("SELECT email FROM users WHERE subscription_status = 'active';"),
                    pool.query("SELECT email FROM users WHERE cctalk_is_banned = true;"),
                    pool.query("SELECT value FROM cctalk_config WHERE key = 'pinned_message';"),
                ]);

                const state = {
                    moderatorEmails: moderatorsResult.rows.map(r => r.email),
                    premiumUserEmails: premiumResult.rows.map(r => r.email),
                    bannedUserEmails: bannedResult.rows.map(r => r.email),
                    pinnedMessage: pinnedResult.rows.length > 0 ? pinnedResult.rows[0].value : null,
                };
                
                return res.status(200).json(state);
            }

            // --- ADMIN/MOD ACTIONS ---
            case 'set_role':
            case 'set_ban_status':
            case 'set_pinned_message': {
                // Check for authorization first
                const { rows: userRows } = await pool.query("SELECT cctalk_role FROM users WHERE email = $1;", [userEmail]);
                const requesterRole = userRows.length > 0 ? userRows[0].cctalk_role : 'user';
                const isAuthorized = userEmail === ADMIN_EMAIL || requesterRole === 'moderator';

                if (!isAuthorized) {
                    return res.status(403).json({ error: 'Forbidden', details: 'You do not have permission to perform this action.' });
                }

                // Execute the action
                if (action === 'set_role') {
                    if (userEmail !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden', details: 'Only the admin can set roles.' });
                    const { targetEmail, role } = payload; // role should be 'moderator' or 'user'
                    if (!targetEmail || !['moderator', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid payload' });
                    await pool.query("UPDATE users SET cctalk_role = $1 WHERE email = $2;", [role, targetEmail]);
                    return res.status(200).json({ success: true, message: `User ${targetEmail} role set to ${role}.` });
                }

                if (action === 'set_ban_status') {
                    const { targetEmail, isBanned } = payload;
                    if (!targetEmail || typeof isBanned !== 'boolean') return res.status(400).json({ error: 'Invalid payload' });
                    await pool.query("UPDATE users SET cctalk_is_banned = $1 WHERE email = $2;", [isBanned, targetEmail]);
                    return res.status(200).json({ success: true, message: `User ${targetEmail} has been ${isBanned ? 'banned' : 'unbanned'}.` });
                }

                if (action === 'set_pinned_message') {
                    const { message } = payload; // message can be string or null
                    if (message) {
                        await pool.query("INSERT INTO cctalk_config (key, value) VALUES ('pinned_message', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;", [message]);
                    } else {
                        await pool.query("DELETE FROM cctalk_config WHERE key = 'pinned_message';");
                    }
                    return res.status(200).json({ success: true, message: `Pinned message has been ${message ? 'set' : 'cleared'}.` });
                }
                break;
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (error) {
        console.error('Error in CCTalk API:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
