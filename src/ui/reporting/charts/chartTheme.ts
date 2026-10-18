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

/**
 * Porciones de participación (Top 4 + Otros): 4 tokens bien diferenciados
 * sobre fondo negro y "Otros" en el gris neutro del sistema. El rojo queda
 * reservado (gastos / alertas) y no se usa para productos.
 */
export const shareSliceColors = ['var(--steffen-gold)', 'var(--steffen-blue-hover)', 'var(--steffen-green)', 'var(--steffen-blue)'] as const;
export const shareOthersColor = 'var(--steffen-text-muted)';

/** Grupos de concentración: 1–5 y 6–10 diferenciados; Resto el más neutro. */
export const concentrationColors = {
  POS_1_5: 'var(--steffen-gold)',
  POS_6_10: 'var(--steffen-blue-hover)',
  REST: 'var(--steffen-text-muted)',
} as const;

/** Comparación interanual de concentración: año seleccionado vs año anterior. */
export const yearComparisonColors = {
  selected: 'var(--steffen-gold)',
  previous: 'var(--steffen-silver)',
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
