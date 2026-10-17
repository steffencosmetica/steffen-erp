import { BaseSupabaseRepository } from './base.repository';
import { Decimal } from '@/domain/decimal';
import { DomainError } from '@/domain/errors';
import type { CustomerSource } from '@/database/domain-types';
import type { Database } from '@/database/types';
import { readExactDecimal } from './exact-numeric';

/**
 * Acceso READ-ONLY a las funciones analíticas de Reportes (migración 36,
 * docs/REPORTES.md §15). Solo RPC → validación → adaptación a Decimal / tipos
 * semánticos raw. Sin lógica de negocio ni de presentación (márgenes,
 * promedios, rankings, entityKey, etiquetas y meses futuros son de dominio).
 *
 * Nullabilidad: el generador de tipos de Supabase declara como no nulas todas
 * las columnas de RETURNS TABLE, pero en runtime first_year, customer_id y
 * customer_name pueden ser NULL. Por eso cada fila se trata como `unknown` y se
 * valida campo por campo; los tipos generados no se propagan fuera de aquí.
 */

export interface BillingMonthRecord {
  year: number;
  month: number;
  salesCount: number;
  billedArs: Decimal;
  gainArs: Decimal;
  transportArs: Decimal;
  expensesArs: Decimal;
}

export interface ProductTotalsRecord {
  productId: string;
  productName: string;
  units: number;
  billedArs: Decimal;
  costArs: Decimal;
  contributionArs: Decimal;
}

export interface EntityTotalsRecord {
  customerSource: CustomerSource;
  customerId: string | null;
  customerName: string | null;
  salesCount: number;
  billedArs: Decimal;
  firstPurchaseDate: string;
  lastPurchaseDate: string;
}

export interface EntitySaleRecord {
  remittanceId: string;
  rtoCode: string;
  businessDate: string;
  totalOrderArs: Decimal;
}

export interface IReportingRepository {
  getFirstReportingYear(asOfDate: string): Promise<number | null>;
  getBillingMonths(year: number, asOfDate: string): Promise<BillingMonthRecord[]>;
  getProductTotals(year: number, asOfDate: string): Promise<ProductTotalsRecord[]>;
  getEntityTotals(year: number, asOfDate: string): Promise<EntityTotalsRecord[]>;
  getEntitySales(
    year: number,
    asOfDate: string,
    customerSource: CustomerSource,
    customerId: string | null
  ): Promise<EntitySaleRecord[]>;
}

type Row = Record<string, unknown>;

const CUSTOMER_SOURCES: readonly CustomerSource[] = ['REGISTERED_CUSTOMER', 'MERCADO_LIBRE', 'CONSUMER_FINAL'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRows(data: unknown, fn: string): Row[] {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new DomainError(`${fn}: se esperaba un arreglo de filas.`);
  }
  return data.map((row, i) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new DomainError(`${fn}[${i}]: fila inválida.`);
    }
    return row as Row;
  });
}

/** Entero no negativo (bigint/int de PostgREST llega como número JSON; se admite también texto entero). */
function readCount(value: unknown, field: string): number {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
    throw new DomainError(`${field}: se esperaba un entero no negativo.`);
  }
  return n;
}

function readInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new DomainError(`${field}: se esperaba un entero.`);
  }
  return value;
}

function readText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new DomainError(`${field}: se esperaba texto no vacío.`);
  }
  return value;
}

function readNullableText(value: unknown, field: string): string | null {
  return value === null ? null : readText(value, field);
}

function readUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new DomainError(`${field}: se esperaba un UUID.`);
  }
  return value;
}

function readNullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : readUuid(value, field);
}

function readDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new DomainError(`${field}: se esperaba una fecha 'YYYY-MM-DD'.`);
  }
  return value;
}

function readCustomerSource(value: unknown, field: string): CustomerSource {
  const source = CUSTOMER_SOURCES.find((s) => s === value);
  if (!source) {
    throw new DomainError(`${field}: origen de cliente inválido (${String(value)}).`);
  }
  return source;
}

type EntitySalesArgs = Database['public']['Functions']['get_reporting_entity_sales']['Args'];

export class ReportingRepository extends BaseSupabaseRepository implements IReportingRepository {
  async getFirstReportingYear(asOfDate: string): Promise<number | null> {
    const fn = 'get_reporting_first_year';
    const { data, error } = await this.client.rpc(fn, { p_as_of_date: asOfDate });
    if (error) throw new DomainError(`Error consultando el primer año de Reportes: ${error.message}`);
    const rows = readRows(data, fn);
    if (rows.length !== 1) throw new DomainError(`${fn}: se esperaba exactamente una fila.`);
    const value = rows[0].first_year;
    return value === null ? null : readInteger(value, `${fn}.first_year`);
  }

  async getBillingMonths(year: number, asOfDate: string): Promise<BillingMonthRecord[]> {
    const fn = 'get_reporting_billing_months';
    const { data, error } = await this.client.rpc(fn, { p_year: year, p_as_of_date: asOfDate });
    if (error) throw new DomainError(`Error consultando la facturación mensual: ${error.message}`);
    return readRows(data, fn).map((row) => ({
      year: readInteger(row.year, `${fn}.year`),
      month: readInteger(row.month, `${fn}.month`),
      salesCount: readCount(row.sales_count, `${fn}.sales_count`),
      billedArs: readExactDecimal(row.billed_ars, `${fn}.billed_ars`),
      gainArs: readExactDecimal(row.gain_ars, `${fn}.gain_ars`),
      transportArs: readExactDecimal(row.transport_ars, `${fn}.transport_ars`),
      expensesArs: readExactDecimal(row.expenses_ars, `${fn}.expenses_ars`),
    }));
  }

  async getProductTotals(year: number, asOfDate: string): Promise<ProductTotalsRecord[]> {
    const fn = 'get_reporting_products';
    const { data, error } = await this.client.rpc(fn, { p_year: year, p_as_of_date: asOfDate });
    if (error) throw new DomainError(`Error consultando los productos de Reportes: ${error.message}`);
    return readRows(data, fn).map((row) => ({
      productId: readUuid(row.product_id, `${fn}.product_id`),
      productName: readText(row.product_name, `${fn}.product_name`),
      units: readCount(row.units, `${fn}.units`),
      billedArs: readExactDecimal(row.billed_ars, `${fn}.billed_ars`),
      costArs: readExactDecimal(row.cost_ars, `${fn}.cost_ars`),
      contributionArs: readExactDecimal(row.contribution_ars, `${fn}.contribution_ars`),
    }));
  }

  async getEntityTotals(year: number, asOfDate: string): Promise<EntityTotalsRecord[]> {
    const fn = 'get_reporting_entities';
    const { data, error } = await this.client.rpc(fn, { p_year: year, p_as_of_date: asOfDate });
    if (error) throw new DomainError(`Error consultando las entidades de Reportes: ${error.message}`);
    return readRows(data, fn).map((row) => ({
      customerSource: readCustomerSource(row.customer_source, `${fn}.customer_source`),
      customerId: readNullableUuid(row.customer_id, `${fn}.customer_id`),
      customerName: readNullableText(row.customer_name, `${fn}.customer_name`),
      salesCount: readCount(row.sales_count, `${fn}.sales_count`),
      billedArs: readExactDecimal(row.billed_ars, `${fn}.billed_ars`),
      firstPurchaseDate: readDate(row.first_purchase_date, `${fn}.first_purchase_date`),
      lastPurchaseDate: readDate(row.last_purchase_date, `${fn}.last_purchase_date`),
    }));
  }

  async getEntitySales(
    year: number,
    asOfDate: string,
    customerSource: CustomerSource,
    customerId: string | null
  ): Promise<EntitySaleRecord[]> {
    const fn = 'get_reporting_entity_sales';
    const args: Omit<EntitySalesArgs, 'p_customer_id'> & { p_customer_id: string | null } = {
      p_year: year,
      p_as_of_date: asOfDate,
      p_customer_source: customerSource,
      p_customer_id: customerId,
    };
    // El generador tipa p_customer_id como `string`, pero la función SQL acepta
    // NULL (obligatorio para Mercado Libre / Consumidor Final). Única aserción,
    // acotada a ese argumento.
    const { data, error } = await this.client.rpc(fn, args as EntitySalesArgs);
    if (error) throw new DomainError(`Error consultando las ventas de la entidad: ${error.message}`);
    return readRows(data, fn).map((row) => ({
      remittanceId: readUuid(row.remittance_id, `${fn}.remittance_id`),
      rtoCode: readText(row.rto_code, `${fn}.rto_code`),
      businessDate: readDate(row.business_date, `${fn}.business_date`),
      totalOrderArs: readExactDecimal(row.total_order_ars, `${fn}.total_order_ars`),
    }));
  }
}
