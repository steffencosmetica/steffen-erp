'use server';

import { revalidatePath } from 'next/cache';
import { getRemittanceService } from '@/services/composition';
import {
  CompletedRtmDTO,
  MarginRemittanceDetailDTO,
  RtmPreviewDTO,
  serializeCompletedRtm,
  serializeMarginRemittance,
  serializeRtmPreview,
} from './margin-remittance.dto';

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function previewRtmAction(
  remittanceId: string,
  transportCostArs?: string | number
): Promise<ActionResponse<RtmPreviewDTO>> {
  try {
    const service = getRemittanceService();
    const preview = await service.previewRtm(remittanceId, transportCostArs);

    return {
      success: true,
      data: serializeRtmPreview(preview),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al calcular previsualización del RTM.',
    };
  }
}

export async function completeRtmAction(
  remittanceId: string,
  transportCostArs: string | number
): Promise<ActionResponse<CompletedRtmDTO>> {
  try {
    const service = getRemittanceService();
    const result = await service.completeRtm(remittanceId, transportCostArs);

    // Revalidar rutas afectadas por el cierre de venta (ganancia, caja, stock no cambia)
    revalidatePath('/pedidos');
    revalidatePath('/administracion');
    revalidatePath('/movimientos');
    revalidatePath('/costo-ganancia');
    revalidatePath('/');

    return {
      success: true,
      data: serializeCompletedRtm(result),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al completar el RTM.',
    };
  }
}

export async function getMarginRemittanceByRemittanceIdAction(
  remittanceId: string
): Promise<ActionResponse<MarginRemittanceDetailDTO | null>> {
  try {
    const service = getRemittanceService();
    const record = await service.getMarginRemittanceByRemittanceId(remittanceId);

    return {
      success: true,
      data: record ? serializeMarginRemittance(record) : null,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al consultar el RTM del remito.',
    };
  }
}
