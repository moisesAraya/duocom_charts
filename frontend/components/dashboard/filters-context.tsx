/**
 * filters-context.tsx — Contexto global de filtros del dashboard.
 *
 * Provee a todas las pestañas:
 *  - Lista de sucursales (cargada desde /api/sucursales)
 *  - Sucursales seleccionadas (multi-select)
 *  - Parámetros de query ("sucursal=A,B,C") listos para enviar a la API
 *
 * Se monta una sola vez en el layout de tabs.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/constants/api';

export interface BranchOption {
  id: string;
  nombre: string;
}

interface FiltersContextValue {
  sucursales: BranchOption[];
  /** false mientras el primer GET /api/sucursales no termina (evita pedir dashboard con sucursal vacío). */
  sucursalesReady: boolean;
  selectedSucursales: string[];
  toggleSucursal: (id: string) => void;
  clearSucursales: () => void;
  selectAllSucursales: () => void;
  requestParams: Record<string, string>;
  startDate: Date;
  setStartDate: (d: Date) => void;
  endDate: Date;
  setEndDate: (d: Date) => void;
}

const FiltersContext = createContext<FiltersContextValue | undefined>(undefined);

/** Evita duplicados tipo 1 / "01" y alinea chips con la API. */
export const canonicalBranchId = (id: string): string => {
  const t = String(id ?? '').trim();
  if (!t) return '';
  if (/^\d+$/.test(t)) return String(parseInt(t, 10));
  return t.toLowerCase();
};

/** Misma forma que `requestParams`: `sucursal` (ids) + `sucursalNom` (nombres con `|`). */
export function branchQueryParamsFromIds(
  sucursales: BranchOption[],
  selectedIds: string[],
): { sucursal: string; sucursalNom: string } {
  const seleccion = sucursales.filter((s) =>
    selectedIds.some((id) => canonicalBranchId(id) === canonicalBranchId(s.id)),
  );
  return {
    sucursal: seleccion.map((s) => s.id).join(','),
    sucursalNom: seleccion.map((s) => s.nombre).join('|'),
  };
}

/** Une dos listas de ids sin duplicar por id canónico. */
export function unionCanonicalIds(a: string[], b: string[]): string[] {
  const m = new Map<string, string>();
  for (const id of [...a, ...b]) {
    const c = canonicalBranchId(id);
    if (!c) continue;
    if (!m.has(c)) m.set(c, id);
  }
  return [...m.values()];
}

/** Filtra filas cuyo campo `sucursal` (nombre) coincide con la selección por id. */
export function isRowSucursalInSelection(
  rowSucursalName: string,
  sucursales: BranchOption[],
  selectedIds: string[],
): boolean {
  const n = String(rowSucursalName ?? '').trim().toLowerCase();
  if (!n) return false;
  const sel = sucursales.filter((s) =>
    selectedIds.some((id) => canonicalBranchId(id) === canonicalBranchId(s.id)),
  );
  return sel.some((s) => s.nombre.trim().toLowerCase() === n);
}

const dedupeSucursales = (list: BranchOption[]): BranchOption[] => {
  const m = new Map<string, BranchOption>();
  for (const s of list) {
    const id = canonicalBranchId(s.id);
    if (!id) continue;
    if (!m.has(id)) m.set(id, { id, nombre: String(s.nombre ?? '').trim() || id });
  }
  return Array.from(m.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  );
};

export const FiltersProvider = ({ children }: { children: React.ReactNode }) => {
  const [sucursales, setSucursales] = useState<BranchOption[]>([]);
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros de fecha globales (default: último mes)
  const [endDate, setEndDate] = useState(new Date());
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });

  const fetchSucursales = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/sucursales');
      const raw = (response.data?.data ?? []) as BranchOption[];
      const data = dedupeSucursales(raw.map((s) => ({ id: String(s.id), nombre: s.nombre })));
      setSucursales(data);
      setSelectedSucursales(data.map((s) => s.id));
    } catch (error) {
      // Si falla, usar valores por defecto
      const defaultBranches: BranchOption[] = [
        { id: '1', nombre: 'Casa Matriz' }
      ];
      setSucursales(defaultBranches);
      setSelectedSucursales(['1']);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSucursales().catch(() => {
      // Ignorar errores
    });
  }, [fetchSucursales]);

  const toggleSucursal = useCallback((id: string) => {
    const c = canonicalBranchId(id);
    if (!c) return;
    setSelectedSucursales((prev) => {
      const canon = prev.map(canonicalBranchId);
      if (canon.includes(c)) return prev.filter((s) => canonicalBranchId(s) !== c);
      return [...prev, c];
    });
  }, []);

  const clearSucursales = useCallback(() => {
    setSelectedSucursales([]);
  }, []);

  const selectAllSucursales = useCallback(() => {
    setSelectedSucursales(sucursales.map(s => s.id));
  }, [sucursales]);

  const requestParams = useMemo(() => {
    const seleccion = sucursales.filter((s) => selectedSucursales.includes(s.id));
    const sucursalNom = seleccion.map((s) => s.nombre).join('|');
    return {
      sucursal: selectedSucursales.join(','),
      sucursalNom,
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  }, [selectedSucursales, sucursales, startDate, endDate]);

  const sucursalesReady = !isLoading;

  const value = useMemo(
    () => ({
      sucursales,
      sucursalesReady,
      selectedSucursales,
      toggleSucursal,
      clearSucursales,
      selectAllSucursales,
      requestParams,
      startDate,
      setStartDate,
      endDate,
      setEndDate,
    }),
    [
      sucursales,
      sucursalesReady,
      selectedSucursales,
      toggleSucursal,
      clearSucursales,
      selectAllSucursales,
      requestParams,
      startDate,
      endDate,
    ]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
};

export const useDashboardFilters = (): FiltersContextValue => {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error('useDashboardFilters must be used inside FiltersProvider');
  }
  return context;
};
