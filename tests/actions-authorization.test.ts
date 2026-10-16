import test, { mock } from 'node:test';
import assert from 'node:assert';

/**
 * Fase 19 — Autorización de Server Actions de RTO / RTM / documentos.
 *
 * Se usa el guard REAL (requireAuthenticatedUser + isUserAuthorized con
 * STEFFEN_AUTHORIZED_USER_ID). Solo se sustituyen:
 * - el origen de la sesión (cliente Supabase con cookies), para simular
 *   "sin sesión", "sesión de otro usuario" y "operador autorizado";
 * - el composition root, con un espía que registra si alguna action llegó a
 *   pedir un servicio (service_role) antes de completar la autorización.
 */

const AUTHORIZED_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ID = '00000000-0000-4000-8000-0000000000bb';
process.env.STEFFEN_AUTHORIZED_USER_ID = AUTHORIZED_ID;

let sessionUser: { id: string; email: string } | null = null;
let serviceRequests: string[] = [];

mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({ getAll: () => [], set: () => undefined }),
  },
});
mock.module('next/cache', {
  namedExports: { revalidatePath: () => undefined },
});
mock.module('@supabase/ssr', {
  namedExports: {
    createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) },
    }),
  },
});

// Servicio falso: cualquier método resuelve a un objeto vacío (el flujo puede fallar
// después por datos ficticios; lo que importa es si se llegó o no al servicio).
const fakeService = new Proxy({}, { get: () => async () => ({}) });
const spy = (name: string) => () => {
  serviceRequests.push(name);
  return fakeService;
};
mock.module('@/services/composition', {
  namedExports: {
    getRemittanceService: spy('getRemittanceService'),
    getDocumentService: spy('getDocumentService'),
  },
});

type Invoke = () => Promise<{ success: boolean; error?: string }>;

test('Fase 19 — Server Actions RTO/RTM/documentos requieren operador autorizado', async (t) => {
  const remittance = await import('../src/actions/remittance.actions');
  const margin = await import('../src/actions/margin-remittance.actions');
  const documents = await import('../src/actions/document.actions');

  const actions: Record<string, Invoke> = {
    confirmOrderToRemittanceAction: () => remittance.confirmOrderToRemittanceAction('order-id', '2026-10-16'),
    previewRtoAction: () => remittance.previewRtoAction('order-id'),
    getRemittanceDetailAction: () => remittance.getRemittanceDetailAction('remittance-id'),
    getRemittanceByOrderIdAction: () => remittance.getRemittanceByOrderIdAction('order-id'),
    getPendingRtmRemittanceAction: () => remittance.getPendingRtmRemittanceAction(),
    getMonthlySalesAction: () => remittance.getMonthlySalesAction(2026, 10),
    completeRtmAction: () => margin.completeRtmAction('remittance-id', '1000'),
    previewRtmAction: () => margin.previewRtmAction('remittance-id', '1000'),
    getMarginRemittanceByRemittanceIdAction: () => margin.getMarginRemittanceByRemittanceIdAction('remittance-id'),
    getDocumentViewAction: () => documents.getDocumentViewAction('RTO', 'remittance-id'),
    retryDocumentAction: () => documents.retryDocumentAction('document-id'),
  };

  assert.strictEqual(Object.keys(actions).length, 11);

  for (const [name, invoke] of Object.entries(actions)) {
    await t.test(`${name}: sin sesión → rechazada sin tocar servicios`, async () => {
      sessionUser = null;
      serviceRequests = [];
      const res = await invoke();
      assert.strictEqual(res.success, false);
      assert.match(res.error ?? '', /sesión autenticada|Acceso denegado/i);
      assert.deepStrictEqual(serviceRequests, [], 'no debe pedir servicios (service_role) sin sesión');
    });

    await t.test(`${name}: sesión de usuario no autorizado → rechazada sin tocar servicios`, async () => {
      sessionUser = { id: OTHER_ID, email: 'otro@example.com' };
      serviceRequests = [];
      const res = await invoke();
      assert.strictEqual(res.success, false);
      assert.match(res.error ?? '', /Acceso prohibido/i);
      assert.deepStrictEqual(serviceRequests, [], 'no debe pedir servicios (service_role) para otro usuario');
    });

    await t.test(`${name}: operador autorizado → pasa al flujo normal`, async () => {
      sessionUser = { id: AUTHORIZED_ID, email: 'operador@example.com' };
      serviceRequests = [];
      const res = await invoke();
      assert.ok(serviceRequests.length > 0, 'el operador autorizado debe llegar al servicio');
      if (!res.success) {
        assert.doesNotMatch(res.error ?? '', /Acceso prohibido|sesión autenticada|Acceso denegado/i);
      }
    });
  }
});
