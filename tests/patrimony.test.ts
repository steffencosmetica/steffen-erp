import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { PatrimonyDomainService } from '../src/services/patrimony.service';
import { PatrimonyRepository } from '../src/repositories/patrimony.repository';
import { CustomerRepository } from '../src/repositories/customer.repository';
import { SupplierRepository } from '../src/repositories/supplier.repository';
import { Decimal } from '../src/domain/decimal';
import { serializeSupplier } from '../src/actions/supplier.dto';
import type { Database } from '../src/database/types';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('FASE 9 — CUENTAS Y MOVIMIENTOS PATRIMONIALES (Suite Integral)', async (t) => {
  const patrimonyRepo = new PatrimonyRepository(supabase);
  const customerRepo = new CustomerRepository(supabase);
  const supplierRepo = new SupplierRepository(supabase);
  const patrimonyService = new PatrimonyDomainService(patrimonyRepo);

  const testTag = `P9_${Date.now()}`;
  let customer1Id: string;
  let customerInactiveId: string;
  let supplier1Id: string;
  let supplierInactiveId: string;

  const createdCustomerIds: string[] = [];
  const createdSupplierIds: string[] = [];
  const createdOperations: string[] = [];

  t.before(async () => {
    // Asegurar que existan cuentas canónicas en financial_accounts
    const { data: steffenAcc } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('account_type', 'CASH_STEFFEN')
      .maybeSingle();

    if (!steffenAcc) {
      await supabase.from('financial_accounts').insert({
        account_type: 'CASH_STEFFEN',
        name: 'Caja Steffen',
        current_balance: 0,
        active: true,
      });
    }

    const { data: mlAcc } = await supabase
      .from('financial_accounts')
      .select('id')
      .eq('account_type', 'CASH_MERCADO_LIBRE')
      .maybeSingle();

    if (!mlAcc) {
      await supabase.from('financial_accounts').insert({
        account_type: 'CASH_MERCADO_LIBRE',
        name: 'Caja Mercado Libre',
        current_balance: 0,
        active: true,
      });
    }

    // 1. Cliente activo
    const c1 = await customerRepo.create({
      name: `Cliente Activo ${testTag}`,
      phone: '1122334455',
    });
    customer1Id = c1.id;
    createdCustomerIds.push(customer1Id);

    // 2. Cliente inactivo con deuda
    const cInact = await customerRepo.create({
      name: `Cliente Inactivo ${testTag}`,
      phone: '1122334466',
    });
    customerInactiveId = cInact.id;
    createdCustomerIds.push(customerInactiveId);
    await supabase.from('customers').update({ active: false }).eq('id', customerInactiveId);

    // 3. Proveedor activo ARS
    const s1 = await supplierRepo.create({
      name: `Proveedor ARS ${testTag}`,
      currencyCode: 'ARS',
      phone: '1144556677',
    });
    supplier1Id = s1.id;
    createdSupplierIds.push(supplier1Id);

    // 4. Proveedor inactivo ARS
    const sInact = await supplierRepo.create({
      name: `Proveedor Inactivo ${testTag}`,
      currencyCode: 'ARS',
      phone: '1144556688',
    });
    supplierInactiveId = sInact.id;
    createdSupplierIds.push(supplierInactiveId);
    await supabase.from('suppliers').update({ active: false }).eq('id', supplierInactiveId);
  });

  t.after(async () => {
    // Cleanup de registros creados en test
    if (createdOperations.length > 0) {
      await supabase.from('financial_entries').delete().in('operation_id', createdOperations);
      await supabase.from('patrimonial_movements').delete().in('operation_id', createdOperations);
      await supabase.from('payments').delete().in('operation_id', createdOperations);
      await supabase.from('business_operations').delete().in('id', createdOperations);
    }
    for (const cid of createdCustomerIds) {
      await supabase.from('financial_accounts').delete().eq('customer_id', cid);
      await supabase.from('customers').delete().eq('id', cid);
    }
    for (const sid of createdSupplierIds) {
      await supabase.from('financial_accounts').delete().eq('supplier_id', sid);
      await supabase.from('suppliers').delete().eq('id', sid);
    }
  });

  // Helper para consultar saldo de cuenta de cliente
  async function getCustomerBalance(customerId: string): Promise<Decimal> {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();
    assert.ifError(error);
    return new Decimal(data.current_balance);
  }

  // Helper para consultar saldo de cuenta de proveedor
  async function getSupplierBalance(supplierId: string): Promise<Decimal> {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('supplier_id', supplierId)
      .eq('account_type', 'SUPPLIER_PAYABLE')
      .single();
    assert.ifError(error);
    return new Decimal(data.current_balance);
  }

  // Helper para consultar saldo de Caja Steffen
  async function getCajaSteffenBalance(): Promise<Decimal> {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('account_type', 'CASH_STEFFEN')
      .single();
    assert.ifError(error);
    return new Decimal(data.current_balance);
  }

  // 1. Pago Cliente disminuye deuda de cliente
  await t.test('1. Pago Cliente disminuye deuda de cliente', async () => {
    // Asignar deuda inicial de $1500
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 1500 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    const balBefore = await getCustomerBalance(customer1Id);
    assert.strictEqual(balBefore.toString(), '1500');

    const res = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '500.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const balAfter = await getCustomerBalance(customer1Id);
    assert.strictEqual(balAfter.toString(), '1000');
  });

  // 2. Pago Cliente aumenta Caja Steffen
  await t.test('2. Pago Cliente aumenta Caja Steffen', async () => {
    const cajaBefore = await getCajaSteffenBalance();

    const res = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '300.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const cajaAfter = await getCajaSteffenBalance();
    assert.strictEqual(cajaAfter.minus(cajaBefore).toString(), '300');
  });

  // 3. Pago Cliente con sobrepago permitido (saldo < 0)
  await t.test('3. Pago Cliente con sobrepago permitido (saldo < 0)', async () => {
    // Si la deuda actual es 700 y paga 1200, el saldo debe ser -500 (saldo a favor)
    const balBefore = await getCustomerBalance(customer1Id);
    assert.strictEqual(balBefore.toString(), '700');

    const res = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '1200.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const balAfter = await getCustomerBalance(customer1Id);
    assert.strictEqual(balAfter.toString(), '-500');
  });

  // 4. Pago Cliente con cliente inactivo permitido si tiene deuda/saldo
  await t.test('4. Pago Cliente con cliente inactivo permitido si tiene deuda/saldo', async () => {
    // Asignar deuda a cliente inactivo
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 800 })
      .eq('customer_id', customerInactiveId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    const res = await patrimonyService.registerCustomerPayment({
      customerId: customerInactiveId,
      amountArs: '250.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const balAfter = await getCustomerBalance(customerInactiveId);
    assert.strictEqual(balAfter.toString(), '550');
  });

  // 5. Pago Cliente genera MOV PAGO_CLIENTE y entries
  await t.test('5. Pago Cliente genera MOV PAGO_CLIENTE y entries', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 500 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    const res = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '150.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    // MOV record
    const { data: mov, error: movErr } = await supabase
      .from('patrimonial_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .single();
    assert.ifError(movErr);
    assert.match(mov.code, /^MOV\d{4}$/);
    assert.strictEqual(mov.movement_type, 'PAGO_CLIENTE');
    assert.strictEqual(new Decimal(mov.amount_ars).toString(), '150');

    // entries
    const { data: entries, error: entErr } = await supabase
      .from('financial_entries')
      .select('*, financial_accounts(account_type)')
      .eq('patrimonial_movement_id', mov.id);
    assert.ifError(entErr);
    assert.strictEqual(entries.length, 2);

    const steffenEntry = entries.find((e: any) => e.financial_accounts?.account_type === 'CASH_STEFFEN');
    const customerEntry = entries.find((e: any) => e.financial_accounts?.account_type === 'CUSTOMER_RECEIVABLE');
    assert.ok(steffenEntry);
    assert.ok(customerEntry);
    assert.strictEqual(new Decimal(steffenEntry.delta_ars).toString(), '150');
    assert.strictEqual(new Decimal(customerEntry.delta_ars).toString(), '-150');
  });

  // 6. Pago Proveedor disminuye deuda de proveedor
  await t.test('6. Pago Proveedor disminuye deuda de proveedor', async () => {
    // Deuda inicial $2500
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 2500 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    const balBefore = await getSupplierBalance(supplier1Id);
    assert.strictEqual(balBefore.toString(), '2500');

    const res = await patrimonyService.registerSupplierPayment({
      supplierId: supplier1Id,
      amountArs: '1000.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const balAfter = await getSupplierBalance(supplier1Id);
    assert.strictEqual(balAfter.toString(), '1500');
  });

  // 7. Pago Proveedor disminuye Caja Steffen
  await t.test('7. Pago Proveedor disminuye Caja Steffen', async () => {
    const cajaBefore = await getCajaSteffenBalance();

    const res = await patrimonyService.registerSupplierPayment({
      supplierId: supplier1Id,
      amountArs: '400.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const cajaAfter = await getCajaSteffenBalance();
    assert.strictEqual(cajaBefore.minus(cajaAfter).toString(), '400');
  });

  // 8. Pago Proveedor parcial permitido
  await t.test('8. Pago Proveedor parcial permitido', async () => {
    const balBefore = await getSupplierBalance(supplier1Id);
    assert.strictEqual(balBefore.toString(), '1100');

    const res = await patrimonyService.registerSupplierPayment({
      supplierId: supplier1Id,
      amountArs: '300.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const balAfter = await getSupplierBalance(supplier1Id);
    assert.strictEqual(balAfter.toString(), '800');
  });

  // 9. Pago Proveedor exactamente igual a la deuda cancela deuda a 0
  await t.test('9. Pago Proveedor exactamente igual a la deuda cancela deuda a 0', async () => {
    const balBefore = await getSupplierBalance(supplier1Id);
    assert.strictEqual(balBefore.toString(), '800');

    // Pagar 800 sobre deuda de 800 -> saldo 0
    const res = await patrimonyService.registerSupplierPayment({
      supplierId: supplier1Id,
      amountArs: '800.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const balAfter = await getSupplierBalance(supplier1Id);
    assert.strictEqual(balAfter.toString(), '0');
  });

  // 10. Pago Proveedor con proveedor inactivo permitido
  await t.test('10. Pago Proveedor con proveedor inactivo permitido', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 600 })
      .eq('supplier_id', supplierInactiveId)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    const res = await patrimonyService.registerSupplierPayment({
      supplierId: supplierInactiveId,
      amountArs: '200.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const balAfter = await getSupplierBalance(supplierInactiveId);
    assert.strictEqual(balAfter.toString(), '400');
  });

  // 11. Pago Proveedor genera MOV PAGO_PROVEEDOR y entries
  await t.test('11. Pago Proveedor genera MOV PAGO_PROVEEDOR y entries', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 500 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    const res = await patrimonyService.registerSupplierPayment({
      supplierId: supplier1Id,
      amountArs: '180.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const { data: mov, error: movErr } = await supabase
      .from('patrimonial_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .single();
    assert.ifError(movErr);
    assert.match(mov.code, /^MOV\d{4}$/);
    assert.strictEqual(mov.movement_type, 'PAGO_PROVEEDOR');
    assert.strictEqual(new Decimal(mov.amount_ars).toString(), '180');

    const { data: entries, error: entErr } = await supabase
      .from('financial_entries')
      .select('*, financial_accounts(account_type)')
      .eq('patrimonial_movement_id', mov.id);
    assert.ifError(entErr);
    assert.strictEqual(entries.length, 2);

    const steffenEntry = entries.find((e: any) => e.financial_accounts?.account_type === 'CASH_STEFFEN');
    const supEntry = entries.find((e: any) => e.financial_accounts?.account_type === 'SUPPLIER_PAYABLE');
    assert.ok(steffenEntry);
    assert.ok(supEntry);
    assert.strictEqual(new Decimal(supEntry.delta_ars).toString(), '-180');
    assert.strictEqual(new Decimal(steffenEntry.delta_ars).toString(), '-180');
  });

  // 12. Edición de Pago Cliente actualiza pago, MOV y entries atómicamente por delta
  await t.test('12. Edición de Pago Cliente actualiza pago, MOV y entries atómicamente por delta', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 1000 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    // 1. Crear pago original de $500
    const paymentRes = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '500.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(paymentRes.operationId);

    const balBeforeEdit = await getCustomerBalance(customer1Id);
    const cajaBeforeEdit = await getCajaSteffenBalance();

    // 2. Editar aumentando $200 (de 500 a 700) -> delta = +200
    // Cliente debe disminuir 200, Caja debe aumentar 200
    const editRes1 = await patrimonyService.editPayment({
      paymentId: paymentRes.paymentId,
      newAmountArs: '700.00',
    });
    assert.strictEqual(new Decimal(editRes1.newAmountArs).toString(), '700');

    const balAfterEdit1 = await getCustomerBalance(customer1Id);
    const cajaAfterEdit1 = await getCajaSteffenBalance();
    assert.strictEqual(balBeforeEdit.minus(balAfterEdit1).toString(), '200');
    assert.strictEqual(cajaAfterEdit1.minus(cajaBeforeEdit).toString(), '200');

    // 3. Editar disminuyendo $300 (de 700 a 400) -> delta = -300
    // Cliente debe aumentar 300, Caja debe disminuir 300
    const editRes2 = await patrimonyService.editPayment({
      paymentId: paymentRes.paymentId,
      newAmountArs: '400.00',
    });
    assert.strictEqual(new Decimal(editRes2.newAmountArs).toString(), '400');

    const balAfterEdit2 = await getCustomerBalance(customer1Id);
    const cajaAfterEdit2 = await getCajaSteffenBalance();
    assert.strictEqual(balAfterEdit2.minus(balAfterEdit1).toString(), '300');
    assert.strictEqual(cajaAfterEdit1.minus(cajaAfterEdit2).toString(), '300');

    // Verificar MOV y entries
    const { data: mov } = await supabase
      .from('patrimonial_movements')
      .select('*')
      .eq('operation_id', paymentRes.operationId)
      .single();
    assert.strictEqual(new Decimal(mov!.amount_ars).toString(), '400');

    const { data: entries } = await supabase
      .from('financial_entries')
      .select('*')
      .eq('patrimonial_movement_id', mov!.id);
    for (const ent of entries!) {
      assert.strictEqual(new Decimal(ent.delta_ars).abs().toString(), '400');
    }
  });

  // 13. Edición de Pago Proveedor actualiza pago, MOV y entries atómicamente por delta
  await t.test('13. Edición de Pago Proveedor actualiza pago, MOV y entries atómicamente por delta', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 1000 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    // 1. Crear pago a proveedor original de $600
    const paymentRes = await patrimonyService.registerSupplierPayment({
      supplierId: supplier1Id,
      amountArs: '600.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(paymentRes.operationId);

    const balBeforeEdit = await getSupplierBalance(supplier1Id);
    const cajaBeforeEdit = await getCajaSteffenBalance();

    // 2. Editar aumentando $200 (de 600 a 800) -> delta = +200
    // Proveedor disminuye deuda 200, Caja disminuye 200
    await patrimonyService.editPayment({
      paymentId: paymentRes.paymentId,
      newAmountArs: '800.00',
    });

    const balAfterEdit1 = await getSupplierBalance(supplier1Id);
    const cajaAfterEdit1 = await getCajaSteffenBalance();
    assert.strictEqual(balBeforeEdit.minus(balAfterEdit1).toString(), '200');
    assert.strictEqual(cajaBeforeEdit.minus(cajaAfterEdit1).toString(), '200');

    // 3. Editar disminuyendo $300 (de 800 a 500) -> delta = -300
    // Proveedor aumenta deuda 300, Caja aumenta 300
    await patrimonyService.editPayment({
      paymentId: paymentRes.paymentId,
      newAmountArs: '500.00',
    });

    const balAfterEdit2 = await getSupplierBalance(supplier1Id);
    const cajaAfterEdit2 = await getCajaSteffenBalance();
    assert.strictEqual(balAfterEdit2.minus(balAfterEdit1).toString(), '300');
    assert.strictEqual(cajaAfterEdit2.minus(cajaAfterEdit1).toString(), '300');
  });

  // 14. Retiro de Caja disminuye Caja Steffen y genera MOV RETIRO
  await t.test('14. Retiro de Caja disminuye Caja Steffen y genera MOV RETIRO', async () => {
    const cajaBefore = await getCajaSteffenBalance();

    const res = await patrimonyService.registerWithdrawal({
      amountArs: '250.00',
      description: 'Retiro dueño test',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const cajaAfter = await getCajaSteffenBalance();
    assert.strictEqual(cajaBefore.minus(cajaAfter).toString(), '250');

    const { data: mov, error: movErr } = await supabase
      .from('patrimonial_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .single();
    assert.ifError(movErr);
    assert.strictEqual(mov.movement_type, 'RETIRO');
    assert.ok(mov.description.includes('Retiro dueño test'));
    assert.strictEqual(new Decimal(mov.amount_ars).toString(), '250');
  });

  // 15. Retiro de Caja NO toca stock
  await t.test('15. Retiro de Caja NO toca stock', async () => {
    const { count: stockMovBefore } = await supabase
      .from('stock_movements')
      .select('*', { count: 'exact', head: true });

    const res = await patrimonyService.registerWithdrawal({
      amountArs: '100.00',
      description: 'Retiro verificación stock',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const { count: stockMovAfter } = await supabase
      .from('stock_movements')
      .select('*', { count: 'exact', head: true });

    assert.strictEqual(stockMovBefore, stockMovAfter);
  });

  // 16. Caja Steffen en negativo permitido
  await t.test('16. Caja Steffen en negativo permitido', async () => {
    const cajaBefore = await getCajaSteffenBalance();
    // Retiro por un valor positivo suficiente para garantizar saldo negativo
    const withdrawalAmount = cajaBefore.isPositive()
      ? cajaBefore.plus('50000').toString()
      : '50000.00';

    const res = await patrimonyService.registerWithdrawal({
      amountArs: withdrawalAmount,
      description: 'Retiro saldo negativo permitido',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const cajaAfter = await getCajaSteffenBalance();
    assert.strictEqual(cajaBefore.minus(cajaAfter).toString(), new Decimal(withdrawalAmount).toString());
    assert.ok(cajaAfter.isNegative());
  });

  // 17. Gasto Operativo LUZ disminuye Caja Steffen y genera MOV GASTO_OPERATIVO
  await t.test('17. Gasto Operativo LUZ disminuye Caja Steffen y genera MOV GASTO_OPERATIVO', async () => {
    const cajaBefore = await getCajaSteffenBalance();

    const res = await patrimonyService.registerOperatingExpense({
      expenseType: 'LUZ',
      amountArs: '320.00',
      description: 'Factura Edenor Octubre',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const cajaAfter = await getCajaSteffenBalance();
    assert.strictEqual(cajaBefore.minus(cajaAfter).toString(), '320');

    const { data: mov } = await supabase
      .from('patrimonial_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .single();
    assert.strictEqual(mov!.movement_type, 'GASTO_OPERATIVO');
    assert.ok(mov!.description.includes('Factura Edenor Octubre'));
  });

  // 18. Gasto Operativo ALQUILER disminuye Caja Steffen
  await t.test('18. Gasto Operativo ALQUILER disminuye Caja Steffen', async () => {
    const cajaBefore = await getCajaSteffenBalance();

    const res = await patrimonyService.registerOperatingExpense({
      expenseType: 'ALQUILER',
      amountArs: '450.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const cajaAfter = await getCajaSteffenBalance();
    assert.strictEqual(cajaBefore.minus(cajaAfter).toString(), '450');
  });

  // 19. Gasto Operativo OTRO exige descripción (éxito con descripción)
  await t.test('19. Gasto Operativo OTRO exige descripción (éxito con descripción)', async () => {
    const res = await patrimonyService.registerOperatingExpense({
      expenseType: 'OTRO',
      amountArs: '120.00',
      description: 'Compra de resmas e insumos de oficina',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);
    assert.ok(res.code);
  });

  // 20. Gasto Operativo OTRO sin descripción es rechazado
  await t.test('20. Gasto Operativo OTRO sin descripción es rechazado', async () => {
    await assert.rejects(
      async () => {
        await patrimonyService.registerOperatingExpense({
          expenseType: 'OTRO',
          amountArs: '100.00',
          description: '',
          businessDate: '2026-10-12',
        });
      },
      {
        message: /descripción es obligatoria/i,
      }
    );
  });

  // 21. NETO = Caja Steffen + Caja ML + Deudas Clientes - Deudas Proveedores exacto
  await t.test('21. NETO = Caja Steffen + Caja ML + Deudas Clientes - Deudas Proveedores exacto', async () => {
    const summary = await patrimonyService.getPatrimonialSummary();

    const expectedNeto = summary.cajaSteffen
      .plus(summary.cajaMercadoLibre)
      .plus(summary.deudasClientes)
      .minus(summary.deudasProveedores);

    assert.strictEqual(
      summary.neto.toFixed(6),
      expectedNeto.toFixed(6)
    );
  });

  // 22. Caja Mercado Libre presente y consultable aun en 0
  await t.test('22. Caja Mercado Libre presente y consultable aun en 0', async () => {
    const summary = await patrimonyService.getPatrimonialSummary();
    assert.ok(summary.cajaMercadoLibre !== undefined && summary.cajaMercadoLibre !== null);
    assert.ok(!isNaN(Number(summary.cajaMercadoLibre.toString())));
  });

  // 23. Consulta de movimientos soporta filtro 90 días, tipo y búsqueda
  await t.test('23. Consulta de movimientos soporta filtro 90 días, tipo y búsqueda', async () => {
    // 1. Sin filtros (90 días por defecto)
    const movsAll = await patrimonyService.listMovements({ limit: 50 });
    assert.ok(Array.isArray(movsAll));

    // 2. Filtro por tipo RETIRO
    const movsRetiro = await patrimonyService.listMovements({
      movementType: 'RETIRO',
      limit: 50,
    });
    assert.ok(movsRetiro.length > 0);
    assert.ok(movsRetiro.every((m) => m.movementType === 'RETIRO'));

    // 3. Filtro por búsqueda de texto
    const movsSearch = await patrimonyService.listMovements({
      search: 'Edenor',
      limit: 50,
    });
    assert.ok(movsSearch.length > 0);
    assert.ok(movsSearch.some((m) => m.description.includes('Edenor')));
  });

  // 24. Concurrencia de pagos / movimientos con bloqueo de fila asegura saldos íntegros
  await t.test('24. Concurrencia de pagos / movimientos con bloqueo de fila asegura saldos íntegros', async () => {
    // Crear un nuevo cliente para test de concurrencia
    const concCustomer = await customerRepo.create({
      name: `Cliente Concurrente ${testTag}`,
    });
    createdCustomerIds.push(concCustomer.id);

    // Asignar deuda inicial de $2000
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 2000 })
      .eq('customer_id', concCustomer.id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    // 5 pagos concurrentes de $100 cada uno
    const promises = Array.from({ length: 5 }, () =>
      patrimonyService.registerCustomerPayment({
        customerId: concCustomer.id,
        amountArs: '100.00',
        businessDate: '2026-10-12',
      })
    );

    const results = await Promise.all(promises);
    for (const r of results) {
      createdOperations.push(r.operationId);
    }

    // El saldo final debe ser exactamente 2000 - (5 * 100) = 1500
    const finalBal = await getCustomerBalance(concCustomer.id);
    assert.strictEqual(finalBal.toString(), '1500');
  });

  // ==========================================================================
  // MICRO-CIERRE PRE-SMOKE — FASE 9: VALIDACIONES DE SALDO INICIAL Y DELTA
  // ==========================================================================

  // 25. cliente saldo > 0 permite pago
  await t.test('25. cliente saldo > 0 permite pago', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 1000 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    const res = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '400.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const bal = await getCustomerBalance(customer1Id);
    assert.strictEqual(bal.toString(), '600');
  });

  // 26. cliente saldo > 0 + sobrepago permite saldo < 0
  await t.test('26. cliente saldo > 0 + sobrepago permite saldo < 0', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 500 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    const res = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '750.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const bal = await getCustomerBalance(customer1Id);
    assert.strictEqual(bal.toString(), '-250');
  });

  // 27. cliente saldo = 0 rechaza nuevo pago
  await t.test('27. cliente saldo = 0 rechaza nuevo pago', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 0 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    await assert.rejects(
      async () => {
        await patrimonyService.registerCustomerPayment({
          customerId: customer1Id,
          amountArs: '100.00',
          businessDate: '2026-10-12',
        });
      },
      {
        message: /sin saldo deudor pendiente/i,
      }
    );
  });

  // 28. cliente saldo < 0 rechaza nuevo pago
  await t.test('28. cliente saldo < 0 rechaza nuevo pago', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: -200 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    await assert.rejects(
      async () => {
        await patrimonyService.registerCustomerPayment({
          customerId: customer1Id,
          amountArs: '100.00',
          businessDate: '2026-10-12',
        });
      },
      {
        message: /sin saldo deudor pendiente/i,
      }
    );
  });

  // 29. proveedor deuda > 0 permite pago
  await t.test('29. proveedor deuda > 0 permite pago', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 1500 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    const res = await patrimonyService.registerSupplierPayment({
      supplierId: supplier1Id,
      amountArs: '500.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(res.operationId);

    const bal = await getSupplierBalance(supplier1Id);
    assert.strictEqual(bal.toString(), '1000');
  });

  // 30. proveedor deuda > 0: pago mayor a deuda rechazado y rollback completo
  await t.test('30. proveedor deuda > 0: pago mayor a deuda rechazado y rollback completo', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 400 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    const cajaBefore = await getCajaSteffenBalance();

    await assert.rejects(
      async () => {
        await patrimonyService.registerSupplierPayment({
          supplierId: supplier1Id,
          amountArs: '700.00',
          businessDate: '2026-10-12',
        });
      },
      {
        message: /el importe no puede superar la deuda actual del proveedor/i,
      }
    );

    // Rollback verificado: saldo del proveedor y Caja Steffen intactos
    const balAfter = await getSupplierBalance(supplier1Id);
    assert.strictEqual(balAfter.toString(), '400');
    const cajaAfter = await getCajaSteffenBalance();
    assert.strictEqual(cajaAfter.toString(), cajaBefore.toString());
  });

  // 31. proveedor deuda = 0 rechaza nuevo pago
  await t.test('31. proveedor deuda = 0 rechaza nuevo pago', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 0 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    await assert.rejects(
      async () => {
        await patrimonyService.registerSupplierPayment({
          supplierId: supplier1Id,
          amountArs: '100.00',
          businessDate: '2026-10-12',
        });
      },
      {
        message: /sin deuda pendiente/i,
      }
    );
  });

  // 32. proveedor deuda < 0 rechaza nuevo pago
  await t.test('32. proveedor deuda < 0 rechaza nuevo pago', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: -300 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    await assert.rejects(
      async () => {
        await patrimonyService.registerSupplierPayment({
          supplierId: supplier1Id,
          amountArs: '100.00',
          businessDate: '2026-10-12',
        });
      },
      {
        message: /sin deuda pendiente/i,
      }
    );
  });

  // 33. editar pago histórico que dejó saldo a favor sigue permitido (estrategia delta)
  await t.test('33. editar pago histórico que dejó saldo a favor sigue permitido (estrategia delta)', async () => {
    // 1. Iniciar con saldo positivo de $300
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 300 })
      .eq('customer_id', customer1Id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    // 2. Sobrepago de $500 -> saldo queda en -200 (a favor)
    const paymentRes = await patrimonyService.registerCustomerPayment({
      customerId: customer1Id,
      amountArs: '500.00',
      businessDate: '2026-10-12',
    });
    createdOperations.push(paymentRes.operationId);

    const balAfterOverpay = await getCustomerBalance(customer1Id);
    assert.strictEqual(balAfterOverpay.toString(), '-200');

    // 3. Editar pago histórico aumentando a $600 mientras la cuenta ya está en saldo a favor (< 0)
    // Debe permitirlo sin error y ajustar por delta (-100 al cliente -> saldo -300)
    const editRes = await patrimonyService.editPayment({
      paymentId: paymentRes.paymentId,
      newAmountArs: '600.00',
    });
    assert.strictEqual(new Decimal(editRes.newAmountArs).toString(), '600');

    const balAfterEdit = await getCustomerBalance(customer1Id);
    assert.strictEqual(balAfterEdit.toString(), '-300');
  });

  // 34. proveedor USD genera deuda patrimonial ARS y ficha DTO la recibe en ARS
  await t.test('34. proveedor USD genera deuda patrimonial ARS y ficha DTO la recibe en ARS', async () => {
    const supUsd = await supplierRepo.create({
      name: `Proveedor USD ${testTag}`,
      currencyCode: 'USD',
      phone: '1199887766',
    });
    createdSupplierIds.push(supUsd.id);

    // Asignar saldo de $500.000 ARS en su cuenta patrimonial
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 500000 })
      .eq('supplier_id', supUsd.id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    // Consultar proveedor y verificar que el balance está en ARS
    const supRecord = await supplierRepo.findById(supUsd.id);
    assert.ok(supRecord);
    assert.strictEqual(supRecord.balance.toString(), '500000');
    assert.strictEqual(supRecord.currencyCode, 'USD');

    // Serializar DTO y verificar que balance es string exacto ARS
    const dto = serializeSupplier(supRecord);
    assert.strictEqual(dto.balance, '500000');
    assert.strictEqual(dto.currencyCode, 'USD');
  });

  // 35. Deudas Proveedores muestra solo saldos > 0 y excluye saldo 0 o negativo
  await t.test('35. Deudas Proveedores muestra solo saldos > 0 y excluye saldo 0 o negativo', async () => {
    // Proveedor con saldo > 0
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 1200 })
      .eq('supplier_id', supplier1Id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    // Proveedor con saldo 0
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 0 })
      .eq('supplier_id', supplierInactiveId)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    const debts = await patrimonyService.listSupplierDebtsWithActivity();
    assert.ok(debts.some((d) => d.supplierId === supplier1Id));
    assert.ok(!debts.some((d) => d.supplierId === supplierInactiveId));

    // Todos los registros deben tener balanceArs > 0
    for (const d of debts) {
      assert.ok(d.balanceArs.gt(0), `El proveedor ${d.name} tiene saldo <= 0`);
    }

    // Proveedor con saldo negativo tampoco aparece
    await supabase
      .from('financial_accounts')
      .update({ current_balance: -500 })
      .eq('supplier_id', supplierInactiveId)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    const debtsAfterNeg = await patrimonyService.listSupplierDebtsWithActivity();
    assert.ok(!debtsAfterNeg.some((d) => d.supplierId === supplierInactiveId));
  });

  // 36. Deudas Proveedores agrega último pago y última compra por business_date funcional
  await t.test('36. Deudas Proveedores agrega último pago y última compra por business_date funcional', async () => {
    const sup36 = await supplierRepo.create({
      name: `Proveedor Batch ${testTag}`,
      currencyCode: 'ARS',
      phone: '1122334455',
    });
    createdSupplierIds.push(sup36.id);

    // 1. Asignar saldo de $2000
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 2000 })
      .eq('supplier_id', sup36.id)
      .eq('account_type', 'SUPPLIER_PAYABLE');

    // 2. Registrar pago con business_date funcional
    const payRes = await patrimonyService.registerSupplierPayment({
      supplierId: sup36.id,
      amountArs: '500.00',
      businessDate: '2026-09-18',
    });
    createdOperations.push(payRes.operationId);

    const debts = await patrimonyService.listSupplierDebtsWithActivity();
    const target = debts.find((d) => d.supplierId === sup36.id);
    assert.ok(target);
    assert.strictEqual(target.lastPaymentDate, '2026-09-18');
  });
});
