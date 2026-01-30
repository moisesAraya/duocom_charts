"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authJwtMiddleware = void 0;
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
    // Usar config.firebird.port si no hay valor en la base
    const puertoRaw = readField(row, 'PUERTO');
    return {
        rut,
        fbHost: readField(row, 'IP'),
        fbPort: puertoRaw && puertoRaw.trim() !== '' ? Number.parseInt(puertoRaw, 10) : config_1.config.firebird.port,
        fbDatabase: readField(row, 'DBALIAS') || readField(row, 'BDALIAS'),
    };
};
const authJwtMiddleware = async (req, res, next) => {
    // MODO DESARROLLO: Aceptar cualquier token y usar la configuración del .env
    const dbConfig = {
        host: config_1.config.firebird.host,
        port: config_1.config.firebird.port,
        database: config_1.config.firebird.database,
        user: config_1.config.firebird.user,
        password: config_1.config.firebird.password,
        client: config_1.config.firebird.client ?? undefined,
    };
    req.user = { rut: 0 };
    req.dbConfig = dbConfig;
    next();
};
exports.authJwtMiddleware = authJwtMiddleware;
