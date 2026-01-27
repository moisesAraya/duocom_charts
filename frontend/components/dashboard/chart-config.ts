export const makeChartConfig = (
  rgb: string,
  formatYLabel?: (value: string) => string,
  options?: { dotRadius?: number; dotStrokeWidth?: number }
) => ({
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  fillShadowGradientFrom: `rgba(${rgb}, 0.35)`,
  fillShadowGradientTo: `rgba(${rgb}, 0.02)`,
  fillShadowGradientOpacity: 1,
  decimalPlaces: 0,
  formatYLabel,
  color: (opacity = 1) => `rgba(${rgb}, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(17, 24, 39, ${opacity})`,
  strokeWidth: 3,
  propsForDots: {
    r: String(options?.dotRadius ?? 6),
    strokeWidth: String(options?.dotStrokeWidth ?? 2),
    stroke: `rgba(${rgb}, 1)`,
  },
  propsForLabels: { fontSize: 11 },
  propsForBackgroundLines: { stroke: '#E5E7EB' },
});
