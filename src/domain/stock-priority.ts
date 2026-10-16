import { Decimal } from './decimal';

/**
 * Prioridad de stock (BUSINESS_RULES §8.3): ratio = stock_actual / stock_mínimo,
 * orden ascendente (más críticos primero), desempate por código. Aplica a PRO,
 * MPR y COM. Aritmética exacta Decimal; un mínimo ausente/no positivo se trata
 * como 1 (el mínimo normativo nunca es 0).
 */
export interface StockPriorityItem {
  code: string;
  balance: Decimal;
  stockMinimum: Decimal | null | undefined;
}

export function stockRatio(item: StockPriorityItem): Decimal {
  const min = item.stockMinimum && item.stockMinimum.gt(0) ? item.stockMinimum : new Decimal(1);
  return item.balance.dividedBy(min);
}

export function compareStockPriority(a: StockPriorityItem, b: StockPriorityItem): number {
  const ratioA = stockRatio(a);
  const ratioB = stockRatio(b);
  if (!ratioA.equals(ratioB)) {
    return ratioA.comparedTo(ratioB);
  }
  return a.code.localeCompare(b.code);
}

/** Debajo del mínimo: ratio < 1 (se destaca en rojo). */
export function isBelowStockMinimum(item: StockPriorityItem): boolean {
  return !!item.stockMinimum && item.stockMinimum.gt(0) && item.balance.lt(item.stockMinimum);
}

