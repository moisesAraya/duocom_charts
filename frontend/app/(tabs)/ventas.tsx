// app/(tabs)/ventas.tsx  (o donde tengas tu pantalla Ventas)
import { api } from "@/constants/api";
import { ChartCard } from "@/components/dashboard/chart-card";
import { ScreenShell } from "@/components/dashboard/screen-shell";
import { useDashboardFilters } from "@/components/dashboard/filters-context";
import {
  formatCompact,
  formatCurrency,
  formatDateInput,
  sparsifyLabels,
} from "@/components/dashboard/utils";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import * as ScreenOrientation from "expo-screen-orientation";

/* =========================
   TYPES
========================= */

interface VentasAnualesRow {
  sucursal: string;
  anio: number;
  total: number;
}

interface MedioPagoRow {
  sucursal: string;
  medio_pago: string;
  monto: number;
}

interface GrupoVentaRow {
  grupo: string;
  monto: number;
}

/* =========================
   HELPERS
========================= */

const truncateLabel = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const SERIES_COLORS = [
  "59,130,246",
  "16,185,129",
  "245,158,11",
  "139,92,246",
  "236,72,153",
  "14,116,144",
  "234,88,12",
  "248,113,113",
  "34,197,94",
  "251,146,60",
];

const getBranchColor = (key: string, index = 0) => {
  if (!key) return SERIES_COLORS[index % SERIES_COLORS.length];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % 997;
  }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// nice step 1-2-5 * 10^n (igual filosofía que ChartCard)
function niceStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const f = rawStep / base;

  let niceF: number;
  if (f <= 1) niceF = 1;
  else if (f <= 2) niceF = 2;
  else if (f <= 5) niceF = 5;
  else niceF = 10;

  return niceF * base;
}

function calcStepFromMax(maxValue: number) {
  // Queremos ~5-7 líneas en el eje => step ~ max/6, luego lo hacemos "bonito"
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 1;
  return niceStep(maxValue / 6);
}

/* =========================
   COMPONENT
========================= */

export default function VentasScreen() {
  const { requestParams = {} } = useDashboardFilters();
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;

  useEffect(() => {
    ScreenOrientation.unlockAsync();
  }, []);

  const chartWidth = isPortrait
    ? Math.max(320, width - 40)
    : Math.max(480, width - 120);

  /* =========================
     STATE
  ========================= */

  // Año/mes para Ventas por medio de pago
  const [anoMP, setAnoMP] = useState(() => new Date().getFullYear());
  const [mesMP, setMesMP] = useState(() => new Date().getMonth() + 1);
  const [showYearPickerMP, setShowYearPickerMP] = useState(false);
  const [showMonthPickerMP, setShowMonthPickerMP] = useState(false);

  const [ventasAnuales, setVentasAnuales] = useState<VentasAnualesRow[]>([]);
  const [ventasMedioPago, setVentasMedioPago] = useState<MedioPagoRow[]>([]);
  const [ventasGrupo, setVentasGrupo] = useState<GrupoVentaRow[]>([]);

  const [loadingVentasAnuales, setLoadingVentasAnuales] = useState(true);
  const [loadingVentasMedioPago, setLoadingVentasMedioPago] = useState(true);
  const [loadingVentasGrupo, setLoadingVentasGrupo] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  /* =========================
     DERIVED PARAMS
  ========================= */

  const baseRequestParams = useMemo(() => {
    const { sucursales: _sucursales, ...rest } = requestParams as Record<
      string,
      string
    >;
    return rest;
  }, [requestParams]);

  const medioPagoParams = useMemo(() => {
    return {
      ...baseRequestParams,
      desde: formatDateInput(new Date(anoMP, mesMP - 1, 1)),
      hasta: formatDateInput(new Date(anoMP, mesMP, 0)),
    };
  }, [baseRequestParams, anoMP, mesMP]);

  const ventasAnualesParams = useMemo(
    () => ({
      ...baseRequestParams,
      years: 5,
    }),
    [baseRequestParams]
  );

  /* =========================
     LOADERS
  ========================= */

  const loadVentasGrupo = useCallback(async () => {
    setLoadingVentasGrupo(true);
    try {
      const res = await api.get("/api/dashboard/ventas-por-grupo", {
        params: baseRequestParams,
      });
      setVentasGrupo(
        (res.data?.data ?? []).map((r: any) => ({
          grupo: String(r.grupo ?? "").trim(),
          monto: toNumber(r.monto),
        }))
      );
    } catch {
      setVentasGrupo([]);
    } finally {
      setLoadingVentasGrupo(false);
    }
  }, [baseRequestParams]);

  const loadVentasMedioPago = useCallback(async () => {
    setLoadingVentasMedioPago(true);
    try {
      const res = await api.get("/api/dashboard/ventas-medio-pago", {
        params: medioPagoParams,
      });
      setVentasMedioPago(
        (res.data?.data ?? []).map((r: any) => ({
          sucursal: String(r.sucursal ?? "").trim(),
          medio_pago: String(r.medio_pago ?? "").trim(),
          monto: toNumber(r.monto),
        }))
      );
    } catch {
      setVentasMedioPago([]);
    } finally {
      setLoadingVentasMedioPago(false);
    }
  }, [medioPagoParams]);

  const loadVentasAnuales = useCallback(async () => {
    setLoadingVentasAnuales(true);
    try {
      const res = await api.get("/api/dashboard/ventas-anuales", {
        params: ventasAnualesParams,
      });
      setVentasAnuales(
        (res.data?.data ?? []).map((r: any) => ({
          sucursal: String(r.sucursal ?? "").trim(),
          anio: Number(r.anio ?? r.ano ?? 0),
          total: toNumber(r.total),
        }))
      );
    } catch {
      setVentasAnuales([]);
    } finally {
      setLoadingVentasAnuales(false);
    }
  }, [ventasAnualesParams]);

  useEffect(() => {
    void loadVentasGrupo();
  }, [loadVentasGrupo]);

  useEffect(() => {
    void loadVentasMedioPago();
  }, [loadVentasMedioPago]);

  useEffect(() => {
    void loadVentasAnuales();
  }, [loadVentasAnuales]);

  const loadAllData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadVentasGrupo(), loadVentasMedioPago(), loadVentasAnuales()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadVentasAnuales, loadVentasGrupo, loadVentasMedioPago]);

  /* =========================
     CHART: VENTAS POR AÑO (LINE)
  ========================= */

  const ventasAnualesYears = useMemo(() => {
    const years = Array.from(new Set(ventasAnuales.map((r) => r.anio))).filter(
      (year) => Number.isFinite(year)
    );
    return years.sort((a, b) => a - b);
  }, [ventasAnuales]);

  const ventasAnualesBranches = useMemo(() => {
    return Array.from(
      new Set(ventasAnuales.map((r) => r.sucursal).filter(Boolean))
    );
  }, [ventasAnuales]);

  // Estado para sucursales seleccionadas en el gráfico de ventas por año
  const [enabledVentasAnualesBranches, setEnabledVentasAnualesBranches] =
    useState<string[]>([]);

  useEffect(() => {
    setEnabledVentasAnualesBranches(ventasAnualesBranches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventasAnualesBranches.join(",")]);

  const toggleVentasAnualesBranch = (branch: string) => {
    setEnabledVentasAnualesBranches((prev) =>
      prev.includes(branch) ? prev.filter((b) => b !== branch) : [...prev, branch]
    );
  };

  const ventasAnualesData = useMemo(() => {
    const filteredBranches = ventasAnualesBranches.filter((b) =>
      enabledVentasAnualesBranches.includes(b)
    );

    const maxLabels = 8;
    const yearLabels = ventasAnualesYears.map((year) => String(year));
    const sparseLabels = sparsifyLabels(yearLabels, maxLabels);

    return {
      labels: sparseLabels,
      datasets: filteredBranches.map((branch, idx) => ({
        data: ventasAnualesYears.map((year) =>
          ventasAnuales
            .filter((row) => row.sucursal === branch && row.anio === year)
            .reduce((acc, row) => acc + row.total, 0)
        ),
        color: (o: number) => `rgba(${getBranchColor(branch, idx)},${o})`,
        strokeWidth: 2,
      })),
      legend: filteredBranches.map((branch) => truncateLabel(branch, 10)),
    };
  }, [
    ventasAnuales,
    ventasAnualesBranches,
    ventasAnualesYears,
    enabledVentasAnualesBranches,
  ]);

  /* =========================
     CHART: VENTAS POR SUCURSAL (BAR)
     - step bonito (yAxisInterval)
     - valores sin "Ventas ..."
     - sin línea verde arriba (depende de ChartCard: strokeWidth 0 / bar config)
  ========================= */

  const ventasSucursalRows = useMemo(() => {
    const totals = new Map<string, number>();
    ventasAnuales.forEach((row) => {
      totals.set(row.sucursal, (totals.get(row.sucursal) ?? 0) + row.total);
    });
    return Array.from(totals.entries())
      .map(([sucursal, total]) => ({ sucursal, total }))
      .sort((a, b) => b.total - a.total);
  }, [ventasAnuales]);

  const ventasSucursalLabels = useMemo(
    () => ventasSucursalRows.map((row) => row.sucursal),
    [ventasSucursalRows]
  );

  const ventasSucursalChart = useMemo(
    () => ({
      labels: sparsifyLabels(
        ventasSucursalLabels.map((label) => truncateLabel(label, 10)),
        6
      ),
      datasets: [
        {
          data: ventasSucursalRows.map((row) => row.total),
          colors: ventasSucursalLabels.map(
            (label, idx) => (o: number) =>
              `rgba(${getBranchColor(label, idx)},${o})`
          ),
        },
      ],
    }),
    [ventasSucursalLabels, ventasSucursalRows]
  );

  const ventasSucursalMax = useMemo(() => {
    const vals = ventasSucursalRows.map((r) => r.total);
    return vals.length ? Math.max(...vals) : 0;
  }, [ventasSucursalRows]);

  const ventasSucursalYAxisStep = useMemo(
    () => calcStepFromMax(ventasSucursalMax),
    [ventasSucursalMax]
  );

  /* =========================
     CHART: VENTAS POR MEDIO DE PAGO (BAR)
     - selector Año/Mes dentro del MISMO recuadro
  ========================= */

  const ventasMedioPagoLabels = useMemo(() => {
    return Array.from(new Set(ventasMedioPago.map((r) => r.medio_pago)));
  }, [ventasMedioPago]);

  const ventasMedioPagoChartLabels = useMemo(
    () =>
      sparsifyLabels(
        ventasMedioPagoLabels.map((label) => truncateLabel(label, 10)),
        6
      ),
    [ventasMedioPagoLabels]
  );

  const ventasMedioPagoData = useMemo(() => {
    const map = new Map<string, number>();
    ventasMedioPago.forEach((r) => {
      map.set(r.medio_pago, (map.get(r.medio_pago) ?? 0) + r.monto);
    });

    return {
      labels: ventasMedioPagoChartLabels,
      datasets: [
        {
          data: ventasMedioPagoLabels.map((l) => map.get(l) ?? 0),
          color: (o: number) => `rgba(59,130,246,${o})`,
        },
      ],
    };
  }, [ventasMedioPago, ventasMedioPagoChartLabels, ventasMedioPagoLabels]);

  /* =========================
     CHART: VENTAS POR GRUPO (PIE)
     - sin recuadro extra
  ========================= */

  const ventasGrupoData = useMemo(() => {
    return {
      labels: ventasGrupo.map((r) => r.grupo),
      datasets: [
        {
          data: ventasGrupo.map((r) => r.monto),
        },
      ],
    };
  }, [ventasGrupo]);

  /* =========================
     RENDER
  ========================= */

  return (
    <ScreenShell title="Ventas" refreshing={refreshing} onRefresh={loadAllData}>
      {/* =========================
          Selector de series (Ventas por año)
      ========================= */}
      {ventasAnualesBranches.length > 1 && (
        <View style={styles.chipsWrap}>
          {ventasAnualesBranches.map((branch, idx) => {
            const enabled = enabledVentasAnualesBranches.includes(branch);
            const rgb = getBranchColor(branch, idx);
            return (
              <Pressable
                key={branch}
                onPress={() => toggleVentasAnualesBranch(branch)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: enabled ? `rgba(${rgb},0.15)` : "#f5f5f5",
                    borderColor: enabled ? `rgb(${rgb})` : "#e0e0e0",
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: enabled ? "#000" : "#999" }]}>
                  {truncateLabel(branch, 12)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <ChartCard
        title="Ventas por año"
        data={ventasAnualesData}
        kind="line"
        colorRgb="59,130,246"
        width={chartWidth}
        height={280}
        xLabel="Años"
        yLabel="Ventas (M)"
        formatValue={(v) => `${(v / 1_000_000).toFixed(0)}M`}
        formatDetailValue={(v) => `${(v / 1_000_000).toFixed(2)}M`}
        formatAxisValue={(v) => `${(v / 1_000_000).toFixed(0)}M`}
        yAxisInterval={200_000_000}
        scrollable={true}
        minWidth={ventasAnualesYears.length * 80}
        isLoading={loadingVentasAnuales}
        isEmpty={!ventasAnuales.length || !enabledVentasAnualesBranches.length}
        detailLabels={ventasAnualesYears.map((year) => String(year))}
        detailTrigger="tap"
      />

      {/* =========================
          VENTAS POR SUCURSAL (BARRAS)
          ✅ nice step aplicado aquí también
      ========================= */}
      <ChartCard
        title="Ventas por sucursal"
        data={ventasSucursalChart}
        kind="bar"
        colorRgb="16,185,129"
        width={chartWidth}
        height={300}
        xLabel="Sucursales"
        yLabel="Ventas ($)"
        formatValue={formatCompact}
        formatDetailValue={formatCurrency}
        formatAxisValue={formatCompact} // ✅ sin texto raro
        yAxisInterval={ventasSucursalYAxisStep} // ✅ step bonito
        scrollable
        minWidth={Math.max(chartWidth, ventasSucursalLabels.length * 52)}
        isLoading={loadingVentasAnuales}
        isEmpty={!ventasSucursalRows.length}
        detailLabels={ventasSucursalLabels}
      />

      {/* =========================
          VENTAS POR MEDIO DE PAGO
          ✅ selector dentro del MISMO recuadro
      ========================= */}
      <ChartCard
        title="Ventas por medio de pago"
        headerContent={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Año</Text>
              <Pressable style={ui.picker} onPress={() => setShowYearPickerMP(true)}>
                <Text style={ui.pickerText}>{anoMP}</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Mes</Text>
              <Pressable style={ui.picker} onPress={() => setShowMonthPickerMP(true)}>
                <Text style={ui.pickerText}>
                  {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][mesMP - 1]}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        data={ventasMedioPagoData}
        kind="bar"
        colorRgb="59,130,246"
        width={chartWidth}
        height={300}
        xLabel="Medios de pago"
        yLabel="Ventas ($)"
        formatValue={formatCompact}
        formatDetailValue={formatCurrency}
        formatAxisValue={formatCompact}
        scrollable
        minWidth={Math.max(chartWidth, ventasMedioPagoLabels.length * 56)}
        isLoading={loadingVentasMedioPago}
        isEmpty={!ventasMedioPago.length}
        detailLabels={ventasMedioPagoLabels}
      />

      {/* Year Picker (Medio Pago) */}
      <Modal visible={showYearPickerMP} transparent animationType="fade">
        <Pressable style={modal.backdrop} onPress={() => setShowYearPickerMP(false)}>
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Año</Text>
            <ScrollView>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(
                (year) => (
                  <Pressable
                    key={year}
                    onPress={() => {
                      setAnoMP(year);
                      setShowYearPickerMP(false);
                    }}
                    style={[
                      modal.item,
                      year === anoMP && { backgroundColor: "#EBF5FF" },
                    ]}
                  >
                    <Text
                      style={[
                        modal.itemText,
                        year === anoMP && { color: "#3B82F6", fontWeight: "700" },
                      ]}
                    >
                      {year}
                    </Text>
                  </Pressable>
                )
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Month Picker (Medio Pago) */}
      <Modal visible={showMonthPickerMP} transparent animationType="fade">
        <Pressable style={modal.backdrop} onPress={() => setShowMonthPickerMP(false)}>
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Mes</Text>
            <View style={modal.monthGrid}>
              {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map((m, idx) => {
                const mm = idx + 1;
                const selected = mm === mesMP;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMesMP(mm);
                      setShowMonthPickerMP(false);
                    }}
                    style={[
                      modal.monthItem,
                      selected
                        ? { backgroundColor: "#3B82F6", borderColor: "#3B82F6" }
                        : { backgroundColor: "#F0F7FF", borderColor: "#E0E0E0" },
                    ]}
                  >
                    <Text style={[modal.monthText, selected ? { color: "#fff" } : { color: "#3B82F6" }]}>
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* =========================
          VENTAS POR GRUPO (PIE)
          ✅ sin recuadro extra
      ========================= */}
      <ChartCard
        title="Ventas por grupo"
        data={ventasGrupoData}
        kind="pie"
        colorRgb="245,158,11"
        width={chartWidth}
        height={280}
        formatDetailValue={formatCurrency}
        isLoading={loadingVentasGrupo}
        isEmpty={!ventasGrupo.length}
      />

      {/* =========================
          ANÁLISIS VENTAS MENSUAL
          ✅ ahora es 1 SOLO recuadro: selector + chips + gráfico
      ========================= */}
      <AnalisisVentasMensual chartWidth={chartWidth} />
    </ScreenShell>
  );
}

/* =========================
   ANÁLISIS VENTAS MENSUAL (1 card)
========================= */

function AnalisisVentasMensual({ chartWidth }: { chartWidth: number }) {
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const [seriesMap, setSeriesMap] = useState<
    Record<
      number,
      { nombre: string; color: string; data: number[]; ejeDerecho?: boolean }
    >
  >({});
  const [enabledSeries, setEnabledSeries] = useState<Set<number>>(new Set());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const mesesNombres = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const daysInMonth = useMemo(() => new Date(ano, mes, 0).getDate(), [ano, mes]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await api.get("/api/dashboard/graf-vta-mes-suc", {
          params: { ano, mes },
        });

        if (response.data?.success) {
          const rows = response.data.data || [];
          const grouped: Record<number, { nombre: string; color: string; data: number[]; ejeDerecho?: boolean }> = {};

          const colorMap: Record<number, string> = {
            [-3]: "245,158,11", // Proy/Mes
            [-2]: "59,130,246", // Media diaria
            [-1]: "16,185,129", // Prom/Dia
          };

          rows.forEach((row: any) => {
            const id = Number(row["IdSucusal"]);
            const nombre = String(row["Sucursal"] ?? "").trim();
            const dia = Number(row["Día"] ?? row["Dia"] ?? 0);
            const total = Number(row["Total"] || 0) / 1_000_000; // M$

            if (!grouped[id]) {
              grouped[id] = {
                nombre,
                color: colorMap[id] || getBranchColor(nombre, Math.abs(id)),
                data: Array(daysInMonth).fill(0),
                ejeDerecho: id === -3, // mantenemos la intención, pero NO haremos overlay
              };
            }

            if (dia >= 1 && dia <= daysInMonth) {
              grouped[id].data[dia - 1] = Number.isFinite(total) ? total : 0;
            }
          });

          setSeriesMap(grouped);
          setEnabledSeries(new Set(Object.keys(grouped).map(Number)));
        } else {
          setSeriesMap({});
          setEnabledSeries(new Set());
        }
      } catch (e) {
        console.error("Error fetching graf-vta-mes-suc:", e);
        setSeriesMap({});
        setEnabledSeries(new Set());
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [ano, mes, daysInMonth]);

  const toggleSerie = (id: number) => {
    setEnabledSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chartData = useMemo(() => {
    const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const datasets: any[] = [];
    const legend: string[] = [];

    Object.entries(seriesMap).forEach(([idStr, serie]) => {
      const id = Number(idStr);
      if (!enabledSeries.has(id)) return;

      datasets.push({
        data: serie.data,
        color: (opacity = 1) => `rgba(${serie.color},${opacity})`,
        strokeWidth: 2.5,
      });

      // ✅ SIEMPRE al legend (incluye Proy/Mes)
      legend.push(serie.nombre);
    });

    return { labels, datasets, legend: datasets.length ? legend : [] };
  }, [seriesMap, enabledSeries, daysInMonth]);

  // step "bonito" para M$ (eje Y)
  const maxM = useMemo(() => {
    const vals = chartData.datasets.flatMap((ds: any) => ds.data ?? []);
    return vals.length ? Math.max(...vals.map((v: any) => (Number.isFinite(v) ? v : 0))) : 0;
  }, [chartData.datasets]);

  // en este gráfico YA está en M$, así que step en "M"
  const yAxisStepM = useMemo(() => {
    if (!maxM || maxM <= 0) return 1;
    return niceStep(maxM / 6);
  }, [maxM]);

  // segments aproximados (chart-kit)
  const segments = useMemo(() => {
    if (!maxM || maxM <= 0) return 6;
    const raw = Math.ceil(maxM / yAxisStepM);
    return Math.max(4, Math.min(7, raw));
  }, [maxM, yAxisStepM]);

  return (
    <>
      <ChartCard
        title="Análisis Ventas Mensual"
        headerContent={
          <View style={{ gap: 12 }}>
            {/* Año / Mes */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={ui.label}>Año</Text>
                <Pressable style={ui.picker} onPress={() => setShowYearPicker(true)}>
                  <Text style={ui.pickerText}>{ano}</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ui.label}>Mes</Text>
                <Pressable style={ui.picker} onPress={() => setShowMonthPicker(true)}>
                  <Text style={ui.pickerText}>{mesesNombres[mes - 1]}</Text>
                </Pressable>
              </View>
            </View>

            {/* Series chips */}
            {Object.keys(seriesMap).length > 0 ? (
              <View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#666", marginBottom: 8 }}>
                  Series
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {Object.entries(seriesMap).map(([idStr, serie]) => {
                      const id = Number(idStr);
                      const enabled = enabledSeries.has(id);
                      return (
                        <Pressable
                          key={id}
                          onPress={() => toggleSerie(id)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 20,
                            backgroundColor: enabled ? `rgba(${serie.color},0.15)` : "#f5f5f5",
                            borderWidth: 2,
                            borderColor: enabled ? `rgb(${serie.color})` : "#e0e0e0",
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: enabled ? "#000" : "#999" }}>
                            {serie.nombre}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            <Text style={{ fontSize: 14, fontWeight: "600", color: "#111" }}>
              Ventas por Día (M$)
            </Text>
          </View>
        }
        data={chartData}
        kind="line"
        colorRgb="59,130,246"
        width={chartWidth}
        height={300}
        xLabel="Días del mes"
        yLabel="Ventas (M$)"
        isLoading={loading}
        isEmpty={chartData.datasets.length === 0}
        hideHint
        scrollable  // Ya está
        minWidth={Math.max(chartWidth, daysInMonth * 30)}  // ✅ Agrega esto: ~30px por día para scroll horizontal
      >
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={{ marginTop: 12, color: "#666" }}>Cargando datos...</Text>
          </View>
        ) : chartData.datasets.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <Text style={{ color: "#999", fontSize: 14 }}>Sin datos para mostrar</Text>
          </View>
        ) : (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* etiqueta eje Y lateral */}
              <View style={{ width: 35, justifyContent: "center", alignItems: "center", marginRight: 8 }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: "#666",
                    fontWeight: "600",
                    transform: [{ rotate: "-90deg" }],
                    width: 80,
                    textAlign: "center",
                  }}
                >
                  Ventas (M$)
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator>
                <LineChart
                  data={chartData}
                  width={Math.max(chartWidth, daysInMonth * 20)}
                  height={260}
                  segments={segments}
                  formatYLabel={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return v;
                    return `${n.toFixed(0)}M`;
                  }}
                  chartConfig={{
                    backgroundColor: "#ffffff",
                    backgroundGradientFrom: "#ffffff",
                    backgroundGradientTo: "#ffffff",
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity * 0.6})`,
                    style: { borderRadius: 16 },
                    propsForDots: {
                      r: "4",
                      strokeWidth: "2",
                      stroke: "#fff",
                    },
                    propsForBackgroundLines: {
                      strokeDasharray: "",
                      stroke: "#e0e0e0",
                      strokeWidth: 1,
                    },
                  }}
                  bezier
                  style={{ marginVertical: 8, borderRadius: 16 }}
                  withInnerLines
                  withOuterLines
                  withVerticalLines={false}
                  withHorizontalLines
                  withVerticalLabels
                  withHorizontalLabels
                  fromZero
                />
              </ScrollView>
            </View>

            <View style={{ marginTop: 8, alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "#666", fontWeight: "600" }}>Días del mes</Text>
            </View>
          </View>
        )}
      </ChartCard>

      {/* Year Picker */}
      <Modal visible={showYearPicker} transparent animationType="fade">
        <Pressable style={modal.backdrop} onPress={() => setShowYearPicker(false)}>
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Año</Text>
            <ScrollView>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(
                (year) => (
                  <Pressable
                    key={year}
                    onPress={() => {
                      setAno(year);
                      setShowYearPicker(false);
                    }}
                    style={[
                      modal.item,
                      year === ano && { backgroundColor: "#EBF5FF" },
                    ]}
                  >
                    <Text
                      style={[
                        modal.itemText,
                        year === ano && { color: "#3B82F6", fontWeight: "700" },
                      ]}
                    >
                      {year}
                    </Text>
                  </Pressable>
                )
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Month Picker */}
      <Modal visible={showMonthPicker} transparent animationType="fade">
        <Pressable style={modal.backdrop} onPress={() => setShowMonthPicker(false)}>
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Mes</Text>
            <View style={modal.monthGrid}>
              {mesesNombres.map((m, idx) => {
                const mm = idx + 1;
                const selected = mm === mes;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setMes(mm);
                      setShowMonthPicker(false);
                    }}
                    style={[
                      modal.monthItem,
                      selected
                        ? { backgroundColor: "#3B82F6", borderColor: "#3B82F6" }
                        : { backgroundColor: "#F0F7FF", borderColor: "#E0E0E0" },
                    ]}
                  >
                    <Text style={[modal.monthText, selected ? { color: "#fff" } : { color: "#3B82F6" }]}>
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/* =========================
   STYLES
========================= */

const styles = StyleSheet.create({
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { fontSize: 13, fontWeight: "600" },
});

const ui = StyleSheet.create({
  label: { fontSize: 12, color: "#666", marginBottom: 6, fontWeight: "600" },
  picker: {
    borderWidth: 1,
    borderColor: "#3B82F6",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#F0F7FF",
  },
  pickerText: { fontSize: 15, fontWeight: "600", color: "#3B82F6" },
});

const modal = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "85%",
    maxHeight: "70%",
  },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    backgroundColor: "#fff",
  },
  itemText: { fontSize: 16, textAlign: "center" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthItem: {
    padding: 14,
    borderRadius: 10,
    width: "30%",
    borderWidth: 1,
  },
  monthText: { fontSize: 14, textAlign: "center", fontWeight: "600" },
});
