/**
 * dashboard.ts — Router principal del dashboard.
 *
 * Expone ~20 endpoints que alimentan el dashboard móvil de Duocom,
 * cubriendo ventas, inventario, finanzas (cuentas por pagar / cobrar)
 * y datos de proyección. Cada endpoint lee de procedimientos almacenados
 * de Firebird a través de los helpers compartidos en ../helpers/db-helpers.
 */

import { Router, type Request } from 'express';
import { query, type FirebirdConnectionConfig } from '../db/firebird';
import {
  normalizeKey,
  normalizeRow,
  getDbConfig,
  toNumber,
  toString,
  getSucursalFromRow,
  getTotalFromRow,
  parseDateParam,
  getDateRange,
  buildProcedureSql,
  runProcedure,
  runProcedureWithFallbacks,
  runProcedureByNames,
  parseSucursalList,
  parseLimit,
  normalizeBranch,
  parseNumber,
  type NormalizedRow,
} from '../helpers/db-helpers';

const router = Router();

/**
 * Intenta leer un campo de un row normalizado probando varias variantes (original, minusculas, mayusculas).
 */
const readField = (row: any, key: string): any => {
  if (!row) return undefined;
  return row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
};

/**
 * Compara de forma flexible la sucursal de una fila con los filtros seleccionados.
 * Soporta substring matching y es insensible a mayúsculas/minúsculas.
 */
const isBranchMatch = (rowSucursal: string, filters: string[]): boolean => {
  if (!filters || filters.length === 0) return true;
  const normalizedRowSuc = (rowSucursal || 'N/A').toLowerCase().trim();
  return filters.some(f => {
    const nf = f.toLowerCase().trim();
    return normalizedRowSuc.includes(nf) || nf.includes(normalizedRowSuc);
  });
};

/** Fila de SP normalizada: coincide filtro si el nombre O el id de sucursal calza (ej. filtro "1" vs id_sucursal). */
const rowMatchesBranches = (row: NormalizedRow, filters: string[]): boolean => {
  if (!filters.length) return true;
  const name = getSucursalFromRow(row);
  const id = toString(
    row.id_sucursal ?? row.idsucursal ?? row.cod_sucursal ?? row.id_sucursal_catalog,
  );
  return isBranchMatch(name, filters) || (Boolean(id) && isBranchMatch(id, filters));
};

// Middleware para loguear dbConfig en cada request del dashboard
router.use((req, res, next) => {
  try {
    const dbConfig = req.dbConfig;
    console.log('[DASHBOARD][dbConfig]', dbConfig);
  } catch {}
  next();
});

/* ═══════════════════════════════════════════
   Tipos y helpers locales (específicos del dashboard)
═══════════════════════════════════════════ */

type CuentasPagarDoc = {
  proveedor: string;
  sucursal: string;
  monto: number;
  fechaVenc: Date | null;
  fechaVencIso: string | null;
  daysToDue: number;
  diasVencido: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseUnknownDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const candidate = new Date(trimmed);
    if (!Number.isNaN(candidate.getTime())) return candidate;
  }
  return null;
};

const toIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const diffDays = (left: Date, right: Date): number => {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.floor((leftUtc - rightUtc) / DAY_MS);
};

const getTipoDocumento = (row: NormalizedRow): string =>
  (
    toString(row.tipo_doc) ||
    toString(row.tipo_documento) ||
    toString(row.tipodoc) ||
    toString(row.documento_tipo) ||
    toString(row.tipo) ||
    toString(row.t_doc) ||
    toString(row.cod_doc)
  ).toLowerCase();

const getSignedDebt = (row: NormalizedRow): number => {
  const rawAmount =
    toNumber(row.saldo) ||
    toNumber(row.total) ||
    toNumber(row.importe) ||
    toNumber(row.monto);
  const tipoDocumento = getTipoDocumento(row);

  if (
    tipoDocumento.includes('nota credito') ||
    tipoDocumento.includes('nota de credito') ||
    /^nc\b/.test(tipoDocumento)
  ) {
    return -Math.abs(rawAmount);
  }

  if (
    tipoDocumento.includes('factura') ||
    tipoDocumento.includes('nota debito') ||
    tipoDocumento.includes('nota de debito') ||
    /^nd\b/.test(tipoDocumento)
  ) {
    return Math.abs(rawAmount);
  }

  return rawAmount;
};

const normalizeCuentasPagarDocs = (
  rows: NormalizedRow[],
  end: Date,
  branches: string[]
): CuentasPagarDoc[] =>
  rows
    .map(row => {
      const sucursal = toString(row.sucursal) || toString(row.descripcion_sucursal);
      if (!isBranchMatch(sucursal, branches)) return null;

      const proveedor =
        toString(row.nombres_razon_social) ||
        toString(row.proveedor) ||
        toString(row.razon_social) ||
        toString(row.id_persona) ||
        'Proveedor N/A';

      const fechaVenc =
        parseUnknownDate(row.fechavenc) ??
        parseUnknownDate(row.fecha_venc) ??
        parseUnknownDate(row.fecha_vencimiento) ??
        parseUnknownDate(row.fecha_vcto) ??
        parseUnknownDate(row.fecha_vence) ??
        parseUnknownDate(row.f_venc) ??
        null;

      const diasTransc = toNumber(row.dias_transc);
      const daysToDue = fechaVenc ? diffDays(fechaVenc, end) : -Math.max(0, diasTransc);
      const diasVencido = Math.max(0, -daysToDue);

      return {
        proveedor,
        sucursal,
        monto: getSignedDebt(row),
        fechaVenc,
        fechaVencIso: toIsoDate(fechaVenc),
        daysToDue,
        diasVencido,
      };
    })
    .filter((row): row is CuentasPagarDoc => Boolean(row));

const startOfIsoWeek = (date: Date): Date => {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
};

const endOfIsoWeek = (date: Date): Date => {
  const end = startOfIsoWeek(date);
  end.setDate(end.getDate() + 6);
  return end;
};

const coerceDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const candidate = new Date(String(value));
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const getIsoWeekLabel = (date: Date | string | number): string => {
  const normalized = coerceDate(date);
  if (!normalized) return '';
  const target = new Date(Date.UTC(normalized.getFullYear(), normalized.getMonth(), normalized.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNr + 3);
  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

const getMonthLabel = (date: Date | string | number): string => {
  const normalized = coerceDate(date);
  if (!normalized) return '';
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
};

const isMissingProcedureError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('procedure unknown') ||
    message.includes('procedure not found') ||
    message.includes('table unknown')
  );
};

const getProyVentaAnualRows = async (
  dbConfig: FirebirdConnectionConfig,
  years: number
): Promise<NormalizedRow[]> => {
  try {
    return await runProcedure(dbConfig, '_ProyVentaAnual', [years]);
  } catch (error) {
    if (!isMissingProcedureError(error)) throw error;

    const end = new Date();
    const start = new Date(end.getFullYear() - Math.max(1, years) + 1, 0, 1);
    const rawRows = await runProcedure(dbConfig, 'zResumenVentas', [start, end], { limit: 20000 });
    const totals = new Map<string, number>();

    for (const row of rawRows) {
      const fecha = parseUnknownDate(row.fecha);
      if (!fecha) continue;
      const sucursal =
        toString(row.descripcion_sucursal) ||
        toString(row.sucursal) ||
        'N/A';
      const ano = fecha.getFullYear();
      const mes = fecha.getMonth() + 1;
      const total = toNumber(row.total);
      const key = `${sucursal}::${ano}::${mes}`;
      totals.set(key, (totals.get(key) ?? 0) + total);
    }

    return Array.from(totals.entries()).map(([key, total]) => {
      const [sucursal, anoRaw, mesRaw] = key.split('::');
      return {
        sucursal,
        ano: Number(anoRaw),
        mes: Number(mesRaw),
        total,
      } as NormalizedRow;
    });
  }
};

const getRotacionRows = async (
  dbConfig: FirebirdConnectionConfig,
  start: Date,
  limit: number
): Promise<NormalizedRow[]> => {
  try {
    return await runProcedure(dbConfig, '_PvtRotación', [start], { limit });
  } catch (error) {
    if (isMissingProcedureError(error)) return [];
    throw error;
  }
};

/* ═══════════════════════════════════════════
   Rutas
═══════════════════════════════════════════ */

// Listar todas las sucursales disponibles en la base de datos
router.get('/sucursales', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    console.log('[ventas-tiempo-real] dbConfig:', dbConfig);
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM "eSucursales"',
      [],
      dbConfig
    );
    const normalizedRows = rows.map(normalizeRow);
    console.log('[dashboard] sucursales rows', rows.length);
    /** id = id numérico de BD si existe (calza con id_sucursal en SP); si no, nombre normalizado. */
    const byId = new Map<string, { id: string; nombre: string }>();
    for (const row of normalizedRows) {
      const nombre =
        toString(row.descripcion) ||
          toString(row.nombre) ||
          toString(row.descripcion_sucursal) ||
          toString(row.nombre_sucursal) ||
          toString(row.sucursal) ||
          getSucursalFromRow(row);
      const idRaw = row.id_sucursal ?? row.idsucursal ?? row.id ?? row.codigo;
      const hasNumericId =
        idRaw !== undefined && idRaw !== null && String(idRaw).trim() !== '';
      const id = hasNumericId ? String(idRaw).trim() : normalizeBranch(nombre || 'Sucursal');
      const label = (nombre || id).trim() || id;
      if (!byId.has(id)) byId.set(id, { id, nombre: label });
    }
    const data = Array.from(byId.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
    );
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

// Tráfico de clientes por hora y sucursal
router.get('/dashboard/clientes-hora', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtVentaHoraria', [start, end], { limit });
    const totals = new Map<
      string,
      { sucursal: string; hora: number; clientes: number; fecha: string }
    >();

    for (const row of rows) {
      const sucursal = toString(row.sucursal) || 'N/A';
      if (!rowMatchesBranches(row, branches)) continue;
      const hora = toNumber(row.hora);
      const clientes =
        toNumber(row.cant_docs) || toNumber(row.n_x) || toNumber(row.ticket);
      const fechaValue = row.fecha instanceof Date ? row.fecha : new Date(String(row.fecha));
      const fecha = Number.isNaN(fechaValue.getTime())
        ? toString(row.fecha)
        : fechaValue.toISOString().slice(0, 10);
      const key = `${sucursal}-${hora}`;

      totals.set(key, {
        sucursal,
        hora,
        fecha,
        clientes: (totals.get(key)?.clientes ?? 0) + clientes,
      });
    }

    res.json({ success: true, data: Array.from(totals.values()) });
  } catch (error) {
    next(error);
  }
});

// Desglose de ventas por medio de pago
router.get('/dashboard/ventas-medio-pago', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtVentaHoraria', [start, end], { limit });

    const accumulate = (list: NormalizedRow[], useFilter: boolean) => {
      const map = new Map<string, number>();
      for (const row of list) {
        const sucursal = toString(row.sucursal) || 'N/A';
        if (useFilter && !rowMatchesBranches(row, branches)) continue;
        const medioPago = toString(row.medio_de_pago) || 'Otros';
        const monto = toNumber(row.t_bruto) || toNumber(row.total);
        const key = `${sucursal}::${medioPago}`;
        map.set(key, (map.get(key) ?? 0) + monto);
      }
      return map;
    };

    let totals = accumulate(rows, true);
    if (!totals.size && rows.length > 0 && branches.length > 0) {
      totals = accumulate(rows, false);
      console.warn('[ventas-medio-pago] filtro sucursal vacío; se devolvió sin filtrar');
    }

    const data = Array.from(totals.entries())
      .map(([key, monto]) => {
        const [sucursal, medio_pago] = key.split('::');
        return { sucursal, medio_pago, monto };
      })
      .sort((a, b) => b.monto - a.monto);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Ventas agrupadas por grupo de producto / categoría
router.get('/dashboard/ventas-por-grupo', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const topN = parseNumber(toString(req.query.topN), 20);
    const branches = parseSucursalList(req.query.sucursal);
    let rows: NormalizedRow[] = [];
    try {
      rows = await runProcedure(dbConfig, 'SQL_TopNVentasPorGrupo', [start, end, topN], {
        limit: 5000,
      });
    } catch (error) {
      if (isMissingProcedureError(error)) {
        res.json({
          success: true,
          data: [],
          warning: 'No existe SP SQL_TopNVentasPorGrupo en esta base de datos',
        });
        return;
      }
      throw error;
    }

    const totals = new Map<string, number>();
    for (const row of rows) {
      if (!rowMatchesBranches(row, branches)) continue;
      const group =
        toString(
          row.grupo ||
            row.nombre_grupo ||
            row.descripcion_grupo ||
            row.grupo_desc ||
            row.descripcion_corta ||
            row.descripcion_art_serv ||
            row.descripcion_articulo ||
            row.descripcion ||
            row.nombre
        ) || 'Sin grupo';
      const total =
        toNumber(row.total) ||
        toNumber(row.total_venta) ||
        toNumber(row.venta) ||
        toNumber(row.monto) ||
        toNumber(row.importe);
      totals.set(group, (totals.get(group) ?? 0) + total);
    }

    let data = Array.from(totals.entries())
      .map(([grupo, total]) => ({ grupo, total }))
      .sort((a, b) => b.total - a.total);

    if (!data.length && rows.length > 0 && branches.length > 0) {
      totals.clear();
      for (const row of rows) {
        const group =
          toString(
            row.grupo ||
              row.nombre_grupo ||
              row.descripcion_grupo ||
              row.grupo_desc ||
              row.descripcion_corta ||
              row.descripcion_art_serv ||
              row.descripcion_articulo ||
              row.descripcion ||
              row.nombre
          ) || 'Sin grupo';
        const total =
          toNumber(row.total) ||
          toNumber(row.total_venta) ||
          toNumber(row.venta) ||
          toNumber(row.monto) ||
          toNumber(row.importe);
        totals.set(group, (totals.get(group) ?? 0) + total);
      }
      data = Array.from(totals.entries())
        .map(([grupo, total]) => ({ grupo, total }))
        .sort((a, b) => b.total - a.total);
      console.warn('[ventas-por-grupo] filtro de sucursal dejó todo vacío; se devolvió sin filtrar');
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Totales de ventas anuales por sucursal (multi-año)
router.get('/dashboard/ventas-anuales', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const years = Number.parseInt(String(req.query.years ?? '3'), 10);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await getProyVentaAnualRows(dbConfig, Number.isFinite(years) ? years : 3);
    const totals = new Map<string, number>();


    for (const row of rows) {
      const anio =
        toNumber(row.ano) ||
        toNumber(row.anio) ||
        toNumber(row.ejercicio) ||
        toNumber(row.periodo);
      const sucursal = getSucursalFromRow(row);
      if (!rowMatchesBranches(row, branches)) continue;
      const total = getTotalFromRow(row);
      const key = `${sucursal}::${anio}`;
      totals.set(key, (totals.get(key) ?? 0) + total);
    }

    let data = Array.from(totals.entries())
      .map(([key, total]) => {
        const [sucursal, anioRaw] = key.split('::');
        return { sucursal, anio: Number(anioRaw), total };
      })
      .sort((a, b) => a.anio - b.anio);

    if (!data.length && rows.length > 0 && branches.length > 0) {
      totals.clear();
      for (const row of rows) {
        const anio =
          toNumber(row.ano) ||
          toNumber(row.anio) ||
          toNumber(row.ejercicio) ||
          toNumber(row.periodo);
        const sucursal = getSucursalFromRow(row);
        const total = getTotalFromRow(row);
        const key = `${sucursal}::${anio}`;
        totals.set(key, (totals.get(key) ?? 0) + total);
      }
      data = Array.from(totals.entries())
        .map(([key, total]) => {
          const [sucursal, anioRaw] = key.split('::');
          return { sucursal, anio: Number(anioRaw), total };
        })
        .sort((a, b) => a.anio - b.anio);
      console.warn('[ventas-anuales] filtro de sucursal dejó todo vacío; se devolvió sin filtrar');
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Resumen diario de ventas en un rango de fechas (vista mensual)
router.get('/dashboard/resumen-mensual-ventas', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedureByNames(
      dbConfig,
      ['Graf VentasDiarias', 'GRAF_VENTASDIARIAS'],
      [[start, end], [start], []],
      { limit }
    );

    const data = rows
      .filter(row => {
        const sucursal = getSucursalFromRow(row);
        return branches.length ? branches.includes(sucursal) : true;
      })
      .map(row => ({
        fecha: row.fecha,
        sucursal: getSucursalFromRow(row),
        total: getTotalFromRow(row),
        documentos: toNumber(row.cant_docs),
      }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Totales mensuales para un año específico (vista anual)
router.get('/dashboard/resumen-anual-ventas', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { end } = getDateRange(req.query as Record<string, unknown>);
    const year = Number.parseInt(String(req.query.anio ?? end.getFullYear()), 10);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await getProyVentaAnualRows(dbConfig, 5);
    const totals = new Map<string, number>();


    for (const row of rows) {
      const anio = toNumber(row.ano);
      if (anio !== year) continue;
      const sucursal = getSucursalFromRow(row);
      if (!isBranchMatch(sucursal, branches)) continue;
      const mes = toNumber(row.mes);
      const total = getTotalFromRow(row);
      const key = `${sucursal}::${mes}`;
      totals.set(key, (totals.get(key) ?? 0) + total);
    }

    const data = Array.from(totals.entries())
      .map(([key, total]) => {
        const [sucursal, mesRaw] = key.split('::');
        return { sucursal, mes: Number(mesRaw), total };
      })
      .sort((a, b) => a.mes - b.mes);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Detalle de ventas por transacción (nivel minuto)
router.get('/dashboard/venta-minuto', async (req, res, next) => {
  try {
    console.log('[VENTA-MINUTO][DEBUG] INICIO endpoint /dashboard/venta-minuto');
    const dbConfig = getDbConfig(req);
    // Obtener la fecha desde el query param 'fecha', o usar hoy si no viene
    const fechaParam = req.query.fecha;
    let fecha = parseDateParam(fechaParam);
    if (!fecha) fecha = new Date();
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    console.log('[VENTA-MINUTO][DEBUG] Antes de runProcedure', { fecha, limit, branches });
    // Llamar al nuevo SP con solo la fecha
    const rows = await runProcedure(dbConfig, '_Web_VtaAlMin', [fecha], { limit });
    console.log('[VENTA-MINUTO][DEBUG] Después de runProcedure, filas:', rows.length);
    // Log para depuración: cantidad de filas y claves de la primera fila
    if (rows.length > 0) {
      console.log('[VENTA-MINUTO][DEBUG] Claves de la primera fila:', Object.keys(rows[0]));
      console.log('[VENTA-MINUTO][DEBUG] Primera fila:', rows[0]);
    }
    // Mapeo flexible de columnas (algunos nombres pueden variar)
    const data = rows
      .filter(row => rowMatchesBranches(row, branches))
      .map(row => ({
        id_sucursal: toNumber(row.id_sucursal),
        sucursal: toString(row.sucursal),
        objetivo_mensual: toNumber(row.objetivo_mensual),
        obj_tickets_mes: toNumber(row.obj_tickets_mes),
        venta_dia: toNumber(row.venta_dia),
        ticket_dia: toNumber(row.ticket_dia),
        ticket_prom_dia: toNumber(row.ticket_prom_dia),
        venta_acum_mes: toNumber(row.venta_acum_mes),
        ticket_acum_mes: toNumber(row.ticket_acum_mes),
        ticket_prom_mes: toNumber(row.ticket_prom_mes),
        ticket_x_min: toNumber(row.ticket_x_min),
        ticket_x_hora: toNumber(row.ticket_x_hora),
        del_objetivo_total: toNumber(row.del_objetivo_total),
        avance_objetivo: toNumber(row.avance_objetivo),
        semaforo: toString(row.semaforo),
        av_ticket_mes: toNumber(row.av_ticket_mes),
        sem_ticket: toString(row.sem_ticket),
        proyeccion: toNumber(row.proyeccion),
        semaforo_proy: toString(row.semaforo_proy),
        brecha_objetivo: toNumber(row.brecha_objetivo),
        brecha_proyeccion: toNumber(row.brecha_proyeccion),
        nuevo_objetivo_diario: toNumber(row.nuevo_objetivo_diario),
        dias_laborales: toString(row.dias_laborales),
        periodo_transcurrido: toNumber(row.periodo_transcurrido),
        ranking: toNumber(row.ranking),
      }));

    console.log('[VENTA-MINUTO][DEBUG] FIN endpoint /dashboard/venta-minuto, data.length:', data.length);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[VENTA-MINUTO][ERROR]', error);
    next(error);
  }
});

// Inventario valorizado (top 20 productos por valor de stock)
router.get('/dashboard/inventario-valorizado', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 1500);
    const rows = await runProcedure(dbConfig, '_PvtStock', [end], { limit });
    const branches = parseSucursalList(req.query.sucursal);
    const data = rows
      .map(row => {
        const sucursal =
          toString(row.sucursal) ||
          toString(row.bodega_local) ||
          toString(row.descripcion_sucursal) ||
          toString(row.nombre_sucursal) ||
          'N/A';
        return {
          producto:
            toString(row.descripcion_art_serv) ||
            toString(row.descripcion_articulo) ||
            toString(row.desc_articulo) ||
            toString(row.nombre_articulo) ||
            toString(row.nom_articulo) ||
            toString(row.descripcion) ||
            toString(row.nombre) ||
            toString(row.glosa) ||
            toString(row.detalle) ||
            toString(row.producto) ||
            toString(row.articulo) ||
            toString(row.codigo_articulo) ||
            toString(row.cod_articulo) ||
            toString(row.id_art_serv) ||
            toString(row.id_articulo) ||
            toString(row.codigo) ||
            toString(row.sku) ||
            'Sin nombre',
          sucursal,
          stock:
            toNumber(row.stock_actual) ||
            toNumber(row.stock) ||
            toNumber(row.existencia),
          total_venta:
            toNumber(row.total_p_venta) ||
            toNumber(row.total_venta) ||
            toNumber(row.valor_stock) ||
            toNumber(row.costo_total),
          stock_min:
            toNumber(row.stock_min) ||
            toNumber(row.stock_minimo),
          stock_max:
            toNumber(row.stock_max) ||
            toNumber(row.stock_maximo),
        };
      })
      .filter(row => (branches.length ? isBranchMatch(row.sucursal, branches) : true))
      .map(row => ({
        producto: row.producto,
        sucursal: row.sucursal,
        stock: row.stock,
        total_venta: row.total_venta,
        stock_min: row.stock_min,
        stock_max: row.stock_max,
      }))
      .sort((a, b) => b.total_venta - a.total_venta)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Ventas acumuladas por hora (08:00 → hora actual): serie alineada a _PvtVentaHoraria (+ cierre con _Web_VtaAlMin si hace falta)
router.get('/dashboard/ventas-tiempo-real-hora', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const branches = parseSucursalList(req.query.sucursal);

    const atRaw = req.query.at ? String(req.query.at) : '';
    const at = atRaw ? new Date(atRaw) : new Date();
    if (Number.isNaN(at.getTime())) {
      res.status(400).json({ success: false, error: 'Invalid query param: at' });
      return;
    }

    const tzOffsetMinRaw = Number(req.query.tzOffsetMin ?? 0);
    const tzOffsetMin = Number.isFinite(tzOffsetMinRaw) ? tzOffsetMinRaw : 0;

    const endLocalAsUtc = new Date(at.getTime() - tzOffsetMin * 60_000);
    const startLocalAsUtc = new Date(endLocalAsUtc.getTime());
    startLocalAsUtc.setUTCHours(8, 0, 0, 0);

    const start = new Date(startLocalAsUtc.getTime() + tzOffsetMin * 60_000);
    const end = new Date(endLocalAsUtc.getTime() + tzOffsetMin * 60_000);

    const limit = parseLimit(req.query.limit, 3000);
    const startHour = 8;
    const endHour = Math.max(startHour, endLocalAsUtc.getUTCHours());

    type Pt = {
      fechaHora: string;
      hora: number;
      totalAcumulado: number;
      ticketsHora: number;
      ticketsAcumulados: number;
    };

    const buildFromWebSnapshots = async (): Promise<Pt[]> => {
      const pointsLocalAsUtc: Date[] = [];
      for (let h = startHour; h <= endHour; h += 1) {
        const d = new Date(endLocalAsUtc.getTime());
        d.setUTCHours(h, 0, 0, 0);
        pointsLocalAsUtc.push(d);
      }
      pointsLocalAsUtc.push(new Date(endLocalAsUtc.getTime()));

      const pointsUtc = pointsLocalAsUtc.map(
        (dLocalAsUtc) => new Date(dLocalAsUtc.getTime() + tzOffsetMin * 60_000),
      );

      const snapshots: NormalizedRow[][] = [];
      for (let i = 0; i < pointsUtc.length; i += 1) {
        const ts = pointsUtc[i];
        try {
          const rows = await runProcedure(dbConfig, '_Web_VtaAlMin', [ts], { limit });
          snapshots.push(rows ?? []);
        } catch (err) {
          console.error('[ventas-tiempo-real-hora][WARN] _Web_VtaAlMin falló en punto', i, {
            ts: ts.toISOString(),
            message: err instanceof Error ? err.message : String(err),
          });
          snapshots.push([]);
        }
      }

      const out: Pt[] = [];
      let prevTickets = 0;
      snapshots.forEach((rows, idx) => {
        const tsUtc = pointsUtc[idx];
        const tsLocalAsUtc = pointsLocalAsUtc[idx];
        const totals = (rows ?? []).reduce(
          (acc, row) => {
            if (!rowMatchesBranches(row, branches)) return acc;
            return {
              ventaDia: acc.ventaDia + toNumber(row.venta_dia),
              ticketsDia: acc.ticketsDia + toNumber(row.ticket_dia),
            };
          },
          { ventaDia: 0, ticketsDia: 0 },
        );
        const ticketsHora = Math.max(0, totals.ticketsDia - prevTickets);
        prevTickets = totals.ticketsDia;
        out.push({
          fechaHora: tsUtc.toISOString(),
          hora: tsLocalAsUtc.getUTCHours(),
          totalAcumulado: totals.ventaDia,
          ticketsHora,
          ticketsAcumulados: totals.ticketsDia,
        });
      });
      return out;
    };

    let pvtRows: NormalizedRow[] = [];
    try {
      pvtRows = await runProcedure(dbConfig, '_PvtVentaHoraria', [start, end], { limit });
    } catch (err) {
      console.error('[ventas-tiempo-real-hora] _PvtVentaHoraria falló, usando _Web_VtaAlMin', {
        message: err instanceof Error ? err.message : String(err),
      });
      pvtRows = [];
    }

    const fillByHour = (rows: NormalizedRow[], useBranchFilter: boolean) => {
      const map = new Map<number, { monto: number; tickets: number }>();
      for (const row of rows) {
        if (useBranchFilter && !rowMatchesBranches(row, branches)) continue;
        const h = Math.trunc(toNumber(row.hora));
        if (!Number.isFinite(h)) continue;
        const monto =
          toNumber(row.t_bruto) ||
          toNumber(readField(row, 't_bruto')) ||
          getTotalFromRow(row);
        const tickets =
          toNumber(row.cant_docs) || toNumber(readField(row, 'cant_docs'));
        const slot = map.get(h) ?? { monto: 0, tickets: 0 };
        slot.monto += monto;
        slot.tickets += tickets;
        map.set(h, slot);
      }
      return map;
    };

    let byHour = fillByHour(pvtRows, true);
    if (pvtRows.length > 0 && byHour.size === 0 && branches.length > 0) {
      byHour = fillByHour(pvtRows, false);
      console.warn(
        '[ventas-tiempo-real-hora] filtro sucursal dejó Pvt vacío; serie sin filtrar por sucursal',
      );
    }

    let data: Pt[] = [];
    let cumMonto = 0;
    let cumTickets = 0;

    for (let h = startHour; h <= endHour; h += 1) {
      const slot = byHour.get(h) ?? { monto: 0, tickets: 0 };
      cumMonto += slot.monto;
      cumTickets += slot.tickets;
      const tsLocalAsUtc = new Date(endLocalAsUtc.getTime());
      tsLocalAsUtc.setUTCHours(h, 0, 0, 0);
      const tsUtc = new Date(tsLocalAsUtc.getTime() + tzOffsetMin * 60_000);
      data.push({
        fechaHora: tsUtc.toISOString(),
        hora: h,
        totalAcumulado: cumMonto,
        ticketsHora: slot.tickets,
        ticketsAcumulados: cumTickets,
      });
    }

    const hasSubHourTail =
      endLocalAsUtc.getUTCMinutes() !== 0 ||
      endLocalAsUtc.getUTCSeconds() !== 0 ||
      endLocalAsUtc.getUTCMilliseconds() !== 0;

    if (data.length && hasSubHourTail) {
      let webVenta = cumMonto;
      try {
        const webRows = await runProcedure(dbConfig, '_Web_VtaAlMin', [end], { limit });
        webVenta = (webRows ?? []).reduce((acc, row) => {
          if (!rowMatchesBranches(row, branches)) return acc;
          return acc + toNumber(row.venta_dia);
        }, 0);
      } catch {
        /* mantener acumulado Pvt */
      }
      const lastIso = end.toISOString();
      if (data[data.length - 1]?.fechaHora !== lastIso) {
        data.push({
          fechaHora: lastIso,
          hora: endLocalAsUtc.getUTCHours(),
          totalAcumulado: webVenta,
          ticketsHora: 0,
          ticketsAcumulados: cumTickets,
        });
      }
    }

    if (pvtRows.length === 0) {
      data = await buildFromWebSnapshots();
      console.log('[ventas-tiempo-real-hora] sin Pvt, fallback _Web_VtaAlMin, puntos:', data.length);
    }

    console.log('[ventas-tiempo-real-hora][DEBUG] input', {
      at: at.toISOString(),
      tzOffsetMin,
      start: start.toISOString(),
      end: end.toISOString(),
      branches,
      pvtRowCount: pvtRows.length,
      horasAgg: byHour.size,
      outPoints: data.length,
    });

    res.json({ success: true, data, meta: { start: start.toISOString(), end: end.toISOString() } });
  } catch (error) {
    next(error);
  }
});

// Ranking de rotación de productos (top 20)
router.get('/dashboard/productos-rotacion', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await getRotacionRows(dbConfig, start, limit);
    const totals = new Map<string, number>();

    for (const row of rows) {
      const sucursal = getSucursalFromRow(row);
      if (!isBranchMatch(sucursal, branches)) continue;
      
      const producto = readField(row, 'descripcion_art_serv') || 
                       readField(row, 'producto') || 
                       readField(row, 'descripcion') ||
                       readField(row, 'nombre') ||
                       'Sin nombre';
                       
      const cantidad = toNumber(readField(row, 'cantidad') || readField(row, 'rotacion') || readField(row, 'total'));
      totals.set(producto, (totals.get(producto) ?? 0) + cantidad);
    }

    const data = Array.from(totals.entries())
      .map(([producto, rotacion]) => ({ producto, rotacion }))
      .sort((a, b) => b.rotacion - a.rotacion)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Ranking de rentabilidad de productos (top 20 por contribución)
router.get('/dashboard/rentabilidad-productos', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await getRotacionRows(dbConfig, start, limit);
    const totals = new Map<string, number>();

    for (const row of rows) {
      const sucursal = getSucursalFromRow(row);
      if (!isBranchMatch(sucursal, branches)) continue;
      
      const producto = readField(row, 'descripcion_art_serv') || 
                       readField(row, 'producto') || 
                       readField(row, 'descripcion') ||
                       readField(row, 'nombre') ||
                       'Sin nombre';
                       
      const contrib = toNumber(readField(row, 'contrib') || readField(row, 'rentabilidad') || readField(row, 'total'));
      totals.set(producto, (totals.get(producto) ?? 0) + contrib);
    }

    const data = Array.from(totals.entries())
      .map(([producto, rentabilidad]) => ({ producto, rentabilidad }))
      .sort((a, b) => b.rentabilidad - a.rentabilidad)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Cuentas por cobrar (top 20 por saldo pendiente)
router.get('/dashboard/cuentas-cobrar', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedureWithFallbacks(
      dbConfig,
      '_PvtDocXCobrar',
      [[start, end], [start], []],
      { limit }
    );
    const data = rows
      .map(row => ({
        cliente:
          toString(row.contacto) ||
          toString(row.nombreconvenio) ||
          toString(row.giro_comercial) ||
          toString(row.id_doc),
        sucursal: toString(row.sucursal),
        saldo: toNumber(row.saldo),
        dias: toNumber(row.dias_transc),
        documento: toString(row.n_doc),
      }))
      .filter(row => (branches.length ? isBranchMatch(row.sucursal, branches) : true))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Cuentas por pagar (top 20 por saldo pendiente)
router.get('/dashboard/cuentas-pagar', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtDocXPagar', [start, end], { limit });
    const data = rows
      .map(row => ({
        proveedor: toString(row.nombres_razon_social) || toString(row.id_persona),
        sucursal: toString(row.sucursal),
        saldo: toNumber(row.saldo),
        dias: toNumber(row.dias_transc),
        documento: toString(row.n_doc),
      }))
      .filter(row => (branches.length ? isBranchMatch(row.sucursal, branches) : true))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Resumen de cuentas por pagar agrupado por proveedor
router.get('/dashboard/cuentas-pagar/resumen-proveedor', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 4000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtDocXPagar', [start, end], { limit });
    const docs = normalizeCuentasPagarDocs(rows, end, branches);
    const totals = new Map<
      string,
      {
        proveedor: string;
        deuda_total: number;
        deuda_vencida: number;
        deuda_por_vencer: number;
        mayor_atraso_dias: number;
      }
    >();

    for (const doc of docs) {
      const current = totals.get(doc.proveedor) ?? {
        proveedor: doc.proveedor,
        deuda_total: 0,
        deuda_vencida: 0,
        deuda_por_vencer: 0,
        mayor_atraso_dias: 0,
      };
      current.deuda_total += doc.monto;
      if (doc.daysToDue < 0) {
        current.deuda_vencida += doc.monto;
        current.mayor_atraso_dias = Math.max(current.mayor_atraso_dias, doc.diasVencido);
      } else {
        current.deuda_por_vencer += doc.monto;
      }
      totals.set(doc.proveedor, current);
    }

    const data = Array.from(totals.values())
      .filter(row => Math.abs(row.deuda_total) > 0.0001)
      .sort(
        (a, b) =>
          b.mayor_atraso_dias - a.mayor_atraso_dias ||
          b.deuda_vencida - a.deuda_vencida ||
          b.deuda_total - a.deuda_total
      );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Proyección de flujo de caja de cuentas por pagar (semanal + mensual)
router.get('/dashboard/cuentas-pagar/flujo', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 4000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtDocXPagar', [start, end], { limit });
    const docs = normalizeCuentasPagarDocs(rows, end, branches);

    type Bucket = {
      proveedor: string;
      periodo: string;
      periodo_inicio: string;
      periodo_fin: string;
      monto_periodo: number;
      deuda_vencida_periodo: number;
      deuda_por_vencer_periodo: number;
      acumulado: number;
      mayor_atraso_dias: number;
      dias_para_vencer_min: number;
      __sortDate: Date;
    };

    const buildBuckets = (mode: 'semanal' | 'mensual'): Bucket[] => {
      const grouped = new Map<string, Bucket>();

      for (const doc of docs) {
        const baseDate = doc.fechaVenc ?? end;
        const periodStart = mode === 'semanal' ? startOfIsoWeek(baseDate) : new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        const periodEnd = mode === 'semanal' ? endOfIsoWeek(baseDate) : new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
        const periodLabel = mode === 'semanal' ? getIsoWeekLabel(baseDate) : getMonthLabel(baseDate);
        const key = `${doc.proveedor}::${periodLabel}`;
        const current = grouped.get(key) ?? {
          proveedor: doc.proveedor,
          periodo: periodLabel,
          periodo_inicio: toIsoDate(periodStart) ?? '',
          periodo_fin: toIsoDate(periodEnd) ?? '',
          monto_periodo: 0,
          deuda_vencida_periodo: 0,
          deuda_por_vencer_periodo: 0,
          acumulado: 0,
          mayor_atraso_dias: 0,
          dias_para_vencer_min: Number.POSITIVE_INFINITY,
          __sortDate: periodStart,
        };

        current.monto_periodo += doc.monto;
        if (doc.daysToDue < 0) {
          current.deuda_vencida_periodo += doc.monto;
          current.mayor_atraso_dias = Math.max(current.mayor_atraso_dias, doc.diasVencido);
        } else {
          current.deuda_por_vencer_periodo += doc.monto;
        }
        current.dias_para_vencer_min = Math.min(current.dias_para_vencer_min, doc.daysToDue);
        grouped.set(key, current);
      }

      const byProvider = new Map<string, Bucket[]>();
      for (const bucket of grouped.values()) {
        const list = byProvider.get(bucket.proveedor) ?? [];
        list.push(bucket);
        byProvider.set(bucket.proveedor, list);
      }

      const accumulatedRows: Bucket[] = [];
      for (const [proveedor, items] of byProvider.entries()) {
        const ordered = items.sort((a, b) => a.__sortDate.getTime() - b.__sortDate.getTime());
        let running = 0;
        for (const item of ordered) {
          running += item.monto_periodo;
          accumulatedRows.push({
            ...item,
            proveedor,
            acumulado: running,
            dias_para_vencer_min:
              item.dias_para_vencer_min === Number.POSITIVE_INFINITY ? 0 : item.dias_para_vencer_min,
          });
        }
      }

      return accumulatedRows.sort(
        (a, b) =>
          a.dias_para_vencer_min - b.dias_para_vencer_min ||
          b.mayor_atraso_dias - a.mayor_atraso_dias ||
          a.__sortDate.getTime() - b.__sortDate.getTime() ||
          a.proveedor.localeCompare(b.proveedor)
      );
    };

    const semanal = buildBuckets('semanal').map(({ __sortDate, ...row }) => row);
    const mensual = buildBuckets('mensual').map(({ __sortDate, ...row }) => row);

    res.json({
      success: true,
      data: {
        semanal,
        mensual,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Deudas vencidas agrupadas por proveedor
router.get('/dashboard/cuentas-pagar/vencidos-proveedor', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 4000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtDocXPagar', [start, end], { limit });
    const docs = normalizeCuentasPagarDocs(rows, end, branches).filter(doc => doc.daysToDue < 0);
    const grouped = new Map<
      string,
      {
        proveedor: string;
        deuda_vencida: number;
        mayor_atraso_dias: number;
        menor_fecha_venc: string | null;
        mayor_fecha_venc: string | null;
      }
    >();

    for (const doc of docs) {
      const current = grouped.get(doc.proveedor) ?? {
        proveedor: doc.proveedor,
        deuda_vencida: 0,
        mayor_atraso_dias: 0,
        menor_fecha_venc: null,
        mayor_fecha_venc: null,
      };
      current.deuda_vencida += doc.monto;
      current.mayor_atraso_dias = Math.max(current.mayor_atraso_dias, doc.diasVencido);
      if (doc.fechaVencIso) {
        if (!current.menor_fecha_venc || doc.fechaVencIso < current.menor_fecha_venc) {
          current.menor_fecha_venc = doc.fechaVencIso;
        }
        if (!current.mayor_fecha_venc || doc.fechaVencIso > current.mayor_fecha_venc) {
          current.mayor_fecha_venc = doc.fechaVencIso;
        }
      }
      grouped.set(doc.proveedor, current);
    }

    const data = Array.from(grouped.values())
      .filter(row => row.deuda_vencida > 0)
      .sort((a, b) => b.mayor_atraso_dias - a.mayor_atraso_dias || b.deuda_vencida - a.deuda_vencida);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Clientes morosos (>30 días de atraso con saldo positivo)
router.get('/dashboard/clientes-morosos', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedureWithFallbacks(
      dbConfig,
      '_PvtDocXCobrar',
      [[start, end], [start], []],
      { limit }
    );
    const data = rows
      .map(row => ({
        cliente:
          toString(row.contacto) ||
          toString(row.nombreconvenio) ||
          toString(row.giro_comercial) ||
          toString(row.id_doc),
        saldo: toNumber(row.saldo),
        dias: toNumber(row.dias_transc),
        sucursal: toString(row.sucursal),
      }))
      .filter(row => (branches.length ? isBranchMatch(row.sucursal, branches) : true))
      .filter(row => row.dias >= 30 && row.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Proyección de ventas del mes (ventas reales vs. proyectadas por día)
router.get('/dashboard/proyeccion-ventas-mes', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const rows = await runProcedureByNames(
      dbConfig,
      ['Graf VentasDiarias', 'GRAF_VENTASDIARIAS'],
      [[start, end], [start], []],
      { limit }
    );
    const year = end.getFullYear();
    const month = end.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const totals = new Map<number, number>();
    for (const row of rows) {
      const fecha = row.fecha instanceof Date ? row.fecha : new Date(String(row.fecha));
      if (Number.isNaN(fecha.getTime())) continue;
      if (fecha.getFullYear() !== year || fecha.getMonth() !== month) continue;
      const day = fecha.getDate();
      totals.set(day, (totals.get(day) ?? 0) + toNumber(row.total_dia));
    }

    const today = end.getDate();
    const sumSoFar = Array.from(totals.entries())
      .filter(([day]) => day <= today)
      .reduce((acc, [, value]) => acc + value, 0);
    const daysSoFar = Math.max(today, 1);
    const average = sumSoFar / daysSoFar;

    const data = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const ventas = totals.get(day) ?? 0;
      const proyeccion = day <= today ? ventas : average;
      return { dia: day, ventas, proyeccion };
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Proyección estimada de IVA para el mes actual
router.get('/dashboard/proyeccion-iva', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const rows = await runProcedureByNames(
      dbConfig,
      ['Graf VentasDiarias', 'GRAF_VENTASDIARIAS'],
      [[start, end], [start], []],
      { limit }
    );
    const year = end.getFullYear();
    const month = end.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let sumSoFar = 0;
    let daysSoFar = 0;

    for (const row of rows) {
      const fecha = row.fecha instanceof Date ? row.fecha : new Date(String(row.fecha));
      if (Number.isNaN(fecha.getTime())) continue;
      if (fecha.getFullYear() !== year || fecha.getMonth() !== month) continue;
      if (fecha.getDate() > end.getDate()) continue;
      sumSoFar += toNumber(row.total_dia);
      daysSoFar += 1;
    }

    const average = sumSoFar / Math.max(daysSoFar, 1);
    const projectedTotal = sumSoFar + average * (daysInMonth - daysSoFar);
    const ivaEstimado = projectedTotal * 0.19;

    res.json({
      success: true,
      data: [{ total_estimado: projectedTotal, iva_estimado: ivaEstimado }],
    });
  } catch (error) {
    next(error);
  }
});

// Registro de eventos de venta recientes (últimas 50 transacciones)
router.get('/dashboard/registro-eventos', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, 'zResumenVentas', [start, end], { limit });
    const data = rows
      .map(row => ({
        fecha: row.fecha,
        sucursal: toString(row.descripcion_sucursal),
        documento: toString(row.n_documento),
        total: toNumber(row.total),
        medio_pago: toString(row.descripcion_medio_de_pago),
      }))
      .filter(row => isBranchMatch(row.sucursal, branches))
      .slice(0, 50);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Ranking de consumo de materias primas (top 20)
router.get('/dashboard/consumo-materias-primas', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await getRotacionRows(dbConfig, start, limit);
    const totals = new Map<string, number>();

    for (const row of rows) {
      const sucursal = toString(row.descripcion_sucursal) || 'N/A';
      if (!isBranchMatch(sucursal, branches)) continue;
      const producto = toString(row.descripcion_art_serv);
      const cantidad = toNumber(row.cantidad);
      totals.set(producto, (totals.get(producto) ?? 0) + cantidad);
    }

    const data = Array.from(totals.entries())
      .map(([producto, consumo]) => ({ producto, consumo }))
      .sort((a, b) => b.consumo - a.consumo)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Productos bajo el nivel mínimo de stock (riesgo de quiebre)
router.get('/dashboard/productos-quiebre-stock', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 1500);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtStock', [end], { limit });
    const data = rows
      .map(row => ({
        producto: toString(row.descripcion_art_serv),
        sucursal: toString(row.bodega_local),
        stock: toNumber(row.stock_actual),
        stock_min: toNumber(row.stock_min),
      }))
      .filter(row => isBranchMatch(row.sucursal, branches))
      .filter(row => row.stock <= row.stock_min)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Productos que necesitan reposición (cantidades a reponer)
router.get('/dashboard/tiempo-reposicion', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 1500);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtStock', [end], { limit });
    const data = rows
      .map(row => ({
        producto: toString(row.descripcion_art_serv),
        sucursal: toString(row.bodega_local),
        stock_reposicion: toNumber(row.stock_reposicion),
        cajas_reposicion: toNumber(row.cajas_reposicion),
      }))
      .filter(row => isBranchMatch(row.sucursal, branches))
      .sort((a, b) => b.stock_reposicion - a.stock_reposicion)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Análisis mensual de ventas por sucursal (procedimiento Graf_VtaMes_Suc)
router.get('/dashboard/analisis-ventas-mensual', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const ano = parseNumber(toString(req.query.ano), new Date().getFullYear());
    const mes = parseNumber(toString(req.query.mes), new Date().getMonth() + 1);

    console.log(`[dashboard] analisis-ventas-mensual: ano=${ano}, mes=${mes}`);

    let rows: NormalizedRow[] = [];
    try {
      rows = await runProcedureByNames(
        dbConfig,
        ['Graf_VtaMes_Suc', 'GRAF_VTA_MES_SUC', 'GRAF_VTAMES_SUC'],
        [[ano, mes]]
      );
    } catch (error) {
      if (isMissingProcedureError(error)) {
        res.json({
          success: true,
          data: {
            ano,
            mes,
            series: [],
          },
          warning: 'No existe SP Graf_VtaMes_Suc en esta base de datos',
        });
        return;
      }
      throw error;
    }

    const hoy = new Date();
    const esMesActual = ano === hoy.getFullYear() && mes === (hoy.getMonth() + 1);
    const diaActual = hoy.getDate();
    const seriesMap = new Map<number, any[]>();
    rows.forEach(row => {
      const idSucursal = toNumber(
        row['IdSucursal'] ||
        row['IDSUCURSAL'] ||
        row['idSucursal'] ||
        row['Id# Sucursal'] ||
        row['ID# SUCURSAL'] ||
        row['id# sucursal']
      );
      const dia = toNumber(row['Día'] || row['DIA'] || row['dia']);
      // Filtrar días futuros SIEMPRE (no solo si es mes actual)
      if (
        (ano > hoy.getFullYear()) ||
        (ano === hoy.getFullYear() && mes > (hoy.getMonth() + 1)) ||
        (ano === hoy.getFullYear() && mes === (hoy.getMonth() + 1) && dia > diaActual)
      ) return;
      const monto = toNumber(row['Monto'] || row['MONTO'] || row['monto']) / 1000000;
      if (!seriesMap.has(idSucursal)) {
        seriesMap.set(idSucursal, []);
      }
      seriesMap.get(idSucursal)!.push({
        dia,
        monto: Math.round(monto * 100) / 100,
      });
    });

    const series = Array.from(seriesMap.entries()).map(([idSucursal, datos]) => {
      let nombre = '';
      let categoria = 'ventas';
      if (idSucursal === -3) {
        nombre = 'Proyección Venta Mes';
        categoria = 'proyecciones';
      } else if (idSucursal === -2) {
        nombre = 'Media';
        categoria = 'resumenes';
      } else if (idSucursal === -1) {
        nombre = 'Promedio Total Diario';
        categoria = 'ventas';
      } else {
        nombre = toString(rows.find(r => 
          toNumber(r.IdSucursal || r.IDSUCURSAL || r.idSucursal) === idSucursal
        )?.NombreSucursal || rows.find(r => 
          toNumber(r.IdSucursal || r.IDSUCURSAL || r.idSucursal) === idSucursal
        )?.NOMBRESUCURSAL || `Sucursal ${idSucursal}`);
        categoria = 'ventas';
      }
      return {
        idSucursal,
        nombre,
        categoria,
        datos,
      };
    });

    console.log(`[dashboard] analisis-ventas-mensual: ${series.length} series encontradas`);

    res.json({
      success: true,
      data: {
        ano,
        mes,
        series,
      },
    });
  } catch (error) {
    console.error('[dashboard] error in analisis-ventas-mensual:', error);
    next(error);
  }
});

// Endpoint alternativo para compatibilidad con el frontend (filas crudas de Graf_VtaMes_Suc)
router.get('/dashboard/graf-vta-mes-suc', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const ano = parseNumber(toString(req.query.ano), new Date().getFullYear());
    const mes = parseNumber(toString(req.query.mes), new Date().getMonth() + 1);

    console.log(`[dashboard] graf-vta-mes-suc: ano=${ano}, mes=${mes}`);

    let rows: NormalizedRow[] = [];
    try {
      rows = await runProcedureByNames(
        dbConfig,
        ['Graf_VtaMes_Suc', 'GRAF_VTA_MES_SUC', 'GRAF_VTAMES_SUC'],
        [[ano, mes]]
      );
    } catch (error) {
      if (isMissingProcedureError(error)) {
        res.json({
          success: true,
          data: [],
          warning: 'No existe SP Graf_VtaMes_Suc en esta base de datos',
        });
        return;
      }
      throw error;
    }

    console.log(`[dashboard] graf-vta-mes-suc: ${rows.length} filas obtenidas`);
    
    // Filtrar días futuros si es el mes/año actual
    const hoy = new Date();
    const diaActual = hoy.getDate();
    const mesActual = hoy.getMonth() + 1;
    const anoActual = hoy.getFullYear();

    const filteredRows = rows.filter((row: any) => {
      const diaStr = row["Día"] || row["Dia"] || row["DIA"] || row["dia"] || 0;
      const dia = Number(diaStr);
      if (
        (ano > anoActual) ||
        (ano === anoActual && mes > mesActual) ||
        (ano === anoActual && mes === mesActual && dia > diaActual)
      ) return false;
      return true;
    });

    res.json({
      success: true,
      data: filteredRows,
    });
  } catch (error) {
    console.error('[dashboard] error in graf-vta-mes-suc:', error);
    next(error);
  }
});

// Tabla de ventas anuales desde _ProyVentaAnual (con fallback si no existe el SP)
router.get('/dashboard/ventas-anuales-tabla', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const cantAnos = parseNumber(toString(req.query.cantAnos), 3);

    console.log(`[dashboard] ventas-anuales-tabla: cantAnos=${cantAnos}`);

    try {
      const normalizedRows = await getProyVentaAnualRows(dbConfig, cantAnos);

      console.log(`[dashboard] ventas-anuales-tabla: ${normalizedRows.length} filas encontradas`);

      res.json({
        success: true,
        data: normalizedRows,
      });
    } catch (procError) {
      console.warn('[dashboard] ventas-anuales-tabla: procedimiento almacenado no encontrado, retornando datos vacíos');

      res.json({
        success: true,
        data: [],
      });
    }
  } catch (error) {
    console.error('[dashboard] error in ventas-anuales-tabla:', error);
    next(error);
  }
});

// Proyección de ventas anual multi-año (_ProyVentaAnual con años configurables)
router.get('/dashboard/proy-venta-anual', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const pCantAños = parseNumber(String(req.query.pCantAños ?? '5'), 5);
    const rows = await getProyVentaAnualRows(dbConfig, pCantAños);
    const filteredRows = rows.filter(r => r && r.sucursal && r.ano !== undefined && r.mes !== undefined && r.total !== undefined);
    res.json({
      success: true,
      data: filteredRows,
    });
  } catch (error) {
    console.error('[dashboard] error in proy-venta-anual:', error);
    next(error);
  }
});

// Ventas acumuladas del dia en tiempo real (requiere SP en BD cliente)
router.get('/dashboard/ventas-tiempo-real', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayIso = now.toISOString().slice(0, 10);
    const branches = parseSucursalList(req.query.sucursal).map(normalizeBranch);

    const limit = parseLimit(req.query.limit, 300);
    let warning: string | undefined;

    const sucursalNameById = new Map<string, string>();
    try {
      const sucursalRows = await query<Record<string, unknown>>(
        'SELECT * FROM "eSucursales"',
        [],
        dbConfig
      );
      sucursalRows.forEach(row => {
        const normalized = normalizeRow(row);
        const id =
          toString(normalized.id_sucursal) ||
          toString(normalized.idsucursal) ||
          toString(normalized.id) ||
          toString(normalized.codigo) ||
          toString(normalized.cod_sucursal);
        const name = getSucursalFromRow(normalized);
        if (id && name) {
          sucursalNameById.set(normalizeBranch(id), name);
        }
      });
    } catch {
      // Ignore lookup failures; filtering will fall back to raw values.
    }

    let rows: NormalizedRow[] = [];
    try {
      console.log('[ventas-tiempo-real][DEBUG] Llamando _Web_VtaAlMin con:', {
        dbConfig,
        params: [startOfDay],
        limit,
        startOfDay
      });
      rows = await runProcedure(
        dbConfig,
        '_Web_VtaAlMin',
        [startOfDay],
        { limit },
      );
    } catch (error) {
      console.error('[ventas-tiempo-real] ERROR AL EJECUTAR SP:', error);
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('procedure unknown') || message.includes('procedure not found')) {
        warning = 'No existe _Web_VtaAlMin en esta base de datos';
      } else {
        // Enviar error detallado para ver en logs
        return res.status(500).json({ success: false, error: String(error), sql: '_Web_VtaAlMin' });
      }
    }


    // LOG DETALLADO PARA DEBUG
    console.log('[ventas-tiempo-real] branches filtro:', branches);
    console.log('[ventas-tiempo-real] Total filas crudas del SP:', rows.length);
    if (rows.length > 0) {
      console.log('[ventas-tiempo-real] Primera fila cruda:', rows[0]);
    }


    const branchesLower = branches.map(b => b.toLowerCase().trim());


    // Adaptación: buscar el primer campo de tipo fecha/hora si los nombres estándar no existen
    const getFechaFromRow = (row) => {
      let rawFecha =
        row.fecha_hora ??
        row.fechahora ??
        row.fecha ??
        row.fec_hora ??
        row.hora;
      if (!rawFecha) {
        // Buscar el primer campo tipo Date o string parseable a fecha
        for (const key of Object.keys(row)) {
          const val = row[key];
          if (val instanceof Date && !Number.isNaN(val.getTime())) {
            rawFecha = val;
            break;
          }
          if (typeof val === 'string') {
            const d = new Date(val);
            if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) {
              rawFecha = d;
              break;
            }
          }
        }
      }
      return rawFecha instanceof Date
        ? rawFecha
        : rawFecha
        ? new Date(String(rawFecha))
        : null;
    };

    const data = rows
      .map(row => {
        const sucursalRaw = getSucursalFromRow(row);
        if (!isBranchMatch(sucursalRaw, branchesLower)) {
          return null;
        }
        const sucursal = normalizeBranch(sucursalRaw);

        const fecha = getFechaFromRow(row);
        if (!fecha || Number.isNaN(fecha.getTime())) {
          return null;
        }
        if (fecha.getTime() > now.getTime()) {
          return null;
        }

        const montoHora = toNumber(row.monto_hora ?? row.montohora ?? row.venta_hora ?? row.ventahora ?? 0);
        const totalAcumulado = toNumber(row.total_acumulado ?? row.totalacumulado ?? 0);

        return {
          fechaHora: fecha.toISOString(),
          montoHora,
          totalAcumulado,
          sucursal,
        };
      })
      .filter((item): item is { fechaHora: string; montoHora: number; totalAcumulado: number; sucursal: string } => Boolean(item))
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));

    // Si hay múltiples sucursales en los resultados, AGREGAR por hora para el gráfico total
    const aggregatedDataMap = new Map<string, { fechaHora: string; montoHora: number; totalAcumulado: number }>();
    data.forEach(item => {
      const existing = aggregatedDataMap.get(item.fechaHora);
      if (existing) {
        existing.montoHora += item.montoHora;
        existing.totalAcumulado += item.totalAcumulado;
      } else {
        aggregatedDataMap.set(item.fechaHora, { 
          fechaHora: item.fechaHora, 
          montoHora: item.montoHora, 
          totalAcumulado: item.totalAcumulado 
        });
      }
    });

    const finalData = Array.from(aggregatedDataMap.values())
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));

    // Inyectar el punto de "Ahora" para que el usuario vea la hora exacta de la actualización
    if (finalData.length > 0) {
      const last = finalData[finalData.length - 1];
      const lastTime = new Date(last.fechaHora).getTime();
      const nowTime = now.getTime();
      
      // Si el último dato es la misma hora (truncada), lo movemos a "ahora"
      // Si ya pasó más de una hora, añadimos uno nuevo.
      if (nowTime - lastTime < 3600000) {
        last.fechaHora = now.toISOString();
      } else {
        finalData.push({
          fechaHora: now.toISOString(),
          montoHora: 0,
          totalAcumulado: last.totalAcumulado
        });
      }
    }

    console.log('[ventas-tiempo-real] data final enviada:', finalData.length, 'filas');
    if (data.length > 0) {
      console.log('[ventas-tiempo-real] Primera fila mapeada:', data[0]);
    }

    const getVentaFecha = (row: NormalizedRow): Date | null =>
      parseUnknownDate(row.fecha_hora) ??
      parseUnknownDate(row.fechahora) ??
      parseUnknownDate(row.fecha) ??
      parseUnknownDate(row.fec_hora) ??
      parseUnknownDate(row.fechadoc) ??
      parseUnknownDate(row.fecha_doc) ??
      null;

    const getTicketKey = (row: NormalizedRow, fecha: Date, index: number): string => {
      const sucursal = normalizeBranch(getSucursalFromRow(row) || 'N/A');
      const documento =
        toString(row.n_documento) ||
        toString(row.documento) ||
        toString(row.nro_documento) ||
        toString(row.numero_documento) ||
        toString(row.id_doc) ||
        toString(row.id_documento) ||
        toString(row.id_venta) ||
        `${fecha.toISOString()}-${index}`;
      return `${sucursal}::${documento}`;
    };

    let totalVentasDia = 0;
    let totalVentasMes = 0;
    let primeraVentaDia: Date | null = null;
    const ticketsDia = new Set<string>();
    const ticketsMes = new Set<string>();

    try {
      const ventasMesRows = await runProcedure(dbConfig, 'zResumenVentas', [startOfMonth, now], {
        limit: 20000,
      });

      ventasMesRows.forEach((row, index) => {
        const sucursalRaw = getSucursalFromRow(row);
        if (!isBranchMatch(sucursalRaw, branches)) return;

        const fechaVenta = getVentaFecha(row);
        if (!fechaVenta || Number.isNaN(fechaVenta.getTime()) || fechaVenta.getTime() > now.getTime()) return;

        const ticketKey = getTicketKey(row, fechaVenta, index);
        const totalVenta = getTotalFromRow(row);
        const fechaIso = fechaVenta.toISOString().slice(0, 10);

        totalVentasMes += totalVenta;
        ticketsMes.add(ticketKey);

        if (fechaIso === todayIso) {
          totalVentasDia += totalVenta;
          ticketsDia.add(ticketKey);
          if (!primeraVentaDia || (fechaVenta as Date).getTime() < (primeraVentaDia as Date).getTime()) {
            primeraVentaDia = fechaVenta;
          }
        }
      });
    } catch {
      warning = warning ?? 'No se pudo calcular KPIs desde zResumenVentas';
    }

    const cantidadTicketsDia = ticketsDia.size;
    const cantidadTicketsMes = ticketsMes.size;
    const diasTranscurridosMes = Math.max(1, now.getDate());

    const ticketPromedioDiario =
      cantidadTicketsDia > 0 ? totalVentasDia / cantidadTicketsDia : 0;
    const ticketPromedioMensual =
      cantidadTicketsMes > 0 ? totalVentasMes / cantidadTicketsMes : 0;
    const promedioTicketsDiarioMes = cantidadTicketsMes / diasTranscurridosMes;

    const minutosDesdePrimeraVenta =
      primeraVentaDia !== null
        ? Math.max(0, (now.getTime() - (primeraVentaDia as Date).getTime()) / 60000)
        : null;

    const frecuenciaVentaMinutos =
      minutosDesdePrimeraVenta !== null && cantidadTicketsDia > 0
        ? minutosDesdePrimeraVenta / cantidadTicketsDia
        : null;

    const ultimo = finalData[finalData.length - 1];

    res.json({
      success: true,
      data: finalData,
      meta: {
        fecha: now.toISOString().slice(0, 10),
        ultimoTotal: ultimo?.totalAcumulado ?? 0,
        ultimaActualizacion: ultimo?.fechaHora ?? null,
        kpis: {
          ticketPromedioDiario,
          ticketPromedioMensual,
          cantidadTicketsDia,
          cantidadTicketsMes,
          promedioTicketsDiarioMes,
          frecuenciaVentaMinutos,
          minutosDesdePrimeraVenta,
          primeraVentaDia: primeraVentaDia ? (primeraVentaDia as Date).toISOString() : null,
          diasTranscurridosMes,
        },
      },
      warning,
    });
  } catch (error) {
    next(error);
  }
});

// Resumen por tipo de documento para el F29 (Impuestos)
router.get('/dashboard/impuestos-f29', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { end } = getDateRange(req.query as Record<string, unknown>);
    const ano = parseNumber(toString(req.query.ano), end.getFullYear());
    const mes = parseNumber(toString(req.query.mes), end.getMonth() + 1);

    const rows = await runProcedure(dbConfig, '_F29a', [ano, mes]);
    console.log(`[impuestos-f29] ${rows.length} rows found for ${ano}-${mes} using _F29a`);
    if (rows.length > 0) console.log('[impuestos-f29] First row keys:', Object.keys(rows[0]));
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// Cálculo detallado del F29 (Resumen General)
router.get('/dashboard/f29-calcular', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { end } = getDateRange(req.query as Record<string, unknown>);
    const ano = parseNumber(toString(req.query.ano), end.getFullYear());
    const mes = parseNumber(toString(req.query.mes), end.getMonth() + 1);

    const rows = await runProcedure(dbConfig, 'spF29Calcular', [ano, mes], { forceQuote: true, readWrite: true });
    console.log(`[f29-calcular] ${rows.length} rows found for ${ano}-${mes}`);
    
    // El SP devuelve una sola fila con los totales
    res.json({ success: true, data: rows[0] || {} });
  } catch (error) {
    next(error);
  }
});

export default router;
