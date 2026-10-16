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
