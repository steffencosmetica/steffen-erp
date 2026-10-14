import type {
  RemittanceRecord,
  RemittanceItemRecord,
  RemittanceDiscountStepRecord,
  ConfirmedRemittanceResult,
} from '@/repositories/remittance.repository';
import type { RtoPreviewResult, RtoPreviewLine, RtoDiscountStepPreview } from '@/services/remittance.service';

export interface RemittanceItemDTO {
  id: string;
  remittanceId: string;
  productId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  presentationSnapshot: string;
  weightKgSnapshot: number;
  quantitySent: number;
  unitPriceArsSnapshot: number;
  lineTotalArs: number;
}

export interface RemittanceDiscountStepDTO {
  id: string;
  remittanceId: string;
  position: number;
  percent: number;
  amountArsSnapshot: number;
}

export interface RemittanceDetailDTO {
  id: string;
  code: string;
  operationId: string;
  orderId: string;
  status: 'RTM_PENDING' | 'COMPLETED';
  customerSource: string;
  customerId: string | null;
  customerDisplayName: string;
  recipientNameSnapshot: string | null;
  addressSnapshot: string | null;
  localitySnapshot: string | null;
  provinceSnapshot: string | null;
  phoneSnapshot: string | null;
  transportNameSnapshot: string | null;
  transportAddressSnapshot: string | null;
  packageCountSnapshot: number | null;
  weightKgSnapshot: number;
  subtotalArs: number;
  totalOrderArs: number;
  priorBalanceSnapshotArs: number;
  totalToCollectArs: number;
  createdAt: string;
  items: RemittanceItemDTO[];
  discountSteps: RemittanceDiscountStepDTO[];
}

export interface PendingRtmBannerDTO {
  id: string;
  code: string;
  orderId: string;
  customerDisplayName: string;
  totalOrderArs: number;
  totalToCollectArs: number;
  createdAt: string;
}

export interface ConfirmedRemittanceDTO {
  remittanceId: string;
  code: string;
  operationId: string;
  orderId: string;
  status: 'RTM_PENDING';
  customerSource: string;
  recipientName: string;
  subtotalArs: number;
  totalOrderArs: number;
  priorBalanceSnapshotArs: number;
  totalToCollectArs: number;
  weightKgSnapshot: number;
  movCode: string;
  businessDate: string;
}

export interface RtoPreviewLineDTO {
  productId: string;
  productCode: string;
  productName: string;
  presentation: string;
  weightKg: number;
  requestedQuantity: number;
  agQuantity: number;
  unitPriceArs: number;
  lineTotalArs: number;
  availableStock: number;
  hasSufficientStock: boolean;
}

export interface RtoDiscountStepPreviewDTO {
  position: number;
  percent: number;
  amountArs: number;
}

export interface RtoPreviewDTO {
  orderId: string;
  orderCode: string;
  customerSource: string;
  customerDisplayName: string;
  hasPendingRtmGlobal: boolean;
  pendingRtmCode: string | null;
  isValidToConfirm: boolean;
  validationErrors: string[];
  lines: RtoPreviewLineDTO[];
  subtotalArs: number;
  discountSteps: RtoDiscountStepPreviewDTO[];
  totalOrderArs: number;
  priorBalanceArs: number;
  totalToCollectArs: number;
  totalWeightKg: number;
  packageCount: number | null;
}

export function serializeRemittance(record: RemittanceRecord): RemittanceDetailDTO {
  return {
    id: record.id,
    code: record.code,
    operationId: record.operationId,
    orderId: record.orderId,
    status: record.status,
    customerSource: record.customerSource,
    customerId: record.customerId,
    customerDisplayName: record.customerDisplayName,
    recipientNameSnapshot: record.recipientNameSnapshot,
    addressSnapshot: record.addressSnapshot,
    localitySnapshot: record.localitySnapshot,
    provinceSnapshot: record.provinceSnapshot,
    phoneSnapshot: record.phoneSnapshot,
    transportNameSnapshot: record.transportNameSnapshot,
    transportAddressSnapshot: record.transportAddressSnapshot,
    packageCountSnapshot: record.packageCountSnapshot,
    weightKgSnapshot: record.weightKgSnapshot.toNumber(),
    subtotalArs: record.subtotalArs.toNumber(),
    totalOrderArs: record.totalOrderArs.toNumber(),
    priorBalanceSnapshotArs: record.priorBalanceSnapshotArs.toNumber(),
    totalToCollectArs: record.totalToCollectArs.toNumber(),
    createdAt: record.createdAt,
    items: record.items.map((it) => ({
      id: it.id,
      remittanceId: it.remittanceId,
      productId: it.productId,
      productCodeSnapshot: it.productCodeSnapshot,
      productNameSnapshot: it.productNameSnapshot,
      presentationSnapshot: it.presentationSnapshot,
      weightKgSnapshot: it.weightKgSnapshot.toNumber(),
      quantitySent: it.quantitySent,
      unitPriceArsSnapshot: it.unitPriceArsSnapshot.toNumber(),
      lineTotalArs: it.lineTotalArs.toNumber(),
    })),
    discountSteps: record.discountSteps.map((ds) => ({
      id: ds.id,
      remittanceId: ds.remittanceId,
      position: ds.position,
      percent: ds.percent.toNumber(),
      amountArsSnapshot: ds.amountArsSnapshot.toNumber(),
    })),
  };
}

export function serializePendingRtmBanner(record: RemittanceRecord): PendingRtmBannerDTO {
  return {
    id: record.id,
    code: record.code,
    orderId: record.orderId,
    customerDisplayName: record.customerDisplayName,
    totalOrderArs: record.totalOrderArs.toNumber(),
    totalToCollectArs: record.totalToCollectArs.toNumber(),
    createdAt: record.createdAt,
  };
}

export function serializeConfirmedRemittance(result: ConfirmedRemittanceResult): ConfirmedRemittanceDTO {
  return {
    remittanceId: result.remittanceId,
    code: result.code,
    operationId: result.operationId,
    orderId: result.orderId,
    status: result.status,
    customerSource: result.customerSource,
    recipientName: result.recipientName,
    subtotalArs: result.subtotalArs.toNumber(),
    totalOrderArs: result.totalOrderArs.toNumber(),
    priorBalanceSnapshotArs: result.priorBalanceSnapshotArs.toNumber(),
    totalToCollectArs: result.totalToCollectArs.toNumber(),
    weightKgSnapshot: result.weightKgSnapshot.toNumber(),
    movCode: result.movCode,
    businessDate: result.businessDate,
  };
}

export function serializeRtoPreview(preview: RtoPreviewResult): RtoPreviewDTO {
  return {
    orderId: preview.orderId,
    orderCode: preview.orderCode,
    customerSource: preview.customerSource,
    customerDisplayName: preview.customerDisplayName,
    hasPendingRtmGlobal: preview.hasPendingRtmGlobal,
    pendingRtmCode: preview.pendingRtmCode,
    isValidToConfirm: preview.isValidToConfirm,
    validationErrors: preview.validationErrors,
    lines: preview.lines.map((l) => ({
      productId: l.productId,
      productCode: l.productCode,
      productName: l.productName,
      presentation: l.presentation,
      weightKg: l.weightKg.toNumber(),
      requestedQuantity: l.requestedQuantity,
      agQuantity: l.agQuantity,
      unitPriceArs: l.unitPriceArs.toNumber(),
      lineTotalArs: l.lineTotalArs.toNumber(),
      availableStock: l.availableStock,
      hasSufficientStock: l.hasSufficientStock,
    })),
    subtotalArs: preview.subtotalArs.toNumber(),
    discountSteps: preview.discountSteps.map((ds) => ({
      position: ds.position,
      percent: ds.percent.toNumber(),
      amountArs: ds.amountArs.toNumber(),
    })),
    totalOrderArs: preview.totalOrderArs.toNumber(),
    priorBalanceArs: preview.priorBalanceArs.toNumber(),
    totalToCollectArs: preview.totalToCollectArs.toNumber(),
    totalWeightKg: preview.totalWeightKg.toNumber(),
    packageCount: preview.packageCount,
  };
}
