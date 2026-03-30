/**
 * dashboard_new.ts — Versión alternativa del router de dashboard.
 *
 * Contiene los mismos endpoints que dashboard.ts pero con ligeras
 * variaciones en la lógica de algunos endpoints (p. ej. ventas-anuales
 * divide por 1 000 000 para mostrar en M$, graf-vta-mes-suc usa
 * runProcedure en vez de query directo).
 *
 * NOTA: Este archivo se mantiene como referencia / versión experimental.
 * En producción se usa dashboard.ts (montado en /api).
 */

import { Router } from 'express';
import {
  getDbConfig,
  toNumber,
  toString,
  parseDateParam,
  getDateRange,
  runProcedure,
  runProcedureWithFallbacks,
  runProcedureByNames,
  uniqueList,
  parseSucursalList,
  parseLimit,
} from '../helpers/db-helpers';

const router = Router();

// Lista de sucursales disponibles en la BD del cliente
router.get('/sucursales', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    const rows = await runProcedure(dbConfig, 'zSucursales');
    const branches = uniqueList(rows.map(row => toString(row.sucursal)));
    res.json({
      success: true,
      data: branches.map(value => ({ id: value, nombre: value })),
    });
  } catch (error) {
    next(error);
  }
});

// Clientes por hora del día (tráfico por sucursal)
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

// Ventas desglosadas por medio de pago
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

// Ventas agrupadas por grupo de producto
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

// Ventas anuales por sucursal (divididas por 1M para mostrar en M$)
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

// Gráfico de ventas diarias del mes por sucursal (SP Graf_VtaMes_Suc)
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

// Resumen de ventas diarias en un rango de fechas
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

// Ventas mensuales de un año específico
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

// Detalle de ventas individuales (por transacción)
router.get('/dashboard/venta-minuto', async (req, res, next) => {
  try {
    const dbConfig = getDbConfig(req);
    // Obtener la fecha desde el query param 'fecha', o usar hoy si no viene
    const fechaParam = req.query.fecha;
    let fecha = parseDateParam(fechaParam);
    if (!fecha) fecha = new Date();
    const limit = parseLimit(req.query.limit, 2000);
    const branches = parseSucursalList(req.query.sucursal);
    // Llamar al nuevo SP con solo la fecha
    const rows = await runProcedure(dbConfig, '_Web_VtaAlMin', [fecha], { limit });
    // Mapeo flexible de columnas (algunos nombres pueden variar)
    const data = rows.map(row => ({
      sucursal: toString(row.sucursal) || toString(row['Sucursal']) || toString(row['descripcion_sucursal']) || toString(row['nombre_sucursal']) || toString(row['Id# Sucursal']) || '',
      objetivo_mensual: toNumber(row['Objetivo$ Mensual']),
      obj_tickets_mes: toNumber(row['Obj Tickets Mes']),
      venta_dia: toNumber(row['Venta Día']),
      ticket_dia: toNumber(row['Ticket Día']),
      ticket_prom_dia: toNumber(row['Ticket Prom Día']),
      venta_acum_mes: toNumber(row['Venta Acum Mes']),
      ticket_acum_mes: toNumber(row['Ticket Acum Mes']),
      ticket_prom_mes: toNumber(row['Ticket Prom Mes']),
      ticket_x_min: toNumber(row['Ticket x Min']),
      ticket_x_hora: toNumber(row['Ticket x Hora']),
      pct_objetivo_total: toNumber(row['% del Objetivo Total']),
      pct_avance_objetivo: toNumber(row['% Avance Objetivo']),
      semaforo: toString(row['Semáforo$']),
      pct_av_ticket_mes: toNumber(row['% Av Ticket Mes']),
      sem_ticket: toString(row['Sem Ticket']),
      proyeccion: toNumber(row['Proyección$']),
      pct_proyeccion: toNumber(row['% Proyección']),
      semaforo_proy: toString(row['Semáforo Proy']),
      brecha_objetivo: toNumber(row['Brecha$ Objetivo']),
      brecha_proyeccion: toNumber(row['Brecha$ Proyección']),
      nuevo_objetivo_diario: toNumber(row['Nuevo Objetivo Diario']),
      dias_laborales: toString(row['Dias/Laborales']),
      pct_periodo_transcurrido: toNumber(row['% Período Transcurrido']),
      ranking: toNumber(row['Ranking'])
    })).filter(row => (branches.length ? branches.includes(row.sucursal) : true));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Inventario valorizado — top 20 productos por valor en stock
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

// Ranking de productos más vendidos (rotación)
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

// Ranking de productos más rentables (contribución)
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

// Cuentas por cobrar — top 20 por saldo pendiente
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

// Cuentas por pagar — top 20 por saldo pendiente
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

// Clientes morosos (deuda > 30 días con saldo positivo)
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

// Proyección de ventas del mes (real vs. proyectado por día)
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

// Proyección de IVA estimado del mes actual
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

// Registro de eventos — últimas 50 transacciones
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

// Consumo de materias primas — top 20 por cantidad
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

// Productos bajo stock mínimo (riesgo de quiebre)
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

// Sugerencia de reposición de stock (cantidades y cajas)
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

export default router;
