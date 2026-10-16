import { Decimal } from './decimal';

/**
 * Simular compra (Dashboard → BAJO STOCK). Solo simulación: no crea compras,
 * movimientos ni cambios de stock (BUSINESS_RULES §35.2).
 *
 * MPR: kg, >= 0, hasta 3 decimales. COM: unidades enteras, >= 0.
 * Importe = cantidad × costo bruto vigente en ARS (ya incluye IVA: no se multiplica por 1,21).
 */
export type SimulationItemType = 'MPR' | 'COM';

const KG_QUANTITY_RE = /^\d*(?:[.,]\d{0,3})?$/;
const UNIT_QUANTITY_RE = /^\d*$/;

/** Valida el texto (también parcial mientras se escribe, p. ej. "12," o vacío). */
export function isValidSimulationQuantity(itemType: SimulationItemType, raw: string): boolean {
  return (itemType === 'MPR' ? KG_QUANTITY_RE : UNIT_QUANTITY_RE).test(raw);
}

export function parseSimulationQuantity(raw: string): Decimal {
  const normalized = raw.replace(',', '.');
  if (!normalized || normalized === '.') return new Decimal(0);
  return new Decimal(normalized);
}

/** Cantidad simulada × costo vigente; sin costo de referencia o cantidad inválida → 0. */
export function simulatedPurchaseAmount(
  itemType: SimulationItemType,
  raw: string,
  unitCostGrossArs: string | null
): Decimal {
  if (!unitCostGrossArs || !isValidSimulationQuantity(itemType, raw)) return new Decimal(0);
  return parseSimulationQuantity(raw).mul(unitCostGrossArs);
}
