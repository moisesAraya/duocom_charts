import { Router, type Request } from 'express';
import { query, type FirebirdConnectionConfig } from '../db/firebird';

const router = Router();

type NormalizedRow = Record<string, unknown>;

const normalizeKey = (key: string): string =>
  key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const normalizeRow = (row: Record<string, unknown>): NormalizedRow => {
  const normalized: NormalizedRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = value;
  }
  return normalized;
};

const getDbConfig = (req: Request): FirebirdConnectionConfig => {
  if (!req.dbConfig) {
    throw new Error('Missing database configuration');
  }
  return req.dbConfig;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const toString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const parseDateParam = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const getDateRange = (queryParams: Record<string, unknown>): { start: Date; end: Date } => {
  const now = new Date();
  const end =
    parseDateParam(queryParams.hasta) ??
    parseDateParam(queryParams.to) ??
    parseDateParam(queryParams.end) ??
    now;
  const start =
    parseDateParam(queryParams.desde) ??
    parseDateParam(queryParams.from) ??
    parseDateParam(queryParams.start) ??
    new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30);

  return { start, end };
};

const buildProcedureSql = (
  name: string,
  params: unknown[],
  limit?: number
): string => {
  if (!params.length) {
    return `SELECT ${limit ? `FIRST ${limit} ` : ''}* FROM "${name}"`;
  }
  const placeholders = params.map(() => '?').join(', ');
  return `SELECT ${limit ? `FIRST ${limit} ` : ''}* FROM "${name}"(${placeholders})`;
};

const runProcedure = async (
  dbConfig: FirebirdConnectionConfig,
  name: string,
  params: unknown[] = [],
  options?: { limit?: number }
): Promise<NormalizedRow[]> => {
  const sql = buildProcedureSql(name, params, options?.limit);
  const rows = await query<Record<string, unknown>>(sql, params, dbConfig);
  return rows.map(normalizeRow);
};

const runProcedureWithFallbacks = async (
  dbConfig: FirebirdConnectionConfig,
  name: string,
  paramSets: unknown[][],
  options?: { limit?: number }
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

const runProcedureByNames = async (
  dbConfig: FirebirdConnectionConfig,
  names: string[],
  paramSets: unknown[][],
  options?: { limit?: number }
): Promise<NormalizedRow[]> => {
  let lastError: unknown;

  for (const name of names) {
    try {
      return await runProcedureWithFallbacks(dbConfig, name, paramSets, options);
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError;
};

const uniqueList = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const parseSucursalList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap(item => String(item).split(',').map(v => v.trim())).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
};

const parseLimit = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 50), 5000);
};

router.get('/sucursales', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const rows = await runProcedure(dbConfig, 'zSucursales');
    const uniqueList = (arr: unknown[]) =>
      arr.filter((item, index) => arr.indexOf(item) === index);
    const branches = uniqueList(rows.map(row => toString(row.sucursal)));
    res.json({
      success: true,
      data: branches.map(value => ({ id: value, nombre: value })),
    });
  } catch (error) {
    next(error);
  }
});

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

router.get('/dashboard/ventas-anuales', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const years = Number.parseInt(String(req.query.years ?? '3'), 10);
    const branches = parseSucursalList(req.query.sucursal);
    const rows = await runProcedure(
      dbConfig,
      '_ProyVentaAnual',
      [Number.isFinite(years) ? years : 3]
    );
    const totals = new Map<string, number>();

    for (const row of rows) {
      const anio = toNumber(row.ano);
      const sucursal = toString(row.sucursal) || 'N/A';
      if (branches.length && !branches.includes(sucursal)) continue;
      // Ajustar a millones (M$)
      const total = toNumber(row.total) / 1_000_000;
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

// Endpoint para el gráfico de Análisis Ventas Mensual
router.get('/dashboard/graf-vta-mes-suc', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const ano = Number.parseInt(String(req.query.ano ?? new Date().getFullYear()), 10);
    // El mes debe tomarse tal cual del query, sin sumar ni restar 1
    const mes = Number.parseInt(String(req.query.mes ?? (new Date().getMonth() + 1)), 10);
    // El SP espera año y mes como parámetros
    const rows = await runProcedure(dbConfig, 'Graf_VtaMes_Suc', [ano, mes]);
    // Normalizar nombres de campos para el frontend
    const data = rows.map(row => ({
      IdSucusal: row.idsucusal ?? row.id_sucursal ?? row.idsucursal ?? 0,
      Sucursal: toString(row.sucursal ?? row.nombre_sucursal ?? row.suc ?? ''),
      Día: row.dia ?? row.día ?? row.dia_mes ?? row.dia_del_mes ?? 0,
      Total: toNumber(row.total ?? row.total_dia ?? row.venta ?? 0)
    }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

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
        const sucursal = toString(row.sucursal) || 'N/A';
        return branches.length ? branches.includes(sucursal) : true;
      })
      .map(row => ({
        fecha: row.fecha,
        sucursal: toString(row.sucursal),
        total: toNumber(row.total_dia),
        documentos: toNumber(row.cant_docs),
      }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

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
      const sucursal = toString(row.sucursal) || 'N/A';
      if (branches.length && !branches.includes(sucursal)) continue;
      const mes = toNumber(row.mes);
      const total = toNumber(row.total);
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

router.get('/dashboard/inventario-valorizado', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [
        { producto: 'Producto A', sucursal: 'Sucursal 1', stock: 100, total_venta: 10000, stock_min: 50, stock_max: 200 },
        { producto: 'Producto B', sucursal: 'Sucursal 1', stock: 150, total_venta: 15000, stock_min: 75, stock_max: 300 },
        { producto: 'Producto A', sucursal: 'Sucursal 2', stock: 80, total_venta: 8000, stock_min: 40, stock_max: 160 },
        { producto: 'Producto C', sucursal: 'Sucursal 2', stock: 120, total_venta: 12000, stock_min: 60, stock_max: 240 },
        { producto: 'Producto B', sucursal: 'Sucursal 3', stock: 90, total_venta: 9000, stock_min: 45, stock_max: 180 },
        { producto: 'Producto D', sucursal: 'Sucursal 3', stock: 110, total_venta: 11000, stock_min: 55, stock_max: 220 },
      ].sort((a, b) => b.total_venta - a.total_venta).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

    const dbConfig = getDbConfig(req);
    const limit = parseLimit(req.query.limit, 1500);
    const sql = `SELECT FIRST ${limit} * FROM "eStockSucursal"`;
    const rawRows = await query<Record<string, unknown>>(sql, [], dbConfig);
    const rows = rawRows.map(normalizeRow);
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
            toString(row.producto) ||
            toString(row.articulo) ||
            toString(row.nombre_articulo) ||
            toString(row.codigo_articulo) ||
            'Producto N/A',
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

router.get('/dashboard/productos-rotacion', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [
        { producto: 'Producto A', rotacion: 500 },
        { producto: 'Producto B', rotacion: 450 },
        { producto: 'Producto C', rotacion: 400 },
        { producto: 'Producto D', rotacion: 350 },
        { producto: 'Producto E', rotacion: 300 },
      ].sort((a, b) => b.rotacion - a.rotacion).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/rentabilidad-productos', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [
        { producto: 'Producto A', rentabilidad: 2000 },
        { producto: 'Producto B', rentabilidad: 1800 },
        { producto: 'Producto C', rentabilidad: 1600 },
        { producto: 'Producto D', rentabilidad: 1400 },
        { producto: 'Producto E', rentabilidad: 1200 },
      ].sort((a, b) => b.rentabilidad - a.rentabilidad).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/cuentas-cobrar', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [
        { cliente: 'Cliente 1', sucursal: 'Sucursal 1', saldo: 5000, dias: 15, documento: 'DOC001' },
        { cliente: 'Cliente 2', sucursal: 'Sucursal 1', saldo: 4000, dias: 20, documento: 'DOC002' },
        { cliente: 'Cliente 3', sucursal: 'Sucursal 2', saldo: 6000, dias: 10, documento: 'DOC003' },
        { cliente: 'Cliente 4', sucursal: 'Sucursal 2', saldo: 3000, dias: 25, documento: 'DOC004' },
        { cliente: 'Cliente 5', sucursal: 'Sucursal 3', saldo: 7000, dias: 5, documento: 'DOC005' },
      ].sort((a, b) => b.saldo - a.saldo).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/cuentas-pagar', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [
        { proveedor: 'Proveedor 1', sucursal: 'Sucursal 1', saldo: 8000, dias: 10, documento: 'DOCP001' },
        { proveedor: 'Proveedor 2', sucursal: 'Sucursal 1', saldo: 6000, dias: 15, documento: 'DOCP002' },
        { proveedor: 'Proveedor 3', sucursal: 'Sucursal 2', saldo: 9000, dias: 8, documento: 'DOCP003' },
        { proveedor: 'Proveedor 4', sucursal: 'Sucursal 2', saldo: 5000, dias: 20, documento: 'DOCP004' },
        { proveedor: 'Proveedor 5', sucursal: 'Sucursal 3', saldo: 7000, dias: 12, documento: 'DOCP005' },
      ].sort((a, b) => b.saldo - a.saldo).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/clientes-morosos', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [
        { cliente: 'Cliente Moroso 1', saldo: 10000, dias: 45, sucursal: 'Sucursal 1' },
        { cliente: 'Cliente Moroso 2', saldo: 8000, dias: 50, sucursal: 'Sucursal 1' },
        { cliente: 'Cliente Moroso 3', saldo: 12000, dias: 40, sucursal: 'Sucursal 2' },
        { cliente: 'Cliente Moroso 4', saldo: 6000, dias: 35, sucursal: 'Sucursal 2' },
        { cliente: 'Cliente Moroso 5', saldo: 9000, dias: 55, sucursal: 'Sucursal 3' },
      ].filter(row => row.dias >= 30 && row.saldo > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/proyeccion-ventas-mes', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [
        { dia: 1, ventas: 5000, proyeccion: 5000 },
        { dia: 2, ventas: 6000, proyeccion: 6000 },
        { dia: 3, ventas: 7000, proyeccion: 7000 },
        { dia: 4, ventas: 0, proyeccion: 6000 },
        { dia: 5, ventas: 0, proyeccion: 6000 },
        // ... más días
      ];
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/proyeccion-iva', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (false) {
      const data = [{ total_estimado: 300000, iva_estimado: 57000 }];
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/registro-eventos', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (process.env.NODE_ENV !== 'production') {
      const data = [
        { fecha: '2024-01-01', sucursal: 'Sucursal 1', documento: 'DOC001', total: 5000, medio_pago: 'Efectivo' },
        { fecha: '2024-01-01', sucursal: 'Sucursal 1', documento: 'DOC002', total: 6000, medio_pago: 'Tarjeta' },
        { fecha: '2024-01-01', sucursal: 'Sucursal 2', documento: 'DOC003', total: 4000, medio_pago: 'Efectivo' },
        { fecha: '2024-01-01', sucursal: 'Sucursal 2', documento: 'DOC004', total: 5000, medio_pago: 'Transferencia' },
        { fecha: '2024-01-01', sucursal: 'Sucursal 3', documento: 'DOC005', total: 3000, medio_pago: 'Efectivo' },
      ].slice(0, 50);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/consumo-materias-primas', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (process.env.NODE_ENV !== 'production') {
      const data = [
        { producto: 'Materia Prima A', consumo: 1000 },
        { producto: 'Materia Prima B', consumo: 800 },
        { producto: 'Materia Prima C', consumo: 600 },
        { producto: 'Materia Prima D', consumo: 400 },
        { producto: 'Materia Prima E', consumo: 200 },
      ].sort((a, b) => b.consumo - a.consumo).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/productos-quiebre-stock', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (process.env.NODE_ENV !== 'production') {
      const data = [
        { producto: 'Producto Bajo Stock 1', sucursal: 'Sucursal 1', stock: 5, stock_min: 10 },
        { producto: 'Producto Bajo Stock 2', sucursal: 'Sucursal 1', stock: 3, stock_min: 15 },
        { producto: 'Producto Bajo Stock 3', sucursal: 'Sucursal 2', stock: 2, stock_min: 8 },
        { producto: 'Producto Bajo Stock 4', sucursal: 'Sucursal 2', stock: 1, stock_min: 12 },
        { producto: 'Producto Bajo Stock 5', sucursal: 'Sucursal 3', stock: 0, stock_min: 5 },
      ].filter(row => row.stock <= row.stock_min).sort((a, b) => a.stock - b.stock).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

router.get('/dashboard/tiempo-reposicion', async (req, res, next) => {
  try {
    // En desarrollo, devolver datos hardcodeados
    if (process.env.NODE_ENV !== 'production') {
      const data = [
        { producto: 'Producto Repo 1', sucursal: 'Sucursal 1', stock_reposicion: 7, cajas_reposicion: 2 },
        { producto: 'Producto Repo 2', sucursal: 'Sucursal 1', stock_reposicion: 10, cajas_reposicion: 3 },
        { producto: 'Producto Repo 3', sucursal: 'Sucursal 2', stock_reposicion: 5, cajas_reposicion: 1 },
        { producto: 'Producto Repo 4', sucursal: 'Sucursal 2', stock_reposicion: 8, cajas_reposicion: 2 },
        { producto: 'Producto Repo 5', sucursal: 'Sucursal 3', stock_reposicion: 12, cajas_reposicion: 4 },
      ].sort((a, b) => b.stock_reposicion - a.stock_reposicion).slice(0, 20);
      res.json({ success: true, data });
      return;
    }

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

export default router;
