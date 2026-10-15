import { Decimal } from '@/domain/decimal';
import { DomainError } from '@/domain/errors';

const NUMERIC_TEXT_RE = /^-?\d+(\.\d+)?$/;

/**
 * Adapter exacto Supabase -> dominio para columnas NUMERIC. PostgREST serializa
 * NUMERIC como número JSON (IEEE 754) salvo que la consulta lo pida como texto
 * (`columna::text`). Este helper exige ese texto: rechaza cualquier `number`
 * (que ya habría perdido precisión) en vez de convertirlo.
 */
export function readNumericText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !NUMERIC_TEXT_RE.test(value)) {
    throw new DomainError(
      `${field}: se esperaba NUMERIC como texto exacto (columna::text) y se recibió ${typeof value === 'string' ? `"${value}"` : typeof value}.`
    );
  }
  return value;
}

export function readExactDecimal(value: unknown, field: string): Decimal {
  return new Decimal(readNumericText(value, field));
}
