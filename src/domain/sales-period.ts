import { Decimal } from './decimal';
import { businessPeriodFromDate } from './business-period';

/**
 * Ventas por mes / año (Reportes → Ventas): agregación por período comercial
 * (año/mes de business_date del RTO), solo RTO COMPLETED con RTM. Suma exacta
 * de snapshots congelados (total_order_ars, gain_ars). Orden descendente.
 */
export interface SaleAmount {
  businessDate: string;
  totalOrderArs: Decimal;
  gainArs: Decimal;
}

export interface SalesPeriodTotal {
  year: number;
  month: number;
  salesCount: number;
  billedArs: Decimal;
  gainArs: Decimal;
}

export function aggregateSalesByPeriod(sales: SaleAmount[]): SalesPeriodTotal[] {
  const byPeriod = new Map<string, SalesPeriodTotal>();
  for (const sale of sales) {
    const { year, month } = businessPeriodFromDate(sale.businessDate);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const acc = byPeriod.get(key) ?? { year, month, salesCount: 0, billedArs: new Decimal(0), gainArs: new Decimal(0) };
    acc.salesCount += 1;
    acc.billedArs = acc.billedArs.plus(sale.totalOrderArs);
    acc.gainArs = acc.gainArs.plus(sale.gainArs);
    byPeriod.set(key, acc);
  }
  return [...byPeriod.values()].sort((a, b) => (b.year - a.year) || (b.month - a.month));
}
