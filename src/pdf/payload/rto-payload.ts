import type { RemittanceRecord } from '@/repositories/remittance.repository';
import { DomainError } from '@/domain/errors';
import {
  DocumentPayloadEnvelope,
  DecimalString,
  SCHEMA_VERSION,
  ISSUER,
  RTO_TEMPLATE_KEY,
  RTO_TEMPLATE_VERSION,
  MONEY_SCALE,
  UNIT_PRICE_SCALE,
  WEIGHT_SCALE,
  PERCENT_SCALE,
  toDecimalString,
  isDecimalString,
  isDocumentEnvelope,
  isJsonObject,
} from './shared';

export type RtoPayloadItem = {
  quantity: number;
  product_code: string;
  product_name: string;
  presentation: string;
  unit_price_ars: DecimalString;
  line_total_ars: DecimalString;
};

export type RtoPayloadDiscount = {
  position: number;
  percent: DecimalString;
  amount_ars: DecimalString;
};

export type RtoPayloadData = {
  customer_source: string;
  customer_code: string | null;
  customer_name: string;
  address: string | null;
  locality: string | null;
  province: string | null;
  phone: string | null;
  transport_name: string | null;
  transport_address: string | null;
  package_count: number | null;
  weight_kg: DecimalString;
  items: RtoPayloadItem[];
  subtotal_ars: DecimalString;
  discounts: RtoPayloadDiscount[];
  total_order_ars: DecimalString;
  prior_balance_ars: DecimalString;
  total_to_collect_ars: DecimalString;
};

export type RtoPayload = DocumentPayloadEnvelope<RtoPayloadData>;

export interface BuildRtoPayloadInput {
  remittance: RemittanceRecord;
  customerCode: string | null;
  generatedAt?: string;
}

/**
 * Construye el payload_snapshot del RTO exclusivamente a partir de los
 * snapshots ya congelados en `remittances`/`remittance_items`/
 * `remittance_discount_steps` (docs/PDFS.md sección 7.5). No recalcula
 * nada: `quantity` es el AG confirmado (quantity_sent), nunca requested_quantity.
 * Los valores NUMERIC viajan como string decimal canónico (nunca number).
 * `business_date` es SIEMPRE la de la operación SALE_RTO del remito (única
 * regla, tanto para la generación posterior a confirmar como para backfill).
 */
export function buildRtoPayload(input: BuildRtoPayloadInput): RtoPayload {
  const { remittance, customerCode } = input;
  const businessDate = remittance.businessDate;

  if (!remittance.code || remittance.items.length === 0) {
    throw new DomainError(`Remito ${remittance.id} inválido para generar payload RTO.`);
  }

  const items: RtoPayloadItem[] = remittance.items.map((it) => ({
    quantity: it.quantitySent,
    product_code: it.productCodeSnapshot,
    product_name: it.productNameSnapshot,
    presentation: it.presentationSnapshot,
    unit_price_ars: toDecimalString(it.unitPriceArsSnapshot, UNIT_PRICE_SCALE, 'unit_price_ars'),
    line_total_ars: toDecimalString(it.lineTotalArs, MONEY_SCALE, 'line_total_ars'),
  }));

  const discounts: RtoPayloadDiscount[] = remittance.discountSteps.map((ds) => ({
    position: ds.position,
    percent: toDecimalString(ds.percent, PERCENT_SCALE, 'discount.percent'),
    amount_ars: toDecimalString(ds.amountArsSnapshot, MONEY_SCALE, 'discount.amount_ars'),
  }));

  const data: RtoPayloadData = {
    customer_source: remittance.customerSource,
    customer_code: customerCode,
    customer_name: remittance.customerDisplayName,
    address: remittance.addressSnapshot,
    locality: remittance.localitySnapshot,
    province: remittance.provinceSnapshot,
    phone: remittance.phoneSnapshot,
    transport_name: remittance.transportNameSnapshot,
    transport_address: remittance.transportAddressSnapshot,
    package_count: remittance.packageCountSnapshot,
    weight_kg: toDecimalString(remittance.weightKgSnapshot, WEIGHT_SCALE, 'weight_kg'),
    items,
    subtotal_ars: toDecimalString(remittance.subtotalArs, MONEY_SCALE, 'subtotal_ars'),
    discounts,
    total_order_ars: toDecimalString(remittance.totalOrderArs, MONEY_SCALE, 'total_order_ars'),
    prior_balance_ars: toDecimalString(remittance.priorBalanceSnapshotArs, MONEY_SCALE, 'prior_balance_ars'),
    total_to_collect_ars: toDecimalString(remittance.totalToCollectArs, MONEY_SCALE, 'total_to_collect_ars'),
  };

  return {
    schema_version: SCHEMA_VERSION,
    document_type: 'RTO',
    document_id: remittance.id,
    document_code: remittance.code,
    business_date: businessDate,
    generated_at: input.generatedAt || new Date().toISOString(),
    template_key: RTO_TEMPLATE_KEY,
    template_version: RTO_TEMPLATE_VERSION,
    issuer: ISSUER,
    data,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRtoItem(value: unknown): value is RtoPayloadItem {
  return (
    isJsonObject(value) &&
    Number.isInteger(value.quantity) &&
    typeof value.product_code === 'string' &&
    typeof value.product_name === 'string' &&
    typeof value.presentation === 'string' &&
    isDecimalString(value.unit_price_ars) &&
    isDecimalString(value.line_total_ars)
  );
}

function isRtoDiscount(value: unknown): value is RtoPayloadDiscount {
  return (
    isJsonObject(value) &&
    Number.isInteger(value.position) &&
    isDecimalString(value.percent) &&
    isDecimalString(value.amount_ars)
  );
}

/**
 * Valida un `payload_snapshot` histórico antes de re-renderizarlo (reintento).
 * Nunca lo "repara": si no cumple el contrato, el reintento se rechaza.
 */
export function isRtoPayload(value: unknown): value is RtoPayload {
  if (!isDocumentEnvelope(value, 'RTO')) return false;
  const d = value.data;
  return (
    isJsonObject(d) &&
    typeof d.customer_source === 'string' &&
    isNullableString(d.customer_code) &&
    typeof d.customer_name === 'string' &&
    isNullableString(d.address) &&
    isNullableString(d.locality) &&
    isNullableString(d.province) &&
    isNullableString(d.phone) &&
    isNullableString(d.transport_name) &&
    isNullableString(d.transport_address) &&
    (d.package_count === null || Number.isInteger(d.package_count)) &&
    isDecimalString(d.weight_kg) &&
    Array.isArray(d.items) &&
    d.items.every(isRtoItem) &&
    isDecimalString(d.subtotal_ars) &&
    Array.isArray(d.discounts) &&
    d.discounts.every(isRtoDiscount) &&
    isDecimalString(d.total_order_ars) &&
    isDecimalString(d.prior_balance_ars) &&
    isDecimalString(d.total_to_collect_ars)
  );
}
