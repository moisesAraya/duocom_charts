export const makeChartConfig = (
  rgb: string,
  formatYLabel?: (value: string) => string,
  options?: { dotRadius?: number; dotStrokeWidth?: number }
) => ({
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  // Stronger fill for area under line
  fillShadowGradientFrom: `rgba(${rgb}, 0.65)`,
  fillShadowGradientTo: `rgba(${rgb}, 0.18)`,
  fillShadowGradientOpacity: 1,
  decimalPlaces: 0,
  formatYLabel,
  color: (opacity = 1) => `rgba(${rgb}, ${Math.max(opacity, 0.85)})`,
  labelColor: (opacity = 1) => `rgba(17, 24, 39, ${opacity})`,
  strokeWidth: 3,
  propsForDots: {
    r: String(options?.dotRadius ?? 6),
    strokeWidth: String(options?.dotStrokeWidth ?? 2),
    stroke: `rgba(${rgb}, 1)`,
  },
  propsForLabels: { fontSize: 12 },
  propsForBackgroundLines: { stroke: '#E5E7EB' },
});
