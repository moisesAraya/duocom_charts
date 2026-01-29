import { API_CONFIG, api } from '@/constants/api';
import { ChartCard } from '@/components/dashboard/chart-card';
import { FiltersPanel } from '@/components/dashboard/filters-panel';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  formatCompact,
  formatCurrency,
  formatNumberExact,
  sparsifyLabels,
} from '@/components/dashboard/utils';

interface InventarioRow {
  producto: string;
  total_venta: number;
}

interface RotacionRow {
  producto: string;
  rotacion: number;
}

interface RentabilidadRow {
  producto: string;
  rentabilidad: number;
}

const truncateLabel = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

export default function InventarioScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);

  const [loadingInventario, setLoadingInventario] = useState(true);
  const [loadingRotacion, setLoadingRotacion] = useState(true);
  const [loadingRentabilidad, setLoadingRentabilidad] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [inventario, setInventario] = useState<InventarioRow[]>([]);
  const [rotacion, setRotacion] = useState<RotacionRow[]>([]);
  const [rentabilidad, setRentabilidad] = useState<RentabilidadRow[]>([]);

  useEffect(() => {
    const loadInventario = async () => {
      setLoadingInventario(true);
      setErrors([]);
      try {
        const response = await api.get('/api/dashboard/inventario-valorizado');
        setInventario(response.data?.data ?? []);
      } catch (error) {
        setInventario([]);
        setErrors(current => [...current, `Inventario sin respuesta (${API_CONFIG.BASE_URL}).`]);
      } finally {
        setLoadingInventario(false);
      }
    };

    void loadInventario();
  }, []);

  useEffect(() => {
    const loadRotacion = async () => {
      setLoadingRotacion(true);
      setErrors([]);
      try {
        const response = await api.get('/api/dashboard/productos-rotacion');
        setRotacion(response.data?.data ?? []);
      } catch (error) {
        setRotacion([]);
        setErrors(current => [...current, 'Rotacion sin respuesta.']);
      } finally {
        setLoadingRotacion(false);
      }
    };

    void loadRotacion();
  }, []);

  useEffect(() => {
    const loadRentabilidad = async () => {
      setLoadingRentabilidad(true);
      setErrors([]);
      try {
        const response = await api.get('/api/dashboard/rentabilidad-productos');
        setRentabilidad(response.data?.data ?? []);
      } catch (error) {
        setRentabilidad([]);
        setErrors(current => [...current, 'Rentabilidad sin respuesta.']);
      } finally {
        setLoadingRentabilidad(false);
      }
    };

    void loadRentabilidad();
  }, []);

  const inventarioLabels = useMemo(
    () => (inventario || []).slice(0, 10).map(item => item.producto),
    [inventario]
  );
  const inventarioChart = useMemo(
    () => ({
      labels: sparsifyLabels(inventarioLabels.map(label => truncateLabel(label, 10)), 6),
      datasets: [{ data: (inventario || []).slice(0, 10).map(item => item.total_venta ?? 0) }],
    }),
    [inventario, inventarioLabels]
  );

  const rotacionLabels = useMemo(
    () => (rotacion || []).slice(0, 10).map(item => item.producto),
    [rotacion]
  );
  const rotacionChart = useMemo(
    () => ({
      labels: sparsifyLabels(rotacionLabels.map(label => truncateLabel(label, 10)), 6),
      datasets: [{ data: (rotacion || []).slice(0, 10).map(item => item.rotacion ?? 0) }],
    }),
    [rotacion, rotacionLabels]
  );

  const rentabilidadLabels = useMemo(
    () => (rentabilidad || []).slice(0, 10).map(item => item.producto),
    [rentabilidad]
  );
  const rentabilidadChart = useMemo(
    () => ({
      labels: sparsifyLabels(rentabilidadLabels.map(label => truncateLabel(label, 10)), 6),
      datasets: [{ data: (rentabilidad || []).slice(0, 10).map(item => item.rentabilidad ?? 0) }],
    }),
    [rentabilidad, rentabilidadLabels]
  );

  return (
    <ScreenShell title="Inventario y productos" subtitle="Rotacion y margen por articulo">
      <>
        
        {errors.length ? (
          <View style={styles.errorBox}>
            {errors.map(message => (
              <Text key={message} style={styles.errorText}>
                {message}
              </Text>
            ))}
          </View>
        ) : null}
        <ChartCard
          title="Inventario valorizado"
          subtitle="Top productos por valor"
          data={inventarioChart}
          kind="bar"
          colorRgb="249, 115, 22"
          width={chartWidth}
          height={280}
          xLabel="Producto"
          yLabel="Total venta"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, inventarioChart.labels.length * 44)}
          enterDelay={60}
          isLoading={loadingInventario}
          isEmpty={!inventario.length}
          emptyMessage="Sin datos de inventario."
          detailLabels={inventarioLabels}
        />

        <ChartCard
          title="Rotacion de productos"
          subtitle="Movimientos destacados"
          data={rotacionChart}
          kind="bar"
          colorRgb="59, 130, 246"
          width={chartWidth}
          height={280}
          xLabel="Producto"
          yLabel="Rotacion"
          formatValue={formatCompact}
          formatDetailValue={formatNumberExact}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, rotacionChart.labels.length * 44)}
          enterDelay={120}
          isLoading={loadingRotacion}
          isEmpty={!rotacion.length}
          emptyMessage="Sin datos de rotacion."
          detailLabels={rotacionLabels}
        />

        <ChartCard
          title="Rentabilidad de productos"
          subtitle="Margen acumulado"
          data={rentabilidadChart}
          kind="bar"
          colorRgb="16, 185, 129"
          width={chartWidth}
          height={280}
          xLabel="Producto"
          yLabel="Rentabilidad"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, rentabilidadChart.labels.length * 44)}
          enterDelay={180}
          isLoading={loadingRentabilidad}
          isEmpty={!rentabilidad.length}
          emptyMessage="Sin datos de rentabilidad."
          detailLabels={rentabilidadLabels}
        />
      </>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: '#DC2626',
    fontSize: 13,
  },
  errorBox: {
    marginBottom: 12,
  },
});
