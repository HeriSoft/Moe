// File: /api/files.js
// Handles all database interactions for the Files Library feature.

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

// --- Redis Setup ---
let redis = null;
if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
}

// --- Pro User Check ---
async function isUserPro(email) {
    if (!email) return false;
    if (redis) {
        const cachedStatus = await redis.get(`user-pro-status:${email}`);
        if (cachedStatus !== null) return cachedStatus === 'true';
    }
    const { rows } = await pool.query("SELECT subscription_status FROM users WHERE email = $1 AND subscription_status = 'active';", [email]);
    const isPro = rows.length > 0;
    if (redis) await redis.set(`user-pro-status:${email}`, isPro, 'EX', 300);
    return isPro;
}


// --- Database Table Initialization ---
async function createTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                version VARCHAR(100),
                icon_drive_id VARCHAR(255),
                tags TEXT[],
                is_vip BOOLEAN DEFAULT false,
                download_count INTEGER DEFAULT 0,
                vip_unlock_info TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS file_parts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                file_id UUID REFERENCES files(id) ON DELETE CASCADE,
                part_number INTEGER NOT NULL,
                part_name VARCHAR(255),
                download_url TEXT NOT NULL,
                UNIQUE(file_id, part_number)
            );
        `);
        console.log("Tables 'files' and 'file_parts' are ready.");
    } catch (error) {
        console.error("Error creating tables:", error);
        throw new Error("Failed to initialize database tables.");
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
            return res.status(503).json({ error: 'Service Unavailable', details: 'Database could not be initialized.' });
        }
    }

    try {
        const { action, ...payload } = req.method === 'GET' ? req.query : req.body;
        const userEmail = req.headers['x-user-email'];
        const isAdmin = userEmail === ADMIN_EMAIL;

        switch (action) {
            // --- PUBLIC ACTIONS ---
            case 'get_public_files': {
                const { searchTerm = '', page = '1', limit = '10', filter = 'recent', showVip = 'false' } = payload;
                const pageNum = parseInt(page, 10);
                const limitNum = parseInt(limit, 10);
                const offset = (pageNum - 1) * limitNum;

                let whereClauses = [];
                let queryParams = [];
                let paramIndex = 1;

                if (searchTerm) {
                    whereClauses.push(`f.name ILIKE $${paramIndex++}`);
                    queryParams.push(`%${searchTerm}%`);
                }
                
                if (filter !== 'all' && filter !== 'recent' && filter !== 'most_downloaded') {
                    whereClauses.push(`$${paramIndex++} = ANY(f.tags)`);
                    queryParams.push(filter);
                }

                if (showVip !== 'true') {
                    whereClauses.push(`f.is_vip = false`);
                }

                const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                const orderBy = filter === 'most_downloaded' ? 'f.download_count DESC' : 'f.created_at DESC';

                const filesQuery = {
                    text: `
                        SELECT f.*, COALESCE(p.parts, '[]'::json) as parts
                        FROM files f
                        LEFT JOIN (
                            SELECT file_id, json_agg(json_build_object('id', id, 'part_number', part_number, 'part_name', part_name, 'download_url', download_url) ORDER BY part_number) as parts
                            FROM file_parts GROUP BY file_id
                        ) p ON f.id = p.file_id
                        ${whereString}
                        ORDER BY ${orderBy}
                        LIMIT $${paramIndex++} OFFSET $${paramIndex++};
                    `,
                    values: [...queryParams, limitNum, offset]
                };

                const countQuery = {
                    text: `SELECT COUNT(*) FROM files f ${whereString};`,
                    values: queryParams
                };

                const [{ rows: files }, { rows: countResult }] = await Promise.all([
                    pool.query(filesQuery),
                    pool.query(countQuery)
                ]);

                const totalFiles = parseInt(countResult[0].count, 10);
                const totalPages = Math.ceil(totalFiles / limitNum);

                return res.status(200).json({ files, totalPages, currentPage: pageNum });
            }

            case 'get_vip_file_urls': {
                const { fileId } = payload;
                if (!fileId) return res.status(400).json({ error: 'File ID is required.' });

                const userIsPro = await isUserPro(userEmail);
                if (!userIsPro && !isAdmin) {
                    return res.status(403).json({ error: 'Forbidden', details: 'Password/URL unlock only for VIP.' });
                }
                
                // Increment download count
                pool.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [fileId]);

                const { rows } = await pool.query('SELECT download_url FROM file_parts WHERE file_id = $1 ORDER BY part_number', [fileId]);
                return res.status(200).json({ urls: rows.map(r => r.download_url) });
            }
            
            // --- ADMIN ACTIONS ---
            case 'add_file': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { name, version, icon_drive_id, tags, is_vip, vip_unlock_info, parts } = payload;
                if (!name || !parts || parts.length === 0) {
                    return res.status(400).json({ error: 'Name and at least one file part are required.' });
                }

                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const fileResult = await client.query(
                        `INSERT INTO files (name, version, icon_drive_id, tags, is_vip, vip_unlock_info) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
                        [name, version, icon_drive_id, tags, is_vip, vip_unlock_info]
                    );
                    const fileId = fileResult.rows[0].id;
                    for (const part of parts) {
                        await client.query(
                            `INSERT INTO file_parts (file_id, part_number, part_name, download_url) VALUES ($1, $2, $3, $4);`,
                            [fileId, part.part_number, part.part_name, part.download_url]
                        );
                    }
                    await client.query('COMMIT');
                    return res.status(201).json({ success: true, fileId });
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
            }

            case 'delete_file': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { fileId } = payload;
                if (!fileId) return res.status(400).json({ error: 'File ID is required.' });
                await pool.query('DELETE FROM files WHERE id = $1', [fileId]);
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (error) {
        console.error('Error in files API:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}