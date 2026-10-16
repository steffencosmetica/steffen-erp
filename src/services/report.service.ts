import type { CurrentReportsRecord, IReportRepository } from '@/repositories/report.repository';
import { businessPeriodFromDate, type BusinessPeriod } from '@/domain/business-period';

/**
 * Métricas derivadas en tiempo real para Dashboard / Reportes (BUSINESS_RULES §36.5):
 * no persiste copias ni recalcula ganancias con costos actuales.
 */
export class ReportDomainService {
  constructor(private readonly reportRepo: IReportRepository) {}

  getCurrentReports(): Promise<CurrentReportsRecord> {
    return this.reportRepo.getCurrentReports();
  }

  /**
   * Período comercial vigente (año/mes) desde la fecha de la base: única fuente
   * para Dashboard (v_current_reports usa el mismo CURRENT_DATE) y Administración.
   */
  async getCurrentBusinessPeriod(): Promise<BusinessPeriod> {
    return businessPeriodFromDate(await this.reportRepo.getCurrentBusinessDate());
  }
}
