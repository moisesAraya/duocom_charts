import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query, type FirebirdConnectionConfig } from '../db/firebird';

type UserRecord = {
  rut: number;
  fbHost: string;
  fbPort: number;
  fbDatabase: string;
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

const parseRutNumber = (value: string | number): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d]/g, '');
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const fetchUserRecord = async (rut: number): Promise<UserRecord | null> => {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1',
    [String(rut)]
  );

  if (!rows.length) return null;
  const row = rows[0];
  return {
    rut,
    fbHost: readField(row, 'IP'),
    fbPort: Number.parseInt(readField(row, 'PUERTO') || '3050', 10),
    fbDatabase: readField(row, 'DBALIAS') || readField(row, 'BDALIAS'),
  };
};

export const authJwtMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      // eslint-disable-next-line no-console
      console.warn('[auth] Missing bearer token', { authHeader });
      res.status(401).json({ success: false, message: 'Missing bearer token' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    const rutNumber = parseRutNumber(payload?.rut ?? '');
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

    const dbConfig: FirebirdConnectionConfig = {
      host: user.fbHost || config.firebird.host,
      port: user.fbPort || config.firebird.port,
      database: user.fbDatabase,
      user: config.firebird.user,
      password: config.firebird.password,
      role: config.firebird.role ?? undefined,
      client: config.firebird.client ?? undefined,
    };

    // eslint-disable-next-line no-console
    console.info(
      `[auth] Rut ${user.rut} -> DB ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port}`
    );

    req.user = { rut: user.rut };
    req.dbConfig = dbConfig;
    next();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[auth] Token verification failed', error);
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
