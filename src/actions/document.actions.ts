'use server';

import { getDocumentService } from '@/services/composition';
import { ViewableDocumentDTO, RetryDocumentDTO, serializeViewableDocument, serializeRetryOutcome } from './document.dto';

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Obtiene el estado/URL firmada de visualización del PDF (RTO o RTM) de un
 * origen dado. Nunca renderiza: solo busca el documento READY existente y
 * genera una URL firmada de corta duración (docs/PDFS.md sección 13.1).
 */
export async function getDocumentViewAction(
  sourceType: 'RTO' | 'RTM',
  sourceId: string
): Promise<ActionResponse<ViewableDocumentDTO>> {
  try {
    const service = getDocumentService();
    const result = await service.getViewableDocument(sourceType, sourceId);
    return {
      success: true,
      data: serializeViewableDocument(result),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error && err.message ? err.message : 'Error al obtener el documento.',
    };
  }
}

/**
 * Reintenta explícitamente la generación de un documento FAILED, reutilizando
 * su payload_snapshot histórico (nunca datos actuales). Nunca duplica RTO/RTM
 * ni movimientos de negocio (docs/PDFS.md sección 13.2).
 */
export async function retryDocumentAction(documentId: string): Promise<ActionResponse<RetryDocumentDTO>> {
  try {
    const service = getDocumentService();
    const outcome = await service.retryDocument(documentId);
    return {
      success: true,
      data: serializeRetryOutcome(outcome),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error && err.message ? err.message : 'Error al reintentar la generación del documento.',
    };
  }
}
