import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/constants/api';

export interface BranchOption {
  id: string;
  nombre: string;
}

interface FiltersContextValue {
  sucursales: BranchOption[];
  selectedSucursales: string[];
  toggleSucursal: (id: string) => void;
  clearSucursales: () => void;
  selectAllSucursales: () => void;
  requestParams: Record<string, string>;
}

const FiltersContext = createContext<FiltersContextValue | undefined>(undefined);

export const FiltersProvider = ({ children }: { children: React.ReactNode }) => {
  const [sucursales, setSucursales] = useState<BranchOption[]>([]);
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    sucursales: selectedSucursales.join(','),
  }), [selectedSucursales]);

  const value = useMemo(
    () => ({
      sucursales,
      selectedSucursales,
      toggleSucursal,
      clearSucursales,
      selectAllSucursales,
      requestParams,
    }),
    [
      sucursales,
      selectedSucursales,
      toggleSucursal,
      clearSucursales,
      selectAllSucursales,
      requestParams,
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
