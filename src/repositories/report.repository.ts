import { BaseSupabaseRepository } from './base.repository';
import { Decimal } from '@/domain/decimal';
import { DomainError } from '@/domain/errors';
import { readExactDecimal } from './exact-numeric';

/**
 * Las cuatro métricas oficiales (BUSINESS_RULES §36, DATA_MODEL v_current_reports).
 * El mes corriente se evalúa en la base con business_operations.business_date del RTO
 * contra CURRENT_DATE; la ganancia es la histórica congelada del RTM (gain_ars).
 */
export interface CurrentReportsRecord {
  salesCurrentMonth: number;
  billedCurrentMonthArs: Decimal;
  gainCurrentMonthArs: Decimal;
  openOrders: number;
}

export interface IReportRepository {
  getCurrentReports(): Promise<CurrentReportsRecord>;
  /** Fecha comercial vigente (CURRENT_DATE de PostgreSQL) como 'YYYY-MM-DD'. */
  getCurrentBusinessDate(): Promise<string>;
}

function readCount(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    throw new DomainError(`${field}: se esperaba un conteo entero no negativo.`);
  }
  return n;
}

export class ReportRepository extends BaseSupabaseRepository implements IReportRepository {
  async getCurrentReports(): Promise<CurrentReportsRecord> {
    const { data, error } = await this.client
      .from('v_current_reports')
      .select(
        'sales_current_month, open_orders, billed_current_month_ars::text, gain_current_month_ars::text'
      )
      .single();

    if (error || !data) {
      throw new DomainError(`Error consultando métricas del mes: ${error?.message ?? 'sin datos'}`);
    }

    const row = data as Record<string, unknown>;
    return {
      salesCurrentMonth: readCount(row.sales_current_month, 'v_current_reports.sales_current_month'),
      openOrders: readCount(row.open_orders, 'v_current_reports.open_orders'),
      billedCurrentMonthArs: readExactDecimal(row.billed_current_month_ars, 'v_current_reports.billed_current_month_ars'),
      gainCurrentMonthArs: readExactDecimal(row.gain_current_month_ars, 'v_current_reports.gain_current_month_ars'),
    };
  }

  async getCurrentBusinessDate(): Promise<string> {
    const { data, error } = await this.client.from('v_current_business_date').select('business_date').single();
    if (error || !data || typeof data.business_date !== 'string') {
      throw new DomainError(`Error consultando la fecha comercial: ${error?.message ?? 'sin datos'}`);
    }
    return data.business_date;
  }
}
