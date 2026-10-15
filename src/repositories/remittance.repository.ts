import { BaseSupabaseRepository } from './base.repository';
import { DomainError } from '@/domain/errors';
import { Decimal, toNumericString, toKgPrecision, toWholePesos } from '@/domain/decimal';
import type { CustomerSource } from '@/database/domain-types';

export interface RemittanceDiscountStepRecord {
  id: string;
  remittanceId: string;
  position: number;
  percent: Decimal;
  amountArsSnapshot: Decimal;
}

export interface RemittanceItemRecord {
  id: string;
  remittanceId: string;
  productId: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  presentationSnapshot: string;
  weightKgSnapshot: Decimal;
  quantitySent: number;
  unitPriceArsSnapshot: Decimal;
  lineTotalArs: Decimal;
}

export interface RemittanceRecord {
  id: string;
  code: string;
  operationId: string;
  orderId: string;
  status: 'RTM_PENDING' | 'COMPLETED';
  customerSource: CustomerSource;
  customerId: string | null;
  customerDisplayName: string;
  recipientNameSnapshot: string | null;
  addressSnapshot: string | null;
  localitySnapshot: string | null;
  provinceSnapshot: string | null;
  phoneSnapshot: string | null;
  transportNameSnapshot: string | null;
  transportAddressSnapshot: string | null;
  packageCountSnapshot: number | null;
  weightKgSnapshot: Decimal;
  subtotalArs: Decimal;
  totalOrderArs: Decimal;
  priorBalanceSnapshotArs: Decimal;
  totalToCollectArs: Decimal;
  createdAt: string;
  items: RemittanceItemRecord[];
  discountSteps: RemittanceDiscountStepRecord[];
}

export interface ConfirmedRemittanceResult {
  remittanceId: string;
  code: string;
  operationId: string;
  orderId: string;
  status: 'RTM_PENDING';
  customerSource: CustomerSource;
  recipientName: string;
  subtotalArs: Decimal;
  totalOrderArs: Decimal;
  priorBalanceSnapshotArs: Decimal;
  totalToCollectArs: Decimal;
  weightKgSnapshot: Decimal;
  movCode: string;
  businessDate: string;
}

export interface MonthlySaleRecord {
  remittanceId: string;
  rtoCode: string;
  rtmCode: string;
  businessDate: string;
  customerSource: CustomerSource;
  customerDisplayName: string;
  totalOrderArs: Decimal;
  gainArs: Decimal;
}

export interface IRemittanceRepository {
  confirmOrderToRemittanceAtomic(orderId: string, businessDate?: string): Promise<ConfirmedRemittanceResult>;
  getRemittanceById(id: string): Promise<RemittanceRecord | null>;
  getRemittanceByOrderId(orderId: string): Promise<RemittanceRecord | null>;
  getPendingRtmRemittance(): Promise<RemittanceRecord | null>;
  listCompletedSalesForMonth(year: number, month: number): Promise<MonthlySaleRecord[]>;
}

export class RemittanceRepository extends BaseSupabaseRepository implements IRemittanceRepository {
  async confirmOrderToRemittanceAtomic(orderId: string, businessDate?: string): Promise<ConfirmedRemittanceResult> {
    const { data, error } = await (this.client.rpc as any)('confirm_order_to_remittance_atomic', {
      p_order_id: orderId,
      p_business_date: businessDate || null,
    });

    if (error) {
      throw new DomainError(error.message);
    }

    const res = data as any;
    return {
      remittanceId: res.remittance_id,
      code: res.code,
      operationId: res.operation_id,
      orderId: res.order_id,
      status: res.status,
      customerSource: res.customer_source,
      recipientName: res.recipient_name,
      subtotalArs: new Decimal(res.subtotal_ars),
      totalOrderArs: new Decimal(res.total_order_ars),
      priorBalanceSnapshotArs: new Decimal(res.prior_balance_snapshot_ars),
      totalToCollectArs: new Decimal(res.total_to_collect_ars),
      weightKgSnapshot: new Decimal(res.weight_kg_snapshot),
      movCode: res.mov_code,
      businessDate: res.business_date,
    };
  }

  async getRemittanceById(id: string): Promise<RemittanceRecord | null> {
    const { data, error } = await this.client
      .from('remittances')
      .select(`
        *,
        customers (
          id,
          name,
          code
        ),
        remittance_items (
          id,
          remittance_id,
          product_id,
          product_code_snapshot,
          product_name_snapshot,
          presentation_snapshot,
          weight_kg_snapshot,
          quantity_sent,
          unit_price_ars_snapshot,
          line_total_ars
        ),
        remittance_discount_steps (
          id,
          remittance_id,
          position,
          percent,
          amount_ars_snapshot
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error obteniendo remito ${id}: ${error.message}`);
    }

    if (!data) return null;

    return this.mapRemittanceRecord(data);
  }

  async getRemittanceByOrderId(orderId: string): Promise<RemittanceRecord | null> {
    const { data, error } = await this.client
      .from('remittances')
      .select(`
        *,
        customers (
          id,
          name,
          code
        ),
        remittance_items (
          id,
          remittance_id,
          product_id,
          product_code_snapshot,
          product_name_snapshot,
          presentation_snapshot,
          weight_kg_snapshot,
          quantity_sent,
          unit_price_ars_snapshot,
          line_total_ars
        ),
        remittance_discount_steps (
          id,
          remittance_id,
          position,
          percent,
          amount_ars_snapshot
        )
      `)
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error obteniendo remito del pedido ${orderId}: ${error.message}`);
    }

    if (!data) return null;

    return this.mapRemittanceRecord(data);
  }

  async getPendingRtmRemittance(): Promise<RemittanceRecord | null> {
    const { data, error } = await this.client
      .from('remittances')
      .select(`
        *,
        customers (
          id,
          name,
          code
        ),
        remittance_items (
          id,
          remittance_id,
          product_id,
          product_code_snapshot,
          product_name_snapshot,
          presentation_snapshot,
          weight_kg_snapshot,
          quantity_sent,
          unit_price_ars_snapshot,
          line_total_ars
        ),
        remittance_discount_steps (
          id,
          remittance_id,
          position,
          percent,
          amount_ars_snapshot
        )
      `)
      .eq('status', 'RTM_PENDING')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error consultando remitos con RTM pendiente: ${error.message}`);
    }

    if (!data) return null;

    return this.mapRemittanceRecord(data);
  }

  private mapRemittanceRecord(row: any): RemittanceRecord {
    let customerDisplayName = 'Consumidor Final';
    if (row.customer_source === 'REGISTERED_CUSTOMER') {
      customerDisplayName = row.customers?.name || row.recipient_name_snapshot || 'Cliente Registrado';
    } else if (row.customer_source === 'MERCADO_LIBRE') {
      customerDisplayName = 'Mercado Libre';
    } else if (row.customer_source === 'CONSUMER_FINAL') {
      customerDisplayName = row.recipient_name_snapshot || 'Consumidor Final';
    }

    const items: RemittanceItemRecord[] = (row.remittance_items || []).map((it: any) => ({
      id: it.id,
      remittanceId: it.remittance_id,
      productId: it.product_id,
      productCodeSnapshot: it.product_code_snapshot,
      productNameSnapshot: it.product_name_snapshot,
      presentationSnapshot: it.presentation_snapshot,
      weightKgSnapshot: new Decimal(it.weight_kg_snapshot),
      quantitySent: Number(it.quantity_sent),
      unitPriceArsSnapshot: new Decimal(it.unit_price_ars_snapshot),
      lineTotalArs: new Decimal(it.line_total_ars),
    }));

    const discountSteps: RemittanceDiscountStepRecord[] = (row.remittance_discount_steps || [])
      .map((ds: any) => ({
        id: ds.id,
        remittanceId: ds.remittance_id,
        position: Number(ds.position),
        percent: new Decimal(ds.percent),
        amountArsSnapshot: new Decimal(ds.amount_ars_snapshot),
      }))
      .sort((a: RemittanceDiscountStepRecord, b: RemittanceDiscountStepRecord) => a.position - b.position);

    return {
      id: row.id,
      code: row.code,
      operationId: row.operation_id,
      orderId: row.order_id,
      status: row.status,
      customerSource: row.customer_source as CustomerSource,
      customerId: row.customer_id,
      customerDisplayName,
      recipientNameSnapshot: row.recipient_name_snapshot,
      addressSnapshot: row.address_snapshot,
      localitySnapshot: row.locality_snapshot,
      provinceSnapshot: row.province_snapshot,
      phoneSnapshot: row.phone_snapshot,
      transportNameSnapshot: row.transport_name_snapshot,
      transportAddressSnapshot: row.transport_address_snapshot,
      packageCountSnapshot: row.package_count_snapshot !== null ? Number(row.package_count_snapshot) : null,
      weightKgSnapshot: new Decimal(row.weight_kg_snapshot),
      subtotalArs: new Decimal(row.subtotal_ars),
      totalOrderArs: new Decimal(row.total_order_ars),
      priorBalanceSnapshotArs: new Decimal(row.prior_balance_snapshot_ars),
      totalToCollectArs: new Decimal(row.total_to_collect_ars),
      createdAt: row.created_at,
      items,
      discountSteps,
    };
  }

  /**
   * Ventas del mes (Administración): únicamente RTO status=COMPLETED con su RTM
   * asociado (margin_remittances), filtradas por la fecha funcional del propio
   * RTO/venta (business_operations.business_date de la operación SALE_RTO vía
   * remittances.operation_id) — nunca por created_at del RTM. Usa exclusivamente
   * los snapshots definitivos (total_order_ars, gain_ars), sin recalcular nada.
   */
  async listCompletedSalesForMonth(year: number, month: number): Promise<MonthlySaleRecord[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDateExclusive =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { data, error } = await this.client
      .from('remittances')
      .select(`
        id,
        code,
        customer_source,
        customer_id,
        recipient_name_snapshot,
        total_order_ars,
        customers (name),
        business_operations (business_date),
        margin_remittances (code, gain_ars)
      `)
      .eq('status', 'COMPLETED')
      .gte('business_operations.business_date', startDate)
      .lt('business_operations.business_date', endDateExclusive);

    if (error) {
      throw new DomainError(`Error listando ventas del mes: ${error.message}`);
    }

    const results: MonthlySaleRecord[] = [];

    for (const row of (data || []) as any[]) {
      const bo = Array.isArray(row.business_operations) ? row.business_operations[0] : row.business_operations;
      const mr = Array.isArray(row.margin_remittances) ? row.margin_remittances[0] : row.margin_remittances;

      // Defensivo: solo RTO COMPLETED con RTM real asociado y fecha funcional dentro del mes.
      if (!bo?.business_date || !mr) continue;

      let customerDisplayName = 'Consumidor Final';
      if (row.customer_source === 'REGISTERED_CUSTOMER') {
        customerDisplayName = row.customers?.name || row.recipient_name_snapshot || 'Cliente Registrado';
      } else if (row.customer_source === 'MERCADO_LIBRE') {
        customerDisplayName = 'Mercado Libre';
      } else if (row.customer_source === 'CONSUMER_FINAL') {
        customerDisplayName = row.recipient_name_snapshot || 'Consumidor Final';
      }

      results.push({
        remittanceId: row.id,
        rtoCode: row.code,
        rtmCode: mr.code,
        businessDate: bo.business_date,
        customerSource: row.customer_source as CustomerSource,
        customerDisplayName,
        totalOrderArs: new Decimal(row.total_order_ars),
        gainArs: new Decimal(mr.gain_ars),
      });
    }

    results.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
    return results;
  }
}
