"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authJwtMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const firebird_1 = require("../db/firebird");
const readField = (row, key) => {
    const direct = row[key];
    if (direct !== undefined && direct !== null)
        return String(direct);
    const upper = row[key.toUpperCase()];
    if (upper !== undefined && upper !== null)
        return String(upper);
    const lower = row[key.toLowerCase()];
    if (lower !== undefined && lower !== null)
        return String(lower);
    return '';
};
const parseRutNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const normalized = value.replace(/[^\d]/g, '');
        const parsed = Number.parseInt(normalized, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const fetchUserRecord = async (rut) => {
    const rows = await (0, firebird_1.query)('SELECT * FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1', [String(rut)]);
    if (!rows.length)
        return null;
    const row = rows[0];
    return {
        rut,
        fbHost: readField(row, 'IP'),
        fbPort: Number.parseInt(readField(row, 'PUERTO') || '3050', 10),
        fbDatabase: readField(row, 'DBALIAS') || readField(row, 'BDALIAS'),
    };
};
const authJwtMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
            // eslint-disable-next-line no-console
            console.warn('[auth] Missing bearer token', { authHeader });
            res.status(401).json({ success: false, message: 'Missing bearer token' });
            return;
        }
        const token = authHeader.slice(7).trim();
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        // CONFIGURACIÓN HARDCODEADA PARA DESARROLLO
        const rutString = String(payload?.rut ?? '');
        if (rutString === 'DESARROLLO') {
            const dbConfig = {
                host: '192.168.191.250',
                port: 3050,
                database: 'C:\\DuoCOM\\BDDesarrollo\\Codima.FDB',
                user: config_1.config.firebird.user,
                password: config_1.config.firebird.password,
                client: config_1.config.firebird.client ?? undefined,
            };
            // eslint-disable-next-line no-console
            console.info(`[auth] DESARROLLO -> DB ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port}`);
            req.user = { rut: 0 };
            req.dbConfig = dbConfig;
            next();
            return;
        }
        const rutNumber = parseRutNumber(rutString);
        if (!rutNumber) {
            // eslint-disable-next-line no-console
            console.warn('[auth] Invalid token payload', { payload });
            res.status(401).json({ success: false, message: 'Invalid token payload' });
            return;
        }
        const user = await fetchUserRecord(rutNumber);
        if (!user || !user.fbDatabase) {
            if (user && !user.fbDatabase) {
                // eslint-disable-next-line no-console
                console.warn('[auth] Missing DBALIAS in Clientes', {
                    rut: rutNumber,
                });
            }
            // eslint-disable-next-line no-console
            console.warn('[auth] User not found', { rut: rutNumber });
            res.status(401).json({ success: false, message: 'User not found' });
            return;
        }
        const dbConfig = {
            host: user.fbHost,
            port: user.fbPort,
            database: user.fbDatabase,
            user: config_1.config.firebird.user,
            password: config_1.config.firebird.password,
            client: config_1.config.firebird.client ?? undefined,
        };
        // eslint-disable-next-line no-console
        console.info(`[auth] Rut ${user.rut} -> DB ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port}`);
        req.user = { rut: user.rut };
        req.dbConfig = dbConfig;
        next();
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[auth] Token verification failed', error);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};
exports.authJwtMiddleware = authJwtMiddleware;
