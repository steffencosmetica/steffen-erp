import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OrderContinuation } from '../src/ui/orders/orderContinuation';
import { OrderManualSaveController, draftFromOrder, isOrderDirty } from '../src/ui/orders/orderEditorState';
import type { OrderDetailDTO } from '../src/actions/order.dto';
import type { RtoPreviewDTO } from '../src/actions/remittance.dto';
import { preparePersistedRto } from '../src/ui/orders/orderRtoPreview';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnsavedOrderDialog } from '../src/ui/orders/UnsavedOrderDialog';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((ok) => { resolve = ok; });
  return { promise, resolve };
}
function harness() {
  // Solo se consumen los campos editables: no hay Actions ni conexiones a DB.
  let server = { id: 'a', customerSource: 'CONSUMER_FINAL', packageCount: 1, items: [] } as unknown as OrderDetailDTO;
  let draft = draftFromOrder(server);
  let auxiliary = false;
  let writes = 0;
  let reads = 0;
  let failSave = false;
  let failRead = false;
  let pause: ReturnType<typeof deferred> | null = null;
  const errors: string[] = [];
  const destinations: string[] = [];
  const controller = new OrderManualSaveController({
    persist: async (_id, input) => {
      writes++;
      const next = { ...server, packageCount: input.packageCount ?? null };
      if (pause) await pause.promise;
      if (failSave) return { success: false, error: 'Guardado rechazado' };
      server = next;
      return { success: true };
    },
    reload: async () => { reads++; return failRead ? { success: false, error: 'Sin conexión' } : { success: true, data: server }; },
  });
  controller.load(server);
  const guard = new OrderContinuation({
    dirty: () => controller.requiresReconciliation() || isOrderDirty(draft, controller.getSnapshot().confirmed),
    auxiliaryDirty: () => auxiliary,
    blocked: () => controller.getSnapshot().saving,
    save: async () => {
      const result = await controller.save(draft);
      if (!result.success) errors.push(result.error);
      return result.success;
    },
    discard: async (onlyAuxiliary, refresh) => {
      if (refresh || controller.requiresReconciliation()) {
        const result = await controller.save(draft, true);
        if (!result.success) { errors.push(result.error); return false; }
      }
      if (!onlyAuxiliary) draft = draftFromOrder(server);
      auxiliary = false;
      return true;
    },
    changed: () => {}, error: (message) => errors.push(message),
  });
  return {
    guard, controller, errors, destinations,
    edit: (value = '2') => { draft = { ...draft, packageCount: value }; },
    auxiliary: () => { auxiliary = true; },
    failSave: () => { failSave = true; }, failRead: (value = true) => { failRead = value; },
    pause: () => { pause = deferred(); return pause; },
    request: (name: string, variant: 'abandon' | 'continue' = 'continue', refresh = false) => guard.request(() => { destinations.push(name); }, variant, false, refresh),
    get writes() { return writes; }, get reads() { return reads; },
    get dirty() { return isOrderDirty(draft, controller.getSnapshot().confirmed); },
  };
}

for (const action of ['Cancelar', 'X', 'tarjeta seleccionada']) {
  test(`${action}: limpio cierra; dirty pide dos opciones; seguir conserva; descartar cierra sin escribir`, async () => {
    const h = harness(); h.request(action, 'abandon');
    assert.deepEqual(h.destinations, [action]);
    h.edit(); h.request(action, 'abandon');
    assert.equal(h.guard.decision?.variant, 'abandon');
    h.guard.cancel(); assert.equal(h.dirty, true);
    assert.equal(h.destinations.length, 1);
    h.request(action, 'abandon'); await h.guard.resolve('discard');
    assert.equal(h.destinations.length, 2); assert.equal(h.writes, 0); assert.equal(h.reads, 0);
  });
}
test('Cambio de pedido: guardar espera persistencia y relectura antes del destino', async () => {
  const h = harness(); h.edit(); const pause = h.pause(); h.request('b');
  assert.equal(h.guard.decision?.variant, 'continue');
  const resolving = h.guard.resolve('save');
  assert.deepEqual(h.destinations, []); assert.equal(h.reads, 0);
  pause.resolve(); await resolving;
  assert.equal(h.writes, 1); assert.equal(h.reads, 1); assert.deepEqual(h.destinations, ['b']);
});
test('Cambio de pedido: descartar o seguir editando', async () => {
  const h = harness(); h.edit(); h.request('b'); h.guard.cancel();
  assert.equal(h.dirty, true); assert.deepEqual(h.destinations, []);
  h.request('c'); await h.guard.resolve('discard');
  assert.deepEqual(h.destinations, ['c']); assert.equal(h.writes, 0);
});
test('Error al guardar conserva borrador y no ejecuta destino', async () => {
  const h = harness(); h.edit(); h.failSave(); h.request('b'); await h.guard.resolve('save');
  assert.equal(h.dirty, true); assert.deepEqual(h.destinations, []); assert.match(h.errors[0], /rechazado/);
});
test('Edición durante guardado conserva cambios posteriores y cancela continuación', async () => {
  const h = harness(); h.edit(); const pause = h.pause(); h.request('b');
  const resolving = h.guard.resolve('save'); h.edit('3'); pause.resolve(); await resolving;
  assert.equal(h.dirty, true); assert.deepEqual(h.destinations, []); assert.match(h.errors[0], /pendientes/);
});
test('Borrador Agregar producto no se incorpora ni guarda silenciosamente', async () => {
  const h = harness(); h.auxiliary(); h.request('b'); await h.guard.resolve('save');
  assert.equal(h.writes, 0); assert.deepEqual(h.destinations, []); assert.match(h.errors[0], /Agregar/);
  h.request('b'); await h.guard.resolve('discard'); assert.deepEqual(h.destinations, ['b']);
});
test('RTO sin cambios continúa sin escritura; con cambios requiere resolver', async () => {
  const clean = harness(); clean.request('RTO', 'continue', true);
  assert.deepEqual(clean.destinations, ['RTO']); assert.equal(clean.writes, 0);
  const saved = harness(); saved.edit(); saved.request('RTO', 'continue', true); await saved.guard.resolve('save');
  assert.equal(saved.writes, 1); assert.equal(saved.reads, 1); assert.deepEqual(saved.destinations, ['RTO']);
  const discarded = harness(); discarded.edit(); discarded.request('RTO', 'continue', true); await discarded.guard.resolve('discard');
  assert.equal(discarded.writes, 0); assert.equal(discarded.reads, 1); assert.deepEqual(discarded.destinations, ['RTO']);
});
test('Relectura fallida bloquea RTO; reintento reconcilia sin repetir escritura', async () => {
  const h = harness(); h.edit(); h.failRead(); h.request('RTO', 'continue', true); await h.guard.resolve('save');
  assert.equal(h.writes, 1); assert.equal(h.dirty, true); assert.equal(h.controller.requiresReconciliation(), true);
  assert.deepEqual(h.destinations, []);
  h.request('RTO', 'continue', true); await h.guard.resolve('discard'); assert.deepEqual(h.destinations, []);
  h.failRead(false); h.request('RTO', 'continue', true); await h.guard.resolve('save');
  assert.equal(h.writes, 1); assert.deepEqual(h.destinations, ['RTO']);
});
test('Nueva intención durante guardado invalida destinos, sin navegación simultánea ni cola', async () => {
  const h = harness(); h.edit(); const pause = h.pause(); h.request('b');
  const resolving = h.guard.resolve('save'); h.request('c'); pause.resolve(); await resolving;
  assert.deepEqual(h.destinations, []); assert.equal(h.guard.decision, null);
  h.request('d'); assert.deepEqual(h.destinations, ['d']);
});
test('Cancelar una continuación en vuelo invalida su destino', async () => {
  const h = harness(); h.edit(); const pause = h.pause(); h.request('RTO');
  const resolving = h.guard.resolve('save'); h.guard.cancel(); pause.resolve(); await resolving;
  assert.deepEqual(h.destinations, []);
});
test('Cableado UI: ambos cierres protegidos y RTO sin escritura directa', () => {
  const modal = readFileSync('src/ui/modals/VerPedidoModal.tsx', 'utf8');
  const view = readFileSync('src/ui/views/PedidosView.tsx', 'utf8');
  assert.equal((modal.match(/onClick=\{requestClose\}/g) ?? []).length, 2);
  assert.match(view, /isSelected \? 'abandon' : 'continue'/);
  const preview = modal.slice(modal.indexOf('const openPersistedRtoPreview'), modal.indexOf('// Confirm RTO'));
  assert.doesNotMatch(preview, /updateOrderAction\(/);
  assert.match(preview, /preparePersistedRto/);
  assert.match(preview, /continuation.generation === intention/);
});

test('Diálogo reutilizable: dos/tres acciones, semántica accesible y tokens de tema', () => {
  const props = { onSave: () => {}, onDiscard: () => {}, onKeep: () => {} };
  for (const variant of ['abandon', 'continue'] as const) {
    const html = renderToStaticMarkup(createElement(UnsavedOrderDialog, { ...props, variant }));
    assert.match(html, /role="dialog"/); assert.match(html, /aria-modal="true"/);
    assert.match(html, /ui-panel/); assert.match(html, /bg-steffen-overlay/);
    assert.match(html, /Descartar cambios/); assert.match(html, /Seguir editando/);
    assert.equal(html.includes('Guardar y continuar'), variant === 'continue');
  }
});

function rtoDetail(agQuantity: number | null = 5): OrderDetailDTO {
  return { id: 'persisted', items: [{ productId: 'server-product', requestedQuantity: 2, agQuantity }] } as unknown as OrderDetailDTO;
}
test('Preparación real de RTO sin cambios: relee y previsualiza solo por ID persistido, sin escribir', async () => {
  const calls: string[] = [];
  const detail = rtoDetail(); const preview = { orderCode: 'PED0001' } as RtoPreviewDTO;
  const result = await preparePersistedRto({
    read: async () => { calls.push('read'); return { success: true, orderId: detail.id, detail }; },
    current: () => true,
    preview: async (id) => { calls.push(`preview:${id}`); return { success: true, data: preview }; },
  });
  assert.deepEqual(calls, ['read', 'preview:persisted']);
  assert.equal(result.success, true);
  if (result.success) { assert.equal(result.detail, detail); assert.equal(result.preview, preview); }
});
test('RTO conserva validación AG persistida: null, negativo, fraccionario y todos cero bloquean', async () => {
  for (const ag of [null, -1, 1.5, 0]) {
    let previews = 0;
    const result = await preparePersistedRto({
      read: async () => ({ success: true, orderId: 'persisted', detail: rtoDetail(ag) }),
      current: () => true, preview: async () => { previews++; return { success: false }; },
    });
    assert.equal(result.success, false); assert.equal(previews, 0);
  }
});
test('RTO no consulta preview tras fallo de relectura ni acepta respuestas obsoletas', async () => {
  let previews = 0;
  const failure = await preparePersistedRto({
    read: async () => ({ success: false, orderId: 'persisted', reason: 'reload', error: 'Sin conexión' }),
    current: () => true, preview: async () => { previews++; return { success: false }; },
  });
  assert.equal(failure.success, false); assert.equal(previews, 0);
  let current = true; const pause = deferred();
  const request = preparePersistedRto({
    read: async () => ({ success: true, orderId: 'persisted', detail: rtoDetail() }),
    current: () => current,
    preview: async () => { previews++; await pause.promise; return { success: true, data: {} as RtoPreviewDTO }; },
  });
  await Promise.resolve(); current = false; pause.resolve();
  assert.deepEqual(await request, { success: false });
});
test('RTO se cancela si cambia la intención durante relectura', async () => {
  const pause = deferred(); let current = true; let previews = 0;
  const request = preparePersistedRto({
    read: async () => { await pause.promise; return { success: true, orderId: 'persisted', detail: rtoDetail() }; },
    current: () => current, preview: async () => { previews++; return { success: false }; },
  });
  current = false; pause.resolve();
  assert.deepEqual(await request, { success: false }); assert.equal(previews, 0);
});
test('Respuesta incierta de escritura: reintento manual solo relee, sin duplicar persistencia', async () => {
  const detail = { ...rtoDetail(), customerSource: 'CONSUMER_FINAL', packageCount: 1 } as OrderDetailDTO;
  let writes = 0; let reads = 0;
  const controller = new OrderManualSaveController({
    persist: async () => { writes++; throw new Error('Respuesta perdida'); },
    reload: async () => { reads++; return { success: true, data: detail }; },
  });
  controller.load(detail);
  const draft = { ...draftFromOrder(detail), packageCount: '2' };
  assert.equal((await controller.save(draft)).success, false);
  assert.equal(controller.requiresReconciliation(), true);
  assert.match(controller.getSnapshot().result && !controller.getSnapshot().result!.success ? (controller.getSnapshot().result as { error: string }).error : '', /incierto/);
  assert.equal((await controller.save(draft)).success, true);
  assert.equal(writes, 1); assert.equal(reads, 1);
  assert.equal(isOrderDirty(draft, controller.getSnapshot().confirmed), true);
});
