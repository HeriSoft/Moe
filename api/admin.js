// File: /api/admin.js
import IORedis from 'ioredis';
import pg from 'pg';

const ADMIN_EMAIL = 'heripixiv@gmail.com';

// Khởi tạo Redis client
let redis = null;
if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
}

// --- Database Connection Setup (with SSL fix) ---
const { Pool } = pg;
let connectionString = process.env.POSTGRES_URL;
if (connectionString) {
    connectionString = connectionString.includes('sslmode=')
        ? connectionString.replace(/sslmode=[^&]*/, 'sslmode=no-verify')
        : `${connectionString}${connectionString.includes('?') ? '&' : '?'}sslmode=no-verify`;
}
const pool = new Pool({ connectionString });


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

// Invalidate user pro status cache
async function invalidateUserProCache(email) {
    if (redis && email) {
        try {
            await redis.del(`user-pro-status:${email}`);
        } catch (e) {
            console.error("Redis cache invalidation error:", e);
        }
    }
}

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

        // Safely add new columns
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN NOT NULL DEFAULT false;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS exp INTEGER NOT NULL DEFAULT 0;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS has_permanent_name_color BOOLEAN NOT NULL DEFAULT false;');
        await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS has_sakura_banner BOOLEAN NOT NULL DEFAULT false;');
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

export default async function handler(req, res) {
    if (!isDbInitialized) {
        try {
            await createTables();
            isDbInitialized = true;
        } catch (initError) {
             return res.status(503).json({ error: 'Service Unavailable', details: 'The database could not be initialized. Please try again later.' });
        }
    }
    
    try {
        if (!redis) {
            return res.status(503).json({
                error: 'Service Unavailable',
                details: 'This admin endpoint cannot function because the Redis database is not configured. Please set the REDIS_URL environment variable.'
            });
        }
        
        const userEmail = req.headers['x-user-email'];
        const isAdmin = userEmail === ADMIN_EMAIL;

        switch (req.method) {
            case 'GET': {
                const actionQuery = req.query.action;

                // NEW public endpoint for site settings
                if (actionQuery === 'get_site_settings') {
                    const settings = await redis.get('site_settings');
                    return res.status(200).json(settings ? JSON.parse(settings) : {});
                }

                // Public endpoint to get payment settings for the membership modal
                if (actionQuery === 'get_payment_settings') {
                    const settings = await redis.get('payment_settings');
                    return res.status(200).json(settings ? JSON.parse(settings) : {});
                }

                // Endpoint for a logged-in user to get their own membership details
                if (actionQuery === 'get_membership_details') {
                    if (!userEmail) return res.status(403).json({ error: 'Forbidden', details: 'Authentication required.' });

                    // In a real app, you'd query a 'payments' table. Here we mock it for demonstration.
                    const mockHistory = [
                        { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), amount: 250000, memo: `moechat_${userEmail.split('@')[0]}`, status: 'Completed' },
                    ];
                    
                    const { rows } = await pool.query(
                        'SELECT subscription_status, subscription_expires_at FROM users WHERE email = $1',
                        [userEmail]
                    );

                    const userData = rows[0] || { subscription_status: 'inactive', subscription_expires_at: null };

                    return res.status(200).json({
                        history: mockHistory,
                        status: userData.subscription_status,
                        expiresAt: userData.subscription_expires_at,
                    });
                }

                // --- Admin-only actions below ---
                if (!isAdmin) {
                    return res.status(403).json({ error: 'Forbidden', details: 'You do not have permission to access this resource.' });
                }

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
                if (actionQuery === 'get_all_users') {
                    const { rows } = await pool.query(
                        `SELECT id, name, email, image_url, subscription_expires_at, is_moderator, has_permanent_name_color, has_sakura_banner, points FROM users ORDER BY name;`
                    );
                    const users = rows.map(user => ({
                        ...user,
                        subscriptionExpiresAt: user.subscription_expires_at,
                        isModerator: user.is_moderator,
                        hasPermanentNameColor: user.has_permanent_name_color,
                        hasSakuraBanner: user.has_sakura_banner,
                        isPro: user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date()
                    }));
                    return res.status(200).json({ users });
                }
                return res.status(400).json({ error: 'Invalid GET action' });
            }

            case 'POST': {
                const { action, ip, email, bankQrId, momoQrId, memoFormat, days, isModerator, price30, price90, price360, logoDriveId, amount } = req.body;

                if (action === 'cancel_subscription_user') {
                     if (!userEmail) return res.status(403).json({ error: 'Forbidden' });
                     await pool.query(
                        `UPDATE users SET subscription_status = 'cancelled', updated_at = NOW() WHERE email = $1;`,
                        [userEmail]
                     );
                     await invalidateUserProCache(userEmail);
                     await logAction(userEmail, `cancelled their membership subscription.`);
                     return res.status(200).json({ success: true });
                }

                // --- Admin-only actions below ---
                if (!isAdmin) {
                    return res.status(403).json({ error: 'Forbidden', details: 'You do not have permission to access this resource.' });
                }
                
                if (action === 'save_site_settings') {
                    if (logoDriveId) {
                        await redis.set('site_settings', JSON.stringify({ logoDriveId }));
                        await logAction(ADMIN_EMAIL, `updated the site logo.`);
                        return res.status(200).json({ success: true, message: 'Site settings saved.' });
                    } else {
                        await redis.del('site_settings');
                        await logAction(ADMIN_EMAIL, `removed the site logo.`);
                        return res.status(200).json({ success: true, message: 'Site logo removed.' });
                    }
                }

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
                if (action === 'save_payment_settings') {
                    await redis.set('payment_settings', JSON.stringify({ bankQrId, momoQrId, memoFormat, price30, price90, price360 }));
                    await logAction(ADMIN_EMAIL, `updated payment settings`);
                    return res.status(200).json({ success: true, message: 'Payment settings saved.' });
                }
                if (action === 'set_subscription') {
                    if (!email || !days) return res.status(400).json({ error: 'Email and days are required.' });
                    await pool.query(
                        `UPDATE users SET subscription_expires_at = NOW() + ($1 * interval '1 day'), subscription_status = 'active', updated_at = NOW() WHERE email = $2;`,
                        [days, email]
                    );
                    await invalidateUserProCache(email);
                    await logAction(ADMIN_EMAIL, `set membership for ${email} to ${days} days.`);
                    return res.status(200).json({ success: true });
                }
                if (action === 'extend_subscription') {
                    if (!email || !days) return res.status(400).json({ error: 'Email and days are required.' });
                    await pool.query(
                       `UPDATE users SET subscription_expires_at = COALESCE(subscription_expires_at, NOW()) + ($1 * interval '1 day'), subscription_status = 'active', updated_at = NOW() WHERE email = $2;`,
                       [days, email]
                    );
                    await invalidateUserProCache(email);
                    await logAction(ADMIN_EMAIL, `extended membership for ${email} by ${days} days.`);
                    return res.status(200).json({ success: true });
                }
                if (action === 'remove_subscription') {
                     if (!email) return res.status(400).json({ error: 'Email is required.' });
                     await pool.query(
                        `UPDATE users SET subscription_expires_at = NULL, subscription_status = 'inactive', updated_at = NOW() WHERE email = $1;`,
                        [email]
                     );
                     await invalidateUserProCache(email);
                     await logAction(ADMIN_EMAIL, `removed membership for ${email}.`);
                     return res.status(200).json({ success: true });
                }
                if (action === 'set_moderator') {
                    if (!email || isModerator === undefined) return res.status(400).json({ error: 'Email and moderator status are required.' });
                    await pool.query(
                        `UPDATE users SET is_moderator = $1, updated_at = NOW() WHERE email = $2;`,
                        [isModerator, email]
                    );
                    await logAction(ADMIN_EMAIL, `set moderator status for ${email} to ${isModerator}.`);
                    return res.status(200).json({ success: true });
                }
                if (action === 'add_points_admin') {
                    if (!email || !amount) return res.status(400).json({ error: 'Email and amount are required.' });
                    const amountNum = parseInt(amount, 10);
                    if (isNaN(amountNum)) {
                         return res.status(400).json({ error: 'Amount must be a valid number.' });
                    }
                    const { rows } = await pool.query(
                        `UPDATE users SET points = points + $1, updated_at = NOW() WHERE email = $2 RETURNING *;`,
                        [amountNum, email]
                    );
                    if (rows.length === 0) throw new Error('Target user not found.');

                    const dbUser = rows[0];
                    const fullUserProfile = {
                        id: dbUser.id, name: dbUser.name, email: dbUser.email, imageUrl: dbUser.image_url,
                        subscriptionExpiresAt: dbUser.subscription_expires_at, isModerator: dbUser.is_moderator,
                        isPro: dbUser.subscription_expires_at && new Date(dbUser.subscription_expires_at) > new Date(),
                        level: dbUser.level, exp: dbUser.exp, points: dbUser.points,
                        hasPermanentNameColor: dbUser.has_permanent_name_color, hasSakuraBanner: dbUser.has_sakura_banner,
                    };

                    await logAction(ADMIN_EMAIL, `added ${amountNum} points to ${email}.`);
                    return res.status(200).json({ success: true, user: fullUserProfile });
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
