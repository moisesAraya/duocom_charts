"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = void 0;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 1000;
const entries = new Map();
const rateLimitMiddleware = (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = entries.get(key);
    if (!entry || now > entry.resetAt) {
        entries.set(key, { count: 1, resetAt: now + WINDOW_MS });
        next();
        return;
    }
    if (entry.count >= MAX_REQUESTS) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfterSeconds.toString());
        res.status(429).json({ success: false, message: 'Rate limit exceeded' });
        return;
    }
    entry.count += 1;
    next();
};
exports.rateLimitMiddleware = rateLimitMiddleware;
