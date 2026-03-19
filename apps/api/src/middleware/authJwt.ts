/**
 * authJwt.ts — Middleware de autenticación JWT.
 *
 * Verifica el token JWT del header Authorization y extrae la información
 * del cliente para inyectar la configuración de BD correcta en req.dbConfig.
 *
 * Flujo:
 *  1. Si el token contiene datos del cliente (rut, ip, bdAlias),
 *     configura req.dbConfig para apuntar a la BD de ese cliente.
 *  2. Si el token es inválido o no tiene datos de cliente,
 *     apunta a la BD central (DUOCOMAPPS.Fdb).
 *
 * Esto permite que cada endpoint use req.dbConfig sin preocuparse
 * de a qué base de datos conectarse.
 */

import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query, type FirebirdConnectionConfig } from '../db/firebird';
import { readField, parseRutNumber } from '../helpers/db-helpers';

/** Estructura de un registro de cliente en la BD central */
type UserRecord = {
  rut: number;
  fbHost: string;
  fbPort: number;
  fbDatabase: string;
};

/**
 * Busca un cliente activo por RUT en la BD central (DUOCOMAPPS).
 * Retorna host, puerto y alias de BD del cliente, o null si no existe.
 */
const fetchUserRecord = async (rut: number): Promise<UserRecord | null> => {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1',
    [String(rut)]
  );

  if (!rows.length) return null;
  const row = rows[0];
  const puertoRaw = readField(row, 'PUERTO');
  return {
    rut,
    fbHost: readField(row, 'IP'),
    fbPort: puertoRaw && puertoRaw.trim() !== '' ? Number.parseInt(puertoRaw, 10) : config.firebird.port,
    fbDatabase: readField(row, 'DBALIAS') || readField(row, 'BDALIAS'),
  };
};

/**
 * Middleware principal: decodifica el JWT y configura req.dbConfig.
 */
export const authJwtMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let dbConfig: FirebirdConnectionConfig;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as any;

        // Si el token contiene información del cliente, usar su BD específica.
        // En flujo por token, puede no venir `rut`, por eso solo exigimos ip + bdAlias.
        if (decoded.ip && decoded.bdAlias) {
          const rawAlias = String(decoded.bdAlias).trim();

          dbConfig = {
            host: decoded.ip,
            port: decoded.puerto || config.firebird.port,
            // BDALIAS puede ser alias lógico o ruta completa; usar tal cual.
            database: rawAlias,
            user: config.firebird.user,
            password: config.firebird.password,
            client: config.firebird.client ?? undefined,
          };
          req.user = { rut: parseRutNumber(decoded.rut) || 0 };
          req.dbConfig = dbConfig;
          return next();
        }
      } catch (_jwtError) {
        // Token inválido — continuar con BD central
      }
    }

    // Fallback: usar BD central (DUOCOMAPPS.Fdb)
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
