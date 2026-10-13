import { BaseSupabaseRepository } from './base.repository';
import { Decimal } from '@/domain/decimal';
import { DomainError } from '@/domain/errors';
import type { CustomerSource } from '@/database/domain-types';

export interface PlanningSnapshotOrderItem {
  orderId: string;
  productId: string;
  requestedQuantity: number;
}

export interface PlanningSnapshotOrder {
  id: string;
  code: string;
  customerSource: CustomerSource;
  customerDisplayName: string;
  planningSortKey: number;
  items: PlanningSnapshotOrderItem[];
}

export interface PlanningSnapshotProduct {
  id: string;
  code: string;
  name: string;
  weightKg: Decimal;
  baseProductId: string | null;
  physicalStock: Decimal;
  sortKey: number;
}

export interface PlanningSnapshotBomItem {
  productId: string;
  componentId: string;
  quantityPerUnit: number;
}

export interface PlanningSnapshotBulkLot {
  id: string;
  baseProductId: string;
  kgAvailable: Decimal;
}

export interface PlanningSnapshot {
  orders: PlanningSnapshotOrder[];
  products: PlanningSnapshotProduct[];
  bulkLots: PlanningSnapshotBulkLot[];
  componentsStock: Map<string, Decimal>;
  bom: PlanningSnapshotBomItem[];
}

export interface IPlanningRepository {
  getPlanningSnapshot(): Promise<PlanningSnapshot>;
  reorderProductPriorities(productIds: string[]): Promise<void>;
  reorderOrderPriorities(orderIds: string[]): Promise<void>;
}

export class PlanningRepository extends BaseSupabaseRepository implements IPlanningRepository {
  async getPlanningSnapshot(): Promise<PlanningSnapshot> {
    // 1. Cargar todos los pedidos abiertos (status = 'OPEN') con sus renglones
    const { data: ordersData, error: ordersErr } = await this.client
      .from('orders')
      .select(`
        id,
        code,
        customer_source,
        customer_id,
        recipient_name,
        planning_sort_key,
        customers:customer_id (name),
        order_items (
          id,
          product_id,
          requested_quantity,
          sort_order
        )
      `)
      .eq('status', 'OPEN')
      .order('planning_sort_key', { ascending: true })
      .order('code', { ascending: true });

    if (ordersErr) {
      throw new DomainError(`Error cargando pedidos para planificación: ${ordersErr.message}`);
    }

    if (!ordersData || ordersData.length === 0) {
      return {
        orders: [],
        products: [],
        bulkLots: [],
        componentsStock: new Map(),
        bom: [],
      };
    }

    // Mapear órdenes
    const mappedOrders: PlanningSnapshotOrder[] = ordersData.map((row: any) => {
      let displayName = 'Consumidor Final';
      if (row.customer_source === 'REGISTERED_CUSTOMER') {
        displayName = row.customers?.name || 'Cliente registrado';
      } else if (row.customer_source === 'MERCADO_LIBRE') {
        displayName = 'Mercado Libre';
      } else if (row.customer_source === 'CONSUMER_FINAL') {
        displayName = row.recipient_name ? row.recipient_name : 'Consumidor Final';
      }

      const items: PlanningSnapshotOrderItem[] = (row.order_items || [])
        .map((it: any) => ({
          orderId: row.id,
          productId: it.product_id,
          requestedQuantity: it.requested_quantity || 0,
        }))
        .filter((it: PlanningSnapshotOrderItem) => it.requestedQuantity > 0);

      return {
        id: row.id,
        code: row.code,
        customerSource: row.customer_source as CustomerSource,
        customerDisplayName: displayName,
        planningSortKey: Number(row.planning_sort_key || 0),
        items,
      };
    });

    // 2. Extraer product_ids únicos presentes en pedidos abiertos
    const productIdsSet = new Set<string>();
    for (const o of mappedOrders) {
      for (const it of o.items) {
        productIdsSet.add(it.productId);
      }
    }

    const productIds = Array.from(productIdsSet);
    if (productIds.length === 0) {
      return {
        orders: mappedOrders,
        products: [],
        bulkLots: [],
        componentsStock: new Map(),
        bom: [],
      };
    }

    // 3. Batch fetch de productos, prioridades y stock físico
    const [prodsRes, prioritiesRes, proStockRes, bomRes] = await Promise.all([
      this.client
        .from('products')
        .select(`
          stock_item_id,
          weight_kg,
          base_product_id,
          stock_items (
            code,
            name
          )
        `)
        .in('stock_item_id', productIds),
      this.client
        .from('planning_product_priorities')
        .select('product_id, sort_key')
        .in('product_id', productIds),
      this.client
        .from('stock_balances')
        .select('stock_item_id, quantity')
        .in('stock_item_id', productIds),
      this.client
        .from('product_components')
        .select('product_id, component_id, quantity_per_unit')
        .in('product_id', productIds)
        .order('sort_order', { ascending: true }),
    ]);

    if (prodsRes.error) {
      throw new DomainError(`Error cargando productos para planificación: ${prodsRes.error.message}`);
    }
    if (prioritiesRes.error) {
      throw new DomainError(`Error cargando prioridades de productos: ${prioritiesRes.error.message}`);
    }
    if (proStockRes.error) {
      throw new DomainError(`Error cargando stock de productos: ${proStockRes.error.message}`);
    }
    if (bomRes.error) {
      throw new DomainError(`Error cargando composición de productos: ${bomRes.error.message}`);
    }

    // Mapas auxiliares
    const prioritiesMap = new Map<string, number>();
    for (const p of prioritiesRes.data || []) {
      prioritiesMap.set(p.product_id, Number(p.sort_key || 0));
    }

    const proStockMap = new Map<string, Decimal>();
    for (const s of proStockRes.data || []) {
      proStockMap.set(s.stock_item_id, new Decimal(s.quantity || 0));
    }

    const bomList: PlanningSnapshotBomItem[] = (bomRes.data || []).map((b: any) => ({
      productId: b.product_id,
      componentId: b.component_id,
      quantityPerUnit: b.quantity_per_unit,
    }));

    // Extraer base_product_ids y component_ids para granel y componentes
    const baseProductIdsSet = new Set<string>();
    const componentIdsSet = new Set<string>();

    for (const b of bomList) {
      componentIdsSet.add(b.componentId);
    }

    const mappedProducts: PlanningSnapshotProduct[] = (prodsRes.data || []).map((p: any) => {
      const stockItem = p.stock_items || {};
      if (p.base_product_id) {
        baseProductIdsSet.add(p.base_product_id);
      }
      return {
        id: p.stock_item_id,
        code: stockItem.code || '',
        name: stockItem.name || '',
        weightKg: new Decimal(p.weight_kg || 0),
        baseProductId: p.base_product_id || null,
        physicalStock: proStockMap.get(p.stock_item_id) || new Decimal(0),
        sortKey: prioritiesMap.get(p.stock_item_id) ?? 999999,
      };
    });

    const baseProductIds = Array.from(baseProductIdsSet);
    const componentIds = Array.from(componentIdsSet);

    // 4. Batch fetch de lotes de granel abiertos y stock de componentes
    const [bulkRes, comStockRes] = await Promise.all([
      baseProductIds.length > 0
        ? this.client
            .from('bulk_lots')
            .select('id, base_product_id, kg_available')
            .in('base_product_id', baseProductIds)
            .eq('status', 'OPEN')
            .gt('kg_available', 0)
        : Promise.resolve({ data: [], error: null }),
      componentIds.length > 0
        ? this.client
            .from('stock_balances')
            .select('stock_item_id, quantity')
            .in('stock_item_id', componentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (bulkRes.error) {
      throw new DomainError(`Error cargando lotes de granel para planificación: ${bulkRes.error.message}`);
    }
    if (comStockRes.error) {
      throw new DomainError(`Error cargando stock de componentes: ${comStockRes.error.message}`);
    }

    const bulkLots: PlanningSnapshotBulkLot[] = (bulkRes.data || []).map((l: any) => ({
      id: l.id,
      baseProductId: l.base_product_id,
      kgAvailable: new Decimal(l.kg_available || 0),
    }));

    const componentsStock = new Map<string, Decimal>();
    for (const cs of comStockRes.data || []) {
      componentsStock.set(cs.stock_item_id, new Decimal(cs.quantity || 0));
    }

    return {
      orders: mappedOrders,
      products: mappedProducts,
      bulkLots,
      componentsStock,
      bom: bomList,
    };
  }

  async reorderProductPriorities(productIds: string[]): Promise<void> {
    if (!productIds || productIds.length === 0) return;

    const { error } = await (this.client.rpc as any)('update_planning_product_priorities', {
      p_product_ids: productIds,
    });

    if (error) {
      throw new DomainError(`Error reordenando prioridades de productos: ${error.message}`);
    }
  }

  async reorderOrderPriorities(orderIds: string[]): Promise<void> {
    if (!orderIds || orderIds.length === 0) return;

    const { error } = await (this.client.rpc as any)('update_planning_order_priorities', {
      p_order_ids: orderIds,
    });

    if (error) {
      throw new DomainError(`Error reordenando prioridades de pedidos: ${error.message}`);
    }
  }
}
