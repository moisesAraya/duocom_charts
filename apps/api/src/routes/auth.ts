import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { FirebirdConnectionConfig } from '../db/firebird';
import { executeQuery } from '../db/firebirdPool';
import { apiKeyMiddleware } from '../middleware/apiKey';

const router = Router();

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

const readField = (row: Record<string, unknown>, key: string): string => {
  const direct = row[key];
  if (direct !== undefined && direct !== null) return String(direct);
  const upper = row[key.toUpperCase()];
  if (upper !== undefined && upper !== null) return String(upper);
  const lower = row[key.toLowerCase()];
  if (lower !== undefined && lower !== null) return String(lower);
  return '';
};

const parseRutNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d]/g, '');
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildClienteConfig = (row: Record<string, unknown>): ClienteConfig => {
  const rut = readField(row, 'RUT');
  const razonSocial = readField(row, 'RZ');
  const ip = readField(row, 'IP');
  // Usar config.firebird.port si no hay valor en la base
  const puertoRaw = readField(row, 'PUERTO');
  const puerto = puertoRaw && puertoRaw.trim() !== '' ? Number.parseInt(puertoRaw, 10) : config.firebird.port;
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

router.post('/validar-rut', apiKeyMiddleware, async (req, res, next) => {
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
  } catch (error) {
    next(error);
  }
});

router.post('/login', apiKeyMiddleware, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({ success: false, error: 'Usuario y contraseña son requeridos' });
      return;
    }

    // Parse cliente config from header
    let clienteConfig: ClienteConfig | null = null;
    const clienteConfigHeader = req.headers['x-cliente-config'] as string;
    if (clienteConfigHeader) {
      try {
        clienteConfig = JSON.parse(clienteConfigHeader);
      } catch (error) {
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

    const token = jwt.sign({ 
      razonSocial: clienteConfig.razonSocial,
      rut: clienteConfig.rut,
      ip: clienteConfig.ip,
      puerto: clienteConfig.puerto,
      bdAlias: clienteConfig.bdAlias
    }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as any,
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
