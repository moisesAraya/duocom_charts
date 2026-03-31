import * as ScreenOrientation from "expo-screen-orientation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { LineChart } from "react-native-chart-kit";
import { Text as SvgText } from "react-native-svg";
import { BranchMultiSelect } from "@/components/dashboard/branch-multi-select";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  branchQueryParamsFromIds,
  canonicalBranchId,
  isRowSucursalInSelection,
  unionCanonicalIds,
  useDashboardFilters,
} from "@/components/dashboard/filters-context";
import { ScreenShell } from "@/components/dashboard/screen-shell";
import {
  formatCompact,
  formatCurrency,
  formatDateInput,
  sparsifyLabels,
} from "@/components/dashboard/utils";
import { api } from "@/constants/api";

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

interface VentaTiempoRealRow {
  fechaHora: string;
  totalAcumulado: number;
  sucursal?: string;
}

interface VentasTiempoRealKpis {
  ticketPromedioDiario: number;
  ticketPromedioMensual: number;
  cantidadTicketsDia: number;
  cantidadTicketsMes: number;
  promedioTicketsDiarioMes: number;
  frecuenciaVentaMinutos: number | null;
}

const SERIES_COLORS = [
  "59, 130, 246",
  "16, 185, 129",
  "245, 158, 11",
  "139, 92, 246",
  "236, 72, 153",
  "14, 116, 144",
  "234, 88, 12",
  "248, 113, 113",
  "34, 197, 94",
  "251, 146, 60",
];

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const truncateLabel = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const getBranchColor = (branch: string, fallbackIndex = 0): string => {
  if (!branch) return SERIES_COLORS[fallbackIndex % SERIES_COLORS.length];
  let hash = 0;
  for (let i = 0; i < branch.length; i += 1) {
    hash = (hash * 31 + branch.charCodeAt(i)) % 997;
  }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
};

const calcStepFromMax = (max: number) => {
  if (!Number.isFinite(max) || max <= 0) return 1;
  if (max <= 10) return 1;
  if (max <= 50) return 5;
  if (max <= 100) return 10;
  return Math.ceil(max / 5);
};

const niceStep = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exponent);
  let niceFraction = 10;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  return niceFraction * Math.pow(10, exponent);
};

export default function VentasScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(280, width - 40);
  const {
    requestParams = {},
    sucursalesReady,
    sucursales,
  } = useDashboardFilters();

  /** Selección por gráfico (independiente del filtro global de otras pestañas). */
  const [selTiempoReal, setSelTiempoReal] = useState<string[]>([]);
  const [selAnuales, setSelAnuales] = useState<string[]>([]);
  const [selBar, setSelBar] = useState<string[]>([]);
  const [selGrupo, setSelGrupo] = useState<string[]>([]);
  const [branchChartsReady, setBranchChartsReady] = useState(false);
  const branchSelInitRef = useRef(false);

  useEffect(() => {
    if (!sucursalesReady) return;
    if (!sucursales.length) {
      setBranchChartsReady(true);
      return;
    }
    if (branchSelInitRef.current) return;
    branchSelInitRef.current = true;
    const all = sucursales.map((s) => s.id);
    setSelTiempoReal([all[0]]);
    setSelAnuales(all);
    setSelBar(all);
    setSelGrupo(all);
    setBranchChartsReady(true);
  }, [sucursalesReady, sucursales]);

  const toggleIn = useCallback((setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    return (id: string) => {
      setter((prev) => {
        const c = canonicalBranchId(id);
        if (prev.some((p) => canonicalBranchId(p) === c)) {
          return prev.filter((p) => canonicalBranchId(p) !== c);
        }
        return [...prev, id];
      });
    };
  }, []);

  const selectAllFor = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => () => {
      setter(sucursales.map((s) => s.id));
    },
    [sucursales],
  );

  const clearFor = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => () => {
      setter([]);
    },
    [],
  );

  const idsAnualesUnion = useMemo(
    () => unionCanonicalIds(selAnuales, selBar),
    [selAnuales, selBar],
  );

  const selectSoloTiempoReal = useCallback((id: string) => {
    setSelTiempoReal([id]);
  }, []);

  const tiempoRealLineRgb = useMemo(() => {
    const id = selTiempoReal[0];
    const one = id
      ? sucursales.find((s) => canonicalBranchId(s.id) === canonicalBranchId(id))
      : undefined;
    if (one) return getBranchColor(one.nombre, 0);
    return "16, 185, 129";
  }, [sucursales, selTiempoReal]);

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
  const [loadingVentasTiempoReal, setLoadingVentasTiempoReal] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [showVentasAnualesValues, setShowVentasAnualesValues] = useState(false);
  const [showVentasSucursalValues, setShowVentasSucursalValues] = useState(false);
  const [ventasTiempoReal, setVentasTiempoReal] = useState<VentaTiempoRealRow[]>([]);
  const [ventasTiempoRealEsMock, setVentasTiempoRealEsMock] = useState(false);
  const [showVentasTiempoRealDetalle, setShowVentasTiempoRealDetalle] = useState(false);
  const [ultimaConsultaTiempoReal, setUltimaConsultaTiempoReal] = useState<Date | null>(null);
  const [ventasTiempoRealKpis, setVentasTiempoRealKpis] = useState<VentasTiempoRealKpis | null>(
    null,
  );

  const ventasTiempoRealReqSeq = useRef(0);

  /* =========================
     DERIVED PARAMS
  ========================= */

  const baseRequestParams = useMemo(() => {
    return requestParams as Record<string, string>;
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
      ...branchQueryParamsFromIds(sucursales, idsAnualesUnion),
      years: 5,
    }),
    [baseRequestParams, sucursales, idsAnualesUnion],
  );

  /* =========================
     LOADERS
  ========================= */

  const loadVentasGrupo = useCallback(async () => {
    setLoadingVentasGrupo(true);
    try {
      const res = await api.get("/api/dashboard/ventas-por-grupo", {
        params: {
          ...baseRequestParams,
          ...branchQueryParamsFromIds(sucursales, selGrupo),
        },
      });
      setVentasGrupo(
        (res.data?.data ?? [])
          .filter((r: any) => r)
          .map((r: any) => ({
            grupo: String(r.grupo || r.Grupo || r.GRUPO || "").trim(),
            monto: toNumber(r.total ?? r.monto ?? r.Total ?? r.Monto),
          })),
      );
    } catch {
      setVentasGrupo([]);
    } finally {
      setLoadingVentasGrupo(false);
    }
  }, [baseRequestParams, sucursales, selGrupo]);

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
  const loadVentasTiempoReal = useCallback(async (clickedAt?: Date) => {
    const seq = ++ventasTiempoRealReqSeq.current;
    setLoadingVentasTiempoReal(true);
    setVentasTiempoReal([]);
    setVentasTiempoRealKpis(null);
    const requestMoment = clickedAt ?? new Date();
    try {
      const trParams = {
        ...baseRequestParams,
        ...branchQueryParamsFromIds(sucursales, selTiempoReal),
      };
      const hourlyParams = {
        ...trParams,
        at: requestMoment.toISOString(),
        tzOffsetMin: requestMoment.getTimezoneOffset(),
      };

      const [hourlySettled, snapshotSettled] = await Promise.allSettled([
        api.get("/api/dashboard/ventas-tiempo-real-hora", { params: hourlyParams }),
        api.get("/api/dashboard/venta-minuto", {
          params: { ...trParams, limit: 240 },
        }),
      ]);

      let rows: VentaTiempoRealRow[] = [];
      if (hourlySettled.status === "fulfilled") {
        const payload = hourlySettled.value.data;
        rows = (payload?.data ?? [])
          .map((row: any) => ({
            fechaHora: String(row.fechaHora ?? row.fechahora ?? ""),
            totalAcumulado: toNumber(
              row.totalAcumulado ?? row.totalacumulado ?? row.total,
            ),
            sucursal: row.sucursal,
          }))
          .filter(
            (r: VentaTiempoRealRow) =>
              r.fechaHora && Number.isFinite(r.totalAcumulado),
          );
      } else {
        console.warn(
          "[ventas] ventas-tiempo-real-hora:",
          hourlySettled.reason,
        );
      }

      const snapshotRes =
        snapshotSettled.status === "fulfilled" ? snapshotSettled.value : null;
      if (snapshotSettled.status === "rejected") {
        console.warn("[ventas] venta-minuto:", snapshotSettled.reason);
      }

      if (seq !== ventasTiempoRealReqSeq.current) return;

      const snapshotRows = (snapshotRes?.data?.data ?? []).filter((r: unknown) =>
        Boolean(r),
      );

      let series = rows;
      // Solo si el horario no devolvió puntos: un punto “ahora” desde venta-minuto (evita pisar serie buena por carrera de requests)
      if (!series.length && snapshotRows.length > 0) {
        const totalDia = snapshotRows.reduce(
          (acc: number, r: any) => acc + toNumber(r.venta_dia),
          0,
        );
        series = [
          {
            fechaHora: requestMoment.toISOString(),
            totalAcumulado: totalDia,
            sucursal: undefined,
          },
        ];
      }

      const totalVentaDia = snapshotRows.reduce(
        (acc: number, r: any) => acc + toNumber(r.venta_dia),
        0,
      );
      const totalVentaMes = snapshotRows.reduce(
        (acc: number, r: any) => acc + toNumber(r.venta_acum_mes),
        0,
      );
      const totalTicketsDia = snapshotRows.reduce(
        (acc: number, r: any) => acc + toNumber(r.ticket_dia),
        0,
      );
      const totalTicketsMes = snapshotRows.reduce(
        (acc: number, r: any) => acc + toNumber(r.ticket_acum_mes),
        0,
      );
      const maxDiasLaborales = snapshotRows.reduce((acc: number, r: any) => {
        const raw = String(r.dias_laborales ?? "");
        const [transcurridosRaw] = raw.split("/");
        const transcurridos = toNumber(transcurridosRaw);
        return Math.max(acc, transcurridos);
      }, 0);
      const minutesSince8 =
        Math.max(0, requestMoment.getHours() - 8) * 60 + requestMoment.getMinutes();

      // Una sola comprobación antes de actualizar UI: si no, se podía actualizar la serie
      // y omitir KPIs si otra petición incrementó seq entre medias (gráfico vs cajas desalineados).
      if (seq !== ventasTiempoRealReqSeq.current) return;

      setVentasTiempoReal(series);
      setVentasTiempoRealEsMock(false);
      setVentasTiempoRealKpis({
        ticketPromedioDiario:
          totalTicketsDia > 0 ? totalVentaDia / totalTicketsDia : 0,
        ticketPromedioMensual:
          totalTicketsMes > 0 ? totalVentaMes / totalTicketsMes : 0,
        cantidadTicketsDia: totalTicketsDia,
        cantidadTicketsMes: totalTicketsMes,
        promedioTicketsDiarioMes:
          maxDiasLaborales > 0 ? totalTicketsMes / maxDiasLaborales : 0,
        frecuenciaVentaMinutos:
          totalTicketsDia > 0 ? Number((minutesSince8 / totalTicketsDia).toFixed(2)) : null,
      });
    } catch {
      if (seq === ventasTiempoRealReqSeq.current) {
        setVentasTiempoReal([]);
        setVentasTiempoRealEsMock(false);
        setVentasTiempoRealKpis(null);
      }
    } finally {
      if (seq === ventasTiempoRealReqSeq.current) {
        setLoadingVentasTiempoReal(false);
        setUltimaConsultaTiempoReal(new Date());
      }
    }
  }, [baseRequestParams, sucursales, selTiempoReal]);

  useEffect(() => {
    if (!sucursalesReady || !branchChartsReady) return;
    void loadVentasGrupo();
  }, [sucursalesReady, branchChartsReady, loadVentasGrupo]);

  useEffect(() => {
    if (!sucursalesReady || !branchChartsReady) return;
    void loadVentasMedioPago();
  }, [sucursalesReady, branchChartsReady, loadVentasMedioPago]);

  useEffect(() => {
    if (!sucursalesReady || !branchChartsReady) return;
    void loadVentasAnuales();
  }, [sucursalesReady, branchChartsReady, loadVentasAnuales, idsAnualesUnion]);

  useEffect(() => {
    if (!sucursalesReady || !branchChartsReady) return;
    void loadVentasTiempoReal(new Date());
  }, [sucursalesReady, branchChartsReady, loadVentasTiempoReal, selTiempoReal]);

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

  const ventasTiempoRealLabels = useMemo(() => {
    if (!ventasTiempoReal.length) return [];
    return ventasTiempoReal.map((row) => {
      const d = new Date(row.fechaHora);
      return Number.isNaN(d.getTime())
        ? ''
        : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
  }, [ventasTiempoReal]);

  const ventasTiempoRealData = useMemo(
    () => ({
      labels: ventasTiempoRealLabels,
      datasets: [
        {
          data: ventasTiempoReal.map((row) => row.totalAcumulado),
          color: (o: number) => `rgba(${tiempoRealLineRgb},${o})`,
          strokeWidth: 2,
        },
      ],
    }),
    [ventasTiempoReal, ventasTiempoRealLabels, tiempoRealLineRgb],
  );

  const totalAcumuladoHoy = useMemo(
    () => (ventasTiempoReal.length ? ventasTiempoReal[ventasTiempoReal.length - 1].totalAcumulado : 0),
    [ventasTiempoReal],
  );

  const acumuladoDiaTiempoRealLabel = useMemo(() => {
    if (loadingVentasTiempoReal && ventasTiempoReal.length === 0) return '--';
    if (!ventasTiempoReal.length) return '--';
    return formatCurrency(totalAcumuladoHoy);
  }, [loadingVentasTiempoReal, ventasTiempoReal.length, totalAcumuladoHoy]);

  const ultimaActualizacion = useMemo(() => {
    if (!ventasTiempoReal.length) return '--:--';
    const d = new Date(ventasTiempoReal[ventasTiempoReal.length - 1].fechaHora);
    if (Number.isNaN(d.getTime())) return '--:--';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [ventasTiempoReal]);

  const onRefreshVentasTiempoReal = useCallback(() => {
    void loadVentasTiempoReal(new Date());
  }, [loadVentasTiempoReal]);

  /* =========================
     CHART: VENTAS POR AÑO (LINE)
  ========================= */

  const ventasAnualesForLine = useMemo(
    () =>
      ventasAnuales.filter((r) =>
        isRowSucursalInSelection(r.sucursal, sucursales, selAnuales),
      ),
    [ventasAnuales, sucursales, selAnuales],
  );

  const ventasAnualesForBar = useMemo(
    () =>
      ventasAnuales.filter((r) =>
        isRowSucursalInSelection(r.sucursal, sucursales, selBar),
      ),
    [ventasAnuales, sucursales, selBar],
  );

  const ventasAnualesYears = useMemo(() => {
    const years = Array.from(new Set(ventasAnualesForLine.map((r) => r.anio))).filter(
      (year) => Number.isFinite(year),
    );
    return years.sort((a, b) => a - b);
  }, [ventasAnualesForLine]);

  const ventasAnualesBranches = useMemo(() => {
    return Array.from(
      new Set(ventasAnualesForLine.map((r) => r.sucursal).filter(Boolean)),
    );
  }, [ventasAnualesForLine]);

  const ventasSucursalRows = useMemo(() => {
    const totals = new Map<string, number>();
    ventasAnualesForBar.forEach((row) => {
      totals.set(row.sucursal, (totals.get(row.sucursal) ?? 0) + row.total);
    });
    return Array.from(totals.entries())
      .map(([sucursal, total]) => ({ sucursal, total }))
      .sort((a, b) => b.total - a.total);
  }, [ventasAnualesForBar]);

  const ventasAnualesData = useMemo(() => {
    const filteredBranches = ventasAnualesBranches;

    // Agregar un año anterior al primero para crear espacio
    const firstYear = ventasAnualesYears[0];
    const yearsWithPadding = firstYear ? [firstYear - 1, ...ventasAnualesYears] : ventasAnualesYears;
    const yearLabels = yearsWithPadding.map((year) => String(year));

    return {
      labels: yearLabels,
      datasets: filteredBranches.map((branch, idx) => ({
        data: yearsWithPadding.map((year) =>
          ventasAnualesForLine
            .filter(
              (r) => r.sucursal === branch && r.anio === year,
            )
            .map((r) => r.total)[0] ?? 0,
        ),
        color: () => `rgba(${getBranchColor(branch, idx)},1)`,
        strokeWidth: 2,
        withDots: true,
      })),
    };
  }, [ventasAnualesForLine, ventasAnualesBranches, ventasAnualesYears]);

  /* =========================
     DERIVED HOOKS & HELPERS (must be after all dependencies)
  ========================= */

  const formatTicketCount = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value)
      ? value.toLocaleString('es-CL')
      : '--';

  const ventasSucursalDetailLabels = useMemo(
    () => ventasSucursalRows.map((_, i) => `#${i + 1}`),
    [ventasSucursalRows],
  );

  const promedioTicketsDiaMesLabel = useMemo(() => {
    if (!ventasTiempoRealKpis || !Number.isFinite(ventasTiempoRealKpis.promedioTicketsDiarioMes)) return '--';
    return formatTicketCount(ventasTiempoRealKpis.promedioTicketsDiarioMes);
  }, [ventasTiempoRealKpis]);

  const frecuenciaVentasLabel = useMemo(() => {
    if (!ventasTiempoRealKpis || ventasTiempoRealKpis.frecuenciaVentaMinutos == null) return '--';
    return `${ventasTiempoRealKpis.frecuenciaVentaMinutos} min`;
  }, [ventasTiempoRealKpis]);

  const horaConsulta = useMemo(() => {
    if (!ventasTiempoReal.length) return '--:--';
    const d = new Date(ventasTiempoReal[ventasTiempoReal.length - 1].fechaHora);
    if (Number.isNaN(d.getTime())) return '--:--';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [ventasTiempoReal]);

  const ventasTiempoRealDetalle = useMemo(() =>
    ventasTiempoReal.map((row) => ({
      ...row,
      hora: (() => {
        const d = new Date(row.fechaHora);
        return Number.isNaN(d.getTime())
          ? '--:--'
          : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })(),
    })),
    [ventasTiempoReal],
  );

  const ventasSucursalYAxisStep = useMemo(() => {
    if (!ventasSucursalRows.length) return 1;
    const max = Math.max(...ventasSucursalRows.map((r) => r.total / 1_000_000));
    return calcStepFromMax(max);
  }, [ventasSucursalRows]);

  const ventasGrupoData = useMemo(() => {
    if (!ventasGrupo.length) return { labels: [], datasets: [] };
    return {
      labels: ventasGrupo.map((g) => truncateLabel(g.grupo, 12)),
      datasets: [
        {
          data: ventasGrupo.map((g) => g.monto),
        },
      ],
    };
  }, [ventasGrupo]);

  const ventasSucursalChart = useMemo(() => ({
    labels: sparsifyLabels(
      ventasSucursalRows.map((_, i) => String(i + 1)),
      8,
    ),
    datasets: [
      {
        data: ventasSucursalRows.map((row) => row.total / 1_000_000),
        colors: ventasSucursalRows.map(
          (row, idx) => (o: number) =>
            `rgba(${getBranchColor(row.sucursal, idx)},${o})`,
        ),
      },
    ],
  }), [ventasSucursalRows]);

  /* =========================
     RENDER
  ========================= */

  return (
    <ScreenShell title="Ventas" refreshing={refreshing} onRefresh={loadAllData}>
      <ChartCard
        title="Ventas en tiempo real"
        headerContent={
          <View style={styles.rtHeaderBlock}>
            {sucursales.length > 0 ? (
              <BranchMultiSelect
                variant="inline"
                single
                value={selTiempoReal}
                onToggle={selectSoloTiempoReal}
                scopeHint="Tiempo real"
              />
            ) : null}
            <View style={styles.rtKpiRow}>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Acumulado del día</Text>
                <Text style={styles.rtKpiValue}>{acumuladoDiaTiempoRealLabel}</Text>
              </View>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Dato hasta</Text>
                <Text style={styles.rtKpiValue}>{ultimaActualizacion}</Text>
              </View>
            </View>
            <View style={styles.rtKpiRow}>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Ticket promedio diario</Text>
                <Text style={styles.rtKpiValue}>
                  {ventasTiempoRealKpis
                    ? formatCurrency(ventasTiempoRealKpis.ticketPromedioDiario)
                    : '--'}
                </Text>
              </View>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Ticket promedio mensual</Text>
                <Text style={styles.rtKpiValue}>
                  {ventasTiempoRealKpis
                    ? formatCurrency(ventasTiempoRealKpis.ticketPromedioMensual)
                    : '--'}
                </Text>
              </View>
            </View>
            <View style={styles.rtKpiRow}>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Tickets diarios</Text>
                <Text style={styles.rtKpiValue}>
                  {ventasTiempoRealKpis
                    ? formatTicketCount(ventasTiempoRealKpis.cantidadTicketsDia)
                    : '--'}
                </Text>
              </View>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Tickets mensuales (acum.)</Text>
                <Text style={styles.rtKpiValue}>
                  {ventasTiempoRealKpis
                    ? formatTicketCount(ventasTiempoRealKpis.cantidadTicketsMes)
                    : '--'}
                </Text>
              </View>
            </View>
            <View style={styles.rtKpiRow}>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Promedio tickets/día (mes)</Text>
                <Text style={styles.rtKpiValue}>{promedioTicketsDiaMesLabel}</Text>
              </View>
              <View style={styles.rtKpiBox}>
                <Text style={styles.rtKpiLabel}>Frecuencia de ventas</Text>
                <Text style={styles.rtKpiValue}>{frecuenciaVentasLabel}</Text>
              </View>
            </View>
            <View style={styles.rtActionsRow}>
              <Pressable
                style={[styles.detailButton, styles.rtSecondaryButton]}
                onPress={() => setShowVentasTiempoRealDetalle((prev) => !prev)}
              >
                <Text style={[styles.detailButtonText, styles.rtSecondaryButtonText]}>
                  {showVentasTiempoRealDetalle ? 'Ocultar detalle' : 'Ver detalle'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.detailButton}
                onPress={onRefreshVentasTiempoReal}
              >
                <Text style={styles.detailButtonText}>
                  Actualizar ahora
                </Text>
              </Pressable>
            </View>
            <Text style={styles.rtUpdatedAt}>Consulta realizada: {horaConsulta}</Text>
            {ventasTiempoRealEsMock && (
              <Text style={styles.rtMockBadge}>Mostrando datos de prueba</Text>
            )}
            {showVentasTiempoRealDetalle && (
              <View style={styles.rtDetailPanel}>
                <Text style={styles.rtDetailTitle}>Historial completo ({ventasTiempoRealDetalle.length} registros)</Text>
                <ScrollView
                  style={styles.rtDetailScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {ventasTiempoRealDetalle.map((row) => (
                    <View key={`${row.fechaHora}-${row.totalAcumulado}`} style={styles.rtDetailRow}>
                      <Text style={styles.rtDetailTime}>{row.hora}</Text>
                      <Text style={styles.rtDetailValue}>{formatCurrency(row.totalAcumulado)}</Text>
                    </View>
                  ))}
                  {!ventasTiempoRealDetalle.length && (
                    <Text style={styles.rtDetailEmpty}>Sin movimientos para mostrar.</Text>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        }
        data={ventasTiempoRealData}
        kind="line"
        colorRgb={tiempoRealLineRgb.replace(/\s/g, "")}
        width={chartWidth}
        height={260}
        xLabel="Hora"
        yLabel="Acumulado ($)"
        formatValue={(v) => `$${formatCompact(v)}`}
        formatDetailValue={formatCurrency}
        formatAxisValue={(v) => `$${formatCompact(v)}`}
        scrollable
        minWidth={Math.max(chartWidth, ventasTiempoReal.length * 42)}
        isLoading={loadingVentasTiempoReal}
        isEmpty={!ventasTiempoReal.length}
        detailLabels={ventasTiempoRealLabels}
        hideHint={true}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChartCard
          title="Ventas por año"
          headerContent={
            <View>
              {sucursales.length > 0 ? (
                <BranchMultiSelect
                  variant="inline"
                  value={selAnuales}
                  onToggle={toggleIn(setSelAnuales)}
                  onSelectAll={selectAllFor(setSelAnuales)}
                  onClear={clearFor(setSelAnuales)}
                  scopeHint="Por año"
                />
              ) : null}
              {ventasAnualesYears.length > 6 && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
                    Años disponibles: {ventasAnualesYears.join(" • ")}
                  </Text>
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
          yLabel="Ventas ($M)"
          formatValue={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
          formatDetailValue={(v) => `$${(v / 1_000_000).toFixed(2)}M`}
          formatAxisValue={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
          yAxisInterval={200_000_000}
          scrollable={false}
          minWidth={ventasAnualesYears.length * 60}
          isLoading={loadingVentasAnuales}
          isEmpty={!ventasAnualesForLine.length || !ventasAnualesBranches.length}
          detailLabels={ventasAnualesYears.map((year) => String(year))}
          detailTrigger="tap"
          showValuesOnTop={showVentasAnualesValues}
          hideHint={true}
          hideLegend={ventasAnualesBranches.length > 1}
        />
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ChartCard
          title="Ventas por sucursal"
          headerContent={
            <View>
              {sucursales.length > 0 ? (
                <BranchMultiSelect
                  variant="inline"
                  value={selBar}
                  onToggle={toggleIn(setSelBar)}
                  onSelectAll={selectAllFor(setSelBar)}
                  onClear={clearFor(setSelBar)}
                  scopeHint="Ranking barras"
                />
              ) : null}
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
          xLabel="Orden"
          yLabel="Ventas ($M)"
          yAxisSuffix="M"
          formatValue={(v) => `$${formatCompact(v)}`}
          formatDetailValue={(v) => `$${v.toFixed(0)}M`}
          yAxisInterval={ventasSucursalYAxisStep}
          scrollable={false}
          minWidth={Math.max(chartWidth, ventasSucursalRows.length * 45)}
          isLoading={loadingVentasAnuales}
          isEmpty={!ventasSucursalRows.length}
          detailLabels={ventasSucursalDetailLabels}
          showValuesOnTop={showVentasSucursalValues}
          hideHint={true}
        />
      </ScrollView>


      {/* Eliminados: Ventas por medio de pago y Ventas por grupo */}

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
        headerContent={
          sucursales.length > 0 ? (
            <BranchMultiSelect
              variant="inline"
              value={selGrupo}
              onToggle={toggleIn(setSelGrupo)}
              onSelectAll={selectAllFor(setSelGrupo)}
              onClear={clearFor(setSelGrupo)}
              scopeHint="Por grupo"
            />
          ) : null
        }
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
              row["Día"] ||
                row["Dia"] ||
                row["DIA"] ||
                row["dia"] ||
                row["dia_mes"] ||
                row["dia_del_mes"] ||
                row["DIA_MES"] ||
                row["DIA_DEL_MES"] ||
                row["day"] ||
                0,
            );

            const total = Number(
              row["Total"] ||
                row["TOTAL"] ||
                row["total"] ||
                row["total_dia"] ||
                row["TOTAL_DIA"] ||
                row["total_venta"] ||
                row["TOTAL_VENTA"] ||
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
        yLabel="Ventas ($)"
        isLoading={loading}
        isEmpty={chartData.datasets.length === 0}
        hideHint
        scrollable
        minWidth={xMinWidth}
        yAxisInterval={yAxisStepM}
        formatAxisValue={(v) => `$${formatCompact(v)}`}
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
    width: '100%',
    maxWidth: '100%',
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
  rtHeaderBlock: {
    marginBottom: 10,
  },
  rtSubtitle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
    marginBottom: 2,
  },
  rtKpiRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  rtKpiBox: {
    flex: 1,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 10,
  },
  rtKpiLabel: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 4,
    fontWeight: "600",
  },
  rtKpiValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  rtActionsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  rtSecondaryButton: {
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  rtSecondaryButtonText: {
    color: "#3B82F6",
  },
  rtUpdatedAt: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  rtMockBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
  },
  rtDetailPanel: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rtDetailTitle: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "700",
    marginBottom: 8,
  },
  rtDetailScroll: {
    maxHeight: 220,
  },
  rtDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  rtDetailTime: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  rtDetailValue: {
    fontSize: 12,
    color: "#0F172A",
    fontWeight: "700",
  },
  rtDetailEmpty: {
    fontSize: 12,
    color: "#64748B",
    fontStyle: "italic",
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
