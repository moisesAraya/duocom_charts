import React, { useMemo, useRef, useEffect, useState } from "react";
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
import { Text as SvgText } from "react-native-svg";
import { makeChartConfig } from "./chart-config";
import { useDashboardFilters } from "./filters-context";

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

  /** Contenido bajo el título y antes del gráfico (controles, filtros, chips, etc.) */
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;

  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;

  /** si true, el gráfico puede hacer scroll horizontal */
  scrollable?: boolean;

  /** ancho mínimo del gráfico (NO de la card) */
  minWidth?: number;

  showValuesOnTop?: boolean;

  data: {
    labels: string[];
    datasets: {
      data: number[];
      color?: (opacity: number) => string;
      colors?: ((opacity: number) => string)[];
      strokeWidth?: number;
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

  yAxisSuffix?: string;

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

  showSucursalPicker?: boolean;
  sucursales?: string[];
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
  footerContent,
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
  yAxisSuffix,
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
  showSucursalPicker = false,
  sucursales = [],
}: ChartCardProps) => {
  const anim = useRef(new Animated.Value(0)).current;
  const safeData = data || { labels: [], datasets: [] };

  const [detail, setDetail] = useState<{
    label: string;
    rows: { series: string; value: string }[];
  } | null>(null);

  const filtersContext = useDashboardFilters();
  const filters = filtersContext;
  const setFilters = filtersContext.setFilters ?? (() => {});
  const [showPicker, setShowPicker] = useState(false);

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
   * HIT TESTING BARRAS
   */
  const handleBarTap = (x: number, y: number, contentWidth: number) => {
    if (!safeData.labels.length) return;

    // The chart library leaves horizontal/vertical paddings in the plot area.
    // If we don't account for that, taps can map to the wrong bar.
    const plotPaddingX = Math.max(12, Math.min(32, contentWidth * 0.06));
    const plotLeft = plotPaddingX;
    const plotRight = contentWidth - plotPaddingX;
    const plotWidth = plotRight - plotLeft;
    if (plotWidth <= 0) return;

    if (x < plotLeft || x > plotRight) return;

    const segmentWidth = plotWidth / safeData.labels.length;
    if (!Number.isFinite(segmentWidth) || segmentWidth <= 0) return;

    const xInPlot = x - plotLeft;
    const index = Math.min(
      safeData.labels.length - 1,
      Math.max(0, Math.floor(xInPlot / segmentWidth)),
    );

    const maxValue = getMaxValue(safeData);
    if (maxValue <= 0) return;

    const datasetCount = Math.max(1, safeData.datasets.length);
    const barGroupWidth = segmentWidth * barTapPaddingRatio * 0.9;
    const barGroupLeft = plotLeft + index * segmentWidth + (segmentWidth - barGroupWidth) / 2;
    const barGroupRight = barGroupLeft + barGroupWidth;

    if (x < barGroupLeft || x > barGroupRight) return;

    const barSlotWidth = barGroupWidth / datasetCount;
    const rawDatasetIndex = Math.floor((x - barGroupLeft) / barSlotWidth);
    const datasetIndex = Math.min(datasetCount - 1, Math.max(0, rawDatasetIndex));

    const valueAtIndex = safeData.datasets[datasetIndex]?.data[index] ?? 0;
    if (valueAtIndex <= 0) return;

    const topPadding = 18;
    const bottomPadding = 34;
    const chartAreaHeight = height - topPadding - bottomPadding;
    if (chartAreaHeight <= 0) return;

    const barHeight = (valueAtIndex / maxValue) * chartAreaHeight;
    if (barHeight < barTapMinHeight) return;

    const barTop = topPadding + (chartAreaHeight - barHeight);
    const barBottom = topPadding + chartAreaHeight;

    const barCenter = barGroupLeft + datasetIndex * barSlotWidth + barSlotWidth / 2;
    const touchBarWidth = barSlotWidth * 0.78;
    const barLeft = barCenter - touchBarWidth / 2;
    const barRight = barCenter + touchBarWidth / 2;

    if (x < barLeft || x > barRight) return;
    if (y < barTop || y > barBottom + 2) return;

    const detailPayload = buildDetail(index, datasetIndex);
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
    if (triggerMode === "tap") setDetail(detailPayload);
  };

  const chartConfig = useMemo(() => {
    const baseConfig = makeChartConfig(
      colorRgb,
      formatAxisValue ? (v: string) => formatAxisValue(Number(v)) : undefined,
      { dotRadius, dotStrokeWidth },
    );

    return {
      ...baseConfig,
      strokeWidth: kind === "bar" ? 0 : baseConfig.strokeWidth,

      // ✅ FIX: quita el "anillo" azul de los dots removiendo los dots en line charts
      propsForDots: kind === "line" ? undefined : baseConfig.propsForDots,

      fillShadowGradientOpacity:
        kind === "line" ? 0 : baseConfig.fillShadowGradientOpacity,
    };
  }, [colorRgb, dotRadius, dotStrokeWidth, formatAxisValue, kind]);

  // ✅ ancho del gráfico (solo si necesitas)
  const chartWidth = minWidth && minWidth > width ? minWidth : width;

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
          .filter((item) => Number.isFinite(item.population) && item.population > 0)
      : [];

  const computedIsEmpty =
    isEmpty ||
    !safeData.datasets?.length ||
    !safeData.labels?.length ||
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

  // ✅ Fix CLIPPING labels eje X cuando line + scrollable
  const extraBottomForXLabels = scrollable && kind === "line" ? 22 : 0;
  const effectiveHeight = height + extraBottomForXLabels;

  return (
    <Animated.View style={[styles.card, animatedStyle, containerStyle]}>
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {headerContent ? <View style={styles.headerContent}>{headerContent}</View> : null}
        {showSucursalPicker ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <Text style={{ fontSize: 14, color: "#666", marginRight: 8 }}>Sucursal:</Text>
            <Pressable
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 4,
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: "#BFDBFE",
              }}
              onPress={() => setShowPicker(true)}
            >
              <Text>{filters.sucursal || "Todas"}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {footerContent ? <View style={{ marginTop: 10 }}>{footerContent}</View> : null}

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
            {/* Label Y lateral */}
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

            {/* ✅ SOLO EL GRÁFICO SCROLLEA */}
            {scrollable ? (
              <View style={{ flex: 1 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  contentContainerStyle={{ width: chartWidth }}
                  bounces={false}
                  nestedScrollEnabled
                  style={{ height: effectiveHeight }}
                >
                  {kind === "bar" ? (
                    <Pressable
                      onPress={(e) =>
                        handleBarTap(
                          e.nativeEvent.locationX,
                          e.nativeEvent.locationY,
                          chartWidth,
                        )
                      }
                    >
                      {(() => {
                        const hasCustomColors = Boolean(
                          safeData.datasets[0]?.colors?.length,
                        );
                        return (
                          <BarChart
                            data={safeData}
                            width={chartWidth}
                            height={height}
                            chartConfig={chartConfig}
                            style={styles.chart}
                            showValuesOnTopOfBars={showValuesOnTop}
                            withInnerLines
                            withCustomBarColorFromData={hasCustomColors}
                            flatColor={hasCustomColors}
                            fromZero
                            segments={segments}
                            yAxisLabel=""
                            yAxisSuffix={yAxisSuffix ?? ""}
                          />
                        );
                      })()}
                    </Pressable>
                  ) : kind === "line" ? (
                    <LineChart
                      data={safeData}
                      width={chartWidth}
                      height={effectiveHeight}
                      chartConfig={chartConfig}
                      style={styles.chart}
                      bezier
                      onDataPointClick={onPointPress}
                      segments={segments}
                      formatYLabel={formatYLabel}
                      fromZero
                      withShadow={false}
                    />
                  ) : pieData.length > 0 ? (
                    <PieChart
                      data={pieData}
                      width={chartWidth}
                      height={height}
                      accessor="population"
                      backgroundColor="transparent"
                      paddingLeft="15"
                      chartConfig={chartConfig}
                      style={styles.chart}
                    />
                  ) : null}
                </ScrollView>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                {kind === "bar" ? (
                  <Pressable
                    onPress={(e) =>
                      handleBarTap(
                        e.nativeEvent.locationX,
                        e.nativeEvent.locationY,
                        width,
                      )
                    }
                  >
                    {(() => {
                      const hasCustomColors = Boolean(
                        safeData.datasets[0]?.colors?.length,
                      );
                      return (
                        <BarChart
                          data={safeData}
                          width={width}
                          height={height}
                          chartConfig={chartConfig}
                          style={styles.chart}
                          showValuesOnTopOfBars={showValuesOnTop}
                          withInnerLines
                          withCustomBarColorFromData={hasCustomColors}
                          flatColor={hasCustomColors}
                          fromZero
                          segments={segments}
                          yAxisLabel=""
                          yAxisSuffix={yAxisSuffix ?? ""}
                        />
                      );
                    })()}
                  </Pressable>
                ) : kind === "line" ? (
                  <LineChart
                    data={safeData}
                    width={width}
                    height={height}
                    chartConfig={chartConfig}
                    style={styles.chart}
                    bezier
                    onDataPointClick={onPointPress}
                    segments={segments}
                    formatYLabel={formatYLabel}
                    fromZero
                    withShadow={false}
                    renderDotContent={
                      showValuesOnTop
                        ? ({ x, y, index, indexData }) => {
                            const v = Number(indexData);
                            if (!Number.isFinite(v) || v === 0) return null;
                            return (
                              <SvgText
                                key={`dot-${index}-${x}-${y}`}
                                x={x}
                                y={y - 8}
                                fontSize="10"
                                fill="#111"
                                textAnchor="middle"
                              >
                                {formatValue ? formatValue(v) : v.toFixed(0)}
                              </SvgText>
                            );
                          }
                        : undefined
                    }
                  />
                ) : pieData.length > 0 ? (
                  <PieChart
                    data={pieData}
                    width={width}
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

          {!hideHint && triggerMode === "tap" ? (
            <Text style={styles.hint}>Toca para ver detalle</Text>
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
            <Pressable style={styles.modalButton} onPress={() => setDetail(null)}>
              <Text style={styles.modalButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal transparent visible={showPicker} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowPicker(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Seleccionar Sucursal</Text>
            <ScrollView>
              <Pressable
                style={styles.modalValueRow}
                onPress={() => {
                  setFilters({ ...filters, sucursal: "" });
                  setShowPicker(false);
                }}
              >
                <Text style={styles.modalLabel}>Todas</Text>
              </Pressable>
              {sucursales.map((suc) => (
                <Pressable
                  key={suc}
                  style={styles.modalValueRow}
                  onPress={() => {
                    setFilters({ ...filters, sucursal: suc });
                    setShowPicker(false);
                  }}
                >
                  <Text style={styles.modalLabel}>{suc}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalButton} onPress={() => setShowPicker(false)}>
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
    overflow: "hidden",
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
  hint: {
    marginTop: 10,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
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
