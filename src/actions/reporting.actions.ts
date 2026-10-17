'use server';

import { requireAuthenticatedUser } from '@/auth/guard';
import { getReportingService } from '@/services/composition';
import {
  serializeReportingEntityAnalysis,
  type ReportingEntityAnalysisDTO,
  type ReportingActionResult,
} from './reporting.dto';

export type { ReportingEntityAnalysisDTO, ReportingActionResult };

/**
 * Análisis individual de una entidad analítica (REPORTES §9), para cambiar de
 * entidad sin recargar la página. La fecha comercial la resuelve siempre el
 * servidor; un año inválido o no disponible cae al año actual (ver `year` en
 * el resultado). Entidad sin ventas COMPLETED en el año → data null.
 */
export async function getReportingEntityAnalysisAction(
  year: number,
  entityKey: string
): Promise<ReportingActionResult<ReportingEntityAnalysisDTO | null>> {
  try {
    await requireAuthenticatedUser();
    if (typeof entityKey !== 'string') {
      return { success: false, error: 'Clave de entidad inválida.' };
    }
    const service = getReportingService();
    const years = await service.resolveYears(typeof year === 'number' ? year : undefined);
    const analysis = await service.getEntityAnalysis(years, entityKey);
    return { success: true, data: analysis === null ? null : serializeReportingEntityAnalysis(analysis) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error && err.message ? err.message : 'Error al consultar el análisis de la entidad.',
    };
  }
}
