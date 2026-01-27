import { api } from "@/constants/api";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  FilterRow,
  DateFilter,
  SegmentedFilter,
} from "@/components/dashboard/chart-filters";
import { FiltersPanel } from "@/components/dashboard/filters-panel";
import { ScreenShell } from "@/components/dashboard/screen-shell";
import { useDashboardFilters } from "@/components/dashboard/filters-context";
import {
  addDays,
  endOfMonth,
  formatCompact,
  formatCurrency,
  formatDateInput,
  formatNumberExact,
  sparsifyLabels,
  startOfMonth,
  startOfWeek,
} from "@/components/dashboard/utils";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

/* =========================
   TYPES
========================= */

interface ClienteHoraRow {
  sucursal: string;
  hora: number;
  fecha?: string;
  clientes: number;
}

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

type MedioPagoRange = "dia" | "semana" | "mes";

const truncateLabel = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

/* =========================
   CONSTANTS
========================= */

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

/* =========================
   COMPONENT
========================= */

export default function VentasScreen() {
  const { requestParams = {} } = useDashboardFilters();

  const { width } = useWindowDimensions();
  const chartWidth = Math.max(320, width - 40);

  /* =========================
     STATE
  ========================= */

  const [clientesHora, setClientesHora] = useState<ClienteHoraRow[]>([]);
  const [ventasAnuales, setVentasAnuales] = useState<VentasAnualesRow[]>([]);
  const [ventasMedioPago, setVentasMedioPago] = useState<MedioPagoRow[]>([]);
  const [ventasGrupo, setVentasGrupo] = useState<GrupoVentaRow[]>([]);

  const [loadingClientesHora, setLoadingClientesHora] = useState(true);
  const [loadingVentasAnuales, setLoadingVentasAnuales] = useState(true);
  const [loadingVentasMedioPago, setLoadingVentasMedioPago] = useState(true);
  const [loadingVentasGrupo, setLoadingVentasGrupo] = useState(true);

  const [clientesDate, setClientesDate] = useState(new Date());
  const [medioPagoDate, setMedioPagoDate] = useState(new Date());
  const [medioPagoRange, setMedioPagoRange] =
    useState<MedioPagoRange>("mes");

  const [clientesHoraDetailOpen, setClientesHoraDetailOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* =========================
     DERIVED
  ========================= */

  const baseRequestParams = useMemo(() => {
    const { sucursales: _sucursales, ...rest } = requestParams as Record<
      string,
      string
    >;
    return rest;
  }, [requestParams]);

  /* =========================
     PARAMS
  ========================= */

  const clientesParams = useMemo(
    () => ({
      ...baseRequestParams,
      desde: formatDateInput(clientesDate),
      hasta: formatDateInput(clientesDate),
    }),
    [baseRequestParams, clientesDate]
  );

  const medioPagoParams = useMemo(() => {
    let start = medioPagoDate;
    let end = medioPagoDate;

    if (medioPagoRange === "semana") {
      start = startOfWeek(medioPagoDate);
      end = addDays(start, 6);
    }

    if (medioPagoRange === "mes") {
      start = startOfMonth(medioPagoDate);
      end = endOfMonth(medioPagoDate);
    }

    return {
      ...baseRequestParams,
      desde: formatDateInput(start),
      hasta: formatDateInput(end),
    };
  }, [baseRequestParams, medioPagoDate, medioPagoRange]);

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

  useEffect(() => {
    void loadVentasGrupo();
  }, [loadVentasGrupo]);

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

  useEffect(() => {
    void loadVentasMedioPago();
  }, [loadVentasMedioPago]);

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
     CHART: VENTAS POR ANIO (LINE)
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

  const ventasAnualesLegend = useMemo(
    () => ventasAnualesBranches.map((branch) => truncateLabel(branch, 10)),
    [ventasAnualesBranches]
  );

  const ventasAnualesData = useMemo(() => {
    return {
      labels: ventasAnualesYears.map((year) => String(year)),
      datasets: ventasAnualesBranches.map((branch, idx) => ({
        data: ventasAnualesYears.map((year) =>
          ventasAnuales
            .filter((row) => row.sucursal === branch && row.anio === year)
            .reduce((acc, row) => acc + row.total, 0)
        ),
        color: (o: number) => `rgba(${getBranchColor(branch, idx)},${o})`,
        strokeWidth: 2,
      })),
      legend: ventasAnualesLegend,
    };
  }, [
    ventasAnuales,
    ventasAnualesBranches,
    ventasAnualesLegend,
    ventasAnualesYears,
  ]);

  /* =========================
     CHART: VENTAS POR SUCURSAL (BAR)
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
    <ScreenShell
      title="Ventas"
      subtitle="Indicadores del periodo"
      refreshing={refreshing}
      onRefresh={loadAllData}
    >
      <FiltersPanel />
      
      {/* =========================
          VENTAS POR ANIO (LINEA)
      ========================= */}
      <ChartCard
        title="Ventas por año"
        data={ventasAnualesData}
        kind="line"
        colorRgb="59,130,246"
        width={chartWidth}
        height={280}
        xLabel="Año"
        yLabel="Ventas"
        formatValue={formatCompact}
        formatDetailValue={formatCurrency}
        formatAxisValue={formatCompact}
        scrollable
        minWidth={Math.max(chartWidth, ventasAnualesYears.length * 72)}
        isLoading={loadingVentasAnuales}
        isEmpty={!ventasAnuales.length}
        detailLabels={ventasAnualesYears.map((year) => String(year))}
      />

      {/* =========================
          VENTAS POR SUCURSAL (BARRAS)
      ========================= */}
      <ChartCard
        title="Ventas por sucursal"
        data={ventasSucursalChart}
        kind="bar"
        colorRgb="16,185,129"
        width={chartWidth}
        height={300}
        xLabel="Sucursal"
        formatValue={formatCompact}
        formatDetailValue={formatCurrency}
        formatAxisValue={formatCompact}
        scrollable
        minWidth={Math.max(chartWidth, ventasSucursalLabels.length * 52)}
        isLoading={loadingVentasAnuales}
        isEmpty={!ventasSucursalRows.length}
        detailLabels={ventasSucursalLabels}
      />

      {/* =========================
          VENTAS POR MEDIO DE PAGO (BARRAS)
      ========================= */}
      <FilterRow title="Ventas por medio de pago">
        <DateFilter
          label="Fecha base"
          value={medioPagoDate}
          onChange={setMedioPagoDate}
        />
        <SegmentedFilter
          label="Rango"
          value={medioPagoRange}
          onChange={setMedioPagoRange}
          options={[
            { label: "Día", value: "dia" },
            { label: "Semana", value: "semana" },
            { label: "Mes", value: "mes" },
          ]}
        />
      </FilterRow>

      <ChartCard
        title="Ventas por medio de pago"
        data={ventasMedioPagoData}
        kind="bar"
        colorRgb="59,130,246"
        width={chartWidth}
        height={300}
        formatValue={formatCompact}
        formatDetailValue={formatCurrency}
        formatAxisValue={formatCompact}
        scrollable
        minWidth={Math.max(chartWidth, ventasMedioPagoLabels.length * 56)}
        isLoading={loadingVentasMedioPago}
        isEmpty={!ventasMedioPago.length}
        detailLabels={ventasMedioPagoLabels}
      />

      {/* =========================
          VENTAS POR GRUPO (PIE)
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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({});
