import test from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';

/** Fase 19.1 — Tablas y RPCs nuevas: exclusivamente service_role (mismo criterio que 20261002000031). */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const server = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

function isDenied(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42501' || /permission denied|not found|could not find/i.test(error.message);
}

test('Fase 19.1 — anon no accede a saldos de apertura ni ingresos de caja', async (t) => {
  await t.test('los objetos existen para service_role (la denegación no es por ausencia)', async () => {
    const { error: tableErr } = await server.from('opening_balances').select('id').limit(1);
    assert.ifError(tableErr);
    const { error: depositErr } = await server.from('cash_deposits').select('id').limit(1);
    assert.ifError(depositErr);
    const { data, error } = await server.rpc('get_opening_balance_state', {
      p_party_type: 'CUSTOMER',
      p_party_id: '00000000-0000-4000-8000-000000000000',
    });
    assert.ifError(error);
    assert.deepStrictEqual(data, { account_id: null });
  });

  for (const table of ['opening_balances', 'cash_deposits']) {
    await t.test(`SELECT ${table} bloqueado para anon`, async () => {
      const { error } = await anon.from(table).select('id').limit(1);
      assert.ok(isDenied(error), `${table} no debe ser legible por anon (${error?.message})`);
    });
  }

  const rpcs: Array<[string, Record<string, unknown>]> = [
    ['register_cash_deposit_atomic', { p_amount_ars: '1', p_description: 'x', p_business_date: '2026-10-12' }],
    [
      'register_opening_balance_atomic',
      { p_financial_account_id: '00000000-0000-4000-8000-000000000000', p_amount_ars: '1', p_business_date: '2026-10-12', p_observation: null },
    ],
    [
      'edit_opening_balance_atomic',
      { p_opening_balance_id: '00000000-0000-4000-8000-000000000000', p_new_amount_ars: '1', p_new_business_date: '2026-10-12', p_observation: null },
    ],
    ['delete_opening_balance_atomic', { p_opening_balance_id: '00000000-0000-4000-8000-000000000000' }],
    ['get_opening_balance_state', { p_party_type: 'CUSTOMER', p_party_id: '00000000-0000-4000-8000-000000000000' }],
  ];
  for (const [fn, args] of rpcs) {
    await t.test(`RPC ${fn} bloqueada para anon`, async () => {
      const { error } = await anon.rpc(fn, args);
      assert.ok(isDenied(error), `${fn} no debe ser ejecutable por anon (${error?.message})`);
    });
  }
});
