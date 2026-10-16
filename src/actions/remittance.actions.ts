'use server';

import { requireAuthenticatedUser } from '@/auth/guard';
import { revalidatePath } from 'next/cache';
import { getRemittanceService, getDocumentService } from '@/services/composition';
import {
  ConfirmedRemittanceDTO,
  RemittanceDetailDTO,
  PendingRtmBannerDTO,
  RtoPreviewDTO,
  MonthlySaleDTO,
  serializeConfirmedRemittance,
  serializeRemittance,
  serializePendingRtmBanner,
  serializeRtoPreview,
  serializeMonthlySale,
} from './remittance.dto';
import type { DocumentGenerationOutcome } from '@/services/document.service';

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function confirmOrderToRemittanceAction(
  orderId: string,
  businessDate?: string
): Promise<ActionResponse<ConfirmedRemittanceDTO>> {
  try {
    await requireAuthenticatedUser();
    const service = getRemittanceService();
    const result = await service.confirmOrderToRemittance(orderId, businessDate);

    // Revalidar rutas afectadas por la venta y movimiento de stock/patrimonio
    revalidatePath('/pedidos');
    revalidatePath('/stock');
    revalidatePath('/clientes');
    revalidatePath('/administracion');
    revalidatePath('/movimientos');
    revalidatePath('/');

    // Generación del PDF del RTO: SIEMPRE después del commit comercial, nunca
    // dentro de la transacción atómica. Un fallo de PDF nunca revierte la venta
    // ya confirmada (businessSuccess=true se mantiene aunque el documento falle).
    let documentOutcome: DocumentGenerationOutcome;
    try {
      documentOutcome = await getDocumentService().ensureRtoDocument(result.remittanceId);
    } catch (docErr: unknown) {
      const errorMessage = docErr instanceof Error && docErr.message ? docErr.message : 'Error generando el PDF del RTO.';
      documentOutcome = { documentId: '', status: 'FAILED', errorMessage };
    }

    return {
      success: true,
      data: serializeConfirmedRemittance(result, documentOutcome),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al confirmar remito de venta.',
    };
  }
}

export async function getPendingRtmRemittanceAction(): Promise<ActionResponse<PendingRtmBannerDTO | null>> {
  try {
    await requireAuthenticatedUser();
    const service = getRemittanceService();
    const pending = await service.getPendingRtmRemittance();

    return {
      success: true,
      data: pending ? serializePendingRtmBanner(pending) : null,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al consultar remito con RTM pendiente.',
    };
  }
}

export async function getRemittanceDetailAction(
  remittanceId: string
): Promise<ActionResponse<RemittanceDetailDTO | null>> {
  try {
    await requireAuthenticatedUser();
    const service = getRemittanceService();
    const remittance = await service.getRemittanceById(remittanceId);

    return {
      success: true,
      data: remittance ? serializeRemittance(remittance) : null,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al consultar detalle del remito.',
    };
  }
}

export async function getRemittanceByOrderIdAction(
  orderId: string
): Promise<ActionResponse<RemittanceDetailDTO | null>> {
  try {
    await requireAuthenticatedUser();
    const service = getRemittanceService();
    const remittance = await service.getRemittanceByOrderId(orderId);

    return {
      success: true,
      data: remittance ? serializeRemittance(remittance) : null,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al consultar remito por pedido.',
    };
  }
}

export async function previewRtoAction(
  orderId: string,
  agOverrides?: Record<string, number>
): Promise<ActionResponse<RtoPreviewDTO>> {
  try {
    await requireAuthenticatedUser();
    const service = getRemittanceService();
    const preview = await service.previewRto(orderId, agOverrides);

    return {
      success: true,
      data: serializeRtoPreview(preview),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al calcular previsualización del remito.',
    };
  }
}

export async function getMonthlySalesAction(
  year: number,
  month: number
): Promise<ActionResponse<MonthlySaleDTO[]>> {
  try {
    await requireAuthenticatedUser();
    const service = getRemittanceService();
    const sales = await service.listCompletedSalesForMonth(year, month);

    return {
      success: true,
      data: sales.map(serializeMonthlySale),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Error al consultar ventas del mes.',
    };
  }
}
