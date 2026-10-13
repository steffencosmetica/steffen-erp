import {
  IOrderRepository,
  OrderRepository,
  OrderRecord,
  CreateOrderParams,
  UpdateOrderParams,
} from '@/repositories/order.repository';
import { DomainError } from '@/domain/errors';
import { Decimal, toKgPrecision, toWholePesos } from '@/domain/decimal';
import type { OrderStatus, CustomerSource } from '@/database/domain-types';

export interface DiscountStepBreakdown {
  position: number;
  percent: Decimal;
  discountArs: Decimal;
}

export interface OrderCalculatedTotals {
  subtotalArs: Decimal;
  discountSteps: DiscountStepBreakdown[];
  totalDiscountArs: Decimal;
  totalOrderArs: Decimal;
  priorBalanceArs: Decimal;
  totalToCollectArs: Decimal;
  totalWeightKg: Decimal;
}

export interface EnrichedOrderRecord extends OrderRecord {
  totals: OrderCalculatedTotals;
}

export interface IOrderDomainService {
  createOrder(params: CreateOrderParams): Promise<{ id: string; code: string; status: OrderStatus; priceSnapshotAt: string }>;
  updateOrder(orderId: string, params: UpdateOrderParams): Promise<{ id: string; code: string; status: OrderStatus }>;
  cancelOrder(orderId: string): Promise<{ id: string; code: string; status: OrderStatus }>;
  getOrder(orderId: string): Promise<EnrichedOrderRecord | null>;
  listOpenOrders(): Promise<EnrichedOrderRecord[]>;
  countOpenOrders(): Promise<number>;
  calculateTotals(order: OrderRecord): OrderCalculatedTotals;
}

export class OrderDomainService implements IOrderDomainService {
  constructor(private readonly orderRepo: IOrderRepository = new OrderRepository()) {}

  calculateTotals(order: OrderRecord): OrderCalculatedTotals {
    // 1. Subtotal: suma de (cantidad_solicitada * precio_unitario_congelado)
    let subtotalArs = new Decimal(0);
    let totalWeightKg = new Decimal(0);

    for (const item of order.items) {
      const lineTotal = item.unitPriceArsSnapshot.times(item.requestedQuantity);
      subtotalArs = subtotalArs.plus(lineTotal);

      if (item.weightKg) {
        totalWeightKg = totalWeightKg.plus(item.weightKg.times(item.requestedQuantity));
      }
    }

    // 2. Descuentos sucesivos
    let running = subtotalArs;
    const discountSteps: DiscountStepBreakdown[] = [];

    const sortedSteps = [...(order.discountSteps || [])].sort((a, b) => a.position - b.position);

    for (const step of sortedSteps) {
      if (step.percent.gt(0)) {
        const stepAmount = running.times(step.percent.div(100));
        discountSteps.push({
          position: step.position,
          percent: step.percent,
          discountArs: stepAmount,
        });
        running = running.minus(stepAmount);
      }
    }

    // Total pedido en pesos enteros según normativa
    const totalOrderArs = toWholePesos(running);
    const totalDiscountArs = subtotalArs.minus(totalOrderArs);

    // 3. Saldo anterior: solo aplica a cliente registrado
    const priorBalanceArs =
      order.customerSource === 'REGISTERED_CUSTOMER'
        ? order.priorCustomerBalanceArs || new Decimal(0)
        : new Decimal(0);

    // 4. Total a cobrar = Total pedido + Saldo anterior
    const totalToCollectArs = totalOrderArs.plus(priorBalanceArs);

    return {
      subtotalArs,
      discountSteps,
      totalDiscountArs,
      totalOrderArs,
      priorBalanceArs,
      totalToCollectArs,
      totalWeightKg: toKgPrecision(totalWeightKg),
    };
  }

  async createOrder(params: CreateOrderParams): Promise<{ id: string; code: string; status: OrderStatus; priceSnapshotAt: string }> {
    if (!params.customerSource) {
      throw new DomainError('El origen del cliente es obligatorio.');
    }

    if (params.customerSource === 'REGISTERED_CUSTOMER' && (!params.customerId || !params.customerId.trim())) {
      throw new DomainError('El cliente es obligatorio para pedidos de cliente registrado.');
    }

    if (!params.items || params.items.length === 0) {
      throw new DomainError('El pedido debe contener al menos un producto.');
    }

    for (const it of params.items) {
      if (!it.productId || !it.productId.trim()) {
        throw new DomainError('Identificador de producto inválido.');
      }
      if (typeof it.requestedQuantity !== 'number' || it.requestedQuantity <= 0 || !Number.isInteger(it.requestedQuantity)) {
        throw new DomainError('La cantidad solicitada debe ser un número entero mayor a 0.');
      }
      if (it.agQuantity !== undefined && it.agQuantity !== null && (it.agQuantity < 0 || !Number.isInteger(it.agQuantity))) {
        throw new DomainError('La cantidad AG debe ser un número entero no negativo.');
      }
    }

    if (params.packageCount !== undefined && params.packageCount !== null) {
      if (params.packageCount < 0 || !Number.isInteger(params.packageCount)) {
        throw new DomainError('La cantidad de bultos debe ser un entero no negativo.');
      }
    }

    return this.orderRepo.createOrderAtomic(params);
  }

  async updateOrder(orderId: string, params: UpdateOrderParams): Promise<{ id: string; code: string; status: OrderStatus }> {
    if (!orderId || !orderId.trim()) {
      throw new DomainError('El id de pedido es obligatorio.');
    }

    if (params.items !== undefined) {
      if (params.items.length === 0) {
        throw new DomainError('El pedido debe contener al menos un producto.');
      }
      for (const it of params.items) {
        if (!it.productId || !it.productId.trim()) {
          throw new DomainError('Identificador de producto inválido.');
        }
        if (typeof it.requestedQuantity !== 'number' || it.requestedQuantity <= 0 || !Number.isInteger(it.requestedQuantity)) {
          throw new DomainError('La cantidad solicitada debe ser un número entero mayor a 0.');
        }
        if (it.agQuantity !== undefined && it.agQuantity !== null && (it.agQuantity < 0 || !Number.isInteger(it.agQuantity))) {
          throw new DomainError('La cantidad AG debe ser un número entero no negativo.');
        }
      }
    }

    if (params.packageCount !== undefined && params.packageCount !== null) {
      if (params.packageCount < 0 || !Number.isInteger(params.packageCount)) {
        throw new DomainError('La cantidad de bultos debe ser un entero no negativo.');
      }
    }

    return this.orderRepo.updateOrderAtomic(orderId.trim(), params);
  }

  async cancelOrder(orderId: string): Promise<{ id: string; code: string; status: OrderStatus }> {
    if (!orderId || !orderId.trim()) {
      throw new DomainError('El id de pedido es obligatorio.');
    }

    return this.orderRepo.cancelOrderAtomic(orderId.trim());
  }

  async getOrder(orderId: string): Promise<EnrichedOrderRecord | null> {
    if (!orderId || !orderId.trim()) return null;

    const order = await this.orderRepo.getOrderById(orderId.trim());
    if (!order) return null;

    return {
      ...order,
      totals: this.calculateTotals(order),
    };
  }

  async listOpenOrders(): Promise<EnrichedOrderRecord[]> {
    const orders = await this.orderRepo.listOpenOrders();
    return orders.map((order) => ({
      ...order,
      totals: this.calculateTotals(order),
    }));
  }

  async countOpenOrders(): Promise<number> {
    return this.orderRepo.countOpenOrders();
  }
}
