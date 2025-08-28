
// File: api/dev-server.js
// This server wrapper is for local development ONLY.
// It allows the Vercel function in proxy.js to be run with a standard Node.js process.
// It also forwards requests intended for the python service.
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
        // 4. Call the imported Vercel function handler
        await handler(vercelReq, vercelRes);
    } catch (error) {
        console.error('Error in local API dev server:', error);
        // Ensure headers are not already sent before writing error response
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal Server Error in dev-server.js wrapper', details: error.message }));
        }
    }
});

// Set a longer keep-alive timeout to prevent ECONNRESET errors during streaming.
// The default is 5 seconds, which can be too short if the AI model takes time to respond.
server.keepAliveTimeout = 300000; // 5 minutes

server.listen(PORT, () => {
    console.log(`[API] Local Node.js dev server listening on http://localhost:${PORT}`);
    console.log(`[Vite] Frontend should be proxying /api requests to this server.`);
    console.log('[Python] For face swapping, make sure the Python dev server is also running (e.g., on port 3001).');
});
