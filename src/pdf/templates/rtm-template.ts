import 'server-only';
import type { RtmPayload } from '../payload/rtm-payload';
import { formatArs, formatKg } from '@/lib/format';
import { escapeHtml, formatDateEs, formatDateTimeEs, renderLogoAndTitle, renderInfoRow, htmlDocument } from './shared';
import type { PdfRenderOptions } from '../renderer';

/**
 * Template RTM — REMITO MARGEN, uso interno (docs/PDFS.md sección 8).
 * Presenta exclusivamente los valores ya congelados en `payload.data`
 * (costo/ganancia). El saldo anterior nunca participa de la Ganancia.
 */
export function renderRtmHtml(payload: RtmPayload): string {
  const { data } = payload;

  const infoRows = [
    renderInfoRow('RTO Asociado', data.rto_code),
    renderInfoRow('Cliente/Origen', data.customer_name),
    renderInfoRow('Peso Total (kg)', `${formatKg(data.weight_kg)} kg`),
    renderInfoRow('Transporte', formatArs(data.transport_cost_ars)),
  ].filter(Boolean).join('');

  const itemRows = data.items
    .map(
      (it) => `
      <tr>
        <td class="num">${it.quantity}</td>
        <td>${escapeHtml(it.product_name)}</td>
        <td class="num">${formatArs(it.unit_sale_price_ars)}</td>
        <td class="num">${formatArs(it.line_sale_total_ars)}</td>
        <td class="num">${formatArs(it.unit_cost_ars)}</td>
        <td class="num">${formatArs(it.line_cost_total_ars)}</td>
      </tr>`
    )
    .join('');

  const body = `
    ${renderLogoAndTitle('REMITO MARGEN', payload.document_code, formatDateEs(payload.business_date), 'USO INTERNO')}
    <div class="info-grid">${infoRows}</div>
    <table class="items rtm">
      <thead>
        <tr>
          <th class="num">Cant.</th>
          <th>Producto</th>
          <th class="num">PU Venta</th>
          <th class="num">PT Venta</th>
          <th class="num">Costo Unit.</th>
          <th class="num">Costo Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <div class="totals">
      <div class="totals-row">
        <span>Total Pedido</span>
        <span>${formatArs(data.total_order_ars)}</span>
      </div>
      <div class="totals-row">
        <span>Costo Productos</span>
        <span>${formatArs(data.products_cost_total_ars)}</span>
      </div>
      <div class="totals-row">
        <span>Transporte</span>
        <span>${formatArs(data.transport_cost_ars)}</span>
      </div>
    </div>
    <div class="gain-box">
      <span class="label">GANANCIA</span>
      <span class="value">${formatArs(data.gain_ars)}</span>
    </div>
  `;

  return htmlDocument(`REMITO MARGEN ${payload.document_code}`, body);
}

export function buildRtmPdfRenderOptions(payload: RtmPayload): PdfRenderOptions {
  return {
    compactHeaderText: `REMITO MARGEN ${payload.document_code} — USO INTERNO`,
    footerText: `${payload.document_code} — Generado ${formatDateTimeEs(payload.generated_at)}`,
  };
}
