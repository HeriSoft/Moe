// File: api/dev-server.js
// This server wrapper is for local development ONLY.
// It routes requests to the correct Vercel function handler based on the URL.

import http from 'http';
// Import handlers from the respective files
import proxyHandler from './proxy.js';
import adminHandler from './admin.js';

const PORT = 3000;

// This function adapts a Node.js request/response to the Vercel handler signature
async function callVercelHandler(handler, req, res) {
    // 1. Buffer the incoming request body
    let bodyString = '';
    // FIX: Only buffer the request body for methods that are expected to have one.
    // For GET requests, the `for await` loop would hang indefinitely, causing a timeout.
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const buffers = [];
        for await (const chunk of req) {
            buffers.push(chunk);
        }
        bodyString = Buffer.concat(buffers).toString();
    }

    // 2. Mock the Vercel Request object
    const vercelReq = {
        method: req.method,
        headers: req.headers,
        body: bodyString ? JSON.parse(bodyString) : null,
        // Parse URL to get query parameters correctly
        query: Object.fromEntries(new URL(req.url, `http://${req.headers.host}`).searchParams),
    };

    // 3. Mock the Vercel Response object
    const vercelRes = {
        _res: res, // Keep a reference to the original response object
        _headers: {},
        _statusCode: 200,

        status(statusCode) {
            this._statusCode = statusCode;
            return this;
        },
        json(body) {
            this.setHeader('Content-Type', 'application/json');
            this._res.writeHead(this._statusCode, this._headers);
            this._res.end(JSON.stringify(body));
        },
        setHeader(key, value) {
            this._headers[key.toLowerCase()] = value;
            this._res.setHeader(key, value); // Also set on the real response
        },
        write(chunk) {
            if (!res.headersSent) {
                this._res.writeHead(this._statusCode, this._headers);
            }
            this._res.write(chunk);
        },
        end(chunk) {
            if (!res.headersSent) {
                this._res.writeHead(this._statusCode, this._headers);
            }
            this._res.end(chunk);
        },
        flushHeaders() {
            if (!res.headersSent) {
                 this._res.writeHead(this._statusCode, this._headers);
            }
        }
    };

    try {
        // 4. Call the provided Vercel function handler
        await handler(vercelReq, vercelRes);
    } catch (error) {
        console.error('Error in local API dev server:', error);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal Server Error in dev-server.js wrapper', details: error.message }));
        }
    }
}


const server = http.createServer(async (req, res) => {
    // Basic routing based on the request URL
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/proxy')) {
        await callVercelHandler(proxyHandler, req, res);
    } else if (url.pathname.startsWith('/api/admin')) {
        await callVercelHandler(adminHandler, req, res);
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found', details: `API route ${url.pathname} not handled by local dev server.` }));
    }
});


// Set a longer keep-alive timeout to prevent ECONNRESET errors during streaming.
server.keepAliveTimeout = 300000; // 5 minutes

server.listen(PORT, () => {
    console.log(`[API] Local Node.js dev server listening on http://localhost:${PORT}`);
    console.log(`[API] Routing /api/proxy -> proxy.js`);
    console.log(`[API] Routing /api/admin -> admin.js`);
    console.log(`[Vite] Frontend should be proxying /api requests to this server.`);
});