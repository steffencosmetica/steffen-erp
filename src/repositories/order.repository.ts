import { BaseSupabaseRepository } from './base.repository';
import { DomainError } from '@/domain/errors';
import { Decimal, toNumericString, toKgPrecision, toWholePesos } from '@/domain/decimal';
import type { OrderStatus, CustomerSource } from '@/database/domain-types';

export interface OrderDiscountStepRecord {
  id: string;
  orderId: string;
  position: number;
  percent: Decimal;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string;
  productCode?: string;
  productName?: string;
  weightKg?: Decimal;
  requestedQuantity: number;
  agQuantity: number | null;
  unitPriceArsSnapshot: Decimal;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderRecord {
  id: string;
  code: string;
  businessDate: string;
  status: OrderStatus;
  customerSource: CustomerSource;
  customerId: string | null;
  customerName?: string;
  customerCode?: string;
  customerAddress?: string | null;
  customerTransport?: string | null;
  priceListId: string;
  priceListName?: string;
  priceSnapshotAt: string;
  recipientName: string | null;
  address: string | null;
  locality: string | null;
  province: string | null;
  phone: string | null;
  transportName: string | null;
  transportAddress: string | null;
  packageCount: number | null;
  planningSortKey: Decimal;
  convertedRtoId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
  discountSteps: OrderDiscountStepRecord[];
  priorCustomerBalanceArs?: Decimal;
}

export interface CreateOrderItemParam {
  productId: string;
  requestedQuantity: number;
  agQuantity?: number | null;
}

export interface CreateOrderParams {
  customerSource: CustomerSource;
  customerId?: string | null;
  businessDate?: string;
  recipientName?: string | null;
  address?: string | null;
  locality?: string | null;
  province?: string | null;
  phone?: string | null;
  transportName?: string | null;
  transportAddress?: string | null;
  packageCount?: number | null;
  manualDiscountPercent?: number | string | Decimal | null;
  items: CreateOrderItemParam[];
}

export interface UpdateOrderParams {
  businessDate?: string;
  recipientName?: string | null;
  address?: string | null;
  locality?: string | null;
  province?: string | null;
  phone?: string | null;
  transportName?: string | null;
  transportAddress?: string | null;
  packageCount?: number | null;
  manualDiscountPercent?: number | string | Decimal | null;
  items?: CreateOrderItemParam[];
}

export interface IOrderRepository {
  createOrderAtomic(params: CreateOrderParams): Promise<{ id: string; code: string; status: OrderStatus; priceSnapshotAt: string }>;
  updateOrderAtomic(orderId: string, params: UpdateOrderParams): Promise<{ id: string; code: string; status: OrderStatus }>;
  cancelOrderAtomic(orderId: string): Promise<{ id: string; code: string; status: OrderStatus }>;
  getOrderById(orderId: string): Promise<OrderRecord | null>;
  listOpenOrders(): Promise<OrderRecord[]>;
  countOpenOrders(): Promise<number>;
}

export class OrderRepository extends BaseSupabaseRepository implements IOrderRepository {
  async createOrderAtomic(params: CreateOrderParams): Promise<{ id: string; code: string; status: OrderStatus; priceSnapshotAt: string }> {
    const payload = {
      customer_source: params.customerSource,
      customer_id: params.customerId || null,
      business_date: params.businessDate || null,
      recipient_name: params.recipientName || null,
      address: params.address || null,
      locality: params.locality || null,
      province: params.province || null,
      phone: params.phone || null,
      transport_name: params.transportName || null,
      transport_address: params.transportAddress || null,
      package_count: params.packageCount !== undefined ? params.packageCount : null,
      manual_discount_percent: params.manualDiscountPercent != null ? toNumericString(params.manualDiscountPercent) : null,
      items: (params.items || []).map((it) => ({
        product_id: it.productId,
        requested_quantity: it.requestedQuantity,
        ag_quantity: it.agQuantity !== undefined ? it.agQuantity : null,
      })),
    };

    const { data, error } = await (this.client.rpc as any)('create_order_atomic', {
      p_order_json: payload,
    });

    if (error) {
      throw new DomainError(`Error creando pedido: ${error.message}`);
    }

    const res = data as any;
    return {
      id: res.id,
      code: res.code,
      status: res.status as OrderStatus,
      priceSnapshotAt: res.price_snapshot_at,
    };
  }

  async updateOrderAtomic(orderId: string, params: UpdateOrderParams): Promise<{ id: string; code: string; status: OrderStatus }> {
    const payload: Record<string, unknown> = {};

    if (params.packageCount !== undefined) {
      payload.package_count = params.packageCount;
    }
    if (params.recipientName !== undefined) {
      payload.recipient_name = params.recipientName;
    }
    if (params.address !== undefined) {
      payload.address = params.address;
    }
    if (params.locality !== undefined) {
      payload.locality = params.locality;
    }
    if (params.province !== undefined) {
      payload.province = params.province;
    }
    if (params.phone !== undefined) {
      payload.phone = params.phone;
    }
    if (params.transportName !== undefined) {
      payload.transport_name = params.transportName;
    }
    if (params.transportAddress !== undefined) {
      payload.transport_address = params.transportAddress;
    }
    if (params.manualDiscountPercent !== undefined) {
      payload.manual_discount_percent = params.manualDiscountPercent != null ? toNumericString(params.manualDiscountPercent) : null;
    }
    if (params.items !== undefined) {
      payload.items = params.items.map((it) => ({
        product_id: it.productId,
        requested_quantity: it.requestedQuantity,
        ag_quantity: it.agQuantity !== undefined ? it.agQuantity : null,
      }));
    }

    const { data, error } = await (this.client.rpc as any)('update_order_atomic', {
      p_order_id: orderId,
      p_update_json: payload,
    });

    if (error) {
      throw new DomainError(`Error actualizando pedido: ${error.message}`);
    }

    const res = data as any;
    return {
      id: res.id,
      code: res.code,
      status: res.status as OrderStatus,
    };
  }

  async cancelOrderAtomic(orderId: string): Promise<{ id: string; code: string; status: OrderStatus }> {
    const { data, error } = await (this.client.rpc as any)('cancel_order_atomic', {
      p_order_id: orderId,
    });

    if (error) {
      throw new DomainError(`Error cancelando pedido: ${error.message}`);
    }

    const res = data as any;
    return {
      id: res.id,
      code: res.code,
      status: res.status as OrderStatus,
    };
  }

  async countOpenOrders(): Promise<number> {
    const { count, error } = await this.client
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'OPEN');

    if (error) {
      throw new DomainError(`Error contando pedidos abiertos: ${error.message}`);
    }

    return count || 0;
  }

  async getOrderById(orderId: string): Promise<OrderRecord | null> {
    const { data, error } = await this.client
      .from('orders')
      .select(`
        *,
        customers:customer_id (id, code, name, address, transport_name),
        price_lists:price_list_id (id, name, system_role),
        order_discount_steps (*),
        order_items (
          id,
          order_id,
          product_id,
          requested_quantity,
          ag_quantity,
          unit_price_ars_snapshot,
          sort_order,
          created_at,
          updated_at,
          products:product_id (
            stock_item_id,
            weight_kg,
            stock_items (
              code,
              name
            )
          )
        )
      `)
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error obteniendo pedido: ${error.message}`);
    }

    if (!data) return null;

    let priorBalance = new Decimal(0);
    if (data.customer_id) {
      const { data: accData } = await this.client
        .from('financial_accounts')
        .select('current_balance')
        .eq('customer_id', data.customer_id)
        .eq('account_type', 'CUSTOMER_RECEIVABLE')
        .maybeSingle();
      if (accData) {
        priorBalance = new Decimal(accData.current_balance);
      }
    }

    return this.mapOrderRow(data, priorBalance);
  }

  async listOpenOrders(): Promise<OrderRecord[]> {
    const { data, error } = await this.client
      .from('orders')
      .select(`
        *,
        customers:customer_id (id, code, name, address, transport_name),
        price_lists:price_list_id (id, name, system_role),
        order_discount_steps (*),
        order_items (
          id,
          order_id,
          product_id,
          requested_quantity,
          ag_quantity,
          unit_price_ars_snapshot,
          sort_order,
          created_at,
          updated_at,
          products:product_id (
            stock_item_id,
            weight_kg,
            stock_items (
              code,
              name
            )
          )
        )
      `)
      .eq('status', 'OPEN')
      .order('planning_sort_key', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new DomainError(`Error listando pedidos abiertos: ${error.message}`);
    }

    const rows = data || [];
    if (rows.length === 0) return [];

    // Batch query de saldos para los clientes de los pedidos
    const customerIds = Array.from(
      new Set(rows.map((r: any) => r.customer_id).filter(Boolean))
    );

    const balanceMap = new Map<string, Decimal>();
    if (customerIds.length > 0) {
      const { data: accounts } = await this.client
        .from('financial_accounts')
        .select('customer_id, current_balance')
        .in('customer_id', customerIds)
        .eq('account_type', 'CUSTOMER_RECEIVABLE');

      for (const acc of accounts || []) {
        if (acc.customer_id) {
          balanceMap.set(acc.customer_id, new Decimal(acc.current_balance));
        }
      }
    }

    return rows.map((row: any) => {
      const priorBal = row.customer_id ? balanceMap.get(row.customer_id) || new Decimal(0) : new Decimal(0);
      return this.mapOrderRow(row, priorBal);
    });
  }

  private mapOrderRow(row: any, priorBalance: Decimal): OrderRecord {
    const discountSteps: OrderDiscountStepRecord[] = (row.order_discount_steps || [])
      .map((ds: any) => ({
        id: ds.id,
        orderId: ds.order_id,
        position: ds.position,
        percent: new Decimal(ds.percent),
      }))
      .sort((a: OrderDiscountStepRecord, b: OrderDiscountStepRecord) => a.position - b.position);

    const items: OrderItemRecord[] = (row.order_items || [])
      .map((oi: any) => {
        const prod = oi.products || {};
        const stockItem = prod.stock_items || {};
        return {
          id: oi.id,
          orderId: oi.order_id,
          productId: oi.product_id,
          productCode: stockItem.code || undefined,
          productName: stockItem.name || undefined,
          weightKg: prod.weight_kg != null ? new Decimal(prod.weight_kg) : undefined,
          requestedQuantity: oi.requested_quantity,
          agQuantity: oi.ag_quantity != null ? oi.ag_quantity : null,
          unitPriceArsSnapshot: new Decimal(oi.unit_price_ars_snapshot),
          sortOrder: oi.sort_order,
          createdAt: oi.created_at,
          updatedAt: oi.updated_at,
        };
      })
      .sort((a: OrderItemRecord, b: OrderItemRecord) => a.sortOrder - b.sortOrder);

    const customer = row.customers || null;
    const priceList = row.price_lists || null;

    return {
      id: row.id,
      code: row.code,
      businessDate: row.business_date,
      status: row.status as OrderStatus,
      customerSource: row.customer_source as CustomerSource,
      customerId: row.customer_id,
      customerName: customer?.name || undefined,
      customerCode: customer?.code || undefined,
      customerAddress: customer?.address || undefined,
      customerTransport: customer?.transport_name || undefined,
      priceListId: row.price_list_id,
      priceListName: priceList?.name || undefined,
      priceSnapshotAt: row.price_snapshot_at,
      recipientName: row.recipient_name,
      address: row.address,
      locality: row.locality,
      province: row.province,
      phone: row.phone,
      transportName: row.transport_name,
      transportAddress: row.transport_address,
      packageCount: row.package_count,
      planningSortKey: new Decimal(row.planning_sort_key),
      convertedRtoId: row.converted_rto_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items,
      discountSteps,
      priorCustomerBalanceArs: priorBalance,
    };
  }
}
