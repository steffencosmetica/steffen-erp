import { BaseSupabaseRepository } from './base.repository';
import { Decimal, toNumericString } from '@/domain/decimal';
import { DomainError } from '@/domain/errors';
import { readExactDecimal } from './exact-numeric';

/** Cotización global vigente USD → ARS (exchange_rates.is_current). */
export interface CurrentExchangeRateRecord {
  rateToArs: Decimal;
  effectiveAt: string;
}

export interface SetExchangeRateResult {
  id: string;
  rateToArs: Decimal;
  previousRateToArs: Decimal | null;
  effectiveAt: string;
}

export interface IExchangeRateRepository {
  getCurrentUsdRate(): Promise<CurrentExchangeRateRecord | null>;
  setCurrentUsdRateAtomic(rateToArs: Decimal): Promise<SetExchangeRateResult>;
}

type RpcCaller = (
  fn: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Única implementación de lectura/escritura de la cotización GLOBAL. La cotización
 * particular de una compra (purchases.exchange_rate_used) nunca pasa por acá.
 */
export class ExchangeRateRepository extends BaseSupabaseRepository implements IExchangeRateRepository {
  async getCurrentUsdRate(): Promise<CurrentExchangeRateRecord | null> {
    const { data, error } = await this.client
      .from('exchange_rates')
      .select('rate_to_ars::text, effective_at')
      .eq('currency_code', 'USD')
      .eq('is_current', true)
      .order('effective_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new DomainError(`Error consultando cotización USD vigente: ${error.message}`);
    }
    const row = data?.[0];
    if (!row) return null;

    return {
      rateToArs: readExactDecimal(row.rate_to_ars, 'exchange_rates.rate_to_ars'),
      effectiveAt: row.effective_at,
    };
  }

  async setCurrentUsdRateAtomic(rateToArs: Decimal): Promise<SetExchangeRateResult> {
    const rpc = this.client.rpc.bind(this.client) as unknown as RpcCaller;
    const { data, error } = await rpc('set_current_exchange_rate_atomic', {
      p_currency_code: 'USD',
      p_rate_to_ars: toNumericString(rateToArs),
    });

    if (error) {
      throw new DomainError(`Error actualizando la cotización USD: ${error.message}`);
    }
    if (typeof data !== 'object' || data === null) {
      throw new DomainError('set_current_exchange_rate_atomic: respuesta inesperada de la base.');
    }
    const res = data as Record<string, unknown>;
    if (typeof res.id !== 'string' || typeof res.effective_at !== 'string') {
      throw new DomainError('set_current_exchange_rate_atomic: respuesta incompleta.');
    }

    return {
      id: res.id,
      rateToArs: readExactDecimal(res.rate_to_ars, 'set_current_exchange_rate_atomic.rate_to_ars'),
      previousRateToArs:
        typeof res.previous_rate_to_ars === 'string'
          ? readExactDecimal(res.previous_rate_to_ars, 'set_current_exchange_rate_atomic.previous_rate_to_ars')
          : null,
      effectiveAt: res.effective_at,
    };
  }
}
