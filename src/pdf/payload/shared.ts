import type { DocumentType } from '@/database/domain-types';
import { Decimal } from '@/domain/decimal';
import { DomainError } from '@/domain/errors';

/**
 * Valor NUMERIC serializado como string decimal canónico (punto decimal, sin
 * separador de miles, con exactamente la escala de su columna de origen).
 * Nunca se usa JS number para dinero, costos, pesos ni porcentajes en el
 * payload: un `Decimal.toNumber()` degradaría a IEEE 754 (docs/PDFS.md §3).
 */
export type DecimalString = string;

/** Escalas de las columnas NUMERIC de origen (20261002000001_initial_schema). */
export const MONEY_SCALE = 6; // NUMERIC(20,6)
export const UNIT_PRICE_SCALE = 0; // remittance_items.unit_price_ars_snapshot NUMERIC(20,0)
export const WEIGHT_SCALE = 3; // NUMERIC(12,3)
export const PERCENT_SCALE = 4; // NUMERIC(7,4)

/**
 * Serializa un snapshot NUMERIC a su string decimal canónico. No redondea ni
 * recalcula: si el valor tuviera más decimales que la escala de su columna
 * (imposible para un valor leído de la base) se rechaza en vez de alterarlo.
 */
export function toDecimalString(value: Decimal.Value, scale: number, field: string): DecimalString {
  const d = new Decimal(value);
  if (!d.isFinite()) {
    throw new DomainError(`Valor decimal inválido en el payload (${field}).`);
  }
  if (d.decimalPlaces() > scale) {
    throw new DomainError(`El valor ${d.toString()} de ${field} excede la escala ${scale} de su columna.`);
  }
  return d.toFixed(scale);
}

const DECIMAL_STRING_RE = /^-?\d+(\.\d+)?$/;

export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === 'string' && DECIMAL_STRING_RE.test(value);
}

export type JsonObject = { [key: string]: unknown };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Envoltorio común de payload (docs/PDFS.md sección 3). `document_id`/
 * `document_code` identifican la entidad de origen (el RTO o el RTM), nunca
 * la fila de `generated_documents`.
 */
export type DocumentPayloadEnvelope<T> = {
  schema_version: string;
  document_type: DocumentType;
  document_id: string;
  document_code: string;
  business_date: string;
  generated_at: string;
  template_key: string;
  template_version: string;
  issuer: {
    name: string;
    logo_ref: string;
  };
  data: T;
};

/** Valida la cabecera común de un payload leído de `payload_snapshot`. */
export function isDocumentEnvelope(value: unknown, documentType: DocumentType): value is DocumentPayloadEnvelope<unknown> {
  if (!isJsonObject(value)) return false;
  return (
    value.schema_version === SCHEMA_VERSION &&
    value.document_type === documentType &&
    typeof value.document_id === 'string' &&
    typeof value.document_code === 'string' &&
    typeof value.business_date === 'string' &&
    typeof value.generated_at === 'string' &&
    typeof value.template_key === 'string' &&
    typeof value.template_version === 'string' &&
    isJsonObject(value.issuer) &&
    typeof value.issuer.name === 'string' &&
    typeof value.issuer.logo_ref === 'string' &&
    isJsonObject(value.data)
  );
}

export const SCHEMA_VERSION = '1.0';

export const ISSUER = {
  name: 'Steffen Cosmética Capilar',
  logo_ref: 'steffen-logo',
};

export const RTO_TEMPLATE_KEY = 'rto-default';
export const RTO_TEMPLATE_VERSION = '1.0';
export const RTM_TEMPLATE_KEY = 'rtm-default';
export const RTM_TEMPLATE_VERSION = '1.0';
