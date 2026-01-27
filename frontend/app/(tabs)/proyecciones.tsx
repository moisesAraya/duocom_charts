import { api } from '@/constants/api';
import { Card, EmptyState } from '@/components/dashboard/card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { FilterRow, MonthYearFilter, buildYearOptions } from '@/components/dashboard/chart-filters';
import { FiltersPanel } from '@/components/dashboard/filters-panel';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import { useDashboardFilters } from '@/components/dashboard/filters-context';
import {
  endOfMonth,
  formatCompact,
  formatCurrency,
  formatDateInput,
  sparsifyLabels,
  startOfMonth,
} from '@/components/dashboard/utils';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

interface ProyeccionRow {
  dia: number;
  ventas: number;
  proyeccion: number;
}

interface IvaRow {
  total_estimado: number;
  iva_estimado: number;
}

export default function ProyeccionesScreen() {
  const { requestParams } = useDashboardFilters();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [proyeccionVentas, setProyeccionVentas] = useState<ProyeccionRow[]>([]);
  const [iva, setIva] = useState<IvaRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  const yearOptions = useMemo(() => buildYearOptions(8), []);
  const proyeccionParams = useMemo(() => {
    const baseDate = new Date(selectedYear, selectedMonth, 1);
    return {
      ...requestParams,
      desde: formatDateInput(startOfMonth(baseDate)),
      hasta: formatDateInput(endOfMonth(baseDate)),
    };
  }, [requestParams, selectedMonth, selectedYear]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrors([]);
      try {
        const [ventasResponse, ivaResponse] = await Promise.allSettled([
          api.get('/api/dashboard/proyeccion-ventas-mes', { params: proyeccionParams }),
          api.get('/api/dashboard/proyeccion-iva', { params: proyeccionParams }),
        ]);

        const nextErrors: string[] = [];

        if (ventasResponse.status === 'fulfilled') {
          setProyeccionVentas(ventasResponse.value.data?.data ?? []);
        } else {
          setProyeccionVentas([]);
          nextErrors.push('Proyeccion ventas sin respuesta.');
        }

        if (ivaResponse.status === 'fulfilled') {
          setIva(ivaResponse.value.data?.data ?? []);
        } else {
          setIva([]);
          nextErrors.push('IVA sin respuesta.');
        }

        setErrors(nextErrors);
      } catch (error) {
        setProyeccionVentas([]);
        setIva([]);
        setErrors(['No se pudo cargar datos de proyeccion.']);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [proyeccionParams]);

  const proyeccionChart = useMemo(() => {
    const labels = proyeccionVentas.map(item => item.dia.toString());
    return {
      labels: sparsifyLabels(labels, 8),
      datasets: [
        {
          data: proyeccionVentas.map(item => item.ventas ?? 0),
          color: () => 'rgba(59, 130, 246, 1)',
          strokeWidth: 2,
        },
        {
          data: proyeccionVentas.map(item => item.proyeccion ?? 0),
          color: () => 'rgba(16, 185, 129, 1)',
          strokeWidth: 2,
        },
      ],
      legend: ['Real', 'Proyectado'],
    };
  }, [proyeccionVentas]);

  const ivaResumen = iva[0];

  return (
    <ScreenShell title="Proyecciones" subtitle="Estimaciones para el cierre del mes">
      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Cargando datos...</Text>
        </View>
      ) : (
        <>
          <FiltersPanel />
          
          {errors.length ? (
            <View style={styles.errorBox}>
              {errors.map(message => (
                <Text key={message} style={styles.errorText}>
                  {message}
                </Text>
              ))}
            </View>
          ) : null}
          <FilterRow title="Proyeccion ventas mes">
            <MonthYearFilter
              label="Periodo"
              month={selectedMonth}
              year={selectedYear}
              years={yearOptions}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
            />
          </FilterRow>
          <ChartCard
            title="Proyeccion ventas mes"
            subtitle="Linea real vs proyectada"
            data={proyeccionChart}
            kind="line"
            colorRgb="59, 130, 246"
            width={chartWidth}
            height={260}
            xLabel="Dia"
            yLabel="Ventas"
            formatValue={formatCompact}
            formatDetailValue={formatCurrency}
            formatAxisValue={formatCompact}
            detailTrigger="button"
            detailLabels={proyeccionVentas.map(item => item.dia.toString())}
            scrollable
            minWidth={Math.max(chartWidth, proyeccionChart.labels.length * 28)}
            enterDelay={60}
            isEmpty={!proyeccionVentas.length}
            emptyMessage="Sin datos para proyeccion."
          />

          <Card title="IVA estimado" subtitle="Cierre del mes">
            {ivaResumen ? (
              <View style={styles.ivaGrid}>
                <View style={styles.ivaBox}>
                  <Text style={styles.ivaLabel}>Ventas estimadas</Text>
                  <Text style={styles.ivaValue}>{formatCurrency(ivaResumen.total_estimado)}</Text>
                </View>
                <View style={styles.ivaBox}>
                  <Text style={styles.ivaLabel}>IVA estimado</Text>
                  <Text style={styles.ivaValue}>{formatCurrency(ivaResumen.iva_estimado)}</Text>
                </View>
              </View>
            ) : (
              <EmptyState message="Sin datos de IVA." />
            )}
          </Card>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingBlock: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#6B7280',
  },
  errorBox: {
    marginBottom: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
  },
  ivaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ivaBox: {
    flexBasis: '48%',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  ivaLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 6,
  },
  ivaValue: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
});
