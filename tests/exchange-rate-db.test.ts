import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/database/types';
import { ExchangeRateRepository } from '../src/repositories/exchange-rate.repository';
import { ExchangeRateDomainService } from '../src/services/exchange-rate.service';
import { Decimal } from '../src/domain/decimal';
import { DomainError } from '../src/domain/errors';

/**
 * Integración (DB dev, NUNCA producción) de set_current_exchange_rate_atomic
 * (migración 20261002000035). Restaura la cotización vigente previa al terminar
 * y elimina solo las filas creadas por la suite.
 */
const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const raw = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

test('DB — cotización global USD (set_current_exchange_rate_atomic)', async (t) => {
  const service = new ExchangeRateDomainService(new ExchangeRateRepository(supabase));
  const createdIds: string[] = [];
  let previousCurrentId: string | null = null;

  t.before(async () => {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('id')
      .eq('currency_code', 'USD')
      .eq('is_current', true);
    assert.ifError(error);
    previousCurrentId = data?.[0]?.id ?? null;
  });

  t.after(async () => {
    if (createdIds.length > 0) {
      await supabase.from('exchange_rates').delete().in('id', createdIds);
    }
    if (previousCurrentId) {
      await supabase.from('exchange_rates').update({ is_current: true }).eq('id', previousCurrentId);
    }
    const { data } = await supabase.from('exchange_rates').select('id').eq('currency_code', 'USD').eq('is_current', true);
    assert.deepStrictEqual(
      (data || []).map((r) => r.id),
      previousCurrentId ? [previousCurrentId] : [],
      'la vigente previa queda restaurada'
    );
  });

  await t.test('crear y actualizar: una sola vigente, historial preservado, NUMERIC exacto', async () => {
    const first = await service.setCurrentUsdRate('1350.123456');
    createdIds.push(first.id);
    assert.strictEqual(first.rateToArs.toString(), '1350.123456');

    const second = await service.setCurrentUsdRate('1420');
    createdIds.push(second.id);
    assert.strictEqual(second.previousRateToArs?.toString(), '1350.123456');

    const { data, error } = await supabase
      .from('exchange_rates')
      .select('id, is_current, rate:rate_to_ars::text')
      .in('id', createdIds);
    assert.ifError(error);
    const byId = new Map((data || []).map((r) => [r.id, r]));
    assert.strictEqual(byId.get(first.id)?.is_current, false, 'la anterior deja de ser vigente pero se conserva');
    assert.strictEqual(byId.get(second.id)?.is_current, true);
    assert.ok(new Decimal(byId.get(first.id)!.rate).eq('1350.123456'));

    const { count } = await supabase
      .from('exchange_rates')
      .select('id', { count: 'exact', head: true })
      .eq('currency_code', 'USD')
      .eq('is_current', true);
    assert.strictEqual(count, 1);
    assert.strictEqual((await service.getCurrentUsdRate())?.rateToArs.toString(), '1420');
  });

  await t.test('PostgreSQL rechaza 0, negativos, más de 6 decimales y monedas distintas de USD', async () => {
    const repo = new ExchangeRateRepository(supabase);
    for (const bad of ['0', '-5', '1.0000001']) {
      await assert.rejects(repo.setCurrentUsdRateAtomic(new Decimal(bad)), DomainError, bad);
    }
    const { error } = await raw.rpc('set_current_exchange_rate_atomic', { p_currency_code: 'ARS', p_rate_to_ars: '1' });
    assert.ok(error, 'solo USD');
    assert.strictEqual((await service.getCurrentUsdRate())?.rateToArs.toString(), '1420', 'vigente intacta');
  });

  await t.test('anon no puede ejecutar la RPC', async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc('set_current_exchange_rate_atomic', { p_currency_code: 'USD', p_rate_to_ars: '1' });
    assert.ok(error);
  });
});
