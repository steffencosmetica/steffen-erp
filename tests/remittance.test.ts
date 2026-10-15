import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { RemittanceRepository } from '../src/repositories/remittance.repository';
import { RemittanceDomainService } from '../src/services/remittance.service';
import { OrderRepository } from '../src/repositories/order.repository';
import { OrderDomainService } from '../src/services/order.service';
import { CustomerRepository } from '../src/repositories/customer.repository';
import { ProductRepository } from '../src/repositories/product.repository';
import { PriceListRepository } from '../src/repositories/price-list.repository';
import { StockRepository } from '../src/repositories/stock.repository';
import { PatrimonyRepository } from '../src/repositories/patrimony.repository';
import { PlanningRepository } from '../src/repositories/planning.repository';
import { PlanningDomainService } from '../src/services/planning.service';
import { Decimal, toWholePesos, toKgPrecision } from '../src/domain/decimal';
import { DomainError } from '../src/domain/errors';
import type { Database } from '../src/database/types';
import { snapshotSharedAccounts, restoreSharedAccounts, type SharedAccountsSnapshot } from './helpers/shared-accounts-guard';
import fs from 'node:fs';
import path from 'node:path';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('FASE 12 — RTO / CONFIRMACIÓN DE VENTA: Suite de pruebas obligatorias', async (t) => {
  const remittanceRepo = new RemittanceRepository(supabase);
  const orderRepo = new OrderRepository(supabase);
  const customerRepo = new CustomerRepository(supabase);
  const productRepo = new ProductRepository(supabase);
  const priceListRepo = new PriceListRepository(supabase);
  const stockRepo = new StockRepository(supabase);
  const patrimonyRepo = new PatrimonyRepository(supabase);
  const planningRepo = new PlanningRepository(supabase);

  const orderService = new OrderDomainService(orderRepo);
  const remittanceService = new RemittanceDomainService(remittanceRepo, orderRepo, stockRepo);
  const planningService = new PlanningDomainService(planningRepo);

  const testTag = `RTO_${Date.now()}`;
  let customerId: string;
  let salonListId: string;
  let ecommerceListId: string;
  let publicListId: string;

  let pro1Id: string;
  let pro2Id: string;
  let pro1Code: string;
  let pro2Code: string;

  const createdOrderIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdRemittanceIds: string[] = [];

  let sharedSnapshot: SharedAccountsSnapshot | undefined;

  t.before(async () => {
    sharedSnapshot = await snapshotSharedAccounts(supabase);

    // 0. Precondición de seguridad: esta suite NUNCA debe completar un remito que no creó
    // ella misma (real o de otra corrida). Si el gate ya está ocupado, abortar en vez de
    // barrerlo a ciegas (incidente: esto llegó a completar RTO0182, un remito real de
    // smoke manual, ver migración 20261002000030_fix_rto0182_revert_to_rtm_pending.sql).
    const { data: foreignPending } = await supabase
      .from('remittances')
      .select('id, code')
      .eq('status', 'RTM_PENDING');
    if (foreignPending && foreignPending.length > 0) {
      throw new Error(
        `No se puede iniciar la suite: ya existe(n) remito(s) en RTM_PENDING (${foreignPending
          .map((r) => r.code)
          .join(', ')}) que esta suite no creó. Esta suite nunca completa remitos ajenos: ` +
          'resolvé ese RTM pendiente manualmente (o confirmá que es un fixture huérfano y limpialo) antes de correr los tests.'
      );
    }

    // 1. Obtener listas del sistema
    const salonList = await priceListRepo.getPriceListBySystemRole('SALON_DEFAULT');
    assert.ok(salonList, 'Debe existir SALON_DEFAULT');
    salonListId = salonList.id;

    const ecomList = await priceListRepo.getPriceListBySystemRole('ECOMMERCE_DEFAULT');
    assert.ok(ecomList, 'Debe existir ECOMMERCE_DEFAULT');
    ecommerceListId = ecomList.id;

    const pubList = await priceListRepo.getPriceListBySystemRole('PUBLIC_DEFAULT');
    assert.ok(pubList, 'Debe existir PUBLIC_DEFAULT');
    publicListId = pubList.id;

    // 2. Crear Cliente Registrado con descuentos (20% y 10%)
    const cust = await customerRepo.create({
      name: `Cliente RTO Test ${testTag}`,
      address: 'Av. Corrientes 1234',
      locality: 'CABA',
      province: 'Buenos Aires',
      phone: '1122334455',
      transportName: 'Expreso Steffen',
      discount1Pct: 20,
      discount2Pct: 10,
      discount3Pct: 0,
    });
    customerId = cust.id;
    createdCustomerIds.push(customerId);

    // Resetear saldo inicial a 0
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 0 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    // 3. Obtener base_product para asociar a los PRO
    let baseProdId: string;
    const { data: existingBp } = await supabase.from('base_products').select('id').limit(1).maybeSingle();
    if (existingBp) {
      baseProdId = existingBp.id;
    } else {
      const { data: newBp } = await supabase.from('base_products').insert({
        code: `BP_${testTag}`,
        name: `Base Product ${testTag}`,
      }).select().single();
      baseProdId = newBp!.id;
    }

    // 4. Crear Producto PRO1 (0.500 kg, $10.000 salon, $12.000 ecom, $15.000 public)
    pro1Code = `P1_${testTag}`;
    const { data: si1, error: si1Err } = await supabase
      .from('stock_items')
      .insert({
        code: pro1Code,
        name: `Shampoo Test 1 ${testTag}`,
        item_type: 'PRO',
        unit_type: 'UNIT',
        stock_minimum: 10,
        active: true,
      })
      .select()
      .single();
    assert.ifError(si1Err);
    pro1Id = si1!.id;
    createdProductIds.push(pro1Id);

    const { error: p1Err } = await supabase.from('products').insert({
      stock_item_id: pro1Id,
      base_product_id: baseProdId,
      presentation: '500ml',
      weight_kg: 0.5,
    });
    assert.ifError(p1Err);

    // 5. Crear Producto PRO2 (1.000 kg, $20.000 salon, $25.000 ecom, $30.000 public)
    pro2Code = `P2_${testTag}`;
    const { data: si2, error: si2Err } = await supabase
      .from('stock_items')
      .insert({
        code: pro2Code,
        name: `Acondicionador Test 2 ${testTag}`,
        item_type: 'PRO',
        unit_type: 'UNIT',
        stock_minimum: 5,
        active: true,
      })
      .select()
      .single();
    assert.ifError(si2Err);
    pro2Id = si2!.id;
    createdProductIds.push(pro2Id);

    const { error: p2Err } = await supabase.from('products').insert({
      stock_item_id: pro2Id,
      base_product_id: baseProdId,
      presentation: '1000ml',
      weight_kg: 1.0,
    });
    assert.ifError(p2Err);

    // Cargar precios en las listas usando setProductPrice
    await priceListRepo.setProductPrice(salonListId, pro1Id, 10000);
    await priceListRepo.setProductPrice(ecommerceListId, pro1Id, 12000);
    await priceListRepo.setProductPrice(publicListId, pro1Id, 15000);

    await priceListRepo.setProductPrice(salonListId, pro2Id, 20000);
    await priceListRepo.setProductPrice(ecommerceListId, pro2Id, 25000);
    await priceListRepo.setProductPrice(publicListId, pro2Id, 30000);

    // Asignar stock inicial suficiente en stock_balances: PRO1 = 500 unidades, PRO2 = 500 unidades
    await supabase.from('stock_balances').upsert([
      { stock_item_id: pro1Id, quantity: 500 },
      { stock_item_id: pro2Id, quantity: 500 },
    ]);
  });

  t.after(async () => {
    // Limpieza de datos creados en orden de claves foráneas. Todo se resuelve a
    // partir de UUIDs que esta suite creó (nunca por nombre/LIKE ni globalmente).
    //
    // Causa del leak histórico "Cliente Sec43 RTO_...": el test 56 registra un
    // Pago Cliente; `payments.customer_id` es ON DELETE RESTRICT, la limpieza no
    // borraba ese pago y el DELETE del cliente fallaba en silencio (sin chequear
    // `error`). Tampoco se borraban las business_operations / MOV de cada RTO.

    // Operaciones de negocio propias: las de cada RTO creado y las de los Pagos
    // Cliente de los clientes creados por la suite.
    const rtoOperationIds: string[] = [];
    if (createdRemittanceIds.length > 0) {
      const { data: rems, error } = await supabase
        .from('remittances')
        .select('operation_id')
        .in('id', createdRemittanceIds);
      assert.ifError(error);
      rtoOperationIds.push(...(rems || []).map((r) => r.operation_id));
    }
    const paymentIds: string[] = [];
    const paymentOperationIds: string[] = [];
    if (createdCustomerIds.length > 0) {
      const { data: pays, error } = await supabase
        .from('payments')
        .select('id, operation_id')
        .in('customer_id', createdCustomerIds);
      assert.ifError(error);
      for (const p of pays || []) {
        paymentIds.push(p.id);
        paymentOperationIds.push(p.operation_id);
      }
    }

    for (const remId of createdRemittanceIds) {
      await supabase.from('remittance_discount_steps').delete().eq('remittance_id', remId);
      await supabase.from('remittance_items').delete().eq('remittance_id', remId);
      await supabase.from('remittances').delete().eq('id', remId);
    }

    // Pagos Cliente (RESTRICT sobre customers y business_operations)
    if (paymentIds.length > 0) {
      await supabase.from('payments').delete().in('id', paymentIds);
    }

    // MST/MOV de las operaciones propias (financial_entries cascade desde
    // patrimonial_movements) y luego las business_operations.
    const ownOperationIds = [...rtoOperationIds, ...paymentOperationIds];
    if (ownOperationIds.length > 0) {
      await supabase.from('stock_movements').delete().in('operation_id', ownOperationIds);
      await supabase.from('patrimonial_movements').delete().in('operation_id', ownOperationIds);
      await supabase.from('business_operations').delete().in('id', ownOperationIds);
    }

    for (const orderId of createdOrderIds) {
      await supabase.from('order_discount_steps').delete().eq('order_id', orderId);
      await supabase.from('order_items').delete().eq('order_id', orderId);
      await supabase.from('orders').delete().eq('id', orderId);
    }

    for (const pId of createdProductIds) {
      await supabase.from('product_price_versions').delete().eq('product_id', pId);
      await supabase.from('products').delete().eq('stock_item_id', pId);
      await supabase.from('stock_balances').delete().eq('stock_item_id', pId);
      await supabase.from('stock_movements').delete().eq('stock_item_id', pId);
      await supabase.from('stock_items').delete().eq('id', pId);
    }

    for (const cId of createdCustomerIds) {
      // Columna real: financial_account_id (no "account_id"). Resolver las cuentas
      // propias del cliente de prueba y borrar únicamente sus entries por id explícito.
      const { data: accounts } = await supabase
        .from('financial_accounts')
        .select('id')
        .eq('customer_id', cId);
      const accountIds = (accounts || []).map((a) => a.id);
      if (accountIds.length > 0) {
        await supabase.from('financial_entries').delete().in('financial_account_id', accountIds);
      }
      await supabase.from('financial_accounts').delete().eq('customer_id', cId);
      // Nota: no existe la tabla "customer_discount_steps" en el esquema (los descuentos
      // viven directamente en customers.discount_1_pct/2/3); se elimina esa llamada muerta.
      await supabase.from('customers').delete().eq('id', cId);
    }

    // Verificación: la corrida no deja ningún fixture propio.
    const countRows = async (
      query: PromiseLike<{ count: number | null; error: { message: string } | null }>
    ): Promise<number> => {
      const { count, error } = await query;
      assert.ifError(error);
      return count ?? 0;
    };
    const head = { count: 'exact', head: true } as const;
    const leftovers = {
      customers: await countRows(supabase.from('customers').select('id', head).in('id', createdCustomerIds)),
      financial_accounts: await countRows(supabase.from('financial_accounts').select('id', head).in('customer_id', createdCustomerIds)),
      payments: await countRows(supabase.from('payments').select('id', head).in('customer_id', createdCustomerIds)),
      orders: await countRows(supabase.from('orders').select('id', head).in('id', createdOrderIds)),
      remittances: await countRows(supabase.from('remittances').select('id', head).in('id', createdRemittanceIds)),
      patrimonial_movements: await countRows(supabase.from('patrimonial_movements').select('id', head).in('operation_id', ownOperationIds)),
      business_operations: await countRows(supabase.from('business_operations').select('id', head).in('id', ownOperationIds)),
      stock_items: await countRows(supabase.from('stock_items').select('id', head).in('id', createdProductIds)),
    };
    assert.deepStrictEqual(
      leftovers,
      {
        customers: 0,
        financial_accounts: 0,
        payments: 0,
        orders: 0,
        remittances: 0,
        patrimonial_movements: 0,
        business_operations: 0,
        stock_items: 0,
      },
      'tests/remittance.test.ts no debe dejar fixtures propios en la base'
    );

    if (sharedSnapshot) {
      await restoreSharedAccounts(supabase, sharedSnapshot, 'tests/remittance.test.ts');
    }
  });

  // Helper para liberar el gate RTM_PENDING al terminar un test
  // IMPORTANTE: nunca barre RTM_PENDING globalmente. Solo opera sobre IDs que esta
  // suite creó (remittanceId explícito, o createdRemittanceIds cuando se omite),
  // para no poder tocar jamás un remito real/ajeno a la suite.
  const releaseRtmPendingGate = async (remittanceId?: string) => {
    if (remittanceId) {
      await supabase
        .from('remittances')
        .update({ status: 'COMPLETED' })
        .eq('id', remittanceId)
        .eq('status', 'RTM_PENDING');
      return;
    }
    if (createdRemittanceIds.length === 0) return;
    await supabase
      .from('remittances')
      .update({ status: 'COMPLETED' })
      .in('id', createdRemittanceIds)
      .eq('status', 'RTM_PENDING');
  };

  t.beforeEach(async () => {
    await releaseRtmPendingGate();
  });

  t.afterEach(async () => {
    await releaseRtmPendingGate();
  });

  // =========================================================================
  // 1. TESTS 1 A 7: Conversión básica, RTOxxxx, vinculación e inmutabilidad
  // =========================================================================
  await t.test('1-7. Conversión básica: PED OPEN con AG confirma, genera RTOxxxx (RTM_PENDING), PED pasa a CONVERTED y desaparece de abiertos y planificación', async () => {
    // Crear pedido con 10 un. de PRO1 y 5 un. de PRO2
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 10 },
        { productId: pro2Id, requestedQuantity: 5, agQuantity: 5 },
      ],
      packageCount: 2,
    });
    createdOrderIds.push(order.id);
    assert.strictEqual(order.status, 'OPEN');

    // Confirmar RTO
    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // 1. Confirma exitosamente
    assert.ok(rtoRes.remittanceId, 'Debe devolver remittanceId');
    // 2. Genera RTOxxxx
    assert.match(rtoRes.code, /^RTO-?\d+$/, 'Código de remito debe ser RTOxxxx o RTO-xxxx');
    // 3. RTO status RTM_PENDING
    assert.strictEqual(rtoRes.status, 'RTM_PENDING');
    // 4. PED pasa a CONVERTED
    const updatedOrder = await orderRepo.getOrderById(order.id);
    assert.strictEqual(updatedOrder?.status, 'CONVERTED');
    // 5. converted_rto_id correcto
    assert.strictEqual(updatedOrder?.convertedRtoId, rtoRes.remittanceId);

    // 6. PED desaparece de pedidos abiertos
    const openOrders = await orderRepo.listOpenOrders();
    assert.ok(!openOrders.some((o) => o.id === order.id), 'El pedido convertido no debe aparecer en pedidos abiertos');

    // 7. PED desaparece de planificación
    const planningMatrix = await planningService.getPlanningMatrix();
    assert.ok(!planningMatrix.openOrders.some((o) => o.orderId === order.id), 'El pedido convertido no debe aparecer en planificación');

    // Liberar gate para siguientes pruebas
    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 2. TESTS 8 A 15: AG cantidad real, líneas omitidas y validaciones
  // =========================================================================
  await t.test('8-10. AG menor, igual y mayor que requested quantity vende exactamente AG', async () => {
    // Pedido con:
    // PRO1: requested 10, AG 7 (menor)
    // PRO2: requested 5, AG 8 (mayor)
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 7 },
        { productId: pro2Id, requestedQuantity: 5, agQuantity: 8 },
      ],
      packageCount: 1,
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    const rto = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rto);

    const line1 = rto.items.find((i) => i.productId === pro1Id);
    assert.strictEqual(line1?.quantitySent, 7, 'Debe vender AG = 7');

    const line2 = rto.items.find((i) => i.productId === pro2Id);
    assert.strictEqual(line2?.quantitySent, 8, 'Debe vender AG = 8');

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('11. AG = 0 no crea remittance_item, no descuenta stock y no genera MST', async () => {
    // PRO1: requested 10, AG 5
    // PRO2: requested 10, AG 0
    const stockPro2Before = (await stockRepo.getBalance(pro2Id)).toNumber();

    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 5 },
        { productId: pro2Id, requestedQuantity: 10, agQuantity: 0 },
      ],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    const rto = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rto);
    assert.strictEqual(rto.items.length, 1, 'Solo debe crear 1 item para AG > 0');
    assert.strictEqual(rto.items[0].productId, pro1Id);

    // Stock de PRO2 intacto
    const stockPro2After = (await stockRepo.getBalance(pro2Id)).toNumber();
    assert.strictEqual(stockPro2After, stockPro2Before, 'Stock de PRO2 con AG=0 no debe modificarse');

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('12. Todas las líneas con AG = 0 es rechazado', async () => {
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 0 },
        { productId: pro2Id, requestedQuantity: 5, agQuantity: 0 },
      ],
    });
    createdOrderIds.push(order.id);

    await assert.rejects(
      remittanceService.confirmOrderToRemittance(order.id),
      /cantidad AG mayor a cero/i
    );
  });

  await t.test('13-15. AG null, negativo o fraccionario es rechazado', async () => {
    // 13. AG null
    const orderNull = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: null },
      ],
    });
    createdOrderIds.push(orderNull.id);
    await assert.rejects(
      remittanceService.confirmOrderToRemittance(orderNull.id),
      /cantidad AG cargada/i
    );

    // 14. AG negativo rechazado
    await assert.rejects(
      orderService.createOrder({
        customerSource: 'REGISTERED_CUSTOMER',
        customerId,
        items: [
          { productId: pro1Id, requestedQuantity: 10, agQuantity: -3 },
        ],
      }),
      /La cantidad AG debe ser un número entero no negativo/
    );

    // 15. AG fraccionario rechazado
    await assert.rejects(
      orderService.createOrder({
        customerSource: 'REGISTERED_CUSTOMER',
        customerId,
        items: [
          { productId: pro1Id, requestedQuantity: 10, agQuantity: 2.5 },
        ],
      }),
      /La cantidad AG debe ser un número entero no negativo/
    );
  });

  // =========================================================================
  // 3. TESTS 16 A 21: Stock PRO, saldos y movimientos físicos MST
  // =========================================================================
  await t.test('16-17. Stock suficiente descuenta unidades; stock exacto deja balance en 0', async () => {
    // Set stock exacto de PRO1 a 12 unidades
    await supabase.from('stock_balances').update({ quantity: 12 }).eq('stock_item_id', pro1Id);

    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 12, agQuantity: 12 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    const finalBal = await stockRepo.getBalance(pro1Id);
    assert.strictEqual(finalBal.toNumber(), 0, 'Stock exacto debe quedar en balance 0');

    // Restaurar stock
    await supabase.from('stock_balances').update({ quantity: 500 }).eq('stock_item_id', pro1Id);
    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('18-19. Stock insuficiente rechaza TODO el RTO atómicamente y jamás permite stock negativo', async () => {
    // Stock actual de PRO1 = 5, pero AG = 10
    await supabase.from('stock_balances').update({ quantity: 5 }).eq('stock_item_id', pro1Id);
    const stockPro2Before = (await stockRepo.getBalance(pro2Id)).toNumber();

    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 10 },
        { productId: pro2Id, requestedQuantity: 5, agQuantity: 5 },
      ],
    });
    createdOrderIds.push(order.id);

    await assert.rejects(
      remittanceService.confirmOrderToRemittance(order.id),
      /Stock insuficiente/
    );

    // Verificar que stock no bajó ni quedó negativo
    const pro1Stock = (await stockRepo.getBalance(pro1Id)).toNumber();
    assert.strictEqual(pro1Stock, 5, 'Stock de PRO1 debe permanecer inalterado en 5');

    const pro2Stock = (await stockRepo.getBalance(pro2Id)).toNumber();
    assert.strictEqual(pro2Stock, stockPro2Before, 'Stock de PRO2 no debe haber sido tocado por rollback');

    // Restaurar stock
    await supabase.from('stock_balances').update({ quantity: 500 }).eq('stock_item_id', pro1Id);
  });

  await t.test('20-21. Genera MST VENTA con cantidad negativa por cada línea enviada y no para AG = 0', async () => {
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 6 },
        { productId: pro2Id, requestedQuantity: 5, agQuantity: 0 },
      ],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // Consultar stock_movements generados bajo la operationId del remito
    const { data: mstRows } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('operation_id', rtoRes.operationId);

    assert.ok(mstRows);
    assert.strictEqual(mstRows.length, 1, 'Debe haber exactamente 1 MST para la línea con AG > 0');
    assert.strictEqual(mstRows[0].movement_type, 'VENTA');
    assert.strictEqual(mstRows[0].stock_item_id, pro1Id);
    assert.strictEqual(Number(mstRows[0].quantity_delta), -6, 'Delta debe ser -6');

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 4. TESTS 22 A 28: Peso, precios congelados, descuentos y totales
  // =========================================================================
  await t.test('22. Peso total del RTO se calcula exclusivamente con AG', async () => {
    // PRO1: weight 0.500 kg, requested 10, AG 4 -> 4 * 0.5 = 2.0 kg
    // PRO2: weight 1.000 kg, requested 5, AG 3 -> 3 * 1.0 = 3.0 kg
    // Total Peso RTO = 5.0 kg (mientras que en PED era 10*0.5 + 5*1.0 = 10.0 kg)
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 4 },
        { productId: pro2Id, requestedQuantity: 5, agQuantity: 3 },
      ],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    const rto = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rto);
    assert.strictEqual(rto.weightKgSnapshot.toNumber(), 5.0, 'El peso del RTO debe ser 5.0 kg');

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('23-26. Snapshot de precios y descuentos congelados del PED son respetados inmutablemente', async () => {
    // Crear pedido con precios actuales (PRO1: $10.000, PRO2: $20.000)
    // Descuentos congelados del cliente: 20% y 10%
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 10 },
      ],
    });
    createdOrderIds.push(order.id);

    // Modificar el precio en la lista maestra a $50.000 antes de confirmar
    await priceListRepo.setProductPrice(salonListId, pro1Id, 50000);

    // Modificar los descuentos del cliente a 50%
    await supabase
      .from('customers')
      .update({ discount_1_pct: 50 })
      .eq('id', customerId);

    // Confirmar RTO
    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    const rto = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rto);

    // El precio debe ser el congelado en el PED ($10.000, no $50.000)
    assert.strictEqual(rto.items[0].unitPriceArsSnapshot.toNumber(), 10000);
    // Subtotal = 10 * 10.000 = $100.000
    assert.strictEqual(rto.subtotalArs.toNumber(), 100000);

    // Descuentos aplicados deben ser 20% y 10% (congelados en el PED)
    // Subtotal 100.000 -> -20% (20.000) = 80.000 -> -10% (8.000) = 72.000
    assert.strictEqual(rto.totalOrderArs.toNumber(), 72000);

    // Restaurar precios y descuentos
    await priceListRepo.setProductPrice(salonListId, pro1Id, 10000);
    await supabase.from('customers').update({ discount_1_pct: 20 }).eq('id', customerId);
    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('27-28. Subtotal y Total Pedido real exacto con redondeo a pesos enteros', async () => {
    // 3 un de PRO1 ($10.000) -> Subtotal $30.000
    // Descuentos: 20% (-6.000) -> 24.000 -> 10% (-2.400) -> 21.600
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 5, agQuantity: 3 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    const rto = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rto);
    assert.strictEqual(rto.subtotalArs.toNumber(), 30000);
    assert.strictEqual(rto.totalOrderArs.toNumber(), 21600);

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 5. TESTS 29 A 37: Destinos, cuentas y movimientos patrimoniales (MOV VENTA)
  // =========================================================================
  await t.test('29-32. Cliente registrado: toma saldo anterior actual, total_to_collect suma saldo, pero deuda y MOV usan SOLO total_order', async () => {
    // Asignar saldo anterior de $15.000 en la cuenta corriente del cliente
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 15000 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    // Pedido con 1 un. de PRO1 ($10.000) -> con desc 20% y 10% = $7.200
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // 29. prior_balance_snapshot_ars toma saldo actual
    assert.strictEqual(rtoRes.priorBalanceSnapshotArs.toNumber(), 15000);
    // 30. total_to_collect = 7.200 + 15.000 = 22.200
    assert.strictEqual(rtoRes.totalToCollectArs.toNumber(), 22200);

    // 31. Cuenta corriente cliente aumenta SOLO total_order (15.000 + 7.200 = 22.200)
    const { data: acc } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();
    assert.strictEqual(Number(acc?.current_balance), 22200);

    // 32. MOV VENTA usa SOLO total_order ($7.200)
    const { data: mov } = await supabase
      .from('patrimonial_movements')
      .select('amount_ars, movement_type')
      .eq('code', rtoRes.movCode)
      .single();
    assert.strictEqual(mov?.movement_type, 'VENTA');
    assert.strictEqual(Number(mov?.amount_ars), 7200, 'MOV VENTA debe registrar solo el total de la venta (7.200)');

    // Resetear saldo a 0
    await supabase.from('financial_accounts').update({ current_balance: 0 }).eq('customer_id', customerId);
    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('33-34. Mercado Libre: aumenta Caja Mercado Libre y no genera deuda cliente', async () => {
    // Consultar balance inicial de Caja Mercado Libre
    const { data: mlAccBefore } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('account_type', 'CASH_MERCADO_LIBRE')
      .single();
    const mlBalBefore = Number(mlAccBefore?.current_balance || 0);

    // Crear pedido de Mercado Libre: 2 un. de PRO1 ($12.000 c/u) = $24.000 (sin desc)
    const order = await orderService.createOrder({
      customerSource: 'MERCADO_LIBRE',
      recipientName: 'Comprador ML',
      phone: '1199887766',
      items: [{ productId: pro1Id, requestedQuantity: 2, agQuantity: 2 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // Caja Mercado Libre incrementa exactamente $24.000
    const { data: mlAccAfter } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('account_type', 'CASH_MERCADO_LIBRE')
      .single();
    const mlBalAfter = Number(mlAccAfter?.current_balance || 0);
    assert.strictEqual(mlBalAfter - mlBalBefore, 24000);

    // prior_balance_snapshot_ars y total_to_collect para ML
    assert.strictEqual(rtoRes.priorBalanceSnapshotArs.toNumber(), 0);
    assert.strictEqual(rtoRes.totalToCollectArs.toNumber(), 24000);

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('35-36. Consumidor Final: aumenta Caja Steffen y no genera deuda cliente', async () => {
    // Consultar balance inicial de Caja Steffen
    const { data: stAccBefore } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('account_type', 'CASH_STEFFEN')
      .single();
    const stBalBefore = Number(stAccBefore?.current_balance || 0);

    // Crear pedido CF: 1 un. de PRO1 ($15.000 precio público)
    const order = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Consumidor Final Mostrador',
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // Caja Steffen incrementa exactamente $15.000
    const { data: stAccAfter } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('account_type', 'CASH_STEFFEN')
      .single();
    const stBalAfter = Number(stAccAfter?.current_balance || 0);
    assert.strictEqual(stBalAfter - stBalBefore, 15000);

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 5b. TESTS 37 A 40: Snapshots de destinatario/producto y inmutabilidad real
  // =========================================================================
  await t.test('37. Snapshot de destinatario se congela correctamente según origen (sin asumir campos no usados)', async () => {
    // Caso A: Cliente Registrado SIN overrides manuales -> snapshot toma los datos del cliente
    const orderA = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
      packageCount: 4,
    });
    createdOrderIds.push(orderA.id);
    const rtoResA = await remittanceService.confirmOrderToRemittance(orderA.id);
    createdRemittanceIds.push(rtoResA.remittanceId);
    const rtoA = await remittanceRepo.getRemittanceById(rtoResA.remittanceId);
    assert.ok(rtoA);
    assert.strictEqual(rtoA.recipientNameSnapshot, `Cliente RTO Test ${testTag}`);
    assert.strictEqual(rtoA.addressSnapshot, 'Av. Corrientes 1234');
    assert.strictEqual(rtoA.localitySnapshot, 'CABA');
    assert.strictEqual(rtoA.provinceSnapshot, 'Buenos Aires');
    assert.strictEqual(rtoA.phoneSnapshot, '1122334455');
    assert.strictEqual(rtoA.transportNameSnapshot, 'Expreso Steffen');
    assert.strictEqual(rtoA.transportAddressSnapshot, null, 'El cliente de prueba no usa transport_address: no debe inventarse un valor');
    assert.strictEqual(rtoA.packageCountSnapshot, 4);
    await releaseRtmPendingGate(rtoResA.remittanceId);

    // Caso B: Cliente Registrado CON override manual de dirección en el propio PED -> gana el override
    const orderB = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      address: 'Dirección Override PED 456',
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
    });
    createdOrderIds.push(orderB.id);
    const rtoResB = await remittanceService.confirmOrderToRemittance(orderB.id);
    createdRemittanceIds.push(rtoResB.remittanceId);
    const rtoB = await remittanceRepo.getRemittanceById(rtoResB.remittanceId);
    assert.ok(rtoB);
    assert.strictEqual(rtoB.addressSnapshot, 'Dirección Override PED 456');
    assert.strictEqual(rtoB.localitySnapshot, 'CABA', 'El resto de los campos no overrideados sigue viniendo del cliente');
    await releaseRtmPendingGate(rtoResB.remittanceId);

    // Caso C: Consumidor Final -> no hay cliente asociado; todo el destinatario viene del propio PED
    const orderC = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Juan Consumidor',
      address: 'Calle Falsa 123',
      locality: 'Rosario',
      province: 'Santa Fe',
      phone: '3410000000',
      transportName: 'Transporte Propio',
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
      packageCount: 1,
    });
    createdOrderIds.push(orderC.id);
    const rtoResC = await remittanceService.confirmOrderToRemittance(orderC.id);
    createdRemittanceIds.push(rtoResC.remittanceId);
    const rtoC = await remittanceRepo.getRemittanceById(rtoResC.remittanceId);
    assert.ok(rtoC);
    assert.strictEqual(rtoC.customerId, null, 'Consumidor Final no debe tener customer_id');
    assert.strictEqual(rtoC.recipientNameSnapshot, 'Juan Consumidor');
    assert.strictEqual(rtoC.addressSnapshot, 'Calle Falsa 123');
    assert.strictEqual(rtoC.localitySnapshot, 'Rosario');
    assert.strictEqual(rtoC.provinceSnapshot, 'Santa Fe');
    assert.strictEqual(rtoC.phoneSnapshot, '3410000000');
    assert.strictEqual(rtoC.transportNameSnapshot, 'Transporte Propio');
    assert.strictEqual(rtoC.packageCountSnapshot, 1);
    await releaseRtmPendingGate(rtoResC.remittanceId);

    // Caso D: Mercado Libre sin recipientName -> fallback explícito normativo a 'Mercado Libre'
    const orderD = await orderService.createOrder({
      customerSource: 'MERCADO_LIBRE',
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
    });
    createdOrderIds.push(orderD.id);
    const rtoResD = await remittanceService.confirmOrderToRemittance(orderD.id);
    createdRemittanceIds.push(rtoResD.remittanceId);
    const rtoD = await remittanceRepo.getRemittanceById(rtoResD.remittanceId);
    assert.ok(rtoD);
    assert.strictEqual(rtoD.customerId, null, 'Mercado Libre no debe tener customer_id');
    assert.strictEqual(rtoD.recipientNameSnapshot, 'Mercado Libre');
    await releaseRtmPendingGate(rtoResD.remittanceId);
  });

  await t.test('38. Modificar el Cliente después de confirmar RTO no altera el remito ya confirmado', async () => {
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 2, agQuantity: 2 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // Snapshot original (datos A) tomado en el momento de la confirmación
    const rtoBefore = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rtoBefore);
    const originalName = rtoBefore.recipientNameSnapshot;
    const originalAddress = rtoBefore.addressSnapshot;
    const originalLocality = rtoBefore.localitySnapshot;
    const originalPhone = rtoBefore.phoneSnapshot;

    // Modificar la ficha del cliente a datos B
    await supabase
      .from('customers')
      .update({
        name: 'Cliente Modificado B',
        address: 'Nueva Dirección B 999',
        locality: 'Córdoba',
        phone: '9999999999',
      })
      .eq('id', customerId);

    try {
      // El RTO debe seguir mostrando datos A, no B. No se reconstruye desde customers actual.
      const rtoAfter = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
      assert.ok(rtoAfter);
      assert.strictEqual(rtoAfter.recipientNameSnapshot, originalName);
      assert.strictEqual(rtoAfter.addressSnapshot, originalAddress);
      assert.strictEqual(rtoAfter.localitySnapshot, originalLocality);
      assert.strictEqual(rtoAfter.phoneSnapshot, originalPhone);
      assert.notStrictEqual(rtoAfter.recipientNameSnapshot, 'Cliente Modificado B');
    } finally {
      // Restaurar datos A: este customerId es compartido por el resto de la suite
      await supabase
        .from('customers')
        .update({
          name: `Cliente RTO Test ${testTag}`,
          address: 'Av. Corrientes 1234',
          locality: 'CABA',
          phone: '1122334455',
        })
        .eq('id', customerId);
    }

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('39. Modificar el PRO (maestro y precio vigente) después de confirmar RTO no altera el snapshot del remito', async () => {
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro2Id, requestedQuantity: 3, agQuantity: 3 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    const rtoBefore = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rtoBefore);
    const item = rtoBefore.items.find((i) => i.productId === pro2Id);
    assert.ok(item);
    const originalCode = item.productCodeSnapshot;
    const originalName = item.productNameSnapshot;
    const originalPresentation = item.presentationSnapshot;
    const originalWeight = item.weightKgSnapshot.toNumber();
    const originalPrice = item.unitPriceArsSnapshot.toNumber();
    assert.strictEqual(originalName, `Acondicionador Test 2 ${testTag}`);
    assert.strictEqual(originalPresentation, '1000ml');
    assert.strictEqual(originalWeight, 1.0);
    assert.strictEqual(originalPrice, 20000);

    try {
      // Modificar datos editables actuales del PRO (nombre, presentación, peso) y precio vigente de lista
      await supabase.from('stock_items').update({ name: 'Acondicionador RENOMBRADO' }).eq('id', pro2Id);
      await supabase.from('products').update({ presentation: '2000ml', weight_kg: 2.5 }).eq('stock_item_id', pro2Id);
      await priceListRepo.setProductPrice(salonListId, pro2Id, 77777);

      const rtoAfter = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
      assert.ok(rtoAfter);
      const itemAfter = rtoAfter.items.find((i) => i.productId === pro2Id);
      assert.ok(itemAfter);
      assert.strictEqual(itemAfter.productCodeSnapshot, originalCode);
      assert.strictEqual(itemAfter.productNameSnapshot, originalName);
      assert.strictEqual(itemAfter.presentationSnapshot, originalPresentation);
      assert.strictEqual(itemAfter.weightKgSnapshot.toNumber(), originalWeight);
      assert.strictEqual(itemAfter.unitPriceArsSnapshot.toNumber(), originalPrice);
    } finally {
      // Restaurar maestros de PRO2: compartido por el resto de la suite
      await supabase.from('stock_items').update({ name: `Acondicionador Test 2 ${testTag}` }).eq('id', pro2Id);
      await supabase.from('products').update({ presentation: '1000ml', weight_kg: 1.0 }).eq('stock_item_id', pro2Id);
      await priceListRepo.setProductPrice(salonListId, pro2Id, 20000);
    }

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('40. Un RTO confirmado no es editable (ni por la aplicación ni directamente en la base)', async () => {
    // 1. Auditoría de superficie de aplicación: no debe existir ninguna Server Action
    //    de edición/borrado expuesta sobre remitos. Se audita el código fuente en lugar
    //    de importar el módulo: `remittance.actions.ts` es 'use server' y arrastra
    //    composition.ts -> 'server-only', que aborta fuera del runtime de Next.js.
    const actionsSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/actions/remittance.actions.ts'),
      'utf-8'
    );
    const exportedFnNames = Array.from(actionsSource.matchAll(/export\s+async\s+function\s+(\w+)/g)).map(
      (m) => m[1]
    );
    assert.ok(exportedFnNames.length > 0, 'La auditoría debe encontrar al menos una Server Action exportada');
    const exposedEditLike = exportedFnNames.filter((k) => /update|edit|delete/i.test(k));
    assert.deepStrictEqual(exposedEditLike, [], 'No debe existir ninguna Server Action de edición/borrado sobre remitos');

    // 2. Tampoco debe existir método de dominio ni de repositorio para editar un remito existente.
    assert.strictEqual('updateRemittance' in remittanceService, false);
    assert.strictEqual('updateRemittance' in remittanceRepo, false);

    // 3. Crear y confirmar un RTO real
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
    });
    createdOrderIds.push(order.id);
    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // 4. Intentar editar un importe/snapshot directamente en la base, usando el mismo rol
    //    (service_role) que usa el servidor de la aplicación. Debe ser rechazado por el
    //    guard de inmutabilidad (migración 20261002000027), no por RLS.
    const { error: editErr } = await supabase
      .from('remittances')
      .update({ total_order_ars: 1 })
      .eq('id', rtoRes.remittanceId);
    assert.ok(editErr, 'Editar un importe de venta de un remito confirmado debe ser rechazado');
    assert.match(editErr.message, /inmutable/i);

    // 5. Intentar editar una línea del remito (remittance_items) también debe ser rechazado
    const { data: items } = await supabase
      .from('remittance_items')
      .select('id')
      .eq('remittance_id', rtoRes.remittanceId)
      .limit(1);
    assert.ok(items && items.length === 1);
    const { error: itemEditErr } = await supabase
      .from('remittance_items')
      .update({ quantity_sent: 999 })
      .eq('id', items[0].id);
    assert.ok(itemEditErr, 'Editar una línea de remito confirmado debe ser rechazado');
    assert.match(itemEditErr.message, /inmutable/i);

    // 6. La ÚNICA transición de estado legítima futura (RTM_PENDING -> COMPLETED, que ejecutará
    //    la futura RPC de RTM en Fase 13) debe seguir siendo posible: no debe quedar bloqueada
    //    por esta protección de inmutabilidad.
    const { error: statusOkErr } = await supabase
      .from('remittances')
      .update({ status: 'COMPLETED' })
      .eq('id', rtoRes.remittanceId);
    assert.strictEqual(statusOkErr, null, 'La transición RTM_PENDING -> COMPLETED debe seguir permitida para la futura RTM de Fase 13');

    // 7. Una transición de estado inválida (revertir COMPLETED -> RTM_PENDING) debe seguir rechazada
    const { error: invalidStatusErr } = await supabase
      .from('remittances')
      .update({ status: 'RTM_PENDING' })
      .eq('id', rtoRes.remittanceId);
    assert.ok(invalidStatusErr, 'No debe permitirse revertir COMPLETED -> RTM_PENDING');
  });

  // =========================================================================
  // 6. TESTS 41 A 46: Idempotencia, Gating y Concurrencia
  // =========================================================================
  await t.test('41-42. Segundo confirm del mismo PED es rechazado (idempotencia y UNIQUE order_id)', async () => {
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 2, agQuantity: 2 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // 1. Intentar reconfirmar el mismo pedido con el remito aún en RTM_PENDING: es bloqueado por el gate
    await assert.rejects(
      remittanceService.confirmOrderToRemittance(order.id),
      /Existe un remito con RTM pendiente/
    );

    // 2. Liberando el gate, el pedido ya está en CONVERTED por lo que sigue siendo rechazado por estado
    await releaseRtmPendingGate(rtoRes.remittanceId);
    await assert.rejects(
      remittanceService.confirmOrderToRemittance(order.id),
      /El pedido debe estar en estado ABIERTO/i
    );
  });

  await t.test('43-44. Gate RTM_PENDING: mientras exista un RTO en RTM_PENDING, rechaza confirmar otro RTO', async () => {
    // Pedido 1
    const order1 = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 2, agQuantity: 2 }],
    });
    createdOrderIds.push(order1.id);

    // Pedido 2
    const order2 = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
    });
    createdOrderIds.push(order2.id);

    // Confirmar Pedido 1 -> queda en RTM_PENDING
    const rto1 = await remittanceService.confirmOrderToRemittance(order1.id);
    createdRemittanceIds.push(rto1.remittanceId);

    // Intentar confirmar Pedido 2 mientras Pedido 1 sigue en RTM_PENDING -> debe ser bloqueado por el gate
    await assert.rejects(
      remittanceService.confirmOrderToRemittance(order2.id),
      /Existe un remito con RTM pendiente/
    );

    // Ahora simular el despacho de Pedido 1 (status = 'COMPLETED')
    await releaseRtmPendingGate(rto1.remittanceId);

    // Ahora Pedido 2 SÍ puede confirmarse
    const rto2 = await remittanceService.confirmOrderToRemittance(order2.id);
    createdRemittanceIds.push(rto2.remittanceId);
    assert.strictEqual(rto2.status, 'RTM_PENDING');

    await releaseRtmPendingGate(rto2.remittanceId);
  });

  await t.test('45. Concurrencia de stock: dos ventas concurrentes compitiendo por stock limitado no producen negativo', async () => {
    // Configurar stock exacto de PRO1 en 10 unidades
    await supabase.from('stock_balances').update({ quantity: 10 }).eq('stock_item_id', pro1Id);

    // Pedido A pide AG = 7
    const orderA = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 7, agQuantity: 7 }],
    });
    createdOrderIds.push(orderA.id);

    // Pedido B pide AG = 7
    const orderB = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 7, agQuantity: 7 }],
    });
    createdOrderIds.push(orderB.id);

    // Ejecutar ambas confirmaciones concurrentemente
    const results = await Promise.allSettled([
      remittanceService.confirmOrderToRemittance(orderA.id),
      remittanceService.confirmOrderToRemittance(orderB.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Como máximo 1 puede haber tenido éxito
    assert.strictEqual(fulfilled.length, 1, 'Exactamente una confirmación debe triunfar');
    assert.strictEqual(rejected.length, 1, 'La otra confirmación debe fallar (por stock o por gate RTM_PENDING)');

    const successfulRes = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    createdRemittanceIds.push(successfulRes.remittanceId);

    // El stock restante debe ser 3 (10 - 7 = 3) y NUNCA negativo
    const finalStock = (await stockRepo.getBalance(pro1Id)).toNumber();
    assert.strictEqual(finalStock, 3, 'El stock restante debe ser exactamente 3');

    // Restaurar stock
    await supabase.from('stock_balances').update({ quantity: 500 }).eq('stock_item_id', pro1Id);
    await releaseRtmPendingGate(successfulRes.remittanceId);
  });

  // =========================================================================
  // 7. TESTS 47 A 55: Rollback e integridad transaccional
  // =========================================================================
  await t.test('47-52. Rollback total: fallo dentro de la confirmación revierte RTO, stock, MST, MOV y deja PED OPEN', async () => {
    const stockBefore = (await stockRepo.getBalance(pro1Id)).toNumber();

    // Crear pedido donde PRO1 tiene stock pero PRO2 no tendrá suficiente stock
    await supabase.from('stock_balances').update({ quantity: 0 }).eq('stock_item_id', pro2Id);

    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [
        { productId: pro1Id, requestedQuantity: 10, agQuantity: 10 },
        { productId: pro2Id, requestedQuantity: 5, agQuantity: 5 },
      ],
    });
    createdOrderIds.push(order.id);

    await assert.rejects(
      remittanceService.confirmOrderToRemittance(order.id),
      /Stock insuficiente/
    );

    // 47. No se creó RTO
    const rto = await remittanceRepo.getRemittanceByOrderId(order.id);
    assert.strictEqual(rto, null);

    // 48. Stock de PRO1 no fue decrementado
    const stockAfter = (await stockRepo.getBalance(pro1Id)).toNumber();
    assert.strictEqual(stockAfter, stockBefore);

    // 52. PED sigue en OPEN
    const orderCheck = await orderRepo.getOrderById(order.id);
    assert.strictEqual(orderCheck?.status, 'OPEN');

    // Restaurar stock PRO2
    await supabase.from('stock_balances').update({ quantity: 500 }).eq('stock_item_id', pro2Id);
  });

  await t.test('53-55. No genera registros de RTM, transporte, ni ganancia en Fase 12', async () => {
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 2, agQuantity: 2 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // Verificar que no se hayan insertado registros en margin_remittances
    const { data: marginRows } = await supabase
      .from('margin_remittances')
      .select('*')
      .eq('remittance_id', rtoRes.remittanceId);
    assert.strictEqual(marginRows?.length || 0, 0, 'No debe generar margin_remittances en Fase 12');

    // Verificar que no haya movimientos de transporte
    const { data: movRows } = await supabase
      .from('patrimonial_movements')
      .select('*')
      .eq('operation_id', rtoRes.operationId);
    assert.ok(movRows);
    assert.ok(!movRows.some((m) => m.movement_type === 'TRANSPORTE'), 'No debe haber MOV TRANSPORTE');

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 8. TEST INTEGRADO SECCIÓN 43: Cliente Registrado + Pago Cliente (Fase 9 + 12)
  // =========================================================================
  await t.test('56 (Sección 43). Circuito Integrado Cliente Registrado + Pago Cliente', async () => {
    // Escenario Sección 43:
    // Cliente registrado saldo inicial = 0
    await supabase.from('financial_accounts').update({ current_balance: 0 }).eq('customer_id', customerId);

    // PED: Total real AG = $100.000
    // Usamos 10 un. de PRO1 a $10.000 = $100.000 (sin descuentos para este test específico de circuito)
    const custNoDesc = await customerRepo.create({
      name: `Cliente Sec43 ${testTag}`,
      address: 'Calle 1',
      locality: 'CABA',
      province: 'BA',
      phone: '123',
      discount1Pct: 0,
      discount2Pct: 0,
      discount3Pct: 0,
    });
    createdCustomerIds.push(custNoDesc.id);
    await supabase.from('financial_accounts').update({ current_balance: 0 }).eq('customer_id', custNoDesc.id);

    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId: custNoDesc.id,
      items: [{ productId: pro1Id, requestedQuantity: 10, agQuantity: 10 }],
    });
    createdOrderIds.push(order.id);

    // 1. Confirmar RTO
    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    assert.strictEqual(rtoRes.totalOrderArs.toNumber(), 100000);

    // Deuda del cliente pasa a 100.000
    const { data: accAfterRto } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', custNoDesc.id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();
    assert.strictEqual(Number(accAfterRto?.current_balance), 100000);

    // 2. Registrar Pago Cliente de $40.000 usando flujo existente de Fase 9
    const cajaSteffenBefore = (await patrimonyRepo.getPatrimonialSummary()).cajaSteffen;

    const paymentRes = await patrimonyRepo.registerCustomerPaymentAtomic({
      customerId: custNoDesc.id,
      amountArs: new Decimal(40000),
      businessDate: new Date().toISOString().slice(0, 10),
    });
    assert.ok(paymentRes.paymentId);

    // Resultado:
    // CUSTOMER_RECEIVABLE = 60.000
    const { data: accAfterPayment } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', custNoDesc.id)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();
    assert.strictEqual(Number(accAfterPayment?.current_balance), 60000);

    // Caja Steffen += 40.000
    const cajaSteffenAfter = (await patrimonyRepo.getPatrimonialSummary()).cajaSteffen;
    assert.strictEqual(cajaSteffenAfter.minus(cajaSteffenBefore).toNumber(), 40000);

    // MOV: VENTA 100.000 y PAGO_CLIENTE 40.000
    const { data: ventaMov } = await supabase
      .from('patrimonial_movements')
      .select('amount_ars, movement_type')
      .eq('code', rtoRes.movCode)
      .single();
    assert.strictEqual(ventaMov?.movement_type, 'VENTA');
    assert.strictEqual(Number(ventaMov?.amount_ars), 100000);

    const { data: pagoMov } = await supabase
      .from('patrimonial_movements')
      .select('amount_ars, movement_type')
      .eq('operation_id', paymentRes.operationId)
      .single();
    assert.strictEqual(pagoMov?.movement_type, 'PAGO_CLIENTE');
    assert.strictEqual(Number(pagoMov?.amount_ars), 40000);

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 9. TEST INTEGRADO SECCIÓN 44: Mercado Libre
  // =========================================================================
  await t.test('57 (Sección 44). Circuito Mercado Libre: Total RTO $100.000 -> Caja ML += $100.000, Caja Steffen sin cambios, Deudas Clientes sin cambios', async () => {
    const summaryBefore = await patrimonyRepo.getPatrimonialSummary();

    // Crear producto temporal de $50.000 para llegar a $100.000 con 2 unidades en Ecommerce
    const order = await orderService.createOrder({
      customerSource: 'MERCADO_LIBRE',
      recipientName: 'Comprador ML Sec44',
      items: [{ productId: pro2Id, requestedQuantity: 4, agQuantity: 4 }], // 4 * $25.000 = $100.000
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    assert.strictEqual(rtoRes.totalOrderArs.toNumber(), 100000);

    const summaryAfter = await patrimonyRepo.getPatrimonialSummary();

    // Caja ML += 100.000
    assert.strictEqual(summaryAfter.cajaMercadoLibre.minus(summaryBefore.cajaMercadoLibre).toNumber(), 100000);
    // Caja Steffen sin cambios
    assert.strictEqual(summaryAfter.cajaSteffen.toNumber(), summaryBefore.cajaSteffen.toNumber());
    // Deudas Clientes sin cambios
    assert.strictEqual(summaryAfter.deudasClientes.toNumber(), summaryBefore.deudasClientes.toNumber());

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 10. TEST INTEGRADO SECCIÓN 45: Consumidor Final
  // =========================================================================
  await t.test('58 (Sección 45). Circuito Consumidor Final: Total RTO $90.000 -> Caja Steffen += $90.000, Caja ML sin cambios, Deudas Clientes sin cambios', async () => {
    const summaryBefore = await patrimonyRepo.getPatrimonialSummary();

    // PRO2 precio público = $30.000. 3 unidades = $90.000
    const order = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Cliente Particular Sec45',
      items: [{ productId: pro2Id, requestedQuantity: 3, agQuantity: 3 }],
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    assert.strictEqual(rtoRes.totalOrderArs.toNumber(), 90000);

    const summaryAfter = await patrimonyRepo.getPatrimonialSummary();

    // Caja Steffen += 90.000
    assert.strictEqual(summaryAfter.cajaSteffen.minus(summaryBefore.cajaSteffen).toNumber(), 90000);
    // Caja ML sin cambios
    assert.strictEqual(summaryAfter.cajaMercadoLibre.toNumber(), summaryBefore.cajaMercadoLibre.toNumber());
    // Deudas Clientes sin cambios
    assert.strictEqual(summaryAfter.deudasClientes.toNumber(), summaryBefore.deudasClientes.toNumber());

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 11. TEST INTEGRADO SECCIÓN 46: Inmutabilidad histórica de Snapshots
  // =========================================================================
  await t.test('59 (Sección 46). Test de Snapshot / Histórico: Modificar maestros después no altera el RTO confirmado', async () => {
    // 1. Crear PED y congelar producto, precio, peso, descuento, destino
    const order = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 5, agQuantity: 5 }],
      packageCount: 3,
    });
    createdOrderIds.push(order.id);

    // 2. Modificar maestros ANTES de confirmar para verificar que el PED congeló correctamente
    await priceListRepo.setProductPrice(salonListId, pro1Id, 99999);

    // 3. Confirmar RTO
    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id);
    createdRemittanceIds.push(rtoRes.remittanceId);

    // 4. Modificar maestros DESPUÉS de confirmar:
    // - Cambiar nombre y dirección del cliente
    await supabase.from('customers').update({ name: 'Nombre Alterado', address: 'Dirección Alterada' }).eq('id', customerId);
    // - Cambiar nombre y peso del producto PRO1
    await supabase.from('stock_items').update({ name: 'Shampoo Alterado' }).eq('id', pro1Id);
    await supabase.from('products').update({ weight_kg: 99.0 }).eq('stock_item_id', pro1Id);

    // 5. Consultar RTO: debe mantener exactamente sus valores históricos
    const rto = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.ok(rto);

    assert.strictEqual(rto.items[0].productNameSnapshot, `Shampoo Test 1 ${testTag}`);
    assert.strictEqual(rto.items[0].weightKgSnapshot.toNumber(), 0.5);
    assert.strictEqual(rto.items[0].unitPriceArsSnapshot.toNumber(), 10000);
    assert.strictEqual(rto.weightKgSnapshot.toNumber(), 2.5); // 5 * 0.5 = 2.5 kg
    assert.strictEqual(rto.recipientNameSnapshot, `Cliente RTO Test ${testTag}`);
    assert.strictEqual(rto.addressSnapshot, 'Av. Corrientes 1234');

    // Restaurar precios
    await priceListRepo.setProductPrice(salonListId, pro1Id, 10000);
    await releaseRtmPendingGate(rtoRes.remittanceId);
  });
});
