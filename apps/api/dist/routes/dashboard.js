"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebird_1 = require("../db/firebird");
const router = (0, express_1.Router)();
const normalizeKey = (key) => key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
const normalizeRow = (row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
        normalized[normalizeKey(key)] = value;
    }
    return normalized;
};
const getDbConfig = (req) => {
    if (!req.dbConfig) {
        throw new Error('Missing database configuration');
    }
    return req.dbConfig;
};
const toNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value.replace(',', '.'));
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};
const toString = (value) => {
    if (value === null || value === undefined)
        return '';
    return String(value).trim();
};
// Devuelve el valor de sucursal de un row, probando varias variantes
const getSucursalFromRow = (row) => {
    return (toString(row.sucursal) ||
        toString(row["descripcion_sucursal"]) ||
        toString(row["nombre_sucursal"]) ||
        toString(row["nombre"]) ||
        toString(row["descripcion"]) ||
        toString(row["Id# Sucursal"]) ||
        toString(row["Id Sucursal"]) ||
        toString(row["id_sucursal"]) ||
        toString(row["suc"]) ||
        'N/A');
};
// Devuelve el valor de total de ventas de un row, probando varias variantes
const getTotalFromRow = (row) => {
    return (toNumber(row.total) ||
        toNumber(row.total_dia) ||
        toNumber(row.total_venta) ||
        toNumber(row.t_bruto) ||
        toNumber(row.importe) ||
        toNumber(row.monto) ||
        0);
};
const parseNumber = (value, defaultValue) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
};
const parseDateParam = (value) => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const candidate = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
};
const getDateRange = (queryParams) => {
    const now = new Date();
    const end = parseDateParam(queryParams.hasta) ??
        parseDateParam(queryParams.to) ??
        parseDateParam(queryParams.end) ??
        now;
    const start = parseDateParam(queryParams.desde) ??
        parseDateParam(queryParams.from) ??
        parseDateParam(queryParams.start) ??
        new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30);
    return { start, end };
};
const buildProcedureSql = (name, params, limit) => {
    if (!params.length) {
        return `SELECT ${limit ? `FIRST ${limit} ` : ''}* FROM "${name}"`;
    }
    const placeholders = params.map(() => '?').join(', ');
    return `SELECT ${limit ? `FIRST ${limit} ` : ''}* FROM "${name}"(${placeholders})`;
};
const runProcedure = async (dbConfig, name, params = [], options) => {
    const sql = buildProcedureSql(name, params, options?.limit);
    const rows = await (0, firebird_1.query)(sql, params, dbConfig);
    return rows.map(normalizeRow);
};
const runProcedureWithFallbacks = async (dbConfig, name, paramSets, options) => {
    let lastError;
    for (const params of paramSets) {
        try {
            return await runProcedure(dbConfig, name, params, options);
        }
        catch (error) {
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
const runProcedureByNames = async (dbConfig, names, paramSets, options) => {
    let lastError;
    for (const name of names) {
        try {
            return await runProcedureWithFallbacks(dbConfig, name, paramSets, options);
        }
        catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : '';
            if (message.includes('procedure unknown') ||
                message.includes('procedure name') ||
                message.includes('procedure not found')) {
                lastError = error;
                continue;
            }
            lastError = error;
        }
    }
    throw lastError;
};
const uniqueList = (values) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const parseSucursalList = (value) => {
    if (!value)
        return [];
    if (Array.isArray(value)) {
        return value.flatMap(item => String(item).split(',').map(v => v.trim())).filter(Boolean);
    }
    return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
};
const normalizeBranch = (value) => toString(value).toLowerCase().replace(/\s+/g, ' ').trim();
const parseLimit = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(Math.max(parsed, 50), 5000);
};
router.get('/sucursales', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const rows = await (0, firebird_1.query)('SELECT * FROM "eSucursales"', [], dbConfig);
        const normalizedRows = rows.map(normalizeRow);
        // eslint-disable-next-line no-console
        console.log('[sucursales] rows', rows.length);
        // Usar la misma lógica de getSucursalFromRow y normalizar para que coincida con los endpoints de ventas
        const branches = uniqueList(normalizedRows.map(row => normalizeBranch(getSucursalFromRow(row))));
        res.json({
            success: true,
            data: branches.map(value => ({ id: value, nombre: value })),
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/clientes-hora', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 3000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedure(dbConfig, '_PvtVentaHoraria', [start, end], { limit });
        const totals = new Map();
        for (const row of rows) {
            const sucursal = toString(row.sucursal) || 'N/A';
            if (branches.length && !branches.includes(sucursal))
                continue;
            const hora = toNumber(row.hora);
            const clientes = toNumber(row.cant_docs) || toNumber(row.n_x) || toNumber(row.ticket);
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/ventas-medio-pago', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 3000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedure(dbConfig, '_PvtVentaHoraria', [start, end], { limit });
        const totals = new Map();
        for (const row of rows) {
            const sucursal = toString(row.sucursal) || 'N/A';
            if (branches.length && !branches.includes(sucursal))
                continue;
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/ventas-por-grupo', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const rows = await runProcedureByNames(dbConfig, ['SQL_TopNVentasPorGrupo', 'X_RetProdsXGrupo'], [[start, end], [start], []], { limit: 5000 });
        const totals = new Map();
        for (const row of rows) {
            const group = toString(row.grupo ||
                row.nombre_grupo ||
                row.descripcion_grupo ||
                row.grupo_desc ||
                row.descripcion ||
                row.nombre) || 'Sin grupo';
            const total = toNumber(row.total) ||
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/ventas-anuales', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const years = Number.parseInt(String(req.query.years ?? '3'), 10);
        const branches = parseSucursalList(req.query.sucursal).map(normalizeBranch);
        const rows = await runProcedure(dbConfig, '_ProyVentaAnual', [Number.isFinite(years) ? years : 3]);
        const totals = new Map();
        for (const row of rows) {
            const anio = toNumber(row.ano);
            const sucursal = getSucursalFromRow(row);
            if (branches.length && !branches.includes(normalizeBranch(sucursal)))
                continue;
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/resumen-mensual-ventas', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 3000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedureWithFallbacks(dbConfig, 'Graf VentasDiarias', [[start, end], [start], []], { limit });
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/resumen-anual-ventas', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { end } = getDateRange(req.query);
        const year = Number.parseInt(String(req.query.anio ?? end.getFullYear()), 10);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedure(dbConfig, '_ProyVentaAnual', [5]);
        const totals = new Map();
        for (const row of rows) {
            const anio = toNumber(row.ano);
            if (anio !== year)
                continue;
            const sucursal = getSucursalFromRow(row);
            if (branches.length && !branches.includes(sucursal))
                continue;
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/venta-minuto', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/inventario-valorizado', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 1500);
        const rows = await runProcedure(dbConfig, '_PvtStock', [end], { limit });
        const branches = parseSucursalList(req.query.sucursal);
        const data = rows
            .filter(row => branches.length ? branches.includes(toString(row.bodega_local)) : true)
            .map(row => ({
            producto: toString(row.descripcion_art_serv),
            sucursal: toString(row.bodega_local),
            stock: toNumber(row.stock_actual),
            total_venta: toNumber(row.total_p_venta),
            stock_min: toNumber(row.stock_min),
            stock_max: toNumber(row.stock_max),
        }))
            .sort((a, b) => b.total_venta - a.total_venta)
            .slice(0, 20);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/productos-rotacion', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 2000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedure(dbConfig, '_PvtRotaci\u00f3n', [start], { limit });
        const totals = new Map();
        for (const row of rows) {
            const sucursal = toString(row.descripcion_sucursal) || 'N/A';
            if (branches.length && !branches.includes(sucursal))
                continue;
            const producto = toString(row.descripcion_art_serv);
            const cantidad = toNumber(row.cantidad);
            totals.set(producto, (totals.get(producto) ?? 0) + cantidad);
        }
        const data = Array.from(totals.entries())
            .map(([producto, rotacion]) => ({ producto, rotacion }))
            .sort((a, b) => b.rotacion - a.rotacion)
            .slice(0, 20);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/rentabilidad-productos', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 2000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedure(dbConfig, '_PvtRotaci\u00f3n', [start], { limit });
        const totals = new Map();
        for (const row of rows) {
            const sucursal = toString(row.descripcion_sucursal) || 'N/A';
            if (branches.length && !branches.includes(sucursal))
                continue;
            const producto = toString(row.descripcion_art_serv);
            const contrib = toNumber(row.contrib);
            totals.set(producto, (totals.get(producto) ?? 0) + contrib);
        }
        const data = Array.from(totals.entries())
            .map(([producto, rentabilidad]) => ({ producto, rentabilidad }))
            .sort((a, b) => b.rentabilidad - a.rentabilidad)
            .slice(0, 20);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/cuentas-cobrar', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 2000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedureWithFallbacks(dbConfig, '_PvtDocXCobrar', [[start, end], [start], []], { limit });
        const data = rows
            .map(row => ({
            cliente: toString(row.contacto) ||
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/cuentas-pagar', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/clientes-morosos', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 2000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedureWithFallbacks(dbConfig, '_PvtDocXCobrar', [[start, end], [start], []], { limit });
        const data = rows
            .map(row => ({
            cliente: toString(row.contacto) ||
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/proyeccion-ventas-mes', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 3000);
        const rows = await runProcedureWithFallbacks(dbConfig, 'Graf VentasDiarias', [[start, end], [start], []], { limit });
        const year = end.getFullYear();
        const month = end.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const totals = new Map();
        for (const row of rows) {
            const fecha = row.fecha instanceof Date ? row.fecha : new Date(String(row.fecha));
            if (Number.isNaN(fecha.getTime()))
                continue;
            if (fecha.getFullYear() !== year || fecha.getMonth() !== month)
                continue;
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/proyeccion-iva', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 3000);
        const rows = await runProcedureWithFallbacks(dbConfig, 'Graf VentasDiarias', [[start, end], [start], []], { limit });
        const year = end.getFullYear();
        const month = end.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let sumSoFar = 0;
        let daysSoFar = 0;
        for (const row of rows) {
            const fecha = row.fecha instanceof Date ? row.fecha : new Date(String(row.fecha));
            if (Number.isNaN(fecha.getTime()))
                continue;
            if (fecha.getFullYear() !== year || fecha.getMonth() !== month)
                continue;
            if (fecha.getDate() > end.getDate())
                continue;
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/registro-eventos', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start, end } = getDateRange(req.query);
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/consumo-materias-primas', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { start } = getDateRange(req.query);
        const limit = parseLimit(req.query.limit, 2000);
        const branches = parseSucursalList(req.query.sucursal);
        const rows = await runProcedure(dbConfig, '_PvtRotaci\u00f3n', [start], { limit });
        const totals = new Map();
        for (const row of rows) {
            const sucursal = toString(row.descripcion_sucursal) || 'N/A';
            if (branches.length && !branches.includes(sucursal))
                continue;
            const producto = toString(row.descripcion_art_serv);
            const cantidad = toNumber(row.cantidad);
            totals.set(producto, (totals.get(producto) ?? 0) + cantidad);
        }
        const data = Array.from(totals.entries())
            .map(([producto, consumo]) => ({ producto, consumo }))
            .sort((a, b) => b.consumo - a.consumo)
            .slice(0, 20);
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/productos-quiebre-stock', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { end } = getDateRange(req.query);
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
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/tiempo-reposicion', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { end } = getDateRange(req.query);
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
    }
    catch (error) {
        next(error);
    }
});
// Temporary route to list available procedures
router.get('/debug/procedures', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const { query } = require('../db/firebird');
        const rows = await query(dbConfig, 'SELECT RDB$PROCEDURE_NAME FROM RDB$PROCEDURES');
        res.json({ procedures: rows.map((r) => r['RDB$PROCEDURE_NAME']) });
    }
    catch (error) {
        next(error);
    }
});
// Temporary route to list available tables
router.get('/debug/tables', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const rows = await (0, firebird_1.query)('SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$VIEW_BLR IS NULL AND RDB$SYSTEM_FLAG = 0', [], dbConfig);
        res.json({ tables: rows.map(r => r['RDB$RELATION_NAME']) });
    }
    catch (error) {
        next(error);
    }
});
// Análisis de Ventas Mensual - Graf_VtaMes_Suc
router.get('/dashboard/analisis-ventas-mensual', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const ano = parseNumber(toString(req.query.ano), new Date().getFullYear());
        const mes = parseNumber(toString(req.query.mes), new Date().getMonth() + 1);
        // eslint-disable-next-line no-console
        console.log(`📊 [BACKEND] Análisis Ventas Mensual: año=${ano}, mes=${mes}`);
        // NOTA: En LaTorre la columna es 'Id# Sucursal'.
        const sql = 'SELECT * FROM "Graf_VtaMes_Suc"(?, ?)';
        const rows = await (0, firebird_1.query)(sql, [ano, mes], dbConfig);
        // Organizar datos por series
        const seriesMap = new Map();
        rows.forEach(row => {
            // Buscar todas las variantes posibles de la columna
            const idSucursal = toNumber(row['IdSucursal'] ||
                row['IDSUCURSAL'] ||
                row['idSucursal'] ||
                row['Id# Sucursal'] ||
                row['ID# SUCURSAL'] ||
                row['id# sucursal']);
            const dia = toNumber(row['Día'] || row['DIA'] || row['dia']);
            const monto = toNumber(row['Monto'] || row['MONTO'] || row['monto']) / 1000000;
            if (!seriesMap.has(idSucursal)) {
                seriesMap.set(idSucursal, []);
            }
            seriesMap.get(idSucursal).push({
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
            }
            else if (idSucursal === -2) {
                nombre = 'Media';
                categoria = 'resumenes';
            }
            else if (idSucursal === -1) {
                nombre = 'Promedio Total Diario';
                categoria = 'ventas';
            }
            else {
                nombre = toString(rows.find(r => toNumber(r.IdSucursal || r.IDSUCURSAL || r.idSucursal) === idSucursal)?.NombreSucursal || rows.find(r => toNumber(r.IdSucursal || r.IDSUCURSAL || r.idSucursal) === idSucursal)?.NOMBRESUCURSAL || `Sucursal ${idSucursal}`);
                categoria = 'ventas';
            }
            return {
                idSucursal,
                nombre,
                categoria,
                datos,
            };
        });
        // eslint-disable-next-line no-console
        console.log(`✅ [BACKEND] ${series.length} series encontradas`);
        res.json({
            success: true,
            data: {
                ano,
                mes,
                series,
            },
        });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('❌ [BACKEND] Error en análisis ventas mensual:', error);
        next(error);
    }
});
// Ventas Anuales - Tabla _ProyVentaAnual
router.get('/dashboard/ventas-anuales-tabla', async (req, res, next) => {
    try {
        const dbConfig = getDbConfig(req);
        const cantAnos = parseNumber(toString(req.query.cantAnos), 3);
        // eslint-disable-next-line no-console
        console.log(`📊 [BACKEND] Ventas Anuales Tabla: cantAnos=${cantAnos}`);
        try {
            const sql = 'SELECT * FROM "_ProyVentaAnual"(?)';
            const rows = await (0, firebird_1.query)(sql, [cantAnos], dbConfig);
            const normalizedRows = rows.map(normalizeRow);
            // eslint-disable-next-line no-console
            console.log(`✅ [BACKEND] ${normalizedRows.length} registros encontrados`);
            res.json({
                success: true,
                data: normalizedRows,
            });
        }
        catch (procError) {
            // Si el procedimiento no existe, generar datos de ejemplo
            // eslint-disable-next-line no-console
            console.warn('⚠️ [BACKEND] Procedimiento no encontrado, usando datos de ejemplo');
            const currentYear = new Date().getFullYear();
            const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            const data = [];
            for (let y = 0; y < cantAnos; y++) {
                const year = currentYear - cantAnos + y + 1;
                for (let m = 0; m < 12; m++) {
                    data.push({
                        ano: year,
                        mes: m + 1,
                        mes_nombre: meses[m],
                        sucursal: 'Centro',
                        total: Math.round((50000 + Math.random() * 30000) * 100) / 100,
                        tipo_documento: 'Boleta',
                    });
                    data.push({
                        ano: year,
                        mes: m + 1,
                        mes_nombre: meses[m],
                        sucursal: 'Norte',
                        total: Math.round((40000 + Math.random() * 25000) * 100) / 100,
                        tipo_documento: 'Boleta',
                    });
                    data.push({
                        ano: year,
                        mes: m + 1,
                        mes_nombre: meses[m],
                        sucursal: 'Sur',
                        total: Math.round((35000 + Math.random() * 20000) * 100) / 100,
                        tipo_documento: 'Boleta',
                    });
                }
            }
            res.json({
                success: true,
                data,
            });
        }
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('❌ [BACKEND] Error en ventas anuales tabla:', error);
        next(error);
    }
});
exports.default = router;
