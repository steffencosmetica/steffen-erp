import {
  IRemittanceRepository,
  RemittanceRepository,
  RemittanceRecord,
  ConfirmedRemittanceResult,
  MonthlySaleRecord,
} from '@/repositories/remittance.repository';
import {
  IMarginRemittanceRepository,
  MarginRemittanceRepository,
  MarginRemittanceRecord,
  CompletedRtmResult,
} from '@/repositories/margin-remittance.repository';
import { IOrderRepository, OrderRepository } from '@/repositories/order.repository';
import { IStockRepository, StockRepository } from '@/repositories/stock.repository';
import { ICostEngineService, CostEngineService } from '@/services/cost-engine.service';
import { IDocumentRepository, DocumentRepository } from '@/repositories/document.repository';
import { DomainError } from '@/domain/errors';
import { Decimal, toKgPrecision, toWholePesos } from '@/domain/decimal';
import type { GenerationStatus } from '@/database/domain-types';

export interface MonthlySaleWithDocumentsRecord extends MonthlySaleRecord {
  rtoDocumentStatus: GenerationStatus | 'MISSING';
  rtmDocumentStatus: GenerationStatus | 'MISSING';
}

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

export interface RtmPreviewLine {
  productId: string;
  productCode: string;
  productName: string;
  quantitySent: number;
  unitPriceArs: Decimal;
  lineTotalArs: Decimal;
  unitCostTheoreticalArs: Decimal;
  lineCostTotalArs: Decimal;
}

export interface RtmPreviewResult {
  remittanceId: string;
  remittanceCode: string;
  customerSource: string;
  customerDisplayName: string;
  addressSnapshot: string | null;
  localitySnapshot: string | null;
  provinceSnapshot: string | null;
  transportNameSnapshot: string | null;
  packageCountSnapshot: number | null;
  weightKgSnapshot: Decimal;
  createdAt: string;
  isValidToComplete: boolean;
  validationErrors: string[];
  lines: RtmPreviewLine[];
  totalOrderArs: Decimal;
  productsCostTotalArs: Decimal;
  transportCostArs: Decimal;
  gainArs: Decimal;
}

export interface IRemittanceDomainService {
  confirmOrderToRemittance(orderId: string, businessDate?: string): Promise<ConfirmedRemittanceResult>;
  getPendingRtmRemittance(): Promise<RemittanceRecord | null>;
  getRemittanceById(id: string): Promise<RemittanceRecord | null>;
  getRemittanceByOrderId(orderId: string): Promise<RemittanceRecord | null>;
  previewRto(orderId: string, agOverrides?: Record<string, number>): Promise<RtoPreviewResult>;
  previewRtm(remittanceId: string, transportCostArs?: Decimal.Value): Promise<RtmPreviewResult>;
  completeRtm(remittanceId: string, transportCostArs: Decimal.Value): Promise<CompletedRtmResult>;
  getMarginRemittanceByRemittanceId(remittanceId: string): Promise<MarginRemittanceRecord | null>;
  listCompletedSalesForMonth(year: number, month: number): Promise<MonthlySaleWithDocumentsRecord[]>;
}

export class RemittanceDomainService implements IRemittanceDomainService {
  constructor(
    private readonly remittanceRepo: IRemittanceRepository = new RemittanceRepository(),
    private readonly orderRepo: IOrderRepository = new OrderRepository(),
    private readonly stockRepo: IStockRepository = new StockRepository(),
    private readonly marginRemittanceRepo: IMarginRemittanceRepository = new MarginRemittanceRepository(),
    private readonly costEngineService: ICostEngineService = new CostEngineService(),
    private readonly documentRepo: IDocumentRepository = new DocumentRepository()
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

  /**
   * Previsualización de RTM. El costo teórico mostrado es preview: lee la misma
   * fuente canónica (v_current_product_cost, vía CostEngineService) que usará
   * la RPC autoritativa `complete_rtm_atomic`, pero no es vinculante — el
   * backend vuelve a calcularlo al confirmar, dentro de la transacción atómica.
   */
  async previewRtm(remittanceId: string, transportCostArsInput?: Decimal.Value): Promise<RtmPreviewResult> {
    if (!remittanceId) {
      throw new DomainError('El ID del remito es obligatorio.');
    }

    const remittance = await this.remittanceRepo.getRemittanceById(remittanceId);
    if (!remittance) {
      throw new DomainError(`Remito ${remittanceId} no encontrado.`);
    }

    const validationErrors: string[] = [];
    if (remittance.status !== 'RTM_PENDING') {
      validationErrors.push(`El remito no está pendiente de RTM (estado actual: ${remittance.status}).`);
    }

    const transportCostArs =
      transportCostArsInput !== undefined && transportCostArsInput !== null && transportCostArsInput !== ''
        ? new Decimal(transportCostArsInput)
        : new Decimal(0);

    if (transportCostArs.lt(0)) {
      validationErrors.push('El transporte no puede ser negativo.');
    }

    const costsMap = await this.costEngineService.getBatchProductCosts!();

    let productsCostTotalArs = new Decimal(0);
    const lines: RtmPreviewLine[] = remittance.items.map((it) => {
      const unitCostTheoreticalArs = costsMap.get(it.productId) || new Decimal(0);
      const lineCostTotalArs = unitCostTheoreticalArs.times(it.quantitySent);
      productsCostTotalArs = productsCostTotalArs.plus(lineCostTotalArs);

      return {
        productId: it.productId,
        productCode: it.productCodeSnapshot,
        productName: it.productNameSnapshot,
        quantitySent: it.quantitySent,
        unitPriceArs: it.unitPriceArsSnapshot,
        lineTotalArs: it.lineTotalArs,
        unitCostTheoreticalArs,
        lineCostTotalArs,
      };
    });

    const gainArs = remittance.totalOrderArs.minus(productsCostTotalArs).minus(transportCostArs);

    return {
      remittanceId: remittance.id,
      remittanceCode: remittance.code,
      customerSource: remittance.customerSource,
      customerDisplayName: remittance.customerDisplayName,
      addressSnapshot: remittance.addressSnapshot,
      localitySnapshot: remittance.localitySnapshot,
      provinceSnapshot: remittance.provinceSnapshot,
      transportNameSnapshot: remittance.transportNameSnapshot,
      packageCountSnapshot: remittance.packageCountSnapshot,
      weightKgSnapshot: remittance.weightKgSnapshot,
      createdAt: remittance.createdAt,
      isValidToComplete: validationErrors.length === 0,
      validationErrors,
      lines,
      totalOrderArs: remittance.totalOrderArs,
      productsCostTotalArs,
      transportCostArs,
      gainArs,
    };
  }

  async completeRtm(remittanceId: string, transportCostArs: Decimal.Value): Promise<CompletedRtmResult> {
    if (!remittanceId) {
      throw new DomainError('El ID del remito es obligatorio.');
    }
    const transport = new Decimal(transportCostArs ?? 0);
    if (transport.lt(0)) {
      throw new DomainError('El transporte no puede ser negativo.');
    }
    return this.marginRemittanceRepo.completeRtmAtomic(remittanceId, transport);
  }

  async getMarginRemittanceByRemittanceId(remittanceId: string): Promise<MarginRemittanceRecord | null> {
    if (!remittanceId) return null;
    return this.marginRemittanceRepo.getMarginRemittanceByRemittanceId(remittanceId);
  }

  async listCompletedSalesForMonth(year: number, month: number): Promise<MonthlySaleWithDocumentsRecord[]> {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new DomainError('Año y mes inválidos para consultar ventas del mes.');
    }
    const sales = await this.remittanceRepo.listCompletedSalesForMonth(year, month);
    if (sales.length === 0) return [];

    const [rtoStatuses, rtmStatuses] = await Promise.all([
      this.documentRepo.listStatusesBySourceIds('RTO', sales.map((s) => s.remittanceId)),
      this.documentRepo.listStatusesBySourceIds('RTM', sales.map((s) => s.marginRemittanceId)),
    ]);

    return sales.map((s) => ({
      ...s,
      rtoDocumentStatus: rtoStatuses.get(s.remittanceId) || 'MISSING',
      rtmDocumentStatus: rtmStatuses.get(s.marginRemittanceId) || 'MISSING',
    }));
  }
}
