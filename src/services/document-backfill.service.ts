import { DocumentRepository, IDocumentRepository } from '@/repositories/document.repository';
import { RemittanceRepository, IRemittanceRepository } from '@/repositories/remittance.repository';
import { MarginRemittanceRepository, IMarginRemittanceRepository } from '@/repositories/margin-remittance.repository';
import { DocumentDomainService, IDocumentDomainService, DocumentGenerationOutcome } from '@/services/document.service';

export interface BackfillCandidate {
  sourceId: string;
  code: string;
}

export interface DocumentBackfillReport {
  missingRto: BackfillCandidate[];
  missingRtm: BackfillCandidate[];
}

/**
 * Herramienta de backfill histórico (docs/PDFS.md sección 13.2, Fase 14
 * sección 21). Solo LEE para construir el reporte: nunca genera documentos
 * ni toca datos de negocio salvo que se invoque explícitamente `backfillOne*`
 * sobre un ID concreto, previamente revisado por el usuario.
 */
export class DocumentBackfillService {
  constructor(
    private readonly remittanceRepo: IRemittanceRepository = new RemittanceRepository(),
    private readonly marginRemittanceRepo: IMarginRemittanceRepository = new MarginRemittanceRepository(),
    private readonly documentRepo: IDocumentRepository = new DocumentRepository(),
    private readonly documentService: IDocumentDomainService = new DocumentDomainService()
  ) {}

  async reportMissingDocuments(): Promise<DocumentBackfillReport> {
    const [allRto, allRtm] = await Promise.all([
      this.remittanceRepo.listAllRemittanceCodes(),
      this.marginRemittanceRepo.listAllMarginRemittanceCodes(),
    ]);

    const [rtoDocMap, rtmDocMap] = await Promise.all([
      this.documentRepo.listStatusesBySourceIds('RTO', allRto.map((r) => r.id)),
      this.documentRepo.listStatusesBySourceIds('RTM', allRtm.map((r) => r.id)),
    ]);

    const missingRto = allRto.filter((r) => !rtoDocMap.has(r.id)).map((r) => ({ sourceId: r.id, code: r.code }));
    const missingRtm = allRtm.filter((r) => !rtmDocMap.has(r.id)).map((r) => ({ sourceId: r.id, code: r.code }));

    return { missingRto, missingRtm };
  }

  /** Genera el PDF histórico del RTO `remittanceId`, revisado previamente por el usuario. */
  async backfillOneRto(remittanceId: string): Promise<DocumentGenerationOutcome> {
    return this.documentService.ensureRtoDocument(remittanceId);
  }

  /** Genera el PDF histórico del RTM asociado al remito `remittanceId`, revisado previamente por el usuario. */
  async backfillOneRtm(remittanceId: string): Promise<DocumentGenerationOutcome> {
    return this.documentService.ensureRtmDocument(remittanceId);
  }
}
