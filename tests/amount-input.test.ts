import test from 'node:test';
import assert from 'node:assert';
import { normalizePositiveAmountInput } from '../src/lib/amount-input';

test('Fase 19.1 — normalización de importes tipeados (string exacto, nunca Number)', () => {
  assert.strictEqual(normalizePositiveAmountInput('350000'), '350000');
  assert.strictEqual(normalizePositiveAmountInput('100.50'), '100.50');
  assert.strictEqual(normalizePositiveAmountInput('100,50'), '100.50');
  assert.strictEqual(normalizePositiveAmountInput('1.234.567,891234'), '1234567.891234');
  assert.strictEqual(normalizePositiveAmountInput(' 820 000 '), '820000');
  assert.strictEqual(normalizePositiveAmountInput('0007,5'), '7.5');
  assert.strictEqual(normalizePositiveAmountInput('98765432109.876543'), '98765432109.876543');
  // Retiro de caja (bug previo: "100,50" se registraba como 1005)
  assert.strictEqual(normalizePositiveAmountInput('100'), '100');
  assert.strictEqual(normalizePositiveAmountInput('1.250,50'), '1250.50');
  assert.strictEqual(normalizePositiveAmountInput('12.000.000,25'), '12000000.25');
  // Miles es-AR sin centavos
  assert.strictEqual(normalizePositiveAmountInput('1.250'), '1250');
  assert.strictEqual(normalizePositiveAmountInput('12.000.000'), '12000000');

  for (const invalid of ['', '0', '0,00', '-5', '-0,5', 'abc', '1,2,3', '1e5', '12.']) {
    assert.strictEqual(normalizePositiveAmountInput(invalid), null, `"${invalid}" debe rechazarse`);
  }
});
