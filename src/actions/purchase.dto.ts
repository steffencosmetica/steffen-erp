import { Decimal, toNumericString } from '@/domain/decimal';
import type {
  PurchaseOperationResult,
  PurchaseDetailRecord,
  PurchaseSummaryRecord,
  PurchaseItemRecord,
} from '@/repositories/purchase.repository';
import type { AvailableItemForSupplier } from '@/services/purchase.service';

export interface RegisterPurchaseLineDTO {
  stockItemId: string;
  quantity: string;
  unitPriceNetSource: string;
  vatRatePct?: string;
}

export interface RegisterPurchaseInputDTO {
  supplierId: string;
  businessDate?: string;
  paymentMode: 'PAID' | 'DEBT';
  exchangeRateUsed?: string | null;
  observations?: string | null;
  items: RegisterPurchaseLineDTO[];
}

export interface EditPurchaseInputDTO {
  purchaseId: string;
  businessDate?: string;
  paymentMode: 'PAID' | 'DEBT';
  exchangeRateUsed?: string | null;
  observations?: string | null;
  items: RegisterPurchaseLineDTO[];
}

export interface PurchaseItemDTO {
  id: string;
  purchaseId: string;
  stockItemId: string;
  stockItemCode: string;
  stockItemName: string;
  stockItemType: 'MPR' | 'COM';
  unitType: 'KG' | 'UNIT';
  quantity: string;
  unitPriceNetSource: string;
  vatRatePct: string;
  unitPriceGrossArsSnapshot: string;
  lineTotalGrossArs: string;
  sortOrder: number;
}

export interface PurchaseDetailDTO {
  id: string;
  code: string;
  operationId: string;
  businessDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  paymentMode: 'PAID' | 'DEBT';
  currencyCodeSnapshot: 'ARS' | 'USD';
  exchangeRateUsed: string | null;
  totalNetSourceCurrency: string;
  totalGrossArs: string;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseItemDTO[];
}

export interface PurchaseSummaryDTO {
  id: string;
  code: string;
  operationId: string;
  businessDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  paymentMode: 'PAID' | 'DEBT';
  currencyCodeSnapshot: 'ARS' | 'USD';
  exchangeRateUsed: string | null;
  totalNetSourceCurrency: string;
  totalGrossArs: string;
  observations: string | null;
  itemsCount: number;
  createdAt: string;
}

export interface PurchaseOperationResultDTO {
  success: boolean;
  purchaseId: string;
  code: string;
  operationId: string;
  businessDate: string;
  supplierId: string;
  supplierName: string;
  paymentMode: 'PAID' | 'DEBT';
  currencyCode: 'ARS' | 'USD';
  exchangeRateUsed: string | null;
  totalNetSourceCurrency: string;
  totalGrossArs: string;
  patrimonialMovementCode?: string;
  items: Array<{
    stockItemId: string;
    quantity: string;
    unitPriceNetSource: string;
    unitPriceGrossArs: string;
    lineTotalGrossArs: string;
    mstCode?: string;
  }>;
}

export interface AvailableSupplierItemDTO {
  id: string;
  code: string;
  name: string;
  itemType: 'MPR' | 'COM';
  unitType: 'KG' | 'UNIT';
  isAssociated: boolean;
  quotedUnitPriceNet: string | null;
  priceUpdatedAt: string | null;
  currentStock: string;
}

export interface SupplierPurchaseCatalogDTO {
  items: AvailableSupplierItemDTO[];
  supplierCurrency: 'ARS' | 'USD';
  currentUsdRate: string | null;
}

export function serializePurchaseOperationResult(res: PurchaseOperationResult): PurchaseOperationResultDTO {
  return {
    success: res.success,
    purchaseId: res.purchaseId,
    code: res.code,
    operationId: res.operationId,
    businessDate: res.businessDate,
    supplierId: res.supplierId,
    supplierName: res.supplierName,
    paymentMode: res.paymentMode,
    currencyCode: res.currencyCode,
    exchangeRateUsed: res.exchangeRateUsed ? toNumericString(res.exchangeRateUsed) : null,
    totalNetSourceCurrency: toNumericString(res.totalNetSourceCurrency),
    totalGrossArs: toNumericString(res.totalGrossArs),
    patrimonialMovementCode: res.patrimonialMovementCode,
    items: res.items.map((it) => ({
      stockItemId: it.stockItemId,
      quantity: toNumericString(it.quantity),
      unitPriceNetSource: toNumericString(it.unitPriceNetSource),
      unitPriceGrossArs: toNumericString(it.unitPriceGrossArs),
      lineTotalGrossArs: toNumericString(it.lineTotalGrossArs),
      mstCode: it.mstCode,
    })),
  };
}

export function serializePurchaseItem(item: PurchaseItemRecord): PurchaseItemDTO {
  return {
    id: item.id,
    purchaseId: item.purchaseId,
    stockItemId: item.stockItemId,
    stockItemCode: item.stockItemCode,
    stockItemName: item.stockItemName,
    stockItemType: item.stockItemType,
    unitType: item.unitType,
    quantity: toNumericString(item.quantity),
    unitPriceNetSource: toNumericString(item.unitPriceNetSource),
    vatRatePct: toNumericString(item.vatRatePct),
    unitPriceGrossArsSnapshot: toNumericString(item.unitPriceGrossArsSnapshot),
    lineTotalGrossArs: toNumericString(item.lineTotalGrossArs),
    sortOrder: item.sortOrder,
  };
}

export function serializePurchaseDetail(p: PurchaseDetailRecord): PurchaseDetailDTO {
  return {
    id: p.id,
    code: p.code,
    operationId: p.operationId,
    businessDate: p.businessDate,
    supplierId: p.supplierId,
    supplierCode: p.supplierCode,
    supplierName: p.supplierName,
    paymentMode: p.paymentMode,
    currencyCodeSnapshot: p.currencyCodeSnapshot,
    exchangeRateUsed: p.exchangeRateUsed ? toNumericString(p.exchangeRateUsed) : null,
    totalNetSourceCurrency: toNumericString(p.totalNetSourceCurrency),
    totalGrossArs: toNumericString(p.totalGrossArs),
    observations: p.observations,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    items: p.items.map(serializePurchaseItem),
  };
}

export function serializePurchaseSummary(p: PurchaseSummaryRecord): PurchaseSummaryDTO {
  return {
    id: p.id,
    code: p.code,
    operationId: p.operationId,
    businessDate: p.businessDate,
    supplierId: p.supplierId,
    supplierCode: p.supplierCode,
    supplierName: p.supplierName,
    paymentMode: p.paymentMode,
    currencyCodeSnapshot: p.currencyCodeSnapshot,
    exchangeRateUsed: p.exchangeRateUsed ? toNumericString(p.exchangeRateUsed) : null,
    totalNetSourceCurrency: toNumericString(p.totalNetSourceCurrency),
    totalGrossArs: toNumericString(p.totalGrossArs),
    observations: p.observations,
    itemsCount: p.itemsCount,
    createdAt: p.createdAt,
  };
}
