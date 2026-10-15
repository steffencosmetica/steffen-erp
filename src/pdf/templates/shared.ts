import 'server-only';
import { renderSteffenLogoSvg } from '../logo';
import { Decimal } from '@/domain/decimal';

export const GOLD = '#D2AB68';
export const BLUE = '#0E50A0';
export const HEADER_GRAY = '#D9D9D9';

export function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Porcentaje de presentación a partir del string decimal del payload
 * ("30.0000" -> "30", "12.5000" -> "12,5"). Solo vía Decimal, nunca Number.
 */
export function formatPercentEs(value: Decimal.Value): string {
  const d = new Decimal(value);
  const [intPart, decPart = ''] = d.toFixed().split('.');
  const trimmedDec = decPart.replace(/0+$/, '');
  return trimmedDec.length > 0 ? `${intPart},${trimmedDec}` : intPart;
}

export function formatDateEs(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const datePart = isoDate.slice(0, 10);
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return escapeHtml(isoDate);
  return `${day}/${month}/${year}`;
}

export function formatDateTimeEs(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return isoDateTime;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Hoja de estilos base compartida por todos los templates de PDF. Reutiliza
 * la paleta vigente del ERP (#D2AB68 dorado — nunca #B99D22, referencia
 * obsoleta aún presente en docs/PDFS.md). Reglas de paginación: repetir
 * encabezado de tabla (`thead`, soportado nativamente por el motor de
 * impresión de Chromium), evitar cortar una fila entre páginas.
 */
export function baseStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #1a1a1a;
      background: #ffffff;
      font-size: 11px;
    }
    .page { padding: 0 18mm; }
    .doc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid ${GOLD};
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .doc-header .brand { display: flex; align-items: center; gap: 10px; }
    .doc-header .brand svg { width: 32px; height: 36px; }
    .doc-header .brand-name { font-size: 12px; color: #555; font-weight: bold; }
    .doc-header .title-block { text-align: right; }
    .doc-header .title { font-size: 20px; font-weight: bold; letter-spacing: 1px; color: #1a1a1a; }
    .doc-header .code { font-size: 13px; color: ${BLUE}; font-weight: bold; margin-top: 2px; }
    .doc-header .date { font-size: 10px; color: #555; margin-top: 2px; }
    .internal-badge {
      display: inline-block;
      background: #1a1a1a;
      color: #fff;
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 1px;
      padding: 2px 8px;
      border-radius: 2px;
      margin-top: 4px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 4px 24px;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    .info-grid .row { display: flex; border-bottom: 1px solid #eee; padding: 3px 0; }
    .info-grid .label { color: #666; width: 110px; flex-shrink: 0; }
    .info-grid .value { color: #1a1a1a; font-weight: 600; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    table.items thead th {
      background: ${HEADER_GRAY};
      color: #1a1a1a;
      font-size: 10px;
      text-transform: uppercase;
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid #bbb;
    }
    table.items.rtm thead th {
      background: #1a1a1a;
      color: #fff;
    }
    table.items th.num, table.items td.num { text-align: right; }
    table.items tbody td {
      padding: 5px 8px;
      border-bottom: 1px solid #eee;
      font-size: 10.5px;
      page-break-inside: avoid;
    }
    table.items tbody tr { page-break-inside: avoid; }
    .product-presentation { color: #777; font-size: 9px; display: block; }
    .totals {
      page-break-inside: avoid;
      margin-top: 6px;
      width: 60%;
      margin-left: auto;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid #eee;
      font-size: 11px;
    }
    .totals-row.discount { color: #a33; }
    .totals-row.final {
      border-top: 2px solid ${GOLD};
      border-bottom: none;
      font-size: 13px;
      font-weight: bold;
      margin-top: 4px;
      padding-top: 8px;
    }
    .gain-box {
      margin-top: 10px;
      padding: 10px 14px;
      background: #f6f1e7;
      border: 1px solid ${GOLD};
      border-radius: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gain-box .label { font-weight: bold; font-size: 12px; }
    .gain-box .value { font-weight: bold; font-size: 15px; color: ${BLUE}; }
  `;
}

export function renderLogoAndTitle(titleText: string, docCode: string, businessDateLabel: string, badge?: string): string {
  const logoSvg = renderSteffenLogoSvg('');
  return `
    <div class="doc-header">
      <div class="brand">
        ${logoSvg}
        <div class="brand-name">STEFFEN<br/>Cosmética Capilar</div>
      </div>
      <div class="title-block">
        <div class="title">${escapeHtml(titleText)}</div>
        <div class="code">${escapeHtml(docCode)}</div>
        <div class="date">Fecha: ${escapeHtml(businessDateLabel)}</div>
        ${badge ? `<div class="internal-badge">${escapeHtml(badge)}</div>` : ''}
      </div>
    </div>
  `;
}

export function renderInfoRow(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `
    <div class="row">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
    </div>
  `;
}

export function htmlDocument(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${baseStyles()}</style>
</head>
<body>
<div class="page">
${bodyHtml}
</div>
</body>
</html>`;
}
