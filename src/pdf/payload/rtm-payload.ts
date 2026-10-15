import type { RemittanceRecord } from '@/repositories/remittance.repository';
import type { MarginRemittanceRecord } from '@/repositories/margin-remittance.repository';
import { DomainError } from '@/domain/errors';
import {
  DocumentPayloadEnvelope,
  DecimalString,
  SCHEMA_VERSION,
  ISSUER,
  RTM_TEMPLATE_KEY,
  RTM_TEMPLATE_VERSION,
  MONEY_SCALE,
  UNIT_PRICE_SCALE,
  WEIGHT_SCALE,
  toDecimalString,
  isDecimalString,
  isDocumentEnvelope,
  isJsonObject,
} from './shared';

export type RtmPayloadItem = {
  quantity: number;
  product_code: string;
  product_name: string;
  unit_sale_price_ars: DecimalString;
  line_sale_total_ars: DecimalString;
  unit_cost_ars: DecimalString;
  line_cost_total_ars: DecimalString;
};

export type RtmPayloadData = {
  internal_use: true;
  rto_code: string;
  customer_name: string;
  weight_kg: DecimalString;
  items: RtmPayloadItem[];
  total_order_ars: DecimalString;
  products_cost_total_ars: DecimalString;
  transport_cost_ars: DecimalString;
  gain_ars: DecimalString;
};

export type RtmPayload = DocumentPayloadEnvelope<RtmPayloadData>;

export interface BuildRtmPayloadInput {
  marginRemittance: MarginRemittanceRecord;
  remittance: RemittanceRecord;
  generatedAt?: string;
}

/**
 * Construye el payload_snapshot del RTM a partir de los snapshots de costo ya
 * congelados en `margin_remittances`/`margin_remittance_items`, cruzados por
 * `product_id` con los snapshots de venta del RTO asociado en
 * `remittance_items` (docs/PDFS.md sección 8.5). El saldo anterior nunca
 * participa de la ganancia (no se incluye en este payload). Los valores
 * NUMERIC viajan como string decimal canónico (nunca number).
 * `business_date` es SIEMPRE la de la operación SALE_RTM del RTM (única
 * regla, tanto para la generación posterior a completar como para backfill).
 */
export function buildRtmPayload(input: BuildRtmPayloadInput): RtmPayload {
  const { marginRemittance, remittance } = input;
  const businessDate = marginRemittance.businessDate;

  if (marginRemittance.remittanceId !== remittance.id) {
    throw new DomainError(
      `El RTM ${marginRemittance.id} no corresponde al remito ${remittance.id} provisto para construir el payload.`
    );
  }

  const saleItemsByProductId = new Map(remittance.items.map((it) => [it.productId, it]));

  const items: RtmPayloadItem[] = marginRemittance.items.map((costItem) => {
    const saleItem = saleItemsByProductId.get(costItem.productId);
    if (!saleItem) {
      throw new DomainError(
        `Inconsistencia de datos: el producto ${costItem.productId} del RTM ${marginRemittance.code} no tiene línea de venta correspondiente en el RTO ${remittance.code}.`
      );
    }

    return {
      quantity: costItem.quantitySent,
      product_code: saleItem.productCodeSnapshot,
      product_name: saleItem.productNameSnapshot,
      unit_sale_price_ars: toDecimalString(saleItem.unitPriceArsSnapshot, UNIT_PRICE_SCALE, 'unit_sale_price_ars'),
      line_sale_total_ars: toDecimalString(saleItem.lineTotalArs, MONEY_SCALE, 'line_sale_total_ars'),
      unit_cost_ars: toDecimalString(costItem.unitCostTheoreticalSnapshotArs, MONEY_SCALE, 'unit_cost_ars'),
      line_cost_total_ars: toDecimalString(costItem.totalCostSnapshotArs, MONEY_SCALE, 'line_cost_total_ars'),
    };
  });

  const data: RtmPayloadData = {
    internal_use: true,
    rto_code: remittance.code,
    customer_name: remittance.customerDisplayName,
    weight_kg: toDecimalString(remittance.weightKgSnapshot, WEIGHT_SCALE, 'weight_kg'),
    items,
    total_order_ars: toDecimalString(remittance.totalOrderArs, MONEY_SCALE, 'total_order_ars'),
    products_cost_total_ars: toDecimalString(marginRemittance.productsCostTotalArs, MONEY_SCALE, 'products_cost_total_ars'),
    transport_cost_ars: toDecimalString(marginRemittance.transportCostArs, MONEY_SCALE, 'transport_cost_ars'),
    gain_ars: toDecimalString(marginRemittance.gainArs, MONEY_SCALE, 'gain_ars'),
  };

  return {
    schema_version: SCHEMA_VERSION,
    document_type: 'RTM',
    document_id: marginRemittance.id,
    document_code: marginRemittance.code,
    business_date: businessDate,
    generated_at: input.generatedAt || new Date().toISOString(),
    template_key: RTM_TEMPLATE_KEY,
    template_version: RTM_TEMPLATE_VERSION,
    issuer: ISSUER,
    data,
  };
}

function isRtmItem(value: unknown): value is RtmPayloadItem {
  return (
    isJsonObject(value) &&
    Number.isInteger(value.quantity) &&
    typeof value.product_code === 'string' &&
    typeof value.product_name === 'string' &&
    isDecimalString(value.unit_sale_price_ars) &&
    isDecimalString(value.line_sale_total_ars) &&
    isDecimalString(value.unit_cost_ars) &&
    isDecimalString(value.line_cost_total_ars)
  );
}

/**
 * Valida un `payload_snapshot` histórico antes de re-renderizarlo (reintento).
 * Nunca lo "repara": si no cumple el contrato, el reintento se rechaza.
 */
export function isRtmPayload(value: unknown): value is RtmPayload {
  if (!isDocumentEnvelope(value, 'RTM')) return false;
  const d = value.data;
  return (
    isJsonObject(d) &&
    d.internal_use === true &&
    typeof d.rto_code === 'string' &&
    typeof d.customer_name === 'string' &&
    isDecimalString(d.weight_kg) &&
    Array.isArray(d.items) &&
    d.items.every(isRtmItem) &&
    isDecimalString(d.total_order_ars) &&
    isDecimalString(d.products_cost_total_ars) &&
    isDecimalString(d.transport_cost_ars) &&
    isDecimalString(d.gain_ars)
  );
}
