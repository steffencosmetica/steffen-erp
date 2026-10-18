/**
 * Tokens visuales de los gráficos de Reportes, tomados EXCLUSIVAMENTE de las
 * variables del sistema (globals.css, DESIGN.md). Sin colores nuevos.
 */
export const chartTheme = {
  axis: 'var(--steffen-text-muted)',
  grid: 'var(--steffen-gray)',
  text: 'var(--steffen-surface)',
  tooltipBackground: 'var(--steffen-bg)',
  tooltipBorder: 'var(--steffen-gray)',
  cursor: 'var(--steffen-gray-tint)',
  fontSize: 11,
} as const;

/** Colores por serie económica (confirmado R5.1). */
export const seriesColors = {
  billed: 'var(--steffen-gold)',
  gain: 'var(--steffen-green)',
  expenses: 'var(--steffen-red)',
} as const;

/** Paleta disponible (tokens existentes); el orden no implica asignación. */
export const chartPalette = {
  gold: 'var(--steffen-gold)',
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
