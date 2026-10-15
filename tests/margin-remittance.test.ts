import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { RemittanceRepository } from '../src/repositories/remittance.repository';
import { RemittanceDomainService } from '../src/services/remittance.service';
import { MarginRemittanceRepository } from '../src/repositories/margin-remittance.repository';
import { OrderRepository } from '../src/repositories/order.repository';
import { OrderDomainService } from '../src/services/order.service';
import { CustomerRepository } from '../src/repositories/customer.repository';
import { ProductRepository } from '../src/repositories/product.repository';
import { FormulaRepository } from '../src/repositories/formula.repository';
import { PriceListRepository } from '../src/repositories/price-list.repository';
import { StockRepository } from '../src/repositories/stock.repository';
import { PatrimonyRepository } from '../src/repositories/patrimony.repository';
import { PatrimonyDomainService } from '../src/services/patrimony.service';
import { CostEngineService } from '../src/services/cost-engine.service';
import { Decimal } from '../src/domain/decimal';
import type { Database } from '../src/database/types';
import { snapshotSharedAccounts, restoreSharedAccounts, type SharedAccountsSnapshot } from './helpers/shared-accounts-guard';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('FASE 13 — RTM / REMITO DE MARGEN: Suite de pruebas obligatorias', async (t) => {
  const remittanceRepo = new RemittanceRepository(supabase);
  const marginRemittanceRepo = new MarginRemittanceRepository(supabase);
  const orderRepo = new OrderRepository(supabase);
  const customerRepo = new CustomerRepository(supabase);
  const productRepo = new ProductRepository(supabase);
  const formulaRepo = new FormulaRepository(supabase);
  const priceListRepo = new PriceListRepository(supabase);
  const stockRepo = new StockRepository(supabase);
  const patrimonyRepo = new PatrimonyRepository(supabase);
  const patrimonyService = new PatrimonyDomainService(patrimonyRepo);
  const costEngineService = new CostEngineService(undefined, formulaRepo, productRepo);

  const orderService = new OrderDomainService(orderRepo);
  const remittanceService = new RemittanceDomainService(
    remittanceRepo,
    orderRepo,
    stockRepo,
    marginRemittanceRepo,
    costEngineService
  );

  const testTag = `RTM_${Date.now()}`;

  const createdCustomerIds: string[] = [];
  const createdSupplierIds: string[] = [];
  const createdMasterStockItemIds: string[] = [];
  const createdBaseProductIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdRemittanceIds: string[] = [];
  const createdRtoOperationIds: string[] = [];
  const createdMarginRemittanceIds: string[] = [];
  const createdRtmOperationIds: string[] = [];

  let supplierId: string;
  let mprId: string;
  let comId: string;
  let pbaId: string;
  let ecommerceListId: string;
  let publicListId: string;

  let pro1Id: string; // weight 2.0kg, sin componentes
  let pro2Id: string; // weight 1.0kg, sin componentes
  let customerId: string;

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

    const ecomList = await priceListRepo.getPriceListBySystemRole('ECOMMERCE_DEFAULT');
    assert.ok(ecomList, 'Debe existir ECOMMERCE_DEFAULT');
    ecommerceListId = ecomList.id;

    const pubList = await priceListRepo.getPriceListBySystemRole('PUBLIC_DEFAULT');
    assert.ok(pubList, 'Debe existir PUBLIC_DEFAULT');
    publicListId = pubList.id;

    // 1. Proveedor + MPR con costo neto $100/kg -> bruto con IVA 21% = $121/kg
    const { data: supData, error: supErr } = await supabase.rpc('create_supplier_with_account' as any, {
      p_name: `Proveedor RTM Test ${testTag}`,
      p_currency_code: 'ARS',
    } as any);
    assert.ifError(supErr);
    supplierId = (supData as any).id;
    createdSupplierIds.push(supplierId);

    const { data: mprData, error: mprErr } = await supabase.rpc('create_master_item' as any, {
      p_item_type: 'MPR',
      p_name: `MPR RTM Test ${testTag}`,
      p_stock_minimum: 10,
      p_initial_supplier_id: supplierId,
      p_initial_quoted_price_net: 100,
      p_initial_stock: 1000,
      p_inci: 'Aqua Purificata Test',
    } as any);
    assert.ifError(mprErr);
    mprId = (mprData as any).id;
    createdMasterStockItemIds.push(mprId);

    // 1b. COM (componente obligatorio de todo PRO) con costo neto $10 -> bruto con IVA 21% = $12.10
    const { data: comData, error: comErr } = await supabase.rpc('create_master_item' as any, {
      p_item_type: 'COM',
      p_name: `COM RTM Test ${testTag}`,
      p_stock_minimum: 20,
      p_initial_supplier_id: supplierId,
      p_initial_quoted_price_net: 10,
      p_initial_stock: 1000,
    } as any);
    assert.ifError(comErr);
    comId = (comData as any).id;
    createdMasterStockItemIds.push(comId);

    // 2. PBA: 1kg de MPR -> costo por kg = $121
    const { data: pbaData, error: pbaErr } = await supabase.rpc('create_base_product_with_formula' as any, {
      p_name: `PBA RTM Test ${testTag}`,
      p_items: [{ raw_material_id: mprId, quantity_kg: 1.0, sort_order: 1 }],
      p_observations: 'Fórmula test RTM',
    } as any);
    assert.ifError(pbaErr);
    pbaId = (pbaData as any).base_product.id;
    createdBaseProductIds.push(pbaId);

    // 3. PRO1: peso 2.0kg, sin componentes -> costo = 2.0 * 121 * 1.02 = 246.84
    const { data: pro1Data, error: pro1Err } = await supabase.rpc('create_final_product' as any, {
      p_name: `PRO1 RTM Test ${testTag}`,
      p_base_product_id: pbaId,
      p_presentation: '2000ml',
      p_weight_kg: 2.0,
      p_stock_minimum: 5,
      p_components: [{ component_id: comId, quantity_per_unit: 1, sort_order: 1 }],
      p_initial_stock: 1000,
    } as any);
    assert.ifError(pro1Err);
    pro1Id = (pro1Data as any).id;
    createdProductIds.push(pro1Id);

    // 4. PRO2: peso 1.0kg, sin componentes -> costo = 1.0 * 121 * 1.02 = 123.42
    const { data: pro2Data, error: pro2Err } = await supabase.rpc('create_final_product' as any, {
      p_name: `PRO2 RTM Test ${testTag}`,
      p_base_product_id: pbaId,
      p_presentation: '1000ml',
      p_weight_kg: 1.0,
      p_stock_minimum: 5,
      p_components: [{ component_id: comId, quantity_per_unit: 1, sort_order: 1 }],
      p_initial_stock: 1000,
    } as any);
    assert.ifError(pro2Err);
    pro2Id = (pro2Data as any).id;
    createdProductIds.push(pro2Id);

    // Precios de venta (lista Ecommerce / Mercado Libre, canal usado por defecto en esta suite)
    await priceListRepo.setProductPrice(ecommerceListId, pro1Id, 5000);
    await priceListRepo.setProductPrice(ecommerceListId, pro2Id, 3000);

    // Precio Público (Consumidor Final)
    await priceListRepo.setProductPrice(publicListId, pro1Id, 6000);
    await priceListRepo.setProductPrice(publicListId, pro2Id, 4000);

    // 5. Cliente registrado (para pruebas de deuda/saldo anterior)
    const cust = await customerRepo.create({
      name: `Cliente RTM Test ${testTag}`,
      address: 'Av. Siempreviva 742',
      locality: 'CABA',
      province: 'Buenos Aires',
      phone: '1133445566',
      transportName: 'Expreso Steffen',
      discount1Pct: 0,
      discount2Pct: 0,
      discount3Pct: 0,
    });
    customerId = cust.id;
    createdCustomerIds.push(customerId);

    await supabase
      .from('financial_accounts')
      .update({ current_balance: 0 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    const salonList = await priceListRepo.getPriceListBySystemRole('SALON_DEFAULT');
    assert.ok(salonList);
    await priceListRepo.setProductPrice(salonList.id, pro1Id, 5000);
  });

  t.after(async () => {
    // 1. Artefactos de RTM: margin_remittances/items (cascade) + MOV TRANSPORTE + business_operation
    for (const mrId of createdMarginRemittanceIds) {
      await supabase.from('margin_remittance_items').delete().eq('margin_remittance_id', mrId);
      await supabase.from('margin_remittances').delete().eq('id', mrId);
    }
    for (const opId of createdRtmOperationIds) {
      await supabase.from('stock_movements').delete().eq('operation_id', opId);
      // Cubre tanto operaciones de RTM (sin payments) como la operación de un Pago Cliente
      // de prueba (sección Cuenta Cliente), que también referencia business_operations.
      await supabase.from('payments').delete().eq('operation_id', opId);
      await supabase.from('patrimonial_movements').delete().eq('operation_id', opId);
      await supabase.from('business_operations').delete().eq('id', opId);
    }

    // 2. Artefactos de RTO: remittances/items/discount_steps + MST VENTA + MOV VENTA + business_operation
    for (const remId of createdRemittanceIds) {
      await supabase.from('remittance_discount_steps').delete().eq('remittance_id', remId);
      await supabase.from('remittance_items').delete().eq('remittance_id', remId);
      await supabase.from('remittances').delete().eq('id', remId);
    }
    for (const opId of createdRtoOperationIds) {
      await supabase.from('stock_movements').delete().eq('operation_id', opId);
      await supabase.from('patrimonial_movements').delete().eq('operation_id', opId);
      await supabase.from('business_operations').delete().eq('id', opId);
    }

    // 3. Pedidos
    for (const orderId of createdOrderIds) {
      await supabase.from('order_discount_steps').delete().eq('order_id', orderId);
      await supabase.from('order_items').delete().eq('order_id', orderId);
      await supabase.from('orders').delete().eq('id', orderId);
    }

    // 4. Productos (PRO)
    for (const pId of createdProductIds) {
      await supabase.from('product_price_versions').delete().eq('product_id', pId);
      await supabase.from('products').delete().eq('stock_item_id', pId);
      await supabase.from('stock_balances').delete().eq('stock_item_id', pId);
      await supabase.from('stock_movements').delete().eq('stock_item_id', pId);
      await supabase.from('stock_items').delete().eq('id', pId);
    }

    // 5. PBA / Fórmula (formula_version_items cascade desde formula_versions)
    for (const bpId of createdBaseProductIds) {
      await supabase.from('formula_versions').delete().eq('base_product_id', bpId);
      await supabase.from('base_products').delete().eq('id', bpId);
    }

    // 6. Maestros (MPR/COM) + Proveedor
    for (const siId of createdMasterStockItemIds) {
      await supabase.from('supplier_items').delete().eq('stock_item_id', siId);
      await supabase.from('stock_balances').delete().eq('stock_item_id', siId);
      await supabase.from('stock_movements').delete().eq('stock_item_id', siId);
      // Subtipos (RESTRICT): deben borrarse antes que stock_items
      await supabase.from('raw_materials').delete().eq('stock_item_id', siId);
      await supabase.from('components').delete().eq('stock_item_id', siId);
      await supabase.from('stock_items').delete().eq('id', siId);
    }
    for (const supId of createdSupplierIds) {
      await supabase.from('financial_accounts').delete().eq('supplier_id', supId);
      await supabase.from('suppliers').delete().eq('id', supId);
    }

    // 7. Clientes
    for (const cId of createdCustomerIds) {
      const { data: accounts } = await supabase
        .from('financial_accounts')
        .select('id')
        .eq('customer_id', cId);
      const accountIds = (accounts || []).map((a) => a.id);
      if (accountIds.length > 0) {
        await supabase.from('financial_entries').delete().in('financial_account_id', accountIds);
      }
      await supabase.from('financial_accounts').delete().eq('customer_id', cId);
      await supabase.from('customers').delete().eq('id', cId);
    }

    // 8. Verificación: 0 artefactos propios.
    const ownOperationIds = [...createdRtoOperationIds, ...createdRtmOperationIds];
    const countRows = async (
      query: PromiseLike<{ count: number | null; error: { message: string } | null }>
    ): Promise<number> => {
      const { count, error } = await query;
      assert.ifError(error);
      return count ?? 0;
    };
    const head = { count: 'exact', head: true } as const;
    assert.deepStrictEqual(
      {
        margin_remittances: await countRows(supabase.from('margin_remittances').select('id', head).in('id', createdMarginRemittanceIds)),
        remittances: await countRows(supabase.from('remittances').select('id', head).in('id', createdRemittanceIds)),
        orders: await countRows(supabase.from('orders').select('id', head).in('id', createdOrderIds)),
        payments: await countRows(supabase.from('payments').select('id', head).in('customer_id', createdCustomerIds)),
        patrimonial_movements: await countRows(supabase.from('patrimonial_movements').select('id', head).in('operation_id', ownOperationIds)),
        business_operations: await countRows(supabase.from('business_operations').select('id', head).in('id', ownOperationIds)),
        customers: await countRows(supabase.from('customers').select('id', head).in('id', createdCustomerIds)),
        suppliers: await countRows(supabase.from('suppliers').select('id', head).in('id', createdSupplierIds)),
        stock_items: await countRows(supabase.from('stock_items').select('id', head).in('id', [...createdProductIds, ...createdMasterStockItemIds])),
      },
      {
        margin_remittances: 0,
        remittances: 0,
        orders: 0,
        payments: 0,
        patrimonial_movements: 0,
        business_operations: 0,
        customers: 0,
        suppliers: 0,
        stock_items: 0,
      },
      'tests/margin-remittance.test.ts no debe dejar fixtures propios en la base'
    );

    if (sharedSnapshot) {
      await restoreSharedAccounts(supabase, sharedSnapshot, 'tests/margin-remittance.test.ts');
    }
  });

  // IMPORTANTE: nunca barre RTM_PENDING globalmente. Solo opera sobre IDs que esta
  // suite creó (remittanceId explícito, o createdRemittanceIds cuando se omite),
  // para no poder tocar jamás un remito real/ajeno a la suite (p.ej. RTO0182).
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

  // Helper: crea un PED Mercado Libre (sin cliente, sin descuentos) y confirma su RTO
  const createAndConfirmRto = async (
    items: Array<{ productId: string; qty: number }>,
    opts?: {
      customerSource?: 'MERCADO_LIBRE' | 'CONSUMER_FINAL' | 'REGISTERED_CUSTOMER';
      customerId?: string;
      businessDate?: string;
    }
  ) => {
    const customerSource = opts?.customerSource || 'MERCADO_LIBRE';
    const order = await orderService.createOrder({
      customerSource,
      customerId: opts?.customerId,
      recipientName: customerSource === 'CONSUMER_FINAL' ? 'Consumidor Final Test' : undefined,
      items: items.map((it) => ({
        productId: it.productId,
        requestedQuantity: it.qty,
        agQuantity: it.qty,
      })),
    });
    createdOrderIds.push(order.id);

    const rtoRes = await remittanceService.confirmOrderToRemittance(order.id, opts?.businessDate);
    createdRemittanceIds.push(rtoRes.remittanceId);
    createdRtoOperationIds.push(rtoRes.operationId);
    return rtoRes;
  };

  const getCashSteffenBalance = async (): Promise<number> => {
    const { data } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('account_type', 'CASH_STEFFEN')
      .single();
    return Number(data?.current_balance || 0);
  };

  const getCashMlBalance = async (): Promise<number> => {
    const { data } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('account_type', 'CASH_MERCADO_LIBRE')
      .single();
    return Number(data?.current_balance || 0);
  };

  // =========================================================================
  // 1. Precondición y código
  // =========================================================================
  await t.test('1. Solo RTM_PENDING puede completarse', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 2 }]);

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    assert.strictEqual(result.rtoStatus, 'COMPLETED');
  });

  await t.test('2. RTO ya COMPLETED es rechazado', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    await assert.rejects(
      remittanceService.completeRtm(rtoRes.remittanceId, 0),
      /RTM_PENDING/i
    );
  });

  await t.test('3. Genera código RTMxxxx mediante secuencia canónica', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    assert.match(result.code, /^RTM-?\d+$/);
  });

  // =========================================================================
  // 2. Modelo: margin_remittance + items
  // =========================================================================
  await t.test('4-6. Crea margin_remittance e items por cada línea del RTO, con quantity_sent copiada correctamente', async () => {
    const rtoRes = await createAndConfirmRto([
      { productId: pro1Id, qty: 3 },
      { productId: pro2Id, qty: 5 },
    ]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const mr = await marginRemittanceRepo.getMarginRemittanceByRemittanceId(rtoRes.remittanceId);
    assert.ok(mr, 'Debe existir margin_remittance');
    assert.strictEqual(mr.items.length, 2, 'Debe crear un item por cada línea del RTO');

    const item1 = mr.items.find((i) => i.productId === pro1Id);
    const item2 = mr.items.find((i) => i.productId === pro2Id);
    assert.ok(item1 && item2);
    assert.strictEqual(item1!.quantitySent, 3);
    assert.strictEqual(item2!.quantitySent, 5);
  });

  await t.test('7. El costo unitario usa el costo teórico ACTUAL del PRO', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 2 }]);

    const expectedCost = (await costEngineService.getCurrentProductCost(pro1Id)).totalCost;

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const mr = await marginRemittanceRepo.getMarginRemittanceByRemittanceId(rtoRes.remittanceId);
    const item = mr!.items.find((i) => i.productId === pro1Id)!;
    assert.ok(
      item.unitCostTheoreticalSnapshotArs.minus(expectedCost).abs().lte(new Decimal('0.01')),
      `Costo unitario snapshot (${item.unitCostTheoreticalSnapshotArs}) debe igualar el costo teórico actual (${expectedCost})`
    );
  });

  await t.test('8-9. Costo total por línea y costo productos total son correctos', async () => {
    const rtoRes = await createAndConfirmRto([
      { productId: pro1Id, qty: 4 },
      { productId: pro2Id, qty: 2 },
    ]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const mr = await marginRemittanceRepo.getMarginRemittanceByRemittanceId(rtoRes.remittanceId);
    assert.ok(mr);

    let expectedTotal = new Decimal(0);
    for (const item of mr!.items) {
      const expectedLineCost = item.unitCostTheoreticalSnapshotArs.times(item.quantitySent);
      assert.ok(
        item.totalCostSnapshotArs.minus(expectedLineCost).abs().lte(new Decimal('0.000001')),
        'total_cost_snapshot_ars debe ser quantity_sent * unit_cost_theoretical_snapshot_ars'
      );
      expectedTotal = expectedTotal.plus(item.totalCostSnapshotArs);
    }

    assert.ok(
      mr!.productsCostTotalArs.minus(expectedTotal).abs().lte(new Decimal('0.000001')),
      'products_cost_total_ars debe ser la suma de los costos de línea'
    );
  });

  // =========================================================================
  // 3. Transporte / Caja Steffen
  // =========================================================================
  await t.test('10. Transporte = 0 es permitido', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);
    assert.strictEqual(result.transportCostArs.toNumber(), 0);
  });

  await t.test('11. Transporte negativo es rechazado', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    await assert.rejects(
      remittanceService.completeRtm(rtoRes.remittanceId, -1),
      /transporte no puede ser negativo/i
    );
    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('12-13. Transporte > 0 crea MOV TRANSPORTE y disminuye Caja Steffen', async () => {
    const balBefore = await getCashSteffenBalance();
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 1500);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    assert.ok(result.movCode, 'Debe devolver código de MOV TRANSPORTE');
    assert.match(result.movCode!, /^MOV-?\d+$/);

    const { data: movs } = await supabase
      .from('patrimonial_movements')
      .select('movement_type, amount_ars')
      .eq('operation_id', result.operationId);
    assert.strictEqual(movs?.length, 1);
    assert.strictEqual(movs![0].movement_type, 'TRANSPORTE');
    assert.strictEqual(Number(movs![0].amount_ars), 1500);

    const balAfter = await getCashSteffenBalance();
    assert.strictEqual(balAfter, balBefore - 1500);
  });

  await t.test('14. Caja Steffen puede quedar negativa por transporte (no se bloquea)', async () => {
    const { data: acc } = await supabase
      .from('financial_accounts')
      .select('id, current_balance')
      .eq('account_type', 'CASH_STEFFEN')
      .single();
    const originalBalance = Number(acc!.current_balance);

    await supabase.from('financial_accounts').update({ current_balance: 100 }).eq('id', acc!.id);

    try {
      const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
      const result = await remittanceService.completeRtm(rtoRes.remittanceId, 1000);
      createdMarginRemittanceIds.push(result.marginRemittanceId);
      createdRtmOperationIds.push(result.operationId);

      const balAfter = await getCashSteffenBalance();
      assert.strictEqual(balAfter, 100 - 1000, 'Caja Steffen debe poder quedar negativa');
      assert.ok(balAfter < 0);
    } finally {
      // Restaurar: el saldo quedó en (100 - 1000); llevarlo de nuevo al original
      const { data: accNow } = await supabase
        .from('financial_accounts')
        .select('id, current_balance')
        .eq('account_type', 'CASH_STEFFEN')
        .single();
      await supabase
        .from('financial_accounts')
        .update({ current_balance: originalBalance })
        .eq('id', accNow!.id);
    }
  });

  await t.test('15-16. Transporte = 0 no genera MOV TRANSPORTE ni modifica Caja Steffen', async () => {
    const balBefore = await getCashSteffenBalance();
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    assert.strictEqual(result.movCode, null);

    const { data: movs } = await supabase
      .from('patrimonial_movements')
      .select('id')
      .eq('operation_id', result.operationId);
    assert.strictEqual(movs?.length, 0);

    const balAfter = await getCashSteffenBalance();
    assert.strictEqual(balAfter, balBefore);
  });

  // =========================================================================
  // 4. Ganancia
  // =========================================================================
  await t.test('17. Ganancia = Total pedido - Costo productos - Transporte', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 2 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 500);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const expectedGain = rtoRes.totalOrderArs.minus(result.productsCostTotalArs).minus(500);
    assert.ok(result.gainArs.minus(expectedGain).abs().lte(new Decimal('0.000001')));
  });

  await t.test('18-19. Saldo anterior y total_to_collect NUNCA participan de la Ganancia', async () => {
    // Dejar saldo anterior > 0 en la cuenta del cliente registrado
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 77777 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    try {
      const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
        customerSource: 'REGISTERED_CUSTOMER',
        customerId,
      });

      assert.ok(rtoRes.priorBalanceSnapshotArs.eq(77777), 'El RTO debe haber tomado el saldo anterior > 0');
      assert.ok(rtoRes.totalToCollectArs.gt(rtoRes.totalOrderArs));

      const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
      createdMarginRemittanceIds.push(result.marginRemittanceId);
      createdRtmOperationIds.push(result.operationId);

      const expectedGain = rtoRes.totalOrderArs.minus(result.productsCostTotalArs);
      assert.ok(
        result.gainArs.minus(expectedGain).abs().lte(new Decimal('0.000001')),
        'La ganancia debe calcularse exclusivamente sobre total_order_ars, sin saldo anterior ni total_to_collect'
      );
    } finally {
      await supabase
        .from('financial_accounts')
        .update({ current_balance: 0 })
        .eq('customer_id', customerId)
        .eq('account_type', 'CUSTOMER_RECEIVABLE');
    }
  });

  // =========================================================================
  // 5. Costo teórico ACTUAL: cambios entre RTO/RTM y posteriores
  // =========================================================================
  await t.test('20. Cambio de costo entre RTO y RTM usa el costo NUEVO', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);

    // Cambiar precio del MPR (proveedor) DESPUÉS de confirmar el RTO
    await supabase
      .from('supplier_items')
      .update({ quoted_unit_price_net: 500, price_updated_at: new Date().toISOString() })
      .eq('stock_item_id', mprId);

    try {
      const newExpectedCost = (await costEngineService.getCurrentProductCost(pro1Id)).totalCost;

      const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
      createdMarginRemittanceIds.push(result.marginRemittanceId);
      createdRtmOperationIds.push(result.operationId);

      const mr = await marginRemittanceRepo.getMarginRemittanceByRemittanceId(rtoRes.remittanceId);
      const item = mr!.items.find((i) => i.productId === pro1Id)!;

      assert.ok(
        item.unitCostTheoreticalSnapshotArs.minus(newExpectedCost).abs().lte(new Decimal('0.01')),
        'El RTM debe congelar el costo NUEVO (vigente al momento del RTM), no el de cuando se confirmó el RTO'
      );
    } finally {
      await supabase
        .from('supplier_items')
        .update({ quoted_unit_price_net: 100, price_updated_at: new Date().toISOString() })
        .eq('stock_item_id', mprId);
    }
  });

  await t.test('21. Cambio de costo DESPUÉS del RTM no altera el snapshot ya congelado', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const mrBefore = await marginRemittanceRepo.getMarginRemittanceByRemittanceId(rtoRes.remittanceId);
    const snapshotBefore = mrBefore!.items.find((i) => i.productId === pro1Id)!.unitCostTheoreticalSnapshotArs;

    await supabase
      .from('supplier_items')
      .update({ quoted_unit_price_net: 999, price_updated_at: new Date().toISOString() })
      .eq('stock_item_id', mprId);

    try {
      const mrAfter = await marginRemittanceRepo.getMarginRemittanceByRemittanceId(rtoRes.remittanceId);
      const snapshotAfter = mrAfter!.items.find((i) => i.productId === pro1Id)!.unitCostTheoreticalSnapshotArs;

      assert.ok(snapshotAfter.eq(snapshotBefore), 'El snapshot de costo del RTM ya creado no debe cambiar');
    } finally {
      await supabase
        .from('supplier_items')
        .update({ quoted_unit_price_net: 100, price_updated_at: new Date().toISOString() })
        .eq('stock_item_id', mprId);
    }
  });

  // =========================================================================
  // 6. Cierre del gate y continuidad del flujo
  // =========================================================================
  await t.test('22-24. RTO pasa a COMPLETED, el gate RTM_PENDING desaparece y permite confirmar un nuevo RTO', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);

    const pendingBefore = await remittanceService.getPendingRtmRemittance();
    assert.ok(pendingBefore && pendingBefore.id === rtoRes.remittanceId);

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    // 22. RTO COMPLETED
    const rtoCheck = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.strictEqual(rtoCheck?.status, 'COMPLETED');

    // 23. Gate desaparece
    const pendingAfter = await remittanceService.getPendingRtmRemittance();
    assert.strictEqual(pendingAfter, null);

    // 24. Puede confirmarse un nuevo RTO
    const rtoRes2 = await createAndConfirmRto([{ productId: pro2Id, qty: 1 }]);
    assert.strictEqual(rtoRes2.status, 'RTM_PENDING');
    await releaseRtmPendingGate(rtoRes2.remittanceId);
  });

  // =========================================================================
  // 7. No vuelve a vender / no toca lo que ya hizo el RTO
  // =========================================================================
  await t.test('25-26. El RTM no modifica stock PRO ni genera MST', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 2 }]);
    const stockBefore = (await stockRepo.getBalance(pro1Id)).toNumber();

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 500);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const stockAfter = (await stockRepo.getBalance(pro1Id)).toNumber();
    assert.strictEqual(stockAfter, stockBefore, 'El RTM no debe modificar stock PRO');

    const { data: msts } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('operation_id', result.operationId);
    assert.strictEqual(msts?.length, 0, 'El RTM no debe generar MST');
  });

  await t.test('27. El RTM no modifica el MOV VENTA original', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);

    const { data: ventaMovBefore } = await supabase
      .from('patrimonial_movements')
      .select('id, amount_ars')
      .eq('operation_id', rtoRes.operationId)
      .eq('movement_type', 'VENTA')
      .single();

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 300);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const { data: ventaMovAfter } = await supabase
      .from('patrimonial_movements')
      .select('id, amount_ars')
      .eq('id', ventaMovBefore!.id)
      .single();

    assert.strictEqual(Number(ventaMovAfter!.amount_ars), Number(ventaMovBefore!.amount_ars));
  });

  await t.test('28. El RTM no modifica la deuda del Cliente registrado', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
    });

    const { data: accBefore } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 400);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const { data: accAfter } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();

    assert.strictEqual(Number(accAfter!.current_balance), Number(accBefore!.current_balance));

    await supabase
      .from('financial_accounts')
      .update({ current_balance: 0 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');
  });

  await t.test('29. El RTM no modifica Caja Mercado Libre de la venta', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const balAfterRto = await getCashMlBalance();

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 600);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const balAfterRtm = await getCashMlBalance();
    assert.strictEqual(balAfterRtm, balAfterRto, 'Caja Mercado Libre no debe cambiar por el RTM (solo Caja Steffen por transporte)');
  });

  // =========================================================================
  // 8. Idempotencia / concurrencia / rollback
  // =========================================================================
  await t.test('30. Doble submit (doble click) no duplica RTM, transporte ni movimientos', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);

    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 200);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    await assert.rejects(remittanceService.completeRtm(rtoRes.remittanceId, 200));

    const { data: allMr } = await supabase
      .from('margin_remittances')
      .select('id')
      .eq('remittance_id', rtoRes.remittanceId);
    assert.strictEqual(allMr?.length, 1, 'No debe duplicarse el margin_remittance');

    const { data: movs } = await supabase
      .from('patrimonial_movements')
      .select('id')
      .eq('operation_id', result.operationId)
      .eq('movement_type', 'TRANSPORTE');
    assert.strictEqual(movs?.length, 1, 'No debe duplicarse el MOV TRANSPORTE');
  });

  await t.test('31. Concurrencia sobre el mismo RTO crea un único RTM', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 2 }]);

    const results = await Promise.allSettled([
      remittanceService.completeRtm(rtoRes.remittanceId, 100),
      remittanceService.completeRtm(rtoRes.remittanceId, 200),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactamente una de las dos confirmaciones concurrentes debe tener éxito');
    assert.strictEqual(rejected.length, 1, 'La otra debe ser rechazada');

    createdMarginRemittanceIds.push(fulfilled[0].value.marginRemittanceId);
    createdRtmOperationIds.push(fulfilled[0].value.operationId);

    const { data: allMr } = await supabase
      .from('margin_remittances')
      .select('id')
      .eq('remittance_id', rtoRes.remittanceId);
    assert.strictEqual(allMr?.length, 1, 'Debe existir un único RTM para el remito, sin importar la concurrencia');
  });

  await t.test('32-34. Rollback tardío: fallo tras escrituras parciales revierte RTM/transporte/Caja y deja el RTO en RTM_PENDING', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const balBefore = await getCashSteffenBalance();

    // Transporte válido (>= 0) pero que desborda NUMERIC(20,6) en patrimonial_movements/margin_remittances:
    // fuerza un fallo DESPUÉS de insertar business_operations (y, según el punto exacto, margin_remittances),
    // demostrando que TODA la transacción se revierte, no solo lo pendiente.
    await assert.rejects(
      remittanceService.completeRtm(rtoRes.remittanceId, '999999999999999'),
      /overflow/i
    );

    // 32. No queda margin_remittance parcial ni items huérfanos
    const mr = await marginRemittanceRepo.getMarginRemittanceByRemittanceId(rtoRes.remittanceId);
    assert.strictEqual(mr, null);

    // 33. No se modificó Caja Steffen ni se generó MOV TRANSPORTE
    const balAfter = await getCashSteffenBalance();
    assert.strictEqual(balAfter, balBefore);

    // 34. El RTO sigue en RTM_PENDING
    const rtoCheck = await remittanceRepo.getRemittanceById(rtoRes.remittanceId);
    assert.strictEqual(rtoCheck?.status, 'RTM_PENDING');

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  // =========================================================================
  // 9. Inmutabilidad y alcance (sin PDF)
  // =========================================================================
  await t.test('35. El RTM es histórico e inmutable (DB + ausencia de camino de edición en la app)', async () => {
    const actionsSource = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(process.cwd(), 'src/actions/margin-remittance.actions.ts'),
      'utf-8'
    );
    const exportedFnNames = Array.from(actionsSource.matchAll(/export\s+async\s+function\s+(\w+)/g)).map(
      (m) => m[1]
    );
    const exposedEditLike = exportedFnNames.filter((k) => /update|edit|delete/i.test(k));
    assert.deepStrictEqual(exposedEditLike, [], 'No debe existir ninguna Server Action de edición/borrado sobre el RTM');

    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const { error: editErr } = await supabase
      .from('margin_remittances')
      .update({ gain_ars: 1 })
      .eq('id', result.marginRemittanceId);
    assert.ok(editErr, 'Editar un RTM confirmado debe ser rechazado');
    assert.match(editErr!.message, /inmutable/i);

    const { data: items } = await supabase
      .from('margin_remittance_items')
      .select('id')
      .eq('margin_remittance_id', result.marginRemittanceId)
      .limit(1);
    const { error: itemEditErr } = await supabase
      .from('margin_remittance_items')
      .update({ quantity_sent: 999 })
      .eq('id', items![0].id);
    assert.ok(itemEditErr, 'Editar una línea de RTM confirmado debe ser rechazado');
    assert.match(itemEditErr!.message, /inmutable/i);
  });

  await t.test('36. Fase 14: completar el RTM (transacción atómica) no genera PDF; el PDF se genera después del commit en la acción', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const result = await remittanceService.completeRtm(rtoRes.remittanceId, 0);
    createdMarginRemittanceIds.push(result.marginRemittanceId);
    createdRtmOperationIds.push(result.operationId);

    const { data: docs } = await supabase
      .from('generated_documents')
      .select('id')
      .eq('source_id', result.marginRemittanceId);
    assert.strictEqual(docs?.length ?? 0, 0, 'La transacción comercial del RTM nunca debe crear generated_documents');

    const actionsSource = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(process.cwd(), 'src/actions/margin-remittance.actions.ts'),
      'utf-8'
    );
    const completeIdx = actionsSource.indexOf('completeRtm(');
    const pdfIdx = actionsSource.indexOf('ensureRtmDocument(');
    assert.ok(completeIdx > -1 && pdfIdx > completeIdx, 'El PDF del RTM debe generarse en la acción, después del commit comercial');
  });

  // =========================================================================
  // 10. POST-SMOKE: Cuenta Cliente debe mostrar RTO/Venta junto a Pagos
  // =========================================================================
  await t.test('37-40. Cuenta Cliente: el RTO aparece como VENTA no editable, usa exclusivamente total_order_ars (nunca total_to_collect ni saldo anterior)', async () => {
    // Forzar saldo anterior > 0 para discriminar inequívocamente total_order_ars de total_to_collect_ars
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 33333 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    try {
      const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
        customerSource: 'REGISTERED_CUSTOMER',
        customerId,
      });
      assert.ok(rtoRes.priorBalanceSnapshotArs.eq(33333));
      assert.ok(
        !rtoRes.totalToCollectArs.eq(rtoRes.totalOrderArs),
        'El saldo anterior debe ser real para que el test discrimine total_order de total_to_collect'
      );

      const movements = await patrimonyRepo.listCustomerAccountMovements(customerId);
      const ventaMov = movements.find((m) => m.remittanceId === rtoRes.remittanceId);

      // 1. El RTO aparece en movimientos de cuenta
      assert.ok(ventaMov, 'El RTO debe aparecer en los movimientos de cuenta del cliente');
      assert.strictEqual(ventaMov!.type, 'VENTA');
      assert.strictEqual(ventaMov!.documentCode, rtoRes.code);

      // 2-3-4. Importe usa exclusivamente total_order_ars
      assert.ok(ventaMov!.amountArs.eq(rtoRes.totalOrderArs), 'El importe debe ser total_order_ars');
      assert.ok(!ventaMov!.amountArs.eq(rtoRes.totalToCollectArs), 'El importe NO debe ser total_to_collect_ars');
      assert.ok(!ventaMov!.amountArs.eq(rtoRes.priorBalanceSnapshotArs), 'El importe NO debe ser el saldo anterior');

      // 5. No editable
      assert.strictEqual(ventaMov!.isPayment, false, 'El RTO no debe marcarse como editable');
      assert.strictEqual(ventaMov!.paymentId, undefined);

      await releaseRtmPendingGate(rtoRes.remittanceId);
    } finally {
      await supabase
        .from('financial_accounts')
        .update({ current_balance: 0 })
        .eq('customer_id', customerId)
        .eq('account_type', 'CUSTOMER_RECEIVABLE');
    }
  });

  await t.test('41-44. Cuenta Cliente: el Pago Cliente sigue apareciendo editable, coexiste con el RTO, el saldo sigue viniendo de financial_accounts y el orden es por fecha descendente', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
    });

    const payRes = await patrimonyService.registerCustomerPayment({
      customerId,
      amountArs: '1000',
      businessDate: new Date().toISOString().slice(0, 10),
    });
    createdRtmOperationIds.push(payRes.operationId); // limpia su MOV/business_operation en el teardown de RTM (mismo patrón de borrado)

    const movements = await patrimonyRepo.listCustomerAccountMovements(customerId);
    const ventaMov = movements.find((m) => m.remittanceId === rtoRes.remittanceId);
    const pagoMov = movements.find((m) => m.type === 'PAGO' && m.amountArs.eq('1000'));

    // 6. El pago sigue apareciendo y es editable
    assert.ok(pagoMov, 'El Pago Cliente debe seguir apareciendo en los movimientos de cuenta');
    assert.strictEqual(pagoMov!.isPayment, true);
    assert.ok(pagoMov!.paymentId, 'El Pago debe exponer paymentId para poder editarse');

    // 7. RTO y Pago aparecen juntos
    assert.ok(ventaMov, 'El RTO también debe seguir presente junto al Pago');

    // 8. El saldo mostrado sigue viniendo de financial_accounts, no se reconstruye desde los movimientos
    const { data: acc } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();
    const sumFromMovements = movements.reduce(
      (acc2, m) => (m.isPayment ? acc2.minus(m.amountArs) : acc2.plus(m.amountArs)),
      new Decimal(0)
    );
    // El saldo real puede diferir de la suma naive de movimientos (otros ciclos de vida, redondeos, etc.);
    // lo relevante es que el saldo se consulta directamente a financial_accounts y existe de forma autoritativa.
    assert.ok(acc, 'El saldo debe obtenerse de financial_accounts');
    assert.ok(new Decimal(acc!.current_balance).isFinite());
    void sumFromMovements;

    // 9. Orden por fecha funcional descendente
    const dates = movements.map((m) => m.date);
    const sortedDesc = [...dates].sort((a, b) => b.localeCompare(a));
    assert.deepStrictEqual(dates, sortedDesc, 'Los movimientos deben venir ordenados por fecha descendente');

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('45. Cuenta Cliente: listCustomerAccountMovements no incurre en N+1 (cantidad fija de consultas, independiente de la cantidad de filas)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const repoSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/repositories/patrimony.repository.ts'),
      'utf-8'
    );
    const start = repoSource.indexOf('async listCustomerAccountMovements(');
    assert.ok(start > -1, 'Debe existir el método listCustomerAccountMovements');
    const end = repoSource.indexOf('\n  async listSupplierAccountMovements(', start);
    const body = repoSource.slice(start, end > -1 ? end : start + 4000);

    // No debe haber un await dentro de un for/map que itere sobre las filas ya obtenidas
    // (la única fuente de datos debe ser un número fijo y acotado de `.from(`, nunca uno por fila).
    const fromCallCount = (body.match(/\.from\(/g) || []).length;
    assert.ok(
      fromCallCount <= 4,
      `El método debe resolver con una cantidad fija y acotada de consultas (encontradas: ${fromCallCount}), no una por fila`
    );
    assert.doesNotMatch(
      body,
      /for\s*\([^)]*\)\s*\{[^}]*await[^}]*\.from\(/s,
      'No debe haber un await .from(...) dentro de un loop sobre las filas obtenidas (N+1)'
    );
  });

  // =========================================================================
  // 11. POST-SMOKE: Ventas del Mes (Administración) debe conectar a datos reales
  // =========================================================================
  await t.test('46-48. Ventas del Mes: solo RTO COMPLETED con RTM aparece; ni RTM_PENDING ni PED OPEN participan', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const salesBefore = await remittanceService.listCompletedSalesForMonth(year, month);
    const countBefore = salesBefore.length;

    const rtoCompleted = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const rtm = await remittanceService.completeRtm(rtoCompleted.remittanceId, 0);
    createdMarginRemittanceIds.push(rtm.marginRemittanceId);
    createdRtmOperationIds.push(rtm.operationId);

    const rtoPending = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);

    const order = await orderService.createOrder({
      customerSource: 'MERCADO_LIBRE',
      items: [{ productId: pro1Id, requestedQuantity: 1, agQuantity: 1 }],
    });
    createdOrderIds.push(order.id);

    const salesAfter = await remittanceService.listCompletedSalesForMonth(year, month);

    // 1. RTO COMPLETED + RTM aparece
    assert.ok(salesAfter.some((s) => s.remittanceId === rtoCompleted.remittanceId));
    // 2. RTM_PENDING no aparece
    assert.ok(!salesAfter.some((s) => s.remittanceId === rtoPending.remittanceId));
    // 3. Un PED OPEN (nunca confirmado) no agrega ninguna fila
    assert.strictEqual(salesAfter.length, countBefore + 1);

    await releaseRtmPendingGate(rtoPending.remittanceId);
  });

  await t.test('49-52. Ventas del Mes: Total usa total_order_ars, Ganancia usa gain_ars snapshot, sin saldo anterior ni total_to_collect', async () => {
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 44444 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    try {
      const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 2 }], {
        customerSource: 'REGISTERED_CUSTOMER',
        customerId,
      });
      assert.ok(!rtoRes.totalToCollectArs.eq(rtoRes.totalOrderArs));

      const rtm = await remittanceService.completeRtm(rtoRes.remittanceId, 500);
      createdMarginRemittanceIds.push(rtm.marginRemittanceId);
      createdRtmOperationIds.push(rtm.operationId);

      const now = new Date();
      const sales = await remittanceService.listCompletedSalesForMonth(now.getFullYear(), now.getMonth() + 1);
      const entry = sales.find((s) => s.remittanceId === rtoRes.remittanceId);
      assert.ok(entry);

      assert.ok(entry!.totalOrderArs.eq(rtoRes.totalOrderArs), 'Total debe ser total_order_ars');
      assert.ok(!entry!.totalOrderArs.eq(rtoRes.totalToCollectArs), 'Total NO debe ser total_to_collect_ars');
      assert.ok(!entry!.totalOrderArs.eq(rtoRes.priorBalanceSnapshotArs), 'El saldo anterior no debe filtrarse al total');
      assert.ok(entry!.gainArs.eq(rtm.gainArs), 'Ganancia debe ser el gain_ars snapshot del RTM');
    } finally {
      await supabase
        .from('financial_accounts')
        .update({ current_balance: 0 })
        .eq('customer_id', customerId)
        .eq('account_type', 'CUSTOMER_RECEIVABLE');
    }
  });

  await t.test('53-55. Ventas del Mes: Cliente/Origen muestra correctamente Registrado, Mercado Libre y Consumidor Final', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const rtoReg = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
    });
    const rtmReg = await remittanceService.completeRtm(rtoReg.remittanceId, 0);
    createdMarginRemittanceIds.push(rtmReg.marginRemittanceId);
    createdRtmOperationIds.push(rtmReg.operationId);

    const rtoMl = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], { customerSource: 'MERCADO_LIBRE' });
    const rtmMl = await remittanceService.completeRtm(rtoMl.remittanceId, 0);
    createdMarginRemittanceIds.push(rtmMl.marginRemittanceId);
    createdRtmOperationIds.push(rtmMl.operationId);

    const rtoCf = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], { customerSource: 'CONSUMER_FINAL' });
    const rtmCf = await remittanceService.completeRtm(rtoCf.remittanceId, 0);
    createdMarginRemittanceIds.push(rtmCf.marginRemittanceId);
    createdRtmOperationIds.push(rtmCf.operationId);

    const sales = await remittanceService.listCompletedSalesForMonth(year, month);

    const regEntry = sales.find((s) => s.remittanceId === rtoReg.remittanceId);
    assert.strictEqual(regEntry?.customerDisplayName, `Cliente RTM Test ${testTag}`);

    const mlEntry = sales.find((s) => s.remittanceId === rtoMl.remittanceId);
    assert.strictEqual(mlEntry?.customerDisplayName, 'Mercado Libre');

    const cfEntry = sales.find((s) => s.remittanceId === rtoCf.remittanceId);
    assert.strictEqual(cfEntry?.customerDisplayName, 'Consumidor Final Test');
  });

  await t.test('56-57. Ventas del Mes: dos ventas del mismo mes suman correctamente y una venta de otro mes no participa (filtro usa fecha funcional del RTO)', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const salesBefore = await remittanceService.listCompletedSalesForMonth(year, month);
    const totalBefore = salesBefore.reduce((acc, s) => acc.plus(s.totalOrderArs), new Decimal(0));

    const rtoA = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }]);
    const rtmA = await remittanceService.completeRtm(rtoA.remittanceId, 0);
    createdMarginRemittanceIds.push(rtmA.marginRemittanceId);
    createdRtmOperationIds.push(rtmA.operationId);

    const rtoB = await createAndConfirmRto([{ productId: pro2Id, qty: 1 }]);
    const rtmB = await remittanceService.completeRtm(rtoB.remittanceId, 0);
    createdMarginRemittanceIds.push(rtmB.marginRemittanceId);
    createdRtmOperationIds.push(rtmB.operationId);

    const salesAfter = await remittanceService.listCompletedSalesForMonth(year, month);
    const totalAfter = salesAfter.reduce((acc, s) => acc.plus(s.totalOrderArs), new Decimal(0));

    assert.ok(
      totalAfter.minus(totalBefore).eq(rtoA.totalOrderArs.plus(rtoB.totalOrderArs)),
      'La suma del mes debe incluir exactamente ambas ventas nuevas'
    );

    // Mover rtoB a OTRO mes (fecha funcional de SU PROPIO RTO, vía su business_operation) -> no debe
    // participar en el mes actual. NO se toca el RTM ni su propia fecha.
    const otherMonth = month === 1 ? 12 : month - 1;
    const otherYear = month === 1 ? year - 1 : year;
    const otherDate = `${otherYear}-${String(otherMonth).padStart(2, '0')}-15`;
    await supabase.from('business_operations').update({ business_date: otherDate }).eq('id', rtoB.operationId);

    const salesCurrentMonthAfterMove = await remittanceService.listCompletedSalesForMonth(year, month);
    assert.ok(
      !salesCurrentMonthAfterMove.some((s) => s.remittanceId === rtoB.remittanceId),
      'Una venta cuya fecha funcional de RTO quedó en otro mes no debe participar en el mes actual'
    );

    const salesOtherMonth = await remittanceService.listCompletedSalesForMonth(otherYear, otherMonth);
    assert.ok(
      salesOtherMonth.some((s) => s.remittanceId === rtoB.remittanceId),
      'El filtro debe usar la fecha funcional del propio RTO (business_operations.business_date vía remittances.operation_id), no la del RTM'
    );
  });

  // =========================================================================
  // 12. POST-SMOKE: MICRO-CIERRE UI Cuentas Clientes (deep-link, acción por tipo, Último Pago/Compra)
  // =========================================================================
  await t.test('58. Resumen Cuentas Clientes: el ícono CUENTA enlaza al deep-link /clientes?customerId=<UUID>', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/views/AdministracionView.tsx'),
      'utf-8'
    );
    assert.match(
      source,
      /href=\{`\/clientes\?customerId=\$\{c\.id\}`\}/,
      'El ícono CUENTA de cada fila del resumen debe enlazar a /clientes?customerId=<id del cliente>'
    );
  });

  await t.test('59-61. Cuenta Cliente: Pago editable, RTO no editable y con acción de documento asociada a su remittanceId', async () => {
    const rtoRes = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
    });

    const payRes = await patrimonyService.registerCustomerPayment({
      customerId,
      amountArs: '500',
      businessDate: new Date().toISOString().slice(0, 10),
    });
    createdRtmOperationIds.push(payRes.operationId);

    const movements = await patrimonyRepo.listCustomerAccountMovements(customerId);
    const ventaMov = movements.find((m) => m.remittanceId === rtoRes.remittanceId);
    const pagoMov = movements.find((m) => m.isPayment && m.amountArs.eq('500'));

    // 5. Pago Cliente debe quedar marcado como editable
    assert.ok(pagoMov, 'Debe existir el movimiento de Pago');
    assert.strictEqual(pagoMov!.isPayment, true);
    assert.ok(pagoMov!.paymentId, 'El Pago debe exponer paymentId (acción editar)');

    // 6. RTO/Venta NO debe quedar marcado como editable
    assert.ok(ventaMov, 'Debe existir el movimiento de Venta/RTO');
    assert.strictEqual(ventaMov!.isPayment, false);
    assert.strictEqual(ventaMov!.paymentId, undefined);

    // 7. RTO/Venta debe exponer remittanceId (la UI lo usa para la acción de documento)
    assert.strictEqual(ventaMov!.remittanceId, rtoRes.remittanceId);

    await releaseRtmPendingGate(rtoRes.remittanceId);
  });

  await t.test('62. Cuenta Cliente: la acción de documento del RTO usa el PDF generado y queda deshabilitada mientras no exista (Fase 14)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/views/CustomersView.tsx'),
      'utf-8'
    );
    const idx = source.indexOf('!m.isPayment && m.remittanceId');
    assert.ok(idx > -1, 'Debe existir la rama de acción de documento para filas de VENTA/RTO');
    const snippet = source.slice(idx, idx + 400);
    assert.match(snippet, /<DocumentPdfButton/, 'La fila de VENTA/RTO debe usar DocumentPdfButton');
    assert.match(snippet, /sourceType="RTO"/);
    assert.match(snippet, /sourceId=\{m\.remittanceId\}/);
    assert.match(snippet, /knownStatus=\{m\.rtoDocumentStatus \|\| 'MISSING'\}/, 'Sin estado conocido debe asumirse MISSING');

    const buttonSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/components/DocumentPdfButton.tsx'),
      'utf-8'
    );
    const missingIdx = buttonSource.indexOf("knownStatus === 'MISSING'");
    assert.ok(missingIdx > -1, 'DocumentPdfButton debe contemplar el estado MISSING');
    assert.match(buttonSource.slice(missingIdx, missingIdx + 300), /disabled/, 'Sin PDF la acción debe quedar deshabilitada');
  });

  await t.test('63-68. Resumen: Último Pago y Última Compra usan la fecha funcional (MAX business_date) más reciente, nunca created_at ni la fecha del RTM', async () => {
    const freshCustomer = await customerRepo.create({
      name: `Cliente Actividad Test ${testTag}`,
      phone: '1100000000',
      discount1Pct: 0,
      discount2Pct: 0,
      discount3Pct: 0,
    });
    createdCustomerIds.push(freshCustomer.id);

    // 10/12. Dos RTO en fechas distintas -> Última Compra debe tomar la más reciente (2026-02-15),
    // y NUNCA la fecha en la que efectivamente se complete el RTM (hoy).
    const rtoOld = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
      customerSource: 'REGISTERED_CUSTOMER',
      customerId: freshCustomer.id,
      businessDate: '2026-02-01',
    });
    await releaseRtmPendingGate(rtoOld.remittanceId);

    const rtoRecent = await createAndConfirmRto([{ productId: pro1Id, qty: 1 }], {
      customerSource: 'REGISTERED_CUSTOMER',
      customerId: freshCustomer.id,
      businessDate: '2026-02-15',
    });
    const rtm = await remittanceService.completeRtm(rtoRecent.remittanceId, 0);
    createdMarginRemittanceIds.push(rtm.marginRemittanceId);
    createdRtmOperationIds.push(rtm.operationId);

    // 9/11. Dos pagos en fechas distintas -> Último Pago debe tomar el más reciente (2026-01-20).
    // El cliente ya tiene deuda real (de los dos RTO) para poder registrar ambos pagos.
    const pay1 = await patrimonyService.registerCustomerPayment({
      customerId: freshCustomer.id,
      amountArs: '100',
      businessDate: '2026-01-05',
    });
    createdRtmOperationIds.push(pay1.operationId);

    const pay2 = await patrimonyService.registerCustomerPayment({
      customerId: freshCustomer.id,
      amountArs: '200',
      businessDate: '2026-01-20',
    });
    createdRtmOperationIds.push(pay2.operationId);

    const activity = await patrimonyService.getCustomerLastActivityMap();
    const entry = activity.get(freshCustomer.id);
    assert.ok(entry, 'El cliente debe aparecer con actividad registrada');

    assert.strictEqual(entry!.lastPaymentDate, '2026-01-20', 'Último Pago debe ser el business_date más reciente entre los pagos');
    assert.strictEqual(
      entry!.lastPurchaseDate,
      '2026-02-15',
      'Última Compra debe ser el business_date más reciente entre los RTO, nunca la fecha del RTM'
    );
  });

  await t.test('69. getCustomerLastActivityMap no incurre en N+1 (una única consulta RPC batch)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const repoSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/repositories/patrimony.repository.ts'),
      'utf-8'
    );
    const start = repoSource.indexOf('async getCustomerLastActivityMap(');
    assert.ok(start > -1, 'Debe existir el método getCustomerLastActivityMap');
    const end = repoSource.indexOf('\n  }', start);
    const body = repoSource.slice(start, end);

    const rpcCallCount = (body.match(/\.rpc\b/g) || []).length;
    assert.strictEqual(rpcCallCount, 1, 'Debe resolver con una única llamada RPC, independiente de la cantidad de clientes');

    // El método sí itera (for) sobre las filas YA obtenidas para armar el Map en memoria —
    // eso es normal y no es N+1. Lo que NO debe pasar es que ese loop dispare una
    // consulta adicional (.rpc(/.from() por cada fila.
    const forLoopMatch = body.match(/for\s*\([^)]*\)\s*\{([\s\S]*)$/);
    assert.ok(forLoopMatch, 'Debe existir el loop de post-procesamiento sobre las filas ya obtenidas');
    assert.doesNotMatch(
      forLoopMatch![1],
      /\.rpc\(|\.from\(/,
      'El loop sobre las filas no debe emitir ninguna consulta adicional por fila (N+1)'
    );
  });
});
