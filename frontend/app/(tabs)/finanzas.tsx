import { api } from '@/constants/api';
import { ChartCard } from '@/components/dashboard/chart-card';
import { FilterRow } from '@/components/dashboard/chart-filters';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import {
  endOfMonth,
  formatCompact,
  formatCurrency,
  formatDateInput,
  sparsifyLabels,
  startOfMonth,
} from '@/components/dashboard/utils';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

interface CuentaRow {
  cliente?: string;
  proveedor?: string;
  saldo: number;
}

interface MorosoRow {
  cliente: string;
  saldo: number;
  dias: number;
}

type ResumenProveedorRow = {
  proveedor: string;
  deuda_total: number;
  deuda_vencida: number;
  deuda_por_vencer: number;
  mayor_atraso_dias: number;
};

type FlujoRow = {
  proveedor: string;
  periodo: string;
  periodo_inicio: string;
  periodo_fin: string;
  monto_periodo: number;
  deuda_vencida_periodo: number;
  deuda_por_vencer_periodo: number;
  acumulado: number;
  mayor_atraso_dias: number;
  dias_para_vencer_min: number;
};

type VencidoProveedorRow = {
  proveedor: string;
  deuda_vencida: number;
  mayor_atraso_dias: number;
  menor_fecha_venc: string | null;
  mayor_fecha_venc: string | null;
};

type GridColumn<T> = {
  key: string;
  title: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => string;
};

const truncateLabel = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const formatSigned = (value: number): string => {
  if (!Number.isFinite(value)) return '$0';
  const abs = formatCurrency(Math.abs(value));
  if (value < 0) return `-${abs}`;
  return abs;
};

function DataGridCard<T>({
  title,
  subtitle,
  loading,
  rows,
  columns,
  emptyMessage,
  initialLimit = 8,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  rows: T[];
  columns: GridColumn<T>[];
  emptyMessage: string;
  initialLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, initialLimit);
  const hiddenCount = Math.max(0, rows.length - initialLimit);

  return (
    <View style={grid.card}>
      <Text style={grid.title}>{title}</Text>
      {subtitle ? <Text style={grid.subtitle}>{subtitle}</Text> : null}
      {loading ? (
        <View style={grid.loadingWrap}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={grid.loadingText}>Cargando datos...</Text>
        </View>
      ) : rows.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={grid.headerRow}>
              {columns.map((column) => (
                <Text
                  key={column.key}
                  style={[
                    grid.headerCell,
                    { width: column.width ?? 140 },
                    column.align === 'right' && grid.right,
                    column.align === 'center' && grid.center,
                  ]}
                >
                  {column.title}
                </Text>
              ))}
            </View>
            {visibleRows.map((row, rowIndex) => (
              <View key={`${title}-${rowIndex}`} style={grid.dataRow}>
                {columns.map((column) => (
                  <Text
                    key={`${column.key}-${rowIndex}`}
                    style={[
                      grid.dataCell,
                      { width: column.width ?? 140 },
                      column.align === 'right' && grid.right,
                      column.align === 'center' && grid.center,
                    ]}
                  >
                    {column.render(row)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <Text style={grid.emptyText}>{emptyMessage}</Text>
      )}

      {!loading && hiddenCount > 0 ? (
        <Pressable style={grid.toggleButton} onPress={() => setExpanded((prev) => !prev)}>
          <Text style={grid.toggleButtonText}>
            {expanded ? 'Ver menos' : `Ver ${hiddenCount} filas más`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function FinanzasScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);

  const [loadingCobrar, setLoadingCobrar] = useState(true);
  const [loadingPagar, setLoadingPagar] = useState(true);
  const [loadingMorosos, setLoadingMorosos] = useState(true);
  const [loadingResumenProveedores, setLoadingResumenProveedores] = useState(true);
  const [loadingFlujo, setLoadingFlujo] = useState(true);
  const [loadingVencidosProveedor, setLoadingVencidosProveedor] = useState(true);

  const [cuentasCobrar, setCuentasCobrar] = useState<CuentaRow[]>([]);
  const [cuentasPagar, setCuentasPagar] = useState<CuentaRow[]>([]);
  const [morosos, setMorosos] = useState<MorosoRow[]>([]);
  const [resumenProveedores, setResumenProveedores] = useState<ResumenProveedorRow[]>([]);
  const [flujoSemanal, setFlujoSemanal] = useState<FlujoRow[]>([]);
  const [flujoMensual, setFlujoMensual] = useState<FlujoRow[]>([]);
  const [proveedoresVencidos, setProveedoresVencidos] = useState<VencidoProveedorRow[]>([]);

  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const monthParams = useMemo(() => {
    const baseDate = new Date(selectedYear, selectedMonth - 1, 1);
    return {
      desde: formatDateInput(startOfMonth(baseDate)),
      hasta: formatDateInput(endOfMonth(baseDate)),
    };
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const loadCobrar = async () => {
      setLoadingCobrar(true);
      try {
        const response = await api.get('/api/dashboard/cuentas-cobrar', { params: monthParams });
        setCuentasCobrar(response.data?.data ?? []);
      } catch {
        setCuentasCobrar([]);
      } finally {
        setLoadingCobrar(false);
      }
    };
    void loadCobrar();
  }, [monthParams]);

  useEffect(() => {
    const loadPagar = async () => {
      setLoadingPagar(true);
      try {
        const response = await api.get('/api/dashboard/cuentas-pagar', { params: monthParams });
        setCuentasPagar(response.data?.data ?? []);
      } catch {
        setCuentasPagar([]);
      } finally {
        setLoadingPagar(false);
      }
    };
    void loadPagar();
  }, [monthParams]);

  useEffect(() => {
    const loadMorosos = async () => {
      setLoadingMorosos(true);
      try {
        const response = await api.get('/api/dashboard/clientes-morosos', { params: monthParams });
        setMorosos(response.data?.data ?? []);
      } catch {
        setMorosos([]);
      } finally {
        setLoadingMorosos(false);
      }
    };
    void loadMorosos();
  }, [monthParams]);

  useEffect(() => {
    const loadResumen = async () => {
      setLoadingResumenProveedores(true);
      try {
        const response = await api.get('/api/dashboard/cuentas-pagar/resumen-proveedor', {
          params: { ...monthParams, limit: 5000 },
        });
        setResumenProveedores(response.data?.data ?? []);
      } catch {
        setResumenProveedores([]);
      } finally {
        setLoadingResumenProveedores(false);
      }
    };
    void loadResumen();
  }, [monthParams]);

  useEffect(() => {
    const loadFlujo = async () => {
      setLoadingFlujo(true);
      try {
        const response = await api.get('/api/dashboard/cuentas-pagar/flujo', {
          params: { ...monthParams, limit: 5000 },
        });
        setFlujoSemanal(response.data?.data?.semanal ?? []);
        setFlujoMensual(response.data?.data?.mensual ?? []);
      } catch {
        setFlujoSemanal([]);
        setFlujoMensual([]);
      } finally {
        setLoadingFlujo(false);
      }
    };
    void loadFlujo();
  }, [monthParams]);

  useEffect(() => {
    const loadVencidosProveedor = async () => {
      setLoadingVencidosProveedor(true);
      try {
        const response = await api.get('/api/dashboard/cuentas-pagar/vencidos-proveedor', {
          params: { ...monthParams, limit: 5000 },
        });
        setProveedoresVencidos(response.data?.data ?? []);
      } catch {
        setProveedoresVencidos([]);
      } finally {
        setLoadingVencidosProveedor(false);
      }
    };
    void loadVencidosProveedor();
  }, [monthParams]);

  const cobrarLabels = useMemo(
    () => cuentasCobrar.slice(0, 10).map((item) => item.cliente ?? 'Doc'),
    [cuentasCobrar]
  );
  const cobrarChart = useMemo(
    () => ({
      labels: sparsifyLabels(cobrarLabels.map((label) => truncateLabel(label, 8)), 6),
      datasets: [{ data: cuentasCobrar.slice(0, 10).map((item) => item.saldo ?? 0) }],
    }),
    [cuentasCobrar, cobrarLabels]
  );

  const pagarLabels = useMemo(
    () => cuentasPagar.slice(0, 10).map((item) => item.proveedor ?? 'Prov'),
    [cuentasPagar]
  );
  const pagarChart = useMemo(
    () => ({
      labels: sparsifyLabels(pagarLabels.map((label) => truncateLabel(label, 8)), 6),
      datasets: [{ data: cuentasPagar.slice(0, 10).map((item) => item.saldo ?? 0) }],
    }),
    [cuentasPagar, pagarLabels]
  );

  const morososLabels = useMemo(
    () => morosos.slice(0, 10).map((item) => item.cliente ?? 'Cliente'),
    [morosos]
  );
  const morososChart = useMemo(
    () => ({
      labels: sparsifyLabels(morososLabels.map((label) => truncateLabel(label, 8)), 6),
      datasets: [{ data: morosos.slice(0, 10).map((item) => item.saldo ?? 0) }],
    }),
    [morosos, morososLabels]
  );

  const totalCobrar = cuentasCobrar.reduce((acc, row) => acc + (row.saldo ?? 0), 0);
  const totalPagar = cuentasPagar.reduce((acc, row) => acc + (row.saldo ?? 0), 0);

  const resumenColumns: GridColumn<ResumenProveedorRow>[] = [
    { key: 'prov', title: 'Proveedor', width: 220, render: (row) => row.proveedor },
    { key: 'tot', title: 'Deuda Total', width: 130, align: 'right', render: (row) => formatSigned(row.deuda_total) },
    { key: 'ven', title: 'Vencida', width: 120, align: 'right', render: (row) => formatSigned(row.deuda_vencida) },
    { key: 'pven', title: 'Por Vencer', width: 120, align: 'right', render: (row) => formatSigned(row.deuda_por_vencer) },
    { key: 'atr', title: 'Mayor Atraso', width: 110, align: 'right', render: (row) => `${row.mayor_atraso_dias} d` },
  ];

  const flujoColumns: GridColumn<FlujoRow>[] = [
    { key: 'prov', title: 'Proveedor', width: 220, render: (row) => row.proveedor },
    { key: 'per', title: 'Periodo', width: 100, render: (row) => row.periodo },
    { key: 'mp', title: 'Monto Periodo', width: 130, align: 'right', render: (row) => formatSigned(row.monto_periodo) },
    { key: 'acum', title: 'Acumulado', width: 130, align: 'right', render: (row) => formatSigned(row.acumulado) },
    { key: 'ven', title: 'Vencida', width: 120, align: 'right', render: (row) => formatSigned(row.deuda_vencida_periodo) },
    { key: 'pv', title: 'Por Vencer', width: 120, align: 'right', render: (row) => formatSigned(row.deuda_por_vencer_periodo) },
    { key: 'atr', title: 'Atraso Máx.', width: 110, align: 'right', render: (row) => `${row.mayor_atraso_dias} d` },
  ];

  const vencidosColumns: GridColumn<VencidoProveedorRow>[] = [
    { key: 'prov', title: 'Proveedor', width: 220, render: (row) => row.proveedor },
    { key: 'ven', title: 'Deuda Vencida', width: 130, align: 'right', render: (row) => formatSigned(row.deuda_vencida) },
    { key: 'atr', title: 'Mayor Atraso', width: 110, align: 'right', render: (row) => `${row.mayor_atraso_dias} d` },
    { key: 'fmin', title: 'Primera Venc.', width: 120, align: 'center', render: (row) => row.menor_fecha_venc ?? '-' },
    { key: 'fmax', title: 'Última Venc.', width: 120, align: 'center', render: (row) => row.mayor_fecha_venc ?? '-' },
  ];

  return (
    <ScreenShell title="Finanzas" subtitle="Cobros, pagos y riesgo">
      <>
        <FilterRow title="Periodo financiero">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Año</Text>
              <Pressable style={ui.picker} onPress={() => setShowYearPicker(true)}>
                <Text style={ui.pickerText}>{selectedYear}</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Mes</Text>
              <Pressable style={ui.picker} onPress={() => setShowMonthPicker(true)}>
                <Text style={ui.pickerText}>
                  {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][selectedMonth - 1]}
                </Text>
              </Pressable>
            </View>
          </View>
        </FilterRow>

        <ChartCard
          title="Cuentas por cobrar"
          subtitle={`Total ${formatCurrency(totalCobrar)}`}
          data={cobrarChart}
          kind="bar"
          colorRgb="59, 130, 246"
          width={chartWidth}
          height={280}
          xLabel="Cliente"
          yLabel="Saldo"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, cobrarChart.labels.length * 44)}
          enterDelay={60}
          isLoading={loadingCobrar}
          isEmpty={!cuentasCobrar.length}
          emptyMessage="Sin cuentas por cobrar."
          detailLabels={cobrarLabels}
        />

        <ChartCard
          title="Cuentas por pagar"
          subtitle={`Total ${formatCurrency(totalPagar)}`}
          data={pagarChart}
          kind="bar"
          colorRgb="239, 68, 68"
          width={chartWidth}
          height={280}
          xLabel="Proveedor"
          yLabel="Saldo"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, pagarChart.labels.length * 44)}
          enterDelay={120}
          isLoading={loadingPagar}
          isEmpty={!cuentasPagar.length}
          emptyMessage="Sin cuentas por pagar."
          detailLabels={pagarLabels}
        />

        <ChartCard
          title="Clientes morosos"
          subtitle="Top saldo vencido"
          data={morososChart}
          kind="bar"
          colorRgb="245, 158, 11"
          width={chartWidth}
          height={280}
          xLabel="Cliente"
          yLabel="Saldo"
          formatValue={formatCompact}
          formatDetailValue={formatCurrency}
          formatAxisValue={formatCompact}
          scrollable
          minWidth={Math.max(chartWidth, morososChart.labels.length * 44)}
          enterDelay={180}
          isLoading={loadingMorosos}
          isEmpty={!morosos.length}
          emptyMessage="Sin morosidad detectada."
          detailLabels={morososLabels}
        />

        <DataGridCard
          title="Grilla CxP: Totales por proveedor"
          subtitle="Notas de crédito restan deuda. Facturas y notas de débito suman."
          loading={loadingResumenProveedores}
          rows={resumenProveedores}
          columns={resumenColumns}
          emptyMessage="Sin datos de resumen por proveedor."
          initialLimit={10}
        />

        <DataGridCard
          title="Grilla CxP: Flujo semanal acumulado"
          subtitle="Ordenado desde más vencido hasta por vencer (FechaVenc)."
          loading={loadingFlujo}
          rows={flujoSemanal}
          columns={flujoColumns}
          emptyMessage="Sin datos de flujo semanal."
          initialLimit={8}
        />

        <DataGridCard
          title="Grilla CxP: Flujo mensual acumulado"
          subtitle="Acumulado por proveedor sin mostrar documentos."
          loading={loadingFlujo}
          rows={flujoMensual}
          columns={flujoColumns}
          emptyMessage="Sin datos de flujo mensual."
          initialLimit={8}
        />

        <DataGridCard
          title="Grilla CxP: Proveedores con vencidos"
          subtitle="Solo proveedores con deuda vencida."
          loading={loadingVencidosProveedor}
          rows={proveedoresVencidos}
          columns={vencidosColumns}
          emptyMessage="No hay proveedores vencidos para el periodo seleccionado."
          initialLimit={10}
        />

        <Modal visible={showYearPicker} transparent animationType="fade">
          <Pressable style={modal.backdrop} onPress={() => setShowYearPicker(false)}>
            <View style={modal.card}>
              <Text style={modal.title}>Seleccionar Año</Text>
              <ScrollView>
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((year) => (
                  <Pressable
                    key={year}
                    onPress={() => {
                      setSelectedYear(year);
                      setShowYearPicker(false);
                    }}
                    style={[modal.item, year === selectedYear && { backgroundColor: '#EBF5FF' }]}
                  >
                    <Text style={[modal.itemText, year === selectedYear && { color: '#3B82F6', fontWeight: '700' }]}>
                      {year}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={showMonthPicker} transparent animationType="fade">
          <Pressable style={modal.backdrop} onPress={() => setShowMonthPicker(false)}>
            <View style={modal.card}>
              <Text style={modal.title}>Seleccionar Mes</Text>
              <View style={modal.monthGrid}>
                {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, idx) => {
                  const mm = idx + 1;
                  const selected = mm === selectedMonth;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setSelectedMonth(mm);
                        setShowMonthPicker(false);
                      }}
                      style={[
                        modal.monthItem,
                        selected
                          ? { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }
                          : { backgroundColor: '#F0F7FF', borderColor: '#E0E0E0' },
                      ]}
                    >
                      <Text style={[modal.monthText, selected ? { color: '#fff' } : { color: '#3B82F6' }]}>{m}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Modal>
      </>
    </ScreenShell>
  );
}

const ui = StyleSheet.create({
  label: { fontSize: 12, color: '#666', marginBottom: 6, fontWeight: '600' },
  picker: {
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#F0F7FF',
  },
  pickerText: { fontSize: 15, fontWeight: '600', color: '#3B82F6' },
});

const grid = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    color: '#6B7280',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  headerCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dataCell: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 11,
    color: '#0F172A',
  },
  right: {
    textAlign: 'right',
  },
  center: {
    textAlign: 'center',
  },
  loadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 12,
  },
  emptyText: {
    paddingVertical: 12,
    color: '#6B7280',
    fontSize: 13,
  },
  toggleButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
});

const modal = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  itemText: { fontSize: 16, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthItem: {
    padding: 14,
    borderRadius: 10,
    width: '30%',
    borderWidth: 1,
  },
  monthText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
