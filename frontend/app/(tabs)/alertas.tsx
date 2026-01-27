import { api } from '@/constants/api';
import { Card, EmptyState } from '@/components/dashboard/card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  formatCompact,
  formatNumberExact,
  sparsifyLabels,
} from '@/components/dashboard/utils';

interface QuiebreRow {
  producto: string;
  stock: number;
  stock_min: number;
}

interface ReposicionRow {
  producto: string;
  stock_reposicion: number;
}

interface EventoRow {
  fecha: string | Date;
  sucursal: string;
  documento: string;
  total: number;
}

interface ConsumoRow {
  producto: string;
  consumo: number;
}

const truncateLabel = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

export default function AlertasScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [quiebre, setQuiebre] = useState<QuiebreRow[]>([]);
  const [reposicion, setReposicion] = useState<ReposicionRow[]>([]);
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [consumo, setConsumo] = useState<ConsumoRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrors([]);
      try {
        const [quiebreResponse, reposResponse, eventosResponse, consumoResponse] = await Promise.allSettled([
          api.get('/api/dashboard/productos-quiebre-stock'),
          api.get('/api/dashboard/tiempo-reposicion'),
          api.get('/api/dashboard/registro-eventos'),
          api.get('/api/dashboard/consumo-materias-primas'),
        ]);

        const nextErrors: string[] = [];

        if (quiebreResponse.status === 'fulfilled') {
          setQuiebre(quiebreResponse.value.data?.data ?? []);
        } else {
          setQuiebre([]);
          nextErrors.push('Quiebre stock sin respuesta.');
        }

        if (reposResponse.status === 'fulfilled') {
          setReposicion(reposResponse.value.data?.data ?? []);
        } else {
          setReposicion([]);
          nextErrors.push('Reposicion sin respuesta.');
        }

        if (eventosResponse.status === 'fulfilled') {
          setEventos(eventosResponse.value.data?.data ?? []);
        } else {
          setEventos([]);
          nextErrors.push('Registro eventos sin respuesta.');
        }

        if (consumoResponse.status === 'fulfilled') {
          setConsumo(consumoResponse.value.data?.data ?? []);
        } else {
          setConsumo([]);
          nextErrors.push('Consumo materias primas sin respuesta.');
        }

        setErrors(nextErrors);
      } catch (error) {
        setQuiebre([]);
        setReposicion([]);
        setEventos([]);
        setConsumo([]);
        setErrors(['No se pudo cargar datos de alertas.']);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const quiebreLabels = useMemo(
    () => quiebre.slice(0, 10).map(item => item.producto),
    [quiebre]
  );
  const quiebreChart = useMemo(
    () => ({
      labels: sparsifyLabels(quiebreLabels.map(label => truncateLabel(label, 8)), 6),
      datasets: [{ data: quiebre.slice(0, 10).map(item => item.stock ?? 0) }],
    }),
    [quiebre, quiebreLabels]
  );

  const reposicionLabels = useMemo(
    () => reposicion.slice(0, 10).map(item => item.producto),
    [reposicion]
  );
  const reposicionChart = useMemo(
    () => ({
      labels: sparsifyLabels(reposicionLabels.map(label => truncateLabel(label, 8)), 6),
      datasets: [{ data: reposicion.slice(0, 10).map(item => item.stock_reposicion ?? 0) }],
    }),
    [reposicion, reposicionLabels]
  );

  const consumoLabels = useMemo(
    () => consumo.slice(0, 10).map(item => item.producto),
    [consumo]
  );
  const consumoChart = useMemo(
    () => ({
      labels: sparsifyLabels(consumoLabels.map(label => truncateLabel(label, 8)), 6),
      datasets: [{ data: consumo.slice(0, 10).map(item => item.consumo ?? 0) }],
    }),
    [consumo, consumoLabels]
  );

  return (
    <ScreenShell title="Alertas y control" subtitle="Stock critico y monitoreo">
      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Cargando datos...</Text>
        </View>
      ) : (
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
            title="Quiebre de stock"
            subtitle="Productos bajo el minimo"
            data={quiebreChart}
            kind="bar"
            colorRgb="239, 68, 68"
            width={chartWidth}
            height={260}
            xLabel="Producto"
            yLabel="Stock"
            formatValue={formatCompact}
            formatDetailValue={formatNumberExact}
            formatAxisValue={formatCompact}
            scrollable
            minWidth={Math.max(chartWidth, quiebreChart.labels.length * 44)}
            enterDelay={60}
            isEmpty={!quiebre.length}
            emptyMessage="Sin quiebres de stock."
            detailLabels={quiebreLabels}
          />

          <ChartCard
            title="Reposicion sugerida"
            subtitle="Stock objetivo por producto"
            data={reposicionChart}
            kind="bar"
            colorRgb="245, 158, 11"
            width={chartWidth}
            height={260}
            xLabel="Producto"
            yLabel="Reposicion"
            formatValue={formatCompact}
            formatDetailValue={formatNumberExact}
            formatAxisValue={formatCompact}
            scrollable
            minWidth={Math.max(chartWidth, reposicionChart.labels.length * 44)}
            enterDelay={120}
            isEmpty={!reposicion.length}
            emptyMessage="Sin datos de reposicion."
            detailLabels={reposicionLabels}
          />

          <ChartCard
            title="Consumo materias primas"
            subtitle="Top consumo"
            data={consumoChart}
            kind="bar"
            colorRgb="16, 185, 129"
            width={chartWidth}
            height={260}
            xLabel="Producto"
            yLabel="Consumo"
            formatValue={formatCompact}
            formatDetailValue={formatNumberExact}
            formatAxisValue={formatCompact}
            scrollable
            minWidth={Math.max(chartWidth, consumoChart.labels.length * 44)}
            enterDelay={180}
            isEmpty={!consumo.length}
            emptyMessage="Sin datos de consumo."
            detailLabels={consumoLabels}
          />

          <Card title="Registro de eventos" subtitle="Ultimos movimientos">
            {eventos.length ? (
              <View>
                {eventos.slice(0, 6).map((row, index) => (
                  <View key={`${row.documento}-${index}`} style={styles.listRow}>
                    <Text style={styles.listPrimary}>{row.sucursal || 'Sucursal'}</Text>
                    <Text style={styles.listSecondary}>{row.documento}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState message="Sin eventos recientes." />
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
