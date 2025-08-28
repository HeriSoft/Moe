// File: api/dev-server.js
// This server wrapper is for local development ONLY.
// It allows the Vercel function in proxy.js to be run with a standard Node.js process.
import http from 'http';
import handler from './proxy.js';

const PORT = 3000;

const server = http.createServer(async (req, res) => {
    // Vercel's handler function expects a specific request/response interface.
    // We create simple adapters here to bridge Node's native http server with the handler.

    // 1. Buffer the incoming request body
    const buffers = [];
    for await (const chunk of req) {
        buffers.push(chunk);
    }
    const bodyString = Buffer.concat(buffers).toString();

    // 2. Mock the Vercel Request object
    const vercelReq = {
        method: req.method,
        headers: req.headers,
        body: bodyString ? JSON.parse(bodyString) : null,
        query: Object.fromEntries(new URL(req.url, `http://${req.headers.host}`).searchParams),
    };

    // 3. Mock the Vercel Response object
    const vercelRes = {
        status(statusCode) {
            res.statusCode = statusCode;
            return this; // Allow chaining, e.g., res.status(404).json(...)
        },
        json(body) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(body));
        },
        setHeader(key, value) {
            res.setHeader(key, value);
        },
        write(chunk) {
            res.write(chunk);
        },
        end(chunk) {
            res.end(chunk);
        },
        flushHeaders() {
            // In Node's native http server, headers are flushed automatically. This is a no-op for compatibility.
        }
    };

    try {
        // 4. Call the imported Vercel function handler
        await handler(vercelReq, vercelRes);
    } catch (error) {
        console.error('Error in local API dev server:', error);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Internal Server Error in dev-server.js wrapper', details: error.message }));
    }
});

// Set a longer keep-alive timeout to prevent ECONNRESET errors during streaming.
// The default is 5 seconds, which can be too short if the AI model takes time to respond.
server.keepAliveTimeout = 300000; // 5 minutes

server.listen(PORT, () => {
    console.log(`[API] Local dev server listening on http://localhost:${PORT}`);
    console.log(`[Vite] Frontend should be proxying /api requests to this server.`);
});