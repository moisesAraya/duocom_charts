/**
 * cliente-config.ts — Ruta para obtener la configuración de un cliente.
 *
 * GET /cliente-config?idCliente=N (o usa el RUT del JWT)
 *
 * Consulta la tabla "Clientes" en la BD del cliente (no la central)
 * y devuelve su configuración personalizada (CONFIGURACION_JSON),
 * que incluye preferencias visuales, módulos habilitados, etc.
 *
 * Requiere: API Key + JWT (el middleware authJwt configura req.dbConfig).
 */

import { Router, type Request } from 'express';
import { executeQuery } from '../db/firebirdPool';
import { readField, parseRutNumber, getDbConfig } from '../helpers/db-helpers';

const router = Router();

/* ═══════════════════════════════════════════
   Funciones auxiliares locales
═══════════════════════════════════════════ */

/** Parsea un ID de cliente (puede ser número o string). */
const parseIdCliente = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** Parsea el campo CONFIGURACION_JSON de un row. */
const parseConfiguracion = (value: string): Record<string, unknown> => {
  const trimmed = value.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as Record<string, unknown>;
};

/** Obtiene el RUT del usuario del JWT (inyectado por authJwt). */
const getRutFromRequest = (req: Request): number | null => {
  if (!req.user) return null;
  return parseRutNumber(req.user.rut);
};

/* ═══════════════════════════════════════════
   Ruta
═══════════════════════════════════════════ */

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
    console.error('[cliente-config] Missing db config', error);
    res.status(500).json({
      success: false,
      error: 'Configuracion de base de datos no disponible',
    });
    return;
  }

  const filterLabel = idCliente ? `ID ${idCliente}` : `RUT ${rut ?? 'N/A'}`;
  console.log(`[cliente-config] Buscando cliente por ${filterLabel}`);

  try {
    // Consulta por ID o por RUT según lo disponible
    const sql = idCliente
      ? 'SELECT "ID# CLIENTE", "RUT", "NOMBRE", "CONFIGURACION_JSON" FROM "Clientes" WHERE "ID# CLIENTE" = ? AND "ESTADO" = 1'
      : 'SELECT "ID# CLIENTE", "RUT", "NOMBRE", "CONFIGURACION_JSON" FROM "Clientes" WHERE "RUT" = ? AND "ESTADO" = 1';

    const rows = await executeQuery<Record<string, unknown>>(
      dbConfig,
      sql,
      [idCliente ?? rut]
    );

    if (!rows.length) {
      console.log('[cliente-config] Cliente no encontrado');
      res.status(404).json({ success: false, error: 'Cliente no encontrado' });
      return;
    }

    const cliente = rows[0];
    const rawConfig = readField(cliente, 'Configuracion_JSON');
    let configuracion: Record<string, unknown> = {};

    try {
      configuracion = rawConfig ? parseConfiguracion(rawConfig) : {};
    } catch (error) {
      console.error('[cliente-config] CONFIGURACION_JSON inválido', error);
      res
        .status(422)
        .json({ success: false, error: 'Configuracion_JSON invalida' });
      return;
    }

    const idValue = readField(cliente, 'ID# CLIENTE');
    const idNumber = parseIdCliente(idValue);

    console.log('[cliente-config] Configuración obtenida');
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
    console.error('[cliente-config] Error:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;
