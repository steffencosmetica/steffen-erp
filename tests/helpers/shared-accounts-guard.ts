/**
 * Aislamiento de cuentas financieras compartidas (Caja Steffen / Caja Mercado
 * Libre) en tests contra la DB compartida.
 *
 * Las RPCs de negocio actualizan `financial_accounts.current_balance` junto con
 * sus `financial_entries`. Al limpiar los artefactos propios (MOV -> entries en
 * cascada) el saldo de la caja NO se revierte. Este helper:
 *
 *  1. captura, ANTES de la suite, el `current_balance` exacto (texto NUMERIC)
 *     de cada cuenta compartida y los ids de los asientos ya existentes;
 *  2. tras la limpieza de artefactos propios, exige que sobre esas cuentas no
 *     quede ningún asiento nuevo (si quedara es un artefacto propio sin limpiar
 *     o actividad ajena concurrente: falla SIN restaurar, nunca pisa actividad
 *     real);
 *  3. restaura (solo en teardown de tests) el saldo capturado y verifica que
 *     quede exactamente igual.
 *
 * No crea movimientos compensatorios ni recalcula saldos desde el ledger.
 */
import assert from 'node:assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Decimal } from '../../src/domain/decimal';
import type { Database } from '../../src/database/types';

export const SHARED_ACCOUNT_TYPES = ['CASH_STEFFEN', 'CASH_MERCADO_LIBRE'] as const;

interface SharedBalance {
  accountType: string;
  balance: string;
}

export interface SharedAccountsSnapshot {
  balances: Map<string, SharedBalance>;
  entryIds: Set<string>;
}

async function readSharedBalances(supabase: SupabaseClient<Database>): Promise<Map<string, SharedBalance>> {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, account_type, balance:current_balance::text')
    .in('account_type', [...SHARED_ACCOUNT_TYPES]);
  assert.ifError(error);
  return new Map((data || []).map((row) => [row.id, { accountType: row.account_type, balance: row.balance }]));
}

async function readEntries(
  supabase: SupabaseClient<Database>,
  accountIds: string[]
): Promise<{ id: string; financial_account_id: string; delta: string }[]> {
  const rows: { id: string; financial_account_id: string; delta: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('financial_entries')
      .select('id, financial_account_id, delta:delta_ars::text')
      .in('financial_account_id', accountIds)
      .order('id')
      .range(from, from + 999);
    assert.ifError(error);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function snapshotSharedAccounts(supabase: SupabaseClient<Database>): Promise<SharedAccountsSnapshot> {
  const balances = await readSharedBalances(supabase);
  const entries = await readEntries(supabase, [...balances.keys()]);
  return { balances, entryIds: new Set(entries.map((e) => e.id)) };
}

/**
 * Llamar al FINAL del teardown, después de borrar todos los artefactos propios.
 * Falla explícitamente si la suite dejó asientos sobre las cuentas compartidas
 * o si el saldo no queda exactamente igual al capturado.
 */
export async function restoreSharedAccounts(
  supabase: SupabaseClient<Database>,
  snapshot: SharedAccountsSnapshot,
  suiteName: string
): Promise<void> {
  const accountIds = [...snapshot.balances.keys()];
  const newEntries = (await readEntries(supabase, accountIds)).filter((e) => !snapshot.entryIds.has(e.id));
  assert.deepStrictEqual(
    newEntries,
    [],
    `${suiteName}: quedaron asientos nuevos sobre cuentas compartidas (artefacto propio sin limpiar ` +
      'o actividad ajena concurrente); no se restaura el saldo.'
  );

  const current = await readSharedBalances(supabase);
  for (const [id, before] of snapshot.balances) {
    const now = current.get(id);
    assert.ok(now, `${suiteName}: la cuenta compartida ${id} desapareció`);
    if (new Decimal(now.balance).eq(before.balance)) continue;

    // Restauración test-only del saldo preexistente. Se exige que el valor sea
    // representable exactamente como number (<= 15 dígitos significativos)
    // para no degradar NUMERIC al enviarlo por PostgREST.
    const target = new Decimal(before.balance);
    assert.ok(target.sd(true) <= 15, `${suiteName}: saldo ${before.balance} no representable exactamente; restaurar a mano`);
    const { error } = await supabase.from('financial_accounts').update({ current_balance: target.toNumber() }).eq('id', id);
    assert.ifError(error);
  }

  const after = await readSharedBalances(supabase);
  for (const [id, before] of snapshot.balances) {
    const now = after.get(id);
    assert.ok(
      now && new Decimal(now.balance).eq(before.balance),
      `${suiteName}: ${before.accountType} quedó en ${now?.balance} (antes de la suite: ${before.balance})`
    );
  }
}
