import test from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/database/types';
import { DomainError } from '../src/domain/errors';
import { ReportingRepository } from '../src/repositories/reporting.repository';

/**
 * REPORTES R4.4 — Migración 36 (funciones analíticas READ-ONLY) + ReportingRepository
 * contra la DB DEV compartida.
 *
 * Aislamiento:
 *  - SOLO DEV (ref vhvvomwysxmeumlzrhdk): si la URL no coincide, el archivo aborta
 *    antes de crear cualquier cliente.
 *  - Fixtures en años artificiales (2090–2093 y 1985–1987) con p_as_of_date
 *    explícito: los datos reales de DEV (2026) quedan fuera de cada consulta.
 *  - Filas mínimas insertadas directamente (sin RPCs operativas): no generan
 *    stock, caja, MST ni MOV. Códigos con la secuencia canónica de tests (TST).
 *  - NUNCA se crean RTO en RTM_PENDING: confirm_order_to_remittance_atomic
 *    rechaza confirmar cualquier RTO mientras exista uno en RTM_PENDING en todo
 *    el ERP (gate global, migración 26). La exclusión de ventas fuera de contrato
 *    se prueba con RTO COMPLETED sin RTM (INNER JOIN), que no activa ese gate.
 *  - Limpieza por UUID en `finally`, verificada al final (cero filas residuales).
 */

const DEV_REF = 'vhvvomwysxmeumlzrhdk';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (url !== `https://${DEV_REF}.supabase.co`) {
  throw new Error(`reporting-db.test.ts solo puede ejecutarse contra DEV (${DEV_REF}). Abortado.`);
}
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const server = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
const repo = new ReportingRepository(server);

type CustomerSource = 'REGISTERED_CUSTOMER' | 'MERCADO_LIBRE' | 'CONSUMER_FINAL';

const created = {
  customers: [] as string[],
  baseProducts: [] as string[],
  stockItems: [] as string[],
  orders: [] as string[],
  remittances: [] as string[],
  margins: [] as string[],
  operations: [] as string[],
  expenses: [] as string[],
  authUsers: [] as string[],
};

async function nextCode(): Promise<string> {
  const { data, error } = await server.rpc('get_next_code_sequence', { p_prefix: 'TST' });
  assert.ifError(error);
  assert.ok(typeof data === 'string');
  return data;
}

async function createOperation(operationType: string, businessDate: string): Promise<string> {
  const id = randomUUID();
  const { error } = await server.from('business_operations').insert({ id, operation_type: operationType, business_date: businessDate });
  assert.ifError(error);
  created.operations.push(id);
  return id;
}

interface SaleLine {
  productId: string;
  qty: number;
  price: number;
}
interface CostLine {
  productId: string;
  qty: number;
  totalCost: number;
}
interface SaleSpec {
  date: string;
  source: CustomerSource;
  customerId: string | null;
  recipient?: string;
  /** false → RTO COMPLETED sin RTM (fuera de contrato). Nunca RTM_PENDING (ver encabezado). */
  withRtm?: boolean;
  lines: SaleLine[];
  total: number;
  costs: CostLine[];
  transport?: number;
  createdAt?: string;
}

/** RTO (+ RTM opcional) mínimo y coherente: subtotal = Σ líneas > 0, gain = total − costo − transporte. */
async function createSale(spec: SaleSpec): Promise<{ remittanceId: string; code: string }> {
  const status = 'COMPLETED';
  const withRtm = spec.withRtm ?? true;
  const subtotal = spec.lines.reduce((acc, l) => acc + l.qty * l.price, 0);
  assert.ok(subtotal > 0, 'fixture inválido: subtotal debe ser > 0');

  const rtoOp = await createOperation('SALE_RTO', spec.date);
  const orderId = randomUUID();
  const { error: orderErr } = await server.from('orders').insert({
    id: orderId,
    code: await nextCode(),
    status: 'CONVERTED',
    customer_source: spec.source,
    customer_id: spec.customerId,
    price_list_id: priceListId,
    business_date: spec.date,
  });
  assert.ifError(orderErr);
  created.orders.push(orderId);

  const remittanceId = randomUUID();
  const code = await nextCode();
  const { error: remErr } = await server.from('remittances').insert({
    id: remittanceId,
    code,
    operation_id: rtoOp,
    order_id: orderId,
    status,
    customer_source: spec.source,
    customer_id: spec.customerId,
    recipient_name_snapshot: spec.recipient ?? null,
    weight_kg_snapshot: 0,
    subtotal_ars: subtotal,
    total_order_ars: spec.total,
    prior_balance_snapshot_ars: 0,
    total_to_collect_ars: spec.total,
    ...(spec.createdAt ? { created_at: spec.createdAt } : {}),
  });
  assert.ifError(remErr);
  created.remittances.push(remittanceId);

  const { error: itemsErr } = await server.from('remittance_items').insert(
    spec.lines.map((l) => ({
      remittance_id: remittanceId,
      product_id: l.productId,
      product_code_snapshot: productCodes.get(l.productId) ?? 'SNAP',
      product_name_snapshot: 'NOMBRE SNAPSHOT HISTORICO',
      presentation_snapshot: 'TEST',
      weight_kg_snapshot: 0,
      quantity_sent: l.qty,
      unit_price_ars_snapshot: l.price,
      line_total_ars: l.qty * l.price,
    }))
  );
  assert.ifError(itemsErr);

  if (withRtm) {
    const rtmOp = await createOperation('SALE_RTM', spec.date);
    const marginId = randomUUID();
    const cost = spec.costs.reduce((acc, c) => acc + c.totalCost, 0);
    const transport = spec.transport ?? 0;
    const { error: mrErr } = await server.from('margin_remittances').insert({
      id: marginId,
      code: await nextCode(),
      operation_id: rtmOp,
      remittance_id: remittanceId,
      products_cost_total_ars: cost,
      transport_cost_ars: transport,
      gain_ars: spec.total - cost - transport,
    });
    assert.ifError(mrErr);
    created.margins.push(marginId);
    const { error: mriErr } = await server.from('margin_remittance_items').insert(
      spec.costs.map((c) => ({
        margin_remittance_id: marginId,
        product_id: c.productId,
        quantity_sent: c.qty,
        unit_cost_theoretical_snapshot_ars: c.qty > 0 ? c.totalCost / c.qty : 0,
        total_cost_snapshot_ars: c.totalCost,
      }))
    );
    assert.ifError(mriErr);
  }
  return { remittanceId, code };
}

async function createExpense(spec: {
  date: string;
  operationType: 'OPERATING_EXPENSE' | 'MARKETPLACE_SETTLEMENT';
  expenseType: 'LUZ' | 'ALQUILER' | 'COMISIÓN' | 'OTRO';
  amount: number;
  accountId: string;
  description?: string;
}): Promise<void> {
  const op = await createOperation(spec.operationType, spec.date);
  const id = randomUUID();
  const { error } = await server.from('operating_expenses').insert({
    id,
    operation_id: op,
    expense_type: spec.expenseType,
    description: spec.description ?? null,
    amount_ars: spec.amount,
    source_account_id: spec.accountId,
  });
  assert.ifError(error);
  created.expenses.push(id);
}

async function cleanup(): Promise<void> {
  const del = async (table: keyof Database['public']['Tables'], column: string, ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await server.from(table).delete().in(column, ids);
    assert.ifError(error);
  };
  await del('margin_remittances', 'id', created.margins);
  await del('remittances', 'id', created.remittances);
  await del('orders', 'id', created.orders);
  await del('operating_expenses', 'id', created.expenses);
  await del('business_operations', 'id', created.operations);
  await del('products', 'stock_item_id', created.stockItems);
  await del('stock_items', 'id', created.stockItems);
  await del('base_products', 'id', created.baseProducts);
  await del('customers', 'id', created.customers);
  for (const userId of created.authUsers) {
    await server.auth.admin.deleteUser(userId);
  }

  const residual = async (table: keyof Database['public']['Tables'], column: string, ids: string[]) => {
    if (ids.length === 0) return 0;
    const { count, error } = await server.from(table).select('*', { count: 'exact', head: true }).in(column, ids);
    assert.ifError(error);
    return count ?? 0;
  };
  const leftovers = {
    margin_remittances: await residual('margin_remittances', 'id', created.margins),
    margin_remittance_items: await residual('margin_remittance_items', 'margin_remittance_id', created.margins),
    remittances: await residual('remittances', 'id', created.remittances),
    remittance_items: await residual('remittance_items', 'remittance_id', created.remittances),
    orders: await residual('orders', 'id', created.orders),
    operating_expenses: await residual('operating_expenses', 'id', created.expenses),
    business_operations: await residual('business_operations', 'id', created.operations),
    products: await residual('products', 'stock_item_id', created.stockItems),
    stock_items: await residual('stock_items', 'id', created.stockItems),
    base_products: await residual('base_products', 'id', created.baseProducts),
    customers: await residual('customers', 'id', created.customers),
  };
  assert.deepStrictEqual(
    Object.entries(leftovers).filter(([, n]) => n > 0),
    [],
    `Fixtures residuales en DEV: ${JSON.stringify(leftovers)}`
  );
}

let priceListId = '';
let cashSteffenId = '';
let cashMlId = '';
const productCodes = new Map<string, string>();

const str = (d: { toString(): string }) => d.toString();

test('REPORTES R4.4 — migración 36 + ReportingRepository (DEV)', async (t) => {
  try {
    // ------------------------------------------------------------------
    // Referencias existentes (solo lectura)
    // ------------------------------------------------------------------
    const { data: lists, error: listErr } = await server.from('price_lists').select('id').eq('active', true).limit(1);
    assert.ifError(listErr);
    assert.ok(lists && lists.length === 1, 'se requiere una lista de precios activa');
    priceListId = lists[0].id;
    const { data: cash, error: cashErr } = await server
      .from('financial_accounts')
      .select('id, account_type')
      .in('account_type', ['CASH_STEFFEN', 'CASH_MERCADO_LIBRE']);
    assert.ifError(cashErr);
    cashSteffenId = cash?.find((a) => a.account_type === 'CASH_STEFFEN')?.id ?? '';
    cashMlId = cash?.find((a) => a.account_type === 'CASH_MERCADO_LIBRE')?.id ?? '';
    assert.ok(cashSteffenId && cashMlId);

    // ------------------------------------------------------------------
    // Maestros de prueba: 2 clientes (uno inactivo), 1 PBA, 4 PRO (ids ordenados)
    // ------------------------------------------------------------------
    const customerActive = randomUUID();
    const customerInactive = randomUUID();
    for (const [id, name, active] of [
      [customerActive, 'TEST REPORTES Cliente Activo', true],
      [customerInactive, 'TEST REPORTES Cliente Inactivo', false],
    ] as const) {
      const { error } = await server.from('customers').insert({ id, code: await nextCode(), name, active });
      assert.ifError(error);
      created.customers.push(id);
    }

    const baseProductId = randomUUID();
    {
      const { error } = await server.from('base_products').insert({ id: baseProductId, code: await nextCode(), name: 'TEST REPORTES PBA' });
      assert.ifError(error);
      created.baseProducts.push(baseProductId);
    }
    const [P1, P2, P3, P4] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort();
    for (const [i, id] of [P1, P2, P3, P4].entries()) {
      const code = await nextCode();
      productCodes.set(id, code);
      const { error: siErr } = await server.from('stock_items').insert({
        id,
        code,
        item_type: 'PRO',
        name: `TEST REPORTES P${i + 1}`,
        unit_type: 'UNIT',
        stock_minimum: 1,
      });
      assert.ifError(siErr);
      created.stockItems.push(id);
      const { error: pErr } = await server.from('products').insert({
        stock_item_id: id,
        base_product_id: baseProductId,
        presentation: 'TEST',
        weight_kg: 1,
      });
      assert.ifError(pErr);
    }

    // ------------------------------------------------------------------
    // Ventas 2090–2093 (p_year = 2093, p_as_of_date = 2093-06-15)
    // ------------------------------------------------------------------
    const Y = 2093;
    const AS_OF = '2093-06-15';

    // S_A: cliente registrado; P1 repetido (2 + 1 líneas); descuento 25 %; costo P2 = 0; transporte 200.
    //      recipient_name_snapshot 'Mercado Libre' NO define identidad.
    const sA = await createSale({
      date: '2093-02-10',
      source: 'REGISTERED_CUSTOMER',
      customerId: customerActive,
      recipient: 'Mercado Libre',
      lines: [
        { productId: P1, qty: 2, price: 1000 },
        { productId: P1, qty: 1, price: 1000 },
        { productId: P2, qty: 1, price: 1000 },
      ],
      total: 3000,
      costs: [
        { productId: P1, qty: 2, totalCost: 500 },
        { productId: P1, qty: 1, totalCost: 250 },
        { productId: P2, qty: 1, totalCost: 0 },
      ],
      transport: 200,
    });
    // S_B: Mercado Libre; empate de bruto (3 × 1000) → residuo +0,000001 a P1 (product_id ASC).
    const sB = await createSale({
      date: '2093-03-05',
      source: 'MERCADO_LIBRE',
      customerId: null,
      recipient: 'Juan Pérez',
      lines: [
        { productId: P1, qty: 1, price: 1000 },
        { productId: P2, qty: 1, price: 1000 },
        { productId: P3, qty: 1, price: 1000 },
      ],
      total: 1000,
      costs: [
        { productId: P1, qty: 1, totalCost: 100 },
        { productId: P2, qty: 1, totalCost: 400 },
        { productId: P3, qty: 1, totalCost: 0 },
      ],
      createdAt: '2093-03-05T09:00:00Z',
    });
    // S_C: Consumidor Final; brutos 100/100/400, total 1 → redondeos 0,166667/0,166667/0,666667,
    //      residuo −0,000001 al MAYOR bruto (P3, que tiene el product_id más alto).
    const sC = await createSale({
      date: '2093-03-05',
      source: 'CONSUMER_FINAL',
      customerId: null,
      lines: [
        { productId: P1, qty: 1, price: 100 },
        { productId: P2, qty: 1, price: 100 },
        { productId: P3, qty: 1, price: 400 },
      ],
      total: 1,
      costs: [
        { productId: P1, qty: 1, totalCost: 0 },
        { productId: P2, qty: 1, totalCost: 0 },
        { productId: P3, qty: 1, totalCost: 0 },
      ],
      transport: 50,
      createdAt: '2093-03-05T10:00:00Z',
    });
    // S_C2: Consumidor Final, misma fecha que S_C, creado después (orden created_at DESC).
    const sC2 = await createSale({
      date: '2093-03-05',
      source: 'CONSUMER_FINAL',
      customerId: null,
      lines: [{ productId: P3, qty: 1, price: 300 }],
      total: 300,
      costs: [{ productId: P3, qty: 1, totalCost: 0 }],
      createdAt: '2093-03-05T12:00:00Z',
    });
    // S_D: total_order = 0 con subtotal > 0 → atribución 0, contribución = −costo.
    const sD = await createSale({
      date: '2093-04-01',
      source: 'CONSUMER_FINAL',
      customerId: null,
      lines: [{ productId: P4, qty: 1, price: 500 }],
      total: 0,
      costs: [{ productId: P4, qty: 1, totalCost: 120 }],
    });
    // S_E: cliente INACTIVO; caso que expone el doble redondeo de ROUND(g·t/s, 6):
    //      g=1.000.000, t=1.999.999, s=2.000.001 → exacto 999999,000000 (la fórmula vieja daba ,000001).
    const sE = await createSale({
      date: '2093-05-20',
      source: 'REGISTERED_CUSTOMER',
      customerId: customerInactive,
      lines: [
        { productId: P1, qty: 1, price: 1000000 },
        { productId: P2, qty: 1, price: 1000001 },
      ],
      total: 1999999,
      costs: [
        { productId: P1, qty: 1, totalCost: 900000 },
        { productId: P2, qty: 1, totalCost: 950000 },
      ],
    });
    // Excluidas del año 2093:
    await createSale({ // posterior a p_as_of_date
      date: '2093-07-01', source: 'REGISTERED_CUSTOMER', customerId: customerActive,
      lines: [{ productId: P1, qty: 1, price: 777 }], total: 777, costs: [{ productId: P1, qty: 1, totalCost: 0 }],
    });
    await createSale({ // COMPLETED sin RTM (inconsistencia fuera de contrato): INNER JOIN lo excluye
      date: '2093-02-25', source: 'REGISTERED_CUSTOMER', customerId: customerActive, withRtm: false,
      lines: [{ productId: P2, qty: 1, price: 444 }], total: 444, costs: [],
    });
    // Años anteriores: 2092 y 2091 dentro de la comparación; 2090 fuera.
    await createSale({
      date: '2092-08-08', source: 'REGISTERED_CUSTOMER', customerId: customerActive,
      lines: [{ productId: P1, qty: 5, price: 1000 }], total: 5000, costs: [{ productId: P1, qty: 5, totalCost: 1000 }],
    });
    await createSale({
      date: '2091-12-31', source: 'MERCADO_LIBRE', customerId: null,
      lines: [{ productId: P3, qty: 1, price: 700 }], total: 700, costs: [{ productId: P3, qty: 1, totalCost: 0 }],
    });
    await createSale({
      date: '2090-06-06', source: 'CONSUMER_FINAL', customerId: null,
      lines: [{ productId: P3, qty: 1, price: 999 }], total: 999, costs: [{ productId: P3, qty: 1, totalCost: 0 }],
    });
    // Gastos operativos (la comisión ML cuelga de una operación MARKETPLACE_SETTLEMENT).
    await createExpense({ date: '2093-01-20', operationType: 'OPERATING_EXPENSE', expenseType: 'LUZ', amount: 1500.25, accountId: cashSteffenId });
    await createExpense({ date: '2093-02-28', operationType: 'MARKETPLACE_SETTLEMENT', expenseType: 'COMISIÓN', amount: 300, accountId: cashMlId });
    await createExpense({ date: '2093-06-20', operationType: 'OPERATING_EXPENSE', expenseType: 'OTRO', amount: 999, accountId: cashSteffenId, description: 'TEST REPORTES posterior al corte' });
    await createExpense({ date: '2092-01-10', operationType: 'OPERATING_EXPENSE', expenseType: 'ALQUILER', amount: 10000, accountId: cashSteffenId });

    // Etiqueta de producto = nombre ACTUAL del maestro (snapshot histórico distinto).
    {
      const { error } = await server.from('stock_items').update({ name: 'TEST REPORTES P1 RENOMBRADO' }).eq('id', P1);
      assert.ifError(error);
    }

    // ==================================================================
    // A. get_reporting_first_year (bloque aislado 1985–1987)
    // ==================================================================
    await t.test('A. first_year: sin datos → null; RTO sin RTM no cuenta; RTO COMPLETED y gasto cuentan; menor año', async () => {
      assert.strictEqual(await repo.getFirstReportingYear('1900-01-01'), null);
      await createSale({
        date: '1985-01-01', source: 'MERCADO_LIBRE', customerId: null, withRtm: false,
        lines: [{ productId: P1, qty: 1, price: 10 }], total: 10, costs: [],
      });
      await createSale({
        date: '1987-07-07', source: 'MERCADO_LIBRE', customerId: null,
        lines: [{ productId: P1, qty: 1, price: 10 }], total: 10, costs: [{ productId: P1, qty: 1, totalCost: 0 }],
      });
      assert.strictEqual(await repo.getFirstReportingYear('1985-12-31'), null, 'RTO COMPLETED sin RTM no es información relevante');
      assert.strictEqual(await repo.getFirstReportingYear('1987-12-31'), 1987, 'RTO COMPLETED cuenta');
      await createExpense({ date: '1986-03-03', operationType: 'OPERATING_EXPENSE', expenseType: 'LUZ', amount: 1, accountId: cashSteffenId });
      assert.strictEqual(await repo.getFirstReportingYear('1986-12-31'), 1986, 'gasto operativo cuenta');
      assert.strictEqual(await repo.getFirstReportingYear('1987-12-31'), 1986, 'menor año entre ventas y gastos');
    });

    // ==================================================================
    // B. get_reporting_billing_months
    // ==================================================================
    await t.test('B. billing_months: año sin datos → []', async () => {
      assert.deepStrictEqual(await repo.getBillingMonths(2097, '2097-12-31'), []);
    });

    await t.test('B. billing_months: ventas, ganancia, transporte, gastos, conteos y 3 años con corte de fecha', async () => {
      const rows = await repo.getBillingMonths(Y, AS_OF);
      const flat = rows.map((r) => [r.year, r.month, r.salesCount, str(r.billedArs), str(r.gainArs), str(r.transportArs), str(r.expensesArs)]);
      assert.deepStrictEqual(flat, [
        [2091, 12, 1, '700', '700', '0', '0'],
        [2092, 1, 0, '0', '0', '0', '10000'],
        [2092, 8, 1, '5000', '4000', '0', '0'],
        [2093, 1, 0, '0', '0', '0', '1500.25'],
        [2093, 2, 1, '3000', '2050', '200', '300'],
        [2093, 3, 3, '1301', '751', '50', '0'],
        [2093, 4, 1, '0', '-120', '0', '0'],
        [2093, 5, 1, '1999999', '149999', '0', '0'],
      ]);
      // Excluidos: 2090 (fuera de p_year−2), junio/julio 2093 (posteriores a p_as_of_date)
      // y el RTO COMPLETED sin RTM (febrero sigue con 1 venta).
    });

    await t.test('B. billing_months: importes llegan como TEXT exacto (no number)', async () => {
      const { data, error } = await server.rpc('get_reporting_billing_months', { p_year: Y, p_as_of_date: AS_OF });
      assert.ifError(error);
      const raw: unknown = data;
      assert.ok(Array.isArray(raw) && raw.length > 0);
      for (const row of raw as Record<string, unknown>[]) {
        for (const field of ['billed_ars', 'gain_ars', 'transport_ars', 'expenses_ars']) {
          assert.strictEqual(typeof row[field], 'string', `${field} debe ser texto`);
          assert.match(String(row[field]), /^-?\d+(\.\d+)?$/);
        }
      }
    });

    // ==================================================================
    // D. get_reporting_products
    // ==================================================================
    await t.test('D. products: unidades, atribución exacta, residuo, costo histórico y contribución', async () => {
      const rows = await repo.getProductTotals(Y, AS_OF);
      const byId = new Map(rows.map((r) => [r.productId, r]));
      assert.deepStrictEqual([...byId.keys()].sort(), [P1, P2, P3, P4].sort());
      const flat = (id: string) => {
        const r = byId.get(id);
        assert.ok(r);
        return [r.units, str(r.billedArs), str(r.costArs), str(r.contributionArs)];
      };
      // P1: 3 (S_A, repetido) + 1 + 1 + 1. Facturado 2250 + 333,333334 (residuo, empate → menor id)
      //     + 0,166667 + 999999,000000 (cálculo exacto; la fórmula vieja daba ,000001).
      assert.deepStrictEqual(flat(P1), [6, '1002582.500001', '900850', '101732.500001']);
      // P2: 750 + 333,333333 + 0,166667 + 1000000,000000.
      assert.deepStrictEqual(flat(P2), [4, '1001083.5', '950400', '50683.5']);
      // P3: 333,333333 + 0,666666 (recibe el residuo −0,000001 por mayor bruto) + 300; costo snapshot 0.
      assert.deepStrictEqual(flat(P3), [3, '633.999999', '0', '633.999999']);
      // P4: total_order 0 → atribución 0; contribución negativa = −costo.
      assert.deepStrictEqual(flat(P4), [1, '0', '120', '-120']);
    });

    await t.test('D. products: Σ atribuida = Σ total_order_ars del año (residuos cierran por RTO)', async () => {
      const rows = await repo.getProductTotals(Y, AS_OF);
      const billed = rows.reduce((acc, r) => acc.plus(r.billedArs), rows[0].billedArs.minus(rows[0].billedArs));
      const months = await repo.getBillingMonths(Y, AS_OF);
      const yearBilled = months.filter((m) => m.year === Y).reduce((acc, m) => acc.plus(m.billedArs), billed.minus(billed));
      assert.strictEqual(str(billed), '2004300');
      assert.strictEqual(str(yearBilled), '2004300');
    });

    await t.test('D. products: etiqueta = nombre actual del maestro, no product_name_snapshot', async () => {
      const rows = await repo.getProductTotals(Y, AS_OF);
      assert.strictEqual(rows.find((r) => r.productId === P1)?.productName, 'TEST REPORTES P1 RENOMBRADO');
      assert.strictEqual(rows.find((r) => r.productId === P4)?.productName, 'TEST REPORTES P4');
    });

    // ==================================================================
    // E. get_reporting_entities
    // ==================================================================
    await t.test('E. entities: registrados por UUID, ML y CF únicos con customer_id/name null, inactivo incluido', async () => {
      const rows = await repo.getEntityTotals(Y, AS_OF);
      const flat = rows.map((r) => [r.customerSource, r.customerId, r.customerName, r.salesCount, str(r.billedArs), r.firstPurchaseDate, r.lastPurchaseDate]);
      const expected = [
        ['CONSUMER_FINAL', null, null, 3, '301', '2093-03-05', '2093-04-01'],
        ['MERCADO_LIBRE', null, null, 1, '1000', '2093-03-05', '2093-03-05'],
        ['REGISTERED_CUSTOMER', customerActive, 'TEST REPORTES Cliente Activo', 1, '3000', '2093-02-10', '2093-02-10'],
        ['REGISTERED_CUSTOMER', customerInactive, 'TEST REPORTES Cliente Inactivo', 1, '1999999', '2093-05-20', '2093-05-20'],
      ];
      const sortKey = (r: unknown[]) => `${r[0]}|${r[1] ?? ''}`;
      assert.deepStrictEqual([...flat].sort((a, b) => sortKey(a).localeCompare(sortKey(b))), [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
    });

    await t.test('E. entities: Σ facturación de entidades = facturación total del período', async () => {
      const rows = await repo.getEntityTotals(Y, AS_OF);
      const total = rows.reduce((acc, r) => acc.plus(r.billedArs), rows[0].billedArs.minus(rows[0].billedArs));
      assert.strictEqual(str(total), '2004300');
    });

    // ==================================================================
    // F. get_reporting_entity_sales
    // ==================================================================
    await t.test('F. entity_sales: registrado, ML y CF; orden business_date DESC, created_at DESC', async () => {
      const active = await repo.getEntitySales(Y, AS_OF, 'REGISTERED_CUSTOMER', customerActive);
      assert.deepStrictEqual(active.map((s) => [s.remittanceId, s.rtoCode, s.businessDate, str(s.totalOrderArs)]), [
        [sA.remittanceId, sA.code, '2093-02-10', '3000'],
      ]);
      const inactive = await repo.getEntitySales(Y, AS_OF, 'REGISTERED_CUSTOMER', customerInactive);
      assert.deepStrictEqual(inactive.map((s) => s.remittanceId), [sE.remittanceId]);
      const ml = await repo.getEntitySales(Y, AS_OF, 'MERCADO_LIBRE', null);
      assert.deepStrictEqual(ml.map((s) => s.remittanceId), [sB.remittanceId]);
      const cf = await repo.getEntitySales(Y, AS_OF, 'CONSUMER_FINAL', null);
      assert.deepStrictEqual(cf.map((s) => [s.remittanceId, s.businessDate, str(s.totalOrderArs)]), [
        [sD.remittanceId, '2093-04-01', '0'],
        [sC2.remittanceId, '2093-03-05', '300'],
        [sC.remittanceId, '2093-03-05', '1'],
      ]);
    });

    await t.test('F. entity_sales: combinaciones inválidas → 0 filas (sin error)', async () => {
      assert.deepStrictEqual(await repo.getEntitySales(Y, AS_OF, 'MERCADO_LIBRE', customerActive), []);
      assert.deepStrictEqual(await repo.getEntitySales(Y, AS_OF, 'CONSUMER_FINAL', customerActive), []);
      assert.deepStrictEqual(await repo.getEntitySales(Y, AS_OF, 'REGISTERED_CUSTOMER', null), []);
      assert.deepStrictEqual(await repo.getEntitySales(Y, AS_OF, 'REGISTERED_CUSTOMER', randomUUID()), []);
    });

    // ==================================================================
    // Permisos (patrón phase19-1-permissions)
    // ==================================================================
    const rpcCalls = [
      ['get_reporting_first_year', { p_as_of_date: AS_OF }],
      ['get_reporting_billing_months', { p_year: Y, p_as_of_date: AS_OF }],
      ['get_reporting_products', { p_year: Y, p_as_of_date: AS_OF }],
      ['get_reporting_entities', { p_year: Y, p_as_of_date: AS_OF }],
      ['get_reporting_entity_sales', { p_year: Y, p_as_of_date: AS_OF, p_customer_source: 'MERCADO_LIBRE', p_customer_id: randomUUID() }],
    ] as const;
    const isDenied = (error: { message: string; code?: string } | null) =>
      !!error && (error.code === '42501' || /permission denied/i.test(error.message));

    await t.test('Permisos: service_role ejecuta las 5 funciones', async () => {
      for (const [fn, args] of rpcCalls) {
        const { error } = await server.rpc(fn, args);
        assert.ifError(error);
      }
    });
    await t.test('Permisos: anon no ejecuta ninguna de las 5 funciones', async () => {
      for (const [fn, args] of rpcCalls) {
        const { error } = await anon.rpc(fn, args);
        assert.ok(isDenied(error), `${fn} no debe ser ejecutable por anon (${error?.message})`);
      }
    });
    await t.test('Permisos: authenticated no ejecuta ninguna de las 5 funciones', async () => {
      const email = `reporting-r44-${randomUUID()}@test.steffen.local`;
      const password = `Pw-${randomUUID()}`;
      const { data: userData, error: userErr } = await server.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ifError(userErr);
      assert.ok(userData.user);
      created.authUsers.push(userData.user.id);
      const signIn = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
      const { data: session, error: signErr } = await signIn.auth.signInWithPassword({ email, password });
      assert.ifError(signErr);
      assert.ok(session.session?.access_token);
      const authenticated = createClient<Database>(url, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
      });
      for (const [fn, args] of rpcCalls) {
        const { error } = await authenticated.rpc(fn, args);
        assert.ok(isDenied(error), `${fn} no debe ser ejecutable por authenticated (${error?.message})`);
      }
    });
  } finally {
    await cleanup();
  }
});

// ----------------------------------------------------------------------
// ReportingRepository: adaptadores (cliente stub, sin DB)
// ----------------------------------------------------------------------
function stubRepo(rows: unknown): ReportingRepository {
  const client = { rpc: async () => ({ data: rows, error: null }) };
  return new ReportingRepository(client as unknown as SupabaseClient<Database>);
}

test('REPORTES R4.4 — ReportingRepository: adaptación y validación (stub)', async (t) => {
  await t.test('TEXT monetario → Decimal exacto sin pérdida (20 dígitos significativos)', async () => {
    const [row] = await stubRepo([
      { year: 2093, month: 2, sales_count: 3, billed_ars: '98765432109876.543211', gain_ars: '-0.000001', transport_ars: '0.000000', expenses_ars: '12345678901234.999999' },
    ]).getBillingMonths(2093, '2093-06-15');
    assert.strictEqual(row.billedArs.toString(), '98765432109876.543211');
    assert.strictEqual(row.gainArs.toString(), '-0.000001');
    assert.strictEqual(row.expensesArs.toString(), '12345678901234.999999');
  });
  await t.test('NUMERIC como number (ya con pérdida) se rechaza', async () => {
    await assert.rejects(
      stubRepo([{ year: 2093, month: 2, sales_count: 1, billed_ars: 3000.5, gain_ars: '1', transport_ars: '0', expenses_ars: '0' }]).getBillingMonths(2093, '2093-06-15'),
      DomainError
    );
  });
  await t.test('first_year NULL → null; entero → número', async () => {
    assert.strictEqual(await stubRepo([{ first_year: null }]).getFirstReportingYear('2093-06-15'), null);
    assert.strictEqual(await stubRepo([{ first_year: 2091 }]).getFirstReportingYear('2093-06-15'), 2091);
    await assert.rejects(stubRepo([]).getFirstReportingYear('2093-06-15'), DomainError);
  });
  await t.test('entidades ML/CF: customerId y customerName null', async () => {
    const rows = await stubRepo([
      { customer_source: 'MERCADO_LIBRE', customer_id: null, customer_name: null, sales_count: 2, billed_ars: '10.5', first_purchase_date: '2093-01-01', last_purchase_date: '2093-02-01' },
    ]).getEntityTotals(2093, '2093-06-15');
    assert.deepStrictEqual([rows[0].customerSource, rows[0].customerId, rows[0].customerName], ['MERCADO_LIBRE', null, null]);
  });
  await t.test('customer_source inválido se rechaza', async () => {
    await assert.rejects(
      stubRepo([
        { customer_source: 'OTRO_CANAL', customer_id: null, customer_name: null, sales_count: 1, billed_ars: '1', first_purchase_date: '2093-01-01', last_purchase_date: '2093-01-01' },
      ]).getEntityTotals(2093, '2093-06-15'),
      DomainError
    );
  });
  await t.test('fechas, UUID y conteos inválidos se rechazan', async () => {
    await assert.rejects(
      stubRepo([{ remittance_id: 'no-uuid', rto_code: 'RTO0001', business_date: '2093-01-01', total_order_ars: '1' }]).getEntitySales(2093, '2093-06-15', 'MERCADO_LIBRE', null),
      DomainError
    );
    await assert.rejects(
      stubRepo([{ remittance_id: randomUUID(), rto_code: 'RTO0001', business_date: '01/01/2093', total_order_ars: '1' }]).getEntitySales(2093, '2093-06-15', 'MERCADO_LIBRE', null),
      DomainError
    );
    await assert.rejects(
      stubRepo([{ product_id: randomUUID(), product_name: 'X', units: -1, billed_ars: '1', cost_ars: '1', contribution_ars: '0' }]).getProductTotals(2093, '2093-06-15'),
      DomainError
    );
  });
});
