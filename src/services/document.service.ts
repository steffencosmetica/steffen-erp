import { DocumentRepository, IDocumentRepository, GeneratedDocumentRecord } from '@/repositories/document.repository';
import { RemittanceRepository, IRemittanceRepository } from '@/repositories/remittance.repository';
import { MarginRemittanceRepository, IMarginRemittanceRepository } from '@/repositories/margin-remittance.repository';
import { CustomerRepository } from '@/repositories/customer.repository';
import { DomainError } from '@/domain/errors';
import type { DocumentType, GenerationStatus } from '@/database/domain-types';
import type { PdfRenderer, PdfRenderOptions } from '@/pdf/renderer';
import { InternalHtmlPdfRenderer } from '@/pdf/internal-html-pdf-renderer';
import { buildRtoPayload, isRtoPayload } from '@/pdf/payload/rto-payload';
import { buildRtmPayload, isRtmPayload } from '@/pdf/payload/rtm-payload';
import { renderRtoHtml, buildRtoPdfRenderOptions } from '@/pdf/templates/rto-template';
import { renderRtmHtml, buildRtmPdfRenderOptions } from '@/pdf/templates/rtm-template';
import { RTO_TEMPLATE_KEY, RTO_TEMPLATE_VERSION, RTM_TEMPLATE_KEY, RTM_TEMPLATE_VERSION } from '@/pdf/payload/shared';

export interface DocumentGenerationOutcome {
  documentId: string;
  status: GenerationStatus;
  errorMessage?: string | null;
}

export type ViewStatus = GenerationStatus | 'MISSING';

export interface ViewableDocumentResult {
  status: ViewStatus;
  documentId?: string;
  signedUrl?: string;
  errorMessage?: string | null;
}

function sanitizeErrorMessage(raw: string): string {
  const stripped = raw.replace(/:\/\/[^/\s]*:[^/\s]*@/g, '://***:***@');
  return stripped.length > 500 ? `${stripped.slice(0, 500)}...` : stripped;
}

function outcomeFromRecord(record: GeneratedDocumentRecord): DocumentGenerationOutcome {
  return { documentId: record.id, status: record.generationStatus, errorMessage: record.errorMessage };
}

export interface IDocumentDomainService {
  ensureRtoDocument(remittanceId: string): Promise<DocumentGenerationOutcome>;
  ensureRtmDocument(remittanceId: string): Promise<DocumentGenerationOutcome>;
  retryDocument(documentId: string): Promise<DocumentGenerationOutcome>;
  getViewableDocument(sourceType: 'RTO' | 'RTM', sourceId: string): Promise<ViewableDocumentResult>;
}

/**
 * Orquesta la generación/visualización/reintento de documentos PDF (RTO/RTM)
 * sobre `generated_documents` + Supabase Storage. Nunca recalcula reglas de
 * negocio: solo lee snapshots ya congelados y los presenta (docs/PDFS.md).
 * Un fallo de renderizado jamás revierte RTO/RTM/MOV/MST ya confirmados: se
 * marca FAILED y se preserva el payload para reintento explícito.
 */
export class DocumentDomainService implements IDocumentDomainService {
  constructor(
    private readonly documentRepo: IDocumentRepository = new DocumentRepository(),
    private readonly remittanceRepo: IRemittanceRepository = new RemittanceRepository(),
    private readonly marginRemittanceRepo: IMarginRemittanceRepository = new MarginRemittanceRepository(),
    private readonly customerRepo: CustomerRepository = new CustomerRepository(),
    private readonly pdfRenderer: PdfRenderer = new InternalHtmlPdfRenderer()
  ) {}

  async ensureRtoDocument(remittanceId: string): Promise<DocumentGenerationOutcome> {
    if (!remittanceId) {
      throw new DomainError('El ID del remito es obligatorio para generar el PDF del RTO.');
    }

    const existing = await this.documentRepo.findBySourceAndTemplate(
      'RTO',
      remittanceId,
      RTO_TEMPLATE_KEY,
      RTO_TEMPLATE_VERSION
    );
    if (existing) return outcomeFromRecord(existing);

    const remittance = await this.remittanceRepo.getRemittanceById(remittanceId);
    if (!remittance) {
      throw new DomainError(`Remito ${remittanceId} no encontrado para generar su PDF.`);
    }

    let customerCode: string | null = null;
    if (remittance.customerSource === 'REGISTERED_CUSTOMER' && remittance.customerId) {
      const customer = await this.customerRepo.findById(remittance.customerId);
      customerCode = customer?.code ?? null;
    }

    // business_date: la de la operación SALE_RTO, resuelta en el builder (regla única).
    const payload = buildRtoPayload({ remittance, customerCode });

    const pending = await this.documentRepo.insertPending({
      documentType: 'RTO',
      sourceType: 'RTO',
      sourceId: remittanceId,
      rendererType: 'INTERNAL_HTML_PDF',
      templateKey: RTO_TEMPLATE_KEY,
      templateVersion: RTO_TEMPLATE_VERSION,
      payloadSnapshot: payload,
    });

    if (pending.generationStatus !== 'PENDING') return outcomeFromRecord(pending);

    return this.renderAndStore(pending.id, payload.document_code, 'RTO', payload, renderRtoHtml, buildRtoPdfRenderOptions);
  }

  async ensureRtmDocument(remittanceId: string): Promise<DocumentGenerationOutcome> {
    if (!remittanceId) {
      throw new DomainError('El ID del remito es obligatorio para generar el PDF del RTM.');
    }

    const marginRemittance = await this.marginRemittanceRepo.getMarginRemittanceByRemittanceId(remittanceId);
    if (!marginRemittance) {
      throw new DomainError(`No existe RTM confirmado para el remito ${remittanceId}.`);
    }

    const existing = await this.documentRepo.findBySourceAndTemplate(
      'RTM',
      marginRemittance.id,
      RTM_TEMPLATE_KEY,
      RTM_TEMPLATE_VERSION
    );
    if (existing) return outcomeFromRecord(existing);

    const remittance = await this.remittanceRepo.getRemittanceById(remittanceId);
    if (!remittance) {
      throw new DomainError(`Remito ${remittanceId} no encontrado para generar el PDF del RTM.`);
    }

    // business_date: la de la operación SALE_RTM, resuelta en el builder (regla única).
    const payload = buildRtmPayload({ marginRemittance, remittance });

    const pending = await this.documentRepo.insertPending({
      documentType: 'RTM',
      sourceType: 'RTM',
      sourceId: marginRemittance.id,
      rendererType: 'INTERNAL_HTML_PDF',
      templateKey: RTM_TEMPLATE_KEY,
      templateVersion: RTM_TEMPLATE_VERSION,
      payloadSnapshot: payload,
    });

    if (pending.generationStatus !== 'PENDING') return outcomeFromRecord(pending);

    return this.renderAndStore(pending.id, payload.document_code, 'RTM', payload, renderRtmHtml, buildRtmPdfRenderOptions);
  }

  async retryDocument(documentId: string): Promise<DocumentGenerationOutcome> {
    if (!documentId) {
      throw new DomainError('El ID del documento es obligatorio para reintentar.');
    }

    const doc = await this.documentRepo.getById(documentId);
    if (!doc) {
      throw new DomainError(`Documento generado ${documentId} no encontrado.`);
    }
    if (doc.generationStatus !== 'FAILED') {
      throw new DomainError(
        `Solo se puede reintentar un documento en estado FAILED (estado actual: ${doc.generationStatus}).`
      );
    }

    // El reintento re-renderiza el payload_snapshot histórico tal cual; si no
    // cumple el contrato vigente se rechaza (nunca se repara ni se reconstruye
    // con datos actuales) antes de consumir un intento.
    const payload = doc.payloadSnapshot;
    if (doc.documentType === 'RTO') {
      if (!isRtoPayload(payload)) {
        throw new DomainError(`El payload_snapshot del documento ${documentId} no cumple el contrato RTO.`);
      }
      await this.documentRepo.incrementAttemptCount(documentId);
      return this.renderAndStore(documentId, payload.document_code, 'RTO', payload, renderRtoHtml, buildRtoPdfRenderOptions);
    }
    if (doc.documentType === 'RTM') {
      if (!isRtmPayload(payload)) {
        throw new DomainError(`El payload_snapshot del documento ${documentId} no cumple el contrato RTM.`);
      }
      await this.documentRepo.incrementAttemptCount(documentId);
      return this.renderAndStore(documentId, payload.document_code, 'RTM', payload, renderRtmHtml, buildRtmPdfRenderOptions);
    }

    throw new DomainError(`Tipo de documento no soportado para reintento: ${doc.documentType}`);
  }

  async getViewableDocument(sourceType: 'RTO' | 'RTM', sourceId: string): Promise<ViewableDocumentResult> {
    if (!sourceId) return { status: 'MISSING' };

    const doc = await this.documentRepo.findLatestBySource(sourceType, sourceId);
    if (!doc) return { status: 'MISSING' };

    if (doc.generationStatus === 'READY' && doc.fileReference) {
      const signedUrl = await this.documentRepo.createSignedUrl(doc.fileReference);
      return { status: 'READY', documentId: doc.id, signedUrl };
    }

    return { status: doc.generationStatus, documentId: doc.id, errorMessage: doc.errorMessage };
  }

  private async renderAndStore<T extends { document_code: string }>(
    documentId: string,
    documentCode: string,
    documentType: DocumentType,
    payload: T,
    renderHtml: (payload: T) => string,
    buildOptions: (payload: T) => PdfRenderOptions
  ): Promise<DocumentGenerationOutcome> {
    try {
      const html = renderHtml(payload);
      const options = buildOptions(payload);
      const pdfBytes = await this.pdfRenderer.renderHtmlToPdf(html, options);
      const path = `${documentType}/${documentCode}/${documentId}.pdf`;
      await this.documentRepo.uploadPdf(path, pdfBytes);
      const ready = await this.documentRepo.markReady(documentId, path, pdfBytes.length);
      return outcomeFromRecord(ready);
    } catch (err: unknown) {
      const raw = err instanceof Error && err.message ? err.message : 'Error desconocido generando el PDF.';
      const message = sanitizeErrorMessage(raw);
      const failed = await this.documentRepo.markFailed(documentId, message);
      return outcomeFromRecord(failed);
    }
  }
}
