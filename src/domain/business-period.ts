import { DomainError } from './errors';

/**
 * Período comercial (año/mes) derivado de la fecha comercial de la base
 * (v_current_business_date = CURRENT_DATE de PostgreSQL). Parseo textual de
 * 'YYYY-MM-DD': sin Date ni conversiones de zona horaria.
 */
export interface BusinessPeriod {
  businessDate: string;
  year: number;
  month: number;
}

const BUSINESS_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function businessPeriodFromDate(businessDate: string): BusinessPeriod {
  const m = BUSINESS_DATE_RE.exec(businessDate);
  if (!m) {
    throw new DomainError(`Fecha comercial inválida: "${businessDate}".`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    throw new DomainError(`Fecha comercial inválida: "${businessDate}".`);
  }
  return { businessDate, year, month };
}

/**
 * Suma/resta días a una fecha comercial 'YYYY-MM-DD' (aritmética de calendario pura,
 * en UTC solo como contenedor; no interpreta zona horaria).
 */
export function addDaysToBusinessDate(businessDate: string, days: number): string {
  const { year, month } = businessPeriodFromDate(businessDate);
  const day = Number(businessDate.slice(8, 10));
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}
