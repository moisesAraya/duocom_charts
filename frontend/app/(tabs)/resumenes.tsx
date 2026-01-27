import { api } from '@/constants/api';
import { Card, EmptyState } from '@/components/dashboard/card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { FilterRow, DateFilter, SelectFilter, buildYearOptions } from '@/components/dashboard/chart-filters';
import { FiltersPanel } from '@/components/dashboard/filters-panel';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import { useDashboardFilters } from '@/components/dashboard/filters-context';
import { addDays, formatCompact, formatCurrency, formatDateDisplay, formatDateInput, sparsifyLabels } from '@/components/dashboard/utils';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

interface ResumenMensualRow {
  fecha: string | Date;
  sucursal: string;
  total: number;
}

interface ResumenAnualRow {
  mes: number;
  sucursal: string;
  total: number;
}

interface VentaMinutoRow {
  fecha: string | Date;
  sucursal: string;
  total: number;
}


const SERIES_COLORS = [
  '37, 99, 235',
  '16, 185, 129',
  '245, 158, 11',
  '139, 92, 246',
  '236, 72, 153',
  '14, 116, 144',
  '234, 88, 12',
  '248, 113, 113',
  '34, 197, 94',
  '251, 146, 60',
];

const getBranchColor = (branch: string, fallbackIndex = 0): string => {
  if (!branch) return SERIES_COLORS[fallbackIndex % SERIES_COLORS.length];
  let hash = 0;
  for (let i = 0; i < branch.length; i += 1) {
    hash = (hash * 31 + branch.charCodeAt(i)) % 997;
  }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
};

const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function ResumenesScreen() {
  const { requestParams, selectedSucursales, sucursales } = useDashboardFilters();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);

  const [loadingMensual, setLoadingMensual] = useState(true);
  const [loadingAnual, setLoadingAnual] = useState(true);
  const [loadingMinuto, setLoadingMinuto] = useState(true);
  const [mensual, setMensual] = useState<ResumenMensualRow[]>([]);
  const [anual, setAnual] = useState<ResumenAnualRow[]>([]);
  const [ventaMinuto, setVentaMinuto] = useState<VentaMinutoRow[]>([]);
  const [ventasMensualesYear, setVentasMensualesYear] = useState(
    () => new Date().getFullYear()
  );
  const [ventasDiariasDesde, setVentasDiariasDesde] = useState(
    () => addDays(new Date(), -14)
  );
  const [ventasDiariasHasta, setVentasDiariasHasta] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

const activeBranches = useMemo(() => {
  const selected = Array.isArray(selectedSucursales) ? selectedSucursales : [];
  if (selected.length) return selected;
  return Array.isArray(sucursales) ? sucursales.map(item => item.id) : [];
}, [selectedSucursales, sucursales]);


  const yearOptions = useMemo(() => buildYearOptions(8), []);

  useEffect(() => {
    const loadMensual = async () => {
      setLoadingMensual(true);
      try {
        const response = await api.get('/api/dashboard/resumen-mensual-ventas', {
          params: {
            ...requestParams,
            desde: formatDateInput(ventasDiariasDesde),
            hasta: formatDateInput(ventasDiariasHasta),
          },
        });
        setMensual(response.data?.data ?? []);
      } catch (error) {
        setMensual([]);
      } finally {
        setLoadingMensual(false);
      }
    };

    void loadMensual();
  }, [requestParams, ventasDiariasDesde, ventasDiariasHasta]);

  useEffect(() => {
    const loadAnual = async () => {
      setLoadingAnual(true);
      try {
        const response = await api.get('/api/dashboard/resumen-anual-ventas', {
          params: { ...requestParams, anio: ventasMensualesYear },
        });
        setAnual(response.data?.data ?? []);
      } catch (error) {
        setAnual([]);
      } finally {
        setLoadingAnual(false);
      }
    };

    void loadAnual();
  }, [requestParams, ventasMensualesYear]);

  useEffect(() => {
    const loadMinuto = async () => {
      setLoadingMinuto(true);
      try {
        const response = await api.get('/api/dashboard/venta-minuto', { params: requestParams });
        setVentaMinuto(response.data?.data ?? []);
      } catch (error) {
        setVentaMinuto([]);
      } finally {
        setLoadingMinuto(false);
      }
    };

    void loadMinuto();
  }, [requestParams]);

  const loadAllData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        // Load mensual data
        (async () => {
          setLoadingMensual(true);
          try {
            const response = await api.get('/api/dashboard/resumen-mensual-ventas', {
              params: {
                ...requestParams,
                desde: formatDateInput(ventasDiariasDesde),
                hasta: formatDateInput(ventasDiariasHasta),
              },
            });
            setMensual(response.data?.data ?? []);
          } catch (error) {
            setMensual([]);
          } finally {
            setLoadingMensual(false);
          }
        })(),
        // Load anual data
        (async () => {
          setLoadingAnual(true);
          try {
            const response = await api.get('/api/dashboard/resumen-anual-ventas', {
              params: { ...requestParams, anio: ventasMensualesYear },
            });
            setAnual(response.data?.data ?? []);
          } catch (error) {
            setAnual([]);
          } finally {
            setLoadingAnual(false);
          }
        })(),
        // Load minuto data
        (async () => {
          setLoadingMinuto(true);
          try {
            const response = await api.get('/api/dashboard/venta-minuto', { params: requestParams });
            setVentaMinuto(response.data?.data ?? []);
          } catch (error) {
            setVentaMinuto([]);
          } finally {
            setLoadingMinuto(false);
          }
        })(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const mensualChart = useMemo(() => {
    const availableBranches = Array.from(
      new Set(mensual.map(row => row.sucursal).filter(Boolean))
    );
    const branchList = activeBranches.length
      ? activeBranches.filter(branch => availableBranches.includes(branch))
      : availableBranches;
    const branchesToUse = branchList.length ? branchList : availableBranches;

    const sorted = [...mensual].sort((a, b) => {
      const aDate = new Date(a.fecha).getTime();
      const bDate = new Date(b.fecha).getTime();
      return aDate - bDate;
    });

    const dateKeys = Array.from(
      new Set(
        sorted
          .map(item => new Date(item.fecha))
          .filter(date => !Number.isNaN(date.getTime()))
          .map(date => date.toISOString().slice(0, 10))
      )
    );

    const totals = new Map<string, number>();
    for (const row of sorted) {
      if (branchesToUse.length && !branchesToUse.includes(row.sucursal)) continue;
      const date = new Date(row.fecha);
      if (Number.isNaN(date.getTime())) continue;
      const key = `${row.sucursal}-${date.toISOString().slice(0, 10)}`;
      totals.set(key, (totals.get(key) ?? 0) + (row.total ?? 0));
    }

    const labels = dateKeys.map(key => {
      const date = new Date(`${key}T00:00:00`);
      return Number.isNaN(date.getTime()) ? '-' : date.getDate().toString();
    });

    return {
      labels: sparsifyLabels(labels, 10),
      datasets: branchesToUse.map((branch, index) => ({
        data: dateKeys.map(key => totals.get(`${branch}-${key}`) ?? 0),
        color: (opacity: number) => `rgba(${getBranchColor(branch, index)}, ${opacity})`,
        strokeWidth: 2,
      })),
      legend: branchesToUse.length > 1 ? branchesToUse : undefined,
      detailLabels: dateKeys.map(key =>
        formatDateDisplay(new Date(`${key}T00:00:00`))
      ),
    };
  }, [activeBranches, mensual]);

  const anualChart = useMemo(() => {
    const availableBranches = Array.from(new Set(anual.map(row => row.sucursal).filter(Boolean)));
    const branchList = activeBranches.length
      ? activeBranches.filter(branch => availableBranches.includes(branch))
      : availableBranches;
    const branchesToUse = branchList.length ? branchList : availableBranches;
    const totals = new Map<string, number>();
    for (const row of anual) {
      if (branchesToUse.length && !branchesToUse.includes(row.sucursal)) continue;
      totals.set(`${row.sucursal}-${row.mes}`, row.total ?? 0);
    }
    return {
      labels: sparsifyLabels(monthLabels, 6),
      datasets: branchesToUse.map((branch, index) => ({
        data: monthLabels.map((_, monthIndex) => totals.get(`${branch}-${monthIndex + 1}`) ?? 0),
        color: (opacity: number) => `rgba(${getBranchColor(branch, index)}, ${opacity})`,
        strokeWidth: 2,
      })),
      legend: branchesToUse.length > 1 ? branchesToUse : undefined,
    };
  }, [activeBranches, anual]);

  const totalMensual = mensual.reduce((acc, row) => acc + (row.total ?? 0), 0);

  return (
    <ScreenShell title="Resumenes" subtitle="Actividad diaria y mensual" refreshing={refreshing} onRefresh={loadAllData}>
      <>
        <FiltersPanel />
        
        <FilterRow title="Ventas diarias">
          <DateFilter label="Desde" value={ventasDiariasDesde} onChange={setVentasDiariasDesde} />
          <DateFilter label="Hasta" value={ventasDiariasHasta} onChange={setVentasDiariasHasta} />
        </FilterRow>

        <ChartCard
          title="Ventas diarias"
          subtitle={`Total ${formatCurrency(totalMensual)}`}
          data={{
            labels: mensualChart.labels,
            datasets: mensualChart.datasets,
            legend: mensualChart.legend,
          }}
          kind="line"
          colorRgb="37, 99, 235"
          width={chartWidth}
          height={260}
          xLabel="Dia"
          yLabel="Ventas"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          detailTrigger="button"
          detailLabels={mensualChart.detailLabels}
          scrollable
          minWidth={Math.max(chartWidth, mensualChart.labels.length * 32)}
          enterDelay={60}
          isLoading={loadingMensual}
          isEmpty={!mensual.length}
          emptyMessage="Sin ventas diarias para el rango."
        />

        <FilterRow title="Ventas mensuales">
          <SelectFilter
            label="anio"
            value={ventasMensualesYear}
            onChange={setVentasMensualesYear}
            options={yearOptions.map(year => ({ label: String(year), value: year }))}
          />
        </FilterRow>

        <ChartCard
          title="Ventas mensuales"
          subtitle="Total por mes"
          data={anualChart}
          kind="bar"
          colorRgb="16, 185, 129"
          width={chartWidth}
          height={260}
          xLabel="Mes"
          yLabel="Total"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, anualChart.labels.length * 40)}
          enterDelay={120}
          isLoading={loadingAnual}
          isEmpty={!anual.length}
          emptyMessage="Sin datos mensuales."
          detailLabels={monthLabels}
        />

        <Card title="Ultimas transacciones" subtitle="Actividad reciente">
          {loadingMinuto ? (
            <Text style={styles.loadingText}>Cargando transacciones...</Text>
          ) : ventaMinuto.length ? (
            <View>
              {ventaMinuto.slice(0, 6).map((row, index) => (
                <View key={`${row.sucursal}-${index}`} style={styles.listRow}>
                  <Text style={styles.listPrimary}>{row.sucursal || 'Sucursal'}</Text>
                  <Text style={styles.listSecondary}>{formatCurrency(row.total ?? 0)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState message="Sin transacciones recientes." />
          )}
        </Card>
      </>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  listPrimary: {
    color: '#111827',
    fontWeight: '600',
  },
  listSecondary: {
    color: '#6B7280',
  },
});
