import { BaseSupabaseRepository } from './base.repository';
import { DomainError } from '@/domain/errors';
import { Decimal } from '@/domain/decimal';
import { readSaleBusinessDate } from './business-operation-date';
import { readExactDecimal } from './exact-numeric';

export interface MarginRemittanceItemRecord {
  id: string;
  marginRemittanceId: string;
  productId: string;
  quantitySent: number;
  unitCostTheoreticalSnapshotArs: Decimal;
  totalCostSnapshotArs: Decimal;
}

export interface MarginRemittanceRecord {
  id: string;
  code: string;
  operationId: string;
  remittanceId: string;
  productsCostTotalArs: Decimal;
  transportCostArs: Decimal;
  gainArs: Decimal;
  /** business_operations.business_date de la operación SALE_RTM (fecha comercial normativa). */
  businessDate: string;
  createdAt: string;
  items: MarginRemittanceItemRecord[];
}

export interface CompletedRtmResult {
  marginRemittanceId: string;
  code: string;
  operationId: string;
  remittanceId: string;
  remittanceCode: string;
  productsCostTotalArs: Decimal;
  transportCostArs: Decimal;
  gainArs: Decimal;
  movCode: string | null;
  businessDate: string;
  rtoStatus: 'COMPLETED';
}

export interface MarginRemittanceCodeRecord {
  id: string;
  code: string;
  remittanceId: string;
}

export interface IMarginRemittanceRepository {
  completeRtmAtomic(
    remittanceId: string,
    transportCostArs: Decimal.Value,
    businessDate?: string
  ): Promise<CompletedRtmResult>;
  getMarginRemittanceByRemittanceId(remittanceId: string): Promise<MarginRemittanceRecord | null>;
  listAllMarginRemittanceCodes(): Promise<MarginRemittanceCodeRecord[]>;
}

export class MarginRemittanceRepository extends BaseSupabaseRepository implements IMarginRemittanceRepository {
  async completeRtmAtomic(
    remittanceId: string,
    transportCostArs: Decimal.Value,
    businessDate?: string
  ): Promise<CompletedRtmResult> {
    const { data, error } = await (this.client.rpc as any)('complete_rtm_atomic', {
      p_remittance_id: remittanceId,
      p_transport_cost_ars: new Decimal(transportCostArs).toString(),
      p_business_date: businessDate || null,
    });

    if (error) {
      throw new DomainError(error.message);
    }

    const res = data as any;
    return {
      marginRemittanceId: res.margin_remittance_id,
      code: res.code,
      operationId: res.operation_id,
      remittanceId: res.remittance_id,
      remittanceCode: res.remittance_code,
      productsCostTotalArs: new Decimal(res.products_cost_total_ars),
      transportCostArs: new Decimal(res.transport_cost_ars),
      gainArs: new Decimal(res.gain_ars),
      movCode: res.mov_code,
      businessDate: res.business_date,
      rtoStatus: res.rto_status,
    };
  }

  async getMarginRemittanceByRemittanceId(remittanceId: string): Promise<MarginRemittanceRecord | null> {
    const { data, error } = await this.client
      .from('margin_remittances')
      .select(`
        id,
        code,
        operation_id,
        remittance_id,
        products_cost_total_ars::text,
        transport_cost_ars::text,
        gain_ars::text,
        created_at,
        margin_remittance_items (
          id,
          margin_remittance_id,
          product_id,
          quantity_sent,
          unit_cost_theoretical_snapshot_ars::text,
          total_cost_snapshot_ars::text
        ),
        business_operations (
          business_date,
          operation_type
        )
      `)
      .eq('remittance_id', remittanceId)
      .maybeSingle();

    if (error) {
      throw new DomainError(`Error obteniendo RTM del remito ${remittanceId}: ${error.message}`);
    }

    if (!data) return null;

    return this.mapMarginRemittanceRecord(data);
  }

  async listAllMarginRemittanceCodes(): Promise<MarginRemittanceCodeRecord[]> {
    const { data, error } = await this.client
      .from('margin_remittances')
      .select('id, code, remittance_id')
      .order('created_at', { ascending: true });
    if (error) {
      throw new DomainError(`Error listando RTMs: ${error.message}`);
    }
    return (data || []).map((r) => ({ id: r.id, code: r.code, remittanceId: r.remittance_id }));
  }

  private mapMarginRemittanceRecord(row: any): MarginRemittanceRecord {
    const items: MarginRemittanceItemRecord[] = (row.margin_remittance_items || []).map((it: any) => ({
      id: it.id,
      marginRemittanceId: it.margin_remittance_id,
      productId: it.product_id,
      quantitySent: Number(it.quantity_sent),
      unitCostTheoreticalSnapshotArs: readExactDecimal(
        it.unit_cost_theoretical_snapshot_ars,
        'margin_remittance_items.unit_cost_theoretical_snapshot_ars'
      ),
      totalCostSnapshotArs: readExactDecimal(it.total_cost_snapshot_ars, 'margin_remittance_items.total_cost_snapshot_ars'),
    }));

    return {
      id: row.id,
      code: row.code,
      operationId: row.operation_id,
      remittanceId: row.remittance_id,
      productsCostTotalArs: readExactDecimal(row.products_cost_total_ars, 'margin_remittances.products_cost_total_ars'),
      transportCostArs: readExactDecimal(row.transport_cost_ars, 'margin_remittances.transport_cost_ars'),
      gainArs: readExactDecimal(row.gain_ars, 'margin_remittances.gain_ars'),
      businessDate: readSaleBusinessDate(row.business_operations, 'SALE_RTM', `RTM ${row.code}`),
      createdAt: row.created_at,
      items,
    };
  }
}
