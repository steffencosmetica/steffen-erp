import type { Decimal } from '@/domain/decimal';
import type { CustomerSource } from '@/database/domain-types';
import type {
  EconomicMonthlyPoint,
  EntityMonthlyPoint,
  ProductTotals,
  ShareBreakdown,
  ShareSlice,
  ConcentrationGroup,
} from '@/domain/reporting';
import type { EntitySaleRecord } from '@/repositories/reporting.repository';
import type {
  ReportingYears,
  ReportingAnnualSummary,
  ReportingYearTotals,
  ReportingBilling,
  ReportingProducts,
  ReportingEntity,
  ReportingEntityOption,
  ReportingConcentration,
  ReportingCustomers,
  ReportingEntityAnalysis,
} from '@/services/reporting.service';

/**
 * DTOs serializables de Reportes (cruzan a Client Components). Ningún Decimal
 * sale de aquí: ARS, porcentajes y días viajan como texto NUMERIC exacto;
 * conteos, años y meses como number; fechas 'YYYY-MM-DD'. `null` solo con
 * significado funcional (mes futuro, porcentaje no calculable, sin datos).
 */

/**
 * Texto decimal exacto en notación normal. Equivale a toNumericString salvo que
 * nunca usa notación exponencial (porcentajes/días muy pequeños con la
 * configuración global toExpNeg = -9 podrían salir como "1e-12").
 */
function numericText(value: Decimal): string {
  return value.toFixed();
}

function nullableNumericText(value: Decimal | null): string | null {
  return value === null ? null : numericText(value);
}

// ---------------------------------------------------------------------------
// Tipos DTO
// ---------------------------------------------------------------------------

export interface ReportingYearsDTO {
  asOfDate: string;
  currentYear: number;
  selectedYear: number;
  availableYears: number[];
}

export interface ReportingAnnualSummaryDTO {
  billedArs: string;
  gainArs: string;
  expensesArs: string;
  transportArs: string;
  salesCount: number;
  /** null si la facturación es 0. */
  marginPct: string | null;
}

/** Punto mensual económico; null solo en meses futuros del año corriente. */
export interface ReportingMonthlyPointDTO {
  month: number;
  billedArs: string | null;
  gainArs: string | null;
  expensesArs: string | null;
}

export interface ReportingYearTotalsDTO {
  year: number;
  billedArs: string;
  gainArs: string;
}

export interface ReportingBillingDTO {
  summary: ReportingAnnualSummaryDTO;
  monthly: ReportingMonthlyPointDTO[];
  /** Año − 2, año − 1, año (ascendente). */
  byYear: ReportingYearTotalsDTO[];
}

export interface ReportingProductRowDTO {
  productId: string;
  label: string;
  units: number;
  billedArs: string;
  costArs: string;
  contributionArs: string;
}

export interface ReportingShareSliceDTO {
  /** productId u 'OTHERS'. */
  key: string;
  label: string;
  value: string;
  /** null si no es representable como parte de un total (total ≤ 0 o hay negativos). */
  sharePct: string | null;
}

export interface ReportingShareDTO {
  slices: ReportingShareSliceDTO[];
  total: string;
  /** true → la UI usa barras en lugar de dona. */
  hasNegative: boolean;
}

export interface ReportingProductsDTO {
  rows: ReportingProductRowDTO[];
  /** Hasta Top 10 por métrica (Top 5 = recorte en cliente). */
  rankings: { units: ReportingProductRowDTO[]; billed: ReportingProductRowDTO[]; contribution: ReportingProductRowDTO[] };
  share: { units: ReportingShareDTO; billed: ReportingShareDTO; contribution: ReportingShareDTO };
}

export interface ReportingEntityDTO {
  entityKey: string;
  customerSource: CustomerSource;
  customerId: string | null;
  label: string;
  salesCount: number;
  billedArs: string;
  monthlyAverageArs: string;
  ticketAverageArs: string | null;
  lastPurchaseDate: string;
  /** Días (exacto, puede tener decimales); null con menos de 2 compras. */
  frequencyDays: string | null;
}

export interface ReportingEntityOptionDTO {
  entityKey: string;
  label: string;
}

export interface ReportingConcentrationSliceDTO {
  group: ConcentrationGroup;
  billedArs: string;
  pct: string;
}

export interface ReportingConcentrationDTO {
  year: number;
  /** false → "Sin datos": porcentajes y slices null (nunca "0"). */
  hasData: boolean;
  top5Pct: string | null;
  top10Pct: string | null;
  restPct: string | null;
  slices: ReportingConcentrationSliceDTO[] | null;
}

export interface ReportingCustomersDTO {
  /** Hasta Top 10 (Top 5 = recorte en cliente). */
  topBuyers: ReportingEntityDTO[];
  selectableEntities: ReportingEntityOptionDTO[];
  concentration: ReportingConcentrationDTO;
  concentrationPrevious: ReportingConcentrationDTO;
}

export interface ReportingEntitySaleDTO {
  remittanceId: string;
  rtoCode: string;
  businessDate: string;
  totalOrderArs: string;
}

/** Punto mensual de una entidad; null solo en meses futuros del año corriente. */
export interface ReportingEntityMonthlyPointDTO {
  month: number;
  billedArs: string | null;
}

export interface ReportingEntityAnalysisDTO {
  year: number;
  entity: ReportingEntityDTO;
  monthly: ReportingEntityMonthlyPointDTO[];
  history: ReportingEntitySaleDTO[];
}

export interface ReportingActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

export function serializeReportingYears(years: ReportingYears): ReportingYearsDTO {
  return {
    asOfDate: years.asOfDate,
    currentYear: years.currentYear,
    selectedYear: years.selectedYear,
    availableYears: [...years.availableYears],
  };
}

function serializeAnnualSummary(summary: ReportingAnnualSummary): ReportingAnnualSummaryDTO {
  return {
    billedArs: numericText(summary.billedArs),
    gainArs: numericText(summary.gainArs),
    expensesArs: numericText(summary.expensesArs),
    transportArs: numericText(summary.transportArs),
    salesCount: summary.salesCount,
    marginPct: nullableNumericText(summary.marginPct),
  };
}

function serializeMonthlyPoint(point: EconomicMonthlyPoint): ReportingMonthlyPointDTO {
  return {
    month: point.month,
    billedArs: nullableNumericText(point.billedArs),
    gainArs: nullableNumericText(point.gainArs),
    expensesArs: nullableNumericText(point.expensesArs),
  };
}

function serializeYearTotals(totals: ReportingYearTotals): ReportingYearTotalsDTO {
  return { year: totals.year, billedArs: numericText(totals.billedArs), gainArs: numericText(totals.gainArs) };
}

export function serializeReportingBilling(billing: ReportingBilling): ReportingBillingDTO {
  return {
    summary: serializeAnnualSummary(billing.summary),
    monthly: billing.monthly.map(serializeMonthlyPoint),
    byYear: billing.byYear.map(serializeYearTotals),
  };
}

function serializeProductRow(row: ProductTotals): ReportingProductRowDTO {
  return {
    productId: row.productId,
    label: row.label,
    units: row.units,
    billedArs: numericText(row.billedArs),
    costArs: numericText(row.costArs),
    contributionArs: numericText(row.contributionArs),
  };
}

function serializeShareSlice(slice: ShareSlice): ReportingShareSliceDTO {
  return { key: slice.key, label: slice.label, value: numericText(slice.value), sharePct: nullableNumericText(slice.sharePct) };
}

function serializeShare(share: ShareBreakdown): ReportingShareDTO {
  return { slices: share.slices.map(serializeShareSlice), total: numericText(share.total), hasNegative: share.hasNegative };
}

export function serializeReportingProducts(products: ReportingProducts): ReportingProductsDTO {
  return {
    rows: products.rows.map(serializeProductRow),
    rankings: {
      units: products.rankings.units.map(serializeProductRow),
      billed: products.rankings.billed.map(serializeProductRow),
      contribution: products.rankings.contribution.map(serializeProductRow),
    },
    share: {
      units: serializeShare(products.share.units),
      billed: serializeShare(products.share.billed),
      contribution: serializeShare(products.share.contribution),
    },
  };
}

function serializeEntity(entity: ReportingEntity): ReportingEntityDTO {
  return {
    entityKey: entity.entityKey,
    customerSource: entity.customerSource,
    customerId: entity.customerId,
    label: entity.label,
    salesCount: entity.salesCount,
    billedArs: numericText(entity.billedArs),
    monthlyAverageArs: numericText(entity.monthlyAverageArs),
    ticketAverageArs: nullableNumericText(entity.ticketAverageArs),
    lastPurchaseDate: entity.lastPurchaseDate,
    frequencyDays: nullableNumericText(entity.frequencyDays),
  };
}

function serializeEntityOption(option: ReportingEntityOption): ReportingEntityOptionDTO {
  return { entityKey: option.entityKey, label: option.label };
}

function serializeConcentration(c: ReportingConcentration): ReportingConcentrationDTO {
  return {
    year: c.year,
    hasData: c.hasData,
    top5Pct: nullableNumericText(c.top5Pct),
    top10Pct: nullableNumericText(c.top10Pct),
    restPct: nullableNumericText(c.restPct),
    slices: c.slices === null ? null : c.slices.map((s) => ({ group: s.group, billedArs: numericText(s.billedArs), pct: numericText(s.pct) })),
  };
}

export function serializeReportingCustomers(customers: ReportingCustomers): ReportingCustomersDTO {
  return {
    topBuyers: customers.topBuyers.map(serializeEntity),
    selectableEntities: customers.selectableEntities.map(serializeEntityOption),
    concentration: serializeConcentration(customers.concentration),
    concentrationPrevious: serializeConcentration(customers.concentrationPrevious),
  };
}

function serializeEntitySale(sale: EntitySaleRecord): ReportingEntitySaleDTO {
  return {
    remittanceId: sale.remittanceId,
    rtoCode: sale.rtoCode,
    businessDate: sale.businessDate,
    totalOrderArs: numericText(sale.totalOrderArs),
  };
}

function serializeEntityMonthlyPoint(point: EntityMonthlyPoint): ReportingEntityMonthlyPointDTO {
  return { month: point.month, billedArs: nullableNumericText(point.billedArs) };
}

export function serializeReportingEntityAnalysis(analysis: ReportingEntityAnalysis): ReportingEntityAnalysisDTO {
  return {
    year: analysis.year,
    entity: serializeEntity(analysis.entity),
    monthly: analysis.monthly.map(serializeEntityMonthlyPoint),
    history: analysis.history.map(serializeEntitySale),
  };
}
