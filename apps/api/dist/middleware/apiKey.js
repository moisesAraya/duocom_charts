"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyMiddleware = void 0;
const config_1 = require("../config");
const apiKeyMiddleware = (req, res, next) => {
    if (!config_1.config.apiKey) {
        next();
        return;
    }
    const apiKeyHeader = req.headers['x-api-key'];
    const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
    if (apiKey === config_1.config.apiKey) {
        next();
        return;
    }
    res.status(401).json({ success: false, error: 'API key invalida' });
};
exports.apiKeyMiddleware = apiKeyMiddleware;
