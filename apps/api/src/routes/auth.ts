/**
 * auth.ts — Rutas de autenticación.
 *
 * POST /validar-rut  → Valida que un RUT exista como cliente activo
 *                       en la BD central y devuelve su configuración.
 * POST /login        → Autentica al usuario y genera un token JWT
 *                       con la información del cliente embebida.
 *
 * El flujo completo de login es:
 *  1. El frontend envía el RUT → validar-rut responde con ip, puerto, bdAlias.
 *  2. El frontend envía usuario + contraseña + config del paso 1.
 *  3. /login genera un JWT que contiene los datos de conexión del cliente.
 *  4. Todas las peticiones subsiguientes llevan ese JWT.
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { FirebirdConnectionConfig } from '../db/firebird';
import { executeQuery } from '../db/firebirdPool';
import { apiKeyMiddleware } from '../middleware/apiKey';
import { readField, parseRutNumber } from '../helpers/db-helpers';

const router = Router();

/* ═══════════════════════════════════════════
   Tipos
═══════════════════════════════════════════ */

/** Configuración de un cliente obtenida de la BD central */
type ClienteConfig = {
  rut: string;
  razonSocial: string;
  ip: string;
  puerto: number;
  bdAlias: string;
  url1: string;
  url2: string;
  url3: string;
};

/* ═══════════════════════════════════════════
   Funciones auxiliares
═══════════════════════════════════════════ */

/** Parsea un string a entero con valor por defecto. */
const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Construye un ClienteConfig a partir de un row crudo de la BD central. */
const buildClienteConfig = (row: Record<string, unknown>): ClienteConfig => {
  const puertoRaw = readField(row, 'PUERTO');
  return {
    rut: readField(row, 'RUT'),
    razonSocial: readField(row, 'RZ'),
    ip: readField(row, 'IP'),
    puerto: puertoRaw && puertoRaw.trim() !== ''
      ? Number.parseInt(puertoRaw, 10)
      : config.firebird.port,
    bdAlias: readField(row, 'DBALIAS') || readField(row, 'BDALIAS'),
    url1: readField(row, 'URL1'),
    url2: readField(row, 'URL2'),
    url3: readField(row, 'URL3'),
  };
};

/** Construye la config de conexión a Firebird a partir de un ClienteConfig. */
const buildClienteDbConfig = (
  cliente: ClienteConfig
): FirebirdConnectionConfig => ({
  host: cliente.ip || config.firebird.host || 'localhost',
  port: cliente.puerto || config.firebird.port,
  database: cliente.bdAlias,
  user: config.firebird.user,
  password: config.firebird.password,
  client: config.firebird.client ?? undefined,
});

/** Busca un cliente activo por RUT en la BD central (DUOCOMAPPS). */
const fetchClienteByRut = async (
  rutNumber: number
): Promise<Record<string, unknown> | null> => {
  const dbConfig: FirebirdConnectionConfig = {
    host: config.firebird.host || 'localhost',
    port: config.firebird.port,
    database: config.firebird.database,
    user: config.firebird.user,
    password: config.firebird.password,
    client: config.firebird.client ?? undefined,
  };
  const rows = await executeQuery<Record<string, unknown>>(
    dbConfig,
    'SELECT * FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1',
    [rutNumber]
  );
  return rows[0] ?? null;
};

/** Busca un cliente activo por TOKEN en la BD central (DUOCOMAPPS). */
const fetchClienteByToken = async (
  token: string
): Promise<Record<string, unknown> | null> => {
  const dbConfig: FirebirdConnectionConfig = {
    host: config.firebird.host || 'localhost',
    port: config.firebird.port,
    database: config.firebird.database,
    user: config.firebird.user,
    password: config.firebird.password,
    client: config.firebird.client ?? undefined,
  };
  
  // Buscar por campo TOKEN si existe
  try {
    const rows = await executeQuery<Record<string, unknown>>(
      dbConfig,
      'SELECT * FROM "Clientes" WHERE "TOKEN" = ? AND "ESTADO" = 1',
      [token]
    );
    return rows[0] ?? null;
  } catch (error) {
    console.log('[auth] Campo TOKEN no disponible, intentando fallback por RUT');
    return null;
  }
};

/* ═══════════════════════════════════════════
   Rutas
═══════════════════════════════════════════ */

/**
 * POST /validar-rut
 * Recibe { rut } en el body y valida que exista como cliente activo.
 * Responde con la configuración del cliente (IP, puerto, BD).
 */
router.post('/validar-rut', apiKeyMiddleware, async (req, res, next) => {
  try {
    const rutNumber = parseRutNumber(req.body?.rut);
    if (!rutNumber) {
      res.status(400).json({ success: false, error: 'RUT invalido' });
      return;
    }

    console.log(`[auth] Validando RUT ${rutNumber}`);
    const clienteRow = await fetchClienteByRut(rutNumber);

    if (!clienteRow) {
      console.log('[auth] RUT no encontrado');
      res
        .status(401)
        .json({ success: false, error: 'RUT invalido o empresa inactiva' });
      return;
    }

    const cliente = buildClienteConfig(clienteRow);
    console.log('[auth] RUT validado');
    res.json({ success: true, data: cliente });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /validar-token
 * Recibe { token } en el body y valida que exista como empresa activa.
 * Responde con la configuración de conexión de esa empresa.
 * 
 * Validaciones:
 *  - token obligatorio
 *  - longitud mínima 8
 *  - empresa activa (ESTADO = 1)
 * 
 * Respuesta éxito (200):
 *  {
 *    "success": true,
 *    "data": {
 *      "razonSocial": "...",
 *      "ip": "...",
 *      "puerto": 3050,
 *      "bdAlias": "...",
 *      "user": "SYSDBA",
 *      "clave": "masterkey",
 *      "url1": "...",
 *      "url2": "...",
 *      "url3": "..."
 *    }
 *  }
 * 
 * Respuesta error:
 *  - 400: token inválido o longitud insuficiente
 *  - 404: token no encontrado o empresa inactiva
 *  - 500: error servidor
 */
router.post('/validar-token', async (req, res, next) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    
    // Validación: token obligatorio y longitud mínima
    if (!token) {
      res.status(400).json({ success: false, error: 'Token requerido' });
      return;
    }
    
    if (token.length < 8) {
      res.status(400).json({ success: false, error: 'Token debe tener mínimo 8 caracteres' });
      return;
    }

    console.log(`[auth] Validando token de empresa`);
    
    // Intentar buscar por TOKEN primero
    let clienteRow = await fetchClienteByToken(token);
    
    if (!clienteRow) {
      console.log('[auth] Token no encontrado');
      res.status(404).json({ success: false, error: 'Token inválido o empresa inactiva' });
      return;
    }

    const cliente = buildClienteConfig(clienteRow);
    
    // Preparar respuesta con datos sensibles para el cliente
    const responseData = {
      razonSocial: cliente.razonSocial,
      ip: cliente.ip,
      puerto: cliente.puerto,
      bdAlias: cliente.bdAlias,
      user: config.firebird.user,
      clave: config.firebird.password,
      url1: cliente.url1,
      url2: cliente.url2,
      url3: cliente.url3,
    };
    
    console.log(`[auth] Token validado para empresa: ${cliente.razonSocial}`);
    res.json({ success: true, data: responseData });
  } catch (error) {
    next(error);
  }
});


/**
 * POST /login
 * Recibe { username, password } en el body y el header x-cliente-config
 * con la configuración del cliente (obtenida de validar-rut).
 * Genera un JWT con los datos del cliente embebidos.
 *
 * TODO: Implementar autenticación real contra la BD del cliente.
 *       Actualmente acepta cualquier usuario/contraseña.
 */
router.post('/login', apiKeyMiddleware, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({ success: false, error: 'Usuario y contraseña son requeridos' });
      return;
    }

    // Leer la config del cliente desde el header
    let clienteConfig: ClienteConfig | null = null;
    const clienteConfigHeader = req.headers['x-cliente-config'] as string;
    if (clienteConfigHeader) {
      try {
        clienteConfig = JSON.parse(clienteConfigHeader);
      } catch (error) {
        console.error('[auth] Error parsing cliente config:', error);
      }
    }

    if (!clienteConfig) {
      res.status(400).json({ success: false, error: 'Configuración del cliente requerida' });
      return;
    }

    // Ruta completa a la BD del cliente
    const dbPath = `C:\\DuoCOM\\BDatos\\${clienteConfig.bdAlias}.Fdb`;

    console.log(`[auth] Login para usuario ${username} en BD: ${dbPath}`);

    // Generar JWT con la info del cliente embebida
    const token = jwt.sign({
      razonSocial: clienteConfig.razonSocial,
      rut: clienteConfig.rut,
      ip: clienteConfig.ip,
      puerto: clienteConfig.puerto,
      bdAlias: clienteConfig.bdAlias,
    }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as any,
    });

    res.json({
      success: true,
      data: {
        id: 1,
        username,
        nombre: username,
        rol: 'admin',
        token,
        cliente: {
          ...clienteConfig,
          bdAlias: dbPath,
          user: config.firebird.user,
          clave: config.firebird.password,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
