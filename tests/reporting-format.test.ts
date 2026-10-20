import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReportingKpiArs, formatReportingArs, formatReportingArsTick } from '../src/ui/reporting/format';

test('KPI monetarios: ejemplos, signo, cero y magnitudes K/M', () => {
  const cases = [
    ['13333302', '$13,33M'],
    ['5354220', '$5,35M'],
    ['7978203.87', '$7,98M'],
    ['38740', '$38,74K'],
    ['-2720892.81', '-$2,72M'],
    ['0', '$0'],
    ['-0.00', '$0'],
    ['1000', '$1K'],
    ['1000000', '$1M'],
    ['-1000', '-$1K'],
    ['1250', '$1,25K'],
    ['1275', '$1,28K'],
  ] as const;
  for (const [value, expected] of cases) assert.equal(formatReportingKpiArs(value), expected, value);
  assert.equal(formatReportingKpiArs(null), '—');
});

test('KPI monetarios: redondeo exacto en el umbral de millones, sin 1000K', () => {
  assert.equal(formatReportingKpiArs('999994.999999'), '$999,99K');
  assert.equal(formatReportingKpiArs('999995'), '$1M');
  assert.equal(formatReportingKpiArs('-999995'), '-$1M');
  assert.equal(formatReportingKpiArs('999999.999999'), '$1M');
});

test('KPI monetarios: debajo de mil conserva formato normal; otros formatos intactos', () => {
  assert.equal(formatReportingKpiArs('387.4'), '$ 387,40');
  assert.equal(formatReportingKpiArs('-387.4'), '-$ 387,40');
  assert.equal(formatReportingKpiArs('999.995'), '$ 1.000,00');
  assert.equal(formatReportingArs('13333302'), '$ 13.333.302,00');
  assert.equal(formatReportingArsTick(38740), '$ 38,7 mil');
});
