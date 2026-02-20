// app/(tabs)/ventas.tsx
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
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { LineChart } from "react-native-chart-kit";
import { Text as SvgText } from "react-native-svg";

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
  const [showVentasAnualesValues, setShowVentasAnualesValues] = useState(false);
  const [showVentasSucursalValues, setShowVentasSucursalValues] = useState(false);

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
    [baseRequestParams],
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
        (res.data?.data ?? [])
          .filter((r: any) => r)
          .map((r: any) => ({
            grupo: String(r.grupo || r.Grupo || r.GRUPO || "").trim(),
            monto: toNumber(r.monto || r.Monto || r.MONTO),
          })),
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
        (res.data?.data ?? [])
          .filter((r: any) => r)
          .map((r: any) => ({
            sucursal: String(
              r.sucursal || r.Sucursal || r.SUCURSAL || "",
            ).trim(),
            medio_pago: String(
              r.medio_pago || r.MedioPago || r.MEDIO_PAGO || "",
            ).trim(),
            monto: toNumber(r.monto || r.Monto || r.MONTO),
          })),
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
        (res.data?.data ?? [])
          .filter((r: any) => r)
          .map((r: any) => ({
            sucursal: String(r.sucursal || r.Sucursal || r.SUCURSAL || "").trim(),
            anio: Number(r.anio || r.Anio || r.ANO || r.ano || 0),
            total: toNumber(r.total || r.Total || r.TOTAL),
          })),
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
      await Promise.all([
        loadVentasGrupo(),
        loadVentasMedioPago(),
        loadVentasAnuales(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadVentasAnuales, loadVentasGrupo, loadVentasMedioPago]);

  /* =========================
     CHART: VENTAS POR AÑO (LINE)
  ========================= */

  const ventasAnualesYears = useMemo(() => {
    const years = Array.from(new Set(ventasAnuales.map((r) => r.anio))).filter(
      (year) => Number.isFinite(year),
    );
    return years.sort((a, b) => a - b);
  }, [ventasAnuales]);

  const ventasAnualesBranches = useMemo(() => {
    return Array.from(
      new Set(ventasAnuales.map((r) => r.sucursal).filter(Boolean)),
    );
  }, [ventasAnuales]);

  const [enabledVentasAnualesBranches, setEnabledVentasAnualesBranches] =
    useState<string[]>([]);

  useEffect(() => {
    setEnabledVentasAnualesBranches(ventasAnualesBranches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventasAnualesBranches.join(",")]);

  const toggleVentasAnualesBranch = (branch: string) => {
    setEnabledVentasAnualesBranches((prev) =>
      prev.includes(branch)
        ? prev.filter((b) => b !== branch)
        : [...prev, branch],
    );
  };

  const [enabledVentasSucursalBranches, setEnabledVentasSucursalBranches] =
    useState<string[]>([]);

  useEffect(() => {
    setEnabledVentasSucursalBranches(ventasAnualesBranches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventasAnualesBranches.join(",")]);

  const toggleVentasSucursalBranch = (branch: string) => {
    setEnabledVentasSucursalBranches((prev) =>
      prev.includes(branch)
        ? prev.filter((b) => b !== branch)
        : [...prev, branch],
    );
  };

  const ventasAnualesData = useMemo(() => {
    const filteredBranches = ventasAnualesBranches.filter((b) =>
      enabledVentasAnualesBranches.includes(b),
    );

    // Agregar un año anterior al primero para crear espacio
    const firstYear = ventasAnualesYears[0];
    const yearsWithPadding = firstYear ? [firstYear - 1, ...ventasAnualesYears] : ventasAnualesYears;
    const yearLabels = yearsWithPadding.map((year) => String(year));

    return {
      labels: yearLabels,
      datasets: filteredBranches.map((branch, idx) => ({
        data: yearsWithPadding.map((year) =>
          ventasAnuales
            .filter(
              (row) =>
                row &&
                row.sucursal &&
                row.anio !== undefined &&
                row.sucursal === branch &&
                row.anio === year,
            )
            .reduce((acc, row) => acc + row.total, 0),
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

  const ventasSucursalRows = useMemo(() => {
    const totals = new Map<string, number>();
    ventasAnuales.forEach((row) => {
      totals.set(row.sucursal, (totals.get(row.sucursal) ?? 0) + row.total);
    });
    return Array.from(totals.entries())
      .map(([sucursal, total]) => ({ sucursal, total }))
      .filter(({ sucursal }) => enabledVentasSucursalBranches.includes(sucursal))
      .sort((a, b) => b.total - a.total);
  }, [ventasAnuales, enabledVentasSucursalBranches]);

  const ventasSucursalLabels = useMemo(
    () => ventasSucursalRows.map((row) => row.sucursal),
    [ventasSucursalRows],
  );

  const ventasSucursalChart = useMemo(
    () => ({
      labels: sparsifyLabels(
        ventasSucursalLabels.map((label) => truncateLabel(label, 10)),
        8,
      ),
      datasets: [
        {
          data: ventasSucursalRows.map((row) => row.total / 1_000_000),
          colors: ventasSucursalLabels.map(
            (label, idx) => (o: number) =>
              `rgba(${getBranchColor(label, idx)},${o})`,
          ),
        },
      ],
    }),
    [ventasSucursalLabels, ventasSucursalRows],
  );

  const ventasSucursalMax = useMemo(() => {
    const vals = ventasSucursalRows.map((r) => r.total / 1_000_000);
    return vals.length ? Math.max(...vals) : 0;
  }, [ventasSucursalRows]);

  const ventasSucursalYAxisStep = useMemo(
    () => calcStepFromMax(ventasSucursalMax),
    [ventasSucursalMax],
  );

  /* =========================
     CHART: VENTAS POR MEDIO DE PAGO (BAR)
  ========================= */

  const ventasMedioPagoLabels = useMemo(() => {
    return Array.from(new Set(ventasMedioPago.map((r) => r.medio_pago)));
  }, [ventasMedioPago]);

  const ventasMedioPagoChartLabels = useMemo(
    () =>
      sparsifyLabels(
        ventasMedioPagoLabels.map((label) => truncateLabel(label, 10)),
        8,
      ),
    [ventasMedioPagoLabels],
  );

  const ventasMedioPagoData = useMemo(() => {
    const map = new Map<string, number>();
    ventasMedioPago.filter((r) => r && r.medio_pago).forEach((r) => {
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
  ========================= */

  const ventasGrupoData = useMemo(() => {
    return {
      labels: ventasGrupo.map((r) => r.grupo),
      datasets: [{ data: ventasGrupo.map((r) => r.monto) }],
    };
  }, [ventasGrupo]);

  /* =========================
     RENDER
  ========================= */

  return (
    <ScreenShell title="Ventas" refreshing={refreshing} onRefresh={loadAllData}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChartCard
          title="Ventas por año"
          headerContent={
            <View>
              {ventasAnualesYears.length > 6 && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
                    Años disponibles: {ventasAnualesYears.join(" • ")}
                  </Text>
                </View>
              )}
              {ventasAnualesBranches.length > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: "#666", marginBottom: 8, fontWeight: "600" }}>Filtrar por sucursal:</Text>
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
                          <Text
                            style={[
                              styles.chipText,
                              { color: enabled ? "#000" : "#999" },
                            ]}
                          >
                            {truncateLabel(branch, 12)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
                <Pressable
                  style={styles.detailButton}
                  onPress={() => setShowVentasAnualesValues(!showVentasAnualesValues)}
                >
                  <Text style={styles.detailButtonText}>
                    {showVentasAnualesValues ? "Ocultar valores" : "Ver detalle"}
                  </Text>
                </Pressable>
              </View>
            </View>
          }
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
          scrollable={false}
          minWidth={ventasAnualesYears.length * 60}
          isLoading={loadingVentasAnuales}
          isEmpty={!ventasAnuales.length || !enabledVentasAnualesBranches.length}
          detailLabels={ventasAnualesYears.map((year) => String(year))}
          detailTrigger="tap"
          showValuesOnTop={showVentasAnualesValues}
          hideHint={true}
        />
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChartCard
          title="Ventas por sucursal"
          headerContent={
            <View>
              {ventasAnualesBranches.length > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: "#666", marginBottom: 8, fontWeight: "600" }}>Filtrar por sucursal:</Text>
                  <View style={styles.chipsWrap}>
                    {ventasAnualesBranches.map((branch, idx) => {
                      const enabled = enabledVentasSucursalBranches.includes(branch);
                      const rgb = getBranchColor(branch, idx);
                      return (
                        <Pressable
                          key={branch}
                          onPress={() => toggleVentasSucursalBranch(branch)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: enabled ? `rgba(${rgb},0.15)` : "#f5f5f5",
                              borderColor: enabled ? `rgb(${rgb})` : "#e0e0e0",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: enabled ? "#000" : "#999" },
                            ]}
                          >
                            {truncateLabel(branch, 12)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
                <Pressable
                  style={styles.detailButton}
                  onPress={() => setShowVentasSucursalValues(!showVentasSucursalValues)}
                >
                  <Text style={styles.detailButtonText}>
                    {showVentasSucursalValues ? "Ocultar valores" : "Ver detalle"}
                  </Text>
                </Pressable>
              </View>
            </View>
          }
          data={ventasSucursalChart}
          kind="bar"
          colorRgb="59,130,246"
          width={chartWidth}
          height={300}
          xLabel="Sucursales"
          yLabel="Ventas (M)"
          yAxisSuffix="M"
          formatValue={formatCompact}
          formatDetailValue={(v) => `${v.toFixed(0)}M`}
          yAxisInterval={ventasSucursalYAxisStep}
          scrollable={false}
          minWidth={Math.max(chartWidth, ventasSucursalLabels.length * 45)}
          isLoading={loadingVentasAnuales}
          isEmpty={!ventasSucursalRows.length}
          detailLabels={ventasSucursalLabels}
          showValuesOnTop={showVentasSucursalValues}
          hideHint={true}
        />
      </ScrollView>

      <ChartCard
        title="Ventas por medio de pago"
        headerContent={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Año</Text>
              <Pressable
                style={ui.picker}
                onPress={() => setShowYearPickerMP(true)}
              >
                <Text style={ui.pickerText}>{anoMP}</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Mes</Text>
              <Pressable
                style={ui.picker}
                onPress={() => setShowMonthPickerMP(true)}
              >
                <Text style={ui.pickerText}>
                  {
                    [
                      "Ene",
                      "Feb",
                      "Mar",
                      "Abr",
                      "May",
                      "Jun",
                      "Jul",
                      "Ago",
                      "Sep",
                      "Oct",
                      "Nov",
                      "Dic",
                    ][mesMP - 1]
                  }
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

      <Modal visible={showYearPickerMP} transparent animationType="fade">
        <Pressable
          style={modal.backdrop}
          onPress={() => setShowYearPickerMP(false)}
        >
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Año</Text>
            <ScrollView>
              {Array.from(
                { length: 10 },
                (_, i) => new Date().getFullYear() - 5 + i,
              ).map((year) => (
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
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showMonthPickerMP} transparent animationType="fade">
        <Pressable
          style={modal.backdrop}
          onPress={() => setShowMonthPickerMP(false)}
        >
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Mes</Text>
            <View style={modal.monthGrid}>
              {[
                "Ene",
                "Feb",
                "Mar",
                "Abr",
                "May",
                "Jun",
                "Jul",
                "Ago",
                "Sep",
                "Oct",
                "Nov",
                "Dic",
              ].map((m, idx) => {
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
                        ? {
                            backgroundColor: "#3B82F6",
                            borderColor: "#3B82F6",
                          }
                        : {
                            backgroundColor: "#F0F7FF",
                            borderColor: "#E0E0E0",
                          },
                    ]}
                  >
                    <Text
                      style={[
                        modal.monthText,
                        selected ? { color: "#fff" } : { color: "#3B82F6" },
                      ]}
                    >
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

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

      <AnalisisVentasMensual chartWidth={chartWidth} />

      {/* TABLA PROY VENTA ANUAL */}
      <TablaProyVentaAnual pCantAños={3} />
    </ScreenShell>
  );
}

/* =========================
   TABLA PROY VENTA ANUAL
========================= */

const mesesNombresTabla = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function TablaProyVentaAnual({ pCantAños }: { pCantAños: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cantAños, setCantAños] = useState(pCantAños);
  const [showPicker, setShowPicker] = useState(false);
  const [expandedSucursales, setExpandedSucursales] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/dashboard/proy-venta-anual", {
        params: { pCantAños: cantAños },
      })
      .then((res) => {
        setRows(res.data?.data ?? []);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [cantAños]);

  const rowsFiltered = rows
    .filter((r) => r)
    .map((r) => ({
      sucursal: r.sucursal || r.Sucursal || r.SUCURSAL,
      ano: r.ano || r.Ano || r.ANO,
      mes: r.mes || r.Mes || r.MES,
      total: r.total || r.Total || r.TOTAL,
    }))
    .filter(
      (r) =>
        r.sucursal &&
        r.ano !== undefined &&
        r.mes !== undefined &&
        r.total !== undefined,
    );

  const sucursales = Array.from(new Set(rowsFiltered.map((r) => r.sucursal)));
  const meses = Array.from(new Set(rowsFiltered.map((r) => r.mes))).sort(
    (a, b) => a - b,
  );

  const toggleExpanded = (suc: string) => {
    setExpandedSucursales((prev) => {
      const next = new Set(prev);
      if (next.has(suc)) next.delete(suc);
      else next.add(suc);
      return next;
    });
  };

  const currentYear = new Date().getFullYear();
  const anios = Array.from(
    { length: cantAños },
    (_, i) => currentYear - cantAños + 1 + i,
  );

  return (
    <View style={{ marginTop: 32, marginBottom: 32 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700" }}>
            Ventas mensuales en los últimos{" "}
          </Text>
          <Pressable style={ui.picker} onPress={() => setShowPicker(true)}>
            <Text style={ui.pickerText}>{cantAños}</Text>
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: "700" }}> años</Text>
        </View>
      </View>
      {loading ? (
        <Text>Cargando...</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            style={{
              borderWidth: 1,
              borderColor: "#ddd",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#3B82F6",
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  width: 120,
                  fontWeight: "700",
                  paddingHorizontal: 8,
                  color: "#fff",
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                Sucursal
              </Text>
              <Text
                style={{
                  width: 120,
                  fontWeight: "700",
                  paddingHorizontal: 8,
                  color: "#fff",
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                Mes
              </Text>
              {anios.map((anio) => (
                <Text
                  key={`header-${anio}`}
                  style={{
                    width: 90,
                    fontWeight: "700",
                    paddingHorizontal: 8,
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {anio}
                </Text>
              ))}
              <Text
                style={{
                  width: 100,
                  fontWeight: "700",
                  paddingHorizontal: 8,
                  color: "#fff",
                  textAlign: "center",
                }}
              >
                Total
              </Text>
            </View>

            {sucursales.map((suc) => {
              const isExpanded = expandedSucursales.has(suc);
              const sucRows = meses.map((mes) => {
                const fila = rowsFiltered.filter(
                  (r) => r.sucursal === suc && r.mes === mes,
                );
                const totalesPorAnio = anios.map((anio) => {
                  const filasAnio = fila.filter((f) => f.ano === anio);
                  return filasAnio.reduce((sum, f) => sum + (f.total || 0), 0);
                });
                const totalMes = totalesPorAnio.reduce((a, b) => a + b, 0);
                return { mes, totalesPorAnio, totalMes };
              });

              const totalSucursal = sucRows.reduce(
                (sum, row) => sum + row.totalMes,
                0,
              );

              return (
                <View key={suc}>
                  <Pressable
                    onPress={() => toggleExpanded(suc)}
                    style={{
                      flexDirection: "row",
                      backgroundColor: "#3B82F6",
                      padding: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#ddd",
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontWeight: "700",
                        color: "#fff",
                        textAlign: "left",
                      }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {suc} - Total: {formatCompact(totalSucursal)}
                    </Text>
                    <Text style={{ color: "#fff", fontSize: 16 }}>
                      {isExpanded ? "▼" : "▶"}
                    </Text>
                  </Pressable>

                  {isExpanded &&
                    sucRows.map(({ mes, totalesPorAnio, totalMes }) => (
                      <View
                        key={mes}
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#f9f9f9",
                          borderBottomWidth: 1,
                          borderBottomColor: "#eee",
                        }}
                      >
                        <Text
                          style={{
                            width: 120,
                            padding: 8,
                            textAlign: "left",
                            fontWeight: "600",
                          }}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {suc}
                        </Text>
                        <Text
                          style={{
                            width: 120,
                            padding: 8,
                            textAlign: "center",
                          }}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {mesesNombresTabla[mes - 1] || mes}
                        </Text>
                        {totalesPorAnio.map((val, idx) => (
                          <Text
                            key={`val-${anios[idx]}-${idx}`}
                            style={{ width: 90, padding: 8, textAlign: "right" }}
                          >
                            {formatCompact(val)}
                          </Text>
                        ))}
                        <Text
                          style={{
                            width: 100,
                            padding: 8,
                            textAlign: "right",
                            fontWeight: "700",
                            color: "#3B82F6",
                          }}
                        >
                          {formatCompact(totalMes)}
                        </Text>
                      </View>
                    ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Modal visible={showPicker} transparent animationType="fade">
        <Pressable style={modal.backdrop} onPress={() => setShowPicker(false)}>
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Cantidad de Años</Text>
            <ScrollView>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                <Pressable
                  key={num}
                  onPress={() => {
                    setCantAños(num);
                    setShowPicker(false);
                  }}
                  style={[
                    modal.item,
                    num === cantAños && { backgroundColor: "#EBF5FF" },
                  ]}
                >
                  <Text
                    style={[
                      modal.itemText,
                      num === cantAños && {
                        color: "#3B82F6",
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {num}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function AnalisisVentasMensual({ chartWidth }: { chartWidth: number }) {
  const { width, height } = useWindowDimensions();

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

  // ✅ Fullscreen + zoom (zoom REAL por width)
  const [fsVisible, setFsVisible] = useState(false);
  const [zoom, setZoom] = useState(1);

  const mesesNombres = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  const daysInMonth = useMemo(() => new Date(ano, mes, 0).getDate(), [ano, mes]);

  // ✅ 2 decimales en millones
  const formatMillions2 = useCallback((v: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0.00M";
    return `${(n / 1_000_000).toFixed(2)}M`;
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await api.get("/api/dashboard/graf-vta-mes-suc", {
          params: { ano, mes },
        });

        if (response.data?.success) {
          const rows = response.data.data || [];
          if (!Array.isArray(rows)) {
            setSeriesMap({});
            setEnabledSeries(new Set());
            return;
          }

          const grouped: Record<
            number,
            {
              nombre: string;
              color: string;
              data: number[];
              ejeDerecho?: boolean;
            }
          > = {};

          const colorMap: Record<number, string> = {
            [-3]: "245,158,11",
            [-2]: "59,130,246",
            [-1]: "16,185,129",
          };

          rows.forEach((row: any) => {
            const id = Number(
              row["IdSucursal"] ||
                row["IDSUCURSAL"] ||
                row["idSucursal"] ||
                row["Id# Sucursal"] ||
                row["ID# SUCURSAL"] ||
                row["id# sucursal"] ||
                row["IdSucusal"] ||
                0,
            );

            const nombre = String(
              row["Sucursal"] ||
                row["SUCURSAL"] ||
                row["sucursal"] ||
                row["NombreSucursal"] ||
                row["NOMBRESUCURSAL"] ||
                row["nombreSucursal"] ||
                `Sucursal ${id}`,
            ).trim();

            const dia = Number(
              row["Día"] || row["Dia"] || row["DIA"] || row["dia"] || 0,
            );

            const total = Number(
              row["Total"] ||
                row["TOTAL"] ||
                row["total"] ||
                row["Monto"] ||
                row["MONTO"] ||
                row["monto"] ||
                0,
            );

            if (!grouped[id]) {
              grouped[id] = {
                nombre,
                color: colorMap[id] || getBranchColor(nombre, Math.abs(id)),
                data: Array(daysInMonth).fill(0),
                ejeDerecho: id === -3,
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
      } catch {
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

      legend.push(serie.nombre);
    });

    return { labels, datasets, legend: datasets.length ? legend : [] };
  }, [seriesMap, enabledSeries, daysInMonth]);

  const maxM = useMemo(() => {
    const vals = chartData.datasets.flatMap((ds: any) => ds.data ?? []);
    return vals.length
      ? Math.max(...vals.map((v: any) => (Number.isFinite(v) ? v : 0)))
      : 0;
  }, [chartData.datasets]);

  const yAxisStepM = useMemo(() => {
    if (!maxM || maxM <= 0) return 1;
    return niceStep(maxM / 6);
  }, [maxM]);

  const xMinWidth = useMemo(
    () => Math.max(chartWidth, daysInMonth * 25),
    [chartWidth, daysInMonth],
  );

  // ✅ Fullscreen orientation (más robusto)
  const openFullScreen = useCallback(async () => {
    setZoom(1);
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      );
    } catch {
      // no-op
    } finally {
      setFsVisible(true);
    }
  }, []);

  const closeFullScreen = useCallback(async () => {
    setFsVisible(false);
    try {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    } catch {
      // no-op
    }
  }, []);

  // ✅ medidas fullscreen (Landscape)
  const fsW = Math.max(width, height);
  const fsH = Math.min(width, height);

  const fsChartHeight = Math.max(320, fsH - 110);

  const PX_PER_DAY_BASE = 42; 
  const fsMinWidthByDays = daysInMonth * PX_PER_DAY_BASE;
  const fsBaseChartWidth = Math.max(fsW - 32, fsMinWidthByDays);
  const fsZoomedChartWidth = Math.round(fsBaseChartWidth * zoom);

  return (
    <>
      <ChartCard
        title="Análisis Ventas Mensual"
        headerContent={
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={ui.label}>Año</Text>
                <Pressable
                  style={ui.picker}
                  onPress={() => setShowYearPicker(true)}
                >
                  <Text style={ui.pickerText}>{ano}</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ui.label}>Mes</Text>
                <Pressable
                  style={ui.picker}
                  onPress={() => setShowMonthPicker(true)}
                >
                  <Text style={ui.pickerText}>{mesesNombres[mes - 1]}</Text>
                </Pressable>
              </View>
            </View>

            {Object.keys(seriesMap).length > 0 ? (
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: "#666",
                    marginBottom: 8,
                  }}
                >
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
                            backgroundColor: enabled
                              ? `rgba(${serie.color},0.15)`
                              : "#f5f5f5",
                            borderWidth: 2,
                            borderColor: enabled
                              ? `rgb(${serie.color})`
                              : "#e0e0e0",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: enabled ? "#000" : "#999",
                            }}
                          >
                            {serie.nombre}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111" }}>
                Ventas por Día
              </Text>

              <Pressable onPress={openFullScreen} style={fs.btn}>
                <Text style={fs.btnText}>Pantalla completa</Text>
              </Pressable>
            </View>
          </View>
        }
        data={chartData}
        kind="line"
        colorRgb="59,130,246"
        width={chartWidth}
        height={400}
        xLabel="Días del mes"
        yLabel="Ventas"
        isLoading={loading}
        isEmpty={chartData.datasets.length === 0}
        hideHint
        scrollable
        minWidth={xMinWidth}
        yAxisInterval={yAxisStepM}
        formatAxisValue={formatCompact}
        formatDetailValue={formatCurrency}
        dotRadius={4}
      />

      {/* ✅ MODAL FULLSCREEN */}
      <Modal
        visible={fsVisible}
        animationType="fade"
        onRequestClose={closeFullScreen}
      >
        <StatusBar hidden />
        <View style={fs.container}>
          <View style={fs.topBar}>
            <Pressable onPress={closeFullScreen} style={fs.closeBtn}>
              <Text style={fs.closeText}>Cerrar</Text>
            </Pressable>

            <Text style={fs.title}>Ventas por Día</Text>

            <View style={fs.zoomRow}>
              <Pressable
                onPress={() =>
                  setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))
                }
                style={fs.zoomBtn}
              >
                <Text style={fs.zoomText}>−</Text>
              </Pressable>

              <Pressable onPress={() => setZoom(1)} style={fs.zoomBtn}>
                <Text style={fs.zoomText}>Reset</Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))
                }
                style={fs.zoomBtn}
              >
                <Text style={fs.zoomText}>+</Text>
              </Pressable>
            </View>
          </View>

          {/* ✅ Scroll horizontal + vertical anidados para permitir ambas direcciones */}
          <ScrollView bounces={false} showsVerticalScrollIndicator>
            <ScrollView
              horizontal
              bounces={false}
              showsHorizontalScrollIndicator
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
            >
              <View style={{ alignSelf: "flex-start", paddingTop: 12 }}>
                <LineChart
                  data={chartData}
                  width={fsZoomedChartWidth}
                  height={fsChartHeight}
                  yAxisInterval={1}
                  formatYLabel={(v) => formatMillions2(Number(v))}
                  chartConfig={{
                    backgroundColor: "#fff",
                    backgroundGradientFrom: "#fff",
                    backgroundGradientTo: "#fff",
                    decimalPlaces: 0,
                    color: (o = 1) => `rgba(59,130,246,${o})`,
                    labelColor: (o = 1) => `rgba(17,17,17,${o})`,
                    propsForDots: { r: "4" },
                    propsForBackgroundLines: { stroke: "rgba(0,0,0,0.08)" },
                  }}
                  bezier={false}
                  withDots
                  withInnerLines
                  withOuterLines={false}
                  fromZero
                  // ✅ Valores en cada punto (solo fullscreen), con 2 decimales en M
                  renderDotContent={({ x, y, index, indexData }) => {
                    // Si hay MUCHAS series, puede saturar. Si quieres, lo limito a zoom>=1.5
                    const v = Number(indexData);
                    if (!Number.isFinite(v) || v === 0) return null;

                    return (
                      <SvgText
                        key={`dot-label-${index}-${x}-${y}`}
                        x={x}
                        y={y - 8}
                        fontSize="10"
                        fill="#111"
                        textAnchor="middle"
                      >
                        {formatMillions2(v)}
                      </SvgText>
                    );
                  }}
                />
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showYearPicker} transparent animationType="fade">
        <Pressable
          style={modal.backdrop}
          onPress={() => setShowYearPicker(false)}
        >
          <View style={modal.card}>
            <Text style={modal.title}>Seleccionar Año</Text>
            <ScrollView>
              {Array.from(
                { length: 10 },
                (_, i) => new Date().getFullYear() - 5 + i,
              ).map((year) => (
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
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showMonthPicker} transparent animationType="fade">
        <Pressable
          style={modal.backdrop}
          onPress={() => setShowMonthPicker(false)}
        >
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
                        : {
                            backgroundColor: "#F0F7FF",
                            borderColor: "#E0E0E0",
                          },
                    ]}
                  >
                    <Text
                      style={[
                        modal.monthText,
                        selected ? { color: "#fff" } : { color: "#3B82F6" },
                      ]}
                    >
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
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
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

const fs = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3B82F6",
    backgroundColor: "#F0F7FF",
  },
  btnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B82F6",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#111",
  },
  closeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  title: {
    flex: 1,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 14,
    color: "#111",
  },
  zoomRow: { flexDirection: "row", gap: 8 },
  zoomBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    backgroundColor: "#fff",
  },
  zoomText: { fontWeight: "800", fontSize: 12, color: "#111" },
});
