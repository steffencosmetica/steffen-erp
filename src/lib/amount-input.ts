const DECIMAL_RE = /^\d+(\.\d+)?$/;
const THOUSANDS_ONLY_RE = /^\d{1,3}(\.\d{3})+$/;

/**
 * Normaliza un importe tipeado por el usuario a string decimal exacto (nunca Number).
 *
 * - Con coma: formato es-AR → `.` separa miles y `,` es el decimal (`1.234,56` → `1234.56`).
 * - Sin coma y con puntos de miles exactos (`1.250`, `12.000.000`): miles es-AR → entero.
 * - Sin coma en otro caso: `.` es el decimal (`100.50`).
 *
 * Devuelve `null` si el valor es inválido, negativo o cero.
 */
export function normalizePositiveAmountInput(input: string): string | null {
  const raw = input.trim().replace(/\s/g, '');
  if (!raw) return null;

  const normalized =
    raw.includes(',') || THOUSANDS_ONLY_RE.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!DECIMAL_RE.test(normalized)) return null;
  if (!/[1-9]/.test(normalized)) return null;

  return normalized.replace(/^0+(?=\d)/, '');
}
