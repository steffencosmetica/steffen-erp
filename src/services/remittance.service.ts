import {
  IRemittanceRepository,
  RemittanceRepository,
  RemittanceRecord,
  ConfirmedRemittanceResult,
} from '@/repositories/remittance.repository';
import { IOrderRepository, OrderRepository } from '@/repositories/order.repository';
import { IStockRepository, StockRepository } from '@/repositories/stock.repository';
import { DomainError } from '@/domain/errors';
import { Decimal, toKgPrecision, toWholePesos } from '@/domain/decimal';

export interface RtoPreviewLine {
  productId: string;
  productCode: string;
  productName: string;
  presentation: string;
  weightKg: Decimal;
  requestedQuantity: number;
  agQuantity: number;
  unitPriceArs: Decimal;
  lineTotalArs: Decimal;
  availableStock: number;
  hasSufficientStock: boolean;
}

export interface RtoDiscountStepPreview {
  position: number;
  percent: Decimal;
  amountArs: Decimal;
}

export interface RtoPreviewResult {
  orderId: string;
  orderCode: string;
  customerSource: string;
  customerDisplayName: string;
  hasPendingRtmGlobal: boolean;
  pendingRtmCode: string | null;
  isValidToConfirm: boolean;
  validationErrors: string[];
  lines: RtoPreviewLine[];
  subtotalArs: Decimal;
  discountSteps: RtoDiscountStepPreview[];
  totalOrderArs: Decimal;
  priorBalanceArs: Decimal;
  totalToCollectArs: Decimal;
  totalWeightKg: Decimal;
  packageCount: number | null;
}

export interface IRemittanceDomainService {
  confirmOrderToRemittance(orderId: string, businessDate?: string): Promise<ConfirmedRemittanceResult>;
  getPendingRtmRemittance(): Promise<RemittanceRecord | null>;
  getRemittanceById(id: string): Promise<RemittanceRecord | null>;
  getRemittanceByOrderId(orderId: string): Promise<RemittanceRecord | null>;
  previewRto(orderId: string, agOverrides?: Record<string, number>): Promise<RtoPreviewResult>;
}

export class RemittanceDomainService implements IRemittanceDomainService {
  constructor(
    private readonly remittanceRepo: IRemittanceRepository = new RemittanceRepository(),
    private readonly orderRepo: IOrderRepository = new OrderRepository(),
    private readonly stockRepo: IStockRepository = new StockRepository()
  ) {}

  async confirmOrderToRemittance(orderId: string, businessDate?: string): Promise<ConfirmedRemittanceResult> {
    if (!orderId) {
      throw new DomainError('El ID del pedido es obligatorio.');
    }
    return this.remittanceRepo.confirmOrderToRemittanceAtomic(orderId, businessDate);
  }

  async getPendingRtmRemittance(): Promise<RemittanceRecord | null> {
    return this.remittanceRepo.getPendingRtmRemittance();
  }

  async getRemittanceById(id: string): Promise<RemittanceRecord | null> {
    if (!id) return null;
    return this.remittanceRepo.getRemittanceById(id);
  }

  async getRemittanceByOrderId(orderId: string): Promise<RemittanceRecord | null> {
    if (!orderId) return null;
    return this.remittanceRepo.getRemittanceByOrderId(orderId);
  }

  async previewRto(orderId: string, agOverrides?: Record<string, number>): Promise<RtoPreviewResult> {
    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) {
      throw new DomainError(`Pedido ${orderId} no encontrado.`);
    }

    const pendingRtm = await this.remittanceRepo.getPendingRtmRemittance();
    const hasPendingRtmGlobal = !!pendingRtm;
    const pendingRtmCode = pendingRtm ? pendingRtm.code : null;

    const validationErrors: string[] = [];

    if (hasPendingRtmGlobal) {
      validationErrors.push(`Existe un remito con RTM pendiente (${pendingRtmCode}). Debe completarse antes de generar un nuevo remito.`);
    }

    if (order.status !== 'OPEN') {
      validationErrors.push(`El pedido no está ABIERTO (Estado actual: ${order.status}).`);
    }

    if (order.convertedRtoId) {
      validationErrors.push('El pedido ya fue convertido previamente a remito.');
    }

    // 1. Obtener stock actual de todos los productos del pedido
    const balancesMap = await this.stockRepo.getBatchBalances();

    let positiveAgCount = 0;
    const previewLines: RtoPreviewLine[] = [];
    let subtotalArs = new Decimal(0);
    let totalWeightKg = new Decimal(0);

    for (const it of order.items) {
      const ag = agOverrides && agOverrides[it.productId] !== undefined
        ? agOverrides[it.productId]
        : it.agQuantity;

      if (ag === null || ag === undefined) {
        validationErrors.push(`Falta definir cantidad AG para ${it.productCode || it.productId}.`);
      } else if (!Number.isInteger(ag) || ag < 0) {
        validationErrors.push(`Cantidad AG inválida para ${it.productCode || it.productId} (${ag}). Debe ser un entero >= 0.`);
      }

      const agVal = (ag !== null && ag !== undefined && Number.isInteger(ag) && ag >= 0) ? ag : 0;
      if (agVal > 0) {
        positiveAgCount++;
      }

      const availableStockDecimal = balancesMap.get(it.productId) || new Decimal(0);
      const availableStock = availableStockDecimal.toNumber();
      const hasSufficientStock = availableStockDecimal.gte(agVal);

      if (agVal > 0 && !hasSufficientStock) {
        validationErrors.push(
          `Stock insuficiente para ${it.productName || it.productCode}. Disponible: ${availableStock}, Requerido AG: ${agVal}.`
        );
      }

      const lineTotal = it.unitPriceArsSnapshot.times(agVal);
      if (agVal > 0) {
        subtotalArs = subtotalArs.plus(lineTotal);
        if (it.weightKg) {
          totalWeightKg = totalWeightKg.plus(it.weightKg.times(agVal));
        }
      }

      previewLines.push({
        productId: it.productId,
        productCode: it.productCode || '',
        productName: it.productName || '',
        presentation: '',
        weightKg: it.weightKg || new Decimal(0),
        requestedQuantity: it.requestedQuantity,
        agQuantity: agVal,
        unitPriceArs: it.unitPriceArsSnapshot,
        lineTotalArs: lineTotal,
        availableStock,
        hasSufficientStock,
      });
    }

    if (positiveAgCount === 0) {
      validationErrors.push('Debe existir al menos una línea con cantidad AG mayor a cero para confirmar el remito.');
    }

    // 2. Calcular descuentos sucesivos
    let running = subtotalArs;
    const discountSteps: RtoDiscountStepPreview[] = [];
    const sortedSteps = [...(order.discountSteps || [])].sort((a, b) => a.position - b.position);

    for (const step of sortedSteps) {
      if (step.percent.gt(0)) {
        const stepAmount = running.times(step.percent.div(100));
        discountSteps.push({
          position: step.position,
          percent: step.percent,
          amountArs: stepAmount,
        });
        running = running.minus(stepAmount);
      }
    }

    const totalOrderArs = toWholePesos(running);
    const priorBalanceArs =
      order.customerSource === 'REGISTERED_CUSTOMER'
        ? order.priorCustomerBalanceArs || new Decimal(0)
        : new Decimal(0);
    const totalToCollectArs = totalOrderArs.plus(priorBalanceArs);

    let customerDisplayName = 'Consumidor Final';
    if (order.customerSource === 'REGISTERED_CUSTOMER') {
      customerDisplayName = order.customerName || order.recipientName || 'Cliente registrado';
    } else if (order.customerSource === 'MERCADO_LIBRE') {
      customerDisplayName = 'Mercado Libre';
    } else if (order.customerSource === 'CONSUMER_FINAL') {
      customerDisplayName = order.recipientName || 'Consumidor Final';
    }

    return {
      orderId: order.id,
      orderCode: order.code,
      customerSource: order.customerSource,
      customerDisplayName,
      hasPendingRtmGlobal,
      pendingRtmCode,
      isValidToConfirm: validationErrors.length === 0,
      validationErrors,
      lines: previewLines,
      subtotalArs,
      discountSteps,
      totalOrderArs,
      priorBalanceArs,
      totalToCollectArs,
      totalWeightKg: toKgPrecision(totalWeightKg),
      packageCount: order.packageCount,
    };
  }
}
