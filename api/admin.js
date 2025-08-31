// File: /api/admin.js
import IORedis from 'ioredis';

const ADMIN_EMAIL = 'heripixiv@gmail.com';

// Khởi tạo Redis client
let redis = null;
if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
}

// Hàm helper để ghi log
async function logAction(email, message) {
    if (!redis || !email) return;
    try {
        const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const logEntry = `[${timestamp}] (ADMIN) ${email} ${message}`;
        await redis.lpush('user_logs', logEntry);
        await redis.ltrim('user_logs', 0, 999);
    } catch (e) {
        console.error("Redis Admin Logging Error:", e);
    }
}

export default async function handler(req, res) {
    try {
        if (!redis) {
            return res.status(503).json({
                error: 'Service Unavailable',
                details: 'This admin endpoint cannot function because the Redis database is not configured. Please set the REDIS_URL environment variable.'
            });
        }
        
        const userEmail = req.headers['x-user-email'];

        if (userEmail !== ADMIN_EMAIL) {
            return res.status(403).json({ error: 'Forbidden', details: 'You do not have permission to access this resource.' });
        }

        switch (req.method) {
            case 'GET': {
                const actionQuery = req.query.action;
                if (actionQuery === 'get_logs') {
                    const logs = await redis.lrange('user_logs', 0, 200);
                    return res.status(200).json({ logs });
                }
                if (actionQuery === 'get_user_ip_data') {
                    const [userIps, blockedIps] = await Promise.all([
                        redis.hgetall('user_ips'),
                        redis.smembers('blocked_ips')
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
                const { action, ip, email } = req.body;
                if (action === 'block_ip') {
                    if (!ip) return res.status(400).json({ error: 'IP address is required' });
                    await redis.sadd('blocked_ips', ip);
                    await logAction(ADMIN_EMAIL, `blocked IP ${ip} for user ${email}`);
                    return res.status(200).json({ success: true, message: `IP ${ip} blocked.` });
                }
                if (action === 'unblock_ip') {
                    if (!ip) return res.status(400).json({ error: 'IP address is required' });
                    await redis.srem('blocked_ips', ip);
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
