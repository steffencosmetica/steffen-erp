import 'server-only';

/**
 * Abstracción de renderizado HTML -> PDF. El dominio/servicio de documentos
 * depende únicamente de este contrato, nunca de una librería concreta.
 * Permite reemplazar INTERNAL_HTML_PDF por un futuro N8N_WEBHOOK sin tocar
 * RTO/RTM/generated_documents (docs/PDFS.md, sección 2.2 y 15).
 */
/**
 * Texto de cabecera/pie compactos que se repiten en cada página. Son texto
 * plano ya resuelto por el template (nunca HTML de negocio ni cálculos): la
 * mecánica de "cómo" repetirlos y numerar páginas es responsabilidad del
 * renderer concreto (docs/PDFS.md sección 6 y 12).
 */
export interface PdfRenderOptions {
  compactHeaderText?: string;
  footerText?: string;
}

export interface PdfRenderer {
  renderHtmlToPdf(html: string, options?: PdfRenderOptions): Promise<Buffer>;
}
