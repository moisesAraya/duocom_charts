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
      const data = response.data?.data ?? [];
      setSucursales(data);
      // Seleccionar todas por defecto
      setSelectedSucursales(data.map((s: BranchOption) => s.id));
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
    setSelectedSucursales(prev => {
      if (prev.includes(id)) {
        return prev.filter(s => s !== id);
      }
      return [...prev, id];
    });
  }, []);

  const clearSucursales = useCallback(() => {
    setSelectedSucursales([]);
  }, []);

  const selectAllSucursales = useCallback(() => {
    setSelectedSucursales(sucursales.map(s => s.id));
  }, [sucursales]);

  const requestParams = useMemo(() => ({
    sucursal: selectedSucursales.join(','),
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0],
  }), [selectedSucursales, startDate, endDate]);

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
