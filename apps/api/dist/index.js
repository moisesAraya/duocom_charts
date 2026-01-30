"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const authJwt_1 = require("./middleware/authJwt");
const apiKey_1 = require("./middleware/apiKey");
const rateLimit_1 = require("./middleware/rateLimit");
const auth_1 = __importDefault(require("./routes/auth"));
const cliente_config_1 = __importDefault(require("./routes/cliente-config"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const dashboard_new_1 = __importDefault(require("./routes/dashboard_new"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(rateLimit_1.rateLimitMiddleware);
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: config_1.config.env });
});
app.use('/api', auth_1.default);
app.use('/api', apiKey_1.apiKeyMiddleware, authJwt_1.authJwtMiddleware, cliente_config_1.default);
app.use('/api', authJwt_1.authJwtMiddleware, dashboard_1.default);
app.use('/api', authJwt_1.authJwtMiddleware, dashboard_new_1.default);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
});
app.listen(config_1.config.port, '0.0.0.0', () => {
    console.log(`API server listening on port ${config_1.config.port} (0.0.0.0)`);
});
