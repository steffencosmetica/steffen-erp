import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrderDetailDTO } from '../src/actions/order.dto';
import type { UpdateOrderInput } from '../src/actions/order.actions';
import {
  captureOrderSnapshot, draftFromOrder, isOrderDirty, isAddProductDirty,
  OrderManualSaveController, type OrderEditorDraft,
} from '../src/ui/orders/orderEditorState';

function detail(id = 'order-a'): OrderDetailDTO {
  return {
    id, code: 'PED0001', businessDate: '2026-10-20', formattedDate: '20/10/26', status: 'OPEN',
    customerSource: 'CONSUMER_FINAL', customerId: null, customerName: 'Consumidor Final', customerCode: null,
    customerAddress: null, customerTransport: null, priceListId: 'public-list', priceListName: 'Público',
    priceSnapshotAt: '2026-10-01T12:00:00Z', recipientName: 'Nombre', address: null, locality: null,
    province: null, phone: null, transportName: null, transportAddress: null, packageCount: 2, planningSortKey: '1',
    items: ['product-a', 'product-b'].map((productId, index) => ({
      id: `line-${index}`, productId, productCode: `P00${index}`, productName: productId,
      weightKg: '0.25', requestedQuantity: index + 1, agQuantity: null,
      unitPriceArsSnapshot: '100', formattedUnitPrice: '$ 100,00', totalPriceArs: '100', formattedTotalPrice: '$ 100,00', sortOrder: index,
    })),
    discountSteps: [], subtotalArs: '300', totalDiscountArs: '0', totalOrderArs: '300', priorBalanceArs: '0',
    totalToCollectArs: '300', totalWeightKg: '0.75', formattedSubtotal: '$ 300,00', formattedTotalDiscount: '$ 0,00',
    formattedTotalOrder: '$ 300,00', formattedPriorBalance: '$ 0,00', formattedTotalToCollect: '$ 300,00',
  };
}

function applyInput(base: OrderDetailDTO, input: UpdateOrderInput): OrderDetailDTO {
  return {
    ...base,
    packageCount: input.packageCount ?? null,
    recipientName: input.recipientName ?? base.recipientName,
    items: (input.items ?? base.items).map((item, index) => ({
      ...base.items[index], ...item, id: `server-new-${index}`, agQuantity: item.agQuantity ?? null,
      unitPriceArsSnapshot: '100',
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('Comparación semántica: carga limpia, cambios y reversión de cada campo', () => {
  const initial = draftFromOrder(detail());
  const confirmed = captureOrderSnapshot(initial);
  assert.equal(isOrderDirty(initial, confirmed), false);
  assert.equal(isOrderDirty(initial, null), false);
  const changes: OrderEditorDraft[] = [
    { ...initial, packageCount: '3' },
    { ...initial, packageCount: '' },
    { ...initial, items: [{ ...initial.items[0], requestedQuantity: 4 }, initial.items[1]] },
    { ...initial, items: [{ ...initial.items[0], agQuantity: 0 }, initial.items[1]] },
    { ...initial, items: [{ ...initial.items[0], agQuantity: 15 }, initial.items[1]] },
    { ...initial, items: [...initial.items].reverse() },
    { ...initial, items: [initial.items[0]] },
    { ...initial, items: [...initial.items, { productId: 'new', requestedQuantity: 1, agQuantity: null }] },
    ...(['recipientName', 'address', 'locality', 'province', 'phone', 'transportName'] as const).map((field) => ({ ...initial, [field]: 'Otro' })),
  ];
  for (const changed of changes) {
    assert.equal(isOrderDirty(changed, confirmed), true);
    assert.equal(isOrderDirty(draftFromOrder(detail()), confirmed), false);
  }
});

test('Snapshot independiente e inmutable: modificar borrador o DTO no altera referencia', () => {
  const original = detail();
  const draft = draftFromOrder(original);
  const confirmed = captureOrderSnapshot(draft);
  draft.items[0].requestedQuantity = 12;
  original.items[1].agQuantity = 9;
  assert.equal(confirmed.items[0].requestedQuantity, 1);
  assert.equal(confirmed.items[1].agQuantity, null);
  assert.equal(draft.items[1].agQuantity, null);
  assert.ok(Object.isFrozen(confirmed) && Object.isFrozen(confirmed.items) && Object.isFrozen(confirmed.items[0]));
});

test('Ignora IDs de línea, precios/derivados y estado visual; conserva orden y null vs cero', () => {
  const original = detail();
  const confirmed = captureOrderSnapshot(draftFromOrder(original));
  const changedPresentation = {
    ...original, formattedTotalOrder: '$ 999', totalOrderArs: '999', totalWeightKg: '99',
    items: original.items.map((item) => ({ ...item, id: `temporary-${item.id}`, unitPriceArsSnapshot: '999', formattedUnitPrice: '$ 999' })),
    theme: 'light', showAddProduct: true,
  };
  assert.equal(isOrderDirty(draftFromOrder(changedPresentation), confirmed), false);
  const zeroAg = draftFromOrder(original);
  zeroAg.items[0].agQuantity = 0;
  assert.equal(isOrderDirty(zeroAg, confirmed), true);
  zeroAg.items[0].agQuantity = null;
  assert.equal(isOrderDirty(zeroAg, confirmed), false);
});

test('Normalización semántica: bultos y textos; valores inválidos no se confunden con confirmado', () => {
  const draft = draftFromOrder(detail());
  const confirmed = captureOrderSnapshot(draft);
  assert.equal(isOrderDirty({ ...draft, packageCount: '02', recipientName: ' Nombre ' }, confirmed), false);
  assert.equal(isOrderDirty({ ...draft, packageCount: '2.5' }, confirmed), true);
  assert.equal(isOrderDirty({ ...draft, packageCount: '-1' }, confirmed), true);
  assert.equal(isOrderDirty({ ...draft, packageCount: 'texto' }, confirmed), true);
  const registered = { ...draft, customerSource: 'REGISTERED_CUSTOMER' as const };
  assert.equal(isOrderDirty({ ...registered, recipientName: 'Dato no editable' }, captureOrderSnapshot(registered)), false);
});

test('Borrador Agregar independiente: abrir no ensucia; escribir y revertir sí se detecta', () => {
  assert.equal(isAddProductDirty('', '1', ''), false);
  assert.equal(isAddProductDirty('', '01', ' '), false);
  assert.equal(isAddProductDirty('product-a', '1', ''), true);
  assert.equal(isAddProductDirty('', '', ''), true);
  assert.equal(isAddProductDirty('', '2', ''), true);
  assert.equal(isAddProductDirty('', '1', '0'), true);
  assert.equal(isAddProductDirty('', '1', ''), false);
});

test('Cargar y editar no persiste; Guardar confirma solo tras éxito y relee precio histórico', async () => {
  const base = detail();
  let persisted = base;
  const calls: string[] = [];
  const controller = new OrderManualSaveController({
    persist: async (id, input) => { calls.push(`save:${id}`); persisted = applyInput(base, input); return { success: true }; },
    reload: async (id) => { calls.push(`read:${id}`); return { success: true, data: persisted }; },
  });
  controller.load(base);
  const draft = draftFromOrder(base);
  draft.items[0].requestedQuantity = 4;
  draft.items[0].agQuantity = 15; // AG mayor a solicitado permanece válido.
  assert.deepEqual(calls, []);
  assert.equal(isOrderDirty(draft, controller.getSnapshot().confirmed), true);
  const result = await controller.save(draft);
  assert.equal(result.success, true);
  assert.deepEqual(calls, ['save:order-a', 'read:order-a']);
  assert.equal(controller.getSnapshot().orderId, base.id); // Sin cierre ni navegación.
  assert.equal(controller.getSnapshot().saving, false);
  assert.equal(isOrderDirty(draft, controller.getSnapshot().confirmed), false);
  if (result.success) assert.equal(result.detail.items[0].unitPriceArsSnapshot, '100');
});

test('Guardado pendiente: snapshot enviado independiente, bloqueo inmediato de doble envío y ediciones posteriores dirty', async () => {
  const base = detail();
  const request = deferred<{ success: boolean }>();
  let sent: UpdateOrderInput | undefined;
  let calls = 0;
  const controller = new OrderManualSaveController({
    persist: async (_id, input) => { calls++; sent = input; return request.promise; },
    reload: async () => ({ success: true, data: applyInput(base, sent!) }),
  });
  controller.load(base);
  const draft = draftFromOrder(base);
  draft.items[0].requestedQuantity = 4;
  const first = controller.save(draft);
  assert.equal(controller.getSnapshot().saving, true);
  const duplicate = await controller.save(draft);
  assert.equal(duplicate.success, false);
  if (!duplicate.success) assert.equal(duplicate.reason, 'busy');
  draft.items[0].requestedQuantity = 8;
  draft.items[1].agQuantity = 12;
  draft.packageCount = '7';
  draft.items = [...draft.items, { productId: 'new', requestedQuantity: 1, agQuantity: null }];
  assert.equal(sent!.items![0].requestedQuantity, 4);
  assert.equal(sent!.items!.length, 2);
  request.resolve({ success: true });
  assert.equal((await first).success, true);
  assert.equal(calls, 1);
  assert.equal(isOrderDirty(draft, controller.getSnapshot().confirmed), true);
  assert.equal(controller.getSnapshot().confirmed!.items[0].requestedQuantity, 4);
  assert.equal(draft.items[0].requestedQuantity, 8);
  assert.equal(draft.items.length, 3);
  assert.equal(isOrderDirty(draftFromOrder(applyInput(base, sent!)), controller.getSnapshot().confirmed), false);
});

test('Error de action conserva referencia y borrador, muestra fallo y permite reintento manual', async () => {
  const base = detail();
  let succeed = false;
  let persisted = base;
  let reads = 0;
  const controller = new OrderManualSaveController({
    persist: async (_id, input) => { persisted = applyInput(base, input); return { success: succeed, error: 'Validación rechazada' }; },
    reload: async () => { reads++; return { success: true, data: persisted }; },
  });
  controller.load(base);
  const reference = controller.getSnapshot().confirmed;
  const draft = { ...draftFromOrder(base), packageCount: '8' };
  const result = await controller.save(draft);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error, 'Validación rechazada');
  assert.equal(controller.getSnapshot().confirmed, reference);
  assert.equal(controller.getSnapshot().saving, false);
  assert.equal(reads, 0);
  assert.equal(draft.packageCount, '8');
  assert.equal(isOrderDirty(draft, reference), true);
  succeed = true;
  assert.equal((await controller.save(draft)).success, true);
  assert.equal(isOrderDirty(draft, controller.getSnapshot().confirmed), false);
});

test('Excepción inesperada de comunicación no simula éxito ni pierde borrador', async () => {
  const base = detail();
  const controller = new OrderManualSaveController({
    persist: async () => { throw new Error('Red interrumpida'); },
    reload: async () => { throw new Error('No debería leerse'); },
  });
  controller.load(base);
  const reference = controller.getSnapshot().confirmed;
  const draft = { ...draftFromOrder(base), packageCount: '9' };
  const result = await controller.save(draft);
  assert.equal(result.success, false);
  assert.equal(controller.getSnapshot().confirmed, reference);
  assert.equal(controller.getSnapshot().saving, false);
  assert.equal(isOrderDirty(draft, reference), true);
});

test('Persistencia exitosa con relectura fallida informa fase y no confirma detalle ficticio', async () => {
  const base = detail();
  const controller = new OrderManualSaveController({
    persist: async () => ({ success: true }),
    reload: async () => ({ success: false, error: 'Sin conexión' }),
  });
  controller.load(base);
  const reference = controller.getSnapshot().confirmed;
  const result = await controller.save({ ...draftFromOrder(base), packageCount: '6' });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.reason, 'reload');
    assert.match(result.error, /No se pudo confirmar.*escritura no se repetirá/);
  }
  assert.equal(controller.getSnapshot().confirmed, reference);
});

test('Respuesta de A después de seleccionar B no altera referencia, resultado ni saving de B', async () => {
  const request = deferred<{ success: boolean }>();
  let reads = 0;
  const controller = new OrderManualSaveController({
    persist: async () => request.promise,
    reload: async () => { reads++; return { success: true, data: detail() }; },
  });
  controller.load(detail());
  const first = controller.save({ ...draftFromOrder(detail()), packageCount: '6' });
  controller.clear();
  controller.load(detail('order-b'));
  const stateB = controller.getSnapshot();
  request.resolve({ success: true });
  const result = await first;
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.reason, 'stale');
  assert.equal(controller.getSnapshot(), stateB);
  assert.equal(reads, 0);
});

test('Respuesta de relectura antigua también se ignora y cerrar/reabrir no permite doble escritura', async () => {
  const read = deferred<{ success: boolean; data: OrderDetailDTO }>();
  const readStarted = deferred<void>();
  let writes = 0;
  const controller = new OrderManualSaveController({
    persist: async () => { writes++; return { success: true }; },
    reload: async () => { readStarted.resolve(); return read.promise; },
  });
  controller.load(detail());
  const first = controller.save({ ...draftFromOrder(detail()), packageCount: '6' });
  await readStarted.promise;
  controller.clear();
  controller.load(detail());
  assert.equal(controller.getSnapshot().saving, true);
  const duplicate = await controller.save(draftFromOrder(detail()));
  assert.equal(duplicate.success, false);
  if (!duplicate.success) assert.equal(duplicate.reason, 'busy');
  read.resolve({ success: true, data: { ...detail(), packageCount: 6 } });
  assert.equal((await first).success, false);
  assert.equal(controller.getSnapshot().confirmed!.packageCount, 2);
  assert.equal(controller.getSnapshot().result, null);
  assert.equal(controller.getSnapshot().saving, false);
  assert.equal(writes, 1);
});

test('No guarda sin carga; bultos fraccionarios no se truncan ni se envían', async () => {
  let writes = 0;
  const controller = new OrderManualSaveController({
    persist: async () => { writes++; return { success: true }; },
    reload: async () => ({ success: true, data: detail() }),
  });
  const draft = draftFromOrder(detail());
  assert.equal((await controller.save(draft)).success, false);
  controller.load(detail());
  assert.equal((await controller.save({ ...draft, packageCount: '2.5' })).success, false);
  assert.equal(writes, 0);
  assert.equal(controller.getSnapshot().saving, false);
});
