import { BaseSupabaseRepository } from './base.repository';
import { DomainError } from '@/domain/errors';
import { Decimal } from '@/domain/decimal';
import type { Database } from '@/database/types';

export interface CreatePurchaseRepoInput {
  supplierId: string;
  businessDate?: string;
  paymentMode: 'PAID' | 'DEBT';
  exchangeRateUsed?: Decimal | null;
  observations?: string | null;
  items: Array<{
    stockItemId: string;
    quantity: Decimal;
    unitPriceNetSource: Decimal;
    vatRatePct?: Decimal;
  }>;
}

export interface UpdatePurchaseRepoInput {
  purchaseId: string;
  businessDate?: string;
  paymentMode: 'PAID' | 'DEBT';
  exchangeRateUsed?: Decimal | null;
  observations?: string | null;
  items: Array<{
    stockItemId: string;
    quantity: Decimal;
    unitPriceNetSource: Decimal;
    vatRatePct?: Decimal;
  }>;
}

export interface PurchaseOperationResult {
  success: boolean;
  purchaseId: string;
  code: string;
  operationId: string;
  businessDate: string;
  supplierId: string;
  supplierName: string;
  paymentMode: 'PAID' | 'DEBT';
  currencyCode: 'ARS' | 'USD';
  exchangeRateUsed: Decimal | null;
  totalNetSourceCurrency: Decimal;
  totalGrossArs: Decimal;
  patrimonialMovementCode?: string;
  items: Array<{
    stockItemId: string;
    quantity: Decimal;
    unitPriceNetSource: Decimal;
    unitPriceGrossArs: Decimal;
    lineTotalGrossArs: Decimal;
    mstCode?: string;
  }>;
}

export interface PurchaseItemRecord {
  id: string;
  purchaseId: string;
  stockItemId: string;
  stockItemCode: string;
  stockItemName: string;
  stockItemType: 'MPR' | 'COM';
  unitType: 'KG' | 'UNIT';
  quantity: Decimal;
  unitPriceNetSource: Decimal;
  vatRatePct: Decimal;
  unitPriceGrossArsSnapshot: Decimal;
  lineTotalGrossArs: Decimal;
  sortOrder: number;
}

export interface PurchaseDetailRecord {
  id: string;
  code: string;
  operationId: string;
  businessDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  paymentMode: 'PAID' | 'DEBT';
  currencyCodeSnapshot: 'ARS' | 'USD';
  exchangeRateUsed: Decimal | null;
  totalNetSourceCurrency: Decimal;
  totalGrossArs: Decimal;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseItemRecord[];
}

export interface PurchaseSummaryRecord {
  id: string;
  code: string;
  operationId: string;
  businessDate: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  paymentMode: 'PAID' | 'DEBT';
  currencyCodeSnapshot: 'ARS' | 'USD';
  exchangeRateUsed: Decimal | null;
  totalNetSourceCurrency: Decimal;
  totalGrossArs: Decimal;
  observations: string | null;
  itemsCount: number;
  createdAt: string;
}

export class PurchaseRepository extends BaseSupabaseRepository {
  /**
   * Ejecuta la RPC transaccional create_purchase_atomic en PostgreSQL.
   */
  async createPurchase(input: CreatePurchaseRepoInput): Promise<PurchaseOperationResult> {
    const payloadItems = input.items.map((item) => ({
      stock_item_id: item.stockItemId,
      quantity: Number(item.quantity.toString()),
      unit_price_net_source: Number(item.unitPriceNetSource.toString()),
      vat_rate_pct: item.vatRatePct ? Number(item.vatRatePct.toString()) : 21.0,
    }));

    const { data, error } = await this.client.rpc('create_purchase_atomic', {
      p_supplier_id: input.supplierId,
      p_business_date: input.businessDate || new Date().toISOString().split('T')[0],
      p_payment_mode: input.paymentMode,
      p_exchange_rate_used: input.exchangeRateUsed ? Number(input.exchangeRateUsed.toString()) : 0,
      p_observations: input.observations || '',
      p_items: payloadItems,
    });

    if (error) {
      throw new DomainError(`Error al registrar compra: ${error.message}`);
    }

    const res = data as unknown as {
      success: boolean;
      purchase_id: string;
      code: string;
      operation_id: string;
      business_date: string;
      supplier_id: string;
      supplier_name: string;
      payment_mode: 'PAID' | 'DEBT';
      currency_code: 'ARS' | 'USD';
      exchange_rate_used: number | null;
      total_net_source_currency: string;
      total_gross_ars: string;
      patrimonial_movement_code?: string;
      items: Array<{
        stock_item_id: string;
        quantity: number | string;
        unit_price_net_source: number | string;
        unit_price_gross_ars: number | string;
        line_total_gross_ars: number | string;
        mst_code?: string;
      }>;
    };

    return {
      success: res.success,
      purchaseId: res.purchase_id,
      code: res.code,
      operationId: res.operation_id,
      businessDate: res.business_date,
      supplierId: res.supplier_id,
      supplierName: res.supplier_name,
      paymentMode: res.payment_mode,
      currencyCode: res.currency_code,
      exchangeRateUsed: res.exchange_rate_used != null ? new Decimal(res.exchange_rate_used.toString()) : null,
      totalNetSourceCurrency: new Decimal(res.total_net_source_currency),
      totalGrossArs: new Decimal(res.total_gross_ars),
      patrimonialMovementCode: res.patrimonial_movement_code,
      items: (res.items || []).map((it) => ({
        stockItemId: it.stock_item_id,
        quantity: new Decimal(it.quantity.toString()),
        unitPriceNetSource: new Decimal(it.unit_price_net_source.toString()),
        unitPriceGrossArs: new Decimal(it.unit_price_gross_ars.toString()),
        lineTotalGrossArs: new Decimal(it.line_total_gross_ars.toString()),
        mstCode: it.mst_code,
      })),
    };
  }

  /**
   * Ejecuta la RPC transaccional update_purchase_atomic en PostgreSQL.
   */
  async updatePurchase(input: UpdatePurchaseRepoInput): Promise<PurchaseOperationResult> {
    const payloadItems = input.items.map((item) => ({
      stock_item_id: item.stockItemId,
      quantity: Number(item.quantity.toString()),
      unit_price_net_source: Number(item.unitPriceNetSource.toString()),
      vat_rate_pct: item.vatRatePct ? Number(item.vatRatePct.toString()) : 21.0,
    }));

    const { data, error } = await this.client.rpc('update_purchase_atomic', {
      p_purchase_id: input.purchaseId,
      p_business_date: input.businessDate || new Date().toISOString().split('T')[0],
      p_payment_mode: input.paymentMode,
      p_exchange_rate_used: input.exchangeRateUsed ? Number(input.exchangeRateUsed.toString()) : 0,
      p_observations: input.observations || '',
      p_items: payloadItems,
    });

    if (error) {
      throw new DomainError(`Error al editar compra: ${error.message}`);
    }

    const res = data as unknown as {
      success: boolean;
      purchase_id: string;
      code: string;
      operation_id: string;
      business_date: string;
      supplier_id: string;
      supplier_name: string;
      payment_mode: 'PAID' | 'DEBT';
      currency_code: 'ARS' | 'USD';
      exchange_rate_used: number | null;
      total_net_source_currency: string;
      total_gross_ars: string;
      items: Array<{
        stock_item_id: string;
        quantity: number | string;
        unit_price_net_source: number | string;
        unit_price_gross_ars: number | string;
        line_total_gross_ars: number | string;
      }>;
    };

    return {
      success: res.success,
      purchaseId: res.purchase_id,
      code: res.code,
      operationId: res.operation_id,
      businessDate: res.business_date,
      supplierId: res.supplier_id,
      supplierName: res.supplier_name,
      paymentMode: res.payment_mode,
      currencyCode: res.currency_code,
      exchangeRateUsed: res.exchange_rate_used != null ? new Decimal(res.exchange_rate_used.toString()) : null,
      totalNetSourceCurrency: new Decimal(res.total_net_source_currency),
      totalGrossArs: new Decimal(res.total_gross_ars),
      items: (res.items || []).map((it) => ({
        stockItemId: it.stock_item_id,
        quantity: new Decimal(it.quantity.toString()),
        unitPriceNetSource: new Decimal(it.unit_price_net_source.toString()),
        unitPriceGrossArs: new Decimal(it.unit_price_gross_ars.toString()),
        lineTotalGrossArs: new Decimal(it.line_total_gross_ars.toString()),
      })),
    };
  }

  /**
   * Obtiene una compra con todos sus renglones e información de insumos y proveedor.
   */
  async getPurchaseById(id: string): Promise<PurchaseDetailRecord | null> {
    const { data: purchase, error: purchaseError } = await this.client
      .from('purchases')
      .select(`
        *,
        suppliers (id, code, name),
        business_operations (business_date)
      `)
      .eq('id', id)
      .maybeSingle();

    if (purchaseError) {
      throw new DomainError(`Error al consultar compra: ${purchaseError.message}`);
    }

    if (!purchase) {
      return null;
    }

    const { data: items, error: itemsError } = await this.client
      .from('purchase_items')
      .select(`
        *,
        stock_items (id, code, name, item_type, unit_type)
      `)
      .eq('purchase_id', id)
      .order('sort_order', { ascending: true });

    if (itemsError) {
      throw new DomainError(`Error al consultar ítems de compra: ${itemsError.message}`);
    }

    const supplierData = purchase.suppliers as unknown as { id: string; code: string; name: string };
    const opData = purchase.business_operations as unknown as { business_date: string };

    const mappedItems: PurchaseItemRecord[] = (items || []).map((it) => {
      const stockItem = it.stock_items as unknown as {
        id: string;
        code: string;
        name: string;
        item_type: 'MPR' | 'COM';
        unit_type: 'KG' | 'UNIT';
      };

      return {
        id: it.id,
        purchaseId: it.purchase_id,
        stockItemId: it.stock_item_id,
        stockItemCode: stockItem?.code || '',
        stockItemName: stockItem?.name || '',
        stockItemType: stockItem?.item_type || 'MPR',
        unitType: stockItem?.unit_type || 'KG',
        quantity: new Decimal(it.quantity.toString()),
        unitPriceNetSource: new Decimal(it.unit_price_net_source.toString()),
        vatRatePct: new Decimal(it.vat_rate_pct.toString()),
        unitPriceGrossArsSnapshot: new Decimal(it.unit_price_gross_ars_snapshot.toString()),
        lineTotalGrossArs: new Decimal(it.line_total_gross_ars.toString()),
        sortOrder: it.sort_order,
      };
    });

    return {
      id: purchase.id,
      code: purchase.code,
      operationId: purchase.operation_id,
      businessDate: opData?.business_date || purchase.created_at.split('T')[0],
      supplierId: purchase.supplier_id,
      supplierCode: supplierData?.code || '',
      supplierName: supplierData?.name || '',
      paymentMode: purchase.payment_mode as 'PAID' | 'DEBT',
      currencyCodeSnapshot: purchase.currency_code_snapshot as 'ARS' | 'USD',
      exchangeRateUsed: purchase.exchange_rate_used != null ? new Decimal(purchase.exchange_rate_used.toString()) : null,
      totalNetSourceCurrency: new Decimal(purchase.total_net_source_currency.toString()),
      totalGrossArs: new Decimal(purchase.total_gross_ars.toString()),
      observations: purchase.observations,
      createdAt: purchase.created_at,
      updatedAt: purchase.updated_at,
      items: mappedItems,
    };
  }

  /**
   * Obtiene una compra por su código visible (CMPxxxx).
   */
  async getPurchaseByCode(code: string): Promise<PurchaseDetailRecord | null> {
    const { data: purchase, error } = await this.client
      .from('purchases')
      .select('id')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();

    if (error || !purchase) {
      return null;
    }

    return this.getPurchaseById(purchase.id);
  }

  /**
   * Lista compras con soporte de filtros y paginación para vistas de listado.
   */
  async listPurchases(options?: {
    supplierId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PurchaseSummaryRecord[]> {
    let query = this.client
      .from('purchases')
      .select(`
        id,
        code,
        operation_id,
        payment_mode,
        currency_code_snapshot,
        exchange_rate_used,
        total_net_source_currency,
        total_gross_ars,
        observations,
        created_at,
        suppliers (id, code, name),
        business_operations (business_date),
        purchase_items (id)
      `)
      .order('created_at', { ascending: false });

    if (options?.supplierId) {
      query = query.eq('supplier_id', options.supplierId);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new DomainError(`Error al listar compras: ${error.message}`);
    }

    return (data || []).map((row) => {
      const supplierData = row.suppliers as unknown as { id: string; code: string; name: string };
      const opData = row.business_operations as unknown as { business_date: string };
      const itemsList = row.purchase_items as unknown as Array<{ id: string }>;

      return {
        id: row.id,
        code: row.code,
        operationId: row.operation_id,
        businessDate: opData?.business_date || row.created_at.split('T')[0],
        supplierId: supplierData?.id || '',
        supplierCode: supplierData?.code || '',
        supplierName: supplierData?.name || '',
        paymentMode: row.payment_mode as 'PAID' | 'DEBT',
        currencyCodeSnapshot: row.currency_code_snapshot as 'ARS' | 'USD',
        exchangeRateUsed: row.exchange_rate_used != null ? new Decimal(row.exchange_rate_used.toString()) : null,
        totalNetSourceCurrency: new Decimal(row.total_net_source_currency.toString()),
        totalGrossArs: new Decimal(row.total_gross_ars.toString()),
        observations: row.observations,
        itemsCount: itemsList ? itemsList.length : 0,
        createdAt: row.created_at,
      };
    });
  }

  /**
   * Obtiene todas las compras de un proveedor específico para su estado de cuenta / ficha.
   */
  async getSupplierPurchases(supplierId: string): Promise<PurchaseSummaryRecord[]> {
    return this.listPurchases({ supplierId });
  }
}
