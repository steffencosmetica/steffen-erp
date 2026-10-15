import { BaseSupabaseRepository } from './base.repository';
import { DomainError } from '@/domain/errors';
import type { DocumentType, RendererType, GenerationStatus } from '@/database/domain-types';
import type { Json, Tables } from '@/database/types';

type GeneratedDocumentRow = Tables<'generated_documents'>;

/** JSON no nulo, tal como lo admite la columna `payload_snapshot JSONB NOT NULL`. */
export type PayloadSnapshot = NonNullable<Json>;

const DOCUMENT_TYPES: readonly string[] = ['RTO', 'RTM', 'CUSTOMER_ACCOUNT_STATEMENT', 'SUPPLIER_ACCOUNT_STATEMENT'];
const RENDERER_TYPES: readonly string[] = ['INTERNAL_HTML_PDF', 'N8N_WEBHOOK'];
const GENERATION_STATUSES: readonly string[] = ['PENDING', 'READY', 'FAILED'];

function isDocumentType(value: string): value is DocumentType {
  return DOCUMENT_TYPES.includes(value);
}

function isRendererType(value: string): value is RendererType {
  return RENDERER_TYPES.includes(value);
}

function isGenerationStatus(value: string): value is GenerationStatus {
  return GENERATION_STATUSES.includes(value);
}

export const GENERATED_DOCUMENTS_BUCKET = 'generated-documents';
export const SIGNED_URL_EXPIRES_IN_SECONDS = 300;

export interface GeneratedDocumentRecord {
  id: string;
  documentType: DocumentType;
  sourceType: string;
  sourceId: string;
  rendererType: RendererType;
  templateKey: string;
  templateVersion: string;
  payloadSnapshot: PayloadSnapshot;
  generationStatus: GenerationStatus;
  fileReference: string | null;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  attemptCount: number;
  generatedAt: string | null;
  createdAt: string;
}

export interface InsertPendingDocumentInput {
  documentType: DocumentType;
  sourceType: string;
  sourceId: string;
  rendererType: RendererType;
  templateKey: string;
  templateVersion: string;
  payloadSnapshot: PayloadSnapshot;
}

export interface IDocumentRepository {
  findBySourceAndTemplate(
    sourceType: string,
    sourceId: string,
    templateKey: string,
    templateVersion: string
  ): Promise<GeneratedDocumentRecord | null>;
  insertPending(input: InsertPendingDocumentInput): Promise<GeneratedDocumentRecord>;
  getById(id: string): Promise<GeneratedDocumentRecord | null>;
  findLatestReadyBySource(sourceType: string, sourceId: string): Promise<GeneratedDocumentRecord | null>;
  findLatestBySource(sourceType: string, sourceId: string): Promise<GeneratedDocumentRecord | null>;
  listStatusesBySourceIds(sourceType: string, sourceIds: string[]): Promise<Map<string, GenerationStatus>>;
  markReady(id: string, fileReference: string, fileSizeBytes: number): Promise<GeneratedDocumentRecord>;
  markFailed(id: string, errorMessage: string): Promise<GeneratedDocumentRecord>;
  incrementAttemptCount(id: string): Promise<GeneratedDocumentRecord>;
  uploadPdf(path: string, bytes: Buffer): Promise<void>;
  createSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(path: string): Promise<void>;
}

export class DocumentRepository extends BaseSupabaseRepository implements IDocumentRepository {
  async findBySourceAndTemplate(
    sourceType: string,
    sourceId: string,
    templateKey: string,
    templateVersion: string
  ): Promise<GeneratedDocumentRecord | null> {
    const { data, error } = await this.client
      .from('generated_documents')
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('template_key', templateKey)
      .eq('template_version', templateVersion)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error buscando documento generado (${sourceType}/${sourceId}): ${error.message}`);
    }
    if (!data) return null;
    return this.mapRecord(data);
  }

  async insertPending(input: InsertPendingDocumentInput): Promise<GeneratedDocumentRecord> {
    const { data, error } = await this.client
      .from('generated_documents')
      .insert({
        document_type: input.documentType,
        source_type: input.sourceType,
        source_id: input.sourceId,
        renderer_type: input.rendererType,
        template_key: input.templateKey,
        template_version: input.templateVersion,
        payload_snapshot: input.payloadSnapshot,
        generation_status: 'PENDING',
        attempt_count: 1,
      })
      .select('*')
      .single();

    if (error) {
      // Carrera de idempotencia: otro proceso ya insertó la misma clave
      // (source_type, source_id, template_key, template_version). Nunca
      // duplicar: devolver el registro existente.
      if (error.code === '23505') {
        const existing = await this.findBySourceAndTemplate(
          input.sourceType,
          input.sourceId,
          input.templateKey,
          input.templateVersion
        );
        if (existing) return existing;
      }
      throw new DomainError(`Error creando documento generado (${input.sourceType}/${input.sourceId}): ${error.message}`);
    }

    return this.mapRecord(data);
  }

  async getById(id: string): Promise<GeneratedDocumentRecord | null> {
    const { data, error } = await this.client
      .from('generated_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error obteniendo documento generado ${id}: ${error.message}`);
    }
    if (!data) return null;
    return this.mapRecord(data);
  }

  async findLatestReadyBySource(sourceType: string, sourceId: string): Promise<GeneratedDocumentRecord | null> {
    const { data, error } = await this.client
      .from('generated_documents')
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('generation_status', 'READY')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error buscando documento READY (${sourceType}/${sourceId}): ${error.message}`);
    }
    if (!data) return null;
    return this.mapRecord(data);
  }

  async findLatestBySource(sourceType: string, sourceId: string): Promise<GeneratedDocumentRecord | null> {
    const { data, error } = await this.client
      .from('generated_documents')
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error buscando documento (${sourceType}/${sourceId}): ${error.message}`);
    }
    if (!data) return null;
    return this.mapRecord(data);
  }

  async listStatusesBySourceIds(sourceType: string, sourceIds: string[]): Promise<Map<string, GenerationStatus>> {
    const map = new Map<string, GenerationStatus>();
    if (sourceIds.length === 0) return map;

    const { data, error } = await this.client
      .from('generated_documents')
      .select('source_id, generation_status, created_at')
      .eq('source_type', sourceType)
      .in('source_id', sourceIds)
      .order('created_at', { ascending: false });

    if (error) {
      throw new DomainError(`Error listando estados de documentos (${sourceType}): ${error.message}`);
    }

    for (const row of data || []) {
      if (!map.has(row.source_id)) {
        map.set(row.source_id, this.parseGenerationStatus(row.generation_status, row.source_id));
      }
    }
    return map;
  }

  async markReady(id: string, fileReference: string, fileSizeBytes: number): Promise<GeneratedDocumentRecord> {
    const { data, error } = await this.client
      .from('generated_documents')
      .update({
        generation_status: 'READY',
        file_reference: fileReference,
        file_size_bytes: fileSizeBytes,
        error_message: null,
        generated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new DomainError(`Error marcando documento ${id} como READY: ${error.message}`);
    }
    return this.mapRecord(data);
  }

  async markFailed(id: string, errorMessage: string): Promise<GeneratedDocumentRecord> {
    const { data, error } = await this.client
      .from('generated_documents')
      .update({
        generation_status: 'FAILED',
        error_message: errorMessage,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new DomainError(`Error marcando documento ${id} como FAILED: ${error.message}`);
    }
    return this.mapRecord(data);
  }

  async incrementAttemptCount(id: string): Promise<GeneratedDocumentRecord> {
    const current = await this.getById(id);
    if (!current) {
      throw new DomainError(`Documento generado ${id} no encontrado para reintento.`);
    }

    const { data, error } = await this.client
      .from('generated_documents')
      .update({ attempt_count: current.attemptCount + 1 })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new DomainError(`Error incrementando intento del documento ${id}: ${error.message}`);
    }
    return this.mapRecord(data);
  }

  async uploadPdf(path: string, bytes: Buffer): Promise<void> {
    const { error } = await this.client.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(path, bytes, { contentType: 'application/pdf', upsert: false });

    if (error) {
      throw new DomainError(`Error subiendo PDF a Storage (${path}): ${error.message}`);
    }
  }

  async createSignedUrl(path: string, expiresInSeconds: number = SIGNED_URL_EXPIRES_IN_SECONDS): Promise<string> {
    const { data, error } = await this.client.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new DomainError(`Error generando URL firmada (${path}): ${error?.message || 'sin resultado'}`);
    }
    return data.signedUrl;
  }

  async deleteObject(path: string): Promise<void> {
    const { error } = await this.client.storage.from(GENERATED_DOCUMENTS_BUCKET).remove([path]);
    if (error) {
      throw new DomainError(`Error eliminando objeto de Storage (${path}): ${error.message}`);
    }
  }

  private parseGenerationStatus(value: string, context: string): GenerationStatus {
    if (!isGenerationStatus(value)) {
      throw new DomainError(`Estado de generación desconocido "${value}" (${context}).`);
    }
    return value;
  }

  private mapRecord(row: GeneratedDocumentRow): GeneratedDocumentRecord {
    if (!isDocumentType(row.document_type)) {
      throw new DomainError(`Tipo de documento desconocido "${row.document_type}" (${row.id}).`);
    }
    if (!isRendererType(row.renderer_type)) {
      throw new DomainError(`Renderer desconocido "${row.renderer_type}" (${row.id}).`);
    }
    return {
      id: row.id,
      documentType: row.document_type,
      sourceType: row.source_type,
      sourceId: row.source_id,
      rendererType: row.renderer_type,
      templateKey: row.template_key,
      templateVersion: row.template_version,
      payloadSnapshot: row.payload_snapshot,
      generationStatus: this.parseGenerationStatus(row.generation_status, row.id),
      fileReference: row.file_reference,
      fileSizeBytes: row.file_size_bytes,
      errorMessage: row.error_message,
      attemptCount: row.attempt_count,
      generatedAt: row.generated_at,
      createdAt: row.created_at,
    };
  }
}
