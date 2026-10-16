import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getAuthorizedUserIds, isUserAuthorized, resolveAuthorizedIds } from '../src/auth/authorization';

/** Allowlist de operadores: STEFFEN_AUTHORIZED_USER_IDS (+ fallback STEFFEN_AUTHORIZED_USER_ID). Sin red ni DB. */
const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const C = '00000000-0000-4000-8000-0000000000c3';
const LEGACY = '00000000-0000-4000-8000-0000000000d4';

/** Ejecuta fn con las dos variables reales de process.env fijadas y las restaura siempre. */
function withEnv(env: { plural?: string; singular?: string }, fn: () => void) {
  const prevPlural = process.env.STEFFEN_AUTHORIZED_USER_IDS;
  const prevSingular = process.env.STEFFEN_AUTHORIZED_USER_ID;
  try {
    if (env.plural === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_IDS;
    else process.env.STEFFEN_AUTHORIZED_USER_IDS = env.plural;
    if (env.singular === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_ID;
    else process.env.STEFFEN_AUTHORIZED_USER_ID = env.singular;
    fn();
  } finally {
    if (prevPlural === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_IDS;
    else process.env.STEFFEN_AUTHORIZED_USER_IDS = prevPlural;
    if (prevSingular === undefined) delete process.env.STEFFEN_AUTHORIZED_USER_ID;
    else process.env.STEFFEN_AUTHORIZED_USER_ID = prevSingular;
  }
}

test('Auth — allowlist de múltiples operadores', async (t) => {
  // --- Lógica pura: resolveAuthorizedIds(plural, singular) ---
  await t.test('plural: UUID 1 y UUID 2 autorizados, tercero rechazado', () => {
    const ids = resolveAuthorizedIds(`${A},${B}`, undefined);
    assert.ok(ids.includes(A));
    assert.ok(ids.includes(B));
    assert.ok(!ids.includes(C));
  });

  await t.test('espacios alrededor de comas y entradas vacías se ignoran', () => {
    assert.deepStrictEqual(resolveAuthorizedIds(`  ${A} ,, ${B}  , ,`, undefined), [A, B]);
  });

  await t.test('plural definida tiene prioridad sobre singular', () => {
    assert.deepStrictEqual(resolveAuthorizedIds(A, LEGACY), [A]);
  });

  await t.test('plural definida pero vacía bloquea a todos (sin caer al singular)', () => {
    for (const empty of ['', '   ', ',', ' , , ']) {
      assert.deepStrictEqual(resolveAuthorizedIds(empty, LEGACY), [], `plural "${empty}"`);
    }
  });

  await t.test('fallback a singular si la plural no existe', () => {
    assert.deepStrictEqual(resolveAuthorizedIds(undefined, ` ${LEGACY} `), [LEGACY]);
  });

  await t.test('ninguna variable (o singular vacía) bloquea a todos', () => {
    assert.deepStrictEqual(resolveAuthorizedIds(undefined, undefined), []);
    assert.deepStrictEqual(resolveAuthorizedIds(undefined, ''), []);
  });

  // --- Lectura productiva: getAuthorizedUserIds() / isUserAuthorized() sobre process.env real ---
  await t.test('getAuthorizedUserIds lee process.env real (plural, prioridad, fallback, vacío)', () => {
    withEnv({ plural: ` ${A} , ${B} `, singular: LEGACY }, () => {
      assert.deepStrictEqual(getAuthorizedUserIds(), [A, B]);
      assert.strictEqual(isUserAuthorized({ id: A }), true);
      assert.strictEqual(isUserAuthorized({ id: B }), true);
      assert.strictEqual(isUserAuthorized({ id: C }), false);
      assert.strictEqual(isUserAuthorized({ id: LEGACY }), false);
    });
    withEnv({ singular: LEGACY }, () => {
      assert.deepStrictEqual(getAuthorizedUserIds(), [LEGACY]);
      assert.strictEqual(isUserAuthorized({ id: LEGACY }), true);
    });
    withEnv({ plural: '', singular: LEGACY }, () => {
      assert.strictEqual(isUserAuthorized({ id: LEGACY }), false);
    });
    withEnv({}, () => {
      assert.deepStrictEqual(getAuthorizedUserIds(), []);
      assert.strictEqual(isUserAuthorized({ id: A }), false);
    });
  });

  await t.test('process.env queda restaurado tras los casos (no contamina otros tests)', () => {
    const before = [process.env.STEFFEN_AUTHORIZED_USER_IDS, process.env.STEFFEN_AUTHORIZED_USER_ID];
    withEnv({ plural: A, singular: B }, () => undefined);
    assert.deepStrictEqual([process.env.STEFFEN_AUTHORIZED_USER_IDS, process.env.STEFFEN_AUTHORIZED_USER_ID], before);
  });

  await t.test('usuario sin id y expectedUserId explícito', () => {
    withEnv({ plural: A }, () => {
      assert.strictEqual(isUserAuthorized({ id: '' }), false);
      assert.strictEqual(isUserAuthorized({ id: C }, C), true);
      assert.strictEqual(isUserAuthorized({ id: A }, C), false);
    });
  });

  await t.test('fuente productiva: lectura directa y estática de process.env (sin alias)', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/auth/authorization.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(code.includes('process.env.STEFFEN_AUTHORIZED_USER_IDS'));
    assert.ok(code.includes('process.env.STEFFEN_AUTHORIZED_USER_ID'));
    assert.doesNotMatch(code, /=\s*process\.env\s*[;,)]/, 'sin alias / default param de process.env');
    assert.doesNotMatch(code, /process\.env\s*\[/, 'sin acceso dinámico process.env[...]');
    assert.doesNotMatch(code, /NodeJS\.ProcessEnv/);
  });
});
