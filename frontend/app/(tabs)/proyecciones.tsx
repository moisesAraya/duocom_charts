import { api } from '@/constants/api';
import { Card, EmptyState } from '@/components/dashboard/card';
import { ChartCard } from '@/components/dashboard/chart-card';
import { FilterRow, buildYearOptions } from '@/components/dashboard/chart-filters';
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
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [proyeccionVentas, setProyeccionVentas] = useState<ProyeccionRow[]>([]);
  const [iva, setIva] = useState<IvaRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);


  const yearOptions = useMemo(() => buildYearOptions(8), []);
  const proyeccionParams = useMemo(() => {
    const baseDate = new Date(selectedYear, selectedMonth, 1);
    return {
      desde: formatDateInput(startOfMonth(baseDate)),
      hasta: formatDateInput(endOfMonth(baseDate)),
    };
  }, [selectedMonth, selectedYear]);

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
          // Usa la opacidad que pide la librería para que la línea y el dot sean del color correcto
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
          strokeWidth: 3,
          // Color del dot para que el circulito coincida con la línea
          propsForDots: { r: '6', strokeWidth: '2', stroke: 'rgba(59, 130, 246, 1)', fill: 'rgba(59, 130, 246, 1)' },
        },
        {
          data: proyeccionVentas.map(item => item.proyeccion ?? 0),
          color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
          strokeWidth: 3,
          propsForDots: { r: '6', strokeWidth: '2', stroke: 'rgba(16, 185, 129, 1)', fill: 'rgba(16, 185, 129, 1)' },
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
          
          {errors.length ? (
            <View style={styles.errorBox}>
              {errors.map(message => (
                <Text key={message} style={styles.errorText}>
                  {message}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Proyeccion ventas mes</Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Año</Text>
                <Pressable style={styles.pickerButton} onPress={() => setShowYearPicker(true)}>
                  <Text style={styles.pickerButtonText}>{selectedYear}</Text>
                </Pressable>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Mes</Text>
                <Pressable style={styles.pickerButton} onPress={() => setShowMonthPicker(true)}>
                  <Text style={styles.pickerButtonText}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][selectedMonth]}</Text>
                </Pressable>
              </View>
            </View>
          </View>
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

      {/* =========================
          PROYECCIÓN VENTA MES (LÍNEAS)
      ========================= */}
      <ProyeccionVentaMes />

      {/* Year Picker Modal */}
      <Modal visible={showYearPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowYearPicker(false)}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalHeader}>Seleccionar Año</Text>
            <ScrollView>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((year) => (
                <Pressable
                  key={year}
                  onPress={() => {
                    setSelectedYear(year);
                    setShowYearPicker(false);
                  }}
                  style={[
                    styles.modalItem,
                    year === selectedYear && { backgroundColor: "#EBF5FF" },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      year === selectedYear && { fontWeight: "700", color: "#3B82F6" },
                    ]}
                  >
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
        <Pressable style={styles.modalOverlay} onPress={() => setShowMonthPicker(false)}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalHeader}>Seleccionar Mes</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, idx) => {
                const value = idx;
                const active = value === selectedMonth;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setSelectedMonth(value);
                      setShowMonthPicker(false);
                    }}
                    style={[
                      styles.monthPill,
                      active
                        ? { backgroundColor: "#3B82F6", borderColor: "#3B82F6" }
                        : { backgroundColor: "#F0F7FF", borderColor: "#E0E0E0" },
                    ]}
                  >
                    <Text style={[styles.monthPillText, active && { color: "#fff" }]}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

/* =========================
   PROYECCIÓN VENTA MES COMPONENT
========================= */
function ProyeccionVentaMes() {
  const { width } = useWindowDimensions();
  const chartWidth = width - 48;
  
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/dashboard/analisis-ventas-mensual', {
          params: { ano, mes },
        });
        
        if (response.data.success) {
          const allSeries = response.data.data?.series || [];
          // Filtrar solo la serie de proyección (id -3)
          const proyeccionSerie = allSeries.find((s: any) => s.idSucursal === -3);
          if (proyeccionSerie) {
            setData(proyeccionSerie.datos);
          } else {
            setData([]);
          }
        }
      } catch (error) {
        console.error('Error fetching proyeccion venta mes:', error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ano, mes]);

  const chartData = useMemo(() => {
    const labels = Array.from({ length: 31 }, (_, i) => String(i + 1));
    if (!data.length) return { labels, datasets: [] };

    return {
      labels,
      datasets: [{
        data: labels.map((_, i) => {
          const punto = data.find((d: any) => d.dia === i + 1);
          return punto ? punto.monto : 0;
        }),
        color: (opacity = 1) => `rgba(139,92,246,${opacity})`,
        strokeWidth: 3,
        propsForDots: { r: '6', strokeWidth: '2', stroke: 'rgba(139,92,246,1)', fill: 'rgba(139,92,246,1)' },
      }],
    };
  }, [data]);

  return (
    <>
      <FilterRow title="Proyección venta mes">
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Año</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 8,
                padding: 10,
                backgroundColor: '#fff',
              }}
            >
              <Text>{ano}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Mes</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 8,
                padding: 10,
                backgroundColor: '#fff',
              }}
            >
              <Text>{mes}</Text>
            </View>
          </View>
        </View>
      </FilterRow>

      <ChartCard
        title="Proyección venta mes (M$)"
        data={chartData}
        kind="line"
        colorRgb="139,92,246"
        width={chartWidth}
        height={300}
        xLabel="Días del mes"
        yLabel="Ventas (M$)"
        formatValue={(v) => `$${v}M`}
        formatDetailValue={(v) => `$${v.toFixed(2)}M`}
        formatAxisValue={(v) => `$${v}M`}
        isLoading={loading}
        isEmpty={!data.length}
      />
    </>
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
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 6,
    fontWeight: "600",
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: "#3B82F6",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#F0F7FF",
  },
  pickerButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3B82F6",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalPanel: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "80%",
    maxHeight: "70%",
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  modalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    backgroundColor: "#fff",
  },
  modalItemText: {
    fontSize: 16,
    textAlign: "center",
    color: "#000",
  },
  monthPill: {
    padding: 14,
    borderRadius: 10,
    width: "30%",
    borderWidth: 1,
  },
  monthPillSelected: {
    backgroundColor: "#3B82F6",
    borderColor: "#3B82F6",
  },
  monthPillText: {
    fontSize: 14,
    textAlign: "center",
    fontWeight: "600",
    color: "#3B82F6",
  },
  monthPillTextSelected: {
    color: "#fff",
  },
});
