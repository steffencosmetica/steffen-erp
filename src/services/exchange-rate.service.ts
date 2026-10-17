import { Decimal } from '@/domain/decimal';
import { DomainError } from '@/domain/errors';
import {
  ExchangeRateRepository,
  type IExchangeRateRepository,
  type CurrentExchangeRateRecord,
  type SetExchangeRateResult,
} from '@/repositories/exchange-rate.repository';

/**
 * Cotización GLOBAL USD → ARS del ERP (una sola vigente, con historial).
 * Stock, Fórmulas, Productos, Compras (sugerencia) y Dashboard leen esta cotización;
 * la cotización de una CMP queda solo en su snapshot y nunca la modifica.
 */
export class ExchangeRateDomainService {
  constructor(private readonly repo: IExchangeRateRepository = new ExchangeRateRepository()) {}

  async getCurrentUsdRate(): Promise<CurrentExchangeRateRecord | null> {
    return this.repo.getCurrentUsdRate();
  }

  /** Nueva cotización vigente (string/Decimal exacto, nunca Number). */
  async setCurrentUsdRate(rate: Decimal | string): Promise<SetExchangeRateResult> {
    let value: Decimal;
    try {
      value = new Decimal(rate);
    } catch {
      throw new DomainError('La cotización ingresada no es un número válido.');
    }
    if (!value.isFinite() || value.lte(0)) {
      throw new DomainError('La cotización debe ser mayor a cero.');
    }
    if (value.decimalPlaces() > 6) {
      throw new DomainError('La cotización admite como máximo 6 decimales.');
    }
    return this.repo.setCurrentUsdRateAtomic(value);
  }
}
