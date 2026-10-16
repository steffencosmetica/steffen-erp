import test from 'node:test';
import assert from 'node:assert';
import { getAuthorizedUserIds, isUserAuthorized } from '../src/auth/authorization';

/** Allowlist de operadores: STEFFEN_AUTHORIZED_USER_IDS (+ fallback STEFFEN_AUTHORIZED_USER_ID). Sin red ni DB. */
const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const C = '00000000-0000-4000-8000-0000000000c3';
const LEGACY = '00000000-0000-4000-8000-0000000000d4';

function withEnv(env: { list?: string; single?: string }, fn: () => void) {
  const prevList = process.env.STEFFEN_AUTHORIZED_USER_IDS;
  const prevSingle = process.env.STEFFEN_AUTHORIZED_USER_ID;
  try {
    if (env.list === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_IDS;
    else process.env.STEFFEN_AUTHORIZED_USER_IDS = env.list;
    if (env.single === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_ID;
    else process.env.STEFFEN_AUTHORIZED_USER_ID = env.single;
    fn();
  } finally {
    if (prevList === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_IDS;
    else process.env.STEFFEN_AUTHORIZED_USER_IDS = prevList;
    if (prevSingle === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_ID;
    else process.env.STEFFEN_AUTHORIZED_USER_ID = prevSingle;
  }
}

test('Auth — allowlist de múltiples operadores', async (t) => {
  await t.test('primer y segundo UUID de la lista autorizados; UUID no incluido rechazado', () => {
    withEnv({ list: `${A},${B}` }, () => {
      assert.strictEqual(isUserAuthorized({ id: A }), true);
      assert.strictEqual(isUserAuthorized({ id: B }), true);
      assert.strictEqual(isUserAuthorized({ id: C }), false);
    });
  });

  await t.test('espacios alrededor de comas y entradas vacías se ignoran', () => {
    withEnv({ list: `  ${A} ,, ${B}  , ,` }, () => {
      assert.deepStrictEqual(getAuthorizedUserIds(), [A, B]);
      assert.strictEqual(isUserAuthorized({ id: B }), true);
      assert.strictEqual(isUserAuthorized({ id: '' }), false);
      assert.strictEqual(isUserAuthorized({ id: ` ${A}` }), false, 'coincidencia exacta del UUID');
    });
  });

  await t.test('fallback a STEFFEN_AUTHORIZED_USER_ID si la lista no está definida', () => {
    withEnv({ single: ` ${LEGACY} ` }, () => {
      assert.deepStrictEqual(getAuthorizedUserIds(), [LEGACY]);
      assert.strictEqual(isUserAuthorized({ id: LEGACY }), true);
      assert.strictEqual(isUserAuthorized({ id: A }), false);
    });
  });

  await t.test('si la lista está definida, tiene prioridad sobre la variable antigua', () => {
    withEnv({ list: `${A},${B}`, single: LEGACY }, () => {
      assert.strictEqual(isUserAuthorized({ id: A }), true);
      assert.strictEqual(isUserAuthorized({ id: LEGACY }), false);
    });
  });

  await t.test('lista vacía o no configurada: falla de forma segura (nadie autorizado)', () => {
    withEnv({}, () => {
      assert.deepStrictEqual(getAuthorizedUserIds(), []);
      assert.strictEqual(isUserAuthorized({ id: A }), false);
    });
    for (const empty of ['', '   ', ',', ' , , ']) {
      // Lista definida pero vacía: no cae al fallback (no reabre acceso por error de configuración).
      withEnv({ list: empty, single: LEGACY }, () => {
        assert.deepStrictEqual(getAuthorizedUserIds(), [], `lista "${empty}"`);
        assert.strictEqual(isUserAuthorized({ id: LEGACY }), false);
        assert.strictEqual(isUserAuthorized({ id: A }), false);
      });
    }
    withEnv({ single: '' }, () => {
      assert.strictEqual(isUserAuthorized({ id: A }), false);
    });
  });

  await t.test('expectedUserId explícito sigue funcionando (override puntual)', () => {
    withEnv({ list: A }, () => {
      assert.strictEqual(isUserAuthorized({ id: C }, C), true);
      assert.strictEqual(isUserAuthorized({ id: A }, C), false);
    });
  });
});
