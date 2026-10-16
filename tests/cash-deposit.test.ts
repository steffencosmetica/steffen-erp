import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { PatrimonyDomainService } from '../src/services/patrimony.service';
import { PatrimonyRepository } from '../src/repositories/patrimony.repository';
import { ReportRepository } from '../src/repositories/report.repository';
import { Decimal } from '../src/domain/decimal';
import { DomainError } from '../src/domain/errors';
import { normalizePositiveAmountInput } from '../src/lib/amount-input';
import type { Database } from '../src/database/types';
import { snapshotSharedAccounts, restoreSharedAccounts, type SharedAccountsSnapshot } from './helpers/shared-accounts-guard';

/**
 * Fase 19.1 — Ingreso de caja (BUSINESS_RULES §26.1): contraparte de Retiro.
 * Caja Steffen += importe. No es venta: no afecta facturación, ganancia, deudas ni stock.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(url, key);
// Tabla de la migración 20261002000034 (cash_deposits) sin depender de los tipos generados.
const raw = createClient(url, key);

test('FASE 19.1 — INGRESO DE CAJA', async (t) => {
  const patrimonyRepo = new PatrimonyRepository(supabase);
  const service = new PatrimonyDomainService(patrimonyRepo);
  const reportRepo = new ReportRepository(supabase);

  const operationIds: string[] = [];
  let sharedSnapshot: SharedAccountsSnapshot | undefined;
  const head = { count: 'exact', head: true } as const;

  async function count(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
    const { count: n, error } = await query;
    assert.ifError(error);
    return n ?? 0;
  }

  async function cashBalance(type: 'CASH_STEFFEN' | 'CASH_MERCADO_LIBRE'): Promise<string> {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('balance:current_balance::text')
      .eq('account_type', type)
      .single();
    assert.ifError(error);
    return data.balance;
  }

  async function globalCounts() {
    return {
      stockMovements: await count(supabase.from('stock_movements').select('id', head)),
      factoryMovements: await count(supabase.from('factory_movements').select('id', head)),
      remittances: await count(supabase.from('remittances').select('id', head)),
      marginRemittances: await count(supabase.from('margin_remittances').select('id', head)),
      purchases: await count(supabase.from('purchases').select('id', head)),
      payments: await count(supabase.from('payments').select('id', head)),
      orders: await count(supabase.from('orders').select('id', head)),
    };
  }

  async function movSequence(): Promise<number> {
    const { data, error } = await supabase.from('code_sequences').select('last_value').eq('prefix', 'MOV').single();
    assert.ifError(error);
    return Number(data.last_value);
  }

  t.before(async () => {
    sharedSnapshot = await snapshotSharedAccounts(supabase);
  });

  t.after(async () => {
    // Limpieza por UUID propios: documento de la operación -> MOV (entries en cascada) -> operación.
    if (operationIds.length > 0) {
      await raw.from('cash_deposits').delete().in('operation_id', operationIds);
      await supabase.from('withdrawals').delete().in('operation_id', operationIds);
      await supabase.from('patrimonial_movements').delete().in('operation_id', operationIds);
      await supabase.from('business_operations').delete().in('id', operationIds);
    }
    assert.deepStrictEqual(
      {
        cash_deposits: operationIds.length ? await count(raw.from('cash_deposits').select('id', head).in('operation_id', operationIds)) : 0,
        business_operations: operationIds.length
          ? await count(supabase.from('business_operations').select('id', head).in('id', operationIds))
          : 0,
      },
      { cash_deposits: 0, business_operations: 0 },
      'tests/cash-deposit.test.ts no debe dejar fixtures propios en la base'
    );
    if (sharedSnapshot) {
      await restoreSharedAccounts(supabase, sharedSnapshot, 'tests/cash-deposit.test.ts');
    }
  });

  await t.test('1. ingreso aumenta Caja Steffen; no toca Caja ML, deudas, stock, ventas, facturación ni ganancia', async () => {
    const cajaBefore = await cashBalance('CASH_STEFFEN');
    const mlBefore = await cashBalance('CASH_MERCADO_LIBRE');
    const summaryBefore = await service.getPatrimonialSummary();
    const countsBefore = await globalCounts();
    const reportsBefore = await reportRepo.getCurrentReports();

    const res = await service.registerCashDeposit({
      amountArs: '100000',
      description: 'Aporte del propietario',
      businessDate: '2026-10-12',
    });
    operationIds.push(res.operationId);

    assert.strictEqual(new Decimal(await cashBalance('CASH_STEFFEN')).minus(cajaBefore).toString(), '100000');
    assert.strictEqual(await cashBalance('CASH_MERCADO_LIBRE'), mlBefore);

    const summaryAfter = await service.getPatrimonialSummary();
    assert.ok(summaryAfter.deudasClientes.eq(summaryBefore.deudasClientes));
    assert.ok(summaryAfter.deudasProveedores.eq(summaryBefore.deudasProveedores));
    assert.strictEqual(summaryAfter.neto.minus(summaryBefore.neto).toString(), '100000');

    assert.deepStrictEqual(await globalCounts(), countsBefore);
    const reportsAfter = await reportRepo.getCurrentReports();
    assert.strictEqual(reportsAfter.salesCurrentMonth, reportsBefore.salesCurrentMonth);
    assert.ok(reportsAfter.billedCurrentMonthArs.eq(reportsBefore.billedCurrentMonthArs));
    assert.ok(reportsAfter.gainCurrentMonthArs.eq(reportsBefore.gainCurrentMonthArs));
  });

  await t.test('2. asiento coherente: operación CASH_DEPOSIT, MOV INGRESO_CAJA y un único asiento +importe en Caja Steffen', async () => {
    const opId = operationIds[0];
    const { data: op } = await supabase.from('business_operations').select('operation_type, business_date').eq('id', opId).single();
    assert.deepStrictEqual(op, { operation_type: 'CASH_DEPOSIT', business_date: '2026-10-12' });

    const { data: deposit } = await raw
      .from('cash_deposits')
      .select('description, amount:amount_ars::text')
      .eq('operation_id', opId)
      .single();
    const row = deposit as { description: string; amount: string };
    assert.strictEqual(row.description, 'Aporte del propietario');
    assert.strictEqual(new Decimal(row.amount).toString(), '100000');

    const { data: mov, error } = await supabase
      .from('patrimonial_movements')
      .select('movement_type, description, amount:amount_ars::text, financial_entries(delta:delta_ars::text, financial_accounts(account_type))')
      .eq('operation_id', opId)
      .single();
    assert.ifError(error);
    assert.strictEqual(mov.movement_type, 'INGRESO_CAJA');
    assert.ok(mov.description.includes('Aporte del propietario'));
    assert.strictEqual(new Decimal(mov.amount).toString(), '100000');
    assert.deepStrictEqual(
      mov.financial_entries.map((e) => ({ type: e.financial_accounts?.account_type, delta: new Decimal(e.delta).toString() })),
      [{ type: 'CASH_STEFFEN', delta: '100000' }]
    );

    const movements = await service.listMovements({ movementType: 'INGRESO_CAJA', limit: 50 });
    const listed = movements.find((m) => m.operationId === opId);
    assert.ok(listed, 'aparece en Movimientos patrimoniales');
    assert.strictEqual(listed.patrimonialVariation, '+ CAJA');
  });

  await t.test('3. importe positivo obligatorio: 0, negativo e inválido rechazados (dominio y PostgreSQL)', async () => {
    for (const amountArs of ['0', '-500', 'abc', '']) {
      await assert.rejects(
        service.registerCashDeposit({ amountArs, description: 'x', businessDate: '2026-10-12' }),
        DomainError,
        `importe "${amountArs}"`
      );
    }
    await assert.rejects(
      service.registerCashDeposit({ amountArs: '10', description: '   ', businessDate: '2026-10-12' }),
      DomainError
    );
    for (const amount of ['0', '-1', '0.0000001']) {
      await assert.rejects(
        patrimonyRepo.registerCashDepositAtomic({ amountArs: new Decimal(amount), description: 'x', businessDate: '2026-10-12' }),
        DomainError,
        `PostgreSQL debe rechazar ${amount}`
      );
    }
  });

  await t.test('4. operación atómica: los rechazos no dejan operación, MOV ni saldo parcial', async () => {
    const seqBefore = await movSequence();
    const cajaBefore = await cashBalance('CASH_STEFFEN');
    const opsBefore = await count(supabase.from('business_operations').select('id', head).eq('operation_type', 'CASH_DEPOSIT'));
    const depositsBefore = await count(raw.from('cash_deposits').select('id', head));

    await assert.rejects(
      patrimonyRepo.registerCashDepositAtomic({ amountArs: new Decimal(0), description: 'x', businessDate: '2026-10-12' }),
      DomainError
    );
    await assert.rejects(
      patrimonyRepo.registerCashDepositAtomic({ amountArs: new Decimal(10), description: '', businessDate: '2026-10-12' }),
      DomainError
    );

    assert.strictEqual(await movSequence(), seqBefore);
    assert.strictEqual(await cashBalance('CASH_STEFFEN'), cajaBefore);
    assert.strictEqual(
      await count(supabase.from('business_operations').select('id', head).eq('operation_type', 'CASH_DEPOSIT')),
      opsBefore
    );
    assert.strictEqual(await count(raw.from('cash_deposits').select('id', head)), depositsBefore);
  });

  await t.test('5. precisión Decimal exacta', async () => {
    const before = await cashBalance('CASH_STEFFEN');
    const res = await service.registerCashDeposit({
      amountArs: '1234567.891234',
      description: 'Incorporación manual de efectivo',
      businessDate: '2026-10-12',
    });
    operationIds.push(res.operationId);
    assert.strictEqual(res.amountArs.toString(), '1234567.891234');
    assert.strictEqual(new Decimal(await cashBalance('CASH_STEFFEN')).minus(before).toString(), '1234567.891234');
  });

  await t.test('6. Retiro de caja sin regresiones; ingreso y retiro del mismo importe se compensan', async () => {
    const before = await cashBalance('CASH_STEFFEN');

    const withdrawal = await service.registerWithdrawal({
      amountArs: '250.5',
      description: 'Retiro regresión 19.1',
      businessDate: '2026-10-12',
    });
    operationIds.push(withdrawal.operationId);
    assert.strictEqual(new Decimal(before).minus(await cashBalance('CASH_STEFFEN')).toString(), '250.5');

    const { data: mov } = await supabase
      .from('patrimonial_movements')
      .select('movement_type')
      .eq('operation_id', withdrawal.operationId)
      .single();
    assert.strictEqual(mov?.movement_type, 'RETIRO');

    const deposit = await service.registerCashDeposit({ amountArs: '250.5', description: 'Reposición', businessDate: '2026-10-12' });
    operationIds.push(deposit.operationId);
    assert.strictEqual(await cashBalance('CASH_STEFFEN'), before);
  });

  await t.test('7. Retiro con centavos: importe tipeado es-AR → retiro exacto (bug "100,50" → 1005)', async () => {
    for (const [typed, expected] of [
      ['100,50', '100.5'],
      ['1.250,50', '1250.5'],
      ['100', '100'],
    ] as const) {
      const amountArs = normalizePositiveAmountInput(typed);
      assert.ok(amountArs, `"${typed}" debe ser válido`);
      const before = await cashBalance('CASH_STEFFEN');
      const res = await service.registerWithdrawal({ amountArs, description: `Retiro ${typed}`, businessDate: '2026-10-12' });
      operationIds.push(res.operationId);
      assert.strictEqual(res.amountArs.toString(), expected);
      assert.strictEqual(new Decimal(before).minus(await cashBalance('CASH_STEFFEN')).toString(), expected);

      const { data: mov } = await supabase
        .from('patrimonial_movements')
        .select('movement_type, amount:amount_ars::text')
        .eq('operation_id', res.operationId)
        .single();
      assert.strictEqual(mov?.movement_type, 'RETIRO');
      assert.strictEqual(new Decimal(mov?.amount ?? '0').toString(), expected);
    }
  });
});
