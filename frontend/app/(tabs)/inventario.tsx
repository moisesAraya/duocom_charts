/**
 * inventario.tsx — Pestaña de Inventario del dashboard.
 *
 * Muestra tres secciones:
 *  - Inventario valorizado: top 20 productos con mayor valor en stock.
 *  - Rotación de productos: top 20 más vendidos (cantidad).
 *  - Rentabilidad: top 20 con mayor margen de contribución.
 *
 * Datos: endpoints /dashboard/inventario-valorizado, /dashboard/productos-rotacion,
 * /dashboard/rentabilidad-productos.
 */

import { API_CONFIG, api } from '@/constants/api';
import { ChartCard } from '@/components/dashboard/chart-card';
import { FiltersPanel } from '@/components/dashboard/filters-panel';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import { useDashboardFilters } from '@/components/dashboard/filters-context';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { DetailModal } from "@/components/dashboard/detail-modal";
import {
  formatCompact,
  formatCurrency,
  formatMoneyCompact,
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

const compactProductLabel = (value: string): string => {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= 14) return clean;
  const words = clean.split(' ').filter(Boolean);
  if (words.length >= 2) {
    return truncateLabel(`${words[0]} ${words[1]}`, 14);
  }
  return truncateLabel(clean, 14);
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export default function InventarioScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);
  const { requestParams = {} } = useDashboardFilters();

  const [loadingInventario, setLoadingInventario] = useState(true);
  const [loadingRotacion, setLoadingRotacion] = useState(true);
  const [loadingRentabilidad, setLoadingRentabilidad] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [inventario, setInventario] = useState<InventarioRow[]>([]);
  const [rotacion, setRotacion] = useState<RotacionRow[]>([]);
  const [rentabilidad, setRentabilidad] = useState<RentabilidadRow[]>([]);
  const [showInventarioModal, setShowInventarioModal] = useState(false);
  const [showRotacionModal, setShowRotacionModal] = useState(false);
  const [showRentabilidadModal, setShowRentabilidadModal] = useState(false);

  useEffect(() => {
    const loadInventario = async () => {
      setLoadingInventario(true);
      setErrors([]);
      try {
        const response = await api.get('/api/dashboard/inventario-valorizado', {
          params: requestParams,
        });
        const rows = response.data?.data ?? [];
        setInventario(
          rows.map((row: any) => ({
            producto: String(row.producto ?? ''),
            total_venta: toNumber(row.total_venta ?? row.total ?? row.monto),
          })),
        );
      } catch (error) {
        setInventario([]);
        setErrors(current => [...current, `Inventario sin respuesta (${API_CONFIG.BASE_URL}).`]);
      } finally {
        setLoadingInventario(false);
      }
    };

    void loadInventario();
  }, [requestParams]);

  useEffect(() => {
    const loadRotacion = async () => {
      setLoadingRotacion(true);
      setErrors([]);
      try {
        const response = await api.get('/api/dashboard/productos-rotacion', {
          params: requestParams,
        });
        const rows = response.data?.data ?? [];
        setRotacion(
          rows.map((row: any) => ({
            producto: String(row.producto ?? ''),
            rotacion: toNumber(row.rotacion ?? row.cantidad ?? row.total),
          })),
        );
      } catch (error) {
        setRotacion([]);
        setErrors(current => [...current, 'Rotacion sin respuesta.']);
      } finally {
        setLoadingRotacion(false);
      }
    };

    void loadRotacion();
  }, [requestParams]);

  useEffect(() => {
    const loadRentabilidad = async () => {
      setLoadingRentabilidad(true);
      setErrors([]);
      try {
        const response = await api.get('/api/dashboard/rentabilidad-productos', {
          params: requestParams,
        });
        const rows = response.data?.data ?? [];
        setRentabilidad(
          rows.map((row: any) => ({
            producto: String(row.producto ?? ''),
            rentabilidad: toNumber(row.rentabilidad ?? row.contrib ?? row.total),
          })),
        );
      } catch (error) {
        setRentabilidad([]);
        setErrors(current => [...current, 'Rentabilidad sin respuesta.']);
      } finally {
        setLoadingRentabilidad(false);
      }
    };

    void loadRentabilidad();
  }, [requestParams]);

  const inventarioLabels = useMemo(
    () => (inventario || []).slice(0, 8).map(item => item.producto),
    [inventario]
  );
  const inventarioChart = useMemo(
    () => ({
      labels: sparsifyLabels(inventarioLabels.map(label => compactProductLabel(label)), 5),
      datasets: [{ data: (inventario || []).slice(0, 8).map(item => item.total_venta ?? 0) }],
    }),
    [inventario, inventarioLabels]
  );

  const rotacionLabels = useMemo(
    () => (rotacion || []).slice(0, 8).map(item => item.producto),
    [rotacion]
  );
  const rotacionChart = useMemo(
    () => ({
      labels: sparsifyLabels(rotacionLabels.map(label => compactProductLabel(label)), 5),
      datasets: [{ data: (rotacion || []).slice(0, 8).map(item => item.rotacion ?? 0) }],
    }),
    [rotacion, rotacionLabels]
  );

  const rentabilidadLabels = useMemo(
    () => (rentabilidad || []).slice(0, 8).map(item => item.producto),
    [rentabilidad]
  );
  const rentabilidadChart = useMemo(
    () => ({
      labels: sparsifyLabels(rentabilidadLabels.map(label => compactProductLabel(label)), 5),
      datasets: [{ data: (rentabilidad || []).slice(0, 8).map(item => item.rentabilidad ?? 0) }],
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
          subtitle="Valor monetario total en stock (Stock × Precio). Identifica dónde está concentrado el capital."
          headerContent={
            <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
              <Pressable
                style={styles.detailButton}
                onPress={() => setShowInventarioModal(true)}
              >
                <Text style={styles.detailButtonText}>
                  Ver detalle
                </Text>
              </Pressable>
            </View>
          }
          data={inventarioChart}
          kind="bar"
          colorRgb="249, 115, 22"
          width={chartWidth}
          height={280}
          xLabel="Producto"
          yLabel="Total venta ($)"
          formatValue={formatMoneyCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatMoneyCompact}
          scrollable
          minWidth={Math.max(chartWidth, inventarioChart.labels.length * 68)}
          enterDelay={60}
          isLoading={loadingInventario}
          isEmpty={!inventario.length}
          emptyMessage="Sin datos de inventario."
          detailLabels={inventarioLabels}
          showValuesOnTop={false}
          hideHint={true}
        />

        <ChartCard
          title="Rotacion de productos"
          subtitle="Volumen de unidades vendidas (frecuencia de salida). Útil para evitar quiebres de stock."
          headerContent={
            <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
              <Pressable
                style={styles.detailButton}
                onPress={() => setShowRotacionModal(true)}
              >
                <Text style={styles.detailButtonText}>
                  Ver detalle
                </Text>
              </Pressable>
            </View>
          }
          data={rotacionChart}
          kind="bar"
          colorRgb="59, 130, 246"
          width={chartWidth}
          height={280}
          xLabel="Producto"
          yLabel="Rotacion ($)"
          formatValue={formatMoneyCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatMoneyCompact}
          scrollable
          minWidth={Math.max(chartWidth, rotacionChart.labels.length * 68)}
          enterDelay={120}
          isLoading={loadingRotacion}
          isEmpty={!rotacion.length}
          emptyMessage="Sin datos de rotacion."
          detailLabels={rotacionLabels}
          showValuesOnTop={false}
          hideHint={true}
        />

        <ChartCard
          title="Rentabilidad de productos"
          subtitle="Margen de contribución total (Ganancia real). Identifica qué artículos mueven la aguja."
          headerContent={
            <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
              <Pressable
                style={styles.detailButton}
                onPress={() => setShowRentabilidadModal(true)}
              >
                <Text style={styles.detailButtonText}>
                  Ver detalle
                </Text>
              </Pressable>
            </View>
          }
          data={rentabilidadChart}
          kind="bar"
          colorRgb="16, 185, 129"
          width={chartWidth}
          height={280}
          xLabel="Producto"
          yLabel="Rentabilidad ($)"
          formatValue={formatMoneyCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatMoneyCompact}
          scrollable
          minWidth={Math.max(chartWidth, rentabilidadChart.labels.length * 68)}
          enterDelay={180}
          isLoading={loadingRentabilidad}
          isEmpty={!rentabilidad.length}
          emptyMessage="Sin datos de rentabilidad."
          detailLabels={rentabilidadLabels}
          showValuesOnTop={false}
          hideHint={true}
        />

        <DetailModal
          visible={showInventarioModal}
          onClose={() => setShowInventarioModal(false)}
          title="Inventario Valorizado"
          subtitle="Top 20 productos por valor total en stock"
          headers={["Producto", "Valor Stock"]}
          rows={inventario.map(r => ({
            label: r.producto,
            values: [r.total_venta]
          }))}
          accentColor="#F97316"
        />

        <DetailModal
          visible={showRotacionModal}
          onClose={() => setShowRotacionModal(false)}
          title="Rotación de Productos"
          subtitle="Top 20 productos con mayor flujo de salida"
          headers={["Producto", "Unidades/Venta"]}
          rows={rotacion.map(r => ({
            label: r.producto,
            values: [r.rotacion]
          }))}
          accentColor="#3B82F6"
        />

        <DetailModal
          visible={showRentabilidadModal}
          onClose={() => setShowRentabilidadModal(false)}
          title="Rentabilidad de Productos"
          subtitle="Top 20 productos por margen acumulado"
          headers={["Producto", "Rentabilidad"]}
          rows={rentabilidad.map(r => ({
            label: r.producto,
            values: [r.rentabilidad]
          }))}
          accentColor="#10B981"
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
  detailButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detailButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
