/**
 * db-helpers.ts — Funciones auxiliares compartidas para consultas a Firebird.
 *
 * Centraliza la lógica que antes estaba duplicada en dashboard.ts,
 * dashboard_new.ts, auth.ts, cliente-config.ts y authJwt.ts.
 *
 * Incluye:
 *  - Lectura segura de campos de un row (readField)
 *  - Conversión de tipos (toNumber, toString, parseRutNumber, etc.)
 *  - Normalización de claves de columna (normalizeKey, normalizeRow)
 *  - Parseo de parámetros de request (fechas, sucursales, límites)
 *  - Ejecución de stored procedures con fallback por nombre y n.° de parámetros
 */

import type { Request } from 'express';
import { query, type FirebirdConnectionConfig } from '../db/firebird';

/* ═══════════════════════════════════════════
   Tipos
═══════════════════════════════════════════ */

/** Fila con claves normalizadas (lowercase, sin tildes, sin caracteres especiales) */
export type NormalizedRow = Record<string, unknown>;

/* ═══════════════════════════════════════════
   Lectura segura de campos
═══════════════════════════════════════════ */

/**
 * Lee un campo de un row intentando el nombre tal cual,
 * luego en MAYÚSCULAS y finalmente en minúsculas.
 * Devuelve string vacío si no existe.
 */
export const readField = (row: Record<string, unknown>, key: string): string => {
  const direct = row[key];
  if (direct !== undefined && direct !== null) return String(direct);
  const upper = row[key.toUpperCase()];
  if (upper !== undefined && upper !== null) return String(upper);
  const lower = row[key.toLowerCase()];
  if (lower !== undefined && lower !== null) return String(lower);
  return '';
};

/* ═══════════════════════════════════════════
   Conversiones de tipo
═══════════════════════════════════════════ */

/** Convierte un valor desconocido a número. Devuelve 0 si no es parseable. */
export const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

/** Convierte un valor desconocido a string, trimea espacios. */
export const toString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

/**
 * Parsea un RUT (puede venir como número o string con puntos/guiones)
 * y devuelve solo la parte numérica.
 */
export const parseRutNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d]/g, '');
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** Parsea un string a entero, devuelve el fallback si falla. */
export const parseNumber = (value: string, defaultValue: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/* ═══════════════════════════════════════════
   Normalización de filas / claves
═══════════════════════════════════════════ */

/**
 * Normaliza una clave de columna: quita tildes, reemplaza
 * caracteres especiales por "_" y convierte a minúsculas.
 * Ej: "Descripción Sucursal" → "descripcion_sucursal"
 */
export const normalizeKey = (key: string): string =>
  key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

/**
 * Aplica normalizeKey a todas las claves de un row,
 * devolviendo un objeto nuevo con claves limpias.
 */
export const normalizeRow = (row: Record<string, unknown>): NormalizedRow => {
  const normalized: NormalizedRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = value;
  }
  return normalized;
};

/* ═══════════════════════════════════════════
   Lectura de config de BD del request
═══════════════════════════════════════════ */

/**
 * Obtiene la configuración de BD que el middleware authJwt
 * inyectó en req.dbConfig. Lanza error si falta.
 */
export const getDbConfig = (req: Request): FirebirdConnectionConfig => {
  if (!req.dbConfig) {
    throw new Error('Missing database configuration');
  }
  return req.dbConfig;
};

/* ═══════════════════════════════════════════
   Lectura de filas orientada a ventas
═══════════════════════════════════════════ */

/**
 * Intenta obtener el nombre de sucursal de un row
 * probando varias variantes de nombre de columna.
 */
export const getSucursalFromRow = (row: Record<string, unknown>): string =>
  toString(row.sucursal) ||
  toString(row['descripcion_sucursal']) ||
  toString(row['nombre_sucursal']) ||
  toString(row['nombre']) ||
  toString(row['descripcion']) ||
  toString(row['Id# Sucursal']) ||
  toString(row['Id Sucursal']) ||
  toString(row['id_sucursal']) ||
  toString(row['suc']) ||
  'N/A';

/**
 * Intenta obtener el total de ventas de un row
 * probando varias variantes de nombre de columna.
 */
export const getTotalFromRow = (row: Record<string, unknown>): number =>
  toNumber(row.total) ||
  toNumber(row.total_dia) ||
  toNumber(row.total_venta) ||
  toNumber(row.t_bruto) ||
  toNumber(row.importe) ||
  toNumber(row.monto) ||
  0;

/* ═══════════════════════════════════════════
   Parseo de parámetros de request
═══════════════════════════════════════════ */

/** Parsea un parámetro de fecha (YYYY-MM-DD). Devuelve null si es inválido. */
export const parseDateParam = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

/**
 * Obtiene un rango de fechas (start, end) de los query params.
 * Acepta "desde/hasta", "from/to" o "start/end".
 * Si no se proporcionan, usa hoy como end y 30 días atrás como start.
 */
export const getDateRange = (
  queryParams: Record<string, unknown>
): { start: Date; end: Date } => {
  const now = new Date();
  const rawEnd =
    parseDateParam(queryParams.hasta) ??
    parseDateParam(queryParams.to) ??
    parseDateParam(queryParams.end) ??
    now;
  const rawStart =
    parseDateParam(queryParams.desde) ??
    parseDateParam(queryParams.from) ??
    parseDateParam(queryParams.start) ??
    new Date(rawEnd instanceof Date ? rawEnd.getFullYear() : now.getFullYear(),
      rawEnd instanceof Date ? rawEnd.getMonth() : now.getMonth(),
      rawEnd instanceof Date ? rawEnd.getDate() - 30 : now.getDate() - 30);

  const end = rawEnd instanceof Date ? rawEnd : new Date(String(rawEnd));
  const start = rawStart instanceof Date ? rawStart : new Date(String(rawStart));

  return { start, end };
};

/**
 * Parsea el parámetro "sucursal" que puede ser un string separado
 * por comas o un array. Devuelve un array limpio de strings.
 */
export const parseSucursalList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(',').map((v) => v.trim()))
      .filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * Parsea el parámetro "limit" con valor por defecto y clamp [50, 5000].
 */
export const parseLimit = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 50), 5000);
};

/** Normaliza un nombre de sucursal para comparación (lowercase, trim). */
export const normalizeBranch = (value: unknown): string =>
  toString(value).toLowerCase().replace(/\s+/g, ' ').trim();

/** Elimina duplicados de un array de strings y ordena alfabéticamente. */
export const uniqueList = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

/* ═══════════════════════════════════════════
   Ejecución de stored procedures
═══════════════════════════════════════════ */

/**
 * Construye el SQL para llamar a un stored procedure de Firebird.
 * SELECT [FIRST n] * FROM "nombre"(?, ?, ...)
 */
export const buildProcedureSql = (
  name: string,
  params: unknown[],
  limit?: number,
  forceQuote?: boolean
): string => {
  // Firebird no acepta identificadores sin comillas que inicien con "_".
  const isSimpleIdentifier = /^[A-Za-z][A-Za-z0-9_$]*$/.test(name);
  const needsQuote = Boolean(forceQuote) || !isSimpleIdentifier || name.startsWith('_');
  const identifier = needsQuote
    ? `"${name.replace(/"/g, '""')}"`
    : name;

  if (!params.length) {
    return `SELECT ${limit ? `FIRST ${limit} ` : ''}* FROM ${identifier}`;
  }
  const placeholders = params
    .map((value) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return 'CAST(? AS TIMESTAMP)';
      }
      return '?';
    })
    .join(', ');
  return `SELECT ${limit ? `FIRST ${limit} ` : ''}* FROM ${identifier}(${placeholders})`;
};

/**
 * Ejecuta un stored procedure y normaliza las filas resultantes.
 */
export const runProcedure = async (
  dbConfig: FirebirdConnectionConfig,
  name: string,
  params: unknown[] = [],
  options?: { limit?: number; forceQuote?: boolean }
): Promise<NormalizedRow[]> => {
  // NO truncar fechas a solo día: pasar el Date completo para TIMESTAMP
  const normalizedParams = params.map((value) => value);
  const sql = buildProcedureSql(name, params, options?.limit, options?.forceQuote);
  console.log('[runProcedure][DEBUG] SQL generado:', { sql, normalizedParams, name, params });
  try {
    const rows = await query<Record<string, unknown>>(sql, normalizedParams, dbConfig);
    return rows.map(normalizeRow);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      !options?.forceQuote &&
      (message.includes('procedure unknown') ||
        message.includes('procedure not found') ||
        message.includes('table unknown'))
    ) {
      try {
        const quotedSql = buildProcedureSql(name, params, options?.limit, true);
        const rows = await query<Record<string, unknown>>(quotedSql, normalizedParams, dbConfig);
        return rows.map(normalizeRow);
      } catch (retryError) {
        // continue to log original error below
      }
    }
    const safeParams = normalizedParams.map((value) =>
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'bigint'
          ? value.toString()
          : value
    );
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[firebird] runProcedure failed', {
      name,
      sql,
      params: safeParams,
      error: errorMessage,
    });
    throw error;
  }
};

/**
 * Intenta ejecutar un stored procedure con distintos sets de parámetros.
 * Si falla por "parameter mismatch", prueba con el siguiente set.
 * Útil cuando no se sabe cuántos parámetros acepta el SP.
 */
export const runProcedureWithFallbacks = async (
  dbConfig: FirebirdConnectionConfig,
  name: string,
  paramSets: unknown[][],
  options?: { limit?: number; forceQuote?: boolean }
): Promise<NormalizedRow[]> => {
  let lastError: unknown;

  for (const params of paramSets) {
    try {
      return await runProcedure(dbConfig, name, params, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('parameter mismatch')) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
};

/**
 * Intenta ejecutar DISTINTOS stored procedures (por nombre) con fallbacks.
 * Si un SP no existe, prueba con el siguiente nombre.
 * Útil cuando distintos clientes tienen distintos SP para lo mismo.
 */
export const runProcedureByNames = async (
  dbConfig: FirebirdConnectionConfig,
  names: string[],
  paramSets: unknown[][],
  options?: { limit?: number; forceQuote?: boolean }
): Promise<NormalizedRow[]> => {
  let lastError: unknown;

  for (const name of names) {
    try {
      return await runProcedureWithFallbacks(dbConfig, name, paramSets, options);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (
        message.includes('procedure unknown') ||
        message.includes('procedure name') ||
        message.includes('procedure not found') ||
        message.includes('table unknown')
      ) {
        if (/[a-z]/.test(name)) {
          try {
            return await runProcedureWithFallbacks(dbConfig, name, paramSets, {
              ...options,
              forceQuote: true,
            });
          } catch (quotedError) {
            lastError = quotedError;
            continue;
          }
        }
        lastError = error;
        continue;
      }
      lastError = error;
    }
  }

  throw lastError;
};
