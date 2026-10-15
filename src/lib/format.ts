import { Decimal } from '@/domain/decimal';

/**
 * Formato monetario canónico de presentación del ERP: separador de miles punto,
 * separador decimal coma, siempre 2 decimales (ROUND_HALF_UP).
 *
 * Es PURAMENTE de presentación. Nunca usar para lógica, cálculos ni persistencia:
 * el valor interno sigue siendo Decimal/NUMERIC sin cambios.
 */
export function formatArs(value: Decimal.Value | null | undefined): string {
  if (value === null || value === undefined || value === '') return '$ 0,00';

  let d: Decimal;
  try {
    d = value instanceof Decimal ? value : new Decimal(value);
  } catch {
    return '$ 0,00';
  }
  if (d.isNaN()) return '$ 0,00';

  const isNegative = d.isNegative();
  const absFixed = d.abs().toFixed(2);
  const [intPart, decPart] = absFixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-$ ' : '$ '}${formattedInt},${decPart}`;
}

/**
 * Formato de peso (kg) canónico de presentación: precisión interna de hasta 3
 * decimales, sin ceros finales innecesarios, coma como separador decimal.
 *
 * Es PURAMENTE de presentación (p.ej. para texto de solo lectura). Nunca redondea
 * ni altera el valor interno: solo recorta ceros finales de la representación.
 */
export function formatKg(value: Decimal.Value | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';

  let d: Decimal;
  try {
    d = value instanceof Decimal ? value : new Decimal(value);
  } catch {
    return '0';
  }
  if (d.isNaN()) return '0';

  const fixed = d.toFixed(3);
  const [intPart, decPart] = fixed.split('.');
  const trimmedDec = decPart.replace(/0+$/, '');
  return trimmedDec.length > 0 ? `${intPart},${trimmedDec}` : intPart;
}

/**
 * Valor de un peso (kg) listo para usarse como `value` de un <input type="number">
 * editable: hasta 3 decimales, sin ceros finales forzados, separador decimal PUNTO
 * (el requerido por el input nativo), preservando el parseo exacto al backend.
 * No usar formatKg() (coma) para esto: rompería el parseo nativo del input.
 */
export function formatKgInputValue(value: Decimal.Value | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';

  let d: Decimal;
  try {
    d = value instanceof Decimal ? value : new Decimal(value);
  } catch {
    return '';
  }
  if (d.isNaN()) return '';

  const fixed = d.toFixed(3);
  const [intPart, decPart] = fixed.split('.');
  const trimmedDec = decPart.replace(/0+$/, '');
  return trimmedDec.length > 0 ? `${intPart}.${trimmedDec}` : intPart;
}
