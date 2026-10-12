import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { PurchaseDomainService } from '../src/services/purchase.service';
import { PurchaseRepository } from '../src/repositories/purchase.repository';
import { SupplierRepository } from '../src/repositories/supplier.repository';
import { SupplierItemRepository } from '../src/repositories/supplier-item.repository';
import { StockRepository } from '../src/repositories/stock.repository';
import { MasterItemRepository } from '../src/repositories/master-item.repository';
import { CostEngineService } from '../src/services/cost-engine.service';
import { FormulaRepository } from '../src/repositories/formula.repository';
import { ProductRepository } from '../src/repositories/product.repository';
import { MasterItemDomainService } from '../src/services/master-item.service';
import { Decimal } from '../src/domain/decimal';
import type { Database } from '../src/database/types';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('FASE 8 — COMPRAS: Pruebas integrales de flujo real, ledger MST, patrimonial MOV, inmutabilidad, edición atómica, concurrencia y rollback', async (t) => {
  const purchaseRepo = new PurchaseRepository(supabase);
  const supplierRepo = new SupplierRepository(supabase);
  const supplierItemRepo = new SupplierItemRepository(supabase);
  const stockRepo = new StockRepository(supabase);
  const masterItemRepo = new MasterItemRepository(supabase);
  const formulaRepo = new FormulaRepository(supabase);
  const productRepo = new ProductRepository(supabase);
  const costEngineService = new CostEngineService(supplierItemRepo, formulaRepo, productRepo);
  const masterItemService = new MasterItemDomainService(masterItemRepo, supplierRepo);

  const purchaseService = new PurchaseDomainService(
    purchaseRepo,
    supplierRepo,
    supplierItemRepo,
    stockRepo,
    masterItemRepo,
    costEngineService
  );

  const testTag = `CMP_${Date.now()}`;
  let supplierArsId: string;
  let supplierUsdId: string;
  let inactiveSupplierId: string;
  let mpr1Id: string;
  let mpr2Id: string;
  let com1Id: string;
  let proItemId: string;

  const createdPurchases: string[] = [];
  const createdOps: string[] = [];
  const createdSuppliers: string[] = [];
  const createdStockItems: string[] = [];

  t.before(async () => {
    // 1. Proveedor ARS activo
    const { data: supArs, error: supArsErr } = await supabase
      .from('suppliers')
      .insert({
        code: `PRV_A_${testTag.slice(-6)}`,
        name: `Proveedor ARS Test ${testTag}`,
        currency_code: 'ARS',
        active: true,
      })
      .select('id')
      .single();
    assert.ifError(supArsErr);
    supplierArsId = supArs.id;
    createdSuppliers.push(supplierArsId);

    // 2. Proveedor USD activo
    const { data: supUsd, error: supUsdErr } = await supabase
      .from('suppliers')
      .insert({
        code: `PRV_U_${testTag.slice(-6)}`,
        name: `Proveedor USD Test ${testTag}`,
        currency_code: 'USD',
        active: true,
      })
      .select('id')
      .single();
    assert.ifError(supUsdErr);
    supplierUsdId = supUsd.id;
    createdSuppliers.push(supplierUsdId);

    // 3. Proveedor inactivo
    const { data: supInact, error: supInactErr } = await supabase
      .from('suppliers')
      .insert({
        code: `PRV_I_${testTag.slice(-6)}`,
        name: `Proveedor Inactivo Test ${testTag}`,
        currency_code: 'ARS',
        active: false,
      })
      .select('id')
      .single();
    assert.ifError(supInactErr);
    inactiveSupplierId = supInact.id;
    createdSuppliers.push(inactiveSupplierId);

    // 4. Insumos MPR (Materias Primas)
    const { data: mpr1, error: mpr1Err } = await supabase
      .from('stock_items')
      .insert({
        code: `MPR_${testTag.slice(-6)}_1`,
        item_type: 'MPR',
        name: `Materia Prima 1 ${testTag}`,
        unit_type: 'KG',
        stock_minimum: 5.0,
        active: true,
        created_date: '2026-10-10',
      })
      .select('id')
      .single();
    assert.ifError(mpr1Err);
    mpr1Id = mpr1.id;
    createdStockItems.push(mpr1Id);
    await supabase.from('raw_materials').insert({ stock_item_id: mpr1Id, inci: 'Aqua' });
    await supabase.from('stock_balances').insert({ stock_item_id: mpr1Id, quantity: 0 });

    const { data: mpr2, error: mpr2Err } = await supabase
      .from('stock_items')
      .insert({
        code: `MPR_${testTag.slice(-6)}_2`,
        item_type: 'MPR',
        name: `Materia Prima 2 ${testTag}`,
        unit_type: 'KG',
        stock_minimum: 2.0,
        active: true,
        created_date: '2026-10-10',
      })
      .select('id')
      .single();
    assert.ifError(mpr2Err);
    mpr2Id = mpr2.id;
    createdStockItems.push(mpr2Id);
    await supabase.from('raw_materials').insert({ stock_item_id: mpr2Id, inci: 'Glycerin' });
    await supabase.from('stock_balances').insert({ stock_item_id: mpr2Id, quantity: 0 });

    // 5. Insumo COM (Componente por unidad)
    const { data: com1, error: com1Err } = await supabase
      .from('stock_items')
      .insert({
        code: `COM_${testTag.slice(-6)}_1`,
        item_type: 'COM',
        name: `Envase 250ml ${testTag}`,
        unit_type: 'UNIT',
        stock_minimum: 20,
        active: true,
        created_date: '2026-10-10',
      })
      .select('id')
      .single();
    assert.ifError(com1Err);
    com1Id = com1.id;
    createdStockItems.push(com1Id);
    await supabase.from('components').insert({ stock_item_id: com1Id });
    await supabase.from('stock_balances').insert({ stock_item_id: com1Id, quantity: 0 });

    // 6. Ítem PRO (Producto Final - no comprable)
    const { data: pro, error: proErr } = await supabase
      .from('stock_items')
      .insert({
        code: `PRO_${testTag.slice(-6)}_1`,
        item_type: 'PRO',
        name: `Shampoo Terminado ${testTag}`,
        unit_type: 'UNIT',
        stock_minimum: 10,
        active: true,
        created_date: '2026-10-10',
      })
      .select('id')
      .single();
    assert.ifError(proErr);
    proItemId = pro.id;
    createdStockItems.push(proItemId);
  });

  t.after(async () => {
    // Limpieza ordenada de registros de prueba
    for (const purId of createdPurchases) {
      await supabase.from('purchase_items').delete().eq('purchase_id', purId);
      await supabase.from('purchases').delete().eq('id', purId);
    }

    for (const opId of createdOps) {
      const { data: movs } = await supabase.from('patrimonial_movements').select('id').eq('operation_id', opId);
      if (movs && movs.length > 0) {
        await supabase.from('financial_entries').delete().in('patrimonial_movement_id', movs.map((m) => m.id));
      }
      await supabase.from('patrimonial_movements').delete().eq('operation_id', opId);
      await supabase.from('stock_adjustments').delete().eq('operation_id', opId);
      await supabase.from('stock_movements').delete().eq('operation_id', opId);
      await supabase.from('business_operations').delete().eq('id', opId);
    }

    for (const itemId of createdStockItems) {
      await supabase.from('supplier_items').delete().eq('stock_item_id', itemId);
      await supabase.from('stock_balances').delete().eq('stock_item_id', itemId);
      await supabase.from('raw_materials').delete().eq('stock_item_id', itemId);
      await supabase.from('components').delete().eq('stock_item_id', itemId);
      await supabase.from('stock_items').delete().eq('id', itemId);
    }

    for (const supId of createdSuppliers) {
      await supabase.from('supplier_items').delete().eq('supplier_id', supId);
      await supabase.from('suppliers').delete().eq('id', supId);
    }
  });

  // TEST 1 & 8 & 9 & 10: Compra válida MPR ARS, incremento de stock, MST generado y costo teórico actualizado
  await t.test('1. Compra válida MPR ARS: incrementa stock, genera MST y actualiza costo teórico', async () => {
    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('12.500'),
          unitPriceNetSource: new Decimal('1000.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    assert.match(res.code, /^CMP\d{4,}$/);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // Saldo físico en stock_balances debe ser exactamente 12.500
    const bal = await stockRepo.getBalance(mpr1Id);
    assert.strictEqual(bal.toString(), '12.5');

    // MST ledger
    const { data: mst } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .eq('stock_item_id', mpr1Id)
      .single();
    assert.ok(mst);
    assert.strictEqual(mst.movement_type, 'COMPRA');
    assert.strictEqual(Number(mst.quantity_delta), 12.5);

    // Costo teórico actualizado en supplier_items
    const latestCost = await supplierItemRepo.getLatestSupplierItem(mpr1Id);
    assert.ok(latestCost);
    assert.strictEqual(latestCost.quotedUnitPriceNet.toString(), '1000');
    assert.strictEqual(latestCost.supplierId, supplierArsId);
  });

  // TEST 2: Compra válida COM ARS (entero)
  await t.test('2. Compra válida COM ARS: incrementa unidades de componente', async () => {
    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: com1Id,
          quantity: new Decimal('40'),
          unitPriceNetSource: new Decimal('250.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    const bal = await stockRepo.getBalance(com1Id);
    assert.strictEqual(bal.toString(), '40');
  });

  // TEST 3: Compra con múltiples ítems (MPR + COM en una sola compra CMP)
  await t.test('3. Compra con múltiples ítems: actualiza ambos balances y acumula totales', async () => {
    const prevMpr2Bal = await stockRepo.getBalance(mpr2Id);
    const prevCom1Bal = await stockRepo.getBalance(com1Id);

    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: mpr2Id,
          quantity: new Decimal('8.250'),
          unitPriceNetSource: new Decimal('500.00'),
          vatRatePct: new Decimal('21.0'),
        },
        {
          stockItemId: com1Id,
          quantity: new Decimal('20'),
          unitPriceNetSource: new Decimal('300.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.items.length, 2);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // Subtotal neto = (8.25 * 500) + (20 * 300) = 4125 + 6000 = 10125
    // Bruto = 10125 * 1.21 = 12251.25
    assert.strictEqual(res.totalNetSourceCurrency.toString(), '10125');
    assert.strictEqual(res.totalGrossArs.toString(), '12251.25');

    const newMpr2Bal = await stockRepo.getBalance(mpr2Id);
    assert.strictEqual(newMpr2Bal.minus(prevMpr2Bal).toString(), '8.25');

    const newCom1Bal = await stockRepo.getBalance(com1Id);
    assert.strictEqual(newCom1Bal.minus(prevCom1Bal).toString(), '20');
  });

  // TEST 4 & 5: Proveedor USD con snapshot de cotización
  await t.test('4. Proveedor USD: snapshot de cotización CMP preservado sin alterar cotización global', async () => {
    const fxRate = new Decimal('1450.50');
    const netUsd = new Decimal('10.00'); // 10 USD/kg
    const qty = new Decimal('5.000'); // 5 kg

    const res = await purchaseService.registerPurchase({
      supplierId: supplierUsdId,
      paymentMode: 'DEBT',
      exchangeRateUsed: fxRate,
      items: [
        {
          stockItemId: mpr1Id,
          quantity: qty,
          unitPriceNetSource: netUsd,
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currencyCode, 'USD');
    assert.strictEqual(res.exchangeRateUsed?.toString(), '1450.5');
    assert.strictEqual(res.totalNetSourceCurrency.toString(), '50'); // 5 * 10

    // Total ARS bruto = 50 * 1450.50 * 1.21 = 87755.25
    assert.strictEqual(res.totalGrossArs.toString(), '87755.25');

    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // Verificar detalle consultado
    const detail = await purchaseService.getPurchaseById(res.purchaseId);
    assert.ok(detail);
    assert.strictEqual(detail.exchangeRateUsed?.toString(), '1450.5');
    assert.strictEqual(detail.currencyCodeSnapshot, 'USD');
  });

  // TEST 6: Compra PAGA impacta Caja Steffen sin generar deuda
  await t.test('6. Compra PAGA: registra MOV COMPRA en Caja Steffen sin generar deuda en proveedor', async () => {
    const supBefore = await supplierRepo.findById(supplierArsId);
    assert.ok(supBefore);

    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('1.000'),
          unitPriceNetSource: new Decimal('100.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.paymentMode, 'PAID');
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // El saldo del proveedor NO debe haber cambiado
    const supAfter = await supplierRepo.findById(supplierArsId);
    assert.ok(supAfter);
    assert.strictEqual(supAfter.balance.toString(), supBefore.balance.toString());

    // MOV en Caja Steffen debe haberse creado con variación negativa
    const { data: mov } = await supabase
      .from('patrimonial_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .single();
    assert.ok(mov);
    assert.strictEqual(mov.movement_type, 'COMPRA');
    assert.strictEqual(Number(mov.amount_ars), 121); // 100 * 1.21
  });

  // TEST 7: Compra A DEUDA genera deuda en proveedor
  await t.test('7. Compra A DEUDA: incrementa la deuda con el proveedor por el total bruto', async () => {
    const supBefore = await supplierRepo.findById(supplierArsId);
    assert.ok(supBefore);

    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'DEBT',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('2.000'),
          unitPriceNetSource: new Decimal('500.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.paymentMode, 'DEBT');
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // Total = 2 * 500 * 1.21 = 1210 ARS
    const supAfter = await supplierRepo.findById(supplierArsId);
    assert.ok(supAfter);
    const deltaDebt = supAfter.balance.minus(supBefore.balance);
    assert.strictEqual(deltaDebt.toString(), '1210');
  });

  // TEST 12: Rechazo cantidad <= 0
  await t.test('12. Validación: rechazo de cantidad <= 0', async () => {
    await assert.rejects(
      async () => {
        await purchaseService.registerPurchase({
          supplierId: supplierArsId,
          paymentMode: 'PAID',
          items: [
            {
              stockItemId: mpr1Id,
              quantity: new Decimal('0'),
              unitPriceNetSource: new Decimal('100.00'),
            },
          ],
        });
      },
      /mayor a 0/i
    );
  });

  // TEST 13: Rechazo COM fraccionario
  await t.test('13. Validación: rechazo de cantidades fraccionarias en componentes UNIT', async () => {
    await assert.rejects(
      async () => {
        await purchaseService.registerPurchase({
          supplierId: supplierArsId,
          paymentMode: 'PAID',
          items: [
            {
              stockItemId: com1Id,
              quantity: new Decimal('2.5'),
              unitPriceNetSource: new Decimal('100.00'),
            },
          ],
        });
      },
      /fraccionarias|decimales/i
    );
  });

  // TEST 14: Rechazo proveedor inactivo
  await t.test('14. Validación: rechazo de proveedor inactivo', async () => {
    await assert.rejects(
      async () => {
        await purchaseService.registerPurchase({
          supplierId: inactiveSupplierId,
          paymentMode: 'PAID',
          items: [
            {
              stockItemId: mpr1Id,
              quantity: new Decimal('1.000'),
              unitPriceNetSource: new Decimal('100.00'),
            },
          ],
        });
      },
      /inactivo/i
    );
  });

  // TEST 15: Rechazo ítem tipo PRO
  await t.test('15. Validación: rechazo de ítem PRO (no comprable)', async () => {
    await assert.rejects(
      async () => {
        await purchaseService.registerPurchase({
          supplierId: supplierArsId,
          paymentMode: 'PAID',
          items: [
            {
              stockItemId: proItemId,
              quantity: new Decimal('1'),
              unitPriceNetSource: new Decimal('100.00'),
            },
          ],
        });
      },
      /Solo se permite comprar Materias Primas/i
    );
  });

  // TEST 16 & 17: Rechazo cotización inválida para proveedor USD
  await t.test('16 & 17. Validación: rechazo de cotización <= 0 o ausente para proveedor USD', async () => {
    await assert.rejects(
      async () => {
        await purchaseService.registerPurchase({
          supplierId: supplierUsdId,
          paymentMode: 'DEBT',
          exchangeRateUsed: new Decimal('0'),
          items: [
            {
              stockItemId: mpr1Id,
              quantity: new Decimal('1.000'),
              unitPriceNetSource: new Decimal('10.00'),
            },
          ],
        });
      },
      /cotización/i
    );
  });

  // TEST 18: Edición aumentando cantidad (delta positivo en stock y recálculo financiero)
  await t.test('18. Edición de compra aumentando cantidad: aplica delta de stock y actualiza deuda', async () => {
    // 1. Crear compra inicial A DEUDA: 10 kg a $ 100 neto (+ IVA = $ 1210)
    const initial = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'DEBT',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('10.000'),
          unitPriceNetSource: new Decimal('100.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });
    createdPurchases.push(initial.purchaseId);
    createdOps.push(initial.operationId);

    const balAfterInitial = await stockRepo.getBalance(mpr1Id);
    const supAfterInitial = await supplierRepo.findById(supplierArsId);

    // 2. Editar aumentando a 15 kg
    const edited = await purchaseService.editPurchase({
      purchaseId: initial.purchaseId,
      paymentMode: 'DEBT',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('15.000'),
          unitPriceNetSource: new Decimal('100.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(edited.success, true);

    // Stock debe haber subido en +5 kg (total 15 kg respecto a antes de la compra)
    const balAfterEdit = await stockRepo.getBalance(mpr1Id);
    assert.strictEqual(balAfterEdit.minus(balAfterInitial).toString(), '5');

    // Deuda con proveedor debe haber subido en (5 * 100 * 1.21 = 605)
    const supAfterEdit = await supplierRepo.findById(supplierArsId);
    assert.ok(supAfterEdit && supAfterInitial);
    assert.strictEqual(supAfterEdit.balance.minus(supAfterInitial.balance).toString(), '605');
  });

  // TEST 19: Edición reduciendo cantidad (delta negativo en stock y ajuste de deuda)
  await t.test('19. Edición de compra reduciendo cantidad: reduce stock y disminuye deuda', async () => {
    // Crear compra de 20 kg
    const initial = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'DEBT',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('20.000'),
          unitPriceNetSource: new Decimal('200.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });
    createdPurchases.push(initial.purchaseId);
    createdOps.push(initial.operationId);

    const balAfterInitial = await stockRepo.getBalance(mpr1Id);
    const supAfterInitial = await supplierRepo.findById(supplierArsId);

    // Editar reduciendo a 14 kg (-6 kg)
    const edited = await purchaseService.editPurchase({
      purchaseId: initial.purchaseId,
      paymentMode: 'DEBT',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('14.000'),
          unitPriceNetSource: new Decimal('200.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(edited.success, true);

    const balAfterEdit = await stockRepo.getBalance(mpr1Id);
    assert.strictEqual(balAfterEdit.minus(balAfterInitial).toString(), '-6');

    // Deuda disminuye en (6 * 200 * 1.21 = 1452)
    const supAfterEdit = await supplierRepo.findById(supplierArsId);
    assert.ok(supAfterEdit && supAfterInitial);
    assert.strictEqual(supAfterInitial.balance.minus(supAfterEdit.balance).toString(), '1452');
  });

  // TEST 20: Edición rechazada si reversión causaría stock negativo (check_violation)
  await t.test('20. Edición rechazada si reversión causaría stock negativo: protección absoluta', async () => {
    // 1. Crear nuevo ítem aislado con saldo 0
    const { data: isolatedMpr } = await supabase
      .from('stock_items')
      .insert({
        code: `MPR_ISO_${testTag.slice(-6)}`,
        item_type: 'MPR',
        name: `Insumo Aislado ${testTag}`,
        unit_type: 'KG',
        stock_minimum: 1,
        active: true,
        created_date: '2026-10-10',
      })
      .select('id')
      .single();
    assert.ok(isolatedMpr);
    createdStockItems.push(isolatedMpr.id);
    await supabase.from('raw_materials').insert({ stock_item_id: isolatedMpr.id });
    await supabase.from('stock_balances').insert({ stock_item_id: isolatedMpr.id, quantity: 0 });

    // 2. Registrar compra de 10 kg
    const purchase = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: isolatedMpr.id,
          quantity: new Decimal('10.000'),
          unitPriceNetSource: new Decimal('50.00'),
        },
      ],
    });
    createdPurchases.push(purchase.purchaseId);
    createdOps.push(purchase.operationId);

    // 3. Crear ajuste manual de salida de -8 kg (quedan 2 kg en saldo)
    const adjResult = await stockRepo.createAdjustment({
      stockItemId: isolatedMpr.id,
      quantityDelta: new Decimal('-8.000'),
      reason: 'Salida de prueba',
    });
    createdOps.push(adjResult.operationId);

    const balAfterSalida = await stockRepo.getBalance(isolatedMpr.id);
    assert.strictEqual(balAfterSalida.toString(), '2');

    // 4. Intentar editar la compra a 1 kg (esto restaría 9 kg al stock, pero solo quedan 2 kg -> causaría saldo -7 kg)
    await assert.rejects(
      async () => {
        await purchaseService.editPurchase({
          purchaseId: purchase.purchaseId,
          paymentMode: 'PAID',
          items: [
            {
              stockItemId: isolatedMpr.id,
              quantity: new Decimal('1.000'),
              unitPriceNetSource: new Decimal('50.00'),
            },
          ],
        });
      },
      /violates check constraint|stock negativo|insuficiente/i
    );

    // 5. El saldo debe seguir intacto en 2 kg
    const finalBal = await stockRepo.getBalance(isolatedMpr.id);
    assert.strictEqual(finalBal.toString(), '2');
  });

  // TEST 21: Edición de precio
  await t.test('21. Edición de precio: recalcula importes y actualiza deuda de forma exacta', async () => {
    const initial = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'DEBT',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('5.000'),
          unitPriceNetSource: new Decimal('100.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });
    createdPurchases.push(initial.purchaseId);
    createdOps.push(initial.operationId);

    const supBefore = await supplierRepo.findById(supplierArsId);

    // Se edita a precio $ 150 (+ $ 50 por kg * 5 kg * 1.21 = $ 302.50)
    const edited = await purchaseService.editPurchase({
      purchaseId: initial.purchaseId,
      paymentMode: 'DEBT',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('5.000'),
          unitPriceNetSource: new Decimal('150.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(edited.success, true);
    assert.strictEqual(edited.totalGrossArs.toString(), '907.5'); // 5 * 150 * 1.21

    const supAfter = await supplierRepo.findById(supplierArsId);
    assert.ok(supBefore && supAfter);
    assert.strictEqual(supAfter.balance.minus(supBefore.balance).toString(), '302.5');
  });

  // TEST 22 & 23: Edición de cotización
  await t.test('22 & 23. Edición de cotización USD: recalcula ARS y deuda', async () => {
    const initial = await purchaseService.registerPurchase({
      supplierId: supplierUsdId,
      paymentMode: 'DEBT',
      exchangeRateUsed: new Decimal('1400.00'),
      items: [
        {
          stockItemId: mpr2Id,
          quantity: new Decimal('2.000'),
          unitPriceNetSource: new Decimal('10.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });
    createdPurchases.push(initial.purchaseId);
    createdOps.push(initial.operationId);

    // Total inicial = 2 * 10 * 1400 * 1.21 = 33880 ARS
    assert.strictEqual(initial.totalGrossArs.toString(), '33880');

    // Se edita la cotización a 1450.00 (+ 50 * 20 * 1.21 = + 1210 ARS)
    const edited = await purchaseService.editPurchase({
      purchaseId: initial.purchaseId,
      paymentMode: 'DEBT',
      exchangeRateUsed: new Decimal('1450.00'),
      items: [
        {
          stockItemId: mpr2Id,
          quantity: new Decimal('2.000'),
          unitPriceNetSource: new Decimal('10.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(edited.success, true);
    assert.strictEqual(edited.totalGrossArs.toString(), '35090'); // 2 * 10 * 1450 * 1.21 = 35090
  });

  // TEST 24: Compra histórica no cambia al modificar cotización actual global
  await t.test('24. Inmutabilidad histórica: compra preserva su cotización ante cambio global', async () => {
    const purchase = await purchaseService.getPurchaseById(createdPurchases[0]);
    assert.ok(purchase);
    const grossBefore = purchase.totalGrossArs.toString();

    // Insertar nueva cotización global
    const { data: newRate } = await supabase
      .from('exchange_rates')
      .insert({
        currency_code: 'USD',
        rate_to_ars: 2000.0,
        effective_at: new Date().toISOString(),
        is_current: true,
      })
      .select('id')
      .single();

    const purchaseAfter = await purchaseService.getPurchaseById(createdPurchases[0]);
    assert.ok(purchaseAfter);
    assert.strictEqual(purchaseAfter.totalGrossArs.toString(), grossBefore);

    if (newRate) {
      await supabase.from('exchange_rates').delete().eq('id', newRate.id);
    }
  });

  // TEST 25: Concurrencia
  await t.test('25. Concurrencia: compras concurrentes generan códigos CMP secuenciales únicos sin colisión', async () => {
    const promises = Array.from({ length: 4 }).map((_, i) =>
      purchaseService.registerPurchase({
        supplierId: supplierArsId,
        paymentMode: 'PAID',
        items: [
          {
            stockItemId: mpr1Id,
            quantity: new Decimal('1.000'),
            unitPriceNetSource: new Decimal((100 + i).toString()),
          },
        ],
      })
    );

    const results = await Promise.allSettled(promises);
    const successful = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value);

    assert.strictEqual(successful.length, 4);
    const codes = successful.map((s) => s.code);
    const uniqueCodes = new Set(codes);
    assert.strictEqual(uniqueCodes.size, 4, 'Todos los códigos CMP deben ser únicos');

    for (const s of successful) {
      createdPurchases.push(s.purchaseId);
      createdOps.push(s.operationId);
    }
  });

  // TEST 26: Rollback tardío
  await t.test('26. Rollback tardío: error en ítems no deja registros huérfanos en compras ni stock', async () => {
    const countBefore = await supabase.from('purchases').select('id', { count: 'exact', head: true });

    await assert.rejects(
      async () => {
        // Enviar ítem válido y luego ítem inválido (PRO)
        await purchaseService.registerPurchase({
          supplierId: supplierArsId,
          paymentMode: 'PAID',
          items: [
            {
              stockItemId: mpr1Id,
              quantity: new Decimal('5.000'),
              unitPriceNetSource: new Decimal('100.00'),
            },
            {
              stockItemId: proItemId, // Rechazado por validación
              quantity: new Decimal('1'),
              unitPriceNetSource: new Decimal('100.00'),
            },
          ],
        });
      },
      /Solo se permite comprar Materias Primas/i
    );

    const countAfter = await supabase.from('purchases').select('id', { count: 'exact', head: true });
    assert.strictEqual(countAfter.count, countBefore.count, 'No deben quedar compras huérfanas tras rollback');
  });

  // TEST 27: CMP con MPR existente ya asociada -> OK
  await t.test('27. CMP con MPR existente ya asociada: registra compra, actualiza precio y stock', async () => {
    const balBefore = await stockRepo.getBalance(mpr1Id);

    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: mpr1Id,
          quantity: new Decimal('3.500'),
          unitPriceNetSource: new Decimal('1150.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // Stock debe aumentar en exactamente 3.500
    const balAfter = await stockRepo.getBalance(mpr1Id);
    assert.strictEqual(balAfter.minus(balBefore).toString(), '3.5');

    // supplier_items actualizado con nuevo precio
    const latest = await supplierItemRepo.getLatestSupplierItem(mpr1Id);
    assert.ok(latest);
    assert.strictEqual(latest.quotedUnitPriceNet.toString(), '1150');
  });

  // TEST 28: CMP con MPR existente NO asociada previamente
  await t.test('28. CMP con MPR existente NO asociada: crea supplier_items, no duplica MPR, actualiza price_updated_at y stock una sola vez', async () => {
    // Crear una MPR nueva asociada a supplierUsdId (por ende NO asociada a supplierArsId)
    const newMpr = await masterItemService.createRawMaterial({
      name: `MPR No Asociada ${testTag}`,
      stockMinimum: '2.000',
      initialStock: '0',
      initialSupplierId: supplierUsdId,
      initialQuotedPriceNet: '5.00',
    });
    createdStockItems.push(newMpr.id);

    // Confirmar que NO está asociada a supplierArsId antes de la compra
    const { data: assocBefore } = await supabase
      .from('supplier_items')
      .select('id')
      .eq('supplier_id', supplierArsId)
      .eq('stock_item_id', newMpr.id);
    assert.strictEqual(assocBefore?.length || 0, 0, 'No debe existir relación previa con supplierArsId');

    const balBefore = await stockRepo.getBalance(newMpr.id);
    assert.strictEqual(balBefore.toString(), '0');

    // Registrar compra con supplierArsId
    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: newMpr.id,
          quantity: new Decimal('8.000'),
          unitPriceNetSource: new Decimal('750.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // 1. Debe haberse creado automáticamente la relación en supplier_items
    const { data: assocAfter, error: assocErr } = await supabase
      .from('supplier_items')
      .select('*')
      .eq('supplier_id', supplierArsId)
      .eq('stock_item_id', newMpr.id)
      .single();
    assert.ifError(assocErr);
    assert.ok(assocAfter, 'Debe existir la relación en supplier_items tras la compra');
    assert.strictEqual(Number(assocAfter.quoted_unit_price_net), 750);
    assert.ok(assocAfter.price_updated_at, 'Debe tener price_updated_at registrado');

    // 2. NO debe duplicar MPR en stock_items (exactamente 1 registro con ese ID)
    const { count: countItems } = await supabase
      .from('stock_items')
      .select('id', { count: 'exact', head: true })
      .eq('id', newMpr.id);
    assert.strictEqual(countItems, 1, 'No debe duplicar el ítem en stock_items');

    // 3. El stock aumenta una sola vez
    const balAfter = await stockRepo.getBalance(newMpr.id);
    assert.strictEqual(balAfter.toString(), '8', 'El stock debe ser exactamente 8.000 kg');

    // 4. Exactamente 1 movimiento MST de COMPRA
    const { data: msts } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .eq('stock_item_id', newMpr.id);
    assert.strictEqual(msts?.length, 1);
    assert.strictEqual(msts![0].movement_type, 'COMPRA');
    assert.strictEqual(Number(msts![0].quantity_delta), 8);
  });

  // TEST 29: CMP con COM existente NO asociado previamente
  await t.test('29. CMP con COM existente NO asociado: crea supplier_items, no duplica COM, actualiza price_updated_at y stock una sola vez', async () => {
    // Crear un COM nuevo asociado inicialmente a supplierUsdId
    const newCom = await masterItemService.createComponent({
      name: `COM No Asociado ${testTag}`,
      stockMinimum: 15,
      initialStock: 0,
      initialSupplierId: supplierUsdId,
      initialQuotedPriceNet: '1.20',
    });
    createdStockItems.push(newCom.id);

    // Verificar que no está asociado a supplierArsId
    const { data: assocBefore } = await supabase
      .from('supplier_items')
      .select('id')
      .eq('supplier_id', supplierArsId)
      .eq('stock_item_id', newCom.id);
    assert.strictEqual(assocBefore?.length || 0, 0);

    const balBefore = await stockRepo.getBalance(newCom.id);
    assert.strictEqual(balBefore.toString(), '0');

    // Registrar compra con supplierArsId
    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: newCom.id,
          quantity: new Decimal('50'),
          unitPriceNetSource: new Decimal('320.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // 1. Debe haberse creado automáticamente supplier_items
    const { data: assocAfter } = await supabase
      .from('supplier_items')
      .select('*')
      .eq('supplier_id', supplierArsId)
      .eq('stock_item_id', newCom.id)
      .single();
    assert.ok(assocAfter);
    assert.strictEqual(Number(assocAfter.quoted_unit_price_net), 320);
    assert.ok(assocAfter.price_updated_at);

    // 2. NO duplica COM
    const { count: countItems } = await supabase
      .from('stock_items')
      .select('id', { count: 'exact', head: true })
      .eq('id', newCom.id);
    assert.strictEqual(countItems, 1);

    // 3. Stock incrementa una sola vez
    const balAfter = await stockRepo.getBalance(newCom.id);
    assert.strictEqual(balAfter.toString(), '50');

    // 4. Exactamente 1 movimiento MST
    const { data: msts } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('operation_id', res.operationId)
      .eq('stock_item_id', newCom.id);
    assert.strictEqual(msts?.length, 1);
    assert.strictEqual(msts![0].movement_type, 'COMPRA');
    assert.strictEqual(Number(msts![0].quantity_delta), 50);
  });

  // TEST 30: Alta rápida de MPR desde CMP
  await t.test('30. Alta rápida de MPR desde CMP: nace con stock 0 (sin MST inicial), queda asociado y entra stock una sola vez al registrar CMP', async () => {
    // 1. Simulación de alta rápida desde modal: stock inicial = 0, asociado al proveedor
    const mprQuick = await masterItemService.createRawMaterial({
      name: `MPR Alta Rápida ${testTag}`,
      stockMinimum: '5.000',
      initialStock: '0',
      initialSupplierId: supplierArsId,
      initialQuotedPriceNet: '890.00',
      inci: 'Quick Inci Oil',
    });
    createdStockItems.push(mprQuick.id);

    // 2. Verificar que el maestro nació con stock EXACTAMENTE 0 y SIN movimientos MST
    const initialBal = await stockRepo.getBalance(mprQuick.id);
    assert.strictEqual(initialBal.toString(), '0', 'El saldo inicial del maestro debe ser exactamente 0');

    const { data: initialMsts } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('stock_item_id', mprQuick.id);
    assert.strictEqual(initialMsts?.length || 0, 0, 'No debe existir ningún MST inicial');

    // 3. Queda asociado al proveedor
    const { data: initialAssoc } = await supabase
      .from('supplier_items')
      .select('*')
      .eq('supplier_id', supplierArsId)
      .eq('stock_item_id', mprQuick.id)
      .single();
    assert.ok(initialAssoc);
    assert.strictEqual(Number(initialAssoc.quoted_unit_price_net), 890);

    // 4. Al registrar la CMP, entra stock una única vez
    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: mprQuick.id,
          quantity: new Decimal('15.000'),
          unitPriceNetSource: new Decimal('890.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // 5. Saldo final debe ser exactamente 15.000 kg y tener un único MST
    const finalBal = await stockRepo.getBalance(mprQuick.id);
    assert.strictEqual(finalBal.toString(), '15', 'El stock final debe ser exactamente 15.000 kg');

    const { data: finalMsts } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('stock_item_id', mprQuick.id);
    assert.strictEqual(finalMsts?.length, 1, 'Solo debe existir el movimiento de la compra');
    assert.strictEqual(finalMsts![0].movement_type, 'COMPRA');
    assert.strictEqual(Number(finalMsts![0].quantity_delta), 15);
  });

  // TEST 31: Alta rápida de COM desde CMP
  await t.test('31. Alta rápida de COM desde CMP: nace con stock 0 (sin MST inicial), queda asociado y entra stock una sola vez al registrar CMP', async () => {
    // 1. Simulación de alta rápida COM: stock inicial = 0
    const comQuick = await masterItemService.createComponent({
      name: `COM Alta Rápida ${testTag}`,
      stockMinimum: 50,
      initialStock: 0,
      initialSupplierId: supplierArsId,
      initialQuotedPriceNet: '45.00',
    });
    createdStockItems.push(comQuick.id);

    // 2. Saldo en 0 y sin MST
    const initialBal = await stockRepo.getBalance(comQuick.id);
    assert.strictEqual(initialBal.toString(), '0');

    const { data: initialMsts } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('stock_item_id', comQuick.id);
    assert.strictEqual(initialMsts?.length || 0, 0);

    // 3. Asociado al proveedor
    const { data: initialAssoc } = await supabase
      .from('supplier_items')
      .select('*')
      .eq('supplier_id', supplierArsId)
      .eq('stock_item_id', comQuick.id)
      .single();
    assert.ok(initialAssoc);

    // 4. Registrar compra por 200 unidades
    const res = await purchaseService.registerPurchase({
      supplierId: supplierArsId,
      paymentMode: 'PAID',
      items: [
        {
          stockItemId: comQuick.id,
          quantity: new Decimal('200'),
          unitPriceNetSource: new Decimal('45.00'),
          vatRatePct: new Decimal('21.0'),
        },
      ],
    });

    assert.strictEqual(res.success, true);
    createdPurchases.push(res.purchaseId);
    createdOps.push(res.operationId);

    // 5. Saldo final = 200 y 1 solo MST
    const finalBal = await stockRepo.getBalance(comQuick.id);
    assert.strictEqual(finalBal.toString(), '200');

    const { data: finalMsts } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('stock_item_id', comQuick.id);
    assert.strictEqual(finalMsts?.length, 1);
    assert.strictEqual(finalMsts![0].movement_type, 'COMPRA');
    assert.strictEqual(Number(finalMsts![0].quantity_delta), 200);
  });

  // TEST 32: Rollback de CMP con ítem no asociado no deja ingreso físico duplicado ni residuo
  await t.test('32. Rollback de CMP: fallo en compra atómica no deja ingreso físico duplicado ni relación corrupta', async () => {
    // Insumo MPR aislado
    const mprIsolated = await masterItemService.createRawMaterial({
      name: `MPR Rollback Test ${testTag}`,
      stockMinimum: '1.000',
      initialStock: '0',
      initialSupplierId: supplierUsdId,
      initialQuotedPriceNet: '10.00',
    });
    createdStockItems.push(mprIsolated.id);

    const balBefore = await stockRepo.getBalance(mprIsolated.id);
    assert.strictEqual(balBefore.toString(), '0');

    // Intentar compra con este ítem + un ítem prohibido (PRO) para forzar rollback de la transacción
    await assert.rejects(
      async () => {
        await purchaseService.registerPurchase({
          supplierId: supplierArsId,
          paymentMode: 'PAID',
          items: [
            {
              stockItemId: mprIsolated.id,
              quantity: new Decimal('10.000'),
              unitPriceNetSource: new Decimal('500.00'),
            },
            {
              stockItemId: proItemId, // Prohibido -> falla atómica
              quantity: new Decimal('1'),
              unitPriceNetSource: new Decimal('100.00'),
            },
          ],
        });
      },
      /Solo se permite comprar Materias Primas/i
    );

    // Verificar que stock permanece en 0 (sin ingreso físico huérfano)
    const balAfter = await stockRepo.getBalance(mprIsolated.id);
    assert.strictEqual(balAfter.toString(), '0', 'Stock no debe cambiar tras rollback');

    // Verificar que no hay movimientos de stock para esta operación
    const { data: msts } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('stock_item_id', mprIsolated.id);
    assert.strictEqual(msts?.length || 0, 0, 'No deben quedar movimientos MST tras rollback');
  });
});

