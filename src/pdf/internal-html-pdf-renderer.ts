import 'server-only';
import puppeteer, { Browser } from 'puppeteer';
import type { PdfRenderer, PdfRenderOptions } from './renderer';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Implementación INTERNAL_HTML_PDF (docs/PDFS.md sección 2.1) usando el
 * Chromium embebido de puppeteer. Un único Browser compartido por proceso
 * (lanzado de forma perezosa) para evitar el costo de arrancar un proceso
 * Chromium por cada PDF.
 */
export class InternalHtmlPdfRenderer implements PdfRenderer {
  private browserPromise: Promise<Browser> | null = null;

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  async renderHtmlToPdf(html: string, options?: PdfRenderOptions): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });

      const headerTemplate = options?.compactHeaderText
        ? `<div style="width:100%;font-size:8px;color:#666;padding:4px 18mm 0;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(options.compactHeaderText)}</div>`
        : '<span></span>';

      const footerTemplate = options?.footerText
        ? `<div style="width:100%;font-size:8px;color:#666;padding:0 18mm 4px;font-family:Arial,Helvetica,sans-serif;display:flex;justify-content:space-between;">
            <span>${escapeHtml(options.footerText)}</span>
            <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
          </div>`
        : '<span></span>';

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '22mm', bottom: '16mm', left: '0mm', right: '0mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }
}
