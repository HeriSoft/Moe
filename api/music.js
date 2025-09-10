// File: /api/music.js
// Handles all database interactions for the Music Box feature.

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

// --- Database Table Initialization ---
async function createTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS songs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                artist VARCHAR(255),
                genre VARCHAR(100),
                url TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                avatar_drive_id VARCHAR(255),
                background_drive_id VARCHAR(255)
            );
        `);
        console.log("Table 'songs' is ready.");
    } catch (error) {
        console.error("Error creating songs table:", error);
        throw new Error("Failed to initialize database tables for music.");
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
            case 'get_public_songs': {
                const { searchTerm = '', genre = 'all' } = payload;

                let whereClauses = [];
                let queryParams = [];
                let paramIndex = 1;

                if (searchTerm) {
                    whereClauses.push(`(title ILIKE $${paramIndex} OR artist ILIKE $${paramIndex})`);
                    queryParams.push(`%${searchTerm}%`);
                    paramIndex++;
                }

                if (genre !== 'all') {
                    whereClauses.push(`genre = $${paramIndex}`);
                    queryParams.push(genre);
                    paramIndex++;
                }

                const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                
                const query = {
                    text: `SELECT * FROM songs ${whereString} ORDER BY created_at DESC;`,
                    values: queryParams
                };

                const { rows: songs } = await pool.query(query);
                return res.status(200).json({ songs });
            }

            // --- ADMIN ACTIONS ---
            case 'get_admin_songs': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { rows: songs } = await pool.query('SELECT * FROM songs ORDER BY created_at DESC;');
                return res.status(200).json({ songs });
            }

            case 'add_song': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { title, artist, genre, url, avatar_drive_id, background_drive_id } = payload;
                if (!title || !url) return res.status(400).json({ error: 'Title and URL are required.' });
                
                const { rows } = await pool.query(
                    'INSERT INTO songs (title, artist, genre, url, avatar_drive_id, background_drive_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;',
                    [title, artist, genre, url, avatar_drive_id, background_drive_id]
                );
                return res.status(201).json({ success: true, songId: rows[0].id });
            }

            case 'update_song': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { songId, title, artist, genre, url, avatar_drive_id, background_drive_id } = payload;
                if (!songId || !title || !url) return res.status(400).json({ error: 'Song ID, title, and URL are required.' });

                await pool.query(
                    'UPDATE songs SET title = $1, artist = $2, genre = $3, url = $4, avatar_drive_id = $5, background_drive_id = $6 WHERE id = $7;',
                    [title, artist, genre, url, avatar_drive_id, background_drive_id, songId]
                );
                return res.status(200).json({ success: true });
            }

            case 'delete_song': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { songId } = payload;
                if (!songId) return res.status(400).json({ error: 'Song ID is required.' });
                await pool.query('DELETE FROM songs WHERE id = $1;', [songId]);
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (error) {
        console.error('Error in music API:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
