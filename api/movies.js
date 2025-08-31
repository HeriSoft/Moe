// File: /api/movies.js
// Handles all database interactions for movies.

// FIX: Switched from the raw 'pg' driver to '@vercel/postgres' to ensure
// proper handling of Vercel's database connection and SSL configuration,
// which resolves the 'self-signed certificate' error.
import { sql, db } from '@vercel/postgres';
import IORedis from 'ioredis';

const ADMIN_EMAIL = 'heripixiv@gmail.com';

// Setup Redis for caching if available
let redis = null;
if (process.env.REDIS_URL) {
    redis = new IORedis(process.env.REDIS_URL);
}

// --- Helper Functions ---

async function createTables() {
    // @vercel/postgres throws an error if POSTGRES_URL is not set, so no explicit check needed.
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS movies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                actors TEXT,
                thumbnail_drive_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS episodes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                movie_id UUID REFERENCES movies(id) ON DELETE CASCADE,
                episode_number INTEGER NOT NULL,
                title VARCHAR(255),
                video_drive_id VARCHAR(255) NOT NULL,
                UNIQUE(movie_id, episode_number)
            );
        `;
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
    // @vercel/postgres will throw if the connection string is missing.
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
                    try {
                        const cachedData = await redis.get(cacheKey);
                        if (cachedData) return res.status(200).json(JSON.parse(cachedData));
                    } catch (e) { console.error("Redis GET error:", e); }
                }

                let moviesResult;
                let countResult;
                const searchPattern = `%${searchTerm}%`;

                const baseSelectQuery = `
                    SELECT m.*, COALESCE(e.episodes, '[]'::json) as episodes FROM movies m
                    LEFT JOIN (
                        SELECT movie_id, json_agg(json_build_object('id', id, 'episode_number', episode_number, 'title', title, 'video_drive_id', video_drive_id) ORDER BY episode_number) as episodes
                        FROM episodes GROUP BY movie_id
                    ) e ON m.id = e.movie_id
                `;

                if (searchTerm) {
                    moviesResult = await sql.query(`${baseSelectQuery} WHERE m.title ILIKE $1 OR m.actors ILIKE $1 ORDER BY m.created_at DESC LIMIT $2 OFFSET $3`, [searchPattern, limitNum, offset]);
                    countResult = await sql.query(`SELECT COUNT(*) FROM movies WHERE title ILIKE $1 OR actors ILIKE $1`, [searchPattern]);
                } else {
                    moviesResult = await sql.query(`${baseSelectQuery} ORDER BY m.created_at DESC LIMIT $1 OFFSET $2`, [limitNum, offset]);
                    countResult = await sql.query(`SELECT COUNT(*) FROM movies`);
                }

                const movies = moviesResult.rows;
                const totalMovies = parseInt(countResult.rows[0].count, 10);
                const totalPages = Math.ceil(totalMovies / limitNum);

                const result = { movies, totalPages, currentPage: pageNum };

                if (redis) {
                    try {
                        await redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // Cache for 5 mins
                    } catch(e) { console.error("Redis SET error:", e); }
                }

                return res.status(200).json(result);
            }

            // --- ADMIN ACTIONS ---
            case 'get_admin_movies': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { page = '1', limit = '10' } = payload;
                const pageNum = parseInt(page, 10);
                const limitNum = parseInt(limit, 10);
                const offset = (pageNum - 1) * limitNum;
                
                const { rows: movies } = await sql`
                    SELECT * FROM movies ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset};
                `;
                const { rows: countResult } = await sql`SELECT COUNT(*) FROM movies;`;
                
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

                const { movieId } = await db.transaction(async (client) => {
                    const movieResult = await client.sql`
                        INSERT INTO movies (title, description, actors, thumbnail_drive_id) 
                        VALUES (${title}, ${description}, ${actors}, ${thumbnail_drive_id}) 
                        RETURNING id;
                    `;
                    const id = movieResult.rows[0].id;

                    for (const ep of episodes) {
                        await client.sql`
                            INSERT INTO episodes (movie_id, episode_number, title, video_drive_id) 
                            VALUES (${id}, ${ep.episode_number}, ${ep.title || null}, ${ep.video_drive_id});
                        `;
                    }
                    return { movieId: id };
                });
                
                if (redis) {
                    try { await redis.flushdb(); } catch (e) { console.error("Redis FLUSHDB error:", e); }
                }
                return res.status(201).json({ success: true, movieId });
            }
            
            case 'delete_movie': {
                if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
                const { movieId } = payload;
                if (!movieId) return res.status(400).json({ error: 'Movie ID is required.' });

                await sql`DELETE FROM movies WHERE id = ${movieId}`;
                if (redis) {
                   try { await redis.flushdb(); } catch (e) { console.error("Redis FLUSHDB error:", e); }
                }
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (error) {
        console.error('Error in movies API:', error);
        // The error object from @vercel/postgres might contain useful info
        const details = error.message || 'An unknown database error occurred.';
        return res.status(500).json({
            error: 'An internal server error occurred.',
            details: details
        });
    }
}
