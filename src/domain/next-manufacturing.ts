import { Decimal } from './decimal';

/**
 * Próxima fabricación — única fuente de la regla para Mi Fábrica y Dashboard
 * (BAJO STOCK → Producto Final). BUSINESS_RULES §35.4:
 *
 * - URG PARA PEDIDOS: el Producto Final es requerido por Pedidos OPEN y la
 *   planificación (mismo motor que Pedidos: stock + granel virtual por prioridad)
 *   deja faltante. Tiene prioridad sobre POCO STOCK.
 * - POCO STOCK: sin urgencia por pedidos, stock actual <= stock mínimo.
 *
 * Orden: primero los urgentes, luego POCO STOCK; dentro de cada grupo se conserva
 * el orden de entrada.
 */
export interface NextManufacturingSource {
  productId: string;
  name: string;
  active: boolean;
  baseProductId: string;
  stockMinimum?: Decimal | null;
  balance: Decimal;
}

export interface NextManufacturingProduct {
  productId: string;
  name: string;
  baseProductId: string;
  stockMinimum: Decimal;
  balance: Decimal;
  isUrgentForOrders: boolean;
}

/** Fila de planificación necesaria para detectar urgencia (PlanningProductRow). */
export interface PlanningShortageRow {
  productId: string;
  finalShortage: number;
}

/** Productos requeridos por Pedidos OPEN con faltante final según la planificación. */
export function urgentProductIdsFromPlanning(rows: PlanningShortageRow[]): Set<string> {
  return new Set(rows.filter((r) => r.finalShortage > 0).map((r) => r.productId));
}

export function selectNextManufacturingProducts(
  products: NextManufacturingSource[],
  urgentProductIds: ReadonlySet<string>
): NextManufacturingProduct[] {
  const selected = products
    .filter((p) => p.active)
    .map((p) => ({
      source: p,
      urgent: urgentProductIds.has(p.productId),
      lowStock: !!p.stockMinimum && p.balance.lte(p.stockMinimum),
    }))
    .filter((x) => x.urgent || x.lowStock);

  return [...selected.filter((x) => x.urgent), ...selected.filter((x) => !x.urgent)].map(({ source, urgent }) => ({
    productId: source.productId,
    name: source.name,
    baseProductId: source.baseProductId,
    stockMinimum: source.stockMinimum ?? new Decimal(0),
    balance: source.balance,
    isUrgentForOrders: urgent,
  }));
}
