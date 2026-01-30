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
  // Usar config.firebird.port si no hay valor en la base
  const puertoRaw = readField(row, 'PUERTO');
  return {
    rut,
    fbHost: readField(row, 'IP'),
    fbPort: puertoRaw && puertoRaw.trim() !== '' ? Number.parseInt(puertoRaw, 10) : config.firebird.port,
    fbDatabase: readField(row, 'DBALIAS') || readField(row, 'BDALIAS'),
  };
};

export const authJwtMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let dbConfig: FirebirdConnectionConfig;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as any;

        // Si el token contiene información del cliente, usar la base de datos del cliente
        if (decoded.rut && decoded.ip && decoded.bdAlias) {
          dbConfig = {
            host: decoded.ip,
            port: decoded.puerto || config.firebird.port,
            database: `C:\\DuoCOM\\BDatos\\${decoded.bdAlias}.Fdb`,
            user: config.firebird.user,
            password: config.firebird.password,
            client: config.firebird.client ?? undefined,
          };
          req.user = { rut: parseRutNumber(decoded.rut) || 0 };
          req.dbConfig = dbConfig;
          return next();
        }
      } catch (jwtError) {
        // Token inválido, continuar con base de datos principal
      }
    }

    // Usar base de datos principal (DUOCOMAPPS.Fdb) para validaciones y cuando no hay token
    dbConfig = {
      host: config.firebird.host,
      port: config.firebird.port,
      database: config.firebird.database,
      user: config.firebird.user,
      password: config.firebird.password,
      client: config.firebird.client ?? undefined,
    };
    req.user = { rut: 0 };
    req.dbConfig = dbConfig;
    next();
  } catch (error) {
    next(error);
  }
};
