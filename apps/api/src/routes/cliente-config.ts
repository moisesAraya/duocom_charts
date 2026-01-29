import { Router, type Request } from 'express';
import { executeQuery } from '../db/firebirdPool';

const router = Router();

const readField = (row: Record<string, unknown>, key: string): string => {
  const direct = row[key];
  if (direct !== undefined && direct !== null) return String(direct);
  const upper = row[key.toUpperCase()];
  if (upper !== undefined && upper !== null) return String(upper);
  const lower = row[key.toLowerCase()];
  if (lower !== undefined && lower !== null) return String(lower);
  return '';
};

const parseIdCliente = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

const parseConfiguracion = (value: string): Record<string, unknown> => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as Record<string, unknown>;
};

const getRutFromRequest = (req: Request): number | null => {
  if (!req.user) return null;
  return parseRutNumber(req.user.rut);
};

const getDbConfig = (req: Request) => {
  if (!req.dbConfig) {
    throw new Error('Missing database configuration');
  }
  return req.dbConfig;
};

router.get('/cliente-config', async (req, res) => {
  const idCliente = parseIdCliente(req.query.idCliente);
  const rut = idCliente ? null : getRutFromRequest(req);

  if (!idCliente && !rut) {
    res.status(400).json({ success: false, error: 'idCliente requerido' });
    return;
  }

  let dbConfig;
  try {
    dbConfig = getDbConfig(req);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ [BACKEND] Missing db config', error);
    res.status(500).json({
      success: false,
      error: 'Configuracion de base de datos no disponible',
    });
    return;
  }

  const filterLabel = idCliente ? `ID ${idCliente}` : `RUT ${rut ?? 'N/A'}`;
  // eslint-disable-next-line no-console
  console.log(`🔍 [BACKEND] Cliente config query for ${filterLabel}`);

  try {
    const sql = idCliente
      ? 'SELECT "ID# CLIENTE", "RUT", "NOMBRE", "CONFIGURACION_JSON" FROM "Clientes" WHERE "ID# CLIENTE" = ? AND "ESTADO" = 1'
      : 'SELECT "ID# CLIENTE", "RUT", "NOMBRE", "CONFIGURACION_JSON" FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1';

    const rows = await executeQuery<Record<string, unknown>>(
      dbConfig,
      sql,
      [idCliente ?? rut]
    );

    if (!rows.length) {
      // eslint-disable-next-line no-console
      console.log('❌ [BACKEND] Cliente not found');
      res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      return;
    }

    const cliente = rows[0];
    const rawConfig = readField(cliente, 'Configuracion_JSON');
    let configuracion: Record<string, unknown> = {};

    try {
      configuracion = rawConfig ? parseConfiguracion(rawConfig) : {};
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('❌ [BACKEND] Invalid Configuracion_JSON', error);
      res
        .status(422)
        .json({ success: false, error: 'Configuracion_JSON invalida' });
      return;
    }

    const idValue = readField(cliente, 'ID# CLIENTE');
    const idNumber = parseIdCliente(idValue);

    // eslint-disable-next-line no-console
    console.log('✅ [BACKEND] Cliente config retrieved');
    res.json({
      success: true,
      data: {
        idCliente: idNumber ?? idValue,
        rut: readField(cliente, 'RUT'),
        nombre: readField(cliente, 'NOMBRE'),
        configuracion,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ [BACKEND] Cliente config error', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
