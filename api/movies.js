// File: /api/movies.js
// Handles all database interactions for movies.

import pg from 'pg';
import IORedis from 'ioredis';

const { Pool } = pg;

// Supabase provides a connection string with `sslmode=require`.
// In some serverless environments, the default CA certificates are not available,
// leading to a "self-signed certificate" error. The standard fix is `rejectUnauthorized: false`.
// When that doesn't work, this alternative method modifies the connection string directly.
// `sslmode=no-verify` is a node-postgres specific setting that enforces SSL but bypasses CA verification.
let connectionString = process.env.POSTGRES_URL;
if (connectionString) {
    // Ensure we are using the non-verifying SSL mode.
    if (connectionString.includes('sslmode=')) {
        connectionString = connectionString.replace(/sslmode=[^&]*/, 'sslmode=no-verify');
    } else {
        connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=no-verify';
    }
}

// Initialize the connection pool.
const pool = new Pool({
  connectionString: connectionString,
});

const ADMIN_EMAIL = 'heripixiv@gmail.com';

// Setup Redis for caching if available
let redis = null;
if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
}

// --- Helper Functions ---

async function createTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS movies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                actors TEXT,
                thumbnail_drive_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS episodes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                movie_id UUID REFERENCES movies(id) ON DELETE CASCADE,
                episode_number INTEGER NOT NULL,
                title VARCHAR(255),
                video_drive_id VARCHAR(255) NOT NULL,
                UNIQUE(movie_id, episode_number)
            );
        `);
        console.log("Tables 'movies' and 'episodes' are ready.");
    } catch (error) {
        console.error("Error creating tables:", error);
        throw new Error("Failed to initialize database tables.");
    }
}

// Flag to ensure table creation only runs once per cold start.
let isDbInitialized = false;

// --- Main Handler ---

export default async function handler(req, res) {
    // Ensure the database tables exist before proceeding.
    // This runs only on the first invocation of a new serverless instance.
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
    
    try {
        const { action, ...payload } = req.method === 'GET' ? req.query : req.body;
        const userEmail = req.headers['x-user-email'];
        const isAdmin = userEmail === ADMIN_EMAIL;

        switch (action) {
            // --- PUBLIC ACTIONS ---
            case 'get_public_movies': {
                const { searchTerm = '', page = '1', limit = '8' } = payload;
                const pageNum = parseInt(page, 10);
                const limitNum = parseInt(limit, 10);
                const offset = (pageNum - 1) * limitNum;

                const cacheKey = `movies:public:search:${searchTerm}:page:${pageNum}:limit:${limitNum}`;
                if (redis) {
                    const cachedData = await redis.get(cacheKey);
                    if (cachedData) return res.status(200).json(JSON.parse(cachedData));
                }

                let moviesQuery;
                let countQuery;

                const baseSelect = `
                    SELECT m.*, COALESCE(e.episodes, '[]'::json) as episodes FROM movies m
                    LEFT JOIN (
                        SELECT movie_id, json_agg(json_build_object('id', id, 'episode_number', episode_number, 'title', title, 'video_drive_id', video_drive_id) ORDER BY episode_number) as episodes
                        FROM episodes GROUP BY movie_id
                    ) e ON m.id = e.movie_id
                `;

                if (searchTerm) {
                    moviesQuery = {
                        text: `${baseSelect} WHERE m.title ILIKE $1 OR m.actors ILIKE $1 ORDER BY m.created_at DESC LIMIT $2 OFFSET $3;`,
                        values: [`%${searchTerm}%`, limitNum, offset]
                    };
                    countQuery = {
                        text: `SELECT COUNT(*) FROM movies WHERE title ILIKE $1 OR actors ILIKE $1;`,
                        values: [`%${searchTerm}%`]
                    };
                } else {
                    moviesQuery = {
                        text: `${baseSelect} ORDER BY m.created_at DESC LIMIT $1 OFFSET $2;`,
                        values: [limitNum, offset]
                    };
                    countQuery = { text: `SELECT COUNT(*) FROM movies;` };
                }

                const [{ rows: movies }, { rows: countResult }] = await Promise.all([
                    pool.query(moviesQuery),
                    pool.query(countQuery)
                ]);
                const totalMovies = parseInt(countResult[0].count, 10);
                const totalPages = Math.ceil(totalMovies / limitNum);

                const result = { movies, totalPages, currentPage: pageNum };

                if (redis) await redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // Cache for 5 mins

                return res.status(200).json(result);
            }

            // --- ADMIN ACTIONS ---
            case 'get_admin_movies': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { page = '1', limit = '10' } = payload;
                const pageNum = parseInt(page, 10);
                const limitNum = parseInt(limit, 10);
                const offset = (pageNum - 1) * limitNum;
                
                const moviesQuery = {
                    text: `SELECT * FROM movies ORDER BY created_at DESC LIMIT $1 OFFSET $2;`,
                    values: [limitNum, offset]
                };
                const countQuery = { text: `SELECT COUNT(*) FROM movies;` };
                
                const [{ rows: movies }, { rows: countResult }] = await Promise.all([
                    pool.query(moviesQuery),
                    pool.query(countQuery)
                ]);
                const totalMovies = parseInt(countResult[0].count, 10);
                const totalPages = Math.ceil(totalMovies / limitNum);

                return res.status(200).json({ movies, totalPages, currentPage: pageNum });
            }

            case 'add_movie': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { title, description, actors, thumbnail_drive_id, episodes } = payload;
                if (!title || !thumbnail_drive_id || !episodes || episodes.length === 0) {
                    return res.status(400).json({ error: 'Title, thumbnail, and at least one episode are required.' });
                }

                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const movieResult = await client.query(
                        `INSERT INTO movies (title, description, actors, thumbnail_drive_id) VALUES ($1, $2, $3, $4) RETURNING id;`,
                        [title, description, actors, thumbnail_drive_id]
                    );
                    const movieId = movieResult.rows[0].id;

                    for (const ep of episodes) {
                        await client.query(
                            `INSERT INTO episodes (movie_id, episode_number, title, video_drive_id) VALUES ($1, $2, $3, $4);`,
                            [movieId, ep.episode_number, ep.title || null, ep.video_drive_id]
                        );
                    }
                    await client.query('COMMIT');
                    if (redis) await redis.flushdb(); // Clear cache on data change
                    return res.status(201).json({ success: true, movieId });
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
            }
            
            case 'delete_movie': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { movieId } = payload;
                if (!movieId) return res.status(400).json({ error: 'Movie ID is required.' });

                await pool.query('DELETE FROM movies WHERE id = $1', [movieId]);
                if (redis) await redis.flushdb(); // Clear cache on data change
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (error) {
        console.error('Error in movies API:', error);
        return res.status(500).json({
            error: 'An internal server error occurred.',
            details: error.message
        });
    }
}
