import type { ViewableDocumentResult, DocumentGenerationOutcome } from '@/services/document.service';

export interface ViewableDocumentDTO {
  status: string;
  documentId?: string;
  signedUrl?: string;
  errorMessage?: string | null;
}

export function serializeViewableDocument(result: ViewableDocumentResult): ViewableDocumentDTO {
  return {
    status: result.status,
    documentId: result.documentId,
    signedUrl: result.signedUrl,
    errorMessage: result.errorMessage,
  };
}

export interface RetryDocumentDTO {
  status: string;
  documentId: string;
  errorMessage?: string | null;
}

export function serializeRetryOutcome(outcome: DocumentGenerationOutcome): RetryDocumentDTO {
  return {
    status: outcome.status,
    documentId: outcome.documentId,
    errorMessage: outcome.errorMessage,
  };
}
