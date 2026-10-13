import { Decimal } from '@/domain/decimal';
import type {
  PlanningSnapshot,
  PlanningSnapshotOrder,
  PlanningSnapshotProduct,
  PlanningSnapshotBomItem,
  IPlanningRepository,
} from '@/repositories/planning.repository';
import { PlanningRepository } from '@/repositories/planning.repository';

export interface PlanningOrderCoverageCell {
  requested: number;
  covered: number;
  hasShortage: boolean;
}

export interface PlanningProductRow {
  productId: string;
  productCode: string;
  productName: string;
  totalRequested: number;
  stockProPhysical: number;
  coverageFromStock: number;
  coveredFromBulk: number;
  stockDisplay: string;
  stockProPart: number;
  bulkPart: number;
  finalShortage: number;
  ordersCoverage: Record<string, PlanningOrderCoverageCell>;
  sortKey: number;
}

export interface PlanningOrderColumn {
  orderId: string;
  code: string;
  customerDisplayName: string;
  planningSortKey: number;
}

export interface PlanningMatrix {
  openOrders: PlanningOrderColumn[];
  products: PlanningProductRow[];
  hasOrders: boolean;
}

export interface IPlanningDomainService {
  getPlanningMatrix(): Promise<PlanningMatrix>;
  calculatePlanningMatrix(snapshot: PlanningSnapshot): PlanningMatrix;
  reorderProducts(productIds: string[]): Promise<void>;
  reorderOrders(orderIds: string[]): Promise<void>;
}

export class PlanningDomainService implements IPlanningDomainService {
  constructor(private readonly planningRepo: IPlanningRepository = new PlanningRepository()) {}

  async getPlanningMatrix(): Promise<PlanningMatrix> {
    const snapshot = await this.planningRepo.getPlanningSnapshot();
    return this.calculatePlanningMatrix(snapshot);
  }

  async reorderProducts(productIds: string[]): Promise<void> {
    await this.planningRepo.reorderProductPriorities(productIds);
  }

  async reorderOrders(orderIds: string[]): Promise<void> {
    await this.planningRepo.reorderOrderPriorities(orderIds);
  }

  calculatePlanningMatrix(snapshot: PlanningSnapshot): PlanningMatrix {
    // 1. Validar si hay pedidos abiertos
    if (!snapshot.orders || snapshot.orders.length === 0) {
      return {
        openOrders: [],
        products: [],
        hasOrders: false,
      };
    }

    // 2. Ordenar columnas (pedidos) de izquierda a derecha por planningSortKey ASC
    const sortedOrders = [...snapshot.orders].sort((a, b) => {
      if (a.planningSortKey !== b.planningSortKey) {
        return a.planningSortKey - b.planningSortKey;
      }
      return a.code.localeCompare(b.code);
    });

    const openOrderColumns: PlanningOrderColumn[] = sortedOrders.map((o) => ({
      orderId: o.id,
      code: o.code,
      customerDisplayName: o.customerDisplayName,
      planningSortKey: o.planningSortKey,
    }));

    // 3. Filtrar y ordenar filas (productos): solo PRO presentes en al menos un PED abierto
    const openOrderIds = new Set(sortedOrders.map((o) => o.id));
    const activeProductIds = new Set<string>();

    for (const o of sortedOrders) {
      for (const it of o.items) {
        if (it.requestedQuantity > 0) {
          activeProductIds.add(it.productId);
        }
      }
    }

    const presentProducts = snapshot.products.filter((p) => activeProductIds.has(p.id));

    if (presentProducts.length === 0) {
      return {
        openOrders: openOrderColumns,
        products: [],
        hasOrders: true,
      };
    }

    // Ordenar filas de arriba hacia abajo por sortKey ASC, desempate por código ASC
    const sortedProducts = [...presentProducts].sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.code.localeCompare(b.code);
    });

    // 4. Estructuras temporales en memoria para la simulación (NO alteran DB)
    const virtualProStock = new Map<string, Decimal>();
    for (const p of sortedProducts) {
      virtualProStock.set(p.id, new Decimal(p.physicalStock));
    }

    const virtualBulkByPba = new Map<string, Decimal>();
    for (const bl of snapshot.bulkLots) {
      const cur = virtualBulkByPba.get(bl.baseProductId) || new Decimal(0);
      virtualBulkByPba.set(bl.baseProductId, cur.plus(bl.kgAvailable));
    }

    const virtualComStock = new Map<string, Decimal>();
    for (const [compId, qty] of snapshot.componentsStock.entries()) {
      virtualComStock.set(compId, new Decimal(qty));
    }

    // Agrupar BOM por producto
    const bomByProduct = new Map<string, PlanningSnapshotBomItem[]>();
    for (const b of snapshot.bom) {
      const list = bomByProduct.get(b.productId) || [];
      list.push(b);
      bomByProduct.set(b.productId, list);
    }

    // 5. Procesar fila por fila (de arriba hacia abajo)
    const productRows: PlanningProductRow[] = [];

    for (const pro of sortedProducts) {
      const ordersCoverage: Record<string, PlanningOrderCoverageCell> = {};
      let totalRequested = 0;

      // Recopilar cantidades solicitadas de cada pedido
      for (const o of sortedOrders) {
        const line = o.items.find((it) => it.productId === pro.id);
        const req = line ? line.requestedQuantity : 0;
        totalRequested += req;
        ordersCoverage[o.id] = {
          requested: req,
          covered: 0,
          hasShortage: false,
        };
      }

      // Paso 1: Cubrir con stock físico actual de PRO (asignando de izquierda a derecha)
      let availablePro = virtualProStock.get(pro.id) || new Decimal(0);
      let coveredFromStock = new Decimal(0);

      for (const o of sortedOrders) {
        const reqDec = new Decimal(ordersCoverage[o.id].requested);
        if (reqDec.gt(0) && availablePro.gt(0)) {
          const alloc = Decimal.min(reqDec, availablePro);
          ordersCoverage[o.id].covered += alloc.toNumber();
          availablePro = availablePro.minus(alloc);
          coveredFromStock = coveredFromStock.plus(alloc);
        }
      }
      virtualProStock.set(pro.id, availablePro);

      const pendingAfterStock = Decimal.max(0, new Decimal(totalRequested).minus(coveredFromStock));

      // Paso 2: Cubrir faltante mediante envasado virtual (Granel + Componentes)
      let coveredFromBulk = new Decimal(0);

      if (pendingAfterStock.gt(0) && pro.baseProductId) {
        // A. Capacidad por granel
        const availBulkKg = virtualBulkByPba.get(pro.baseProductId) || new Decimal(0);
        let maxFromBulk = new Decimal(0);
        if (pro.weightKg.gt(0) && availBulkKg.gt(0)) {
          maxFromBulk = availBulkKg.div(pro.weightKg).floor();
        }

        // B. Capacidad por componentes
        const comps = bomByProduct.get(pro.id) || [];
        let maxPackagingPossible = new Decimal(0);

        if (comps.length > 0 && maxFromBulk.gt(0)) {
          let maxFromComps = new Decimal(Infinity);
          for (const c of comps) {
            const availComp = virtualComStock.get(c.componentId) || new Decimal(0);
            const reqPerUnit = new Decimal(c.quantityPerUnit);
            if (reqPerUnit.gt(0)) {
              const maxForThisComp = availComp.div(reqPerUnit).floor();
              if (maxForThisComp.lt(maxFromComps)) {
                maxFromComps = maxForThisComp;
              }
            }
          }

          if (maxFromComps.isFinite()) {
            maxPackagingPossible = Decimal.min(maxFromBulk, maxFromComps);
          }
        }

        if (maxPackagingPossible.gt(0)) {
          const unitsToCover = Decimal.min(pendingAfterStock, maxPackagingPossible);
          if (unitsToCover.gt(0)) {
            coveredFromBulk = unitsToCover;

            // Descontar virtualmente del pool de granel
            const kgConsumed = unitsToCover.times(pro.weightKg);
            virtualBulkByPba.set(pro.baseProductId, availBulkKg.minus(kgConsumed));

            // Descontar virtualmente de cada componente
            for (const c of comps) {
              const compConsumed = unitsToCover.times(c.quantityPerUnit);
              const curComp = virtualComStock.get(c.componentId) || new Decimal(0);
              virtualComStock.set(c.componentId, curComp.minus(compConsumed));
            }

            // Asignar envasado virtual a pedidos de izquierda a derecha
            let remainingToPack = unitsToCover;
            for (const o of sortedOrders) {
              const needed = new Decimal(ordersCoverage[o.id].requested - ordersCoverage[o.id].covered);
              if (needed.gt(0) && remainingToPack.gt(0)) {
                const alloc = Decimal.min(needed, remainingToPack);
                ordersCoverage[o.id].covered += alloc.toNumber();
                remainingToPack = remainingToPack.minus(alloc);
              }
            }
          }
        }
      }

      // Paso 3: Identificar celdas con faltante (cobertura insuficiente)
      for (const o of sortedOrders) {
        const cell = ordersCoverage[o.id];
        if (cell.requested > 0 && cell.covered < cell.requested) {
          cell.hasShortage = true;
        }
      }

      // Paso 4: Faltante final por producto
      const stockProPart = coveredFromStock.toNumber();
      const bulkPart = coveredFromBulk.toNumber();
      const finalShortage = Math.max(0, totalRequested - (stockProPart + bulkPart));

      // Paso 5: Formato visual de columna STOCK según Figma PEDIDOS.png
      let stockDisplay = '0';
      if (stockProPart > 0 && bulkPart > 0) {
        stockDisplay = `${stockProPart} + (${bulkPart})GR`;
      } else if (stockProPart === 0 && bulkPart > 0) {
        stockDisplay = `(${bulkPart})GR`;
      } else if (stockProPart > 0 && bulkPart === 0) {
        stockDisplay = `${stockProPart}`;
      } else {
        stockDisplay = '0';
      }

      productRows.push({
        productId: pro.id,
        productCode: pro.code,
        productName: pro.name,
        totalRequested,
        stockProPhysical: pro.physicalStock.toNumber(),
        coverageFromStock: stockProPart,
        coveredFromBulk: bulkPart,
        stockDisplay,
        stockProPart,
        bulkPart,
        finalShortage,
        ordersCoverage,
        sortKey: pro.sortKey,
      });
    }

    return {
      openOrders: openOrderColumns,
      products: productRows,
      hasOrders: true,
    };
  }
}
