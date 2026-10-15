import 'server-only';
import type { RtoPayload } from '../payload/rto-payload';
import { formatArs, formatKg } from '@/lib/format';
import { escapeHtml, formatPercentEs, formatDateEs, formatDateTimeEs, renderLogoAndTitle, renderInfoRow, htmlDocument } from './shared';
import type { PdfRenderOptions } from '../renderer';

/**
 * Template RTO — REMITO (docs/PDFS.md sección 7). Presenta exclusivamente
 * los valores ya congelados en `payload.data`; no recalcula nada.
 */
export function renderRtoHtml(payload: RtoPayload): string {
  const { data } = payload;

  const infoRows = [
    renderInfoRow('Cliente/Origen', translateCustomerSource(data.customer_source)),
    renderInfoRow('Código Cliente', data.customer_code),
    renderInfoRow('Destinatario', data.customer_name),
    renderInfoRow('Domicilio', data.address),
    renderInfoRow('Localidad', data.locality),
    renderInfoRow('Provincia', data.province),
    renderInfoRow('Teléfono', data.phone),
    renderInfoRow('Transporte', data.transport_name),
    renderInfoRow('Dirección Transporte', data.transport_address),
    renderInfoRow('Cantidad de Bultos', data.package_count),
    renderInfoRow('Peso Total (kg)', `${formatKg(data.weight_kg)} kg`),
  ].filter(Boolean).join('');

  const itemRows = data.items
    .map(
      (it) => `
      <tr>
        <td class="num">${it.quantity}</td>
        <td>${escapeHtml(it.product_name)}${it.presentation ? `<span class="product-presentation">${escapeHtml(it.presentation)}</span>` : ''}</td>
        <td class="num">${formatArs(it.unit_price_ars)}</td>
        <td class="num">${formatArs(it.line_total_ars)}</td>
      </tr>`
    )
    .join('');

  const discountRows = data.discounts
    .map(
      (ds) => `
      <div class="totals-row discount">
        <span>Descuento ${ds.position} (${formatPercentEs(ds.percent)}%)</span>
        <span>- ${formatArs(ds.amount_ars)}</span>
      </div>`
    )
    .join('');

  const body = `
    ${renderLogoAndTitle('REMITO', payload.document_code, formatDateEs(payload.business_date))}
    <div class="info-grid">${infoRows}</div>
    <table class="items rto">
      <thead>
        <tr>
          <th class="num">Cant.</th>
          <th>Producto</th>
          <th class="num">PU</th>
          <th class="num">PT</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${formatArs(data.subtotal_ars)}</span>
      </div>
      ${discountRows}
      <div class="totals-row final">
        <span>Total Pedido</span>
        <span>${formatArs(data.total_order_ars)}</span>
      </div>
      <div class="totals-row">
        <span>Saldo Anterior</span>
        <span>${formatArs(data.prior_balance_ars)}</span>
      </div>
      <div class="totals-row final">
        <span>Total a Cobrar</span>
        <span>${formatArs(data.total_to_collect_ars)}</span>
      </div>
    </div>
  `;

  return htmlDocument(`REMITO ${payload.document_code}`, body);
}

export function buildRtoPdfRenderOptions(payload: RtoPayload): PdfRenderOptions {
  return {
    compactHeaderText: `REMITO ${payload.document_code} — ${payload.issuer.name}`,
    footerText: `${payload.document_code} — Generado ${formatDateTimeEs(payload.generated_at)}`,
  };
}

function translateCustomerSource(source: string): string {
  switch (source) {
    case 'REGISTERED_CUSTOMER':
      return 'Cliente Registrado';
    case 'MERCADO_LIBRE':
      return 'Mercado Libre';
    case 'CONSUMER_FINAL':
      return 'Consumidor Final';
    default:
      return source;
  }
}
