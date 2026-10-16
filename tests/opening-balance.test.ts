import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { PatrimonyDomainService } from '../src/services/patrimony.service';
import { PatrimonyRepository } from '../src/repositories/patrimony.repository';
import { CustomerRepository } from '../src/repositories/customer.repository';
import { SupplierRepository } from '../src/repositories/supplier.repository';
import { ReportRepository } from '../src/repositories/report.repository';
import { Decimal } from '../src/domain/decimal';
import {
  DomainError,
  OpeningBalanceAlreadyExistsError,
  OpeningBalanceLockedError,
  InvalidOpeningBalanceAccountError,
} from '../src/domain/errors';
import type { Database } from '../src/database/types';
import { snapshotSharedAccounts, restoreSharedAccounts, type SharedAccountsSnapshot } from './helpers/shared-accounts-guard';

/**
 * Fase 19.1 — Saldo de apertura (BUSINESS_RULES §20.2).
 * Deuda previa al inicio operativo: solo afecta la cuenta corriente; no es venta,
 * compra, ingreso, egreso ni movimiento de stock.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(url, key);
// Tablas de la migración 20261002000034 (opening_balances) sin depender de los tipos generados.
const raw = createClient(url, key);

test('FASE 19.1 — SALDO DE APERTURA (clientes / proveedores)', async (t) => {
  const patrimonyRepo = new PatrimonyRepository(supabase);
  const service = new PatrimonyDomainService(patrimonyRepo);
  const customerRepo = new CustomerRepository(supabase);
  const supplierRepo = new SupplierRepository(supabase);
  const reportRepo = new ReportRepository(supabase);

  const tag = `P191_${Date.now()}`;
  const customerIds: string[] = [];
  const supplierIds: string[] = [];
  const operationIds: string[] = [];
  let sharedSnapshot: SharedAccountsSnapshot | undefined;

  let customerA = '';
  let customerB = '';
  let supplierA = '';
  let supplierUsd = '';
  let cashSteffenId = '';

  const head = { count: 'exact', head: true } as const;

  async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
    const { count: n, error } = await query;
    assert.ifError(error);
    return n ?? 0;
  }

  async function accountOf(column: 'customer_id' | 'supplier_id', partyId: string): Promise<{ id: string; balance: string }> {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('id, balance:current_balance::text')
      .eq(column, partyId)
      .single();
    assert.ifError(error);
    return { id: data.id, balance: data.balance };
  }

  /** Saldo = suma de asientos, exacto (texto NUMERIC). */
  async function assertLedgerMatchesBalance(accountId: string) {
    const { data: acc, error: accErr } = await supabase
      .from('financial_accounts')
      .select('balance:current_balance::text')
      .eq('id', accountId)
      .single();
    assert.ifError(accErr);
    const { data: entries, error } = await supabase
      .from('financial_entries')
      .select('delta:delta_ars::text')
      .eq('financial_account_id', accountId);
    assert.ifError(error);
    const sum = (entries || []).reduce((s, e) => s.plus(e.delta), new Decimal(0));
    assert.ok(sum.eq(acc.balance), `ledger ${sum.toString()} != current_balance ${acc.balance}`);
  }

  async function cashBalances(): Promise<Record<string, string>> {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('account_type, balance:current_balance::text')
      .in('account_type', ['CASH_STEFFEN', 'CASH_MERCADO_LIBRE']);
    assert.ifError(error);
    return Object.fromEntries((data || []).map((r) => [r.account_type, r.balance]));
  }

  async function globalCounts() {
    return {
      stockMovements: await count(supabase.from('stock_movements').select('id', head)),
      factoryMovements: await count(supabase.from('factory_movements').select('id', head)),
      remittances: await count(supabase.from('remittances').select('id', head)),
      marginRemittances: await count(supabase.from('margin_remittances').select('id', head)),
      purchases: await count(supabase.from('purchases').select('id', head)),
      orders: await count(supabase.from('orders').select('id', head)),
      withdrawals: await count(supabase.from('withdrawals').select('id', head)),
      expenses: await count(supabase.from('operating_expenses').select('id', head)),
    };
  }

  async function movSequence(): Promise<number> {
    const { data, error } = await supabase.from('code_sequences').select('last_value').eq('prefix', 'MOV').single();
    assert.ifError(error);
    return Number(data.last_value);
  }

  t.before(async () => {
    sharedSnapshot = await snapshotSharedAccounts(supabase);

    const { data: cash, error } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('account_type', 'CASH_STEFFEN')
      .single();
    assert.ifError(error);
    cashSteffenId = cash.id;

    customerA = (await customerRepo.create({ name: `Cliente Apertura A ${tag}` })).id;
    customerB = (await customerRepo.create({ name: `Cliente Apertura B ${tag}` })).id;
    customerIds.push(customerA, customerB);
    supplierA = (await supplierRepo.create({ name: `Proveedor Apertura ARS ${tag}`, currencyCode: 'ARS' })).id;
    supplierUsd = (await supplierRepo.create({ name: `Proveedor Apertura USD ${tag}`, currencyCode: 'USD' })).id;
    supplierIds.push(supplierA, supplierUsd);
  });

  t.after(async () => {
    // Limpieza por UUID propios y en orden de FKs:
    // opening_balances -> payments -> MOV (entries en cascada) -> business_operations -> cuentas -> partes.
    const accountIds: string[] = [];
    for (const id of customerIds) {
      const { data } = await supabase.from('financial_accounts').select('id').eq('customer_id', id);
      accountIds.push(...(data || []).map((r) => r.id));
    }
    for (const id of supplierIds) {
      const { data } = await supabase.from('financial_accounts').select('id').eq('supplier_id', id);
      accountIds.push(...(data || []).map((r) => r.id));
    }
    if (accountIds.length > 0) {
      const { data: openings } = await raw.from('opening_balances').select('operation_id').in('financial_account_id', accountIds);
      operationIds.push(...((openings || []) as { operation_id: string }[]).map((o) => o.operation_id));
      await raw.from('opening_balances').delete().in('financial_account_id', accountIds);
    }
    const ops = [...new Set(operationIds)];
    if (ops.length > 0) {
      await supabase.from('payments').delete().in('operation_id', ops);
      await supabase.from('patrimonial_movements').delete().in('operation_id', ops);
      await supabase.from('business_operations').delete().in('id', ops);
    }
    for (const id of customerIds) {
      await supabase.from('financial_accounts').delete().eq('customer_id', id);
      await supabase.from('customers').delete().eq('id', id);
    }
    for (const id of supplierIds) {
      await supabase.from('financial_accounts').delete().eq('supplier_id', id);
      await supabase.from('suppliers').delete().eq('id', id);
    }

    assert.deepStrictEqual(
      {
        opening_balances: accountIds.length
          ? await count(raw.from('opening_balances').select('id', head).in('financial_account_id', accountIds))
          : 0,
        business_operations: ops.length ? await count(supabase.from('business_operations').select('id', head).in('id', ops)) : 0,
        customers: await count(supabase.from('customers').select('id', head).in('id', customerIds)),
        suppliers: await count(supabase.from('suppliers').select('id', head).in('id', supplierIds)),
      },
      { opening_balances: 0, business_operations: 0, customers: 0, suppliers: 0 },
      'tests/opening-balance.test.ts no debe dejar fixtures propios en la base'
    );

    if (sharedSnapshot) {
      await restoreSharedAccounts(supabase, sharedSnapshot, 'tests/opening-balance.test.ts');
    }
  });

  // ---------------------------------------------------------------------------
  // CLIENTE
  // ---------------------------------------------------------------------------
  await t.test('CLIENTE 1. apertura aumenta la deuda (Deudas Clientes) sin tocar caja, stock ni ventas', async () => {
    const summaryBefore = await service.getPatrimonialSummary();
    const cashBefore = await cashBalances();
    const countsBefore = await globalCounts();
    const reportsBefore = await reportRepo.getCurrentReports();
    const accBefore = await accountOf('customer_id', customerA);
    assert.ok(new Decimal(accBefore.balance).eq(0));

    const res = await service.registerOpeningBalance({
      partyType: 'CUSTOMER',
      partyId: customerA,
      amountArs: '350000',
      businessDate: '2026-10-01',
      observation: 'Deuda previa al ERP',
    });
    operationIds.push(res.operationId);

    const accAfter = await accountOf('customer_id', customerA);
    assert.strictEqual(new Decimal(accAfter.balance).toString(), '350000');
    assert.strictEqual(res.financialAccountId, accAfter.id);

    const summaryAfter = await service.getPatrimonialSummary();
    assert.strictEqual(summaryAfter.deudasClientes.minus(summaryBefore.deudasClientes).toString(), '350000');
    assert.ok(summaryAfter.deudasProveedores.eq(summaryBefore.deudasProveedores));
    assert.strictEqual(summaryAfter.neto.minus(summaryBefore.neto).toString(), '350000');

    // No toca caja
    assert.deepStrictEqual(await cashBalances(), cashBefore);
    // No genera stock, MFA, ventas, compras, pedidos, retiros ni gastos
    assert.deepStrictEqual(await globalCounts(), countsBefore);
    // No aparece como venta: métricas del mes intactas
    const reportsAfter = await reportRepo.getCurrentReports();
    assert.strictEqual(reportsAfter.salesCurrentMonth, reportsBefore.salesCurrentMonth);
    assert.ok(reportsAfter.billedCurrentMonthArs.eq(reportsBefore.billedCurrentMonthArs));
    assert.ok(reportsAfter.gainCurrentMonthArs.eq(reportsBefore.gainCurrentMonthArs));
  });

  await t.test('CLIENTE 2. operación auditable: operación OPENING_BALANCE, MOV SALDO_APERTURA y un único asiento', async () => {
    const state = await service.getOpeningBalanceState('CUSTOMER', customerA);
    assert.ok(state.opening);
    assert.strictEqual(state.opening.businessDate, '2026-10-01');
    assert.strictEqual(state.opening.observation, 'Deuda previa al ERP');
    assert.strictEqual(state.hasOtherActivity, false);

    const { data: opening } = await raw
      .from('opening_balances')
      .select('operation_id, amount:amount_ars::text')
      .eq('id', state.opening.id)
      .single();
    const row = opening as { operation_id: string; amount: string };
    assert.strictEqual(new Decimal(row.amount).toString(), '350000');

    const { data: op } = await supabase
      .from('business_operations')
      .select('operation_type, business_date')
      .eq('id', row.operation_id)
      .single();
    assert.deepStrictEqual(op, { operation_type: 'OPENING_BALANCE', business_date: '2026-10-01' });

    const { data: mov, error } = await supabase
      .from('patrimonial_movements')
      .select('id, code, movement_type, amount:amount_ars::text, financial_entries(financial_account_id, delta:delta_ars::text)')
      .eq('operation_id', row.operation_id)
      .single();
    assert.ifError(error);
    assert.strictEqual(mov.movement_type, 'SALDO_APERTURA');
    assert.strictEqual(mov.code, state.opening.movementCode);
    assert.strictEqual(new Decimal(mov.amount).toString(), '350000');
    const acc = await accountOf('customer_id', customerA);
    assert.deepStrictEqual(
      mov.financial_entries.map((e) => ({ account: e.financial_account_id, delta: new Decimal(e.delta).toString() })),
      [{ account: acc.id, delta: '350000' }],
      'el único asiento es sobre la cuenta del cliente (nunca caja)'
    );

    await assertLedgerMatchesBalance(acc.id);

    // Estado de cuenta: aparece como APERTURA, nunca como VENTA
    const movements = await service.listCustomerMovements(customerA);
    assert.deepStrictEqual(movements.map((m) => m.type), ['APERTURA']);
  });

  await t.test('CLIENTE 3. no permite un segundo saldo de apertura (dominio y PostgreSQL)', async () => {
    await assert.rejects(
      service.registerOpeningBalance({ partyType: 'CUSTOMER', partyId: customerA, amountArs: '10', businessDate: '2026-10-01' }),
      OpeningBalanceAlreadyExistsError
    );
    const acc = await accountOf('customer_id', customerA);
    await assert.rejects(
      patrimonyRepo.registerOpeningBalanceAtomic({ financialAccountId: acc.id, amountArs: new Decimal(10), businessDate: '2026-10-01' }),
      OpeningBalanceAlreadyExistsError
    );
    assert.strictEqual(new Decimal((await accountOf('customer_id', customerA)).balance).toString(), '350000');
  });

  await t.test('CLIENTE 4. editar recalcula saldo, MOV y asiento (sin movimiento compensatorio)', async () => {
    const state = await service.getOpeningBalanceState('CUSTOMER', customerA);
    assert.ok(state.opening);
    const res = await service.editOpeningBalance({
      openingBalanceId: state.opening.id,
      newAmountArs: '500000.25',
      newBusinessDate: '2026-09-30',
      observation: 'Corregido',
    });
    assert.strictEqual(res.oldAmountArs.toString(), '350000');
    assert.strictEqual(res.deltaArs.toString(), '150000.25');
    assert.strictEqual(res.code, state.opening.movementCode, 'se modifica el MOV original');

    const acc = await accountOf('customer_id', customerA);
    assert.strictEqual(new Decimal(acc.balance).toString(), '500000.25');
    await assertLedgerMatchesBalance(acc.id);

    const after = await service.getOpeningBalanceState('CUSTOMER', customerA);
    assert.ok(after.opening);
    assert.strictEqual(after.opening.amountArs.toString(), '500000.25');
    assert.strictEqual(after.opening.businessDate, '2026-09-30');
    assert.strictEqual(after.opening.observation, 'Corregido');
    assert.strictEqual(
      await count(supabase.from('patrimonial_movements').select('id', head).eq('operation_id', res.operationId)),
      1
    );
  });

  await t.test('CLIENTE 5. eliminar vuelve al saldo anterior y no deja asiento, MOV ni operación', async () => {
    const state = await service.getOpeningBalanceState('CUSTOMER', customerA);
    assert.ok(state.opening);
    const res = await service.deleteOpeningBalance(state.opening.id);

    const acc = await accountOf('customer_id', customerA);
    assert.ok(new Decimal(acc.balance).eq(0));
    await assertLedgerMatchesBalance(acc.id);
    assert.strictEqual(await count(supabase.from('patrimonial_movements').select('id', head).eq('operation_id', res.operationId)), 0);
    assert.strictEqual(await count(supabase.from('business_operations').select('id', head).eq('id', res.operationId)), 0);
    assert.strictEqual((await service.getOpeningBalanceState('CUSTOMER', customerA)).opening, null);
  });

  await t.test('CLIENTE 6. con un movimiento posterior no se puede editar ni eliminar la apertura', async () => {
    const opening = await service.registerOpeningBalance({
      partyType: 'CUSTOMER',
      partyId: customerA,
      amountArs: '1000',
      businessDate: '2026-10-01',
    });
    operationIds.push(opening.operationId);

    const payment = await service.registerCustomerPayment({ customerId: customerA, amountArs: '100', businessDate: '2026-10-02' });
    operationIds.push(payment.operationId);

    const state = await service.getOpeningBalanceState('CUSTOMER', customerA);
    assert.strictEqual(state.hasOtherActivity, true);
    assert.ok(state.opening);

    await assert.rejects(
      service.editOpeningBalance({ openingBalanceId: state.opening.id, newAmountArs: '2000', newBusinessDate: '2026-10-01' }),
      OpeningBalanceLockedError
    );
    await assert.rejects(service.deleteOpeningBalance(state.opening.id), OpeningBalanceLockedError);

    const acc = await accountOf('customer_id', customerA);
    assert.strictEqual(new Decimal(acc.balance).toString(), '900');
    await assertLedgerMatchesBalance(acc.id);
  });

  await t.test('CLIENTE 7. no se puede crear apertura sobre una cuenta que ya tiene movimientos', async () => {
    // Actividad previa en la cuenta de B mediante el MOV genérico del ledger.
    const acc = await accountOf('customer_id', customerB);
    const { data: op, error } = await supabase
      .from('business_operations')
      .insert({ operation_type: 'CUSTOMER_PAYMENT', business_date: '2026-10-01' })
      .select('id')
      .single();
    assert.ifError(error);
    operationIds.push(op.id);
    await service.postPatrimonialMovement({
      operationId: op.id,
      movementType: 'PAGO_CLIENTE',
      description: `Actividad previa ${tag}`,
      amountArs: '50',
      entries: [{ financialAccountId: acc.id, deltaArs: '-50' }],
    });

    await assert.rejects(
      service.registerOpeningBalance({ partyType: 'CUSTOMER', partyId: customerB, amountArs: '10', businessDate: '2026-10-01' }),
      OpeningBalanceLockedError
    );
    await assert.rejects(
      patrimonyRepo.registerOpeningBalanceAtomic({ financialAccountId: acc.id, amountArs: new Decimal(10), businessDate: '2026-10-01' }),
      OpeningBalanceLockedError
    );
    assert.strictEqual(new Decimal((await accountOf('customer_id', customerB)).balance).toString(), '-50');
  });

  // ---------------------------------------------------------------------------
  // PROVEEDOR
  // ---------------------------------------------------------------------------
  await t.test('PROVEEDOR 1. apertura aumenta Deudas Proveedores sin tocar caja, stock ni compras', async () => {
    const summaryBefore = await service.getPatrimonialSummary();
    const cashBefore = await cashBalances();
    const countsBefore = await globalCounts();

    const res = await service.registerOpeningBalance({
      partyType: 'SUPPLIER',
      partyId: supplierA,
      amountArs: '820000',
      businessDate: '2026-10-01',
    });
    operationIds.push(res.operationId);

    const acc = await accountOf('supplier_id', supplierA);
    assert.strictEqual(new Decimal(acc.balance).toString(), '820000');
    await assertLedgerMatchesBalance(acc.id);

    const summaryAfter = await service.getPatrimonialSummary();
    assert.strictEqual(summaryAfter.deudasProveedores.minus(summaryBefore.deudasProveedores).toString(), '820000');
    assert.ok(summaryAfter.deudasClientes.eq(summaryBefore.deudasClientes));
    assert.strictEqual(summaryBefore.neto.minus(summaryAfter.neto).toString(), '820000');
    assert.deepStrictEqual(await cashBalances(), cashBefore);
    assert.deepStrictEqual(await globalCounts(), countsBefore);

    const movements = await service.listSupplierMovements(supplierA);
    assert.deepStrictEqual(movements.map((m) => m.type), ['APERTURA'], 'no aparece como compra');
  });

  await t.test('PROVEEDOR 2. duplicado rechazado; editar recalcula; eliminar vuelve al saldo anterior', async () => {
    await assert.rejects(
      service.registerOpeningBalance({ partyType: 'SUPPLIER', partyId: supplierA, amountArs: '1', businessDate: '2026-10-01' }),
      OpeningBalanceAlreadyExistsError
    );

    const state = await service.getOpeningBalanceState('SUPPLIER', supplierA);
    assert.ok(state.opening);
    await service.editOpeningBalance({ openingBalanceId: state.opening.id, newAmountArs: '700000', newBusinessDate: '2026-10-01' });
    let acc = await accountOf('supplier_id', supplierA);
    assert.strictEqual(new Decimal(acc.balance).toString(), '700000');
    await assertLedgerMatchesBalance(acc.id);

    await service.deleteOpeningBalance(state.opening.id);
    acc = await accountOf('supplier_id', supplierA);
    assert.ok(new Decimal(acc.balance).eq(0));
    await assertLedgerMatchesBalance(acc.id);
  });

  await t.test('PROVEEDOR 3. con un pago posterior no se puede editar ni eliminar la apertura', async () => {
    const opening = await service.registerOpeningBalance({
      partyType: 'SUPPLIER',
      partyId: supplierA,
      amountArs: '5000',
      businessDate: '2026-10-01',
    });
    operationIds.push(opening.operationId);
    const payment = await service.registerSupplierPayment({ supplierId: supplierA, amountArs: '1500', businessDate: '2026-10-02' });
    operationIds.push(payment.operationId);

    await assert.rejects(
      service.editOpeningBalance({ openingBalanceId: opening.openingBalanceId, newAmountArs: '6000', newBusinessDate: '2026-10-01' }),
      OpeningBalanceLockedError
    );
    await assert.rejects(service.deleteOpeningBalance(opening.openingBalanceId), OpeningBalanceLockedError);

    const acc = await accountOf('supplier_id', supplierA);
    assert.strictEqual(new Decimal(acc.balance).toString(), '3500');
    await assertLedgerMatchesBalance(acc.id);
  });

  await t.test('PROVEEDOR 4. proveedor USD: la deuda de apertura se registra en ARS (cuenta patrimonial)', async () => {
    const res = await service.registerOpeningBalance({
      partyType: 'SUPPLIER',
      partyId: supplierUsd,
      amountArs: '1250000.50',
      businessDate: '2026-10-01',
    });
    operationIds.push(res.operationId);
    const acc = await accountOf('supplier_id', supplierUsd);
    assert.strictEqual(new Decimal(acc.balance).toString(), '1250000.5');
    await assertLedgerMatchesBalance(acc.id);
  });

  // ---------------------------------------------------------------------------
  // GENERAL
  // ---------------------------------------------------------------------------
  await t.test('GENERAL 1. importe 0, negativo o inválido rechazado (dominio y PostgreSQL)', async () => {
    for (const amountArs of ['0', '-100', 'abc', '']) {
      await assert.rejects(
        service.registerOpeningBalance({ partyType: 'CUSTOMER', partyId: customerB, amountArs, businessDate: '2026-10-01' }),
        DomainError,
        `importe "${amountArs}"`
      );
    }
    const acc = await accountOf('supplier_id', supplierUsd);
    for (const amount of ['0', '-1', '0.0000001']) {
      await assert.rejects(
        patrimonyRepo.registerOpeningBalanceAtomic({ financialAccountId: acc.id, amountArs: new Decimal(amount), businessDate: '2026-10-01' }),
        DomainError,
        `PostgreSQL debe rechazar ${amount}`
      );
    }
  });

  await t.test('GENERAL 2. tipo de cuenta incorrecto rechazado (CASH y tipo de contraparte inválido)', async () => {
    await assert.rejects(
      patrimonyRepo.registerOpeningBalanceAtomic({
        financialAccountId: cashSteffenId,
        amountArs: new Decimal(100),
        businessDate: '2026-10-01',
      }),
      InvalidOpeningBalanceAccountError
    );
    await assert.rejects(
      patrimonyRepo.getOpeningBalanceState('CASH' as 'CUSTOMER', customerA),
      InvalidOpeningBalanceAccountError
    );
    await assert.rejects(service.getOpeningBalanceState('CASH' as 'CUSTOMER', customerA), InvalidOpeningBalanceAccountError);
  });

  await t.test('GENERAL 3. rollback atómico: las operaciones rechazadas no dejan nada parcial', async () => {
    const seqBefore = await movSequence();
    const opsBefore = await count(supabase.from('business_operations').select('id', head).eq('operation_type', 'OPENING_BALANCE'));
    const openingsBefore = await count(raw.from('opening_balances').select('id', head));
    const cashBefore = await cashBalances();
    const accSupplier = await accountOf('supplier_id', supplierA);

    const state = await service.getOpeningBalanceState('SUPPLIER', supplierA);
    assert.ok(state.opening);
    const openingId = state.opening.id;
    const rejected: Array<() => Promise<unknown>> = [
      () => patrimonyRepo.registerOpeningBalanceAtomic({ financialAccountId: accSupplier.id, amountArs: new Decimal(1), businessDate: '2026-10-01' }),
      () => patrimonyRepo.registerOpeningBalanceAtomic({ financialAccountId: cashSteffenId, amountArs: new Decimal(1), businessDate: '2026-10-01' }),
      () =>
        patrimonyRepo.editOpeningBalanceAtomic({ openingBalanceId: openingId, newAmountArs: new Decimal(99), newBusinessDate: '2026-10-01' }),
      () => patrimonyRepo.deleteOpeningBalanceAtomic(openingId),
    ];
    for (const run of rejected) {
      await assert.rejects(run(), DomainError);
    }

    assert.strictEqual(await movSequence(), seqBefore, 'la secuencia MOV no avanza (transacción revertida)');
    assert.strictEqual(
      await count(supabase.from('business_operations').select('id', head).eq('operation_type', 'OPENING_BALANCE')),
      opsBefore
    );
    assert.strictEqual(await count(raw.from('opening_balances').select('id', head)), openingsBefore);
    assert.deepStrictEqual(await cashBalances(), cashBefore);
    assert.strictEqual((await accountOf('supplier_id', supplierA)).balance, accSupplier.balance);
  });

  await t.test('GENERAL 4. precisión Decimal exacta (NUMERIC(20,6), sin Number)', async () => {
    // Cliente A ya tiene actividad; se usa una cuenta limpia nueva.
    const fresh = (await customerRepo.create({ name: `Cliente Apertura Precision ${tag}` })).id;
    customerIds.push(fresh);
    const res = await service.registerOpeningBalance({
      partyType: 'CUSTOMER',
      partyId: fresh,
      amountArs: '98765432109.876543',
      businessDate: '2026-10-01',
    });
    operationIds.push(res.operationId);
    assert.strictEqual(res.amountArs.toString(), '98765432109.876543');

    const acc = await accountOf('customer_id', fresh);
    assert.strictEqual(acc.balance, '98765432109.876543');
    await assertLedgerMatchesBalance(acc.id);

    const edited = await service.editOpeningBalance({
      openingBalanceId: res.openingBalanceId,
      newAmountArs: '98765432109.876544',
      newBusinessDate: '2026-10-01',
    });
    assert.strictEqual(edited.deltaArs.toString(), '0.000001');
    assert.strictEqual((await accountOf('customer_id', fresh)).balance, '98765432109.876544');
  });
});
