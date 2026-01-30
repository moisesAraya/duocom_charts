"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyMiddleware = void 0;
// Middleware deshabilitado temporalmente para desarrollo
const apiKeyMiddleware = (req, res, next) => {
    next();
};
exports.apiKeyMiddleware = apiKeyMiddleware;
