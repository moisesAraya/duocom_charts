import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";
import { makeChartConfig } from "./chart-config";

const PIE_COLORS = [
  "rgba(59, 130, 246, 1)",
  "rgba(16, 185, 129, 1)",
  "rgba(245, 158, 11, 1)",
  "rgba(139, 92, 246, 1)",
  "rgba(236, 72, 153, 1)",
  "rgba(14, 116, 144, 1)",
  "rgba(234, 88, 12, 1)",
  "rgba(248, 113, 113, 1)",
  "rgba(34, 197, 94, 1)",
  "rgba(251, 146, 60, 1)",
];

type ChartKind = "line" | "bar" | "pie";

interface ChartCardProps {
  title: string;
  subtitle?: string;

  /** ✅ NUEVO: contenido bajo el título y antes del gráfico (controles, filtros, chips, etc.) */
  headerContent?: React.ReactNode;

  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  scrollable?: boolean;
  minWidth?: number;
  showValuesOnTop?: boolean;
  data: {
    labels: string[];
    datasets: {
      data: number[];
      color?: (opacity: number) => string;
      colors?: ((opacity: number) => string)[];
      strokeWidth?: number;

      /**
       * ✅ Opcional: para diferenciar líneas punteadas vs sólidas
       * (react-native-chart-kit lo soporta en LineChart datasets)
       */
      strokeDasharray?: number[];
    }[];
    legend?: string[];
  };
  detailLabels?: string[];
  kind?: ChartKind;
  colorRgb: string;
  width: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xLabelAlign?: "left" | "center" | "right";
  formatValue?: (value: number) => string;
  formatDetailValue?: (value: number) => string;
  formatAxisValue?: (value: number) => string;
  detailTrigger?: "tap" | "button";
  onBarPress?: (index: number) => void;
  dotRadius?: number;
  dotStrokeWidth?: number;
  hideHint?: boolean;
  barTapPaddingRatio?: number;
  barTapMinHeight?: number;
  containerStyle?: ViewStyle;
  enterDelay?: number;

  /**
   * Step sugerido (unidades del valor).
   * Internamente -> segments (cantidad de líneas del eje Y).
   */
  yAxisInterval?: number;
}

/* =========================
   HELPERS
========================= */

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

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

function getMaxValue(safeData: ChartCardProps["data"]) {
  const values = safeData.datasets.flatMap((ds) => ds.data ?? []);
  const max = Math.max(0, ...values.map((v) => (Number.isFinite(v) ? v : 0)));
  return Number.isFinite(max) ? max : 0;
}

function computeSegments({
  maxValue,
  preferredStep,
  minSegments = 4,
  maxSegments = 7,
  defaultSegments = 6,
}: {
  maxValue: number;
  preferredStep?: number;
  minSegments?: number;
  maxSegments?: number;
  defaultSegments?: number;
}) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return undefined;
  if (!preferredStep || preferredStep <= 0) return defaultSegments;

  const step = niceStep(preferredStep);
  const rawSegments = Math.ceil(maxValue / step);
  return clamp(rawSegments, minSegments, maxSegments);
}

export const ChartCard = ({
  title,
  subtitle,
  headerContent,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "Sin datos para mostrar.",
  scrollable = false,
  minWidth,
  showValuesOnTop = false,
  data,
  detailLabels,
  kind = "line",
  colorRgb,
  width,
  height = 260,
  xLabel,
  yLabel,
  formatValue,
  formatDetailValue,
  formatAxisValue,
  detailTrigger,
  onBarPress,
  barTapPaddingRatio = 0.65,
  barTapMinHeight = 10,
  dotRadius,
  dotStrokeWidth,
  hideHint = false,
  containerStyle,
  enterDelay = 0,
  yAxisInterval,
}: ChartCardProps) => {
  const anim = useRef(new Animated.Value(0)).current;
  const safeData = data || { labels: [], datasets: [] };

  const [selection, setSelection] = useState<{
    label: string;
    rows: { series: string; value: string }[];
  } | null>(null);

  const [detail, setDetail] = useState<typeof selection | null>(null);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 360,
      delay: enterDelay,
      useNativeDriver: true,
    }).start();
  }, [anim, enterDelay]);

  const animatedStyle = useMemo(
    () => ({
      opacity: anim,
      transform: [
        {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [16, 0],
          }),
        },
      ],
    }),
    [anim],
  );

  const getValueLabel = (value: number): string => {
    if (formatDetailValue) return formatDetailValue(value);
    if (formatValue) return formatValue(value);
    return value.toString();
  };

  const getSeriesLabel = (idx: number) =>
    safeData.legend?.[idx] ??
    (safeData.datasets.length > 1 ? `Serie ${idx + 1}` : "");

  const buildRows = (index: number, datasetIndex?: number) => {
    if (typeof datasetIndex === "number") {
      const dataset = safeData.datasets[datasetIndex];
      return [
        {
          series: getSeriesLabel(datasetIndex),
          value: getValueLabel(dataset?.data[index] ?? 0),
        },
      ];
    }
    return safeData.datasets.map((dataset, idx) => ({
      series: getSeriesLabel(idx),
      value: getValueLabel(dataset.data[index] ?? 0),
    }));
  };

  const buildDetail = (index: number, datasetIndex?: number) => {
    const label = detailLabels?.[index] ?? safeData.labels[index] ?? "";
    return { label, rows: buildRows(index, datasetIndex) };
  };

  /**
   * 🎯 HIT TESTING REAL DE BARRA
   */
  const handleBarTap = (x: number, y: number, contentWidth: number) => {
    if (!safeData.labels.length) return;

    const segmentWidth = contentWidth / safeData.labels.length;
    if (!Number.isFinite(segmentWidth) || segmentWidth <= 0) return;

    const index = Math.min(
      safeData.labels.length - 1,
      Math.max(0, Math.floor(x / segmentWidth)),
    );

    const maxValue = getMaxValue(safeData);
    if (maxValue <= 0) return;

    const datasetCount = Math.max(1, safeData.datasets.length);
    const barWidthRatio = barTapPaddingRatio;
    const barGroupWidth = segmentWidth * barWidthRatio;
    const barGroupLeft =
      index * segmentWidth + (segmentWidth - barGroupWidth) / 2;
    const barGroupRight = barGroupLeft + barGroupWidth;

    if (x < barGroupLeft || x > barGroupRight) return;

    const barSlotWidth = barGroupWidth / datasetCount;
    const rawDatasetIndex = Math.floor((x - barGroupLeft) / barSlotWidth);
    const datasetIndex = Math.min(
      datasetCount - 1,
      Math.max(0, rawDatasetIndex),
    );
    const valueAtIndex = safeData.datasets[datasetIndex]?.data[index] ?? 0;
    if (valueAtIndex <= 0) return;

    const topPadding = 16;
    const bottomPadding = 28;
    const chartAreaHeight = height - topPadding - bottomPadding;

    const barHeight = (valueAtIndex / maxValue) * chartAreaHeight;
    if (barHeight < barTapMinHeight) return;

    const barTop = topPadding + (chartAreaHeight - barHeight);
    const barBottom = topPadding + chartAreaHeight;

    const barLeft = barGroupLeft + datasetIndex * barSlotWidth;
    const barRight = barLeft + barSlotWidth;

    if (x < barLeft || x > barRight) return;
    if (y < barTop || y > barBottom) return;

    const detailPayload = buildDetail(index, datasetIndex);
    if (!detailPayload) return;

    setSelection(detailPayload);
    setDetail(detailPayload);
    onBarPress?.(index);
  };

  const triggerMode = detailTrigger ?? (kind === "line" ? "button" : "tap");

  const onPointPress = (payload: {
    value: number;
    index: number;
    x: number;
    y: number;
    dataset?: { data?: number[] };
  }) => {
    const datasetIndex = payload.dataset
      ? safeData.datasets.findIndex((ds) => ds === payload.dataset)
      : undefined;

    const detailPayload = buildDetail(payload.index, datasetIndex);
    if (!detailPayload) return;

    setSelection(detailPayload);
    if (triggerMode === "tap") setDetail(detailPayload);
  };

  const chartConfig = useMemo(() => {
    const baseConfig = makeChartConfig(
      colorRgb,
      formatAxisValue ? (v: string) => formatAxisValue(Number(v)) : undefined,
      { dotRadius, dotStrokeWidth },
    );

    if (kind === "bar") {
      return {
        ...baseConfig,
        strokeWidth: 0,
        propsForBackgroundLines: { stroke: "transparent" },
      };
    }

    return {
      ...baseConfig,
      propsForDots: undefined,
    };
  }, [colorRgb, dotRadius, dotStrokeWidth, formatAxisValue, kind]);

  const contentWidth = minWidth && minWidth > width ? minWidth : width;

  const pieData =
    kind === "pie"
      ? safeData.labels
          .map((label, index) => {
            const value = safeData.datasets.reduce(
              (acc, dataset) => acc + Number(dataset.data[index] ?? 0),
              0,
            );
            const color = PIE_COLORS[index % PIE_COLORS.length];
            return {
              name: label,
              population: value,
              color,
              legendFontColor: "#6B7280",
              legendFontSize: 12,
            };
          })
          .filter(
            (item) => Number.isFinite(item.population) && item.population > 0,
          )
      : [];

  const computedIsEmpty =
    isEmpty ||
    !safeData.datasets ||
    safeData.datasets.length === 0 ||
    !safeData.labels ||
    safeData.labels.length === 0 ||
    (kind === "pie" && pieData.length === 0);

  const maxValue = useMemo(() => getMaxValue(safeData), [safeData]);

  const segments = useMemo(
    () =>
      computeSegments({
        maxValue,
        preferredStep: yAxisInterval,
        minSegments: 4,
        maxSegments: 7,
        defaultSegments: 6,
      }),
    [maxValue, yAxisInterval],
  );

  const formatYLabel = useMemo(() => {
    if (formatAxisValue) return (v: string) => formatAxisValue(Number(v));
    return undefined;
  }, [formatAxisValue]);

  return (
    <Animated.View style={[styles.card, animatedStyle, containerStyle]}>
      {/* Header */}
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        {/* ✅ Controles dentro de la misma card */}
        {headerContent ? (
          <View style={styles.headerContent}>{headerContent}</View>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loadingText}>Cargando gráfico...</Text>
        </View>
      ) : computedIsEmpty ? (
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {/* Etiqueta eje Y lateral (visual) */}
            {yLabel ? (
              <View
                style={{
                  width: 35,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 8,
                }}
              >
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
                  {yLabel}
                </Text>
              </View>
            ) : null}

            {scrollable ? (
              <View style={{ flex: 1 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={{ width: contentWidth }}
                  // ✅ asegura que el contenido puede exceder el ancho
                  bounces={false}
                  nestedScrollEnabled
                  style={{ height }}  // ✅ Agrega esto para definir la altura del ScrollView
                >
                  {kind === "bar" ? (
                    <Pressable
                      onPressIn={(e) =>
                        handleBarTap(
                          e.nativeEvent.locationX,
                          e.nativeEvent.locationY,
                          contentWidth,
                        )
                      }
                    >
                      {(() => {
                        const hasCustomColors = Boolean(
                          safeData.datasets[0]?.colors &&
                          safeData.datasets[0].colors.length,
                        );
                        return (
                          <BarChart
                            data={safeData}
                            width={contentWidth}
                            height={height}
                            chartConfig={chartConfig}
                            style={styles.chart}
                            showValuesOnTopOfBars={showValuesOnTop}
                            withInnerLines={false}
                            withCustomBarColorFromData={hasCustomColors}
                            flatColor={hasCustomColors}
                            fromZero
                            segments={segments}
                            yAxisLabel={yLabel ?? ""}
                            yAxisSuffix=""
                          />
                        );
                      })()}
                    </Pressable>
                  ) : (
                    <LineChart
                      data={safeData}
                      width={contentWidth}
                      height={height}
                      chartConfig={chartConfig}
                      style={styles.chart}
                      bezier
                      onDataPointClick={onPointPress}
                      segments={segments}
                      formatYLabel={formatYLabel}
                      fromZero
                      withShadow={false}
                    />
                  )}
                </ScrollView>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                {kind === "bar" ? (
                  <Pressable
                    onPressIn={(e) =>
                      handleBarTap(
                        e.nativeEvent.locationX,
                        e.nativeEvent.locationY,
                        contentWidth,
                      )
                    }
                  >
                    {(() => {
                      const hasCustomColors = Boolean(
                        safeData.datasets[0]?.colors &&
                        safeData.datasets[0].colors.length,
                      );
                      return (
                        <BarChart
                          data={safeData}
                          width={contentWidth}
                          height={height}
                          chartConfig={chartConfig}
                          style={styles.chart}
                          showValuesOnTopOfBars={showValuesOnTop}
                          withInnerLines={false}
                          withCustomBarColorFromData={hasCustomColors}
                          flatColor={hasCustomColors}
                          fromZero
                          segments={segments}
                          yAxisLabel={yLabel ?? ""}
                          yAxisSuffix=""
                        />
                      );
                    })()}
                  </Pressable>
                ) : kind === "line" ? (
                  <LineChart
                    data={safeData}
                    width={contentWidth}
                    height={height}
                    chartConfig={chartConfig}
                    style={styles.chart}
                    bezier
                    onDataPointClick={onPointPress}
                    segments={segments}
                    formatYLabel={formatYLabel}
                    fromZero
                    withShadow={false} // ✅ evita el "relleno" azul
                  />
                ) : pieData.length > 0 ? (
                  <PieChart
                    data={pieData}
                    width={contentWidth}
                    height={height}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="15"
                    chartConfig={chartConfig}
                    style={styles.chart}
                  />
                ) : null}
              </View>
            )}
          </View>

          {xLabel ? (
            <View style={{ marginTop: 8, alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: "#666", fontWeight: "600" }}>
                {xLabel}
              </Text>
            </View>
          ) : null}
        </>
      )}

      <Modal transparent visible={!!detail} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Detalle</Text>
            <Text style={styles.modalSubtitle}>{detail?.label}</Text>
            <View style={styles.modalRow}>
              {detail?.rows.map((row) => (
                <View key={row.series} style={styles.modalValueRow}>
                  <Text style={styles.modalLabel}>{row.series}</Text>
                  <Text style={styles.modalValue}>{row.value}</Text>
                </View>
              ))}
            </View>
            <Pressable
              style={styles.modalButton}
              onPress={() => setDetail(null)}
            >
              <Text style={styles.modalButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    elevation: 3,
    overflow: "hidden", // ✅ clave: evita que el gráfico se salga del recuadro
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280",
  },
  headerContent: {
    marginTop: 12,
  },
  chart: {
    borderRadius: 12,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: "#6B7280",
  },
  emptyText: {
    textAlign: "center",
    color: "#6B7280",
    fontSize: 14,
    paddingVertical: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalSubtitle: {
    marginTop: 4,
    color: "#6B7280",
  },
  modalRow: {
    marginTop: 14,
  },
  modalValueRow: {
    marginBottom: 10,
  },
  modalLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  modalValue: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 4,
  },
  modalButton: {
    marginTop: 18,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonText: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "600",
  },
});
