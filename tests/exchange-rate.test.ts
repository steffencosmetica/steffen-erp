import test, { mock } from 'node:test';
import assert from 'node:assert';
import React from 'react';

/**
 * Cotización GLOBAL USD → ARS: persistencia (repositorio + RPC), regla de una sola
 * vigente con historial, costo teórico y UsdRateCard. Sin red ni base de datos:
 * el cliente Supabase se emula en memoria con la misma semántica que
 * set_current_exchange_rate_atomic (migración 20261002000035).
 */

mock.module('@/database/server', {
  namedExports: { serverSupabase: {}, getServerSupabaseClient: () => ({}) },
});
mock.module('next/navigation', {
  namedExports: { useRouter: () => ({ refresh: () => undefined, push: () => undefined }) },
});
// UsdRateCard importa la Server Action: se reemplaza por un stub (el render no la invoca).
mock.module('@/actions/exchange-rate.actions', {
  namedExports: { updateUsdExchangeRateAction: async () => ({ success: true }) },
});

interface RateRow {
  id: string;
  currency_code: string;
  rate_to_ars: string; // NUMERIC como texto exacto
  effective_at: string;
  is_current: boolean;
}

/** Cliente Supabase mínimo en memoria: tabla exchange_rates + RPC de escritura. */
function createFakeClient() {
  const rows: RateRow[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let clock = Date.parse('2026-10-16T12:00:00Z');

  const client = {
    from(table: string) {
      assert.strictEqual(table, 'exchange_rates');
      const filters: Array<[keyof RateRow, unknown]> = [];
      let selected = '';
      const query = {
        select(cols: string) {
          selected = cols;
          return query;
        },
        eq(col: keyof RateRow, value: unknown) {
          filters.push([col, value]);
          return query;
        },
        order() {
          return query;
        },
        limit(n: number) {
          // La lectura canónica debe pedir NUMERIC como texto exacto.
          assert.ok(selected.includes('rate_to_ars::text'), `select sin ::text: ${selected}`);
          const data = rows
            .filter((r) => filters.every(([c, v]) => r[c] === v))
            .sort((a, b) => b.effective_at.localeCompare(a.effective_at))
            .slice(0, n)
            .map((r) => ({ rate_to_ars: r.rate_to_ars, effective_at: r.effective_at }));
          return Promise.resolve({ data, error: null });
        },
      };
      return query;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      assert.strictEqual(fn, 'set_current_exchange_rate_atomic');
      assert.strictEqual(typeof args.p_rate_to_ars, 'string', 'el importe viaja como string exacto, nunca Number');
      const rate = String(args.p_rate_to_ars);
      if (!/^\d+(\.\d{1,6})?$/.test(rate) || !/[1-9]/.test(rate)) {
        return Promise.resolve({ data: null, error: { message: 'La cotización debe ser mayor a cero.' } });
      }
      const previous = rows.find((r) => r.currency_code === args.p_currency_code && r.is_current);
      if (previous) previous.is_current = false;
      clock += 60_000;
      const row: RateRow = {
        id: `rate-${rows.length + 1}`,
        currency_code: String(args.p_currency_code),
        rate_to_ars: rate,
        effective_at: new Date(clock).toISOString(),
        is_current: true,
      };
      rows.push(row);
      return Promise.resolve({
        data: {
          id: row.id,
          currency_code: row.currency_code,
          rate_to_ars: row.rate_to_ars,
          previous_rate_to_ars: previous ? previous.rate_to_ars : null,
          effective_at: row.effective_at,
        },
        error: null,
      });
    },
  };
  return { client, rows, rpcCalls };
}

test('Cotización global USD → ARS', async (t) => {
  const { ExchangeRateRepository } = await import('../src/repositories/exchange-rate.repository');
  const { ExchangeRateDomainService } = await import('../src/services/exchange-rate.service');
  const { SupplierItemRepository } = await import('../src/repositories/supplier-item.repository');
  const { computeCurrentItemCostArs } = await import('../src/services/cost-engine.service');
  const { DomainError } = await import('../src/domain/errors');
  const { Decimal } = await import('../src/domain/decimal');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { UsdRateCard } = await import('../src/ui/components/UsdRateCard');

  type RepoClient = ConstructorParameters<typeof ExchangeRateRepository>[0];
  const fake = createFakeClient();
  const client = fake.client as unknown as RepoClient;
  const service = new ExchangeRateDomainService(new ExchangeRateRepository(client));
  const supplierItemRepo = new SupplierItemRepository(client);

  await t.test('sin cotización: lectura canónica devuelve null (Stock: "Sin cotización", Fórmulas: error)', async () => {
    assert.strictEqual(await service.getCurrentUsdRate(), null);
    assert.strictEqual(await supplierItemRepo.getCurrentUsdExchangeRate(), null);
    assert.strictEqual(computeCurrentItemCostArs(new Decimal('1'), 'USD', null), null);
  });

  await t.test('crear la primera cotización vigente', async () => {
    const res = await service.setCurrentUsdRate('1350');
    assert.strictEqual(res.rateToArs.toString(), '1350');
    assert.strictEqual(res.previousRateToArs, null);
    const current = await service.getCurrentUsdRate();
    assert.strictEqual(current?.rateToArs.toString(), '1350');
  });

  await t.test('actualizar 1350 → 1420: una sola vigente e historial preservado', async () => {
    const res = await service.setCurrentUsdRate('1420');
    assert.strictEqual(res.previousRateToArs?.toString(), '1350');
    assert.strictEqual((await service.getCurrentUsdRate())?.rateToArs.toString(), '1420');
    assert.strictEqual(fake.rows.filter((r) => r.is_current).length, 1, 'máximo una vigente');
    assert.deepStrictEqual(
      fake.rows.map((r) => [r.rate_to_ars, r.is_current]),
      [
        ['1350', false],
        ['1420', true],
      ],
      'la anterior queda en el historial, no se borra'
    );
  });

  await t.test('rate 0, negativo, inválido o con más de 6 decimales rechazado (sin llamar a la base)', async () => {
    const callsBefore = fake.rpcCalls.length;
    for (const bad of ['0', '-1', '-1350', 'abc', '', '1.0000001']) {
      await assert.rejects(service.setCurrentUsdRate(bad), DomainError, `"${bad}"`);
    }
    assert.strictEqual(fake.rpcCalls.length, callsBefore);
    assert.strictEqual((await service.getCurrentUsdRate())?.rateToArs.toString(), '1420', 'vigente intacta');
  });

  await t.test('Decimal exacto: 1239.671234 se persiste y se lee sin pérdida', async () => {
    await service.setCurrentUsdRate('1239.671234');
    assert.strictEqual(fake.rpcCalls.at(-1)?.args.p_rate_to_ars, '1239.671234');
    assert.strictEqual((await supplierItemRepo.getCurrentUsdExchangeRate())?.toString(), '1239.671234');
  });

  await t.test('Stock/Fórmulas leen la global actual: 1000 → 1210; 1200 → 1452', async () => {
    const usd1 = new Decimal('1');
    await service.setCurrentUsdRate('1000');
    let cost = computeCurrentItemCostArs(usd1, 'USD', await supplierItemRepo.getCurrentUsdExchangeRate());
    assert.deepStrictEqual([cost?.netArs.toString(), cost?.grossArs.toString()], ['1000', '1210']);

    await service.setCurrentUsdRate('1200');
    cost = computeCurrentItemCostArs(usd1, 'USD', await supplierItemRepo.getCurrentUsdExchangeRate());
    assert.deepStrictEqual([cost?.netArs.toString(), cost?.grossArs.toString()], ['1200', '1452']);
  });

  await t.test('CMP con exchange_rate_used = 1600 no altera la global (sigue 1200)', async () => {
    // La CMP guarda su cotización solo en su snapshot (purchases.exchange_rate_used). Las RPC de
    // compra (20261002000017/18) solo LEEN exchange_rates y el código de compras nunca invoca la
    // escritura global: se verifica sobre las fuentes reales.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.join(__dirname, '..');
    for (const file of [
      'supabase/migrations/20261002000017_create_and_update_purchase_atomic.sql',
      'supabase/migrations/20261002000018_fix_update_purchase_atomic.sql',
    ]) {
      const sql = fs.readFileSync(path.join(root, file), 'utf8');
      assert.match(sql, /p_exchange_rate_used/, `${file}: la CMP recibe su propia cotización`);
      assert.doesNotMatch(sql, /(INSERT INTO|UPDATE)\s+public\.exchange_rates/i, `${file} no escribe la global`);
    }
    for (const file of ['src/services/purchase.service.ts', 'src/repositories/purchase.repository.ts', 'src/actions/purchase.actions.ts']) {
      if (!fs.existsSync(path.join(root, file))) continue;
      const code = fs.readFileSync(path.join(root, file), 'utf8');
      assert.doesNotMatch(code, /set_current_exchange_rate_atomic|setCurrentUsdRate/, `${file} no modifica la global`);
    }
    assert.strictEqual((await supplierItemRepo.getCurrentUsdExchangeRate())?.toString(), '1200');
    const cost = computeCurrentItemCostArs(new Decimal('1'), 'USD', await supplierItemRepo.getCurrentUsdExchangeRate());
    assert.strictEqual(cost?.grossArs.toString(), '1452');
  });

  await t.test('UsdRateCard: muestra el valor persistido y el input vacío con placeholder', () => {
    for (const layout of ['inline', 'stacked'] as const) {
      const html = renderToStaticMarkup(React.createElement(UsdRateCard, { currentUsdRate: '1350', layout }));
      assert.match(html, /Actual: <span[^>]*>\$ 1\.350,00<\/span>/, layout);
      assert.match(html, /<input[^>]*placeholder="Nueva cotización"/);
      assert.match(html, /<input[^>]*value=""/, 'input vacío');
      assert.doesNotMatch(html, /<input[^>]*value="1/, 'el input no se precarga con la cotización');
    }
    const empty = renderToStaticMarkup(React.createElement(UsdRateCard, { currentUsdRate: null }));
    assert.match(empty, /Actual: <span[^>]*>Sin cotización<\/span>/);
    assert.match(empty, /<input[^>]*value=""/);
  });
});
