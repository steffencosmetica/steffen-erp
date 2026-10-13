import type {
  PlanningOrderColumn,
  PlanningProductRow,
  PlanningOrderCoverageCell,
  PlanningMatrix,
} from '@/services/planning.service';

export interface PlanningOrderColumnDTO {
  orderId: string;
  code: string;
  customerDisplayName: string;
  planningSortKey: number;
}

export interface PlanningOrderCoverageCellDTO {
  requested: number;
  covered: number;
  hasShortage: boolean;
}

export interface PlanningProductRowDTO {
  productId: string;
  productCode: string;
  productName: string;
  totalRequested: number;
  stockProPhysical: number;
  coverageFromStock: number;
  coveredFromBulk: number;
  stockDisplay: string;
  stockProPart: number;
  bulkPart: number;
  finalShortage: number;
  ordersCoverage: Record<string, PlanningOrderCoverageCellDTO>;
  sortKey: number;
}

export interface PlanningMatrixDTO {
  openOrders: PlanningOrderColumnDTO[];
  products: PlanningProductRowDTO[];
  hasOrders: boolean;
}

export function serializePlanningMatrix(matrix: PlanningMatrix): PlanningMatrixDTO {
  return {
    openOrders: matrix.openOrders.map((o) => ({
      orderId: o.orderId,
      code: o.code,
      customerDisplayName: o.customerDisplayName,
      planningSortKey: o.planningSortKey,
    })),
    products: matrix.products.map((p) => ({
      productId: p.productId,
      productCode: p.productCode,
      productName: p.productName,
      totalRequested: p.totalRequested,
      stockProPhysical: p.stockProPhysical,
      coverageFromStock: p.coverageFromStock,
      coveredFromBulk: p.coveredFromBulk,
      stockDisplay: p.stockDisplay,
      stockProPart: p.stockProPart,
      bulkPart: p.bulkPart,
      finalShortage: p.finalShortage,
      ordersCoverage: p.ordersCoverage,
      sortKey: p.sortKey,
    })),
    hasOrders: matrix.hasOrders,
  };
}
