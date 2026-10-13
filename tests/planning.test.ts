import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { Decimal } from '../src/domain/decimal';
import type { Database } from '../src/database/types';
import { PlanningDomainService } from '../src/services/planning.service';
import { PlanningRepository } from '../src/repositories/planning.repository';
import { OrderRepository } from '../src/repositories/order.repository';
import { OrderDomainService } from '../src/services/order.service';
import { PriceListRepository } from '../src/repositories/price-list.repository';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('FASE 11 — PLANIFICACIÓN: Pruebas integrales de simulación, cobertura, recursos compartidos y prioridades', async (t) => {
  const planningRepo = new PlanningRepository(supabase);
  const planningService = new PlanningDomainService(planningRepo);
  const orderRepo = new OrderRepository(supabase);
  const orderService = new OrderDomainService(orderRepo);
  const priceListRepo = new PriceListRepository(supabase);

  const testTag = `P11_${Date.now()}`;
  let baseProduct1Id: string;
  let proAId: string;
  let proBId: string;
  let com1Id: string;
  let com2Id: string;
  let publicListId: string;

  const createdOrderIds: string[] = [];
  const createdStockItemIds: string[] = [];
  const createdBaseProductIds: string[] = [];
  const createdBulkLotIds: string[] = [];
  const createdOpIds: string[] = [];
  let formulaVersionId: string | undefined;
  let o1Id: string;

  t.before(async () => {
    // 1. Obtener lista público para pedidos de prueba
    const pubList = await priceListRepo.getPriceListBySystemRole('PUBLIC_DEFAULT');
    assert.ok(pubList, 'Debe existir PUBLIC_DEFAULT');
    publicListId = pubList.id;

    // 2. Crear Base Product PBA1
    const { data: bp, error: bpErr } = await supabase
      .from('base_products')
      .insert({
        code: `PBA_${testTag}`,
        name: `Base Planificacion ${testTag}`,
        active: true,
      })
      .select()
      .single();
    assert.ok(bp && !bpErr, `Error creando base_product: ${bpErr?.message}`);
    baseProduct1Id = bp.id;
    createdBaseProductIds.push(baseProduct1Id);

    // 3. Crear Componente COM1
    const { data: siCom1 } = await supabase
      .from('stock_items')
      .insert({
        code: `COM1_${testTag}`,
        name: `Componente Pote ${testTag}`,
        item_type: 'COM',
        unit_type: 'UNIT',
        stock_minimum: 10,
        active: true,
      })
      .select()
      .single();
    com1Id = siCom1!.id;
    createdStockItemIds.push(com1Id);
    await supabase.from('components').insert({ stock_item_id: com1Id });
    await supabase.from('stock_balances').insert({ stock_item_id: com1Id, quantity: 100 });

    // 4. Crear Componente COM2
    const { data: siCom2 } = await supabase
      .from('stock_items')
      .insert({
        code: `COM2_${testTag}`,
        name: `Componente Tapa ${testTag}`,
        item_type: 'COM',
        unit_type: 'UNIT',
        stock_minimum: 10,
        active: true,
      })
      .select()
      .single();
    com2Id = siCom2!.id;
    createdStockItemIds.push(com2Id);
    await supabase.from('components').insert({ stock_item_id: com2Id });
    await supabase.from('stock_balances').insert({ stock_item_id: com2Id, quantity: 80 });

    // 5. Crear Producto PRO A (0.250 kg) que usa PBA1, COM1 x1, COM2 x1
    const { data: siProA } = await supabase
      .from('stock_items')
      .insert({
        code: `PROA_${testTag}`,
        name: `Producto A 250g ${testTag}`,
        item_type: 'PRO',
        unit_type: 'UNIT',
        stock_minimum: 5,
        active: true,
      })
      .select()
      .single();
    proAId = siProA!.id;
    createdStockItemIds.push(proAId);
    await supabase.from('products').insert({
      stock_item_id: proAId,
      base_product_id: baseProduct1Id,
      weight_kg: 0.25,
      presentation: '250g',
    });
    // Stock PRO A inicial = 20
    await supabase.from('stock_balances').insert({ stock_item_id: proAId, quantity: 20 });
    await priceListRepo.setProductPrice(publicListId, proAId, 10000);

    // BOM PRO A: 1 COM1, 1 COM2
    await supabase.from('product_components').insert([
      { product_id: proAId, component_id: com1Id, quantity_per_unit: 1, sort_order: 1 },
      { product_id: proAId, component_id: com2Id, quantity_per_unit: 1, sort_order: 2 },
    ]);

    // 6. Crear Producto PRO B (0.500 kg) que comparte PBA1 y usa COM1 x1
    const { data: siProB } = await supabase
      .from('stock_items')
      .insert({
        code: `PROB_${testTag}`,
        name: `Producto B 500g ${testTag}`,
        item_type: 'PRO',
        unit_type: 'UNIT',
        stock_minimum: 5,
        active: true,
      })
      .select()
      .single();
    proBId = siProB!.id;
    createdStockItemIds.push(proBId);
    await supabase.from('products').insert({
      stock_item_id: proBId,
      base_product_id: baseProduct1Id,
      weight_kg: 0.5,
      presentation: '500g',
    });
    // Stock PRO B inicial = 10
    await supabase.from('stock_balances').insert({ stock_item_id: proBId, quantity: 10 });
    await priceListRepo.setProductPrice(publicListId, proBId, 20000);

    // BOM PRO B: 1 COM1
    await supabase.from('product_components').insert([
      { product_id: proBId, component_id: com1Id, quantity_per_unit: 1, sort_order: 1 },
    ]);

    // 7. Crear formula_version y helper para los lotes de granel:
    const { data: fv } = await supabase
      .from('formula_versions')
      .insert({
        base_product_id: baseProduct1Id,
        version_number: 1,
        is_current: true,
      })
      .select('id')
      .single();
    formulaVersionId = fv!.id;

    async function createBulkLot(code: string, kg: number, status: 'OPEN' | 'CLOSED') {
      const { data: op } = await supabase
        .from('business_operations')
        .insert({
          operation_type: 'BULK_PRODUCTION',
          business_date: new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single();
      createdOpIds.push(op!.id);

      const { data: lot, error: lotErr } = await supabase
        .from('bulk_lots')
        .insert({
          code,
          operation_id: op!.id,
          formula_version_id: formulaVersionId!,
          base_product_id: baseProduct1Id,
          kg_fabricated: kg,
          kg_available: kg,
          status,
        })
        .select()
        .single();
      if (lotErr || !lot) {
        throw new Error(`Error creating bulk lot ${code}: ${lotErr?.message}`);
      }
      createdBulkLotIds.push(lot.id);
      return lot;
    }

    // GRA OPEN 1: 15.000 kg
    await createBulkLot(`GRA1_${testTag}`, 15, 'OPEN');
    // GRA OPEN 2: 10.000 kg (agregación de lotes)
    await createBulkLot(`GRA2_${testTag}`, 10, 'OPEN');
    // GRA CLOSED: 50.000 kg (debe ignorarse por completo)
    await createBulkLot(`GRA_C_${testTag}`, 50, 'CLOSED');
  });

  t.after(async () => {
    // Limpieza
    for (const oid of createdOrderIds) {
      await supabase.from('orders').delete().eq('id', oid);
    }
    for (const bid of createdBulkLotIds) {
      await supabase.from('bulk_lots').delete().eq('id', bid);
    }
    if (formulaVersionId) {
      await supabase.from('formula_versions').delete().eq('id', formulaVersionId);
    }
    for (const opId of createdOpIds) {
      await supabase.from('business_operations').delete().eq('id', opId);
    }
    await supabase.from('planning_product_priorities').delete().in('product_id', [proAId, proBId]);
    await supabase.from('product_components').delete().in('product_id', [proAId, proBId]);
    await supabase.from('products').delete().in('stock_item_id', [proAId, proBId]);
    await supabase.from('components').delete().in('stock_item_id', [com1Id, com2Id]);
    await supabase.from('stock_balances').delete().in('stock_item_id', [proAId, proBId, com1Id, com2Id]);
    await supabase.from('stock_items').delete().in('id', [proAId, proBId, com1Id, com2Id]);
    await supabase.from('base_products').delete().eq('id', baseProduct1Id);
  });

  // 1-4. Solo pedidos OPEN y productos presentes
  await t.test('1-4. Solo pedidos OPEN y PRO presentes participan en la matriz de planificación', async () => {
    // Crear PED 1 (OPEN) con PRO A: 10 un
    const o1 = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Cliente Abierto',
      items: [{ productId: proAId, requestedQuantity: 10 }],
    });
    o1Id = o1.id;
    createdOrderIds.push(o1.id);

    // Crear PED 2 (OPEN) y luego CANCELARLO
    const o2 = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Cliente Cancelado',
      items: [{ productId: proAId, requestedQuantity: 5 }],
    });
    createdOrderIds.push(o2.id);
    await orderService.cancelOrder(o2.id);

    const matrix = await planningService.getPlanningMatrix();
    assert.ok(matrix.openOrders.some((o) => o.orderId === o1.id), 'PED OPEN debe participar');
    assert.ok(!matrix.openOrders.some((o) => o.orderId === o2.id), 'PED CANCELLED no debe participar');

    // PRO B no está en ningún PED OPEN, no debe aparecer en filas
    assert.ok(matrix.products.some((p) => p.productId === proAId), 'PRO A presente debe aparecer');
    assert.ok(!matrix.products.some((p) => p.productId === proBId), 'PRO B ausente no debe aparecer');
  });

  // 5-7. Matriz refleja requested_quantity, AG no afecta, total por PRO
  await t.test('5-7. Matriz refleja requested_quantity real, modificar AG no cambia la matriz', async () => {
    const o3 = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Cliente AG Test',
      items: [{ productId: proAId, requestedQuantity: 15, agQuantity: null }],
    });
    createdOrderIds.push(o3.id);

    let matrix = await planningService.getPlanningMatrix();
    let rowA = matrix.products.find((p) => p.productId === proAId);
    assert.ok(rowA);
    assert.strictEqual(rowA.ordersCoverage[o3.id]?.requested, 15);

    // Actualizar pedido: AG = 99
    await orderService.updateOrder(o3.id, {
      items: [{ productId: proAId, requestedQuantity: 15, agQuantity: 99 }],
    });

    matrix = await planningService.getPlanningMatrix();
    rowA = matrix.products.find((p) => p.productId === proAId);
    assert.ok(rowA);
    // Requested sigue siendo 15 inalterado
    assert.strictEqual(rowA.ordersCoverage[o3.id]?.requested, 15);

    // Actualizar pedido: AG = 3
    await orderService.updateOrder(o3.id, {
      items: [{ productId: proAId, requestedQuantity: 15, agQuantity: 3 }],
    });
    matrix = await planningService.getPlanningMatrix();
    rowA = matrix.products.find((p) => p.productId === proAId);
    assert.strictEqual(rowA?.ordersCoverage[o3.id]?.requested, 15);
  });

  // 8-12. Stock PRO cubre primero, luego GRA OPEN agregado cubre faltante, GRA CLOSED ignorado
  await t.test('8-12. Stock PRO cubre primero, luego granel agregado cubre faltante', async () => {
    // PRO A tiene stock PRO = 20. Granel OPEN agregado = 15 kg + 10 kg = 25 kg.
    // Unidades posibles de granel: 25 kg / 0.250 kg = 100 unidades.
    // Componentes: COM1 tiene 100 potes, COM2 tiene 80 tapas.
    // Capacidad por componentes: min(100/1, 80/1) = 80 unidades.
    // Capacidad total de envasado = min(100, 80) = 80 unidades.
    // Crear un pedido de 50 unidades de PRO A:
    // Requiere 50:
    // Stock PRO cubre 20.
    // Faltante temporal: 30.
    // Envasado virtual cubre 30 (de los 80 posibles).
    // Faltante final: 0.
    const oStockTest = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      items: [{ productId: proAId, requestedQuantity: 50 }],
    });
    createdOrderIds.push(oStockTest.id);

    // Forzar que este pedido sea el único analizado en este subtest para cálculo aislado
    const snapshot = await planningRepo.getPlanningSnapshot();
    const isolatedSnapshot = {
      ...snapshot,
      orders: snapshot.orders.filter((o) => o.id === oStockTest.id),
      products: snapshot.products.filter((p) => p.id === proAId),
    };

    const result = planningService.calculatePlanningMatrix(isolatedSnapshot);
    const row = result.products.find((p) => p.productId === proAId);
    assert.ok(row);

    assert.strictEqual(row.totalRequested, 50);
    assert.strictEqual(row.coverageFromStock, 20);
    assert.strictEqual(row.coveredFromBulk, 30);
    assert.strictEqual(row.finalShortage, 0);
    assert.strictEqual(row.stockDisplay, '20 + (30)GR');
    assert.strictEqual(row.ordersCoverage[oStockTest.id].hasShortage, false);
  });

  // 13-16. Floor por peso, limitación por componentes, mínimo entre varios COM
  await t.test('13-16. Limitación por componentes frena la producción virtual antes que el granel', async () => {
    // Si COM2 solo tuviera 5 unidades, a pesar de haber 25 kg de granel (100 un),
    // el envasado virtual está estrictamente limitado a 5 unidades por COM2.
    const snapshot = await planningRepo.getPlanningSnapshot();
    const limitedComSnapshot = {
      ...snapshot,
      orders: [{
        id: 'ord_test_limit',
        code: 'PED_LIMIT',
        customerSource: 'CONSUMER_FINAL' as const,
        customerDisplayName: 'Test Limit',
        planningSortKey: 1,
        items: [{ orderId: 'ord_test_limit', productId: proAId, requestedQuantity: 30 }],
      }],
      products: snapshot.products.filter((p) => p.id === proAId).map((p) => ({
        ...p,
        physicalStock: new Decimal(0), // 0 stock físico para probar exclusivamente envasado
      })),
      componentsStock: new Map([[com1Id, new Decimal(50)], [com2Id, new Decimal(7)]]), // COM2 es el cuello de botella (7)
    };

    const result = planningService.calculatePlanningMatrix(limitedComSnapshot);
    const row = result.products.find((p) => p.productId === proAId);
    assert.ok(row);

    // Solicitado 30, pero COM2 solo permite 7
    assert.strictEqual(row.coverageFromStock, 0);
    assert.strictEqual(row.coveredFromBulk, 7);
    assert.strictEqual(row.finalShortage, 23);
    assert.strictEqual(row.stockDisplay, '(7)GR');
    assert.strictEqual(row.ordersCoverage['ord_test_limit'].hasShortage, true);
  });

  // 17-20. Recursos compartidos: dos PROs comparten PBA y COM
  await t.test('17-20. Recursos compartidos (PBA y COM): fila superior consume primero', async () => {
    // PRO A (250g) y PRO B (500g) comparten PBA1.
    // Disponibilidad de granel: 10 kg (40 un de PRO A ó 20 un de PRO B).
    // COM1 disponible: 30 un.
    // Supongamos stock físico = 0 en ambos.
    // Pedido pide: PRO A = 30 un, PRO B = 20 un.
    // Escenario 1: PRO A arriba (prioridad 1), PRO B abajo (prioridad 2):
    // PRO A necesita 30:
    // Granel para 30 un de A = 30 * 0.250 = 7.5 kg.
    // COM1 usado por A = 30.
    // Queda granel: 10 - 7.5 = 2.5 kg.
    // Queda COM1: 30 - 30 = 0 un.
    // PRO B necesita 20:
    // Granel restante = 2.5 kg -> floor(2.5 / 0.5) = 5 un.
    // Pero COM1 restante = 0 -> capacidad = min(5, 0) = 0!
    // Cobertura PRO B = 0, Faltante PRO B = 20!

    const sharedSnapshotOrderAB = {
      orders: [{
        id: 'o_shared',
        code: 'PED_SH',
        customerSource: 'CONSUMER_FINAL' as const,
        customerDisplayName: 'Shared Test',
        planningSortKey: 1,
        items: [
          { orderId: 'o_shared', productId: proAId, requestedQuantity: 30 },
          { orderId: 'o_shared', productId: proBId, requestedQuantity: 20 },
        ],
      }],
      products: [
        { id: proAId, code: 'PROA', name: 'Prod A', weightKg: new Decimal(0.25), baseProductId: baseProduct1Id, physicalStock: new Decimal(0), sortKey: 1 },
        { id: proBId, code: 'PROB', name: 'Prod B', weightKg: new Decimal(0.50), baseProductId: baseProduct1Id, physicalStock: new Decimal(0), sortKey: 2 },
      ],
      bulkLots: [{ id: 'b1', baseProductId: baseProduct1Id, kgAvailable: new Decimal(10) }],
      componentsStock: new Map([[com1Id, new Decimal(30)], [com2Id, new Decimal(100)]]),
      bom: [
        { productId: proAId, componentId: com1Id, quantityPerUnit: 1 },
        { productId: proAId, componentId: com2Id, quantityPerUnit: 1 },
        { productId: proBId, componentId: com1Id, quantityPerUnit: 1 },
      ],
    };

    const resAB = planningService.calculatePlanningMatrix(sharedSnapshotOrderAB);
    const rowA_first = resAB.products.find((p) => p.productId === proAId);
    const rowB_second = resAB.products.find((p) => p.productId === proBId);

    assert.strictEqual(rowA_first?.coveredFromBulk, 30, 'PRO A arriba cubre sus 30');
    assert.strictEqual(rowB_second?.coveredFromBulk, 0, 'PRO B abajo se queda sin COM1');
    assert.strictEqual(rowB_second?.finalShortage, 20);

    // Escenario 2: Invertir orden de filas: PRO B arriba (sortKey: 1), PRO A abajo (sortKey: 2):
    // PRO B necesita 20:
    // Granel para 20 de B = 20 * 0.50 = 10 kg (consume TODO el granel).
    // COM1 usado por B = 20.
    // Queda granel: 0 kg.
    // Queda COM1: 10 un.
    // PRO A abajo necesita 30:
    // Como granel = 0, capacidad = 0!
    // Cobertura PRO A = 0, Faltante PRO A = 30!
    const sharedSnapshotOrderBA = {
      ...sharedSnapshotOrderAB,
      products: [
        { id: proBId, code: 'PROB', name: 'Prod B', weightKg: new Decimal(0.50), baseProductId: baseProduct1Id, physicalStock: new Decimal(0), sortKey: 1 },
        { id: proAId, code: 'PROA', name: 'Prod A', weightKg: new Decimal(0.25), baseProductId: baseProduct1Id, physicalStock: new Decimal(0), sortKey: 2 },
      ],
    };

    const resBA = planningService.calculatePlanningMatrix(sharedSnapshotOrderBA);
    const rowB_first = resBA.products.find((p) => p.productId === proBId);
    const rowA_second = resBA.products.find((p) => p.productId === proAId);

    assert.strictEqual(rowB_first?.coveredFromBulk, 20, 'PRO B arriba cubre sus 20');
    assert.strictEqual(rowA_second?.coveredFromBulk, 0, 'PRO A abajo se queda sin granel');
    assert.strictEqual(rowA_second?.finalShortage, 30);
  });

  // 21-25. Persistencia de prioridades de filas y columnas
  await t.test('21-25. Persistencia de prioridades de productos y pedidos', async () => {
    // Crear un pedido con ambos productos para que ambos existan en el snapshot
    const oBoth = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Cliente Prioridades',
      items: [
        { productId: proAId, requestedQuantity: 5 },
        { productId: proBId, requestedQuantity: 5 },
      ],
    });
    createdOrderIds.push(oBoth.id);

    // Reordenar productos: B primero, luego A
    await planningService.reorderProducts([proBId, proAId]);

    const snapshot1 = await planningRepo.getPlanningSnapshot();
    const prodB = snapshot1.products.find((p) => p.id === proBId);
    const prodA = snapshot1.products.find((p) => p.id === proAId);
    assert.strictEqual(prodB?.sortKey, 1);
    assert.strictEqual(prodA?.sortKey, 2);

    // Reordenar productos de nuevo: A primero, luego B
    await planningService.reorderProducts([proAId, proBId]);
    const snapshot2 = await planningRepo.getPlanningSnapshot();
    assert.strictEqual(snapshot2.products.find((p) => p.id === proAId)?.sortKey, 1);
    assert.strictEqual(snapshot2.products.find((p) => p.id === proBId)?.sortKey, 2);

    // Reordenar columnas (pedidos)
    await planningService.reorderOrders([oBoth.id, o1Id]);
    const { data: ordBoth } = await supabase.from('orders').select('planning_sort_key').eq('id', oBoth.id).single();
    const { data: ord1Db } = await supabase.from('orders').select('planning_sort_key').eq('id', o1Id).single();
    assert.strictEqual(ordBoth?.planning_sort_key, 1);
    assert.strictEqual(ord1Db?.planning_sort_key, 2);

    // Cancelar oBoth para no interferir con pruebas subsiguientes
    await orderService.cancelOrder(oBoth.id);
  });

  // 26-29. Prioridad de columnas distribuye cobertura de izquierda a derecha y marca celda roja
  await t.test('26-29. Columnas distribuyen cobertura de izquierda a derecha marcando celdas incompletas', async () => {
    // Pedido 1 solicita 10 un, Pedido 2 solicita 15 un.
    // Cobertura disponible: 15 un en total.
    // Orden 1 -> 2:
    // Pedido 1 recibe 10/10 (completo, normal).
    // Pedido 2 recibe 5/15 (incompleto, hasShortage = true).
    const colSnapshot1to2 = {
      orders: [
        {
          id: 'ped_1',
          code: 'PED0001',
          customerSource: 'CONSUMER_FINAL' as const,
          customerDisplayName: 'Cliente 1',
          planningSortKey: 1,
          items: [{ orderId: 'ped_1', productId: proAId, requestedQuantity: 10 }],
        },
        {
          id: 'ped_2',
          code: 'PED0002',
          customerSource: 'CONSUMER_FINAL' as const,
          customerDisplayName: 'Cliente 2',
          planningSortKey: 2,
          items: [{ orderId: 'ped_2', productId: proAId, requestedQuantity: 15 }],
        },
      ],
      products: [{
        id: proAId,
        code: 'PROA',
        name: 'Prod A',
        weightKg: new Decimal(0.25),
        baseProductId: null,
        physicalStock: new Decimal(15), // 15 disponibles
        sortKey: 1,
      }],
      bulkLots: [],
      componentsStock: new Map(),
      bom: [],
    };

    const res1to2 = planningService.calculatePlanningMatrix(colSnapshot1to2);
    const rowA = res1to2.products[0];
    assert.strictEqual(rowA.ordersCoverage['ped_1'].covered, 10);
    assert.strictEqual(rowA.ordersCoverage['ped_1'].hasShortage, false);
    assert.strictEqual(rowA.ordersCoverage['ped_2'].covered, 5);
    assert.strictEqual(rowA.ordersCoverage['ped_2'].hasShortage, true);

    // Invertir orden de pedidos: 2 -> 1
    const colSnapshot2to1 = {
      ...colSnapshot1to2,
      orders: [
        { ...colSnapshot1to2.orders[1], planningSortKey: 1 },
        { ...colSnapshot1to2.orders[0], planningSortKey: 2 },
      ],
    };

    const res2to1 = planningService.calculatePlanningMatrix(colSnapshot2to1);
    const rowA_swapped = res2to1.products[0];
    // Ahora ped_2 recibe 15/15 (completo) y ped_1 recibe 0/10 (incompleto)
    assert.strictEqual(rowA_swapped.ordersCoverage['ped_2'].covered, 15);
    assert.strictEqual(rowA_swapped.ordersCoverage['ped_2'].hasShortage, false);
    assert.strictEqual(rowA_swapped.ordersCoverage['ped_1'].covered, 0);
    assert.strictEqual(rowA_swapped.ordersCoverage['ped_1'].hasShortage, true);
  });

  // 30-37. REGLAS CRÍTICAS: Simulación no altera stock ni genera movimientos ni reservas
  await t.test('30-37. REGLA CRÍTICA: La simulación de planificación no altera stock real ni genera movimientos', async () => {
    // 1. Capturar balances reales antes de la simulación
    const { data: proBalBefore } = await supabase.from('stock_balances').select('quantity').eq('stock_item_id', proAId).single();
    const { data: comBalBefore } = await supabase.from('stock_balances').select('quantity').eq('stock_item_id', com1Id).single();
    const { data: bulkBefore } = await supabase.from('bulk_lots').select('kg_available').eq('id', createdBulkLotIds[0]).single();

    const { count: mstCountBefore } = await supabase.from('stock_movements').select('*', { count: 'exact', head: true });
    const { count: movCountBefore } = await supabase.from('patrimonial_movements').select('*', { count: 'exact', head: true });
    const { count: opsCountBefore } = await supabase.from('business_operations').select('*', { count: 'exact', head: true });

    // 2. Ejecutar cálculo real y reordenamientos múltiples
    await planningService.getPlanningMatrix();
    await planningService.reorderProducts([proBId, proAId]);
    await planningService.getPlanningMatrix();
    await planningService.reorderProducts([proAId, proBId]);
    await planningService.getPlanningMatrix();

    // 3. Capturar balances reales después de la simulación
    const { data: proBalAfter } = await supabase.from('stock_balances').select('quantity').eq('stock_item_id', proAId).single();
    const { data: comBalAfter } = await supabase.from('stock_balances').select('quantity').eq('stock_item_id', com1Id).single();
    const { data: bulkAfter } = await supabase.from('bulk_lots').select('kg_available').eq('id', createdBulkLotIds[0]).single();

    const { count: mstCountAfter } = await supabase.from('stock_movements').select('*', { count: 'exact', head: true });
    const { count: movCountAfter } = await supabase.from('patrimonial_movements').select('*', { count: 'exact', head: true });
    const { count: opsCountAfter } = await supabase.from('business_operations').select('*', { count: 'exact', head: true });

    assert.strictEqual(Number(proBalAfter?.quantity), Number(proBalBefore?.quantity), 'Stock PRO debe ser idéntico');
    assert.strictEqual(Number(comBalAfter?.quantity), Number(comBalBefore?.quantity), 'Stock COM debe ser idéntico');
    assert.strictEqual(Number(bulkAfter?.kg_available), Number(bulkBefore?.kg_available), 'Granel kg debe ser idéntico');
    assert.strictEqual(mstCountAfter, mstCountBefore, 'No debe crearse ningún stock_movement (MST)');
    assert.strictEqual(movCountAfter, movCountBefore, 'No debe crearse ningún movimiento patrimonial (MOV)');
    assert.strictEqual(opsCountAfter, opsCountBefore, 'No debe crearse ninguna business_operation');
  });

  // 38-41. Ciclo de pedidos en tiempo real
  await t.test('38-41. Ciclo de vida de pedidos actualiza en tiempo real la matriz de planificación', async () => {
    // Crear pedido con PRO B
    const oLive = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      items: [{ productId: proBId, requestedQuantity: 12 }],
    });
    createdOrderIds.push(oLive.id);

    let matrix = await planningService.getPlanningMatrix();
    assert.ok(matrix.products.some((p) => p.productId === proBId), 'Nuevo pedido hace visible a PRO B');

    // Editar requested_quantity
    await orderService.updateOrder(oLive.id, {
      items: [{ productId: proBId, requestedQuantity: 25 }],
    });
    matrix = await planningService.getPlanningMatrix();
    let rowB = matrix.products.find((p) => p.productId === proBId);
    assert.strictEqual(rowB?.totalRequested, 25, 'Editar cantidad solicitada actualiza total en la matriz');

    // Cancelar pedido
    await orderService.cancelOrder(oLive.id);
    matrix = await planningService.getPlanningMatrix();
    // PRO B ya no tiene pedidos abiertos activos
    assert.ok(!matrix.products.some((p) => p.productId === proBId), 'Cancelar pedido elimina producto sin otros pedidos abiertos');
  });

  // 42. Cero pedidos muestra estado vacío
  await t.test('42. Cero pedidos abiertos retorna matriz vacía limpia (hasOrders: false)', () => {
    const emptyResult = planningService.calculatePlanningMatrix({
      orders: [],
      products: [],
      bulkLots: [],
      componentsStock: new Map(),
      bom: [],
    });

    assert.strictEqual(emptyResult.hasOrders, false);
    assert.strictEqual(emptyResult.openOrders.length, 0);
    assert.strictEqual(emptyResult.products.length, 0);
  });

  // 43-44. Algoritmo determinista
  await t.test('43-44. Algoritmo determinista con múltiples pedidos y productos', () => {
    const complexSnapshot = {
      orders: [
        { id: 'o1', code: 'PED1', customerSource: 'CONSUMER_FINAL' as const, customerDisplayName: 'C1', planningSortKey: 1, items: [{ orderId: 'o1', productId: 'p1', requestedQuantity: 10 }, { orderId: 'o1', productId: 'p2', requestedQuantity: 5 }] },
        { id: 'o2', code: 'PED2', customerSource: 'CONSUMER_FINAL' as const, customerDisplayName: 'C2', planningSortKey: 2, items: [{ orderId: 'o2', productId: 'p1', requestedQuantity: 20 }] },
      ],
      products: [
        { id: 'p1', code: 'PRO1', name: 'P1', weightKg: new Decimal(0.5), baseProductId: 'b1', physicalStock: new Decimal(15), sortKey: 1 },
        { id: 'p2', code: 'PRO2', name: 'P2', weightKg: new Decimal(1.0), baseProductId: 'b1', physicalStock: new Decimal(0), sortKey: 2 },
      ],
      bulkLots: [{ id: 'b1', baseProductId: 'b1', kgAvailable: new Decimal(10) }],
      componentsStock: new Map([['c1', new Decimal(50)]]),
      bom: [{ productId: 'p1', componentId: 'c1', quantityPerUnit: 1 }, { productId: 'p2', componentId: 'c1', quantityPerUnit: 2 }],
    };

    const res1 = planningService.calculatePlanningMatrix(complexSnapshot);
    const res2 = planningService.calculatePlanningMatrix(complexSnapshot);

    assert.deepStrictEqual(res1, res2, 'El resultado debe ser idéntico y determinista para mismos inputs');
  });

  // 45. ESCENARIO INTEGRADO FUERTE DE RECURSOS COMPARTIDOS (Section 38)
  await t.test('45. Escenario integrado: 2 PRO comparten PBA y COM, 2 PED compiten; A->B vs B->A y 1->2 vs 2->1', async () => {
    // Setup del escenario:
    // PRO A (0.250 kg) y PRO B (0.500 kg) comparten PBA1.
    // Comparten COM1 (Pote).
    // Pedido 1 solicita: PRO A = 20, PRO B = 10.
    // Pedido 2 solicita: PRO A = 20, PRO B = 10.
    // Stock físico PRO = 0 en ambos.
    // Pool de granel = 10.000 kg.
    // Stock COM1 = 30 unidades.

    const testSnapshot = (prodOrder: [string, string], orderOrder: [string, string]) => ({
      orders: [
        {
          id: orderOrder[0],
          code: orderOrder[0] === 'ped1' ? 'PED0001' : 'PED0002',
          customerSource: 'CONSUMER_FINAL' as const,
          customerDisplayName: orderOrder[0] === 'ped1' ? 'Cliente 1' : 'Cliente 2',
          planningSortKey: 1,
          items: [
            { orderId: orderOrder[0], productId: proAId, requestedQuantity: 20 },
            { orderId: orderOrder[0], productId: proBId, requestedQuantity: 10 },
          ],
        },
        {
          id: orderOrder[1],
          code: orderOrder[1] === 'ped1' ? 'PED0001' : 'PED0002',
          customerSource: 'CONSUMER_FINAL' as const,
          customerDisplayName: orderOrder[1] === 'ped1' ? 'Cliente 1' : 'Cliente 2',
          planningSortKey: 2,
          items: [
            { orderId: orderOrder[1], productId: proAId, requestedQuantity: 20 },
            { orderId: orderOrder[1], productId: proBId, requestedQuantity: 10 },
          ],
        },
      ],
      products: [
        { id: prodOrder[0], code: prodOrder[0] === proAId ? 'PROA' : 'PROB', name: 'Prod ' + (prodOrder[0] === proAId ? 'A' : 'B'), weightKg: prodOrder[0] === proAId ? new Decimal(0.25) : new Decimal(0.5), baseProductId: baseProduct1Id, physicalStock: new Decimal(0), sortKey: 1 },
        { id: prodOrder[1], code: prodOrder[1] === proAId ? 'PROA' : 'PROB', name: 'Prod ' + (prodOrder[1] === proAId ? 'A' : 'B'), weightKg: prodOrder[1] === proAId ? new Decimal(0.25) : new Decimal(0.5), baseProductId: baseProduct1Id, physicalStock: new Decimal(0), sortKey: 2 },
      ],
      bulkLots: [{ id: 'b_test', baseProductId: baseProduct1Id, kgAvailable: new Decimal(10) }],
      componentsStock: new Map([[com1Id, new Decimal(30)], [com2Id, new Decimal(100)]]),
      bom: [
        { productId: proAId, componentId: com1Id, quantityPerUnit: 1 },
        { productId: proAId, componentId: com2Id, quantityPerUnit: 1 },
        { productId: proBId, componentId: com1Id, quantityPerUnit: 1 },
      ],
    });

    // Caso 1: Filas A -> B, Pedidos 1 -> 2
    const resA_B_1_2 = planningService.calculatePlanningMatrix(testSnapshot([proAId, proBId], ['ped1', 'ped2']));
    const rowA1 = resA_B_1_2.products.find((p) => p.productId === proAId)!;
    const rowB1 = resA_B_1_2.products.find((p) => p.productId === proBId)!;

    // COM1 tiene 30. PRO A pide 40 en total (20 en ped1, 20 en ped2).
    // PRO A consume 30 de COM1 (20 cubiertos para ped1, 10 para ped2).
    // PRO B recibe 0 de COM1.
    assert.strictEqual(rowA1.coveredFromBulk, 30);
    assert.strictEqual(rowA1.ordersCoverage['ped1'].covered, 20);
    assert.strictEqual(rowA1.ordersCoverage['ped1'].hasShortage, false);
    assert.strictEqual(rowA1.ordersCoverage['ped2'].covered, 10);
    assert.strictEqual(rowA1.ordersCoverage['ped2'].hasShortage, true);
    assert.strictEqual(rowB1.coveredFromBulk, 0);

    // Caso 2: Invertir filas: B -> A, manteniendo Pedidos 1 -> 2
    const resB_A_1_2 = planningService.calculatePlanningMatrix(testSnapshot([proBId, proAId], ['ped1', 'ped2']));
    const rowB2 = resB_A_1_2.products.find((p) => p.productId === proBId)!;
    const rowA2 = resB_A_1_2.products.find((p) => p.productId === proAId)!;

    // PRO B necesita 20 en total (10 en ped1, 10 en ped2).
    // Granel: 20 * 0.500 = 10 kg (consume todo el granel).
    // COM1 usado por B: 20.
    // PRO B cubre sus 20.
    // PRO A recibe 0 de granel.
    assert.strictEqual(rowB2.coveredFromBulk, 20);
    assert.strictEqual(rowB2.ordersCoverage['ped1'].covered, 10);
    assert.strictEqual(rowB2.ordersCoverage['ped2'].covered, 10);
    assert.strictEqual(rowA2.coveredFromBulk, 0);

    // Caso 3: Invertir pedidos en Caso 1: A -> B, pero Pedidos 2 -> 1
    const resA_B_2_1 = planningService.calculatePlanningMatrix(testSnapshot([proAId, proBId], ['ped2', 'ped1']));
    const rowA3 = resA_B_2_1.products.find((p) => p.productId === proAId)!;

    // Ahora ped2 está primero a la izquierda: recibe 20/20 y no tiene faltante.
    // ped1 está segundo: recibe 10/20 y tiene faltante.
    assert.strictEqual(rowA3.ordersCoverage['ped2'].covered, 20);
    assert.strictEqual(rowA3.ordersCoverage['ped2'].hasShortage, false);
    assert.strictEqual(rowA3.ordersCoverage['ped1'].covered, 10);
    assert.strictEqual(rowA3.ordersCoverage['ped1'].hasShortage, true);
  });
});
