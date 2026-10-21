import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavigationCoordinator, bindBeforeUnload, bindInternalLinks, internalLinkDestination, requestProtectedLogout } from '../src/ui/navigation/navigationCoordinator';
import { OrderContinuation } from '../src/ui/orders/orderContinuation';
import { OrderManualSaveController, draftFromOrder, isOrderDirty } from '../src/ui/orders/orderEditorState';
import { UnsavedOrderDialog } from '../src/ui/orders/UnsavedOrderDialog';
import type { OrderDetailDTO } from '../src/actions/order.dto';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function harness() {
  let server = { id: 'a', customerSource: 'CONSUMER_FINAL', packageCount: 1, items: [] } as unknown as OrderDetailDTO;
  let draft = draftFromOrder(server);
  let auxiliary = false;
  let failWrite = false;
  let failRead = false;
  let writes = 0;
  let reads = 0;
  let pause: ReturnType<typeof deferred> | undefined;
  const errors: string[] = [];
  const coordinator = new NavigationCoordinator();
  const saver = new OrderManualSaveController({
    persist: async (_id, input) => {
      writes++;
      const sent = { ...server, packageCount: input.packageCount ?? null };
      if (pause) await pause.promise;
      if (failWrite) return { success: false, error: 'Persistencia rechazada' };
      server = sent; return { success: true };
    },
    reload: async () => { reads++; return failRead ? { success: false, error: 'Relectura fallida' } : { success: true, data: server }; },
  });
  saver.load(server);
  const hasPending = () => auxiliary || saver.requiresReconciliation() || isOrderDirty(draft, saver.getSnapshot().confirmed);
  const continuation = new OrderContinuation({
    dirty: () => saver.requiresReconciliation() || isOrderDirty(draft, saver.getSnapshot().confirmed),
    auxiliaryDirty: () => auxiliary,
    blocked: () => saver.getSnapshot().saving,
    save: async () => {
      const result = await saver.save(draft); if (!result.success) errors.push(result.error);
      coordinator.notify(); return result.success;
    },
    discard: async () => { draft = draftFromOrder(server); auxiliary = false; coordinator.notify(); return true; },
    changed: coordinator.notify, error: (message) => errors.push(message),
  });
  const unregister = coordinator.register({
    hasPending, intercepts: () => hasPending() || continuation.resolving || saver.getSnapshot().saving,
    request: (run, purpose) => continuation.request(run, 'continue', false, false, purpose), cancel: continuation.cancel,
  });
  return {
    coordinator, continuation, unregister, errors, hasPending,
    edit: (value = '2') => { draft = { ...draft, packageCount: value }; coordinator.notify(); },
    addProduct: () => { auxiliary = true; coordinator.notify(); },
    failWrite: () => { failWrite = true; }, failRead: (value: boolean) => { failRead = value; },
    pause: () => { pause = deferred(); return pause; },
    get writes() { return writes; }, get reads() { return reads; },
  };
}

test('Navegación interna sin editor o sin cambios continúa sin persistir', () => {
  const coordinator = new NavigationCoordinator(); let calls = 0;
  coordinator.request(() => { calls++; });
  const h = harness(); h.coordinator.request(() => { calls++; });
  assert.equal(calls, 2); assert.equal(h.writes, 0); assert.equal(h.continuation.decision, null);
});
test('Navegación global con cambios reutiliza diálogo y Guardar espera escritura y relectura', async () => {
  const h = harness(); h.edit(); const pause = h.pause(); let navigations = 0;
  h.coordinator.request(() => { navigations++; });
  assert.equal(h.continuation.decision?.variant, 'continue');
  const task = h.continuation.resolve('save');
  assert.equal(navigations, 0); assert.equal(h.reads, 0);
  pause.resolve(); await task;
  assert.equal(h.writes, 1); assert.equal(h.reads, 1); assert.equal(navigations, 1); assert.equal(h.hasPending(), false);
});
test('Descartar navega sin guardar; cancelar conserva todos los borradores', async () => {
  const h = harness(); h.edit(); h.addProduct(); let navigations = 0;
  h.coordinator.request(() => { navigations++; }); h.continuation.cancel();
  assert.equal(navigations, 0); assert.equal(h.hasPending(), true);
  h.coordinator.request(() => { navigations++; }); await h.continuation.resolve('discard');
  assert.equal(navigations, 1); assert.equal(h.writes, 0); assert.equal(h.hasPending(), false);
});
test('Error de persistencia conserva editor y bloquea navegación global', async () => {
  const h = harness(); h.edit(); h.failWrite(); let navigated = false;
  h.coordinator.request(() => { navigated = true; }); await h.continuation.resolve('save');
  assert.equal(navigated, false); assert.equal(h.hasPending(), true); assert.match(h.errors[0], /rechazada/);
});
test('Ediciones durante guardado impiden continuación global', async () => {
  const h = harness(); h.edit(); const pause = h.pause(); let navigated = false;
  h.coordinator.request(() => { navigated = true; }); const task = h.continuation.resolve('save');
  h.edit('3'); pause.resolve(); await task;
  assert.equal(navigated, false); assert.equal(h.hasPending(), true); assert.match(h.errors[0], /pendientes/);
});
test('Relectura fallida bloquea logout; reconciliación no repite escritura', async () => {
  const h = harness(); h.edit(); h.failRead(true); let logouts = 0;
  requestProtectedLogout({ preventDefault() {} }, h.coordinator, () => { logouts++; });
  await h.continuation.resolve('save'); assert.equal(logouts, 0);
  assert.equal(h.hasPending(), true);
  h.failRead(false); requestProtectedLogout({ preventDefault() {} }, h.coordinator, () => { logouts++; });
  await h.continuation.resolve('save'); assert.equal(logouts, 1); assert.equal(h.writes, 1);
});
for (const choice of ['save', 'discard', 'keep'] as const) {
  test(`Logout protegido: ${choice}; primer submit cancelado antes de ejecutar action`, async () => {
    const h = harness(); h.edit(); let submitted = 0; let prevented = 0;
    requestProtectedLogout({ preventDefault: () => { prevented++; } }, h.coordinator, () => { submitted++; });
    assert.equal(prevented, 1); assert.equal(submitted, 0); assert.equal(h.continuation.decision?.purpose, 'logout');
    if (choice === 'keep') h.continuation.cancel(); else await h.continuation.resolve(choice);
    assert.equal(submitted, choice === 'keep' ? 0 : 1);
    assert.equal(h.writes, choice === 'save' ? 1 : 0);
  });
}
test('Logout limpio continúa sin guardado y con error de guardado conserva sesión', async () => {
  const h = harness(); let submitted = 0;
  requestProtectedLogout({ preventDefault() {} }, h.coordinator, () => { submitted++; }); assert.equal(submitted, 1);
  h.edit(); h.failWrite(); requestProtectedLogout({ preventDefault() {} }, h.coordinator, () => { submitted++; });
  await h.continuation.resolve('save'); assert.equal(submitted, 1); assert.equal(h.hasPending(), true);
});
test('Etiquetas específicas de cierre de sesión en el mismo diálogo', () => {
  const html = renderToStaticMarkup(createElement(UnsavedOrderDialog, {
    variant: 'continue', purpose: 'logout', onSave() {}, onDiscard() {}, onKeep() {},
  }));
  assert.match(html, /Guardar y cerrar sesión/); assert.match(html, /Descartar cambios y cerrar sesión/); assert.match(html, /Seguir editando/);
});
test('Solo la última intención puede ejecutarse; cambios durante operación no quedan en cola', async () => {
  const h = harness(); h.edit(); const destinations: string[] = [];
  h.coordinator.request(() => { destinations.push('sidebar'); });
  requestProtectedLogout({ preventDefault() {} }, h.coordinator, () => { destinations.push('logout'); });
  assert.equal(h.continuation.decision?.purpose, 'logout');
  const pause = h.pause(); const task = h.continuation.resolve('save');
  h.coordinator.request(() => { destinations.push('logo'); }); pause.resolve(); await task;
  assert.deepEqual(destinations, []); assert.equal(h.continuation.decision, null);
});
test('Desmontar editor invalida destino durante guardado y libera registro', async () => {
  const h = harness(); h.edit(); const pause = h.pause(); let navigated = false;
  h.coordinator.request(() => { navigated = true; }); const task = h.continuation.resolve('save');
  h.unregister(); pause.resolve(); await task;
  assert.equal(navigated, false); assert.equal(h.coordinator.hasPending(), false); assert.equal(h.coordinator.intercepts(), false);
});
test('Registro antiguo no puede limpiar el nuevo y Providers son independientes', () => {
  const first = new NavigationCoordinator(); const second = new NavigationCoordinator(); let canceled = 0;
  const protection = { hasPending: () => true, intercepts: () => true, request() {}, cancel: () => { canceled++; } };
  const old = first.register(protection); const current = first.register(protection); old();
  assert.equal(first.hasPending(), true); assert.equal(second.hasPending(), false); assert.equal(canceled, 1);
  current(); assert.equal(first.hasPending(), false); assert.equal(canceled, 2);
});

class ListenerTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.get(type)?.delete(listener); }
  count(type: string) { return this.listeners.get(type)?.size ?? 0; }
  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(event); else listener.handleEvent(event);
    }
  }
}
test('beforeunload condicional: limpio, dirty, reversión, borrador auxiliar y limpieza de suscripción', () => {
  const h = harness(); const target = new ListenerTarget();
  const cleanup = bindBeforeUnload(h.coordinator, target as unknown as Window);
  assert.equal(target.count('beforeunload'), 0);
  h.edit(); assert.equal(target.count('beforeunload'), 1);
  for (let index = 0; index < 10; index++) h.coordinator.notify();
  assert.equal(target.count('beforeunload'), 1);
  const event = new Event('beforeunload', { cancelable: true });
  // Node Event no implementa el setter de BeforeUnloadEvent del navegador.
  Object.defineProperty(event, 'returnValue', { value: '', writable: true });
  target.emit('beforeunload', event);
  assert.equal(event.defaultPrevented, true); assert.equal(h.writes, 0);
  h.edit('1'); assert.equal(target.count('beforeunload'), 0);
  h.addProduct(); assert.equal(target.count('beforeunload'), 1);
  cleanup(); assert.equal(target.count('beforeunload'), 0);
  h.coordinator.notify(); assert.equal(target.count('beforeunload'), 0);
});
test('beforeunload se libera al desmontar editor y tras continuación resuelta', async () => {
  const h = harness(); const target = new ListenerTarget(); const cleanup = bindBeforeUnload(h.coordinator, target as unknown as Window);
  h.edit(); h.coordinator.request(() => {}); await h.continuation.resolve('discard');
  assert.equal(target.count('beforeunload'), 0);
  h.edit(); h.unregister(); assert.equal(target.count('beforeunload'), 0); cleanup();
});

const plainClick = { button: 0, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false };
const sameTab = { target: '', download: false, external: false };
test('Enlaces internos: sidebar, logos, drawer, secundarios y query; excepciones nativas', () => {
  const current = 'https://erp.test/pedidos';
  for (const href of ['/', '/stock', '/clientes?customerId=1', '/reportes']) {
    assert.equal(internalLinkDestination(plainClick, { ...sameTab, href }, current), href);
  }
  for (const link of [
    { href: 'https://externo.test' }, { href: 'mailto:correo@test.com' }, { href: '#detalle' },
    { href: '/stock', target: '_blank' }, { href: '/stock', download: true }, { href: '/stock', external: true },
  ]) assert.equal(internalLinkDestination(plainClick, { ...sameTab, ...link }, current), null);
  for (const event of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.equal(internalLinkDestination({ ...plainClick, ...event }, { ...sameTab, href: '/stock' }, current), null);
  }
});
test('Listener de enlaces se registra una vez y se libera; no instala interceptores de historial', () => {
  const target = new ListenerTarget(); const coordinator = new NavigationCoordinator();
  const cleanup = bindInternalLinks(coordinator, target as unknown as Document, () => 'https://erp.test/pedidos', () => {});
  assert.equal(target.count('click'), 1); assert.equal(target.count('popstate'), 0);
  cleanup(); assert.equal(target.count('click'), 0);
});
test('Captura real del listener: suspende Link antes de su handler; limpio deja comportamiento nativo', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Element');
  class ElementStub {
    closest() { return this; }
    getAttribute(name: string) { return name === 'href' ? '/stock' : null; }
    hasAttribute() { return false; }
    relList = { contains: () => false };
  }
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: ElementStub });
  try {
    const target = new ListenerTarget(); const h = harness(); const destinations: string[] = [];
    const cleanup = bindInternalLinks(h.coordinator, target as unknown as Document, () => 'https://erp.test/pedidos', (href) => { destinations.push(href); });
    const click = () => {
      const event = new Event('click', { cancelable: true });
      Object.defineProperty(event, 'target', { value: new ElementStub() });
      Object.assign(event, { button: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
      return event;
    };
    const clean = click(); target.emit('click', clean); assert.equal(clean.defaultPrevented, false);
    h.edit(); const dirty = click(); target.emit('click', dirty);
    assert.equal(dirty.defaultPrevented, true); assert.deepEqual(destinations, []);
    await h.continuation.resolve('discard'); assert.deepEqual(destinations, ['/stock']);
    cleanup(); assert.equal(target.count('click'), 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'Element', descriptor); else Reflect.deleteProperty(globalThis, 'Element');
  }
});
test('Back/Forward nativo: limitación explícita, sin parches, entradas falsas ni bucles', () => {
  const source = readFileSync('src/ui/navigation/navigationCoordinator.ts', 'utf8') + readFileSync('src/ui/navigation/NavigationProtectionProvider.tsx', 'utf8');
  assert.doesNotMatch(source, /history\.(pushState|replaceState|go)|addEventListener\(['"]popstate/);
  // La prueba no afirma protección del historial: comprueba ausencia del workaround inseguro.
});
test('Refresh, planificación, menú y tema no forman parte del snapshot ni recargan el editor por props externas', () => {
  const h = harness(); h.edit();
  for (let index = 0; index < 10; index++) h.coordinator.notify();
  assert.equal(h.hasPending(), true); assert.equal(h.writes, 0);
  const editor = readFileSync('src/ui/modals/VerPedidoModal.tsx', 'utf8');
  const view = readFileSync('src/ui/views/PedidosView.tsx', 'utf8');
  assert.match(editor, /\[isOpen, orderId, manualSave\]/);
  assert.match(view, /router.refresh\(\)/);
  assert.doesNotMatch(view, /key=\{.*planning|setSelectedOrderId\(null\).*reorder/);
});
