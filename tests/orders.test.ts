import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { OrderDomainService } from '../src/services/order.service';
import { OrderRepository } from '../src/repositories/order.repository';
import { CustomerRepository } from '../src/repositories/customer.repository';
import { ProductRepository } from '../src/repositories/product.repository';
import { PriceListRepository } from '../src/repositories/price-list.repository';
import { StockRepository } from '../src/repositories/stock.repository';
import { Decimal } from '../src/domain/decimal';
import type { Database } from '../src/database/types';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('FASE 10 — PEDIDOS: Pruebas integrales de ciclo de vida de Pedido Abierto', async (t) => {
  const orderRepo = new OrderRepository(supabase);
  const customerRepo = new CustomerRepository(supabase);
  const productRepo = new ProductRepository(supabase);
  const priceListRepo = new PriceListRepository(supabase);
  const stockRepo = new StockRepository(supabase);
  const orderService = new OrderDomainService(orderRepo);

  const testTag = `P10_${Date.now()}`;
  let customerId: string;
  let salonListId: string;
  let ecommerceListId: string;
  let publicListId: string;

  let pro1Id: string;
  let pro2Id: string;
  let proNoPriceId: string;

  const createdOrderIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdProductIds: string[] = [];

  t.before(async () => {
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

    // 2. Crear Cliente con descuentos: 30%, 10%, 5%
    const cust = await customerRepo.create({
      name: `Cliente Pedidos ${testTag}`,
      address: 'Calle Falsa 123',
      locality: 'Morón',
      province: 'Buenos Aires',
      phone: '1144556677',
      transportName: 'Expreso Steffen',
      discount1Pct: 30,
      discount2Pct: 10,
      discount3Pct: 5,
    });
    customerId = cust.id;
    createdCustomerIds.push(customerId);

    // Asignar deuda previa de $50.000 en su cuenta corriente
    await supabase
      .from('financial_accounts')
      .update({ current_balance: 50000 })
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE');

    // Obtener un base_product para asociar a los PRO
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

    // 3. Crear Producto PRO1 (0.250 kg)
    const { data: si1, error: si1Err } = await supabase
      .from('stock_items')
      .insert({
        code: `PRO1_${testTag}`,
        name: `Producto Test 1 ${testTag}`,
        item_type: 'PRO',
        unit_type: 'UNIT',
        stock_minimum: 10,
        active: true,
      })
      .select()
      .single();
    assert.ok(si1 && !si1Err, `Error creando stock_item PRO1: ${si1Err?.message}`);
    pro1Id = si1.id;
    createdProductIds.push(pro1Id);

    await supabase.from('products').insert({
      stock_item_id: pro1Id,
      base_product_id: baseProdId,
      weight_kg: 0.25,
      presentation: 'Pomo 250g',
    });

    // Crear balance inicial de 100 unidades en stock_balances
    await supabase.from('stock_balances').insert({
      stock_item_id: pro1Id,
      quantity: 100,
    });

    // Precios PRO1: Salón $10.000, Ecommerce $12.000, Público $15.000
    await priceListRepo.setProductPrice(salonListId, pro1Id, 10000);
    await priceListRepo.setProductPrice(ecommerceListId, pro1Id, 12000);
    await priceListRepo.setProductPrice(publicListId, pro1Id, 15000);

    // 4. Crear Producto PRO2 (0.500 kg)
    const { data: si2, error: si2Err } = await supabase
      .from('stock_items')
      .insert({
        code: `PRO2_${testTag}`,
        name: `Producto Test 2 ${testTag}`,
        item_type: 'PRO',
        unit_type: 'UNIT',
        stock_minimum: 10,
        active: true,
      })
      .select()
      .single();
    assert.ok(si2 && !si2Err, `Error creando stock_item PRO2: ${si2Err?.message}`);
    pro2Id = si2.id;
    createdProductIds.push(pro2Id);

    await supabase.from('products').insert({
      stock_item_id: pro2Id,
      base_product_id: baseProdId,
      weight_kg: 0.5,
      presentation: 'Botella 500ml',
    });

    await supabase.from('stock_balances').insert({
      stock_item_id: pro2Id,
      quantity: 50,
    });

    // Precios PRO2: Salón $20.000, Ecommerce $24.000, Público $30.000
    await priceListRepo.setProductPrice(salonListId, pro2Id, 20000);
    await priceListRepo.setProductPrice(ecommerceListId, pro2Id, 24000);
    await priceListRepo.setProductPrice(publicListId, pro2Id, 30000);

    // 5. Crear Producto PRO3 sin precio en Salón
    const { data: si3, error: si3Err } = await supabase
      .from('stock_items')
      .insert({
        code: `PRO3_${testTag}`,
        name: `Producto Sin Precio ${testTag}`,
        item_type: 'PRO',
        unit_type: 'UNIT',
        stock_minimum: 10,
        active: true,
      })
      .select()
      .single();
    assert.ok(si3 && !si3Err, `Error creando stock_item PRO3: ${si3Err?.message}`);
    proNoPriceId = si3.id;
    createdProductIds.push(proNoPriceId);

    await supabase.from('products').insert({
      stock_item_id: proNoPriceId,
      base_product_id: baseProdId,
      weight_kg: 0.1,
      presentation: 'Sachet 100g',
    });
  });

  t.after(async () => {
    // Limpieza de datos de prueba
    if (createdOrderIds.length > 0) {
      await supabase.from('order_items').delete().in('order_id', createdOrderIds);
      await supabase.from('order_discount_steps').delete().in('order_id', createdOrderIds);
      await supabase.from('orders').delete().in('id', createdOrderIds);
    }

    if (createdProductIds.length > 0) {
      await supabase.from('product_price_versions').delete().in('product_id', createdProductIds);
      await supabase.from('stock_balances').delete().in('stock_item_id', createdProductIds);
      await supabase.from('products').delete().in('stock_item_id', createdProductIds);
      await supabase.from('stock_items').delete().in('id', createdProductIds);
    }

    if (createdCustomerIds.length > 0) {
      await supabase.from('financial_accounts').delete().in('customer_id', createdCustomerIds);
      await supabase.from('customers').delete().in('id', createdCustomerIds);
    }
  });

  let createdOrder1Id: string;
  let createdOrder1Code: string;

  // 1. crear PED cliente registrado
  // 2. genera PEDxxxx secuencial
  // 3. estado inicial ABIERTO
  // 4. varias líneas
  // 5. precio Lista Salón
  // 6. descuentos sucesivos correctos
  // 12. cálculo peso
  // 13. saldo anterior cliente visible/correcto
  // 14. Total pedido correcto
  // 15. Total a cobrar correcto
  // 38. Bultos (package_count)
  await t.test('1-6, 12-15, 38. Crear PED cliente registrado, secuencia PED, precios Salón, descuentos y totales', async () => {
    const res = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      packageCount: 4,
      items: [
        { productId: pro1Id, requestedQuantity: 2 }, // 2 * $10.000 = $20.000 (peso: 2 * 0.25 = 0.500 kg)
        { productId: pro2Id, requestedQuantity: 3 }, // 3 * $20.000 = $60.000 (peso: 3 * 0.50 = 1.500 kg)
      ],
    });

    assert.ok(res.id);
    createdOrder1Id = res.id;
    createdOrder1Code = res.code;
    createdOrderIds.push(res.id);

    // 2. Código PEDxxxx
    assert.match(res.code, /^PED\d+$/);

    // 3. Estado inicial ABIERTO
    assert.strictEqual(res.status, 'OPEN');

    // Consultar el pedido enriquecido
    const order = await orderService.getOrder(res.id);
    assert.ok(order);
    assert.strictEqual(order.status, 'OPEN');
    assert.strictEqual(order.packageCount, 4);

    // 4. Varias líneas
    assert.strictEqual(order.items.length, 2);

    // 5. Precios Salón congelados
    const item1 = order.items.find((i) => i.productId === pro1Id);
    assert.ok(item1);
    assert.strictEqual(item1.unitPriceArsSnapshot.toString(), '10000');

    const item2 = order.items.find((i) => i.productId === pro2Id);
    assert.ok(item2);
    assert.strictEqual(item2.unitPriceArsSnapshot.toString(), '20000');

    // 6. Descuentos sucesivos: 30%, 10%, 5% sobre Subtotal $80.000
    // Subtotal = 20000 + 60000 = 80000
    // Paso 1 (30%): 80000 * 0.70 = 56000
    // Paso 2 (10%): 56000 * 0.90 = 50400
    // Paso 3 (5%):  50400 * 0.95 = 47880
    assert.strictEqual(order.totals.subtotalArs.toString(), '80000');
    assert.strictEqual(order.totals.totalOrderArs.toString(), '47880');
    assert.strictEqual(order.totals.totalDiscountArs.toString(), '32120');

    // 12. Cálculo de peso: 0.500 + 1.500 = 2.000 kg
    assert.strictEqual(order.totals.totalWeightKg.toString(), '2');

    // 13. Saldo anterior del cliente: $50.000
    assert.strictEqual(order.totals.priorBalanceArs.toString(), '50000');

    // 15. Total a cobrar = Total pedido (47880) + Saldo anterior (50000) = 97880
    assert.strictEqual(order.totals.totalToCollectArs.toString(), '97880');
  });

  // 7. precio congelado después de cambiar Lista
  await t.test('7. Precio congelado: si cambia la lista después de crear el PED, el pedido conserva sus precios originales', async () => {
    // Modificar precio de PRO1 en Lista Salón de $10.000 a $15.000
    await priceListRepo.setProductPrice(salonListId, pro1Id, 15000);

    // Consultar el pedido creado previamente
    const order = await orderService.getOrder(createdOrder1Id);
    assert.ok(order);

    const item1 = order.items.find((i) => i.productId === pro1Id);
    assert.ok(item1);
    assert.strictEqual(item1.unitPriceArsSnapshot.toString(), '10000', 'El precio debe mantenerse en $10.000');
    assert.strictEqual(order.totals.subtotalArs.toString(), '80000');
    assert.strictEqual(order.totals.totalOrderArs.toString(), '47880');
  });

  // 8. descuentos congelados después de editar Cliente
  await t.test('8. Descuentos congelados: si se modifican los descuentos del cliente, el PED abierto conserva los originales', async () => {
    // Cambiar descuentos en la ficha del cliente a 50%, 0%, 0%
    await customerRepo.update(customerId, {
      discount1Pct: 50,
      discount2Pct: 0,
      discount3Pct: 0,
    });

    // Consultar el pedido creado previamente
    const order = await orderService.getOrder(createdOrder1Id);
    assert.ok(order);
    assert.strictEqual(order.totals.totalOrderArs.toString(), '47880', 'El total con descuentos debe seguir en $47.880');
    assert.strictEqual(order.discountSteps.length, 3);
  });

  // 9. producto sin precio rechazado
  await t.test('9. Producto sin precio en la lista correspondiente es rechazado', async () => {
    await assert.rejects(
      async () => {
        await orderService.createOrder({
          customerSource: 'REGISTERED_CUSTOMER',
          customerId,
          items: [{ productId: proNoPriceId, requestedQuantity: 1 }],
        });
      },
      /no posee precio vigente/i
    );
  });

  // 10. cantidad <= 0 rechazada
  await t.test('10. Cantidad solicitada <= 0 es rechazada', async () => {
    await assert.rejects(
      async () => {
        await orderService.createOrder({
          customerSource: 'REGISTERED_CUSTOMER',
          customerId,
          items: [{ productId: pro1Id, requestedQuantity: 0 }],
        });
      },
      /mayor a 0/i
    );
  });

  // 11. cantidad PRO entera (rechaza decimales)
  await t.test('11. Cantidad solicitada fraccionaria es rechazada para PRO', async () => {
    await assert.rejects(
      async () => {
        await orderService.createOrder({
          customerSource: 'REGISTERED_CUSTOMER',
          customerId,
          items: [{ productId: pro1Id, requestedQuantity: 2.5 as any }],
        });
      },
      /número entero/i
    );
  });

  // 16. pedido ML usa Ecommerce
  // 17. ML no crea CLI
  // 18. ML descuento manual excepcional
  await t.test('16-18. Pedido Mercado Libre usa Lista Ecommerce, sin crear CLI, saldo 0 y admite descuento manual', async () => {
    const custCountBefore = (await customerRepo.listAll(true)).length;

    const res = await orderService.createOrder({
      customerSource: 'MERCADO_LIBRE',
      manualDiscountPercent: 15,
      items: [{ productId: pro1Id, requestedQuantity: 1 }],
    });
    createdOrderIds.push(res.id);

    // 17. No crea cliente CLI
    const custCountAfter = (await customerRepo.listAll(true)).length;
    assert.strictEqual(custCountAfter, custCountBefore);

    const order = await orderService.getOrder(res.id);
    assert.ok(order);
    assert.strictEqual(order.customerSource, 'MERCADO_LIBRE');
    assert.strictEqual(order.customerId, null);

    // 16. Precio de Ecommerce ($12.000)
    assert.strictEqual(order.items[0].unitPriceArsSnapshot.toString(), '12000');
    assert.strictEqual(order.totals.subtotalArs.toString(), '12000');

    // 18. Descuento manual de 15%: 12000 * 0.85 = 10200
    assert.strictEqual(order.totals.totalOrderArs.toString(), '10200');
    assert.strictEqual(order.totals.priorBalanceArs.toString(), '0');
    assert.strictEqual(order.totals.totalToCollectArs.toString(), '10200');
  });

  // 19. Consumidor Final usa Público
  // 20. CF no crea CLI
  // 21. CF datos manuales
  // 22. CF descuento manual
  await t.test('19-22. Pedido Consumidor Final usa Lista Público, sin CLI, datos manuales persistidos y descuento manual', async () => {
    const custCountBefore = (await customerRepo.listAll(true)).length;

    const res = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      recipientName: 'Carlos Consumidor',
      address: 'San Martín 500',
      locality: 'Quilmes',
      province: 'Buenos Aires',
      phone: '1199887766',
      transportName: 'Mensajería Express',
      manualDiscountPercent: 10,
      packageCount: 1,
      items: [{ productId: pro1Id, requestedQuantity: 2 }],
    });
    createdOrderIds.push(res.id);

    // 20. No crea CLI
    const custCountAfter = (await customerRepo.listAll(true)).length;
    assert.strictEqual(custCountAfter, custCountBefore);

    const order = await orderService.getOrder(res.id);
    assert.ok(order);
    assert.strictEqual(order.customerSource, 'CONSUMER_FINAL');
    assert.strictEqual(order.customerId, null);

    // 21. Datos manuales persistidos
    assert.strictEqual(order.recipientName, 'Carlos Consumidor');
    assert.strictEqual(order.address, 'San Martín 500');
    assert.strictEqual(order.locality, 'Quilmes');
    assert.strictEqual(order.province, 'Buenos Aires');
    assert.strictEqual(order.phone, '1199887766');
    assert.strictEqual(order.transportName, 'Mensajería Express');

    // 19. Precio de Público ($15.000)
    assert.strictEqual(order.items[0].unitPriceArsSnapshot.toString(), '15000');
    assert.strictEqual(order.totals.subtotalArs.toString(), '30000');

    // 22. Descuento manual de 10%: 30000 * 0.90 = 27000
    assert.strictEqual(order.totals.totalOrderArs.toString(), '27000');
    assert.strictEqual(order.totals.priorBalanceArs.toString(), '0');
    assert.strictEqual(order.totals.totalToCollectArs.toString(), '27000');
  });

  // 23. editar cantidad conserva precio snapshot
  await t.test('23. Editar cantidad en pedido abierto conserva el precio snapshot congelado', async () => {
    // Editar createdOrder1Id: cambiar cantidad de PRO1 de 2 a 5
    await orderService.updateOrder(createdOrder1Id, {
      items: [
        { productId: pro1Id, requestedQuantity: 5 }, // 5 * $10.000 = $50.000 (aún habiendo cambiado la lista a $15.000)
        { productId: pro2Id, requestedQuantity: 3 }, // 3 * $20.000 = $60.000
      ],
    });

    const order = await orderService.getOrder(createdOrder1Id);
    assert.ok(order);
    const item1 = order.items.find((i) => i.productId === pro1Id);
    assert.ok(item1);
    assert.strictEqual(item1.unitPriceArsSnapshot.toString(), '10000');
    assert.strictEqual(item1.requestedQuantity, 5);

    // Nuevo Subtotal: 50.000 + 60.000 = 110.000
    // Descuentos originales: 110.000 * 0.70 * 0.90 * 0.95 = 65.835
    assert.strictEqual(order.totals.subtotalArs.toString(), '110000');
    assert.strictEqual(order.totals.totalOrderArs.toString(), '65835');
  });

  // 24. agregar y eliminar línea
  await t.test('24. Agregar y eliminar línea en pedido abierto recalcula importes y pesos', async () => {
    // Dejar únicamente PRO2 con 4 unidades
    await orderService.updateOrder(createdOrder1Id, {
      items: [
        { productId: pro2Id, requestedQuantity: 4 }, // 4 * $20.000 = $80.000
      ],
    });

    const order = await orderService.getOrder(createdOrder1Id);
    assert.ok(order);
    assert.strictEqual(order.items.length, 1);
    assert.strictEqual(order.items[0].productId, pro2Id);
    assert.strictEqual(order.totals.subtotalArs.toString(), '80000');
    // 4 * 0.500 kg = 2.000 kg
    assert.strictEqual(order.totals.totalWeightKg.toString(), '2');
  });

  // 25. AG menor permitido
  // 26. AG igual permitido
  // 27. AG mayor permitido
  await t.test('25-27. AG menor, igual y mayor a cantidad solicitada son permitidos', async () => {
    // AG menor (solicitado 10, AG 7)
    await orderService.updateOrder(createdOrder1Id, {
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: 7 }],
    });
    let ord = await orderService.getOrder(createdOrder1Id);
    assert.strictEqual(ord?.items[0].agQuantity, 7);
    assert.strictEqual(ord?.totals.totalWeightKg.toString(), '5');

    // AG igual (solicitado 10, AG 10)
    await orderService.updateOrder(createdOrder1Id, {
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: 10 }],
    });
    ord = await orderService.getOrder(createdOrder1Id);
    assert.strictEqual(ord?.items[0].agQuantity, 10);
    assert.strictEqual(ord?.totals.totalWeightKg.toString(), '5');

    // AG mayor (solicitado 10, AG 14)
    await orderService.updateOrder(createdOrder1Id, {
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: 14 }],
    });
    ord = await orderService.getOrder(createdOrder1Id);
    assert.strictEqual(ord?.items[0].agQuantity, 14);
    assert.strictEqual(ord?.totals.totalWeightKg.toString(), '5');
  });

  // Normativa definitiva de Peso del Pedido:
  // Peso total PEDIDO = Σ(requested_quantity × product.weight_kg) SIEMPRE.
  // AG NO interviene en el peso del Pedido.
  await t.test('Normativa Peso Pedido: Σ(requested_quantity × weight_kg) SIEMPRE, AG nunca altera peso', async () => {
    // pro2Id tiene peso 0.500 kg
    // 1. requested = 10, AG null -> peso usa 10 (10 * 0.500 = 5.000 kg)
    const orderTest = await orderService.createOrder({
      customerSource: 'CONSUMER_FINAL',
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: null }],
    });
    createdOrderIds.push(orderTest.id);

    let ord = await orderService.getOrder(orderTest.id);
    assert.ok(ord);
    assert.strictEqual(ord.totals.totalWeightKg.toString(), '5');

    // 2. requested = 10, AG 7 -> peso sigue usando 10 (5.000 kg)
    await orderService.updateOrder(orderTest.id, {
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: 7 }],
    });
    ord = await orderService.getOrder(orderTest.id);
    assert.ok(ord);
    assert.strictEqual(ord.items[0].agQuantity, 7);
    assert.strictEqual(ord.totals.totalWeightKg.toString(), '5');

    // 3. requested = 10, AG 10 -> peso sigue usando 10 (5.000 kg)
    await orderService.updateOrder(orderTest.id, {
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: 10 }],
    });
    ord = await orderService.getOrder(orderTest.id);
    assert.ok(ord);
    assert.strictEqual(ord.items[0].agQuantity, 10);
    assert.strictEqual(ord.totals.totalWeightKg.toString(), '5');

    // 4. requested = 10, AG 12 -> peso sigue usando 10 (5.000 kg)
    await orderService.updateOrder(orderTest.id, {
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: 12 }],
    });
    ord = await orderService.getOrder(orderTest.id);
    assert.ok(ord);
    assert.strictEqual(ord.items[0].agQuantity, 12);
    assert.strictEqual(ord.totals.totalWeightKg.toString(), '5');

    // 5. editar únicamente AG NO cambia peso del Pedido (de 12 a 25)
    await orderService.updateOrder(orderTest.id, {
      items: [{ productId: pro2Id, requestedQuantity: 10, agQuantity: 25 }],
    });
    ord = await orderService.getOrder(orderTest.id);
    assert.ok(ord);
    assert.strictEqual(ord.items[0].agQuantity, 25);
    assert.strictEqual(ord.totals.totalWeightKg.toString(), '5');

    // 6. editar requested_quantity SÍ recalcula peso (de 10 a 16 -> 16 * 0.500 = 8.000 kg)
    await orderService.updateOrder(orderTest.id, {
      items: [{ productId: pro2Id, requestedQuantity: 16, agQuantity: 25 }],
    });
    ord = await orderService.getOrder(orderTest.id);
    assert.ok(ord);
    assert.strictEqual(ord.items[0].requestedQuantity, 16);
    assert.strictEqual(ord.totals.totalWeightKg.toString(), '8');

    // 7. múltiples líneas suman requested_quantity × weight_kg de cada PRO
    // pro1Id: 0.250 kg, requested = 4, AG = 1  -> 4 * 0.250 = 1.000 kg
    // pro2Id: 0.500 kg, requested = 6, AG = 15 -> 6 * 0.500 = 3.000 kg
    // Total peso esperado: 1.000 + 3.000 = 4.000 kg
    await orderService.updateOrder(orderTest.id, {
      items: [
        { productId: pro1Id, requestedQuantity: 4, agQuantity: 1 },
        { productId: pro2Id, requestedQuantity: 6, agQuantity: 15 },
      ],
    });
    ord = await orderService.getOrder(orderTest.id);
    assert.ok(ord);
    assert.strictEqual(ord.totals.totalWeightKg.toString(), '4');
  });

  // 28. borrar Pedido abierto
  await t.test('28. Borrar pedido abierto marca estado CANCELLED y desaparece del listado de abiertos', async () => {
    const listBefore = await orderService.listOpenOrders();
    assert.ok(listBefore.some((o) => o.id === createdOrder1Id));

    const cancelRes = await orderService.cancelOrder(createdOrder1Id);
    assert.strictEqual(cancelRes.status, 'CANCELLED');

    const listAfter = await orderService.listOpenOrders();
    assert.ok(!listAfter.some((o) => o.id === createdOrder1Id));

    const ord = await orderService.getOrder(createdOrder1Id);
    assert.strictEqual(ord?.status, 'CANCELLED');
  });

  // 29-34. REGLAS CRÍTICAS: Crear, editar y borrar pedido NO modifica stock ni cuentas ni genera movimientos
  await t.test('29-34. REGLA CRÍTICA: Ciclo de vida del Pedido NO toca stock, NO genera MST, NO genera MOV ni toca cuentas', async () => {
    const stockBefore = await stockRepo.getBalance(pro1Id);

    const { data: mstsBefore } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('stock_item_id', pro1Id);

    const { data: movsBefore } = await supabase
      .from('patrimonial_movements')
      .select('id');

    const { data: accBefore } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();

    // 1. Crear nuevo pedido
    const newPed = await orderService.createOrder({
      customerSource: 'REGISTERED_CUSTOMER',
      customerId,
      items: [{ productId: pro1Id, requestedQuantity: 10, agQuantity: 15 }],
    });
    createdOrderIds.push(newPed.id);

    // Verificar stock, MST, MOV, cuentas intactos
    let stockAfter = await stockRepo.getBalance(pro1Id);
    assert.strictEqual(stockAfter.toString(), stockBefore.toString(), '29. Crear pedido no modifica stock');

    // 2. Editar pedido
    await orderService.updateOrder(newPed.id, {
      items: [{ productId: pro1Id, requestedQuantity: 30, agQuantity: 50 }],
    });
    stockAfter = await stockRepo.getBalance(pro1Id);
    assert.strictEqual(stockAfter.toString(), stockBefore.toString(), '30. Editar pedido no modifica stock');

    // 3. Borrar pedido
    await orderService.cancelOrder(newPed.id);
    stockAfter = await stockRepo.getBalance(pro1Id);
    assert.strictEqual(stockAfter.toString(), stockBefore.toString(), '31. Borrar pedido no modifica stock');

    // 32. No genera MST
    const { data: mstsAfter } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('stock_item_id', pro1Id);
    assert.strictEqual(mstsAfter?.length || 0, mstsBefore?.length || 0, '32. No se generaron MST');

    // 33. No genera MOV
    const { data: movsAfter } = await supabase
      .from('patrimonial_movements')
      .select('id');
    assert.strictEqual(movsAfter?.length || 0, movsBefore?.length || 0, '33. No se generaron MOV');

    // 34. No modifica cuentas patrimoniales
    const { data: accAfter } = await supabase
      .from('financial_accounts')
      .select('current_balance')
      .eq('customer_id', customerId)
      .eq('account_type', 'CUSTOMER_RECEIVABLE')
      .single();
    assert.strictEqual(accAfter?.current_balance, accBefore?.current_balance, '34. No se modifica deuda cliente');
  });

  // 35. concurrencia genera PED únicos
  await t.test('35. Creación concurrente de pedidos genera códigos PED únicos sin colisiones', async () => {
    const promises = [1, 2, 3, 4, 5].map(() =>
      orderService.createOrder({
        customerSource: 'MERCADO_LIBRE',
        items: [{ productId: pro2Id, requestedQuantity: 1 }],
      })
    );

    const results = await Promise.all(promises);
    for (const r of results) {
      createdOrderIds.push(r.id);
    }

    const codes = results.map((r) => r.code);
    const uniqueCodes = new Set(codes);
    assert.strictEqual(uniqueCodes.size, 5, 'Los 5 códigos generados concurrentemente deben ser distintos');
    for (const c of codes) {
      assert.match(c, /^PED\d+$/);
    }
  });

  // 36. rollback tardío sin pedido parcial
  await t.test('36. Rollback tardío: fallo en producto sin precio no deja cabecera ni líneas parciales', async () => {
    const ordersCountBefore = await orderRepo.countOpenOrders();

    await assert.rejects(
      async () => {
        await orderService.createOrder({
          customerSource: 'REGISTERED_CUSTOMER',
          customerId,
          items: [
            { productId: pro1Id, requestedQuantity: 2 }, // Válido
            { productId: proNoPriceId, requestedQuantity: 1 }, // Inválido -> causa rollback atómico
          ],
        });
      },
      /no posee precio vigente/i
    );

    const ordersCountAfter = await orderRepo.countOpenOrders();
    assert.strictEqual(ordersCountAfter, ordersCountBefore, 'No deben quedar pedidos creados tras rollback');
  });
});
