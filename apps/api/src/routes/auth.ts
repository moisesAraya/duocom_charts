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
  const puerto = parseNumber(readField(row, 'PUERTO'), 3050);
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
  host: cliente.ip || config.firebird.host,
  port: cliente.puerto || config.firebird.port,
  database: cliente.bdAlias,
  user: config.firebird.user,
  password: config.firebird.password,
  role: config.firebird.role ?? undefined,
  client: config.firebird.client ?? undefined,
});

const fetchClienteByRut = async (
  rutNumber: number
): Promise<Record<string, unknown> | null> => {
  const rows = await executeQuery<Record<string, unknown>>(
    'SELECT * FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1',
    [rutNumber],
    config.firebird
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
    const rutNumber = parseRutNumber(req.body?.rut);
    const username =
      typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !rutNumber) {
      res
        .status(400)
        .json({ success: false, error: 'Usuario y RUT son requeridos' });
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`🔍 [BACKEND] Login para RUT ${rutNumber}`);

    const clienteRow = await fetchClienteByRut(rutNumber);
    if (!clienteRow) {
      // eslint-disable-next-line no-console
      console.log('❌ [BACKEND] RUT no encontrado o inactivo');
      res
        .status(401)
        .json({ success: false, error: 'RUT invalido o empresa inactiva' });
      return;
    }

    const cliente = buildClienteConfig(clienteRow);
    const dbConfig = buildClienteDbConfig(cliente);
    if (!dbConfig.database) {
      // eslint-disable-next-line no-console
      console.error('❌ [BACKEND] DB config incompleta para cliente', {
        ip: cliente.ip || 'N/A',
        puerto: cliente.puerto || 'N/A',
        bdAlias: cliente.bdAlias || 'N/A',
      });
      res
        .status(500)
        .json({ success: false, error: 'Configuracion invalida del cliente' });
      return;
    }

    const sql = `
      SELECT FIRST 1
        "Id# Usuario" AS ID,
        "UserName" AS USERNAME,
        "UserName" AS NOMBRE,
        "Clave" AS PASSWORD,
        "Id# Perfil" AS ROL
      FROM "eUsuarios"
      WHERE "UserName" = ?
        AND CURRENT_DATE BETWEEN "Desde Fecha" AND "Hasta Fecha"
    `;

    const userRows = await executeQuery<Record<string, unknown>>(
      sql,
      [username],
      dbConfig
    );

    if (!userRows.length) {
      // eslint-disable-next-line no-console
      console.log('❌ [BACKEND] Usuario no encontrado o fuera de vigencia');
      res.status(401).json({
        success: false,
        error: 'Usuario o contrasena incorrectos o fuera de vigencia',
      });
      return;
    }

    const userRow = userRows[0];
    const storedPassword = readField(userRow, 'PASSWORD');
    if (!storedPassword || storedPassword !== password) {
      // eslint-disable-next-line no-console
      console.log('❌ [BACKEND] Contrasena incorrecta');
      res.status(401).json({ success: false, error: 'Usuario o clave incorrectos' });
      return;
    }

    const rolValue = parseNumber(readField(userRow, 'ROL'), 2);
    const rolMap: Record<number, string> = {
      1: 'admin',
      2: 'usuario',
      3: 'admin',
    };

    const token = jwt.sign({ rut: rutNumber }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    // eslint-disable-next-line no-console
    console.log('✅ [BACKEND] Login exitoso');
    res.json({
      success: true,
      token,
      data: {
        id: readField(userRow, 'ID'),
        username: readField(userRow, 'USERNAME'),
        nombre: readField(userRow, 'NOMBRE'),
        rol: rolMap[rolValue] ?? 'usuario',
        cliente,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
