import test, { mock } from 'node:test';
import assert from 'node:assert';
import { Decimal } from '../src/domain/decimal';
import { DomainError } from '../src/domain/errors';
import { ReportingService, type BusinessDateSource } from '../src/services/reporting.service';
import {
  serializeReportingBilling,
  serializeReportingProducts,
  serializeReportingCustomers,
  serializeReportingEntityAnalysis,
  serializeReportingYears,
} from '../src/actions/reporting.dto';
import type {
  IReportingRepository,
  BillingMonthRecord,
  ProductTotalsRecord,
  EntityTotalsRecord,
  EntitySaleRecord,
} from '../src/repositories/reporting.repository';
import type { CustomerSource } from '../src/database/domain-types';
import type { ReportingDashboardProps } from '../src/ui/reporting/ReportingDashboard';

/**
 * REPORTES R4.5 — ReportingService + DTOs + Server Action, sin DB.
 * Repository fake en memoria; la action usa el guard REAL con sesión simulada
 * (mismo patrón que tests/actions-authorization.test.ts).
 */

const D = (v: string | number) => new Decimal(v);
const AS_OF = '2026-10-17';
const UUID_A = '0000000a-0000-4000-8000-000000000001';
const UUID_B = '0000000b-0000-4000-8000-000000000002';

class FakeReportingRepository implements IReportingRepository {
  calls: string[] = [];
  firstYear: number | null = null;
  billing: BillingMonthRecord[] = [];
  products: ProductTotalsRecord[] = [];
  entities = new Map<number, EntityTotalsRecord[]>();
  sales = new Map<string, EntitySaleRecord[]>();

  async getFirstReportingYear(asOfDate: string) {
    this.calls.push(`first:${asOfDate}`);
    return this.firstYear;
  }
  async getBillingMonths(year: number, asOfDate: string) {
    this.calls.push(`billing:${year}:${asOfDate}`);
    return this.billing.filter((r) => r.year >= year - 2 && r.year <= year);
  }
  async getProductTotals(year: number, asOfDate: string) {
    this.calls.push(`products:${year}:${asOfDate}`);
    return this.products;
  }
  async getEntityTotals(year: number, asOfDate: string) {
    this.calls.push(`entities:${year}:${asOfDate}`);
    return this.entities.get(year) ?? [];
  }
  async getEntitySales(year: number, asOfDate: string, source: CustomerSource, customerId: string | null) {
    this.calls.push(`sales:${year}:${source}:${customerId}`);
    return this.sales.get(`${year}|${source}|${customerId}`) ?? [];
  }
}

class FakeBusinessDate implements BusinessDateSource {
  reads = 0;
  constructor(private readonly date: string) {}
  async getCurrentBusinessDate() {
    this.reads += 1;
    return this.date;
  }
}

function billingRow(year: number, month: number, salesCount: number, billed: string, gain: string, transport: string, expenses: string): BillingMonthRecord {
  return { year, month, salesCount, billedArs: D(billed), gainArs: D(gain), transportArs: D(transport), expensesArs: D(expenses) };
}

function productRow(n: number, units: number, billed: string, contribution: string): ProductTotalsRecord {
  return {
    productId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    productName: `Producto ${n}`,
    units,
    billedArs: D(billed),
    costArs: D(billed).minus(D(contribution)),
    contributionArs: D(contribution),
  };
}

function entityRow(source: CustomerSource, customerId: string | null, name: string | null, count: number, billed: string, first: string, last: string): EntityTotalsRecord {
  return { customerSource: source, customerId, customerName: name, salesCount: count, billedArs: D(billed), firstPurchaseDate: first, lastPurchaseDate: last };
}

function setup(asOf = AS_OF) {
  const repo = new FakeReportingRepository();
  const date = new FakeBusinessDate(asOf);
  return { repo, date, service: new ReportingService(repo, date) };
}

/** Recorre un DTO y falla si encuentra un Decimal (o cualquier instancia no plana). */
function assertPlain(value: unknown, path = 'dto'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') return;
  if (Array.isArray(value)) return value.forEach((v, i) => assertPlain(v, `${path}[${i}]`));
  assert.strictEqual(typeof value, 'object', `${path}: tipo inesperado`);
  assert.strictEqual(Object.getPrototypeOf(value), Object.prototype, `${path}: no es un objeto plano (¿Decimal?)`);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertPlain(v, `${path}.${k}`);
}

/** Campos monetarios / porcentuales / días deben ser string (o null), nunca number. */
function assertNoNumericMoney(value: unknown, path = 'dto'): void {
  const allowedNumbers = new Set(['year', 'month', 'salesCount', 'units', 'currentYear', 'selectedYear']);
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoNumericMoney(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'number') assert.ok(allowedNumbers.has(k), `${path}.${k} no debe ser number`);
    if (/Ars$|Pct$|Days$|^value$|^total$|^pct$/.test(k)) assert.ok(v === null || typeof v === 'string', `${path}.${k} debe ser string|null`);
    assertNoNumericMoney(v, `${path}.${k}`);
  }
}

test('REPORTES R4.5 — Service: resolveYears', async (t) => {
  await t.test('sin datos → solo el año actual (fecha comercial, no del sistema)', async () => {
    const { service, date } = setup('2031-03-04');
    assert.deepStrictEqual(await service.resolveYears(), { asOfDate: '2031-03-04', currentYear: 2031, selectedYear: 2031, availableYears: [2031] });
    assert.strictEqual(date.reads, 1, 'la fecha comercial se lee una sola vez');
  });
  await t.test('varios años; pedido válido se respeta', async () => {
    const { service, repo } = setup();
    repo.firstYear = 2023;
    const years = await service.resolveYears(2024);
    assert.deepStrictEqual(years.availableYears, [2026, 2025, 2024, 2023]);
    assert.strictEqual(years.selectedYear, 2024);
    assert.deepStrictEqual(repo.calls, [`first:${AS_OF}`]);
  });
  await t.test('pedido futuro, anterior al primer año o no entero → año actual', async () => {
    const { service, repo } = setup();
    repo.firstYear = 2023;
    for (const requested of [2027, 2022, 1990, 2024.5, Number.NaN]) {
      assert.strictEqual((await service.resolveYears(requested)).selectedYear, 2026, `pedido ${requested}`);
    }
    assert.strictEqual((await service.resolveYears()).selectedYear, 2026);
  });
});

test('REPORTES R4.5 — Service: getBilling', async (t) => {
  await t.test('resumen exacto, 12 meses (futuros null), 3 años ascendentes', async () => {
    const { service, repo } = setup();
    repo.billing = [
      billingRow(2023, 6, 9, '999', '999', '0', '0'), // fuera de la ventana de 3 años
      billingRow(2024, 5, 1, '100', '10', '0', '0'),
      billingRow(2025, 12, 1, '200', '20', '0', '5'),
      billingRow(2026, 1, 0, '0', '0', '0', '50'),
      billingRow(2026, 3, 2, '1000.5', '250.25', '30', '10'),
      billingRow(2026, 10, 1, '0.000001', '-1', '0', '0'),
    ];
    const billing = await service.getBilling(await service.resolveYears());
    const s = billing.summary;
    assert.deepStrictEqual(
      [s.billedArs.toString(), s.gainArs.toString(), s.expensesArs.toString(), s.transportArs.toString(), s.salesCount],
      ['1000.500001', '249.25', '60', '30', 3]
    );
    assert.strictEqual(s.marginPct?.toString(), D('249.25').times(100).div(D('1000.500001')).toString());
    assert.strictEqual(billing.monthly.length, 12);
    assert.deepStrictEqual(
      billing.monthly.map((p) => p.billedArs?.toString() ?? null),
      ['0', '0', '1000.5', '0', '0', '0', '0', '0', '0', '0.000001', null, null]
    );
    assert.strictEqual(billing.monthly[0].expensesArs?.toString(), '50');
    assert.deepStrictEqual(billing.monthly[11], { month: 12, billedArs: null, gainArs: null, expensesArs: null });
    assert.deepStrictEqual(
      billing.byYear.map((y) => [y.year, y.billedArs.toString(), y.gainArs.toString()]),
      [[2024, '100', '10'], [2025, '200', '20'], [2026, '1000.500001', '249.25']]
    );
  });
  await t.test('año cerrado sin facturación: margen null, 12 meses en 0 (ninguno null)', async () => {
    const { service, repo } = setup();
    repo.firstYear = 2024;
    const billing = await service.getBilling(await service.resolveYears(2025));
    assert.strictEqual(billing.summary.marginPct, null);
    assert.strictEqual(billing.summary.billedArs.toString(), '0');
    assert.ok(billing.monthly.every((p) => p.billedArs?.toString() === '0'));
    assert.deepStrictEqual(billing.byYear.map((y) => y.year), [2023, 2024, 2025]);
  });
});

test('REPORTES R4.5 — Service: getProducts', async (t) => {
  const { service, repo } = setup();
  repo.products = Array.from({ length: 12 }, (_, i) => productRow(i + 1, 12 - i, String((i + 1) * 100), i === 11 ? '-50' : String(10 * (i + 1))));
  const products = await service.getProducts(await service.resolveYears());

  await t.test('rows con todos los productos y etiqueta = nombre actual', () => {
    assert.strictEqual(products.rows.length, 12);
    assert.strictEqual(products.rows[0].label, 'Producto 1');
  });
  await t.test('rankings Top 10 por métrica (DESC, desempate productId ASC)', () => {
    assert.strictEqual(products.rankings.units.length, 10);
    assert.strictEqual(products.rankings.units[0].label, 'Producto 1');
    assert.strictEqual(products.rankings.billed[0].label, 'Producto 12');
    assert.strictEqual(products.rankings.contribution[0].label, 'Producto 11');
    assert.strictEqual(products.rankings.contribution.at(-1)?.label, 'Producto 2');
  });
  await t.test('participación Top 4 + Otros; contribución negativa → hasNegative', () => {
    assert.deepStrictEqual(products.share.billed.slices.map((s) => s.key).slice(4), ['OTHERS']);
    assert.strictEqual(products.share.billed.slices.length, 5);
    assert.strictEqual(products.share.billed.hasNegative, false);
    assert.strictEqual(products.share.units.total.toString(), '78');
    assert.strictEqual(products.share.contribution.hasNegative, true);
    assert.ok(products.share.contribution.slices.every((s) => s.sharePct === null));
  });
});

test('REPORTES R4.5 — Service: getCustomers', async (t) => {
  const { service, repo } = setup();
  repo.entities.set(2026, [
    entityRow('CONSUMER_FINAL', null, null, 2, '500', '2026-04-04', '2026-04-04'),
    entityRow('REGISTERED_CUSTOMER', UUID_A, 'Peluquería Ana', 3, '3000', '2026-01-10', '2026-03-10'),
    entityRow('MERCADO_LIBRE', null, null, 1, '1000', '2026-02-02', '2026-02-02'),
  ]);
  const customers = await service.getCustomers(await service.resolveYears());

  await t.test('pide año y año anterior (en paralelo)', () => {
    assert.ok(repo.calls.includes(`entities:2026:${AS_OF}`));
    assert.ok(repo.calls.includes(`entities:2025:${AS_OF}`));
  });
  await t.test('registrado, ML y CF con clave, etiqueta y KPIs exactos', () => {
    const flat = customers.topBuyers.map((e) => [
      e.entityKey, e.customerSource, e.customerId, e.label, e.salesCount, e.billedArs.toString(),
      e.monthlyAverageArs.toString(), e.ticketAverageArs?.toString() ?? null, e.lastPurchaseDate, e.frequencyDays?.toString() ?? null,
    ]);
    assert.deepStrictEqual(flat, [
      [`CLI:${UUID_A}`, 'REGISTERED_CUSTOMER', UUID_A, 'Peluquería Ana', 3, '3000', '300', '1000', '2026-03-10', '29.5'],
      ['ML', 'MERCADO_LIBRE', null, 'Mercado Libre', 1, '1000', '100', '1000', '2026-02-02', null],
      ['CF', 'CONSUMER_FINAL', null, 'Consumidor Final', 2, '500', '50', '250', '2026-04-04', '0'],
    ]);
  });
  await t.test('entidades seleccionables: solo con ventas, por etiqueta', () => {
    assert.deepStrictEqual(customers.selectableEntities, [
      { entityKey: 'CF', label: 'Consumidor Final' },
      { entityKey: 'ML', label: 'Mercado Libre' },
      { entityKey: `CLI:${UUID_A}`, label: 'Peluquería Ana' },
    ]);
  });
  await t.test('concentración del año con datos; año anterior sin datos → null (nunca 0%)', () => {
    assert.strictEqual(customers.concentration.year, 2026);
    assert.strictEqual(customers.concentration.hasData, true);
    assert.deepStrictEqual([customers.concentration.top5Pct?.toString(), customers.concentration.restPct?.toString()], ['100', '0']);
    assert.deepStrictEqual(customers.concentrationPrevious, {
      year: 2025, hasData: false, totalBilledArs: D(0), top5Pct: null, top10Pct: null, restPct: null, slices: null,
    });
  });
  await t.test('Top 10 con más de 10 entidades; concentración usa todas', async () => {
    const big = setup();
    big.repo.entities.set(2026, Array.from({ length: 12 }, (_, i) =>
      entityRow('REGISTERED_CUSTOMER', `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, `Cliente ${String(i + 1).padStart(2, '0')}`, 1, String(100 - i), '2026-01-01', '2026-01-01')));
    big.repo.entities.set(2025, [entityRow('MERCADO_LIBRE', null, null, 1, '7', '2025-05-05', '2025-05-05')]);
    const c = await big.service.getCustomers(await big.service.resolveYears());
    assert.strictEqual(c.topBuyers.length, 10);
    assert.strictEqual(c.topBuyers[0].label, 'Cliente 01');
    assert.strictEqual(c.selectableEntities.length, 12);
    assert.strictEqual(c.concentration.totalBilledArs.toString(), String(Array.from({ length: 12 }, (_, i) => 100 - i).reduce((a, b) => a + b, 0)));
    assert.strictEqual(c.concentrationPrevious.hasData, true);
    assert.strictEqual(c.concentrationPrevious.top5Pct?.toString(), '100');
  });
});

test('REPORTES R4.5 — Service: getEntityAnalysis', async (t) => {
  const { service, repo } = setup();
  repo.entities.set(2026, [
    entityRow('REGISTERED_CUSTOMER', UUID_A, 'Peluquería Ana', 3, '3000', '2026-01-10', '2026-03-10'),
    entityRow('MERCADO_LIBRE', null, null, 1, '1000', '2026-02-02', '2026-02-02'),
  ]);
  const saleA = (id: number, date: string, total: string): EntitySaleRecord => ({
    remittanceId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, rtoCode: `RTO${id}`, businessDate: date, totalOrderArs: D(total),
  });
  repo.sales.set(`2026|REGISTERED_CUSTOMER|${UUID_A}`, [saleA(3, '2026-03-10', '1000'), saleA(2, '2026-03-01', '999.999999'), saleA(1, '2026-01-10', '1000.000001')]);
  repo.sales.set('2026|MERCADO_LIBRE|null', [saleA(9, '2026-02-02', '1000')]);
  const years = await service.resolveYears();

  await t.test('cliente registrado: KPIs, serie mensual (futuros null) e historial en orden del Repository', async () => {
    const analysis = await service.getEntityAnalysis(years, `CLI:${UUID_A}`);
    assert.ok(analysis);
    assert.strictEqual(analysis.year, 2026);
    assert.strictEqual(analysis.entity.label, 'Peluquería Ana');
    assert.strictEqual(analysis.entity.frequencyDays?.toString(), '29.5');
    assert.deepStrictEqual(
      analysis.monthly.map((p) => p.billedArs?.toString() ?? null),
      ['1000.000001', '0', '1999.999999', '0', '0', '0', '0', '0', '0', '0', null, null]
    );
    assert.deepStrictEqual(Object.keys(analysis.monthly[0]).sort(), ['billedArs', 'month']);
    assert.deepStrictEqual(analysis.history.map((h) => h.rtoCode), ['RTO3', 'RTO2', 'RTO1']);
  });
  await t.test('clave con UUID en mayúsculas se normaliza y encuentra la entidad', async () => {
    const analysis = await service.getEntityAnalysis(years, `CLI:${UUID_A.toUpperCase()}`);
    assert.strictEqual(analysis?.entity.entityKey, `CLI:${UUID_A}`);
  });
  await t.test('Mercado Libre: customerId null hacia el Repository', async () => {
    const analysis = await service.getEntityAnalysis(years, 'ML');
    assert.strictEqual(analysis?.entity.label, 'Mercado Libre');
    assert.ok(repo.calls.includes('sales:2026:MERCADO_LIBRE:null'));
    assert.strictEqual(analysis?.history.length, 1);
  });
  await t.test('entidad sin ventas en el año → null; clave inválida → DomainError', async () => {
    assert.strictEqual(await service.getEntityAnalysis(years, `CLI:${UUID_B}`), null);
    assert.strictEqual(await service.getEntityAnalysis(years, 'CF'), null);
    await assert.rejects(service.getEntityAnalysis(years, 'NO-VALIDA'), DomainError);
  });
});

test('REPORTES R4.5 — DTOs: serialización sin Decimal ni number monetario', async (t) => {
  const { service, repo } = setup();
  repo.firstYear = 2025;
  repo.billing = [billingRow(2026, 2, 1, '12345678901234.123456', '0.000001', '1', '2')];
  repo.products = [productRow(1, 1, '0.000001', '0.000001'), productRow(2, 1, '10000000000000', '-1')];
  repo.entities.set(2026, [entityRow('MERCADO_LIBRE', null, null, 1, '10', '2026-02-02', '2026-02-02')]);
  repo.sales.set('2026|MERCADO_LIBRE|null', [{ remittanceId: UUID_B, rtoCode: 'RTO1', businessDate: '2026-02-02', totalOrderArs: D('10') }]);
  const years = await service.resolveYears();
  const billing = serializeReportingBilling(await service.getBilling(years));
  const products = serializeReportingProducts(await service.getProducts(years));
  const customers = serializeReportingCustomers(await service.getCustomers(years));
  const analysis = await service.getEntityAnalysis(years, 'ML');
  assert.ok(analysis);
  const entity = serializeReportingEntityAnalysis(analysis);
  const all = { years: serializeReportingYears(years), billing, products, customers, entity };

  await t.test('objetos planos (sin Decimal) y ningún importe/porcentaje/día como number', () => {
    assertPlain(all);
    assertNoNumericMoney(all);
  });
  await t.test('importes exactos y nulls con significado (meses futuros, margen, sin datos)', () => {
    assert.strictEqual(billing.summary.billedArs, '12345678901234.123456');
    assert.strictEqual(billing.monthly[1].billedArs, '12345678901234.123456');
    assert.deepStrictEqual(billing.monthly[11], { month: 12, billedArs: null, gainArs: null, expensesArs: null });
    assert.strictEqual(entity.monthly[11].billedArs, null);
    assert.strictEqual(entity.monthly[0].billedArs, '0');
    assert.strictEqual(customers.concentrationPrevious.hasData, false);
    assert.deepStrictEqual(
      [customers.concentrationPrevious.top5Pct, customers.concentrationPrevious.top10Pct, customers.concentrationPrevious.restPct, customers.concentrationPrevious.slices],
      [null, null, null, null]
    );
    assert.strictEqual(customers.topBuyers[0].frequencyDays, null);
    assert.strictEqual(customers.topBuyers[0].customerId, null);
  });
  await t.test('notación decimal normal aun para valores muy pequeños (sin exponente)', () => {
    const tiny = products.share.billed.slices.find((s) => s.key.endsWith('000000000001'));
    assert.ok(tiny?.sharePct);
    assert.doesNotMatch(tiny.sharePct, /e/i);
    assert.strictEqual(new Decimal(tiny.sharePct).toString(), D('0.000001').times(100).div(D('10000000000000.000001')).toString());
  });
});

// ----------------------------------------------------------------------
// Server Action: guard real + sesión simulada (patrón actions-authorization)
// ----------------------------------------------------------------------
const AUTHORIZED_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ID = '00000000-0000-4000-8000-0000000000bb';
delete process.env.STEFFEN_AUTHORIZED_USER_IDS;
process.env.STEFFEN_AUTHORIZED_USER_ID = AUTHORIZED_ID;

let sessionUser: { id: string; email: string } | null = null;
let serviceRequests = 0;
const actionRepo = new FakeReportingRepository();
actionRepo.firstYear = 2025;
actionRepo.entities.set(2026, [entityRow('CONSUMER_FINAL', null, null, 1, '42.5', '2026-05-05', '2026-05-05')]);
actionRepo.sales.set('2026|CONSUMER_FINAL|null', [{ remittanceId: UUID_B, rtoCode: 'RTO7', businessDate: '2026-05-05', totalOrderArs: D('42.5') }]);
const actionService = new ReportingService(actionRepo, new FakeBusinessDate(AS_OF));

mock.module('next/headers', { namedExports: { cookies: async () => ({ getAll: () => [], set: () => undefined }) } });
mock.module('next/cache', { namedExports: { revalidatePath: () => undefined } });
mock.module('@supabase/ssr', {
  namedExports: { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) } }) },
});
mock.module('@/services/composition', {
  namedExports: {
    getReportingService: () => {
      serviceRequests += 1;
      return actionService;
    },
  },
});

test('REPORTES R4.5 — getReportingEntityAnalysisAction: autorización y resultado', async (t) => {
  const { getReportingEntityAnalysisAction } = await import('../src/actions/reporting.actions');

  await t.test('sin sesión → rechazada sin tocar el servicio', async () => {
    sessionUser = null;
    serviceRequests = 0;
    const res = await getReportingEntityAnalysisAction(2026, 'CF');
    assert.strictEqual(res.success, false);
    assert.match(res.error ?? '', /sesión autenticada|Acceso denegado/i);
    assert.strictEqual(serviceRequests, 0);
  });
  await t.test('usuario no autorizado → rechazada sin tocar el servicio', async () => {
    sessionUser = { id: OTHER_ID, email: 'otro@example.com' };
    serviceRequests = 0;
    const res = await getReportingEntityAnalysisAction(2026, 'CF');
    assert.strictEqual(res.success, false);
    assert.match(res.error ?? '', /Acceso prohibido/i);
    assert.strictEqual(serviceRequests, 0);
  });
  await t.test('operador autorizado → DTO serializado (fecha resuelta en servidor)', async () => {
    sessionUser = { id: AUTHORIZED_ID, email: 'operador@example.com' };
    const res = await getReportingEntityAnalysisAction(2026, 'CF');
    assert.strictEqual(res.success, true);
    assert.ok(res.data);
    assertPlain(res.data);
    assert.strictEqual(res.data.year, 2026);
    assert.strictEqual(res.data.entity.label, 'Consumidor Final');
    assert.strictEqual(res.data.entity.billedArs, '42.5');
    assert.deepStrictEqual(res.data.history.map((h) => h.rtoCode), ['RTO7']);
  });
  await t.test('año no disponible → año actual; entidad sin ventas → data null; clave inválida → error', async () => {
    sessionUser = { id: AUTHORIZED_ID, email: 'operador@example.com' };
    const fallback = await getReportingEntityAnalysisAction(2099, 'CF');
    assert.strictEqual(fallback.data?.year, 2026);
    const none = await getReportingEntityAnalysisAction(2026, 'ML');
    assert.deepStrictEqual(none, { success: true, data: null });
    const invalid = await getReportingEntityAnalysisAction(2026, 'CLI:xx');
    assert.strictEqual(invalid.success, false);
    assert.match(invalid.error ?? '', /Clave de entidad analítica inválida/);
  });
});

test('REPORTES R6 — carga inicial del Server Component y aislamiento del análisis', async (t) => {
  mock.module('@/ui/reporting/ReportingDashboard', { namedExports: { ReportingDashboard: () => null } });
  mock.module('next/navigation', {
    namedExports: { redirect: (location: string): never => { throw new Error(`REDIRECT:${location}`); } },
  });
  const { default: page } = await import('../src/app/(erp)/reportes/page');

  await t.test('sin autorización redirige antes de consultar el servicio', async () => {
    serviceRequests = 0;
    for (const user of [null, { id: OTHER_ID, email: 'otro@example.com' }]) {
      sessionUser = user;
      await assert.rejects(() => page({}), /REDIRECT:\/login/);
    }
    assert.strictEqual(serviceRequests, 0);
  });

  await t.test('primera entidad precargada como DTO exacto usando el mismo año y corte', async () => {
    sessionUser = { id: AUTHORIZED_ID, email: 'operador@example.com' };
    serviceRequests = 0;
    actionRepo.calls = [];
    const result = await page({ searchParams: Promise.resolve({ year: '2026' }) });
    const props = result.props as ReportingDashboardProps;
    assertPlain(props);
    assert.strictEqual(serviceRequests, 1);
    assert.strictEqual(props.initialAnalysis?.status, 'ready');
    if (props.initialAnalysis?.status !== 'ready') throw new Error('Falta el análisis inicial');
    assert.strictEqual(props.initialAnalysis.entityKey, 'CF');
    assert.strictEqual(props.initialAnalysis.year, props.years?.selectedYear);
    assert.strictEqual(props.initialAnalysis.data?.entity.billedArs, '42.5');
    assert.strictEqual(props.initialAnalysis.data?.history[0].rtoCode, 'RTO7');
    assert.strictEqual(actionRepo.calls.filter(call => call.startsWith('first:')).length, 1);
    assert.ok(actionRepo.calls.includes(`billing:2026:${AS_OF}`));
    assert.ok(actionRepo.calls.includes(`products:2026:${AS_OF}`));
    assert.strictEqual(actionRepo.calls.filter(call => call === 'sales:2026:CONSUMER_FINAL:null').length, 1);
  });

  await t.test('fallo individual no elimina otros bloques; sin entidades no consulta ventas', async () => {
    const failingSales = mock.method(actionRepo, 'getEntitySales', async () => { throw new Error('detalle interno'); });
    try {
      const props = (await page({})).props as ReportingDashboardProps;
      assert.ok(props.billing && props.products && props.customers);
      assert.strictEqual(props.initialAnalysis?.status, 'error');
      assert.doesNotMatch(JSON.stringify(props.initialAnalysis), /detalle interno/);
    } finally {
      failingSales.mock.restore();
    }
    const original = actionRepo.entities.get(2026)!;
    actionRepo.entities.set(2026, []);
    actionRepo.calls = [];
    try {
      const props = (await page({})).props as ReportingDashboardProps;
      assert.strictEqual(props.initialAnalysis, null);
      assert.ok(!actionRepo.calls.some(call => call.startsWith('sales:')));
    } finally {
      actionRepo.entities.set(2026, original);
    }
  });
});
