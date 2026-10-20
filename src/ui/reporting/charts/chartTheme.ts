/**
 * Roles semánticos Dark/Light y paleta estadística aprobada para Reportes.
 */
export const chartTheme = {
  axis: 'var(--steffen-chart-axis)',
  grid: 'var(--steffen-chart-grid)',
  text: 'var(--steffen-text-primary)',
  tooltipBackground: 'var(--steffen-chart-tooltip)',
  tooltipBorder: 'var(--steffen-chart-tooltip-border)',
  cursor: 'var(--steffen-hover-neutral)',
  fontSize: 11,
} as const;

/** Colores por serie económica (confirmado R5.1). */
export const seriesColors = {
  billed: 'var(--steffen-info)',
  gain: 'var(--steffen-green)',
  expenses: 'var(--steffen-red)',
} as const;

/**
 * Top 4 + Otros: colores categóricos; no expresan un juicio de valor.
 */
export const shareSliceColors = ['var(--steffen-info)', 'var(--steffen-success)', 'var(--steffen-danger)', '#7C3AED'] as const;
export const shareOthersColor = '#6B7280';

/** Grupos de concentración: 1–5 y 6–10 diferenciados; Resto el más neutro. */
export const concentrationColors = {
  POS_1_5: 'var(--steffen-info)',
  POS_6_10: 'var(--steffen-success)',
  REST: shareOthersColor,
} as const;

/** Comparación interanual de concentración: año seleccionado vs año anterior. */
export const yearComparisonColors = {
  selected: 'var(--steffen-info)',
  previous: 'var(--steffen-silver)',
} as const;

/** Paleta disponible (tokens existentes); el orden no implica asignación. */
export const chartPalette = {
  blue: 'var(--steffen-blue)',
  blueSoft: 'var(--steffen-blue-hover)',
  green: 'var(--steffen-green)',
  red: 'var(--steffen-red)',
  silver: 'var(--steffen-silver)',
  muted: 'var(--steffen-text-muted)',
} as const;

/**
 * Valor para la GEOMETRÍA del gráfico (Recharts dibuja con números). Nunca se
 * muestra ni se usa para cálculos: tooltips y etiquetas leen el texto exacto
 * del DTO. `null` (mes futuro / sin dato) se conserva como hueco.
 */
export function plotValue(value: string | null): number | null {
  return value === null ? null : Number(value);
}
