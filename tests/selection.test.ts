import test from 'node:test';
import assert from 'node:assert';
import { resolveInitialSelectedId } from '../src/lib/selection';

test('POST-SMOKE FASE 13 — MICRO-CIERRE UI Cuentas Clientes: resolveInitialSelectedId (deep-link ?customerId=/?supplierId=)', async (t) => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  await t.test('2. Un customerId/supplierId válido selecciona automáticamente ese item', () => {
    assert.strictEqual(resolveInitialSelectedId(items, 'b'), 'b');
  });

  await t.test('4. Un id inválido/inexistente hace fallback seguro al primer item', () => {
    assert.strictEqual(resolveInitialSelectedId(items, 'no-existe'), 'a');
  });

  await t.test('4b. Sin id solicitado, hace fallback al primer item', () => {
    assert.strictEqual(resolveInitialSelectedId(items, undefined), 'a');
    assert.strictEqual(resolveInitialSelectedId(items, null), 'a');
    assert.strictEqual(resolveInitialSelectedId(items, ''), 'a');
  });

  await t.test('4c. Lista vacía nunca rompe: fallback a string vacío', () => {
    assert.strictEqual(resolveInitialSelectedId([], 'cualquier-id'), '');
    assert.strictEqual(resolveInitialSelectedId([], undefined), '');
  });

  await t.test('3. Es una función pura determinística: misma entrada -> misma salida (consistente ante refresh)', () => {
    const r1 = resolveInitialSelectedId(items, 'c');
    const r2 = resolveInitialSelectedId(items, 'c');
    assert.strictEqual(r1, r2);
    assert.strictEqual(r1, 'c');
  });
});
