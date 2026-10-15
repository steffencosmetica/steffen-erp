import './helpers/allow-server-only';
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Decimal } from '../src/domain/decimal';
import { DomainError } from '../src/domain/errors';
import type { Database } from '../src/database/types';
import type { GenerationStatus } from '../src/database/domain-types';
import {
  DocumentRepository,
  GENERATED_DOCUMENTS_BUCKET,
  type IDocumentRepository,
  type GeneratedDocumentRecord,
  type InsertPendingDocumentInput,
} from '../src/repositories/document.repository';
import {
  RemittanceRepository,
  type IRemittanceRepository,
  type RemittanceRecord,
  type MonthlySaleRecord,
} from '../src/repositories/remittance.repository';
import {
  MarginRemittanceRepository,
  type IMarginRemittanceRepository,
  type MarginRemittanceRecord,
} from '../src/repositories/margin-remittance.repository';
import { CustomerRepository } from '../src/repositories/customer.repository';
import type { IOrderRepository } from '../src/repositories/order.repository';
import type { IStockRepository } from '../src/repositories/stock.repository';
import type { ICostEngineService } from '../src/services/cost-engine.service';
import type { PdfRenderer, PdfRenderOptions } from '../src/pdf/renderer';
import { DocumentDomainService, type IDocumentDomainService } from '../src/services/document.service';
import { DocumentBackfillService } from '../src/services/document-backfill.service';
import { RemittanceDomainService } from '../src/services/remittance.service';
import { buildRtoPayload, isRtoPayload, type RtoPayload } from '../src/pdf/payload/rto-payload';
import { buildRtmPayload, isRtmPayload, type RtmPayload } from '../src/pdf/payload/rtm-payload';
import { RTO_TEMPLATE_KEY, RTO_TEMPLATE_VERSION, RTM_TEMPLATE_KEY, RTM_TEMPLATE_VERSION } from '../src/pdf/payload/shared';
import { renderRtoHtml, buildRtoPdfRenderOptions } from '../src/pdf/templates/rto-template';
import { renderRtmHtml } from '../src/pdf/templates/rtm-template';
import { InternalHtmlPdfRenderer } from '../src/pdf/internal-html-pdf-renderer';
import { readSaleBusinessDate } from '../src/repositories/business-operation-date';

function asRtoPayload(value: unknown): RtoPayload {
  if (!isRtoPayload(value)) throw new assert.AssertionError({ message: 'payload_snapshot no cumple el contrato RTO' });
  return value;
}

function asRtmPayload(value: unknown): RtmPayload {
  if (!isRtmPayload(value)) throw new assert.AssertionError({ message: 'payload_snapshot no cumple el contrato RTM' });
  return value;
}

// ------------------------------------------------------------------------------
// Fixtures en memoria (sin DB): snapshots congelados de un RTO/RTM
// ------------------------------------------------------------------------------

const RTO_ID = randomUUID();
const RTM_ID = randomUUID();
const PRODUCT_A = randomUUID();
const PRODUCT_B = randomUUID();
const CUSTOMER_ID = randomUUID();

function makeRemittance(overrides: Partial<RemittanceRecord> = {}): RemittanceRecord {
  return {
    id: RTO_ID,
    code: 'RTO9001',
    operationId: randomUUID(),
    orderId: randomUUID(),
    status: 'COMPLETED',
    customerSource: 'REGISTERED_CUSTOMER',
    customerId: CUSTOMER_ID,
    customerDisplayName: 'Cliente <b>Prueba</b> & Cía',
    recipientNameSnapshot: null,
    addressSnapshot: 'Calle 123',
    localitySnapshot: 'Rosario',
    provinceSnapshot: 'Santa Fe',
    phoneSnapshot: '341-555',
    transportNameSnapshot: 'Transporte Sur',
    transportAddressSnapshot: 'Ruta 9',
    packageCountSnapshot: 4,
    weightKgSnapshot: new Decimal('0.350'),
    subtotalArs: new Decimal('60000'),
    totalOrderArs: new Decimal('42000'),
    priorBalanceSnapshotArs: new Decimal('10000'),
    totalToCollectArs: new Decimal('52000'),
    businessDate: '2026-10-01',
    createdAt: '2026-10-01T17:30:00.000Z',
    items: [
      {
        id: randomUUID(),
        remittanceId: RTO_ID,
        productId: PRODUCT_A,
        productCodeSnapshot: 'PRO0001',
        productNameSnapshot: 'Shampoo Test',
        presentationSnapshot: '350 cc',
        weightKgSnapshot: new Decimal('0.35'),
        quantitySent: 10,
        unitPriceArsSnapshot: new Decimal('5000'),
        lineTotalArs: new Decimal('50000'),
      },
      {
        id: randomUUID(),
        remittanceId: RTO_ID,
        productId: PRODUCT_B,
        productCodeSnapshot: 'PRO0002',
        productNameSnapshot: 'Acondicionador Test',
        presentationSnapshot: '1000 cc',
        weightKgSnapshot: new Decimal('1'),
        quantitySent: 2,
        unitPriceArsSnapshot: new Decimal('5000'),
        lineTotalArs: new Decimal('10000'),
      },
    ],
    discountSteps: [
      { id: randomUUID(), remittanceId: RTO_ID, position: 1, percent: new Decimal('30'), amountArsSnapshot: new Decimal('18000') },
    ],
    ...overrides,
  };
}

function makeMarginRemittance(overrides: Partial<MarginRemittanceRecord> = {}): MarginRemittanceRecord {
  return {
    id: RTM_ID,
    code: 'RTM9001',
    operationId: randomUUID(),
    remittanceId: RTO_ID,
    productsCostTotalArs: new Decimal('25004.56789'),
    transportCostArs: new Decimal('3000'),
    gainArs: new Decimal('13995.43211'),
    businessDate: '2026-10-02',
    createdAt: '2026-10-02T15:00:00.000Z',
    items: [
      {
        id: randomUUID(),
        marginRemittanceId: RTM_ID,
        productId: PRODUCT_A,
        quantitySent: 10,
        unitCostTheoreticalSnapshotArs: new Decimal('2000.456789'),
        totalCostSnapshotArs: new Decimal('20004.56789'),
      },
      {
        id: randomUUID(),
        marginRemittanceId: RTM_ID,
        productId: PRODUCT_B,
        quantitySent: 2,
        unitCostTheoreticalSnapshotArs: new Decimal('2500'),
        totalCostSnapshotArs: new Decimal('5000'),
      },
    ],
    ...overrides,
  };
}

class InMemoryDocumentRepository implements IDocumentRepository {
  readonly records = new Map<string, GeneratedDocumentRecord>();
  readonly uploads = new Map<string, Buffer>();
  readonly signedUrlRequests: string[] = [];
  private seq = 0;

  async findBySourceAndTemplate(sourceType: string, sourceId: string, templateKey: string, templateVersion: string) {
    for (const r of this.records.values()) {
      if (r.sourceType === sourceType && r.sourceId === sourceId && r.templateKey === templateKey && r.templateVersion === templateVersion) {
        return { ...r };
      }
    }
    return null;
  }

  async insertPending(input: InsertPendingDocumentInput): Promise<GeneratedDocumentRecord> {
    const existing = await this.findBySourceAndTemplate(input.sourceType, input.sourceId, input.templateKey, input.templateVersion);
    if (existing) return existing;
    const record: GeneratedDocumentRecord = {
      id: randomUUID(),
      ...input,
      payloadSnapshot: structuredClone(input.payloadSnapshot),
      generationStatus: 'PENDING',
      fileReference: null,
      fileSizeBytes: null,
      errorMessage: null,
      attemptCount: 1,
      generatedAt: null,
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.seq++)).toISOString(),
    };
    this.records.set(record.id, record);
    return { ...record };
  }

  async getById(id: string) {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }

  async findLatestReadyBySource(sourceType: string, sourceId: string) {
    const all = [...this.records.values()]
      .filter((r) => r.sourceType === sourceType && r.sourceId === sourceId && r.generationStatus === 'READY')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all[0] ? { ...all[0] } : null;
  }

  async findLatestBySource(sourceType: string, sourceId: string) {
    const all = [...this.records.values()]
      .filter((r) => r.sourceType === sourceType && r.sourceId === sourceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all[0] ? { ...all[0] } : null;
  }

  async listStatusesBySourceIds(sourceType: string, sourceIds: string[]) {
    const map = new Map<string, GenerationStatus>();
    for (const id of sourceIds) {
      const latest = await this.findLatestBySource(sourceType, id);
      if (latest) map.set(id, latest.generationStatus);
    }
    return map;
  }

  async markReady(id: string, fileReference: string, fileSizeBytes: number) {
    const r = this.mustGet(id);
    Object.assign(r, { generationStatus: 'READY', fileReference, fileSizeBytes, errorMessage: null, generatedAt: new Date().toISOString() });
    return { ...r };
  }

  async markFailed(id: string, errorMessage: string) {
    const r = this.mustGet(id);
    Object.assign(r, { generationStatus: 'FAILED', errorMessage });
    return { ...r };
  }

  async incrementAttemptCount(id: string) {
    const r = this.mustGet(id);
    r.attemptCount += 1;
    return { ...r };
  }

  async uploadPdf(objectPath: string, bytes: Buffer) {
    if (this.uploads.has(objectPath)) throw new DomainError(`Objeto ya existente: ${objectPath}`);
    this.uploads.set(objectPath, bytes);
  }

  async createSignedUrl(objectPath: string) {
    this.signedUrlRequests.push(objectPath);
    return `https://signed.example/${objectPath}?token=t`;
  }

  async deleteObject(objectPath: string) {
    this.uploads.delete(objectPath);
  }

  private mustGet(id: string): GeneratedDocumentRecord {
    const r = this.records.get(id);
    if (!r) throw new DomainError(`No existe ${id}`);
    return r;
  }
}

class FakeRenderer implements PdfRenderer {
  calls: { html: string; options?: PdfRenderOptions }[] = [];
  failWith: Error | null = null;

  async renderHtmlToPdf(html: string, options?: PdfRenderOptions): Promise<Buffer> {
    this.calls.push({ html, options });
    if (this.failWith) throw this.failWith;
    return Buffer.from(`%PDF-1.4 fake ${this.calls.length}`);
  }
}

interface Harness {
  service: DocumentDomainService;
  docRepo: InMemoryDocumentRepository;
  renderer: FakeRenderer;
  state: { remittance: RemittanceRecord; marginRemittance: MarginRemittanceRecord | null };
  reads: { remittance: number; marginRemittance: number };
}

function makeHarness(): Harness {
  const state: Harness['state'] = { remittance: makeRemittance(), marginRemittance: makeMarginRemittance() };
  const reads: Harness['reads'] = { remittance: 0, marginRemittance: 0 };
  const docRepo = new InMemoryDocumentRepository();
  const renderer = new FakeRenderer();

  const remittanceRepo = {
    getRemittanceById: async (id: string) => {
      reads.remittance++;
      return id === state.remittance.id ? state.remittance : null;
    },
  } as unknown as IRemittanceRepository;
  const marginRemittanceRepo = {
    getMarginRemittanceByRemittanceId: async (id: string) => {
      reads.marginRemittance++;
      return state.marginRemittance && state.marginRemittance.remittanceId === id ? state.marginRemittance : null;
    },
  } as unknown as IMarginRemittanceRepository;
  const customerRepo = {
    findById: async (id: string) => (id === CUSTOMER_ID ? { id, code: 'CLI0042' } : null),
  } as unknown as CustomerRepository;

  const service = new DocumentDomainService(docRepo, remittanceRepo, marginRemittanceRepo, customerRepo, renderer);
  return { service, docRepo, renderer, state, reads };
}

// ==============================================================================
// 1. Payloads y templates (puros)
// ==============================================================================

test('FASE 14 — PDFs: payloads y templates', async (t) => {
  await t.test('1. Payload RTO respeta el contrato de PDFS.md §3/§7.5 y usa solo snapshots', () => {
    const payload = buildRtoPayload({
      remittance: makeRemittance(),
      customerCode: 'CLI0042',
      generatedAt: '2026-10-01T14:30:00-03:00',
    });

    assert.strictEqual(payload.schema_version, '1.0');
    assert.strictEqual(payload.document_type, 'RTO');
    assert.strictEqual(payload.document_id, RTO_ID);
    assert.strictEqual(payload.document_code, 'RTO9001');
    assert.strictEqual(payload.business_date, '2026-10-01');
    assert.strictEqual(payload.template_key, RTO_TEMPLATE_KEY);
    assert.strictEqual(payload.template_version, RTO_TEMPLATE_VERSION);
    assert.deepStrictEqual(payload.issuer, { name: 'Steffen Cosmética Capilar', logo_ref: 'steffen-logo' });

    assert.strictEqual(payload.data.customer_code, 'CLI0042');
    assert.strictEqual(payload.data.weight_kg, '0.350');
    assert.deepStrictEqual(payload.data.items[0], {
      quantity: 10, // AG confirmado (quantity_sent), nunca requested_quantity
      product_code: 'PRO0001',
      product_name: 'Shampoo Test',
      presentation: '350 cc',
      unit_price_ars: '5000', // unit_price_ars_snapshot NUMERIC(20,0)
      line_total_ars: '50000.000000',
    });
    assert.deepStrictEqual(payload.data.discounts, [{ position: 1, percent: '30.0000', amount_ars: '18000.000000' }]);
    assert.strictEqual(payload.data.subtotal_ars, '60000.000000');
    assert.strictEqual(payload.data.total_order_ars, '42000.000000');
    assert.strictEqual(payload.data.prior_balance_ars, '10000.000000');
    assert.strictEqual(payload.data.total_to_collect_ars, '52000.000000');
    assert.ok(isRtoPayload(payload), 'El payload construido debe cumplir su propio contrato');
  });

  await t.test('2. Payload RTO rechaza un remito sin ítems', () => {
    assert.throws(
      () => buildRtoPayload({ remittance: makeRemittance({ items: [] }), customerCode: null }),
      DomainError
    );
  });

  await t.test('3. Payload RTM cruza costo (RTM) con venta (RTO) por producto y excluye saldo anterior', () => {
    const payload = buildRtmPayload({
      marginRemittance: makeMarginRemittance(),
      remittance: makeRemittance(),
    });

    assert.strictEqual(payload.document_type, 'RTM');
    assert.strictEqual(payload.document_id, RTM_ID);
    assert.strictEqual(payload.document_code, 'RTM9001');
    assert.strictEqual(payload.template_key, RTM_TEMPLATE_KEY);
    assert.strictEqual(payload.template_version, RTM_TEMPLATE_VERSION);
    assert.strictEqual(payload.data.internal_use, true);
    assert.strictEqual(payload.data.rto_code, 'RTO9001');
    assert.deepStrictEqual(payload.data.items[0], {
      quantity: 10,
      product_code: 'PRO0001',
      product_name: 'Shampoo Test',
      unit_sale_price_ars: '5000',
      line_sale_total_ars: '50000.000000',
      unit_cost_ars: '2000.456789',
      line_cost_total_ars: '20004.567890',
    });
    assert.strictEqual(payload.data.weight_kg, '0.350');
    assert.strictEqual(payload.data.total_order_ars, '42000.000000');
    assert.strictEqual(payload.data.products_cost_total_ars, '25004.567890');
    assert.strictEqual(payload.data.transport_cost_ars, '3000.000000');
    assert.strictEqual(payload.data.gain_ars, '13995.432110');
    assert.ok(!('prior_balance_ars' in payload.data), 'El RTM nunca debe incluir saldo anterior');
    assert.ok(isRtmPayload(payload), 'El payload construido debe cumplir su propio contrato');
  });

  await t.test('4. Payload RTM rechaza RTO ajeno o producto sin línea de venta', () => {
    assert.throws(
      () =>
        buildRtmPayload({
          marginRemittance: makeMarginRemittance({ remittanceId: randomUUID() }),
          remittance: makeRemittance(),
        }),
      DomainError
    );

    const rtm = makeMarginRemittance();
    rtm.items[1] = { ...rtm.items[1], productId: randomUUID() };
    assert.throws(() => buildRtmPayload({ marginRemittance: rtm, remittance: makeRemittance() }), DomainError);
  });

  await t.test('5. Template RTO: título, código, columnas y escape de HTML', () => {
    const payload = buildRtoPayload({ remittance: makeRemittance(), customerCode: 'CLI0042' });
    const html = renderRtoHtml(payload);

    assert.ok(html.includes('REMITO'));
    assert.ok(html.includes('RTO9001'));
    for (const col of ['Cant.', 'Producto', 'PU', 'PT', 'Subtotal', 'Total Pedido', 'Saldo Anterior', 'Total a Cobrar']) {
      assert.ok(html.includes(col), `Falta "${col}" en el RTO`);
    }
    assert.ok(!html.includes('<b>Prueba</b>'), 'El nombre de cliente debe escaparse');
    assert.ok(html.includes('&lt;b&gt;Prueba&lt;/b&gt;'));
    assert.ok(!html.includes('USO INTERNO'));
    assert.ok(/<svg[^>]*aria-label="Steffen Logo"[^>]*>(<path [^>]*fill="#D2AB68"><\/path>){3}<\/svg>/.test(html), 'El logo SVG debe embeberse inline');

    const options = buildRtoPdfRenderOptions(payload);
    assert.ok(options.compactHeaderText?.includes('RTO9001'));
    assert.ok(options.footerText?.includes('RTO9001'));
  });

  await t.test('6. Template RTM: USO INTERNO, columnas de costo, Ganancia y sin saldo anterior', () => {
    const payload = buildRtmPayload({ marginRemittance: makeMarginRemittance(), remittance: makeRemittance() });
    const html = renderRtmHtml(payload);

    assert.ok(html.includes('REMITO MARGEN'));
    assert.ok(html.includes('USO INTERNO'));
    assert.ok(html.includes('RTM9001'));
    assert.ok(html.includes('RTO9001'));
    for (const col of ['PU Venta', 'PT Venta', 'Costo Unit.', 'Costo Total', 'Costo Productos', 'Transporte', 'GANANCIA']) {
      assert.ok(html.includes(col), `Falta "${col}" en el RTM`);
    }
    assert.ok(!html.includes('Saldo Anterior'), 'El RTM no debe mostrar saldo anterior');
  });

  await t.test('6b. Precisión: montos grandes, 6 decimales y valores no representables en binario se preservan exactos', () => {
    // NUMERIC(20,6) admite 14 dígitos enteros + 6 decimales: más de los ~15-17
    // dígitos significativos que JS number puede representar sin pérdida.
    const BIG = '12345678901234.567891';
    assert.notStrictEqual(String(Number(BIG)), BIG, 'Precondición: Number degrada este valor');
    assert.notStrictEqual(String(0.1 + 0.2), '0.3', 'Precondición: 0.1 + 0.2 no es exacto en IEEE 754');

    const base = makeRemittance();
    const remittance = makeRemittance({
      weightKgSnapshot: new Decimal('0.350'),
      subtotalArs: new Decimal(BIG),
      totalOrderArs: new Decimal('0.3'),
      priorBalanceSnapshotArs: new Decimal('0.1'),
      totalToCollectArs: new Decimal('0.4'),
      items: [{ ...base.items[0], unitPriceArsSnapshot: new Decimal('2354358'), lineTotalArs: new Decimal('2354358.000000') }],
      discountSteps: [{ ...base.discountSteps[0], percent: new Decimal('12.5'), amountArsSnapshot: new Decimal('137.613') }],
    });
    const rto = buildRtoPayload({ remittance, customerCode: null });
    assert.strictEqual(rto.data.weight_kg, '0.350');
    assert.strictEqual(rto.data.subtotal_ars, BIG);
    assert.strictEqual(rto.data.total_order_ars, '0.300000');
    assert.strictEqual(rto.data.prior_balance_ars, '0.100000');
    assert.strictEqual(rto.data.total_to_collect_ars, '0.400000');
    assert.strictEqual(rto.data.items[0].unit_price_ars, '2354358');
    assert.strictEqual(rto.data.items[0].line_total_ars, '2354358.000000');
    assert.deepStrictEqual(rto.data.discounts[0], { position: 1, percent: '12.5000', amount_ars: '137.613000' });

    const rtm = buildRtmPayload({
      remittance: makeRemittance(),
      marginRemittance: makeMarginRemittance({
        productsCostTotalArs: new Decimal(BIG),
        transportCostArs: new Decimal('0.000001'),
        gainArs: new Decimal('2000000.3867'),
        items: [
          { ...makeMarginRemittance().items[0], unitCostTheoreticalSnapshotArs: new Decimal('137.613'), totalCostSnapshotArs: new Decimal('1376.13') },
        ],
      }),
    });
    assert.strictEqual(rtm.data.products_cost_total_ars, BIG);
    assert.strictEqual(rtm.data.transport_cost_ars, '0.000001');
    assert.strictEqual(rtm.data.gain_ars, '2000000.386700');
    assert.strictEqual(rtm.data.items[0].unit_cost_ars, '137.613000');
    assert.strictEqual(rtm.data.items[0].line_cost_total_ars, '1376.130000');

    // Serializar a JSON (como se persiste en JSONB) no altera ningún valor.
    assert.deepStrictEqual(JSON.parse(JSON.stringify(rto)), rto);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(rtm)), rtm);
  });

  await t.test('6c. Un snapshot con más decimales que su columna se rechaza (nunca se redondea)', () => {
    assert.throws(
      () => buildRtoPayload({ remittance: makeRemittance({ weightKgSnapshot: new Decimal('0.3505') }), customerCode: null }),
      DomainError
    );
    assert.throws(
      () =>
        buildRtmPayload({
          remittance: makeRemittance(),
          marginRemittance: makeMarginRemittance({ gainArs: new Decimal('1.0000001') }),
        }),
      DomainError
    );
  });

  await t.test('6d. Renderer: "2000000.386700" se presenta como $ 2.000.000,39 sin modificar el snapshot', () => {
    const payload = buildRtmPayload({
      remittance: makeRemittance(),
      marginRemittance: makeMarginRemittance({ gainArs: new Decimal('2000000.3867') }),
    });
    const before = structuredClone(payload);
    const html = renderRtmHtml(payload);

    assert.ok(html.includes('$ 2.000.000,39'), 'La ganancia debe formatearse con Decimal ROUND_HALF_UP a 2 decimales');
    assert.ok(html.includes('$ 2.000,46'), 'Costo unitario 2000.456789 -> $ 2.000,46');
    assert.ok(html.includes('0,35 kg'), 'Peso 0.350 -> 0,35 kg');
    assert.deepStrictEqual(payload, before, 'Renderizar nunca modifica el payload');
    assert.strictEqual(payload.data.gain_ars, '2000000.386700');

    const big = '12345678901234.567891';
    const rto = buildRtoPayload({
      remittance: makeRemittance({
        subtotalArs: new Decimal(big),
        discountSteps: [{ ...makeRemittance().discountSteps[0], percent: new Decimal('12.5') }],
      }),
      customerCode: null,
    });
    const rtoHtml = renderRtoHtml(rto);
    assert.ok(rtoHtml.includes('$ 12.345.678.901.234,57'), 'Monto grande formateado exacto');
    assert.ok(rtoHtml.includes('Descuento 1 (12,5%)'), 'Porcentaje 12.5000 -> 12,5%');
    assert.strictEqual(rto.data.subtotal_ars, big);
  });

  await t.test('6e. Los validadores de contrato rechazan payloads con montos number (contrato previo)', () => {
    const rto = buildRtoPayload({ remittance: makeRemittance(), customerCode: null });
    assert.strictEqual(isRtoPayload({ ...rto, data: { ...rto.data, total_order_ars: 42000 } }), false);
    assert.strictEqual(isRtoPayload({ ...rto, data: { ...rto.data, weight_kg: 0.35 } }), false);
    assert.strictEqual(isRtoPayload({ ...rto, document_type: 'RTM' }), false);

    const rtm = buildRtmPayload({ marginRemittance: makeMarginRemittance(), remittance: makeRemittance() });
    assert.strictEqual(isRtmPayload({ ...rtm, data: { ...rtm.data, gain_ars: 13995.43211 } }), false);
    assert.strictEqual(isRtmPayload({ ...rtm, data: { ...rtm.data, items: [{ ...rtm.data.items[0], unit_cost_ars: '1e3' }] } }), false);
  });
});

// ==============================================================================
// 2. Servicio de documentos (repositorios en memoria + renderer falso)
// ==============================================================================

test('FASE 14 — PDFs: servicio de generación/visualización/reintento', async (t) => {
  await t.test('7. ensureRtoDocument genera una sola vez: PENDING -> READY con ruta /RTO/<code>/<id>.pdf', async () => {
    const h = makeHarness();
    const outcome = await h.service.ensureRtoDocument(RTO_ID);

    assert.strictEqual(outcome.status, 'READY');
    const rec = await h.docRepo.getById(outcome.documentId);
    assert.ok(rec);
    assert.strictEqual(rec.documentType, 'RTO');
    assert.strictEqual(rec.sourceType, 'RTO');
    assert.strictEqual(rec.sourceId, RTO_ID);
    assert.strictEqual(rec.rendererType, 'INTERNAL_HTML_PDF');
    assert.strictEqual(rec.fileReference, `RTO/RTO9001/${outcome.documentId}.pdf`);
    assert.strictEqual(rec.fileSizeBytes, h.docRepo.uploads.get(rec.fileReference)?.length);
    assert.strictEqual(rec.attemptCount, 1);
    const stored = asRtoPayload(rec.payloadSnapshot);
    assert.strictEqual(stored.data.customer_code, 'CLI0042');
    assert.strictEqual(stored.business_date, '2026-10-01');
    assert.strictEqual(stored.data.weight_kg, '0.350');
    assert.strictEqual(stored.data.total_to_collect_ars, '52000.000000');
    assert.strictEqual(h.renderer.calls.length, 1);

    // Idempotencia: segunda llamada devuelve el mismo documento sin re-renderizar
    const again = await h.service.ensureRtoDocument(RTO_ID);
    assert.strictEqual(again.documentId, outcome.documentId);
    assert.strictEqual(h.renderer.calls.length, 1);
    assert.strictEqual(h.docRepo.records.size, 1);
    assert.strictEqual(h.docRepo.uploads.size, 1);
  });

  await t.test('8. Cliente no registrado: payload sin código de cliente', async () => {
    const h = makeHarness();
    h.state.remittance = makeRemittance({ customerSource: 'MERCADO_LIBRE', customerId: null });
    const outcome = await h.service.ensureRtoDocument(RTO_ID);
    const rec = await h.docRepo.getById(outcome.documentId);
    const payload = asRtoPayload(rec!.payloadSnapshot);
    assert.strictEqual(payload.data.customer_code, null);
  });

  await t.test('8a. CASO 1: RTO usa business_date SALE_RTO (2026-10-13) aunque created_at UTC sea 2026-10-14', async () => {
    const h = makeHarness();
    h.state.remittance = makeRemittance({ businessDate: '2026-10-13', createdAt: '2026-10-14T01:00:00Z' });
    const outcome = await h.service.ensureRtoDocument(RTO_ID);
    const payload = asRtoPayload((await h.docRepo.getById(outcome.documentId))!.payloadSnapshot);
    assert.strictEqual(payload.business_date, '2026-10-13');
    assert.ok(h.renderer.calls[0].html.includes('Fecha: 13/10/2026'), 'El template formatea la business_date a DD/MM/YYYY');
    assert.ok(!h.renderer.calls[0].html.includes('14/10/2026'));
  });

  await t.test('8b. CASO 2: operación nocturna en Argentina (created_at 2026-10-15T02:30Z) mantiene business_date 2026-10-14', async () => {
    const h = makeHarness();
    h.state.remittance = makeRemittance({ businessDate: '2026-10-14', createdAt: '2026-10-15T02:30:00Z' });
    const outcome = await h.service.ensureRtoDocument(RTO_ID);
    const payload = asRtoPayload((await h.docRepo.getById(outcome.documentId))!.payloadSnapshot);
    assert.strictEqual(payload.business_date, '2026-10-14');
    assert.ok(h.renderer.calls[0].html.includes('Fecha: 14/10/2026'));
  });

  await t.test('8c. CASO 3: RTM usa business_date SALE_RTM, no created_at ni la fecha del RTO', async () => {
    const h = makeHarness();
    h.state.remittance = makeRemittance({ businessDate: '2026-10-13', createdAt: '2026-10-14T23:14:39Z' });
    h.state.marginRemittance = makeMarginRemittance({ businessDate: '2026-10-14', createdAt: '2026-10-15T02:00:00Z' });
    const outcome = await h.service.ensureRtmDocument(RTO_ID);
    const payload = asRtmPayload((await h.docRepo.getById(outcome.documentId))!.payloadSnapshot);
    assert.strictEqual(payload.business_date, '2026-10-14');
    assert.ok(h.renderer.calls[0].html.includes('Fecha: 14/10/2026'));
  });

  await t.test('8d. CASO 4: reintento de FAILED usa el payload_snapshot histórico sin volver a consultar business_date', async () => {
    const h = makeHarness();
    h.state.remittance = makeRemittance({ businessDate: '2026-10-13', createdAt: '2026-10-14T01:00:00Z' });
    h.renderer.failWith = new Error('timeout');
    const failed = await h.service.ensureRtoDocument(RTO_ID);
    assert.strictEqual(failed.status, 'FAILED');
    const snapshotBefore = structuredClone((await h.docRepo.getById(failed.documentId))!.payloadSnapshot);

    // Aunque la "fuente" cambiara, el reintento no reconstruye el payload.
    h.state.remittance = makeRemittance({ businessDate: '2026-12-31', createdAt: '2026-12-31T10:00:00Z' });
    h.renderer.failWith = null;
    const readsBefore = { ...h.reads };

    const retried = await h.service.retryDocument(failed.documentId);
    assert.strictEqual(retried.status, 'READY');
    assert.deepStrictEqual(h.reads, readsBefore, 'El reintento no debe consultar remito/RTM');
    const after = (await h.docRepo.getById(failed.documentId))!;
    assert.deepStrictEqual(after.payloadSnapshot, snapshotBefore, 'El payload_snapshot no se modifica');
    assert.strictEqual(asRtoPayload(after.payloadSnapshot).business_date, '2026-10-13');
    assert.ok(h.renderer.calls[h.renderer.calls.length - 1].html.includes('Fecha: 13/10/2026'));
  });

  await t.test('8e. CASO 5: un documento READY existente se reutiliza sin modificarse ni consultar fechas', async () => {
    const h = makeHarness();
    const rto = await h.service.ensureRtoDocument(RTO_ID);
    const rtm = await h.service.ensureRtmDocument(RTO_ID);
    const rtoBefore = structuredClone(await h.docRepo.getById(rto.documentId));
    const rtmBefore = structuredClone(await h.docRepo.getById(rtm.documentId));
    const uploadsBefore = [...h.docRepo.uploads.keys()];
    const callsBefore = h.renderer.calls.length;
    const remittanceReadsBefore = h.reads.remittance;

    // Cambia la fuente: ninguna fecha nueva debe filtrarse a los documentos READY.
    h.state.remittance = makeRemittance({ businessDate: '2027-01-01' });
    h.state.marginRemittance = makeMarginRemittance({ businessDate: '2027-01-02' });

    const rtoAgain = await h.service.ensureRtoDocument(RTO_ID);
    const rtmAgain = await h.service.ensureRtmDocument(RTO_ID);
    assert.strictEqual(rtoAgain.documentId, rto.documentId);
    assert.strictEqual(rtmAgain.documentId, rtm.documentId);
    assert.deepStrictEqual(await h.docRepo.getById(rto.documentId), rtoBefore);
    assert.deepStrictEqual(await h.docRepo.getById(rtm.documentId), rtmBefore);
    assert.deepStrictEqual([...h.docRepo.uploads.keys()], uploadsBefore);
    assert.strictEqual(h.renderer.calls.length, callsBefore);
    assert.strictEqual(h.reads.remittance, remittanceReadsBefore, 'Con READY existente no se relee el remito');
  });

  await t.test('8f. readSaleBusinessDate valida tipo de operación y formato YYYY-MM-DD', () => {
    assert.strictEqual(readSaleBusinessDate({ business_date: '2026-10-13', operation_type: 'SALE_RTO' }, 'SALE_RTO', 'RTO'), '2026-10-13');
    assert.strictEqual(readSaleBusinessDate([{ business_date: '2026-10-14', operation_type: 'SALE_RTM' }], 'SALE_RTM', 'RTM'), '2026-10-14');
    assert.throws(() => readSaleBusinessDate({ business_date: '2026-10-13', operation_type: 'SALE_RTM' }, 'SALE_RTO', 'RTO'), DomainError);
    assert.throws(() => readSaleBusinessDate({ business_date: '2026-10-13T00:00:00Z', operation_type: 'SALE_RTO' }, 'SALE_RTO', 'RTO'), DomainError);
    assert.throws(() => readSaleBusinessDate(null, 'SALE_RTO', 'RTO'), DomainError);
  });

  await t.test('8g. Regla única: ni el servicio, ni los builders, ni las actions derivan la fecha de created_at u overrides', () => {
    const read = (f: string) => fs.readFileSync(path.resolve(process.cwd(), f), 'utf-8');
    for (const f of ['src/services/document.service.ts', 'src/pdf/payload/rto-payload.ts', 'src/pdf/payload/rtm-payload.ts']) {
      assert.doesNotMatch(read(f), /createdAt|created_at|businessDateOverride/, `${f} no debe usar created_at ni overrides de fecha`);
    }
    assert.match(read('src/actions/remittance.actions.ts'), /ensureRtoDocument\(result\.remittanceId\)/);
    assert.match(read('src/actions/margin-remittance.actions.ts'), /ensureRtmDocument\(result\.remittanceId\)/);
  });

  await t.test('9. Fallo del renderer: FAILED, payload conservado, error saneado y sin excepción', async () => {
    const h = makeHarness();
    h.renderer.failWith = new Error('Chromium crashed connecting to postgres://admin:secret@db.internal:5432');

    const outcome = await h.service.ensureRtoDocument(RTO_ID);
    assert.strictEqual(outcome.status, 'FAILED');
    assert.ok(outcome.errorMessage?.includes('Chromium crashed'));
    assert.ok(!outcome.errorMessage?.includes('secret'), 'Las credenciales no deben persistirse en error_message');

    const rec = await h.docRepo.getById(outcome.documentId);
    assert.strictEqual(rec!.generationStatus, 'FAILED');
    assert.strictEqual(rec!.fileReference, null);
    assert.strictEqual(asRtoPayload(rec!.payloadSnapshot).document_code, 'RTO9001');
    assert.strictEqual(h.docRepo.uploads.size, 0);

    // ensure posterior no reintenta implícitamente ni duplica
    const again = await h.service.ensureRtoDocument(RTO_ID);
    assert.strictEqual(again.documentId, outcome.documentId);
    assert.strictEqual(again.status, 'FAILED');
    assert.strictEqual(h.renderer.calls.length, 1);
  });

  await t.test('10. Reintento usa el payload_snapshot histórico (nunca datos actuales) y no duplica', async () => {
    const h = makeHarness();
    h.renderer.failWith = new Error('timeout');
    const failed = await h.service.ensureRtoDocument(RTO_ID);
    assert.strictEqual(failed.status, 'FAILED');

    // Los datos "actuales" cambian después del primer intento
    h.state.remittance = makeRemittance({ customerDisplayName: 'NOMBRE ACTUAL DISTINTO' });
    h.renderer.failWith = null;

    const retried = await h.service.retryDocument(failed.documentId);
    assert.strictEqual(retried.status, 'READY');
    assert.strictEqual(retried.documentId, failed.documentId);
    assert.strictEqual(h.docRepo.records.size, 1);

    const lastHtml = h.renderer.calls[h.renderer.calls.length - 1].html;
    assert.ok(lastHtml.includes('Cliente &lt;b&gt;Prueba&lt;/b&gt;'));
    assert.ok(!lastHtml.includes('NOMBRE ACTUAL DISTINTO'));

    const rec = await h.docRepo.getById(failed.documentId);
    assert.strictEqual(rec!.attemptCount, 2);
    assert.strictEqual(rec!.errorMessage, null);
    assert.strictEqual(rec!.fileReference, `RTO/RTO9001/${failed.documentId}.pdf`);
  });

  await t.test('10b. Reintento rechaza un payload_snapshot fuera de contrato sin consumir intento ni renderizar', async () => {
    const h = makeHarness();
    h.renderer.failWith = new Error('timeout');
    const failed = await h.service.ensureRtoDocument(RTO_ID);
    h.renderer.failWith = null;

    // Simula un snapshot con montos number (contrato previo): nunca se repara.
    const rec = h.docRepo.records.get(failed.documentId)!;
    const legacy = asRtoPayload(rec.payloadSnapshot);
    rec.payloadSnapshot = { ...legacy, data: { ...legacy.data, total_order_ars: 42000 } };

    await assert.rejects(() => h.service.retryDocument(failed.documentId), DomainError);
    const after = await h.docRepo.getById(failed.documentId);
    assert.strictEqual(after!.attemptCount, 1);
    assert.strictEqual(after!.generationStatus, 'FAILED');
    assert.strictEqual(h.renderer.calls.length, 1);
  });

  await t.test('13b. RTM: el payload_snapshot almacenado conserva ganancia/costos exactos', async () => {
    const h = makeHarness();
    h.state.marginRemittance = makeMarginRemittance({ gainArs: new Decimal('2000000.3867') });
    const outcome = await h.service.ensureRtmDocument(RTO_ID);
    const stored = asRtmPayload((await h.docRepo.getById(outcome.documentId))!.payloadSnapshot);
    assert.strictEqual(stored.data.gain_ars, '2000000.386700');
    assert.strictEqual(stored.data.items[0].unit_cost_ars, '2000.456789');
    assert.strictEqual(stored.data.products_cost_total_ars, '25004.567890');
    assert.ok(h.renderer.calls[0].html.includes('$ 2.000.000,39'));
  });

  await t.test('11. Solo se reintenta un documento FAILED', async () => {
    const h = makeHarness();
    const ready = await h.service.ensureRtoDocument(RTO_ID);
    await assert.rejects(() => h.service.retryDocument(ready.documentId), DomainError);
    await assert.rejects(() => h.service.retryDocument(randomUUID()), DomainError);
    await assert.rejects(() => h.service.retryDocument(''), DomainError);
    assert.strictEqual(h.renderer.calls.length, 1);
  });

  await t.test('12. Ver: READY devuelve URL firmada sin re-renderizar; MISSING/FAILED sin URL', async () => {
    const h = makeHarness();
    assert.deepStrictEqual(await h.service.getViewableDocument('RTO', RTO_ID), { status: 'MISSING' });
    assert.deepStrictEqual(await h.service.getViewableDocument('RTO', ''), { status: 'MISSING' });

    const ready = await h.service.ensureRtoDocument(RTO_ID);
    const callsBefore = h.renderer.calls.length;

    for (let i = 0; i < 3; i++) {
      const view = await h.service.getViewableDocument('RTO', RTO_ID);
      assert.strictEqual(view.status, 'READY');
      assert.strictEqual(view.documentId, ready.documentId);
      assert.ok(view.signedUrl?.includes(`RTO/RTO9001/${ready.documentId}.pdf`));
    }
    assert.strictEqual(h.renderer.calls.length, callsBefore, 'Ver nunca debe re-renderizar el PDF');

    const h2 = makeHarness();
    h2.renderer.failWith = new Error('boom');
    const failed = await h2.service.ensureRtoDocument(RTO_ID);
    const view = await h2.service.getViewableDocument('RTO', RTO_ID);
    assert.strictEqual(view.status, 'FAILED');
    assert.strictEqual(view.documentId, failed.documentId);
    assert.strictEqual(view.signedUrl, undefined);
    assert.strictEqual(h2.docRepo.signedUrlRequests.length, 0);
  });

  await t.test('13. ensureRtmDocument: source = RTM id, ruta /RTM/<code>/<id>.pdf, idempotente', async () => {
    const h = makeHarness();
    const outcome = await h.service.ensureRtmDocument(RTO_ID);
    assert.strictEqual(outcome.status, 'READY');

    const rec = await h.docRepo.getById(outcome.documentId);
    assert.strictEqual(rec!.documentType, 'RTM');
    assert.strictEqual(rec!.sourceType, 'RTM');
    assert.strictEqual(rec!.sourceId, RTM_ID);
    assert.strictEqual(rec!.templateKey, RTM_TEMPLATE_KEY);
    assert.strictEqual(rec!.fileReference, `RTM/RTM9001/${outcome.documentId}.pdf`);
    assert.ok(h.renderer.calls[0].html.includes('USO INTERNO'));

    const again = await h.service.ensureRtmDocument(RTO_ID);
    assert.strictEqual(again.documentId, outcome.documentId);
    assert.strictEqual(h.renderer.calls.length, 1);

    const view = await h.service.getViewableDocument('RTM', RTM_ID);
    assert.strictEqual(view.status, 'READY');
  });

  await t.test('14. ensureRtmDocument sin RTM confirmado o RTO inexistente es rechazado sin crear documento', async () => {
    const h = makeHarness();
    h.state.marginRemittance = null;
    await assert.rejects(() => h.service.ensureRtmDocument(RTO_ID), DomainError);
    await assert.rejects(() => h.service.ensureRtmDocument(''), DomainError);
    await assert.rejects(() => h.service.ensureRtoDocument(randomUUID()), DomainError);
    await assert.rejects(() => h.service.ensureRtoDocument(''), DomainError);
    assert.strictEqual(h.docRepo.records.size, 0);
    assert.strictEqual(h.renderer.calls.length, 0);
  });
});

// ==============================================================================
// 3. Backfill (solo reporte) y estados en Ventas del mes
// ==============================================================================

test('FASE 14 — PDFs: backfill histórico y estados de documento', async (t) => {
  await t.test('15. reportMissingDocuments solo lee: lista RTO/RTM sin documento y no genera nada', async () => {
    const docRepo = new InMemoryDocumentRepository();
    const rtoWithDoc = randomUUID();
    const rtoWithoutDoc = randomUUID();
    const rtmWithFailedDoc = randomUUID();
    const rtmWithoutDoc = randomUUID();

    await docRepo.insertPending({
      documentType: 'RTO', sourceType: 'RTO', sourceId: rtoWithDoc, rendererType: 'INTERNAL_HTML_PDF',
      templateKey: RTO_TEMPLATE_KEY, templateVersion: RTO_TEMPLATE_VERSION, payloadSnapshot: {},
    });
    const failed = await docRepo.insertPending({
      documentType: 'RTM', sourceType: 'RTM', sourceId: rtmWithFailedDoc, rendererType: 'INTERNAL_HTML_PDF',
      templateKey: RTM_TEMPLATE_KEY, templateVersion: RTM_TEMPLATE_VERSION, payloadSnapshot: {},
    });
    await docRepo.markFailed(failed.id, 'x');

    const remittanceRepo = {
      listAllRemittanceCodes: async () => [
        { id: rtoWithDoc, code: 'RTO0001' },
        { id: rtoWithoutDoc, code: 'RTO0002' },
      ],
    } as unknown as IRemittanceRepository;
    const marginRemittanceRepo = {
      listAllMarginRemittanceCodes: async () => [
        { id: rtmWithFailedDoc, code: 'RTM0001', remittanceId: rtoWithDoc },
        { id: rtmWithoutDoc, code: 'RTM0002', remittanceId: rtoWithoutDoc },
      ],
    } as unknown as IMarginRemittanceRepository;
    const refuse = async (): Promise<never> => {
      throw new Error('El reporte no debe generar documentos');
    };
    const documentService: IDocumentDomainService = {
      ensureRtoDocument: refuse,
      ensureRtmDocument: refuse,
      retryDocument: refuse,
      getViewableDocument: refuse,
    };

    const backfill = new DocumentBackfillService(remittanceRepo, marginRemittanceRepo, docRepo, documentService);
    const report = await backfill.reportMissingDocuments();

    assert.deepStrictEqual(report.missingRto, [{ sourceId: rtoWithoutDoc, code: 'RTO0002' }]);
    assert.deepStrictEqual(report.missingRtm, [{ sourceId: rtmWithoutDoc, code: 'RTM0002' }]);
    assert.strictEqual(docRepo.records.size, 2);
  });

  await t.test('16. Ventas del mes expone estado de PDF RTO/RTM (MISSING si no existe)', async () => {
    const docRepo = new InMemoryDocumentRepository();
    const sale: MonthlySaleRecord = {
      remittanceId: RTO_ID,
      marginRemittanceId: RTM_ID,
      rtoCode: 'RTO9001',
      rtmCode: 'RTM9001',
      businessDate: '2026-10-02',
      customerSource: 'REGISTERED_CUSTOMER',
      customerDisplayName: 'Cliente',
      totalOrderArs: new Decimal('42000'),
      gainArs: new Decimal('13995.43211'),
    } as MonthlySaleRecord;

    const doc = await docRepo.insertPending({
      documentType: 'RTO', sourceType: 'RTO', sourceId: RTO_ID, rendererType: 'INTERNAL_HTML_PDF',
      templateKey: RTO_TEMPLATE_KEY, templateVersion: RTO_TEMPLATE_VERSION, payloadSnapshot: {},
    });
    await docRepo.markReady(doc.id, 'RTO/RTO9001/x.pdf', 10);

    const remittanceRepo = { listCompletedSalesForMonth: async () => [sale] } as unknown as IRemittanceRepository;
    const service = new RemittanceDomainService(
      remittanceRepo,
      {} as IOrderRepository,
      {} as IStockRepository,
      {} as IMarginRemittanceRepository,
      {} as ICostEngineService,
      docRepo
    );

    const [row] = await service.listCompletedSalesForMonth(2026, 10);
    assert.strictEqual(row.rtoDocumentStatus, 'READY');
    assert.strictEqual(row.rtmDocumentStatus, 'MISSING');
  });

  await t.test('17. La generación de PDF en las Server Actions ocurre después del commit y nunca revierte la venta', () => {
    // Auditoría de fuente (las actions arrastran composition.ts -> 'server-only').
    const cases = [
      { file: 'src/actions/remittance.actions.ts', business: 'confirmOrderToRemittance(', doc: 'ensureRtoDocument(' },
      { file: 'src/actions/margin-remittance.actions.ts', business: 'completeRtm(', doc: 'ensureRtmDocument(' },
    ];
    for (const c of cases) {
      const src = fs.readFileSync(path.resolve(process.cwd(), c.file), 'utf-8');
      const businessIdx = src.indexOf(c.business);
      const docIdx = src.indexOf(c.doc);
      assert.ok(businessIdx >= 0, `${c.file}: no se encontró ${c.business}`);
      assert.ok(docIdx > businessIdx, `${c.file}: el PDF debe generarse después del commit comercial`);

      // La llamada al documento está envuelta en su propio try/catch que no relanza.
      const before = src.slice(0, docIdx);
      const innerTry = before.lastIndexOf('try {');
      assert.ok(innerTry > businessIdx, `${c.file}: la generación de PDF debe tener su propio try/catch`);
      const after = src.slice(docIdx);
      const innerCatch = after.match(/catch\s*\(\w+[^)]*\)\s*\{([^}]*)\}/);
      assert.ok(innerCatch, `${c.file}: falta catch de la generación de PDF`);
      assert.ok(!/throw/.test(innerCatch[1]), `${c.file}: el catch del PDF no debe relanzar`);
      assert.ok(/status:\s*'FAILED'/.test(innerCatch[1]), `${c.file}: el catch del PDF debe informar FAILED`);
    }
  });
});

// ==============================================================================
// 4. Integración real: generated_documents + Storage (sin datos de negocio)
// ==============================================================================

test('FASE 14 — PDFs: integración con generated_documents y Storage privado', async (t) => {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const repo = new DocumentRepository(supabase);

  // source_type exclusivo de prueba: nunca colisiona con RTO/RTM reales ni
  // aparece en el reporte de backfill / íconos de la UI.
  const TEST_SOURCE_TYPE = `TEST_FASE14_${Date.now()}`;
  const TEST_STORAGE_PREFIX = `${TEST_SOURCE_TYPE}/probe`;
  const createdDocIds: string[] = [];
  const createdObjects: string[] = [];

  // Esta suite jamás debe crear documentos para RTO/RTM reales (RTO0043,
  // RTO0182, RTO0261, RTM0070, RTM0071, ...): solo usa TEST_SOURCE_TYPE.
  const countRealDocuments = async (): Promise<number> => {
    const { count, error } = await supabase
      .from('generated_documents')
      .select('id', { count: 'exact', head: true })
      .in('source_type', ['RTO', 'RTM']);
    assert.ifError(error);
    return count ?? 0;
  };
  let realDocumentsBefore = 0;

  t.before(async () => {
    realDocumentsBefore = await countRealDocuments();
  });

  t.after(async () => {
    if (createdObjects.length > 0) {
      await supabase.storage.from(GENERATED_DOCUMENTS_BUCKET).remove(createdObjects);
    }
    await supabase.from('generated_documents').delete().eq('source_type', TEST_SOURCE_TYPE);
    const { count } = await supabase
      .from('generated_documents')
      .select('id', { count: 'exact', head: true })
      .eq('source_type', TEST_SOURCE_TYPE);
    assert.strictEqual(count, 0, 'No deben quedar fixtures persistentes en generated_documents');

    const { data: leftovers, error: listErr } = await supabase.storage.from(GENERATED_DOCUMENTS_BUCKET).list(TEST_STORAGE_PREFIX);
    assert.ifError(listErr);
    assert.strictEqual((leftovers ?? []).length, 0, 'No deben quedar archivos de prueba en Storage');

    assert.strictEqual(await countRealDocuments(), realDocumentsBefore, 'La suite no debe crear documentos para RTO/RTM reales');
  });

  const baseInput = (sourceId: string): InsertPendingDocumentInput => ({
    documentType: 'RTO',
    sourceType: TEST_SOURCE_TYPE,
    sourceId,
    rendererType: 'INTERNAL_HTML_PDF',
    templateKey: RTO_TEMPLATE_KEY,
    templateVersion: RTO_TEMPLATE_VERSION,
    payloadSnapshot: { probe: true, amount_ars: '123.450000' },
  });

  await t.test('18. Índice único: insertPending concurrente con la misma clave no duplica', async () => {
    const sourceId = randomUUID();
    const results = await Promise.all([1, 2, 3, 4].map(() => repo.insertPending(baseInput(sourceId))));
    const ids = new Set(results.map((r) => r.id));
    assert.strictEqual(ids.size, 1, 'Todas las inserciones deben resolver al mismo documento');
    createdDocIds.push(...ids);

    const { count } = await supabase
      .from('generated_documents')
      .select('id', { count: 'exact', head: true })
      .eq('source_type', TEST_SOURCE_TYPE)
      .eq('source_id', sourceId);
    assert.strictEqual(count, 1);

    // Nueva versión de template = nuevo registro, conservando el anterior (PDFS.md §13.2)
    const v2 = await repo.insertPending({ ...baseInput(sourceId), templateVersion: '9.9-test' });
    assert.notStrictEqual(v2.id, results[0].id);
    createdDocIds.push(v2.id);
    const latest = await repo.findLatestBySource(TEST_SOURCE_TYPE, sourceId);
    assert.strictEqual(latest!.id, v2.id);
  });

  await t.test('18b. JSONB conserva exactamente los decimal strings de un payload real RTO/RTM', async () => {
    const rto = buildRtoPayload({
      remittance: makeRemittance({ subtotalArs: new Decimal('12345678901234.567891'), priorBalanceSnapshotArs: new Decimal('0.1') }),
      customerCode: 'CLI0042',
    });
    const rtm = buildRtmPayload({
      remittance: makeRemittance(),
      marginRemittance: makeMarginRemittance({ gainArs: new Decimal('2000000.3867') }),
    });

    const rtoDoc = await repo.insertPending({ ...baseInput(randomUUID()), documentType: 'RTO', payloadSnapshot: rto });
    const rtmDoc = await repo.insertPending({ ...baseInput(randomUUID()), documentType: 'RTM', payloadSnapshot: rtm });
    createdDocIds.push(rtoDoc.id, rtmDoc.id);

    const rereadRto = asRtoPayload((await repo.getById(rtoDoc.id))!.payloadSnapshot);
    const rereadRtm = asRtmPayload((await repo.getById(rtmDoc.id))!.payloadSnapshot);
    assert.deepStrictEqual(rereadRto, rto, 'JSONB debe devolver el payload RTO idéntico');
    assert.deepStrictEqual(rereadRtm, rtm, 'JSONB debe devolver el payload RTM idéntico');
    assert.strictEqual(rereadRto.data.subtotal_ars, '12345678901234.567891');
    assert.strictEqual(rereadRto.data.prior_balance_ars, '0.100000');
    assert.strictEqual(rereadRto.data.weight_kg, '0.350');
    assert.strictEqual(rereadRtm.data.gain_ars, '2000000.386700');
  });

  await t.test('18c. DB real: NUMERIC no representable en IEEE 754 llega exacto al payload por los mismos repositorios del PDF', async () => {
    const BIG = '12345678901234.567891';
    const BIG_INT_PRICE = '9007199254740993'; // 2^53 + 1: NUMERIC(20,0) no representable como number
    assert.notStrictEqual(String(Number(BIG)), BIG, 'Precondición: Number degrada este valor');
    assert.notStrictEqual(String(Number(BIG_INT_PRICE)), BIG_INT_PRICE, 'Precondición: Number degrada este entero');

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    // Inserción HTTP directa con los NUMERIC como texto JSON: PostgreSQL recibe el
    // valor exacto (el cliente tipado los modela como number).
    const restInsert = async (table: string, row: Record<string, string | number | null>): Promise<Record<string, unknown>> => {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      const body: unknown = await res.json();
      assert.strictEqual(res.status, 201, `${table}: ${JSON.stringify(body)}`);
      const first: unknown = Array.isArray(body) ? body[0] : undefined;
      assert.ok(typeof first === 'object' && first !== null, `${table}: sin fila devuelta`);
      return { ...first };
    };
    const idOf = (row: Record<string, unknown>, column = 'id'): string => {
      const v = row[column];
      assert.ok(typeof v === 'string');
      return v;
    };

    const tag = `PREC_${Date.now()}`;
    const ids: Record<string, string> = {};
    try {
      const { data: priceList, error: plErr } = await supabase.from('price_lists').select('id').eq('system_role', 'SALON_DEFAULT').single();
      assert.ifError(plErr);

      ids.baseProduct = idOf(await restInsert('base_products', { code: `BP_${tag}`, name: `Base ${tag}` }));
      ids.stockItem = idOf(await restInsert('stock_items', { code: `P_${tag}`, name: `Producto ${tag}`, item_type: 'PRO', unit_type: 'UNIT', stock_minimum: '1' }));
      await restInsert('products', { stock_item_id: ids.stockItem, base_product_id: ids.baseProduct, presentation: '350 cc', weight_kg: '0.350' });
      ids.order = idOf(await restInsert('orders', { code: `PED_${tag}`, status: 'CONVERTED', customer_source: 'CONSUMER_FINAL', price_list_id: priceList!.id, recipient_name: `Cliente ${tag}` }));
      ids.rtoOp = idOf(await restInsert('business_operations', { operation_type: 'SALE_RTO', business_date: '2026-10-13' }));
      ids.rtmOp = idOf(await restInsert('business_operations', { operation_type: 'SALE_RTM', business_date: '2026-10-14' }));
      ids.remittance = idOf(await restInsert('remittances', {
        code: `RTO_${tag}`,
        operation_id: ids.rtoOp,
        order_id: ids.order,
        status: 'COMPLETED',
        customer_source: 'CONSUMER_FINAL',
        recipient_name_snapshot: `Cliente ${tag}`,
        weight_kg_snapshot: '0.350',
        subtotal_ars: BIG,
        total_order_ars: '2000000.386700',
        prior_balance_snapshot_ars: '0.000001',
        total_to_collect_ars: '2000000.386701',
      }));
      await restInsert('remittance_items', {
        remittance_id: ids.remittance,
        product_id: ids.stockItem,
        product_code_snapshot: `P_${tag}`,
        product_name_snapshot: `Producto ${tag}`,
        presentation_snapshot: '350 cc',
        weight_kg_snapshot: '0.350',
        quantity_sent: 1,
        unit_price_ars_snapshot: BIG_INT_PRICE,
        line_total_ars: BIG,
      });
      await restInsert('remittance_discount_steps', { remittance_id: ids.remittance, position: 1, percent: '12.5000', amount_ars_snapshot: '0.000001' });
      ids.marginRemittance = idOf(await restInsert('margin_remittances', {
        code: `RTM_${tag}`,
        operation_id: ids.rtmOp,
        remittance_id: ids.remittance,
        products_cost_total_ars: BIG,
        transport_cost_ars: '0.000001',
        gain_ars: '2000000.386700',
      }));
      await restInsert('margin_remittance_items', {
        margin_remittance_id: ids.marginRemittance,
        product_id: ids.stockItem,
        quantity_sent: 1,
        unit_cost_theoretical_snapshot_ars: '0.000001',
        total_cost_snapshot_ars: BIG,
      });

      // Mismo servicio y mismos repositorios que la generación real; solo el
      // almacenamiento del documento y el renderer son en memoria (no se crea
      // generated_documents ni objeto en Storage).
      const docRepo = new InMemoryDocumentRepository();
      const renderer = new FakeRenderer();
      const service = new DocumentDomainService(
        docRepo,
        new RemittanceRepository(supabase),
        new MarginRemittanceRepository(supabase),
        new CustomerRepository(supabase),
        renderer
      );

      const rtoOutcome = await service.ensureRtoDocument(ids.remittance);
      const rto = asRtoPayload((await docRepo.getById(rtoOutcome.documentId))!.payloadSnapshot);
      assert.strictEqual(rto.business_date, '2026-10-13');
      assert.strictEqual(rto.data.subtotal_ars, BIG);
      assert.strictEqual(rto.data.total_order_ars, '2000000.386700');
      assert.strictEqual(rto.data.prior_balance_ars, '0.000001');
      assert.strictEqual(rto.data.total_to_collect_ars, '2000000.386701');
      assert.strictEqual(rto.data.weight_kg, '0.350');
      assert.strictEqual(rto.data.items[0].unit_price_ars, BIG_INT_PRICE);
      assert.strictEqual(rto.data.items[0].line_total_ars, BIG);
      assert.deepStrictEqual(rto.data.discounts[0], { position: 1, percent: '12.5000', amount_ars: '0.000001' });

      const rtmOutcome = await service.ensureRtmDocument(ids.remittance);
      const rtm = asRtmPayload((await docRepo.getById(rtmOutcome.documentId))!.payloadSnapshot);
      assert.strictEqual(rtm.business_date, '2026-10-14');
      assert.strictEqual(rtm.data.products_cost_total_ars, BIG);
      assert.strictEqual(rtm.data.transport_cost_ars, '0.000001');
      assert.strictEqual(rtm.data.gain_ars, '2000000.386700');
      assert.strictEqual(rtm.data.weight_kg, '0.350');
      assert.strictEqual(rtm.data.items[0].unit_sale_price_ars, BIG_INT_PRICE);
      assert.strictEqual(rtm.data.items[0].line_sale_total_ars, BIG);
      assert.strictEqual(rtm.data.items[0].unit_cost_ars, '0.000001');
      assert.strictEqual(rtm.data.items[0].line_cost_total_ars, BIG);
      assert.ok(renderer.calls[1].html.includes('$ 2.000.000,39'));
    } finally {
      if (ids.marginRemittance) await supabase.from('margin_remittances').delete().eq('id', ids.marginRemittance);
      if (ids.remittance) await supabase.from('remittances').delete().eq('id', ids.remittance);
      if (ids.order) await supabase.from('orders').delete().eq('id', ids.order);
      for (const op of [ids.rtoOp, ids.rtmOp]) if (op) await supabase.from('business_operations').delete().eq('id', op);
      if (ids.stockItem) {
        await supabase.from('products').delete().eq('stock_item_id', ids.stockItem);
        await supabase.from('stock_items').delete().eq('id', ids.stockItem);
      }
      if (ids.baseProduct) await supabase.from('base_products').delete().eq('id', ids.baseProduct);

      const head = { count: 'exact', head: true } as const;
      const leftovers = [
        (await supabase.from('margin_remittances').select('id', head).eq('id', ids.marginRemittance ?? '00000000-0000-0000-0000-000000000000')).count,
        (await supabase.from('remittances').select('id', head).eq('id', ids.remittance ?? '00000000-0000-0000-0000-000000000000')).count,
        (await supabase.from('orders').select('id', head).eq('id', ids.order ?? '00000000-0000-0000-0000-000000000000')).count,
        (await supabase.from('business_operations').select('id', head).in('id', [ids.rtoOp, ids.rtmOp].filter((x): x is string => !!x))).count,
        (await supabase.from('stock_items').select('id', head).eq('id', ids.stockItem ?? '00000000-0000-0000-0000-000000000000')).count,
        (await supabase.from('base_products').select('id', head).eq('id', ids.baseProduct ?? '00000000-0000-0000-0000-000000000000')).count,
      ];
      assert.deepStrictEqual(leftovers, [0, 0, 0, 0, 0, 0], 'El fixture de precisión debe limpiarse por completo');
    }
  });

  await t.test('19. Ciclo PENDING -> FAILED -> reintento -> READY y CHECK de file_reference', async () => {
    const pending = await repo.insertPending(baseInput(randomUUID()));
    createdDocIds.push(pending.id);
    assert.strictEqual(pending.generationStatus, 'PENDING');
    assert.strictEqual(pending.attemptCount, 1);
    assert.deepStrictEqual(pending.payloadSnapshot, { probe: true, amount_ars: '123.450000' });

    const failed = await repo.markFailed(pending.id, 'boom');
    assert.strictEqual(failed.generationStatus, 'FAILED');
    assert.strictEqual(failed.errorMessage, 'boom');

    const bumped = await repo.incrementAttemptCount(pending.id);
    assert.strictEqual(bumped.attemptCount, 2);

    const ready = await repo.markReady(pending.id, `${TEST_SOURCE_TYPE}/x/${pending.id}.pdf`, 42);
    assert.strictEqual(ready.generationStatus, 'READY');
    assert.strictEqual(ready.errorMessage, null);
    assert.strictEqual(ready.fileSizeBytes, 42);
    assert.ok(ready.generatedAt);
    assert.deepStrictEqual(ready.payloadSnapshot, { probe: true, amount_ars: '123.450000' });

    const statuses = await repo.listStatusesBySourceIds(TEST_SOURCE_TYPE, [pending.sourceId, randomUUID()]);
    assert.strictEqual(statuses.size, 1);
    assert.strictEqual(statuses.get(pending.sourceId), 'READY');

    // READY sin file_reference viola check_ready_file_ref
    const { error } = await supabase
      .from('generated_documents')
      .update({ file_reference: null })
      .eq('id', pending.id);
    assert.ok(error, 'READY sin file_reference debe ser rechazado por la base');
  });

  await t.test('20. Storage privado: URL firmada funciona, URL pública y anon no', async () => {
    const objectPath = `${TEST_STORAGE_PREFIX}/${randomUUID()}.pdf`;
    const bytes = Buffer.from('%PDF-1.4\n% fase14 probe\n%%EOF\n');
    await repo.uploadPdf(objectPath, bytes);
    createdObjects.push(objectPath);

    // upsert:false — nunca sobreescribir un PDF ya generado
    await assert.rejects(() => repo.uploadPdf(objectPath, bytes), DomainError);

    const signedUrl = await repo.createSignedUrl(objectPath);
    const signedRes = await fetch(signedUrl);
    assert.strictEqual(signedRes.status, 200);
    assert.strictEqual(Buffer.from(await signedRes.arrayBuffer()).toString(), bytes.toString());

    const { data: pub } = supabase.storage.from(GENERATED_DOCUMENTS_BUCKET).getPublicUrl(objectPath);
    const publicRes = await fetch(pub.publicUrl);
    assert.notStrictEqual(publicRes.status, 200, 'El bucket nunca debe ser público');
    await publicRes.arrayBuffer();

    const { data: anonData, error: anonErr } = await anon.storage.from(GENERATED_DOCUMENTS_BUCKET).download(objectPath);
    assert.ok(anonErr || !anonData, 'anon no debe poder descargar PDFs');

    const { data: anonSigned } = await anon.storage.from(GENERATED_DOCUMENTS_BUCKET).createSignedUrl(objectPath, 60);
    assert.ok(!anonSigned?.signedUrl, 'anon no debe poder firmar URLs');

    await repo.deleteObject(objectPath);
    createdObjects.splice(createdObjects.indexOf(objectPath), 1);
    // La URL firmada puede seguir respondiendo desde la caché CDN de Storage;
    // se verifica el borrado contra la API.
    const { data: afterDelete, error: afterDeleteErr } = await supabase.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .download(objectPath);
    assert.ok(afterDeleteErr || !afterDelete, 'El objeto debe haberse eliminado');
  });

  await t.test('21. Storage rechaza archivos que no son application/pdf', async () => {
    const objectPath = `${TEST_STORAGE_PREFIX}/${randomUUID()}.txt`;
    const { error } = await supabase.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(objectPath, Buffer.from('hola'), { contentType: 'text/plain', upsert: false });
    if (!error) createdObjects.push(objectPath);
    assert.ok(error, 'El bucket solo debe aceptar application/pdf');
  });

  await t.test('22. anon no puede leer generated_documents', async () => {
    const doc = await repo.insertPending(baseInput(randomUUID()));
    createdDocIds.push(doc.id);
    const { data, error } = await anon.from('generated_documents').select('id').eq('id', doc.id);
    assert.ok(error || (data ?? []).length === 0, 'anon no debe ver documentos generados');
  });
});

// ==============================================================================
// 5. Renderer real INTERNAL_HTML_PDF (Chromium de puppeteer)
// ==============================================================================

test('FASE 14 — PDFs: renderer INTERNAL_HTML_PDF real', async (t) => {
  const renderer = new InternalHtmlPdfRenderer();
  t.after(async () => {
    await renderer.close();
  });

  await t.test('23. Renderiza un RTO a PDF válido; tablas largas paginan', async () => {
    const short = buildRtoPayload({ remittance: makeRemittance(), customerCode: 'CLI0042' });
    const pdf = await renderer.renderHtmlToPdf(renderRtoHtml(short), buildRtoPdfRenderOptions(short));
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 1000);

    const base = makeRemittance();
    const manyItems = Array.from({ length: 120 }, (_, i) => ({ ...base.items[0], id: randomUUID(), productNameSnapshot: `Producto ${i + 1}` }));
    const long = buildRtoPayload({ remittance: makeRemittance({ items: manyItems }), customerCode: null });
    const longPdf = await renderer.renderHtmlToPdf(renderRtoHtml(long), buildRtoPdfRenderOptions(long));
    const pageCount = (longPdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
    assert.ok(pageCount > 1, `Un RTO de 120 líneas debe ocupar más de una página (páginas: ${pageCount})`);
  });
});
