import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  Modal,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { makeChartConfig } from './chart-config';

const PIE_COLORS = [
  'rgba(59, 130, 246, 1)',
  'rgba(16, 185, 129, 1)',
  'rgba(245, 158, 11, 1)',
  'rgba(139, 92, 246, 1)',
  'rgba(236, 72, 153, 1)',
  'rgba(14, 116, 144, 1)',
  'rgba(234, 88, 12, 1)',
  'rgba(248, 113, 113, 1)',
  'rgba(34, 197, 94, 1)',
  'rgba(251, 146, 60, 1)',
];

type ChartKind = 'line' | 'bar' | 'pie';

interface ChartCardProps {
  title: string;
  subtitle?: string;
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
  xLabelAlign?: 'left' | 'center' | 'right';
  labelCaption?: string;
  valueCaption?: string;
  formatValue?: (value: number) => string;
  formatDetailValue?: (value: number) => string;
  formatAxisValue?: (value: number) => string;
  detailTrigger?: 'tap' | 'button';
  onBarPress?: (index: number) => void;
  dotRadius?: number;
  dotStrokeWidth?: number;
  hideHint?: boolean;
  barTapPaddingRatio?: number; // ⬅️ se mantiene por compatibilidad
  barTapMinHeight?: number;    // ⬅️ se mantiene por compatibilidad
  containerStyle?: ViewStyle;
  enterDelay?: number;
}

export const ChartCard = ({
  title,
  subtitle,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'Sin datos para mostrar.',
  scrollable = false,
  minWidth,
  showValuesOnTop = false,
  data,
  detailLabels,
  kind = 'line',
  colorRgb,
  width,
  height = 260,
  xLabel,
  yLabel,
  xLabelAlign = 'left',
  labelCaption,
  valueCaption,
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
}: ChartCardProps) => {
  const anim = useRef(new Animated.Value(0)).current;

  const safeData = data || { labels: [], datasets: [] };

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    value: string;
  } | null>(null);

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
    [anim]
  );

  const getValueLabel = (value: number): string => {
    if (formatDetailValue) return formatDetailValue(value);
    if (formatValue) return formatValue(value);
    return value.toString();
  };

  const getSeriesLabel = (idx: number) =>
    safeData.legend?.[idx] ?? (safeData.datasets.length > 1 ? `Serie ${idx + 1}` : '');

  const buildRows = (index: number, datasetIndex?: number) => {
    if (typeof datasetIndex === 'number') {
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
    const label = detailLabels?.[index] ?? safeData.labels[index] ?? '';
    return { label, rows: buildRows(index, datasetIndex) };
  };

  /**
   * 🎯 HIT TESTING REAL DE BARRA (AUTO-ADAPTATIVO)
   */
  const handleBarTap = (x: number, y: number, contentWidth: number) => {
    if (!safeData.labels.length) return;

    const segmentWidth = contentWidth / safeData.labels.length;
    if (!Number.isFinite(segmentWidth) || segmentWidth <= 0) return;

    const index = Math.min(
      safeData.labels.length - 1,
      Math.max(0, Math.floor(x / segmentWidth))
    );

    const maxValue = Math.max(...safeData.datasets.flatMap(ds => ds.data), 0);
    if (maxValue <= 0) return;

    const datasetCount = Math.max(1, safeData.datasets.length);
    const barWidthRatio = barTapPaddingRatio;
    const barGroupWidth = segmentWidth * barWidthRatio;
    const barGroupLeft = index * segmentWidth + (segmentWidth - barGroupWidth) / 2;
    const barGroupRight = barGroupLeft + barGroupWidth;

    if (x < barGroupLeft || x > barGroupRight) return;

    const barSlotWidth = barGroupWidth / datasetCount;
    const rawDatasetIndex = Math.floor((x - barGroupLeft) / barSlotWidth);
    const datasetIndex = Math.min(datasetCount - 1, Math.max(0, rawDatasetIndex));
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

    // ?? HITBOX EXACTO
    if (x < barLeft || x > barRight) return;
    if (y < barTop || y > barBottom) return;

    const detailPayload = buildDetail(index, datasetIndex);
    if (!detailPayload) return;

    setSelection(detailPayload);
    setDetail(detailPayload);
    onBarPress?.(index);
  };

  const onPointPress = (payload: {
    value: number;
    index: number;
    x: number;
    y: number;
    dataset?: { data?: number[] };
  }) => {
    const datasetIndex = payload.dataset
      ? safeData.datasets.findIndex(ds => ds === payload.dataset)
      : undefined;

    const detailPayload = buildDetail(payload.index, datasetIndex);
    if (!detailPayload) return;

    setTooltip({
      x: payload.x,
      y: Math.max(payload.y - 36, 6),
      label: detailPayload.label,
      value: detailPayload.rows[0]?.value ?? '',
    });

    setSelection(detailPayload);
    if (triggerMode === 'tap') {
      setDetail(detailPayload);
    }
  };

  const chartConfig = useMemo(() => {
    const baseConfig = makeChartConfig(
      colorRgb,
      formatAxisValue ? (v: string) => formatAxisValue(Number(v)) : undefined,
      { dotRadius, dotStrokeWidth }
    );
    if (kind === 'bar') {
      return {
        ...baseConfig,
        strokeWidth: 0,
        propsForBackgroundLines: { stroke: 'transparent' },
      };
    }
    return baseConfig;
  }, [colorRgb, dotRadius, dotStrokeWidth, formatAxisValue, kind]);

  const contentWidth = minWidth && minWidth > width ? minWidth : width;
  const triggerMode = detailTrigger ?? (kind === 'line' ? 'button' : 'tap');
  const axisFooterStyle = useMemo(
    () => [
      styles.axisFooter,
      xLabelAlign === 'center' && styles.axisFooterCenter,
      xLabelAlign === 'right' && styles.axisFooterRight,
    ],
    [xLabelAlign]
  );

  const pieData = kind === 'pie'
    ? safeData.labels
        .map((label, index) => {
          const value = safeData.datasets.reduce(
            (acc, dataset) => acc + Number(dataset.data[index] ?? 0),
            0
          );
          const color = PIE_COLORS[index % PIE_COLORS.length];
          return {
            name: label,
            population: value,
            color,
            legendFontColor: '#6B7280',
            legendFontSize: 12,
          };
        })
        .filter(item => Number.isFinite(item.population) && item.population > 0)
    : [];

  const computedIsEmpty =
    isEmpty ||
    !safeData ||
    !safeData.datasets ||
    safeData.datasets.length === 0 ||
    !safeData.labels ||
    safeData.labels.length === 0 ||
    (kind === 'pie' && pieData.length === 0);

  return (
    <Animated.View style={[styles.card, animatedStyle, containerStyle]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loadingText}>Cargando gráfico...</Text>
        </View>
      ) : computedIsEmpty ? (
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      ) : (
        <>
          <View style={styles.chartWrap}>
            {yLabel ? <Text style={styles.axisLabel}>{yLabel}</Text> : null}
            {scrollable ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {kind === 'bar' ? (
                  <Pressable
                    onPressIn={e =>
                      handleBarTap(
                        e.nativeEvent.locationX,
                        e.nativeEvent.locationY,
                        contentWidth
                      )
                    }>
                    {(() => {
                      const hasCustomColors = Boolean(
                        safeData.datasets[0]?.colors && safeData.datasets[0].colors.length
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
                          yAxisLabel={yLabel || ''}
                          yAxisSuffix={''}
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
                  />
                )}
              </ScrollView>
            ) : kind === 'bar' ? (
              <Pressable
                onPressIn={e =>
                  handleBarTap(
                    e.nativeEvent.locationX,
                    e.nativeEvent.locationY,
                    contentWidth
                  )
                }>
                {(() => {
                  const hasCustomColors = Boolean(
                    safeData.datasets[0]?.colors && safeData.datasets[0].colors.length
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
                      yAxisLabel={yLabel || ''}
                      yAxisSuffix={''}
                    />
                  );
                })()}
              </Pressable>
            ) : kind === 'line' ? (
              <LineChart
                data={safeData}
                width={contentWidth}
                height={height}
                chartConfig={chartConfig}
                style={styles.chart}
                bezier
                onDataPointClick={onPointPress}
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
          {xLabel ? <Text style={axisFooterStyle}>{xLabel}</Text> : null}

          {triggerMode === 'button' ? (
            selection ? (
              <Pressable style={styles.detailButton} onPress={() => setDetail(selection)}>
                <Text style={styles.detailButtonText}>
                  Detalle: {selection.label} · {selection.rows[0]?.value ?? ''}
                </Text>
              </Pressable>
            ) : hideHint ? null : (
              <Text style={styles.hint}>Toca un punto para seleccionar detalle.</Text>
            )
          ) : hideHint ? null : (
            <Text style={styles.hint}>
              {kind === 'bar'
                ? 'Toca una barra para ver detalle.'
                : 'Toca un punto para ver detalle.'}
            </Text>
          )}
        </>
      )}

      <Modal transparent visible={!!detail} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Detalle</Text>
            <Text style={styles.modalSubtitle}>{detail?.label}</Text>
            <View style={styles.modalRow}>
              {detail?.rows.map(row => (
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6B7280',
  },
  chartWrap: {
    marginTop: 12,
  },
  chart: {
    borderRadius: 12,
  },
  axisLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  axisFooter: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
  },
  axisFooterCenter: {
    textAlign: 'center',
  },
  axisFooterRight: {
    alignSelf: 'flex-end',
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: '#9CA3AF',
  },
  detailButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  detailButtonText: {
    fontSize: 12,
    color: '#F9FAFB',
    fontWeight: '600',
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
    paddingVertical: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    marginTop: 4,
    color: '#6B7280',
  },
  modalRow: {
    marginTop: 14,
  },
  modalValueRow: {
    marginBottom: 10,
  },
  modalLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalValue: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  modalButton: {
    marginTop: 18,
    backgroundColor: '#111827',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '600',
  },
});
