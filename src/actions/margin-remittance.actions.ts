'use server';

import { requireAuthenticatedUser } from '@/auth/guard';
import { revalidatePath } from 'next/cache';
import { getRemittanceService, getDocumentService } from '@/services/composition';
import {
  CompletedRtmDTO,
  MarginRemittanceDetailDTO,
  RtmPreviewDTO,
  serializeCompletedRtm,
  serializeMarginRemittance,
  serializeRtmPreview,
} from './margin-remittance.dto';
import type { DocumentGenerationOutcome } from '@/services/document.service';

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
    await requireAuthenticatedUser();
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
    await requireAuthenticatedUser();
    const service = getRemittanceService();
    const result = await service.completeRtm(remittanceId, transportCostArs);

    // Revalidar rutas afectadas por el cierre de venta (ganancia, caja, stock no cambia)
    revalidatePath('/pedidos');
    revalidatePath('/administracion');
    revalidatePath('/movimientos');
    revalidatePath('/costo-ganancia');
    revalidatePath('/');

    // Generación del PDF del RTM: SIEMPRE después del commit comercial, nunca
    // dentro de la transacción atómica. Un fallo de PDF nunca revierte el RTM
    // ya confirmado (businessSuccess=true se mantiene aunque el documento falle).
    let documentOutcome: DocumentGenerationOutcome;
    try {
      documentOutcome = await getDocumentService().ensureRtmDocument(result.remittanceId);
    } catch (docErr: unknown) {
      const errorMessage = docErr instanceof Error && docErr.message ? docErr.message : 'Error generando el PDF del RTM.';
      documentOutcome = { documentId: '', status: 'FAILED', errorMessage };
    }

    return {
      success: true,
      data: serializeCompletedRtm(result, documentOutcome),
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
    await requireAuthenticatedUser();
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
