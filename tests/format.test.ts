import test from 'node:test';
import assert from 'node:assert';
import { formatArs, formatKg, formatKgInputValue } from '../src/lib/format';

test('FASE 13 POST-SMOKE — Helpers canónicos de formato (formatArs / formatKg)', async (t) => {
  await t.test('1. formatArs: 2 decimales fijos, punto de miles, coma decimal', () => {
    assert.strictEqual(formatArs(137.613), '$ 137,61');
    assert.strictEqual(formatArs(1000), '$ 1.000,00');
    assert.strictEqual(formatArs(2354358), '$ 2.354.358,00');
    assert.strictEqual(formatArs(10500.75), '$ 10.500,75');
  });

  await t.test('2. formatArs acepta string, number y Decimal indistintamente', () => {
    assert.strictEqual(formatArs('1000'), '$ 1.000,00');
    assert.strictEqual(formatArs(1000), '$ 1.000,00');
  });

  await t.test('3. formatArs maneja negativos con el signo antes del símbolo', () => {
    assert.strictEqual(formatArs(-250.25), '-$ 250,25');
  });

  await t.test('4. formatArs maneja null/undefined/vacío con un default seguro', () => {
    assert.strictEqual(formatArs(null), '$ 0,00');
    assert.strictEqual(formatArs(undefined), '$ 0,00');
    assert.strictEqual(formatArs(''), '$ 0,00');
  });

  await t.test('5. formatArs nunca altera el valor interno (es solo presentación)', () => {
    const raw = '137613.4999999';
    const formatted = formatArs(raw);
    assert.strictEqual(formatted, '$ 137.613,50');
    // El string original no fue mutado
    assert.strictEqual(raw, '137613.4999999');
  });

  await t.test('6. formatKg elimina ceros finales innecesarios sin perder precisión', () => {
    assert.strictEqual(formatKg(1.0), '1');
    assert.strictEqual(formatKg(1.5), '1,5');
    assert.strictEqual(formatKg(0.35), '0,35');
    assert.strictEqual(formatKg(0.375), '0,375');
    assert.strictEqual(formatKg(12), '12');
  });

  await t.test('7. formatKg respeta hasta 3 decimales de precisión interna', () => {
    assert.strictEqual(formatKg('0.001'), '0,001');
    assert.strictEqual(formatKg('1.234'), '1,234');
  });

  await t.test('8. formatKg maneja null/undefined/vacío con un default seguro', () => {
    assert.strictEqual(formatKg(null), '0');
    assert.strictEqual(formatKg(undefined), '0');
    assert.strictEqual(formatKg(''), '0');
  });

  await t.test('9. formatKgInputValue preserva separador decimal PUNTO para inputs nativos', () => {
    assert.strictEqual(formatKgInputValue(1.5), '1.5');
    assert.strictEqual(formatKgInputValue(0.35), '0.35');
    assert.strictEqual(formatKgInputValue(1.0), '1');
    assert.strictEqual(formatKgInputValue(0.375), '0.375');
  });

  await t.test('10. formatKgInputValue no convierte 0.350 en 350 (no pierde el punto decimal)', () => {
    assert.strictEqual(formatKgInputValue('0.350'), '0.35');
    assert.notStrictEqual(formatKgInputValue('0.350'), '350');
  });
});
