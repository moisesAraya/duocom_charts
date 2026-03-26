/**
 * impuestos.tsx — Pestaña de Impuestos del dashboard.
 *
 * Muestra el resumen por tipo de documento (F29) obtenido del SP _F29a.
 */

import { api } from '@/constants/api';
import { FilterRow } from '@/components/dashboard/chart-filters';
import { ScreenShell } from '@/components/dashboard/screen-shell';
import {
  formatCurrency,
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
  // Posibles campos normalizados por db-helpers.ts
  descripcion_t_documento?: string;
  codigo_sii?: string;
  folio_inicial?: number;
  folio_final?: number;
  cant_folios?: number;
  afecto?: number;
  iva?: number;
  i_v_a?: number;
  exento?: number;
  otros_imp?: number;
  total?: number;
  ttx?: number; // Tipo de impuesto (suele ser 1 para ventas, 2 para compras o similar)
  tipo?: string; 
  libro?: string; 
  
  [key: string]: any;
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
  initialLimit = 15,
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
  const [rawRows, setRawRows] = useState<ImpuestoRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  // Selector de Ventas / Compras
  const [viewMode, setViewMode] = useState<'ventas' | 'compras'>('ventas');

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
        setRawRows(response.data?.data ?? []);
      } catch {
        setRawRows([]);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [params]);

  // Filtrado según el modo seleccionado
  // Basado en el campo ttx (común en esta BD: suele ser 1 ventas, 2 compras)
  const filteredData = useMemo(() => {
    if (!rawRows.length) return [];
    
    // Primero ordenamos como pidió el jefe: TTx y Código SII
    const sorted = [...rawRows].sort((a, b) => {
      const ttxA = a.ttx ?? a.TTX ?? 0;
      const ttxB = b.ttx ?? b.TTX ?? 0;
      if (ttxA !== ttxB) return ttxA - ttxB;
      
      const codA = (a.codigo_sii ?? a.CODIGO_SII ?? '').toString();
      const codB = (b.codigo_sii ?? b.CODIGO_SII ?? '').toString();
      return codA.localeCompare(codB);
    });

    return sorted.filter(row => {
      const ttx = row.ttx ?? row.TTX;
      
      // Si tenemos ttx, lo usamos (1 ventas, 2 compras es el estándar)
      if (ttx !== undefined && ttx !== null) {
        if (viewMode === 'ventas') return ttx === 1;
        return ttx === 2;
      }
      
      // Fallback a otros identificadores si ttx no existe
      const typeVal = (row.tipo || row.libro || row.v_c || row.TIPO || row.LIBRO || '').toString().toUpperCase();
      if (!typeVal) return true;
      
      if (viewMode === 'ventas') {
        return typeVal.startsWith('V') || typeVal.includes('VENTA') || typeVal.includes('DEBITO');
      } else {
        return typeVal.startsWith('C') || typeVal.includes('COMPRA') || typeVal.includes('CREDITO');
      }
    });
  }, [rawRows, viewMode]);

  const toNumber = (val: any) => (typeof val === 'number' ? val : 0);

  const columns: GridColumn<ImpuestoRow>[] = [
    { 
      key: 'desc', 
      title: 'Descripción T/Documento', 
      width: 180, 
      render: (r) => r.descripcion_t_documento ?? r.DESCRIPCION ?? r.desc ?? '' 
    },
    { 
      key: 'sii', 
      title: 'Código S.I.I', 
      width: 90, 
      align: 'center', 
      render: (r) => (r.codigo_sii ?? r.CODIGO_SII ?? r.cod_sii ?? '').toString()
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
      render: (r) => (r.cant_folios ?? r.CANT_FOLIOS ?? r.cantidad ?? 0).toString() 
    },
    { 
      key: 'afecto', 
      title: 'Afecto', 
      width: 110, 
      align: 'right', 
      render: (r) => formatCurrency(toNumber(r.afecto ?? r.AFECTO ?? r.neto)) 
    },
    { 
      key: 'iva', 
      title: 'I.v.a', 
      width: 110, 
      align: 'right', 
      render: (r) => formatCurrency(toNumber(r.i_v_a ?? r.iva ?? r.IVA)) 
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
      render: (r) => formatCurrency(toNumber(r.otros_imp ?? r.OTROS_IMP ?? r.otros)) 
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
    <ScreenShell title="Impuestos" subtitle="Resumen IVA (F29)">
      <>
        {/* Filtro de Periodo */}
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

        {/* Selector de Compras / Ventas */}
        <View style={ui.modeContainer}>
          <Pressable 
            style={[ui.modeButton, viewMode === 'ventas' && ui.modeButtonActive]} 
            onPress={() => setViewMode('ventas')}
          >
            <Text style={[ui.modeButtonText, viewMode === 'ventas' && ui.modeButtonTextActive]}>Ventas</Text>
          </Pressable>
          <Pressable 
            style={[ui.modeButton, viewMode === 'compras' && ui.modeButtonActive]} 
            onPress={() => setViewMode('compras')}
          >
            <Text style={[ui.modeButtonText, viewMode === 'compras' && ui.modeButtonTextActive]}>Compras</Text>
          </Pressable>
        </View>

        <DataGridCard
          title="Resumen por tipo de documento"
          subtitle={`${viewMode === 'ventas' ? 'Libro de Ventas' : 'Libro de Compras'} — ${selectedMonth}/${selectedYear}`}
          loading={loading}
          rows={filteredData}
          columns={columns}
          emptyMessage={`No hay registros de ${viewMode} para este periodo.`}
          initialLimit={15}
        />

        {/* Debug View */}
        {!loading && rawRows.length > 0 && filteredData.length === 0 && (
          <View style={ui.debugCard}>
            <Text style={ui.debugTitle}>Información de depuración:</Text>
            <Text style={ui.debugText}>Total filas recibidas: {rawRows.length}</Text>
            <Text style={ui.debugText}>Campos en la primera fila:</Text>
            <Text style={ui.debugKeys}>{Object.keys(rawRows[0]).join(', ')}</Text>
            <Text style={ui.debugText}>Valores TTx: {Array.from(new Set(rawRows.map(r => r.ttx ?? r.TTX))).join(', ')}</Text>
          </View>
        )}

        {/* Year Picker Modal */}
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

        {/* Month Picker Modal */}
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
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modeButtonTextActive: {
    color: '#2563EB',
  },
  debugCard: {
    margin: 16,
    padding: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  debugTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  debugText: { fontSize: 12, color: '#B45309' },
  debugKeys: { fontSize: 11, color: '#B45309', fontFamily: 'monospace', marginTop: 4 },
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
