"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const firebirdPool_1 = require("../db/firebirdPool");
const apiKey_1 = require("../middleware/apiKey");
const router = (0, express_1.Router)();
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
const parseNumber = (value, fallback) => {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const buildClienteConfig = (row) => {
    const rut = readField(row, 'RUT');
    const razonSocial = readField(row, 'RZ');
    const ip = readField(row, 'IP');
    // Usar config.firebird.port si no hay valor en la base
    const puertoRaw = readField(row, 'PUERTO');
    const puerto = puertoRaw && puertoRaw.trim() !== '' ? Number.parseInt(puertoRaw, 10) : config_1.config.firebird.port;
    const bdAlias = readField(row, 'DBALIAS') || readField(row, 'BDALIAS');
    const url1 = readField(row, 'URL1');
    const url2 = readField(row, 'URL2');
    const url3 = readField(row, 'URL3');
    return {
        rut,
        razonSocial,
        ip,
        puerto,
        bdAlias,
        url1,
        url2,
        url3,
    };
};
const buildClienteDbConfig = (cliente) => ({
    host: cliente.ip || config_1.config.firebird.host || 'localhost',
    port: cliente.puerto || config_1.config.firebird.port,
    database: cliente.bdAlias,
    user: config_1.config.firebird.user,
    password: config_1.config.firebird.password,
    client: config_1.config.firebird.client ?? undefined,
});
const fetchClienteByRut = async (rutNumber) => {
    const dbConfig = {
        host: config_1.config.firebird.host || 'localhost',
        port: config_1.config.firebird.port,
        database: config_1.config.firebird.database,
        user: config_1.config.firebird.user,
        password: config_1.config.firebird.password,
        client: config_1.config.firebird.client ?? undefined,
    };
    const rows = await (0, firebirdPool_1.executeQuery)(dbConfig, 'SELECT * FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1', [rutNumber]);
    return rows[0] ?? null;
};
router.post('/validar-rut', apiKey_1.apiKeyMiddleware, async (req, res, next) => {
    try {
        const rutNumber = parseRutNumber(req.body?.rut);
        if (!rutNumber) {
            res.status(400).json({ success: false, error: 'RUT invalido' });
            return;
        }
        // eslint-disable-next-line no-console
        console.log(`🔍 [BACKEND] Validando RUT ${rutNumber}`);
        const clienteRow = await fetchClienteByRut(rutNumber);
        if (!clienteRow) {
            // eslint-disable-next-line no-console
            console.log('❌ [BACKEND] RUT no encontrado');
            res
                .status(401)
                .json({ success: false, error: 'RUT invalido o empresa inactiva' });
            return;
        }
        const cliente = buildClienteConfig(clienteRow);
        // eslint-disable-next-line no-console
        console.log('✅ [BACKEND] RUT validado');
        res.json({ success: true, data: cliente });
    }
    catch (error) {
        next(error);
    }
});
router.post('/login', apiKey_1.apiKeyMiddleware, async (req, res, next) => {
    try {
        const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!username || !password) {
            res.status(400).json({ success: false, error: 'Usuario y contraseña son requeridos' });
            return;
        }
        // Parse cliente config from header
        let clienteConfig = null;
        const clienteConfigHeader = req.headers['x-cliente-config'];
        if (clienteConfigHeader) {
            try {
                clienteConfig = JSON.parse(clienteConfigHeader);
            }
            catch (error) {
                console.error('Error parsing cliente config:', error);
            }
        }
        if (!clienteConfig) {
            res.status(400).json({ success: false, error: 'Configuración del cliente requerida' });
            return;
        }
        // Build database path
        const dbPath = `C:\\DuoCOM\\BDatos\\${clienteConfig.bdAlias}.Fdb`;
        // For now, accept any username/password and return the cliente config
        // TODO: Implement actual authentication against the client's database
        console.log(`🔍 [BACKEND] Login para usuario ${username} en BD: ${dbPath}`);
        const token = jsonwebtoken_1.default.sign({ razonSocial: clienteConfig.razonSocial }, config_1.config.jwtSecret, {
            expiresIn: config_1.config.jwtExpiresIn,
        });
        res.json({
            success: true,
            data: {
                id: 1,
                username: username,
                nombre: username,
                rol: 'admin',
                token: token,
                cliente: {
                    ...clienteConfig,
                    bdAlias: dbPath, // Use full path
                    user: config_1.config.firebird.user,
                    clave: config_1.config.firebird.password,
                },
            },
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
