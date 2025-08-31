
// File: /api/admin.js
// This is a Vercel Serverless Function for administrative tasks.
// It's protected and only accessible by the designated admin user.

import { kv } from '@vercel/kv';

const ADMIN_EMAIL = 'heripixiv@gmail.com';
const isKvConfigured = process.env.KV_URL || (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export default async function handler(req, res) {
    try {
        if (!isKvConfigured) {
            return res.status(503).json({
                error: 'Service Unavailable',
                details: 'This admin endpoint cannot function because the Vercel KV database is not configured in your .env.local file.'
            });
        }
        
        // This is a simple protection mechanism. For production, you'd use a more robust
        // session/token-based authentication and check the user's role from a database.
        // We retrieve the user email from a header sent by the frontend.
        const userEmail = req.headers['x-user-email'];

        if (userEmail !== ADMIN_EMAIL) {
            return res.status(403).json({ error: 'Forbidden', details: 'You do not have permission to access this resource.' });
        }

        switch (req.method) {
            case 'GET': {
                const actionQuery = req.query.action;
                if (actionQuery === 'get_logs') {
                    const logs = await kv.lrange('user_logs', 0, 200); // Get latest 200 logs
                    return res.status(200).json({ logs });
                }
                if (actionQuery === 'get_user_ip_data') {
                    const [userIps, blockedIps] = await Promise.all([
                        kv.hgetall('user_ips'),
                        kv.smembers('blocked_ips')
                    ]);
                    
                    const blockedIpSet = new Set(blockedIps || []);
                    const userData = Object.entries(userIps || {}).map(([email, ip]) => ({
                        email,
                        ip,
                        isBlocked: blockedIpSet.has(ip),
                    }));

                    return res.status(200).json({ userData });
                }
                return res.status(400).json({ error: 'Invalid GET action' });
            }

            case 'POST': {
                // FIX: Destructure body only for POST requests to avoid TypeError on GET requests.
                const { action, ip, email } = req.body;
                if (action === 'block_ip') {
                    if (!ip) return res.status(400).json({ error: 'IP address is required' });
                    await kv.sadd('blocked_ips', ip);
                    await logAction(ADMIN_EMAIL, `blocked IP ${ip} for user ${email}`);
                    return res.status(200).json({ success: true, message: `IP ${ip} blocked.` });
                }
                if (action === 'unblock_ip') {
                    if (!ip) return res.status(400).json({ error: 'IP address is required' });
                    await kv.srem('blocked_ips', ip);
                     await logAction(ADMIN_EMAIL, `unblocked IP ${ip} for user ${email}`);
                    return res.status(200).json({ success: true, message: `IP ${ip} unblocked.` });
                }
                return res.status(400).json({ error: 'Invalid POST action' });
            }

            default:
                return res.status(405).json({ error: 'Method Not Allowed' });
        }
    } catch (error) {
        console.error('Error in admin function:', error);
        return res.status(500).json({
            error: 'An internal server error occurred.',
            details: error.message
        });
    }
}

// Helper to log admin actions
async function logAction(email, message) {
    if (!isKvConfigured || !email) return;
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] (ADMIN) ${email} ${message}`;
        await kv.lpush('user_logs', logEntry);
        await kv.ltrim('user_logs', 0, 999);
    } catch (e) {
        console.error("KV Admin Logging Error:", e);
    }
}
