import { PurchaseRepository, type PurchaseOperationResult, type PurchaseDetailRecord, type PurchaseSummaryRecord } from '@/repositories/purchase.repository';
import { SupplierRepository } from '@/repositories/supplier.repository';
import { SupplierItemRepository } from '@/repositories/supplier-item.repository';
import { StockRepository } from '@/repositories/stock.repository';
import { MasterItemRepository } from '@/repositories/master-item.repository';
import { CostEngineService } from './cost-engine.service';
import { DomainError } from '@/domain/errors';
import { Decimal, toNumericString } from '@/domain/decimal';

export interface RegisterPurchaseItemInput {
  stockItemId: string;
  quantity: Decimal;
  unitPriceNetSource: Decimal;
  vatRatePct?: Decimal;
}

export interface RegisterPurchaseDomainInput {
  supplierId: string;
  businessDate?: string;
  paymentMode: 'PAID' | 'DEBT';
  exchangeRateUsed?: Decimal | null;
  observations?: string | null;
  items: RegisterPurchaseItemInput[];
}

export interface EditPurchaseDomainInput {
  purchaseId: string;
  businessDate?: string;
  paymentMode: 'PAID' | 'DEBT';
  exchangeRateUsed?: Decimal | null;
  observations?: string | null;
  items: RegisterPurchaseItemInput[];
}

export interface AvailableItemForSupplier {
  id: string;
  code: string;
  name: string;
  itemType: 'MPR' | 'COM';
  unitType: 'KG' | 'UNIT';
  isAssociated: boolean;
  quotedUnitPriceNet: string | null;
  priceUpdatedAt: string | null;
  currentStock: string;
}

export class PurchaseDomainService {
  constructor(
    private purchaseRepo: PurchaseRepository,
    private supplierRepo: SupplierRepository,
    private supplierItemRepo: SupplierItemRepository,
    private stockRepo: StockRepository,
    private masterItemRepo: MasterItemRepository,
    private costEngineService: CostEngineService
  ) {}

  /**
   * Registra una nueva compra a proveedor de forma atómica.
   * Incrementa stock físico, genera MST, asocia insumos al proveedor,
   * actualiza precios de referencia y registra impacto patrimonial en Caja Steffen o Deuda Proveedor.
   */
  async registerPurchase(input: RegisterPurchaseDomainInput): Promise<PurchaseOperationResult> {
    // 1. Validaciones previas de dominio
    if (!input.supplierId) {
      throw new DomainError('El proveedor es obligatorio para registrar la compra.');
    }

    if (!input.items || input.items.length === 0) {
      throw new DomainError('La compra debe contener al menos un ítem.');
    }

    if (!['PAID', 'DEBT'].includes(input.paymentMode)) {
      throw new DomainError(`Modalidad de pago inválida: ${input.paymentMode}. Debe ser PAID o DEBT.`);
    }

    // 2. Verificar existencia y estado del proveedor
    const supplier = await this.supplierRepo.findById(input.supplierId);
    if (!supplier) {
      throw new DomainError(`Proveedor con ID ${input.supplierId} no encontrado.`);
    }

    if (!supplier.active) {
      throw new DomainError(`El proveedor ${supplier.name} está inactivo y no puede registrar nuevas compras.`);
    }

    // 3. Validar cotización si el proveedor opera en USD
    let fxRate = input.exchangeRateUsed;
    if (supplier.currencyCode === 'USD') {
      if (fxRate !== undefined && fxRate !== null) {
        if (fxRate.lte(0)) {
          throw new DomainError('La cotización para compras en USD debe ser mayor a 0.');
        }
      } else {
        // Obtener cotización global vigente
        const currentRate = await this.supplierItemRepo.getCurrentUsdExchangeRate();
        if (!currentRate || currentRate.lte(0)) {
          throw new DomainError('El proveedor opera en USD pero no se proporcionó cotización y no existe cotización global vigente.');
        }
        fxRate = currentRate;
      }
    } else {
      fxRate = null;
    }

    // 4. Validar ítems, tipos, cantidades y precios
    const seenItemIds = new Set<string>();

    for (const it of input.items) {
      if (!it.stockItemId) {
        throw new DomainError('Cada línea de compra debe especificar un ítem de stock.');
      }

      if (seenItemIds.has(it.stockItemId)) {
        throw new DomainError('No se permite duplicar el mismo ítem en múltiples líneas de la compra.');
      }
      seenItemIds.add(it.stockItemId);

      if (it.quantity.lte(0)) {
        throw new DomainError('La cantidad comprada debe ser mayor a 0.');
      }

      if (it.unitPriceNetSource.lte(0)) {
        throw new DomainError('El precio unitario neto debe ser mayor a 0.');
      }

      const itemInfo = await this.stockRepo.getStockItem(it.stockItemId);
      if (!itemInfo) {
        throw new DomainError(`Ítem de stock ${it.stockItemId} no encontrado.`);
      }

      if (!itemInfo.active) {
        throw new DomainError(`El ítem ${itemInfo.code} (${itemInfo.name}) se encuentra inactivo.`);
      }

      if (itemInfo.itemType !== 'MPR' && itemInfo.itemType !== 'COM') {
        throw new DomainError(`Solo se permite comprar Materias Primas (MPR) y Componentes (COM), no Productos Finales (${itemInfo.itemType}).`);
      }

      // Validar precisión según unidad
      if (itemInfo.unitType === 'UNIT' && !it.quantity.isInteger()) {
        throw new DomainError(`El ítem ${itemInfo.code} es por unidad (UNIT) y no admite cantidades fraccionarias (${it.quantity.toString()}).`);
      }

      if (itemInfo.unitType === 'KG') {
        const decimals = (it.quantity.toString().split('.')[1] || '').length;
        if (decimals > 3) {
          throw new DomainError(`El ítem ${itemInfo.code} (KG) admite como máximo 3 decimales de precisión (${it.quantity.toString()}).`);
        }
      }
    }

    // 5. Delegar ejecución transaccional a la RPC en PostgreSQL
    return this.purchaseRepo.createPurchase({
      supplierId: input.supplierId,
      businessDate: input.businessDate,
      paymentMode: input.paymentMode,
      exchangeRateUsed: fxRate,
      observations: input.observations,
      items: input.items,
    });
  }

  /**
   * Edita una compra existente recalculando atómicamente diferencias de stock,
   * validando que ninguna reversión cause saldo negativo, y recalculando deuda o caja.
   */
  async editPurchase(input: EditPurchaseDomainInput): Promise<PurchaseOperationResult> {
    if (!input.purchaseId) {
      throw new DomainError('El identificador de compra es obligatorio.');
    }

    if (!input.items || input.items.length === 0) {
      throw new DomainError('La compra debe contener al menos un ítem.');
    }

    if (!['PAID', 'DEBT'].includes(input.paymentMode)) {
      throw new DomainError(`Modalidad de pago inválida: ${input.paymentMode}. Debe ser PAID o DEBT.`);
    }

    const existing = await this.purchaseRepo.getPurchaseById(input.purchaseId);
    if (!existing) {
      throw new DomainError(`Compra ${input.purchaseId} no encontrada.`);
    }

    if (existing.currencyCodeSnapshot === 'USD') {
      if (input.exchangeRateUsed !== undefined && input.exchangeRateUsed !== null && input.exchangeRateUsed.lte(0)) {
        throw new DomainError('La cotización para compras en USD debe ser mayor a 0.');
      }
    }

    // Validar ítems
    const seenItemIds = new Set<string>();

    for (const it of input.items) {
      if (!it.stockItemId) {
        throw new DomainError('Cada línea de compra debe especificar un ítem de stock.');
      }

      if (seenItemIds.has(it.stockItemId)) {
        throw new DomainError('No se permite duplicar el mismo ítem en múltiples líneas de la compra.');
      }
      seenItemIds.add(it.stockItemId);

      if (it.quantity.lte(0)) {
        throw new DomainError('La cantidad comprada debe ser mayor a 0.');
      }

      if (it.unitPriceNetSource.lte(0)) {
        throw new DomainError('El precio unitario neto debe ser mayor a 0.');
      }

      const itemInfo = await this.stockRepo.getStockItem(it.stockItemId);
      if (!itemInfo) {
        throw new DomainError(`Ítem de stock ${it.stockItemId} no encontrado.`);
      }

      if (itemInfo.itemType !== 'MPR' && itemInfo.itemType !== 'COM') {
        throw new DomainError(`Solo se permite comprar Materias Primas (MPR) y Componentes (COM).`);
      }

      if (itemInfo.unitType === 'UNIT' && !it.quantity.isInteger()) {
        throw new DomainError(`El ítem ${itemInfo.code} es por unidad y no admite decimales.`);
      }

      if (itemInfo.unitType === 'KG') {
        const decimals = (it.quantity.toString().split('.')[1] || '').length;
        if (decimals > 3) {
          throw new DomainError(`El ítem ${itemInfo.code} admite hasta 3 decimales en kg.`);
        }
      }
    }

    return this.purchaseRepo.updatePurchase({
      purchaseId: input.purchaseId,
      businessDate: input.businessDate,
      paymentMode: input.paymentMode,
      exchangeRateUsed: input.exchangeRateUsed,
      observations: input.observations,
      items: input.items,
    });
  }

  /**
   * Obtiene una compra por ID.
   */
  async getPurchaseById(id: string): Promise<PurchaseDetailRecord | null> {
    return this.purchaseRepo.getPurchaseById(id);
  }

  /**
   * Obtiene una compra por código CMP.
   */
  async getPurchaseByCode(code: string): Promise<PurchaseDetailRecord | null> {
    return this.purchaseRepo.getPurchaseByCode(code);
  }

  /**
   * Lista compras.
   */
  async listPurchases(options?: { supplierId?: string; limit?: number; offset?: number }): Promise<PurchaseSummaryRecord[]> {
    return this.purchaseRepo.listPurchases(options);
  }

  /**
   * Obtiene compras de un proveedor.
   */
  async getSupplierPurchases(supplierId: string): Promise<PurchaseSummaryRecord[]> {
    return this.purchaseRepo.getSupplierPurchases(supplierId);
  }

  /**
   * Obtiene catálogo de insumos disponibles para un proveedor (asociados y no asociados),
   * junto con el saldo actual de stock y la cotización actual USD si aplica.
   */
  async getAvailableItemsForSupplier(supplierId: string): Promise<{
    items: AvailableItemForSupplier[];
    supplierCurrency: 'ARS' | 'USD';
    currentUsdRate: string | null;
  }> {
    const supplier = await this.supplierRepo.findById(supplierId);
    if (!supplier) {
      throw new DomainError(`Proveedor ${supplierId} no encontrado.`);
    }

    // 1. Obtener todos los stock_items activos de tipo MPR y COM
    const mprs = await this.masterItemRepo.listAll('MPR', false);
    const coms = await this.masterItemRepo.listAll('COM', false);
    const purchasableItems = [...mprs, ...coms];

    // 2. Obtener insumos ya asociados al proveedor
    const associatedSupplierItems = await this.supplierItemRepo.listBySupplier(supplierId);
    const associatedMap = new Map(associatedSupplierItems.map((si) => [si.stockItemId, si]));

    // 3. Obtener saldos consolidados de stock
    const balances = await this.stockRepo.getBatchBalances();

    // 4. Cotización USD si el proveedor opera en dólares
    let currentUsdRate: string | null = null;
    if (supplier.currencyCode === 'USD') {
      const rate = await this.supplierItemRepo.getCurrentUsdExchangeRate();
      currentUsdRate = rate ? toNumericString(rate) : null;
    }

    const resultItems: AvailableItemForSupplier[] = purchasableItems.map((item) => {
      const assoc = associatedMap.get(item.id);
      const balance = balances.get(item.id) || new Decimal(0);

      return {
        id: item.id,
        code: item.code,
        name: item.name,
        itemType: item.itemType as 'MPR' | 'COM',
        unitType: item.unitType as 'KG' | 'UNIT',
        isAssociated: !!assoc,
        quotedUnitPriceNet: assoc ? toNumericString(assoc.quotedUnitPriceNet) : null,
        priceUpdatedAt: assoc ? assoc.priceUpdatedAt : null,
        currentStock: toNumericString(balance),
      };
    });

    // Ordenar: primero los ya asociados, luego por nombre
    resultItems.sort((a, b) => {
      if (a.isAssociated && !b.isAssociated) return -1;
      if (!a.isAssociated && b.isAssociated) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      items: resultItems,
      supplierCurrency: supplier.currencyCode as 'ARS' | 'USD',
      currentUsdRate,
    };
  }
}
