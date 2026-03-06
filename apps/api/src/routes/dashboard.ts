/**
 * dashboard.ts — Main dashboard API router.
 *
 * Exposes ~20 endpoints that power the Duocom mobile dashboard,
 * covering sales, inventory, finance (accounts payable / receivable),
 * and projection data.  Every endpoint reads from Firebird stored
 * procedures through the shared helpers in ../helpers/db-helpers.
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
  uniqueList,
  parseSucursalList,
  parseLimit,
  normalizeBranch,
  parseNumber,
  type NormalizedRow,
} from '../helpers/db-helpers';

const router = Router();

/* ═══════════════════════════════════════════
   Local types & helpers (specific to dashboard)
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
      if (branches.length && !branches.includes(sucursal)) return null;

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

const getIsoWeekLabel = (date: Date): string => {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNr + 3);
  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

const getMonthLabel = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/* ═══════════════════════════════════════════
   Routes
═══════════════════════════════════════════ */

// List all branches (sucursales) available in the database
router.get('/sucursales', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const rows = await query<Record<string, unknown>>(
      'SELECT * FROM "eSucursales"',
      [],
      dbConfig
    );
    const normalizedRows = rows.map(normalizeRow);
    console.log('[dashboard] sucursales rows', rows.length);
    const branches = uniqueList(
      normalizedRows.map(row => normalizeBranch(getSucursalFromRow(row)))
    );
    res.json({
      success: true,
      data: branches.map(value => ({ id: value, nombre: value })),
    });
  } catch (error) {
    next(error);
  }
});

// Hourly customer traffic per branch
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
      if (branches.length && !branches.includes(sucursal)) continue;
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

// Sales breakdown by payment method
router.get('/dashboard/ventas-medio-pago', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtVentaHoraria', [start, end], { limit });
    const totals = new Map<string, number>();

    for (const row of rows) {
      const sucursal = toString(row.sucursal) || 'N/A';
      if (branches.length && !branches.includes(sucursal)) continue;
      const medioPago = toString(row.medio_de_pago) || 'Otros';
      const monto = toNumber(row.t_bruto) || toNumber(row.total);
      const key = `${sucursal}::${medioPago}`;
      totals.set(key, (totals.get(key) ?? 0) + monto);
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

// Sales grouped by product group / category
router.get('/dashboard/ventas-por-grupo', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const rows = await runProcedureByNames(
      dbConfig,
      ['SQL_TopNVentasPorGrupo', 'X_RetProdsXGrupo'],
      [[start, end], [start], []],
      { limit: 5000 }
    );

    const totals = new Map<string, number>();
    for (const row of rows) {
      const group =
        toString(
          row.grupo ||
            row.nombre_grupo ||
            row.descripcion_grupo ||
            row.grupo_desc ||
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

    const data = Array.from(totals.entries())
      .map(([grupo, total]) => ({ grupo, total }))
      .sort((a, b) => b.total - a.total);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Annual sales totals per branch (multi-year)
router.get('/dashboard/ventas-anuales', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const years = Number.parseInt(String(req.query.years ?? '3'), 10);
    const branches = parseSucursalList(req.query.sucursal).map(normalizeBranch);
    const rows = await runProcedure(
      dbConfig,
      '_ProyVentaAnual',
      [Number.isFinite(years) ? years : 3]
    );
    const totals = new Map<string, number>();


    for (const row of rows) {
      const anio = toNumber(row.ano);
      const sucursal = getSucursalFromRow(row);
      if (branches.length && !branches.includes(normalizeBranch(sucursal))) continue;
      const total = getTotalFromRow(row);
      const key = `${sucursal}::${anio}`;
      totals.set(key, (totals.get(key) ?? 0) + total);
    }

    const data = Array.from(totals.entries())
      .map(([key, total]) => {
        const [sucursal, anioRaw] = key.split('::');
        return { sucursal, anio: Number(anioRaw), total };
      })
      .sort((a, b) => a.anio - b.anio);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Daily sales summary within a date range (monthly view)
router.get('/dashboard/resumen-mensual-ventas', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedureWithFallbacks(
      dbConfig,
      'Graf VentasDiarias',
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

// Monthly totals for a specific year (annual overview)
router.get('/dashboard/resumen-anual-ventas', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { end } = getDateRange(req.query as Record<string, unknown>);
    const year = Number.parseInt(String(req.query.anio ?? end.getFullYear()), 10);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_ProyVentaAnual', [5]);
    const totals = new Map<string, number>();


    for (const row of rows) {
      const anio = toNumber(row.ano);
      if (anio !== year) continue;
      const sucursal = getSucursalFromRow(row);
      if (branches.length && !branches.includes(sucursal)) continue;
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

// Per-transaction sales feed (minute-level detail)
router.get('/dashboard/venta-minuto', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, 'zResumenVentas', [start, end], { limit });
    const data = rows.map(row => ({
      fecha: row.fecha,
      sucursal: toString(row.descripcion_sucursal),
      total: toNumber(row.total),
      saldo: toNumber(row.saldo),
      documento: toString(row.n_documento),
      medio_pago: toString(row.descripcion_medio_de_pago),
    })).filter(row => (branches.length ? branches.includes(row.sucursal) : true));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Valued inventory (top 20 products by stock value)
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
      .filter(row => (branches.length ? branches.includes(row.sucursal) : true))
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

// Product rotation / turnover ranking (top 20)
router.get('/dashboard/productos-rotacion', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtRotaci\u00f3n', [start], { limit });
    const totals = new Map<string, number>();

    for (const row of rows) {
      const sucursal = toString(row.descripcion_sucursal) || 'N/A';
      if (branches.length && !branches.includes(sucursal)) continue;
      const producto = toString(row.descripcion_art_serv);
      const cantidad = toNumber(row.cantidad);
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

// Product profitability ranking (top 20 by contribution)
router.get('/dashboard/rentabilidad-productos', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtRotaci\u00f3n', [start], { limit });
    const totals = new Map<string, number>();

    for (const row of rows) {
      const sucursal = toString(row.descripcion_sucursal) || 'N/A';
      if (branches.length && !branches.includes(sucursal)) continue;
      const producto = toString(row.descripcion_art_serv);
      const contrib = toNumber(row.contrib);
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

// Accounts receivable (top 20 by outstanding balance)
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
      .filter(row => (branches.length ? branches.includes(row.sucursal) : true))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Accounts payable (top 20 by outstanding balance)
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
      .filter(row => (branches.length ? branches.includes(row.sucursal) : true))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Accounts payable summary grouped by supplier
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

// Accounts payable cash-flow forecast (weekly + monthly buckets)
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

// Overdue payables grouped by supplier
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

// Delinquent customers (>30 days overdue with positive balance)
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
      .filter(row => (branches.length ? branches.includes(row.sucursal) : true))
      .filter(row => row.dias >= 30 && row.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Month-to-date sales projection (daily actual vs. projected)
router.get('/dashboard/proyeccion-ventas-mes', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const rows = await runProcedureWithFallbacks(
      dbConfig,
      'Graf VentasDiarias',
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

// Estimated VAT (IVA) projection for the current month
router.get('/dashboard/proyeccion-iva', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start, end } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 3000);
    const rows = await runProcedureWithFallbacks(
      dbConfig,
      'Graf VentasDiarias',
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

// Recent sales event log (last 50 transactions)
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
      .filter(row => (branches.length ? branches.includes(row.sucursal) : true))
      .slice(0, 50);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Raw-material consumption ranking (top 20)
router.get('/dashboard/consumo-materias-primas', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const { start } = getDateRange(req.query as Record<string, unknown>);
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(dbConfig, '_PvtRotaci\u00f3n', [start], { limit });
    const totals = new Map<string, number>();

    for (const row of rows) {
      const sucursal = toString(row.descripcion_sucursal) || 'N/A';
      if (branches.length && !branches.includes(sucursal)) continue;
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

// Products below minimum stock level (stock-out risk)
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
      .filter(row => (branches.length ? branches.includes(row.sucursal) : true))
      .filter(row => row.stock <= row.stock_min)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Products needing replenishment (reposition quantities)
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
      .filter(row => (branches.length ? branches.includes(row.sucursal) : true))
      .sort((a, b) => b.stock_reposicion - a.stock_reposicion)
      .slice(0, 20);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Monthly sales analysis by branch (Graf_VtaMes_Suc stored procedure)
router.get('/dashboard/analisis-ventas-mensual', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const ano = parseNumber(toString(req.query.ano), new Date().getFullYear());
    const mes = parseNumber(toString(req.query.mes), new Date().getMonth() + 1);

    console.log(`[dashboard] analisis-ventas-mensual: ano=${ano}, mes=${mes}`);

    const sql = 'SELECT * FROM "Graf_VtaMes_Suc"(?, ?)';
    const rows = await query<Record<string, unknown>>(sql, [ano, mes], dbConfig);

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

    console.log(`[dashboard] analisis-ventas-mensual: ${series.length} series found`);

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

// Alternative endpoint for frontend compatibility (raw Graf_VtaMes_Suc rows)
router.get('/dashboard/graf-vta-mes-suc', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const ano = parseNumber(toString(req.query.ano), new Date().getFullYear());
    const mes = parseNumber(toString(req.query.mes), new Date().getMonth() + 1);

    console.log(`[dashboard] graf-vta-mes-suc: ano=${ano}, mes=${mes}`);

    const sql = 'SELECT * FROM "Graf_VtaMes_Suc"(?, ?)';
    const rows = await query<Record<string, unknown>>(sql, [ano, mes], dbConfig);

    console.log(`[dashboard] graf-vta-mes-suc: retrieved ${rows.length} rows`);
    if (rows.length > 0) {
      console.log('[dashboard] graf-vta-mes-suc sample row:', JSON.stringify(rows[0], null, 2));
    }

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error('[dashboard] error in graf-vta-mes-suc:', error);
    next(error);
  }
});

// Annual sales table from _ProyVentaAnual (with SP-missing fallback)
router.get('/dashboard/ventas-anuales-tabla', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const cantAnos = parseNumber(toString(req.query.cantAnos), 3);

    console.log(`[dashboard] ventas-anuales-tabla: cantAnos=${cantAnos}`);

    try {
      const sql = 'SELECT * FROM "_ProyVentaAnual"(?)';
      const rows = await query<Record<string, unknown>>(sql, [cantAnos], dbConfig);

      const normalizedRows = rows.map(normalizeRow);

      console.log(`[dashboard] ventas-anuales-tabla: ${normalizedRows.length} rows found`);

      res.json({
        success: true,
        data: normalizedRows,
      });
    } catch (procError) {
      console.warn('[dashboard] ventas-anuales-tabla: stored procedure not found, returning empty data');

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

// Multi-year annual sales projection (_ProyVentaAnual with configurable years)
router.get('/dashboard/proy-venta-anual', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const pCantAños = parseNumber(String(req.query.pCantAños ?? '5'), 5);
    const rows = await runProcedure(dbConfig, '_ProyVentaAnual', [pCantAños]);
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

export default router;
