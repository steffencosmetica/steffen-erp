import type { IReportingRepository, EntityTotalsRecord, EntitySaleRecord } from '@/repositories/reporting.repository';
import type { CustomerSource } from '@/database/domain-types';
import { Decimal } from '@/domain/decimal';
import { businessPeriodFromDate } from '@/domain/business-period';
import {
  buildAvailableYears,
  fillEconomicMonthlySeries,
  fillEntityMonthlySeries,
  marginPct,
  monthlyAverage,
  ticketAverage,
  frequencyDays,
  entityKeyOf,
  parseEntityKey,
  entityLabel,
  rankProducts,
  rankEntities,
  productShare,
  concentration,
  type EconomicMonthlyPoint,
  type EntityMonthlyPoint,
  type EntityMonthTotals,
  type ProductTotals,
  type EntityTotals,
  type ShareBreakdown,
  type Concentration,
} from '@/domain/reporting';

/**
 * Reportes analíticos (docs/REPORTES.md). READ-ONLY: combina las agregaciones
 * de ReportingRepository con el dominio puro (domain/reporting.ts). Sin
 * persistencia ni efectos.
 *
 * La página resuelve primero `resolveYears` (una sola lectura de la fecha
 * comercial) y con ese resultado puede pedir en paralelo getBilling,
 * getProducts y getCustomers; getEntityAnalysis se usa al cambiar de entidad.
 */

/** Fuente única de la fecha comercial vigente (ReportRepository.getCurrentBusinessDate). */
export interface BusinessDateSource {
  getCurrentBusinessDate(): Promise<string>;
}

export interface ReportingYears {
  asOfDate: string;
  currentYear: number;
  selectedYear: number;
  availableYears: number[];
}

export interface ReportingAnnualSummary {
  billedArs: Decimal;
  gainArs: Decimal;
  expensesArs: Decimal;
  transportArs: Decimal;
  salesCount: number;
  marginPct: Decimal | null;
}

export interface ReportingYearTotals {
  year: number;
  billedArs: Decimal;
  gainArs: Decimal;
}

export interface ReportingBilling {
  summary: ReportingAnnualSummary;
  monthly: EconomicMonthlyPoint[];
  /** Año − 2, año − 1, año (ascendente). */
  byYear: ReportingYearTotals[];
}

export const PRODUCT_RANKING_LIMIT = 10;
export const TOP_BUYERS_LIMIT = 10;

export interface ReportingProducts {
  rows: ProductTotals[];
  rankings: { units: ProductTotals[]; billed: ProductTotals[]; contribution: ProductTotals[] };
  share: { units: ShareBreakdown; billed: ShareBreakdown; contribution: ShareBreakdown };
}

export interface ReportingEntity {
  entityKey: string;
  customerSource: CustomerSource;
  customerId: string | null;
  label: string;
  salesCount: number;
  billedArs: Decimal;
  monthlyAverageArs: Decimal;
  ticketAverageArs: Decimal | null;
  lastPurchaseDate: string;
  frequencyDays: Decimal | null;
}

export interface ReportingEntityOption {
  entityKey: string;
  label: string;
}

export interface ReportingConcentration extends Concentration {
  year: number;
}

export interface ReportingCustomers {
  topBuyers: ReportingEntity[];
  selectableEntities: ReportingEntityOption[];
  concentration: ReportingConcentration;
  concentrationPrevious: ReportingConcentration;
}

export interface ReportingEntityAnalysis {
  year: number;
  entity: ReportingEntity;
  monthly: EntityMonthlyPoint[];
  /** Orden del Repository: business_date DESC, created_at DESC. */
  history: EntitySaleRecord[];
}

const ZERO = () => new Decimal(0);

function sumBy<T>(items: readonly T[], value: (item: T) => Decimal): Decimal {
  return items.reduce((acc, item) => acc.plus(value(item)), ZERO());
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export class ReportingService {
  constructor(
    private readonly reportingRepo: IReportingRepository,
    private readonly businessDate: BusinessDateSource
  ) {}

  /**
   * Selector global de año (REPORTES §3). Lee la fecha comercial una sola vez.
   * Un año pedido inválido, futuro o fuera de los disponibles cae al año actual.
   */
  async resolveYears(requestedYear?: number): Promise<ReportingYears> {
    const asOfDate = await this.businessDate.getCurrentBusinessDate();
    const currentYear = businessPeriodFromDate(asOfDate).year;
    const firstYear = await this.reportingRepo.getFirstReportingYear(asOfDate);
    const availableYears = buildAvailableYears(firstYear, currentYear);
    const selectedYear =
      requestedYear !== undefined && Number.isInteger(requestedYear) && availableYears.includes(requestedYear)
        ? requestedYear
        : currentYear;
    return { asOfDate, currentYear, selectedYear, availableYears };
  }

  /** Sección Facturación (REPORTES §5): resumen anual, 12 meses y comparación de 3 años. */
  async getBilling(years: ReportingYears): Promise<ReportingBilling> {
    const { selectedYear, asOfDate } = years;
    const rows = await this.reportingRepo.getBillingMonths(selectedYear, asOfDate);
    const selected = rows.filter((r) => r.year === selectedYear);

    const billedArs = sumBy(selected, (r) => r.billedArs);
    const gainArs = sumBy(selected, (r) => r.gainArs);
    const summary: ReportingAnnualSummary = {
      billedArs,
      gainArs,
      expensesArs: sumBy(selected, (r) => r.expensesArs),
      transportArs: sumBy(selected, (r) => r.transportArs),
      salesCount: selected.reduce((acc, r) => acc + r.salesCount, 0),
      marginPct: marginPct(gainArs, billedArs),
    };

    const monthly = fillEconomicMonthlySeries(
      selected.map((r) => ({ month: r.month, billedArs: r.billedArs, gainArs: r.gainArs, expensesArs: r.expensesArs })),
      selectedYear,
      asOfDate
    );

    const byYear = [selectedYear - 2, selectedYear - 1, selectedYear].map((year) => {
      const ofYear = rows.filter((r) => r.year === year);
      return { year, billedArs: sumBy(ofYear, (r) => r.billedArs), gainArs: sumBy(ofYear, (r) => r.gainArs) };
    });

    return { summary, monthly, byYear };
  }

  /** Sección Productos (REPORTES §6): rankings (hasta Top 10) y participación Top 4 + Otros. */
  async getProducts(years: ReportingYears): Promise<ReportingProducts> {
    const records = await this.reportingRepo.getProductTotals(years.selectedYear, years.asOfDate);
    const rows: ProductTotals[] = records.map((r) => ({
      productId: r.productId,
      label: r.productName,
      units: r.units,
      billedArs: r.billedArs,
      costArs: r.costArs,
      contributionArs: r.contributionArs,
    }));
    return {
      rows,
      rankings: {
        units: rankProducts(rows, 'UNITS', PRODUCT_RANKING_LIMIT),
        billed: rankProducts(rows, 'BILLED', PRODUCT_RANKING_LIMIT),
        contribution: rankProducts(rows, 'CONTRIBUTION', PRODUCT_RANKING_LIMIT),
      },
      share: {
        units: productShare(rows, 'UNITS'),
        billed: productShare(rows, 'BILLED'),
        contribution: productShare(rows, 'CONTRIBUTION'),
      },
    };
  }

  /**
   * Sección Clientes (REPORTES §7–§11): mayores compradores, entidades
   * seleccionables y concentración del año y del año anterior (cada año con su
   * propio ranking).
   */
  async getCustomers(years: ReportingYears): Promise<ReportingCustomers> {
    const { selectedYear, asOfDate } = years;
    const [current, previous] = await Promise.all([
      this.reportingRepo.getEntityTotals(selectedYear, asOfDate),
      this.reportingRepo.getEntityTotals(selectedYear - 1, asOfDate),
    ]);
    const currentTotals = current.map(toEntityTotals);
    const entities = new Map(current.map((r) => [entityKeyOf(r.customerSource, r.customerId), this.buildEntity(r, selectedYear, asOfDate)]));
    const entityOf = (key: string): ReportingEntity => {
      const entity = entities.get(key);
      if (!entity) throw new Error(`Reportes: entidad ${key} ausente al componer el ranking.`);
      return entity;
    };

    const topBuyers = rankEntities(currentTotals, TOP_BUYERS_LIMIT).map((t) => entityOf(t.entityKey));

    const selectableEntities = [...entities.values()]
      .map((e) => ({ entityKey: e.entityKey, label: e.label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }) || compareCodeUnits(a.entityKey, b.entityKey));

    return {
      topBuyers,
      selectableEntities,
      concentration: { year: selectedYear, ...concentration(currentTotals) },
      concentrationPrevious: { year: selectedYear - 1, ...concentration(previous.map(toEntityTotals)) },
    };
  }

  /**
   * Análisis individual (REPORTES §9). Clave inválida → DomainError; entidad
   * sin ventas COMPLETED en el año → null. Totales y ventas se piden en
   * paralelo (2 consultas, sin N+1).
   */
  async getEntityAnalysis(years: ReportingYears, entityKey: string): Promise<ReportingEntityAnalysis | null> {
    const { selectedYear, asOfDate } = years;
    const ref = parseEntityKey(entityKey);
    const canonicalKey = entityKeyOf(ref.customerSource, ref.customerId);
    const [totals, sales] = await Promise.all([
      this.reportingRepo.getEntityTotals(selectedYear, asOfDate),
      this.reportingRepo.getEntitySales(selectedYear, asOfDate, ref.customerSource, ref.customerId),
    ]);
    const record = totals.find((r) => entityKeyOf(r.customerSource, r.customerId) === canonicalKey);
    if (!record) return null;

    const byMonth = new Map<number, Decimal>();
    for (const sale of sales) {
      const { month } = businessPeriodFromDate(sale.businessDate);
      byMonth.set(month, (byMonth.get(month) ?? ZERO()).plus(sale.totalOrderArs));
    }
    const monthRows: EntityMonthTotals[] = [...byMonth.entries()].map(([month, billedArs]) => ({ month, billedArs }));

    return {
      year: selectedYear,
      entity: this.buildEntity(record, selectedYear, asOfDate),
      monthly: fillEntityMonthlySeries(monthRows, selectedYear, asOfDate),
      history: sales,
    };
  }

  private buildEntity(record: EntityTotalsRecord, year: number, asOfDate: string): ReportingEntity {
    return {
      entityKey: entityKeyOf(record.customerSource, record.customerId),
      customerSource: record.customerSource,
      customerId: record.customerId,
      label: entityLabel(record.customerSource, record.customerName),
      salesCount: record.salesCount,
      billedArs: record.billedArs,
      monthlyAverageArs: monthlyAverage(record.billedArs, year, asOfDate),
      ticketAverageArs: ticketAverage(record.billedArs, record.salesCount),
      lastPurchaseDate: record.lastPurchaseDate,
      frequencyDays: frequencyDays(record.firstPurchaseDate, record.lastPurchaseDate, record.salesCount),
    };
  }
}

/** Totales de dominio (rankings / concentración) de una entidad del Repository. */
function toEntityTotals(record: EntityTotalsRecord): EntityTotals {
  return {
    entityKey: entityKeyOf(record.customerSource, record.customerId),
    label: entityLabel(record.customerSource, record.customerName),
    salesCount: record.salesCount,
    billedArs: record.billedArs,
    firstPurchaseDate: record.firstPurchaseDate,
    lastPurchaseDate: record.lastPurchaseDate,
  };
}
