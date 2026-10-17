import { Decimal } from '@/domain/decimal';
import { formatArs } from './format';

export interface ItemPriceSource {
  supplierCurrency: 'ARS' | 'USD' | null;
  /** Precio neto vigente del proveedor en su moneda (USD o ARS). */
  quotedPriceNet: string | null;
  /** P.U $ calculado por backend (cost engine, cotización global vigente). */
  theoreticalCostNetArs: string | null;
  /** P.U + IVA calculado por backend. */
  theoreticalCostGrossArs: string | null;
}

export interface ItemPriceDisplays {
  usd: string;
  ars: string;
  grossArs: string;
}

/** USD de presentación: miles con coma, hasta 2 decimales (`usd 1.5` → `usd 1.50`, `usd 1`). */
function formatUsd(value: string): string {
  const d = new Decimal(value);
  const fixed = d.decimalPlaces() === 0 ? d.toFixed(0) : d.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  return `usd ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decPart ? `.${decPart}` : ''}`;
}

/**
 * Columnas P.U USD / P.U $ / P.U + IVA de Stock (MPR/COM). Solo presentación: los
 * importes ARS llegan ya calculados por el backend; acá no se aplica cotización ni IVA.
 * - USD: P.U USD = precio USD; P.U $ y P.U + IVA en ARS a cotización global vigente.
 * - ARS: P.U USD = "-"; P.U $ = neto ARS; P.U + IVA = neto × 1,21.
 * - USD sin cotización global vigente: P.U $ = "Sin cotización", P.U + IVA = "-".
 */
export function itemPriceDisplays(item: ItemPriceSource): ItemPriceDisplays {
  if (!item.quotedPriceNet || !item.supplierCurrency) {
    return { usd: '-', ars: '-', grossArs: '-' };
  }
  const isUsd = item.supplierCurrency === 'USD';
  return {
    usd: isUsd ? formatUsd(item.quotedPriceNet) : '-',
    ars: item.theoreticalCostNetArs ? formatArs(item.theoreticalCostNetArs) : isUsd ? 'Sin cotización' : '-',
    grossArs: item.theoreticalCostGrossArs ? formatArs(item.theoreticalCostGrossArs) : '-',
  };
}
