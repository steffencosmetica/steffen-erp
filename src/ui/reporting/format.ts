import { Decimal } from '@/domain/decimal';
import { formatArs } from '@/lib/format';

/**
 * Formato de PRESENTACIÓN de Reportes (docs/REPORTES.md §13, §16). Los DTOs
 * traen texto decimal exacto; aquí solo se representa: nunca se calcula ni se
 * devuelve un valor para lógica. `null` → "—" (dato no calculable / sin datos).
 *
 * Decimales visibles (confirmado R5.1): porcentajes y frecuencia con máximo 1
 * decimal y sin cero decimal innecesario ("43 %", "43,2 %", "24 días").
 */

export const EMPTY_VALUE = '—';
const PCT_DECIMALS = 1;
const DAYS_DECIMALS = 1;

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "1.234,5" con a lo sumo `decimals` decimales (sin ceros finales). ROUND_HALF_UP. */
function formatDecimal(value: string, decimals: number, trimZeros: boolean): string {
  const d = new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const fixed = d.abs().toFixed(decimals);
  const [intPart, rawDec = ''] = fixed.split('.');
  const dec = trimZeros ? rawDec.replace(/0+$/, '') : rawDec;
  const sign = d.isNegative() && !d.isZero() ? '-' : '';
  return `${sign}${groupThousands(intPart)}${dec ? `,${dec}` : ''}`;
}

/** Importe ARS con el formato canónico del ERP; null → "—". */
export function formatReportingArs(value: string | null): string {
  return value === null ? EMPTY_VALUE : formatArs(value);
}

/**
 * Etiqueta COMPACTA de eje para ARS ("$ 500 mil", "$ 2,5 M"). Solo para ticks
 * de gráficos (recibe el número de geometría); tooltips y KPIs muestran
 * siempre el importe exacto con formatReportingArs. Sin notación científica.
 */
export function formatReportingArsTick(value: number): string {
  if (!Number.isFinite(value)) return '';
  const d = new Decimal(value);
  const abs = d.abs();
  const sign = d.isNegative() && !d.isZero() ? '-' : '';
  if (abs.greaterThanOrEqualTo(1_000_000)) return `${sign}$ ${formatDecimal(abs.div(1_000_000).toString(), 1, true)} M`;
  if (abs.greaterThanOrEqualTo(1_000)) return `${sign}$ ${formatDecimal(abs.div(1_000).toString(), 1, true)} mil`;
  return `${sign}$ ${formatDecimal(abs.toString(), 0, true)}`;
}

/** Conteo entero con separador de miles. */
export function formatReportingCount(value: number): string {
  return groupThousands(String(value));
}

/** Unidades vendidas "1.234 u". */
export function formatReportingUnits(value: number): string {
  return `${formatReportingCount(value)} u`;
}

/** Porcentaje "43 %" / "43,2 %"; null → "—". */
export function formatReportingPct(value: string | null): string {
  return value === null ? EMPTY_VALUE : `${formatDecimal(value, PCT_DECIMALS, true)} %`;
}

/** Días "24 días" / "29,5 días" (valor simple, sin estados interpretativos); null → "—". */
export function formatReportingDays(value: string | null): string {
  if (value === null) return EMPTY_VALUE;
  const text = formatDecimal(value, DAYS_DECIMALS, true);
  return `${text} ${text === '1' ? 'día' : 'días'}`;
}

/** Fecha comercial 'YYYY-MM-DD' → 'DD/MM/YYYY' (sin zona horaria). */
export function formatReportingDate(value: string | null): string {
  if (value === null) return EMPTY_VALUE;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

export const MONTH_LABELS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;
