import test from 'node:test';
import assert from 'node:assert';
import { Decimal } from '../src/domain/decimal';
import { DomainError } from '../src/domain/errors';
import {
  buildAvailableYears,
  monthsElapsed,
  monthStatus,
  fillEconomicMonthlySeries,
  fillEntityMonthlySeries,
  marginPct,
  monthlyAverage,
  ticketAverage,
  frequencyDays,
  entityKeyOf,
  parseEntityKey,
  entityLabel,
  rankBy,
  rankProducts,
  rankEntities,
  topFourPlusOthers,
  productShare,
  concentration,
  OTHERS_SLICE_KEY,
  type ProductTotals,
  type EntityTotals,
} from '../src/domain/reporting';

const D = (v: string | number) => new Decimal(v);
const str = (v: Decimal | null) => (v === null ? null : v.toString());

const UUID_A = '00000000-0000-4000-8000-00000000000a';
const UUID_B = '00000000-0000-4000-8000-00000000000b';
const UUID_C = '00000000-0000-4000-8000-00000000000c';

function product(productId: string, units: number, billed: string, contribution: string, label = productId): ProductTotals {
  return {
    productId,
    label,
    units,
    billedArs: D(billed),
    costArs: D(billed).minus(D(contribution)),
    contributionArs: D(contribution),
  };
}

function entity(entityKey: string, billed: string, salesCount = 1): EntityTotals {
  return { entityKey, label: entityKey, salesCount, billedArs: D(billed), firstPurchaseDate: null, lastPurchaseDate: null };
}

function cli(n: number): string {
  return `CLI:00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

test('REPORTES R4.2 — dominio: años disponibles', async (t) => {
  await t.test('sin primer año → solo el año actual', () => {
    assert.deepStrictEqual(buildAvailableYears(null, 2026), [2026]);
  });
  await t.test('varios años, intermedios incluidos, orden descendente', () => {
    assert.deepStrictEqual(buildAvailableYears(2023, 2026), [2026, 2025, 2024, 2023]);
  });
  await t.test('primer año = año actual', () => {
    assert.deepStrictEqual(buildAvailableYears(2026, 2026), [2026]);
  });
  await t.test('nunca años futuros', () => {
    assert.deepStrictEqual(buildAvailableYears(2027, 2026), [2026]);
    assert.ok(buildAvailableYears(2020, 2026).every((y) => y <= 2026));
  });
});

test('REPORTES R4.2 — dominio: meses y series enero–diciembre', async (t) => {
  await t.test('monthsElapsed: año cerrado = 12, año actual = mes de la fecha vigente', () => {
    assert.strictEqual(monthsElapsed(2025, '2026-10-17'), 12);
    assert.strictEqual(monthsElapsed(2026, '2026-10-17'), 10);
    assert.strictEqual(monthsElapsed(2026, '2026-01-01'), 1);
    assert.strictEqual(monthsElapsed(2026, '2026-12-31'), 12);
  });
  await t.test('monthsElapsed: año futuro se rechaza', () => {
    assert.throws(() => monthsElapsed(2027, '2026-10-17'), DomainError);
  });
  await t.test('monthStatus: pasado / actual / futuro', () => {
    assert.strictEqual(monthStatus(2026, 9, '2026-10-17'), 'ELAPSED');
    assert.strictEqual(monthStatus(2026, 10, '2026-10-17'), 'CURRENT');
    assert.strictEqual(monthStatus(2026, 11, '2026-10-17'), 'FUTURE');
    assert.strictEqual(monthStatus(2025, 12, '2026-10-17'), 'ELAPSED');
  });

  await t.test('año actual parcial: pasados faltantes = 0, actual faltante = 0, futuros = null, valores preservados', () => {
    const series = fillEconomicMonthlySeries(
      [{ month: 3, billedArs: D('1234.567891'), gainArs: D('-10.5'), expensesArs: D('0.000001') }],
      2026,
      '2026-10-17'
    );
    assert.strictEqual(series.length, 12);
    assert.deepStrictEqual(series.map((p) => p.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.deepStrictEqual([str(series[0].billedArs), str(series[0].gainArs), str(series[0].expensesArs)], ['0', '0', '0']);
    assert.deepStrictEqual(
      [str(series[2].billedArs), str(series[2].gainArs), str(series[2].expensesArs)],
      ['1234.567891', '-10.5', '0.000001']
    );
    assert.deepStrictEqual([str(series[9].billedArs), str(series[9].gainArs), str(series[9].expensesArs)], ['0', '0', '0']);
    for (const p of series.slice(10)) {
      assert.deepStrictEqual([p.billedArs, p.gainArs, p.expensesArs], [null, null, null]);
    }
  });

  await t.test('mes actual con datos conserva su valor parcial', () => {
    const series = fillEconomicMonthlySeries(
      [{ month: 10, billedArs: D('5'), gainArs: D('1'), expensesArs: D('2') }],
      2026,
      '2026-10-17'
    );
    assert.strictEqual(str(series[9].billedArs), '5');
  });

  await t.test('año cerrado: todos los meses faltantes = 0, ninguno null', () => {
    const series = fillEconomicMonthlySeries(
      [{ month: 12, billedArs: D('7'), gainArs: D('3'), expensesArs: D('1') }],
      2025,
      '2026-10-17'
    );
    assert.ok(series.every((p) => p.billedArs !== null && p.gainArs !== null && p.expensesArs !== null));
    assert.strictEqual(str(series[11].billedArs), '7');
    assert.strictEqual(str(series[0].billedArs), '0');
  });

  await t.test('fila en mes futuro o mes duplicado se rechaza', () => {
    assert.throws(
      () => fillEconomicMonthlySeries([{ month: 11, billedArs: D(1), gainArs: D(1), expensesArs: D(1) }], 2026, '2026-10-17'),
      DomainError
    );
    assert.throws(
      () =>
        fillEconomicMonthlySeries(
          [
            { month: 1, billedArs: D(1), gainArs: D(1), expensesArs: D(1) },
            { month: 1, billedArs: D(2), gainArs: D(2), expensesArs: D(2) },
          ],
          2025,
          '2026-10-17'
        ),
      DomainError
    );
    assert.throws(() => fillEntityMonthlySeries([{ month: 13, billedArs: D(1) }], 2025, '2026-10-17'), DomainError);
  });

  await t.test('serie de entidad: solo billedArs, misma semántica pasado/actual/futuro', () => {
    const series = fillEntityMonthlySeries([{ month: 2, billedArs: D('99.99') }], 2026, '2026-03-05');
    assert.deepStrictEqual(
      series.map((p) => str(p.billedArs)),
      ['0', '99.99', '0', null, null, null, null, null, null, null, null, null]
    );
    assert.deepStrictEqual(Object.keys(series[0]).sort(), ['billedArs', 'month']);
  });
});

test('REPORTES R4.2 — dominio: KPIs derivados', async (t) => {
  await t.test('margen: facturación 0 → null', () => {
    assert.strictEqual(marginPct(D(0), D(0)), null);
    assert.strictEqual(marginPct(D('-5'), D(0)), null);
  });
  await t.test('margen positivo exacto', () => {
    assert.strictEqual(str(marginPct(D('250'), D('1000'))), '25');
    assert.strictEqual(str(marginPct(D('1'), D('3'))), new Decimal(100).div(3).toString());
  });
  await t.test('margen con ganancia negativa', () => {
    assert.strictEqual(str(marginPct(D('-150'), D('1000'))), '-15');
  });

  await t.test('promedio mensual: año actual divide por meses transcurridos (meses sin actividad cuentan)', () => {
    assert.strictEqual(str(monthlyAverage(D('1000'), 2026, '2026-10-17')), '100');
    assert.strictEqual(str(monthlyAverage(D('100'), 2026, '2026-03-01')), new Decimal(100).div(3).toString());
  });
  await t.test('promedio mensual: año cerrado divide por 12', () => {
    assert.strictEqual(str(monthlyAverage(D('1200'), 2025, '2026-10-17')), '100');
    assert.strictEqual(str(monthlyAverage(D('0'), 2025, '2026-10-17')), '0');
  });

  await t.test('ticket promedio: 0 compras → null; 1 y varias exactas', () => {
    assert.strictEqual(ticketAverage(D('0'), 0), null);
    assert.strictEqual(str(ticketAverage(D('1234.5'), 1)), '1234.5');
    assert.strictEqual(str(ticketAverage(D('100'), 3)), new Decimal(100).div(3).toString());
    assert.throws(() => ticketAverage(D('1'), -1), DomainError);
    assert.throws(() => ticketAverage(D('1'), 1.5), DomainError);
  });

  await t.test('frecuencia: 0 y 1 compras → null', () => {
    assert.strictEqual(frequencyDays(null, null, 0), null);
    assert.strictEqual(frequencyDays('2026-03-01', '2026-03-01', 1), null);
  });
  await t.test('frecuencia: 2 compras', () => {
    assert.strictEqual(str(frequencyDays('2026-01-01', '2026-01-25', 2)), '24');
  });
  await t.test('frecuencia: 2 compras el mismo día → 0', () => {
    assert.strictEqual(str(frequencyDays('2026-05-10', '2026-05-10', 2)), '0');
  });
  await t.test('frecuencia: varias compras, exacta (no entera)', () => {
    assert.strictEqual(str(frequencyDays('2026-01-01', '2026-01-11', 4)), new Decimal(10).div(3).toString());
    assert.strictEqual(str(frequencyDays('2025-12-31', '2026-01-02', 3)), '1');
  });
  await t.test('frecuencia: independiente de zona horaria (cambios de horario, bisiesto, fin de año)', () => {
    const previousTz = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Argentina/Buenos_Aires', 'Pacific/Kiritimati', 'America/New_York']) {
        process.env.TZ = tz;
        assert.strictEqual(str(frequencyDays('2024-02-28', '2024-03-01', 2)), '2');
        assert.strictEqual(str(frequencyDays('2026-03-07', '2026-03-09', 2)), '2');
        assert.strictEqual(str(frequencyDays('2026-10-31', '2026-11-02', 2)), '2');
      }
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });
  await t.test('frecuencia: fechas inválidas o invertidas se rechazan', () => {
    assert.throws(() => frequencyDays('2026-02-30', '2026-03-01', 2), DomainError);
    assert.throws(() => frequencyDays('2026-03-10', '2026-03-01', 2), DomainError);
    assert.throws(() => frequencyDays(null, '2026-03-01', 2), DomainError);
    assert.throws(() => frequencyDays('26-3-1', '2026-03-01', 2), DomainError);
  });
});

test('REPORTES R4.2 — dominio: entidades analíticas', async (t) => {
  await t.test('CLI ida y vuelta', () => {
    const key = entityKeyOf('REGISTERED_CUSTOMER', UUID_A);
    assert.strictEqual(key, `CLI:${UUID_A}`);
    assert.deepStrictEqual(parseEntityKey(key), { customerSource: 'REGISTERED_CUSTOMER', customerId: UUID_A });
  });
  await t.test('ML ida y vuelta', () => {
    assert.strictEqual(entityKeyOf('MERCADO_LIBRE', null), 'ML');
    assert.deepStrictEqual(parseEntityKey('ML'), { customerSource: 'MERCADO_LIBRE', customerId: null });
  });
  await t.test('CF ida y vuelta', () => {
    assert.strictEqual(entityKeyOf('CONSUMER_FINAL', null), 'CF');
    assert.deepStrictEqual(parseEntityKey('CF'), { customerSource: 'CONSUMER_FINAL', customerId: null });
  });
  await t.test('combinaciones source/customerId inválidas se rechazan', () => {
    assert.throws(() => entityKeyOf('REGISTERED_CUSTOMER', null), DomainError);
    assert.throws(() => entityKeyOf('REGISTERED_CUSTOMER', 'no-uuid'), DomainError);
    assert.throws(() => entityKeyOf('MERCADO_LIBRE', UUID_A), DomainError);
    assert.throws(() => entityKeyOf('CONSUMER_FINAL', UUID_A), DomainError);
  });
  await t.test('claves inválidas se rechazan (sin heurísticas)', () => {
    for (const key of ['', 'ml', 'cf', 'CLI:', 'CLI:123', `CLI:${UUID_A} `, ` ML`, `cli:${UUID_A}`, UUID_A, 'MERCADO_LIBRE']) {
      assert.throws(() => parseEntityKey(key), DomainError, `debe rechazar "${key}"`);
    }
  });

  const UUID_MIXED_SOURCE = '3f2a9C1e-4B7d-4E0a-9F1b-0A2c3D4e5F60';
  const UUID_MIXED_CANONICAL = '3f2a9c1e-4b7d-4e0a-9f1b-0a2c3d4e5f60';

  await t.test('UUID lowercase / uppercase / mixed-case: entityKeyOf produce siempre CLI:<uuid lowercase>', () => {
    const expected = `CLI:${UUID_MIXED_CANONICAL}`;
    assert.strictEqual(entityKeyOf('REGISTERED_CUSTOMER', UUID_MIXED_CANONICAL), expected);
    assert.strictEqual(entityKeyOf('REGISTERED_CUSTOMER', UUID_MIXED_CANONICAL.toUpperCase()), expected);
    assert.strictEqual(entityKeyOf('REGISTERED_CUSTOMER', UUID_MIXED_SOURCE), expected);
  });
  await t.test('UUID lowercase / uppercase / mixed-case: parseEntityKey normaliza a lowercase', () => {
    const canonical = { customerSource: 'REGISTERED_CUSTOMER', customerId: UUID_MIXED_CANONICAL };
    assert.deepStrictEqual(parseEntityKey(`CLI:${UUID_MIXED_CANONICAL}`), canonical);
    assert.deepStrictEqual(parseEntityKey(`CLI:${UUID_MIXED_CANONICAL.toUpperCase()}`), canonical);
    assert.deepStrictEqual(parseEntityKey(`CLI:${UUID_MIXED_SOURCE}`), canonical);
  });
  await t.test('distintas grafías del mismo UUID convergen al mismo entityKey canónico', () => {
    const keys = [UUID_MIXED_CANONICAL, UUID_MIXED_CANONICAL.toUpperCase(), UUID_MIXED_SOURCE].map((raw) => {
      const ref = parseEntityKey(`CLI:${raw}`);
      return entityKeyOf(ref.customerSource, ref.customerId);
    });
    assert.deepStrictEqual(new Set(keys), new Set([`CLI:${UUID_MIXED_CANONICAL}`]));
  });
  await t.test('UUID realmente inválido sigue rechazado (sin importar mayúsculas)', () => {
    const invalid = [
      '3F2A9C1E-4B7D-4E0A-9F1B-0A2C3D4E5F6',
      '3F2A9C1E-4B7D-4E0A-9F1B-0A2C3D4E5F600',
      '3F2A9C1E4B7D4E0A9F1B0A2C3D4E5F60',
      '{3F2A9C1E-4B7D-4E0A-9F1B-0A2C3D4E5F60}',
      '3G2A9C1E-4B7D-4E0A-9F1B-0A2C3D4E5F60',
      ' 3f2a9c1e-4b7d-4e0a-9f1b-0a2c3d4e5f60',
    ];
    for (const raw of invalid) {
      assert.throws(() => entityKeyOf('REGISTERED_CUSTOMER', raw), DomainError, `entityKeyOf debe rechazar "${raw}"`);
      assert.throws(() => parseEntityKey(`CLI:${raw}`), DomainError, `parseEntityKey debe rechazar "CLI:${raw}"`);
    }
  });
  await t.test('etiquetas', () => {
    assert.strictEqual(entityLabel('REGISTERED_CUSTOMER', 'Peluquería Ana'), 'Peluquería Ana');
    assert.strictEqual(entityLabel('MERCADO_LIBRE', null), 'Mercado Libre');
    assert.strictEqual(entityLabel('CONSUMER_FINAL', null), 'Consumidor Final');
    assert.strictEqual(entityLabel('MERCADO_LIBRE', 'Otro nombre'), 'Mercado Libre');
    assert.throws(() => entityLabel('REGISTERED_CUSTOMER', null), DomainError);
    assert.throws(() => entityLabel('REGISTERED_CUSTOMER', '  '), DomainError);
  });
});

test('REPORTES R4.2 — dominio: rankings', async (t) => {
  const products = [
    product(UUID_C, 5, '100', '10'),
    product(UUID_A, 9, '300.000001', '-5'),
    product(UUID_B, 5, '300.000001', '50'),
  ];

  await t.test('orden descendente por métrica', () => {
    assert.deepStrictEqual(rankProducts(products, 'CONTRIBUTION').map((p) => p.productId), [UUID_B, UUID_C, UUID_A]);
    assert.deepStrictEqual(rankProducts(products, 'UNITS').map((p) => p.productId)[0], UUID_A);
  });
  await t.test('empate de producto → product_id ASC', () => {
    assert.deepStrictEqual(rankProducts(products, 'BILLED').map((p) => p.productId), [UUID_A, UUID_B, UUID_C]);
    assert.deepStrictEqual(rankProducts(products, 'UNITS').map((p) => p.productId), [UUID_A, UUID_B, UUID_C]);
  });
  await t.test('empate de entidad → entityKey ASC', () => {
    const entities = [entity('ML', '50'), entity(cli(2), '50'), entity('CF', '50'), entity(cli(1), '80')];
    assert.deepStrictEqual(rankEntities(entities).map((e) => e.entityKey), [cli(1), 'CF', cli(2), 'ML']);
  });
  await t.test('comparación Decimal exacta (sin pérdida por Number)', () => {
    const close = [product(UUID_A, 1, '12345678901234.000001', '0'), product(UUID_B, 1, '12345678901234.000002', '0')];
    assert.deepStrictEqual(rankProducts(close, 'BILLED').map((p) => p.productId), [UUID_B, UUID_A]);
  });
  await t.test('Top 5 / Top 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => entity(cli(i + 1), String(1000 - i)));
    assert.deepStrictEqual(rankEntities(many, 5).map((e) => e.entityKey), [1, 2, 3, 4, 5].map(cli));
    assert.strictEqual(rankEntities(many, 10).length, 10);
    assert.strictEqual(rankEntities(many.slice(0, 3), 10).length, 3);
    assert.strictEqual(rankEntities([], 5).length, 0);
  });
  await t.test('no muta la colección de entrada', () => {
    const input = [...products];
    const snapshot = input.map((p) => p.productId);
    rankBy(input, (p) => p.billedArs, (p) => p.productId, 2);
    rankProducts(input, 'CONTRIBUTION');
    assert.deepStrictEqual(input.map((p) => p.productId), snapshot);
  });
});

test('REPORTES R4.2 — dominio: Top 4 + Otros', async (t) => {
  const billed = (list: ProductTotals[]) => productShare(list, 'BILLED');

  await t.test('0 elementos', () => {
    const share = billed([]);
    assert.deepStrictEqual(share.slices, []);
    assert.strictEqual(share.total.toString(), '0');
    assert.strictEqual(share.hasNegative, false);
  });
  await t.test('menos de 4: solo los existentes, sin Otros', () => {
    const share = billed([product(UUID_A, 1, '30', '1'), product(UUID_B, 1, '70', '1')]);
    assert.deepStrictEqual(share.slices.map((s) => s.key), [UUID_B, UUID_A]);
    assert.deepStrictEqual(share.slices.map((s) => str(s.sharePct)), ['70', '30']);
  });
  await t.test('exactamente 4: sin Otros', () => {
    const list = [1, 2, 3, 4].map((n) => product(cli(n).slice(4), 1, String(n * 10), '1'));
    const share = billed(list);
    assert.strictEqual(share.slices.length, 4);
    assert.ok(!share.slices.some((s) => s.key === OTHERS_SLICE_KEY));
  });
  await t.test('más de 4: Top 4 + Otros con suma exacta', () => {
    const list = [
      product('p1', 1, '0.000001', '0'),
      product('p2', 1, '100.123456', '0'),
      product('p3', 1, '200', '0'),
      product('p4', 1, '300', '0'),
      product('p5', 1, '400', '0'),
      product('p6', 1, '0.000002', '0'),
    ];
    const share = billed(list);
    assert.deepStrictEqual(share.slices.map((s) => s.key), ['p5', 'p4', 'p3', 'p2', OTHERS_SLICE_KEY]);
    assert.strictEqual(share.slices[4].value.toString(), '0.000003');
    assert.strictEqual(share.slices[4].label, 'Otros productos');
    const sumSlices = share.slices.reduce((acc, s) => acc.plus(s.value), new Decimal(0));
    assert.strictEqual(sumSlices.toString(), '1000.123459');
    assert.strictEqual(share.total.toString(), '1000.123459');
  });
  await t.test('unidades como métrica', () => {
    const share = productShare([product('p1', 3, '1', '0'), product('p2', 7, '1', '0')], 'UNITS');
    assert.deepStrictEqual(share.slices.map((s) => [s.key, s.value.toString(), str(s.sharePct)]), [
      ['p2', '7', '70'],
      ['p1', '3', '30'],
    ]);
  });
  await t.test('contribución negativa: valores raw conservados, hasNegative, sin porcentajes', () => {
    const list = [
      product('p1', 1, '100', '40'),
      product('p2', 1, '100', '-15.5'),
      product('p3', 1, '100', '10'),
      product('p4', 1, '100', '5'),
      product('p5', 1, '100', '-1'),
    ];
    const share = productShare(list, 'CONTRIBUTION');
    assert.strictEqual(share.hasNegative, true);
    assert.deepStrictEqual(share.slices.map((s) => [s.key, s.value.toString()]), [
      ['p1', '40'],
      ['p3', '10'],
      ['p4', '5'],
      ['p5', '-1'],
      [OTHERS_SLICE_KEY, '-15.5'],
    ]);
    assert.ok(share.slices.every((s) => s.sharePct === null));
    assert.strictEqual(share.total.toString(), '38.5');
  });
  await t.test('negativo oculto dentro de Otros también marca hasNegative', () => {
    const list = ['50', '40', '30', '20', '10', '-1'].map((c, i) => product(`p${i + 1}`, 1, '1', c));
    assert.strictEqual(productShare(list, 'CONTRIBUTION').hasNegative, true);
  });
  await t.test('sin negativos → hasNegative false', () => {
    const list = ['50', '0', '30'].map((c, i) => product(`p${i + 1}`, 1, '1', c));
    const share = productShare(list, 'CONTRIBUTION');
    assert.strictEqual(share.hasNegative, false);
    assert.deepStrictEqual(share.slices.map((s) => str(s.sharePct)), ['62.5', '37.5', '0']);
  });
  await t.test('total 0 sin negativos → porcentajes null (no calculables)', () => {
    const share = topFourPlusOthers([1, 2], () => new Decimal(0), (n) => `k${n}`, (n) => `L${n}`);
    assert.strictEqual(share.hasNegative, false);
    assert.ok(share.slices.every((s) => s.sharePct === null));
  });
});

test('REPORTES R4.2 — dominio: concentración', async (t) => {
  const assertSumsTo100 = (c: ReturnType<typeof concentration>) => {
    assert.ok(c.slices);
    const sum = c.slices.reduce((acc, s) => acc.plus(s.pct), new Decimal(0));
    assert.strictEqual(sum.toString(), '100');
    const billedSum = c.slices.reduce((acc, s) => acc.plus(s.billedArs), new Decimal(0));
    assert.strictEqual(billedSum.toString(), c.totalBilledArs.toString());
  };

  await t.test('sin entidades → sin datos, nunca 0%', () => {
    const c = concentration([]);
    assert.strictEqual(c.hasData, false);
    assert.deepStrictEqual([c.top5Pct, c.top10Pct, c.restPct, c.slices], [null, null, null, null]);
  });
  await t.test('total 0 con entidades → sin datos, nunca 0%', () => {
    const c = concentration([entity('ML', '0'), entity(cli(1), '0')]);
    assert.strictEqual(c.hasData, false);
    assert.deepStrictEqual([c.top5Pct, c.top10Pct, c.restPct, c.slices], [null, null, null, null]);
  });
  await t.test('menos de 5: Top 5 = Top 10 = 100, Resto = 0', () => {
    const c = concentration([entity('ML', '30'), entity('CF', '70')]);
    assert.strictEqual(c.hasData, true);
    assert.deepStrictEqual([str(c.top5Pct), str(c.top10Pct), str(c.restPct)], ['100', '100', '0']);
    assert.deepStrictEqual(c.slices?.map((s) => [s.group, s.pct.toString()]), [
      ['POS_1_5', '100'],
      ['POS_6_10', '0'],
      ['REST', '0'],
    ]);
    assertSumsTo100(c);
  });
  await t.test('exactamente 5', () => {
    const c = concentration([1, 2, 3, 4, 5].map((n) => entity(cli(n), '20')));
    assert.deepStrictEqual([str(c.top5Pct), str(c.top10Pct), str(c.restPct)], ['100', '100', '0']);
    assertSumsTo100(c);
  });
  await t.test('entre 6 y 9 (ejemplo 7): Top 10 = 100, Resto = 0', () => {
    const c = concentration(['40', '20', '10', '10', '10', '5', '5'].map((b, i) => entity(cli(i + 1), b)));
    assert.deepStrictEqual([str(c.top5Pct), str(c.top10Pct), str(c.restPct)], ['90', '100', '0']);
    assert.deepStrictEqual(c.slices?.map((s) => s.pct.toString()), ['90', '10', '0']);
    assertSumsTo100(c);
  });
  await t.test('exactamente 10', () => {
    const c = concentration(Array.from({ length: 10 }, (_, i) => entity(cli(i + 1), '10')));
    assert.deepStrictEqual([str(c.top5Pct), str(c.top10Pct), str(c.restPct)], ['50', '100', '0']);
    assertSumsTo100(c);
  });
  await t.test('más de 10: acumulados Top 5 / Top 10 y grupos 1–5 / 6–10 / resto (ejemplo 43/67/33)', () => {
    const billed = ['15', '10', '8', '6', '4', '6', '6', '4', '4', '4', '33'];
    const entities = billed.map((b, i) => entity(cli(i + 1), b));
    // Orden por facturación: 33, 15, 10, 8, 6, 6, 6 | 4, 4, 4 | 4 → posiciones 1–5 = 33+15+10+8+6 = 72 ...
    const c = concentration(entities);
    assert.strictEqual(c.totalBilledArs.toString(), '100');
    assert.deepStrictEqual([str(c.top5Pct), str(c.top10Pct), str(c.restPct)], ['72', '96', '4']);
    assert.deepStrictEqual(c.slices?.map((s) => [s.group, s.pct.toString(), s.billedArs.toString()]), [
      ['POS_1_5', '72', '72'],
      ['POS_6_10', '24', '24'],
      ['REST', '4', '4'],
    ]);
    assertSumsTo100(c);
  });
  await t.test('ejemplo de la especificación: Top 5 = 43, Top 10 = 67, Resto = 33', () => {
    const billed = ['10', '9', '9', '8', '7', '5', '5', '5', '5', '4', ...Array.from({ length: 33 }, () => '1')];
    const c = concentration(billed.map((b, i) => entity(cli(i + 1), b)));
    assert.deepStrictEqual([str(c.top5Pct), str(c.top10Pct), str(c.restPct)], ['43', '67', '33']);
    assert.deepStrictEqual(c.slices?.map((s) => s.pct.toString()), ['43', '24', '33']);
    assertSumsTo100(c);
  });
  await t.test('empates en el corte: orden por entityKey ASC, porcentajes estables', () => {
    const entities = [entity('ML', '10'), entity('CF', '10'), ...[1, 2, 3, 4].map((n) => entity(cli(n), '10'))];
    const c = concentration(entities);
    assert.deepStrictEqual(rankEntities(entities, 5).map((e) => e.entityKey), ['CF', cli(1), cli(2), cli(3), cli(4)]);
    assert.strictEqual(c.slices?.[0].billedArs.toString(), '50');
    assert.strictEqual(str(c.top5Pct), new Decimal(50).times(100).div(60).toDecimalPlaces(24).toString());
    assertSumsTo100(c);
  });
  await t.test('porcentajes periódicos: los grupos suman exactamente 100', () => {
    const billed = ['1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1'];
    const c = concentration(billed.map((b, i) => entity(cli(i + 1), b)));
    assert.ok(c.top5Pct && !c.top5Pct.isInteger());
    assertSumsTo100(c);
    const odd = concentration(['3', '1', '1', '1', '1', '7', '1', '1', '1', '1', '13', '2'].map((b, i) => entity(cli(i + 1), b)));
    assertSumsTo100(odd);
  });
  await t.test('no muta la colección de entrada', () => {
    const entities = [entity(cli(2), '1'), entity(cli(1), '9')];
    concentration(entities);
    assert.deepStrictEqual(entities.map((e) => e.entityKey), [cli(2), cli(1)]);
  });
});
