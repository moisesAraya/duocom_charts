import { query } from '../db/firebird';

export interface RawFirebirdRow extends Record<string, unknown> {}

export interface AnnualSaleRow {
  year: number;
  month?: number;
  amount: number;
  paymentMethod?: string;
  branch?: string;
}

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const coerceString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  return undefined;
};

const pickNumber = (row: RawFirebirdRow, keys: string[]): number | undefined => {
  for (const key of keys) {
    const candidate = coerceNumber(row[key]);
    if (candidate !== undefined) {
      return candidate;
    }
  }

  return undefined;
};

const pickString = (row: RawFirebirdRow, keys: string[]): string | undefined => {
  for (const key of keys) {
    const candidate = coerceString(row[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

const normalizeAnnualSale = (row: RawFirebirdRow): AnnualSaleRow => {
  const year = pickNumber(row, ['AÑO', 'ANO', 'ANIO', 'ANIO', 'YEAR', 'year', 'anio', 'ano', 'año']);
  const month = pickNumber(row, ['MES', 'Mes', 'mes', 'MONTH']);
  const amount =
    pickNumber(row, ['VENTAS', 'VENTA', 'TOTAL', 'IMPORTE', 'MONTO', 'ventas', 'venta', 'monto', 'importe']) ?? 0;
  const paymentMethod = pickString(row, [
    'Medio de Pago',
    'MEDIO_DE_PAGO',
    'MEDIO_DE_COBRO',
    'MEDIO_PAGO',
    'MEDIO DE PAGO',
    'MEDIO',
    'medio_pago',
  ]);
  const branch = pickString(row, ['SUCURSAL', 'Sucursal', 'sucursal', 'SUC']);

  return {
    year: year ?? new Date().getFullYear(),
    month,
    amount,
    paymentMethod,
    branch,
  };
};

export const fetchAnnualSales = async (years: number): Promise<AnnualSaleRow[]> => {
  const result = await query<RawFirebirdRow>('SELECT * FROM "_ProyVentaAnual"( ? )', [years]);

  return result.map(normalizeAnnualSale);
};

export const filterByBranch = (rows: AnnualSaleRow[], branch?: string): AnnualSaleRow[] => {
  if (!branch) return rows;

  return rows.filter(row => row.branch?.toString() === branch);
};

export const summarizeByYear = (rows: AnnualSaleRow[]): { anio: number; ventas: number }[] => {
  const totals = new Map<number, number>();

  for (const row of rows) {
    if (!Number.isFinite(row.year)) continue;

    totals.set(row.year, (totals.get(row.year) ?? 0) + row.amount);
  }

  return Array.from(totals.entries())
    .sort(([a], [b]) => a - b)
    .map(([anio, ventas]) => ({ anio, ventas }));
};

export const summarizeByPaymentMethod = (rows: AnnualSaleRow[]): { medio_pago: string; monto: number }[] => {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const key = row.paymentMethod ?? 'Otros';
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }

  return Array.from(totals.entries())
    .map(([medio_pago, monto]) => ({ medio_pago, monto }))
    .sort((a, b) => b.monto - a.monto);
};
