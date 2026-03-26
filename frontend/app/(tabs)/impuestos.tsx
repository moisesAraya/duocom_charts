/**
 * impuestos.tsx — Pestaña de Impuestos del dashboard.
 *
 * Muestra el resumen por tipo de documento (F29) obtenido del SP _F29b.
 */

import { api } from '@/constants/api';
import { FilterRow } from '@/components/dashboard/chart-filters';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import {
  formatCurrency,
  formatDateInput,
  startOfMonth,
  endOfMonth,
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
} from 'react-native';

type ImpuestoRow = {
  descripcion_t_documento?: string;
  codigo_sii?: string;
  folio_inicial?: number;
  folio_final?: number;
  cant_folios?: number;
  afecto?: number;
  iva?: number;
  exento?: number;
  otros_imp?: number;
  total?: number;
  // Fallbacks para nombres en mayúsculas (común en Firebird)
  DESCRIPCION?: string;
  CODIGO_SII?: string;
  FOLIO_INICIAL?: number;
  FOLIO_FINAL?: number;
  CANT_FOLIOS?: number;
  AFECTO?: number;
  IVA?: number;
  EXENTO?: number;
  OTROS_IMP?: number;
  TOTAL?: number;
};

type GridColumn<T> = {
  key: string;
  title: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => string;
};

function DataGridCard<T>({
  title,
  subtitle,
  loading,
  rows,
  columns,
  emptyMessage,
  initialLimit = 10,
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
                    { width: column.width ?? 120 },
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
                      { width: column.width ?? 120 },
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

export default function ImpuestosScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ImpuestoRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const params = useMemo(() => ({
    ano: selectedYear,
    mes: selectedMonth,
  }), [selectedMonth, selectedYear]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/dashboard/impuestos-f29', {
          params: { ...params },
        });
        setData(response.data?.data ?? []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [params]);

  const toNumber = (val: any) => (typeof val === 'number' ? val : 0);

  const columns: GridColumn<ImpuestoRow>[] = [
    { 
      key: 'desc', 
      title: 'Descripción T/Documento', 
      width: 180, 
      render: (r) => r.descripcion_t_documento ?? r.DESCRIPCION ?? '' 
    },
    { 
      key: 'sii', 
      title: 'Código S.I.I', 
      width: 90, 
      align: 'center', 
      render: (r) => r.codigo_sii ?? r.CODIGO_SII ?? '' 
    },
    { 
      key: 'ini', 
      title: 'Folio Inicial', 
      width: 100, 
      align: 'right', 
      render: (r) => (r.folio_inicial ?? r.FOLIO_INICIAL ?? 0).toString() 
    },
    { 
      key: 'fin', 
      title: 'Folio Final', 
      width: 100, 
      align: 'right', 
      render: (r) => (r.folio_final ?? r.FOLIO_FINAL ?? 0).toString() 
    },
    { 
      key: 'cant', 
      title: 'Cant Folios', 
      width: 90, 
      align: 'right', 
      render: (r) => (r.cant_folios ?? r.CANT_FOLIOS ?? 0).toString() 
    },
    { 
      key: 'afecto', 
      title: 'Afecto', 
      width: 110, 
      align: 'right', 
      render: (r) => formatCurrency(toNumber(r.afecto ?? r.AFECTO)) 
    },
    { 
      key: 'iva', 
      title: 'I.v.a', 
      width: 110, 
      align: 'right', 
      render: (r) => formatCurrency(toNumber(r.iva ?? r.IVA)) 
    },
    { 
      key: 'exento', 
      title: 'Exento', 
      width: 110, 
      align: 'right', 
      render: (r) => formatCurrency(toNumber(r.exento ?? r.EXENTO)) 
    },
    { 
      key: 'otros', 
      title: 'Otros Imp.', 
      width: 110, 
      align: 'right', 
      render: (r) => formatCurrency(toNumber(r.otros_imp ?? r.OTROS_IMP)) 
    },
    { 
      key: 'total', 
      title: 'Total', 
      width: 120, 
      align: 'right', 
      render: (r) => formatCurrency(toNumber(r.total ?? r.TOTAL)) 
    },
  ];

  return (
    <ScreenShell title="Impuestos" subtitle="Registro de compras y ventas (F29)">
      <>
        <FilterRow title="Consultar periodo">
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

        <DataGridCard
          title="Resumen por tipo de documento"
          subtitle={`Periodo ${selectedMonth}/${selectedYear}`}
          loading={loading}
          rows={data}
          columns={columns}
          emptyMessage="Sin registros para este periodo."
          initialLimit={15}
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
