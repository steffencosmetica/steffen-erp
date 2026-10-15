import type {
  MarginRemittanceRecord,
  MarginRemittanceItemRecord,
  CompletedRtmResult,
} from '@/repositories/margin-remittance.repository';
import type { RtmPreviewResult, RtmPreviewLine } from '@/services/remittance.service';
import type { DocumentGenerationOutcome } from '@/services/document.service';

export interface DocumentOutcomeDTO {
  status: string;
  documentId?: string;
  errorMessage?: string | null;
}

function serializeDocumentOutcome(outcome?: DocumentGenerationOutcome): DocumentOutcomeDTO | undefined {
  if (!outcome) return undefined;
  return { status: outcome.status, documentId: outcome.documentId, errorMessage: outcome.errorMessage };
}

export interface MarginRemittanceItemDTO {
  id: string;
  marginRemittanceId: string;
  productId: string;
  quantitySent: number;
  unitCostTheoreticalSnapshotArs: number;
  totalCostSnapshotArs: number;
}

export interface MarginRemittanceDetailDTO {
  id: string;
  code: string;
  operationId: string;
  remittanceId: string;
  productsCostTotalArs: number;
  transportCostArs: number;
  gainArs: number;
  createdAt: string;
  items: MarginRemittanceItemDTO[];
}

export interface CompletedRtmDTO {
  marginRemittanceId: string;
  code: string;
  operationId: string;
  remittanceId: string;
  remittanceCode: string;
  productsCostTotalArs: number;
  transportCostArs: number;
  gainArs: number;
  movCode: string | null;
  businessDate: string;
  rtoStatus: 'COMPLETED';
  document?: DocumentOutcomeDTO;
}

export interface RtmPreviewLineDTO {
  productId: string;
  productCode: string;
  productName: string;
  quantitySent: number;
  unitPriceArs: number;
  lineTotalArs: number;
  unitCostTheoreticalArs: number;
  lineCostTotalArs: number;
}

export interface RtmPreviewDTO {
  remittanceId: string;
  remittanceCode: string;
  customerSource: string;
  customerDisplayName: string;
  addressSnapshot: string | null;
  localitySnapshot: string | null;
  provinceSnapshot: string | null;
  transportNameSnapshot: string | null;
  packageCountSnapshot: number | null;
  weightKgSnapshot: number;
  createdAt: string;
  isValidToComplete: boolean;
  validationErrors: string[];
  lines: RtmPreviewLineDTO[];
  totalOrderArs: number;
  productsCostTotalArs: number;
  transportCostArs: number;
  gainArs: number;
}

export function serializeMarginRemittance(record: MarginRemittanceRecord): MarginRemittanceDetailDTO {
  return {
    id: record.id,
    code: record.code,
    operationId: record.operationId,
    remittanceId: record.remittanceId,
    productsCostTotalArs: record.productsCostTotalArs.toNumber(),
    transportCostArs: record.transportCostArs.toNumber(),
    gainArs: record.gainArs.toNumber(),
    createdAt: record.createdAt,
    items: record.items.map((it: MarginRemittanceItemRecord) => ({
      id: it.id,
      marginRemittanceId: it.marginRemittanceId,
      productId: it.productId,
      quantitySent: it.quantitySent,
      unitCostTheoreticalSnapshotArs: it.unitCostTheoreticalSnapshotArs.toNumber(),
      totalCostSnapshotArs: it.totalCostSnapshotArs.toNumber(),
    })),
  };
}

export function serializeCompletedRtm(
  result: CompletedRtmResult,
  documentOutcome?: DocumentGenerationOutcome
): CompletedRtmDTO {
  return {
    marginRemittanceId: result.marginRemittanceId,
    code: result.code,
    operationId: result.operationId,
    remittanceId: result.remittanceId,
    remittanceCode: result.remittanceCode,
    productsCostTotalArs: result.productsCostTotalArs.toNumber(),
    transportCostArs: result.transportCostArs.toNumber(),
    gainArs: result.gainArs.toNumber(),
    movCode: result.movCode,
    businessDate: result.businessDate,
    rtoStatus: result.rtoStatus,
    document: serializeDocumentOutcome(documentOutcome),
  };
}

export function serializeRtmPreview(preview: RtmPreviewResult): RtmPreviewDTO {
  return {
    remittanceId: preview.remittanceId,
    remittanceCode: preview.remittanceCode,
    customerSource: preview.customerSource,
    customerDisplayName: preview.customerDisplayName,
    addressSnapshot: preview.addressSnapshot,
    localitySnapshot: preview.localitySnapshot,
    provinceSnapshot: preview.provinceSnapshot,
    transportNameSnapshot: preview.transportNameSnapshot,
    packageCountSnapshot: preview.packageCountSnapshot,
    weightKgSnapshot: preview.weightKgSnapshot.toNumber(),
    createdAt: preview.createdAt,
    isValidToComplete: preview.isValidToComplete,
    validationErrors: preview.validationErrors,
    lines: preview.lines.map((l: RtmPreviewLine) => ({
      productId: l.productId,
      productCode: l.productCode,
      productName: l.productName,
      quantitySent: l.quantitySent,
      unitPriceArs: l.unitPriceArs.toNumber(),
      lineTotalArs: l.lineTotalArs.toNumber(),
      unitCostTheoreticalArs: l.unitCostTheoreticalArs.toNumber(),
      lineCostTotalArs: l.lineCostTotalArs.toNumber(),
    })),
    totalOrderArs: preview.totalOrderArs.toNumber(),
    productsCostTotalArs: preview.productsCostTotalArs.toNumber(),
    transportCostArs: preview.transportCostArs.toNumber(),
    gainArs: preview.gainArs.toNumber(),
  };
}
