import { BaseSupabaseRepository } from './base.repository';
import type { AccountType, PatrimonialMovementType } from '@/database/domain-types';
import {
  DomainError,
  OpeningBalanceAlreadyExistsError,
  OpeningBalanceLockedError,
  InvalidOpeningBalanceAccountError,
} from '@/domain/errors';
import { Decimal, toNumericString } from '@/domain/decimal';
import { readExactDecimal } from './exact-numeric';

export interface FinancialAccountRecord {
  id: string;
  accountType: AccountType;
  name: string;
  currentBalance: Decimal;
  active: boolean;
  customerId?: string | null;
  supplierId?: string | null;
}

export interface FinancialEntryRpcParam {
  financial_account_id: string;
  delta_ars: string;
}

export interface PostPatrimonialMovementRpcInput {
  operationId: string;
  movementType: PatrimonialMovementType;
  description: string;
  amountArs: Decimal;
  entries: Array<{ financialAccountId: string; deltaArs: Decimal }>;
}

export interface PatrimonialMovementRpcResult {
  movementId: string;
  code: string;
}

export interface PatrimonialMovementFullRecord {
  id: string;
  code: string;
  operationId: string;
  businessDate: string;
  movementType: PatrimonialMovementType;
  description: string;
  amountArs: Decimal;
  patrimonialVariation: string;
  createdAt: string;
}

export interface PaymentAtomicRpcResult {
  operationId: string;
  paymentId: string;
  movementId: string;
  code: string;
  amountArs: Decimal;
  businessDate: string;
}

export interface EditPaymentAtomicRpcResult {
  paymentId: string;
  operationId: string;
  movementId: string;
  code: string;
  oldAmountArs: Decimal;
  newAmountArs: Decimal;
  deltaArs: Decimal;
  businessDate: string;
}

export interface WithdrawalAtomicRpcResult {
  operationId: string;
  withdrawalId: string;
  movementId: string;
  code: string;
  amountArs: Decimal;
  businessDate: string;
}

export interface OperatingExpenseAtomicRpcResult {
  operationId: string;
  expenseId: string;
  movementId: string;
  code: string;
  amountArs: Decimal;
  businessDate: string;
}

export interface PaymentDetailRecord {
  id: string;
  operationId: string;
  paymentType: 'CUSTOMER' | 'SUPPLIER';
  customerId: string | null;
  customerName?: string;
  supplierId: string | null;
  supplierName?: string;
  amountArs: Decimal;
  businessDate: string;
  code: string;
  createdAt: string;
}

export interface CashDepositAtomicRpcResult {
  operationId: string;
  cashDepositId: string;
  movementId: string;
  code: string;
  amountArs: Decimal;
  businessDate: string;
}

export type OpeningBalancePartyType = 'CUSTOMER' | 'SUPPLIER';

/** Saldo de apertura vigente de una cuenta corriente (BUSINESS_RULES §20.2). */
export interface OpeningBalanceRecord {
  id: string;
  amountArs: Decimal;
  businessDate: string;
  observation: string | null;
  movementCode: string;
}

export interface OpeningBalanceStateRecord {
  accountId: string | null;
  accountType: AccountType | null;
  currentBalance: Decimal | null;
  opening: OpeningBalanceRecord | null;
  /** Actividad de la cuenta distinta de la apertura (asientos, pagos, compras, RTO). */
  hasOtherActivity: boolean;
}

export interface OpeningBalanceRpcResult {
  openingBalanceId: string;
  operationId: string;
  movementId: string;
  code: string;
  financialAccountId: string;
  amountArs: Decimal;
  businessDate: string;
}

export interface EditOpeningBalanceRpcResult {
  openingBalanceId: string;
  operationId: string;
  movementId: string;
  code: string;
  financialAccountId: string;
  oldAmountArs: Decimal;
  newAmountArs: Decimal;
  deltaArs: Decimal;
  businessDate: string;
}

export interface DeleteOpeningBalanceRpcResult {
  openingBalanceId: string;
  operationId: string;
  code: string;
  financialAccountId: string;
  amountArs: Decimal;
}

export interface AccountMovementRecord {
  id: string;
  date: string;
  type: 'COMPRA' | 'VENTA' | 'PAGO' | 'APERTURA';
  documentCode: string;
  amountArs: Decimal;
  isPayment: boolean;
  paymentId?: string;
  purchaseId?: string;
  remittanceId?: string;
  rtoDocumentStatus?: string;
  paymentMode?: string;
  currencyCodeSnapshot?: string;
  totalNetSourceCurrency?: string;
}

export interface AdminSupplierDebtRecord {
  supplierId: string;
  name: string;
  balanceArs: Decimal;
  lastPaymentDate: string | null;
  lastPurchaseDate: string | null;
}

export interface CustomerLastActivityRecord {
  customerId: string;
  lastPaymentDate: string | null;
  lastPurchaseDate: string | null;
}

export interface PatrimonialSummary {
  cajaSteffen: Decimal;
  cajaMercadoLibre: Decimal;
  deudasClientes: Decimal;
  deudasProveedores: Decimal;
  neto: Decimal;
}

export interface MovementsFilter {
  startDate?: string;
  endDate?: string;
  movementType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface IPatrimonyRepository {
  getAccount(accountId: string): Promise<FinancialAccountRecord | null>;
  listAccounts(): Promise<FinancialAccountRecord[]>;
  getPatrimonialSummary(): Promise<PatrimonialSummary>;
  listRecentMovements(limit?: number): Promise<PatrimonialMovementFullRecord[]>;
  listMovements(filter?: MovementsFilter): Promise<PatrimonialMovementFullRecord[]>;
  postPatrimonialMovementAtomic(input: PostPatrimonialMovementRpcInput): Promise<PatrimonialMovementRpcResult>;
  registerCustomerPaymentAtomic(input: { customerId: string; amountArs: Decimal; businessDate: string }): Promise<PaymentAtomicRpcResult>;
  registerSupplierPaymentAtomic(input: { supplierId: string; amountArs: Decimal; businessDate: string }): Promise<PaymentAtomicRpcResult>;
  editPaymentAtomic(input: { paymentId: string; newAmountArs: Decimal; newBusinessDate?: string }): Promise<EditPaymentAtomicRpcResult>;
  registerWithdrawalAtomic(input: { amountArs: Decimal; description: string; businessDate: string }): Promise<WithdrawalAtomicRpcResult>;
  registerOperatingExpenseAtomic(input: { expenseType: string; description?: string; amountArs: Decimal; businessDate: string }): Promise<OperatingExpenseAtomicRpcResult>;
  registerCashDepositAtomic(input: { amountArs: Decimal; description: string; businessDate: string }): Promise<CashDepositAtomicRpcResult>;
  getOpeningBalanceState(partyType: OpeningBalancePartyType, partyId: string): Promise<OpeningBalanceStateRecord>;
  registerOpeningBalanceAtomic(input: {
    financialAccountId: string;
    amountArs: Decimal;
    businessDate: string;
    observation?: string;
  }): Promise<OpeningBalanceRpcResult>;
  editOpeningBalanceAtomic(input: {
    openingBalanceId: string;
    newAmountArs: Decimal;
    newBusinessDate: string;
    observation?: string;
  }): Promise<EditOpeningBalanceRpcResult>;
  deleteOpeningBalanceAtomic(openingBalanceId: string): Promise<DeleteOpeningBalanceRpcResult>;
  getPaymentById(paymentId: string): Promise<PaymentDetailRecord | null>;
  listCustomerAccountMovements(customerId: string): Promise<AccountMovementRecord[]>;
  listSupplierAccountMovements(supplierId: string): Promise<AccountMovementRecord[]>;
  listSupplierDebtsWithActivity(): Promise<AdminSupplierDebtRecord[]>;
  getCustomerLastActivityMap(): Promise<Map<string, CustomerLastActivityRecord>>;
}

/**
 * RPCs de Fase 19.1 (saldo de apertura / ingreso de caja): el resultado JSONB se
 * valida campo por campo y los importes llegan como NUMERIC::text exacto.
 */
type RpcError = { message: string; code?: string };
type RpcCaller = (
  fn: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: RpcError | null }>;

function asRecord(value: unknown, fn: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DomainError(`${fn}: respuesta inesperada de la base.`);
  }
  return value as Record<string, unknown>;
}

function readText(row: Record<string, unknown>, field: string, fn: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value === '') {
    throw new DomainError(`${fn}.${field}: se esperaba texto.`);
  }
  return value;
}

function readOptionalText(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** SQLSTATE propios de la migración 20261002000034 → errores de dominio. */
function toOpeningBalanceError(error: RpcError, context: string): DomainError {
  switch (error.code) {
    case 'SA001':
      return new OpeningBalanceAlreadyExistsError(error.message);
    case 'SA002':
      return new OpeningBalanceLockedError(error.message);
    case 'SA003':
      return new InvalidOpeningBalanceAccountError(error.message);
    default:
      return new DomainError(`${context}: ${error.message}`);
  }
}

export function formatPatrimonialVariationFromEntries(
  entries: Array<{
    delta_ars: number | string;
    financial_accounts?: { account_type: string; name: string } | null;
  }>
): string {
  if (!entries || entries.length === 0) return '';
  const parts: string[] = [];

  for (const entry of entries) {
    const delta = new Decimal(entry.delta_ars);
    const accType = entry.financial_accounts?.account_type;

    if (accType === 'CASH_STEFFEN') {
      parts.push(delta.isNegative() ? '- CAJA' : '+ CAJA');
    } else if (accType === 'CASH_MERCADO_LIBRE') {
      parts.push(delta.isNegative() ? '- CAJA ML' : '+ CAJA ML');
    } else if (accType === 'CUSTOMER_RECEIVABLE') {
      parts.push(delta.isNegative() ? '- DEUDA CLIENTE' : '+ DEUDA CLIENTES');
    } else if (accType === 'SUPPLIER_PAYABLE') {
      parts.push(delta.isNegative() ? '- DEUDA PROVEEDORES' : '+ DEUDA PROVEEDORES');
    }
  }

  return parts.join(', ');
}

export class PatrimonyRepository extends BaseSupabaseRepository implements IPatrimonyRepository {
  async listAccounts(): Promise<FinancialAccountRecord[]> {
    const { data, error } = await this.client
      .from('financial_accounts')
      .select('id, account_type, name, current_balance, active, customer_id, supplier_id');

    if (error) {
      throw new DomainError(`Error obteniendo cuentas financieras: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      accountType: row.account_type as AccountType,
      name: row.name,
      currentBalance: new Decimal(row.current_balance),
      active: row.active,
      customerId: row.customer_id,
      supplierId: row.supplier_id,
    }));
  }

  async getAccount(accountId: string): Promise<FinancialAccountRecord | null> {
    const { data, error } = await this.client
      .from('financial_accounts')
      .select('id, account_type, name, current_balance, active, customer_id, supplier_id')
      .eq('id', accountId)
      .limit(1);

    if (error) {
      throw new DomainError(`Error obteniendo cuenta financiera ${accountId}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const row = data[0] as any;
    return {
      id: row.id,
      accountType: row.account_type as AccountType,
      name: row.name,
      currentBalance: new Decimal(row.current_balance),
      active: row.active,
      customerId: row.customer_id,
      supplierId: row.supplier_id,
    };
  }

  async getPatrimonialSummary(): Promise<PatrimonialSummary> {
    const accounts = await this.listAccounts();

    let cajaSteffen = new Decimal(0);
    let cajaMercadoLibre = new Decimal(0);
    let deudasClientes = new Decimal(0);
    let deudasProveedores = new Decimal(0);

    for (const acc of accounts) {
      if (acc.accountType === 'CASH_STEFFEN') {
        cajaSteffen = acc.currentBalance;
      } else if (acc.accountType === 'CASH_MERCADO_LIBRE') {
        cajaMercadoLibre = acc.currentBalance;
      } else if (acc.accountType === 'CUSTOMER_RECEIVABLE') {
        deudasClientes = deudasClientes.plus(acc.currentBalance);
      } else if (acc.accountType === 'SUPPLIER_PAYABLE') {
        deudasProveedores = deudasProveedores.plus(acc.currentBalance);
      }
    }

    // NETO = Caja Steffen + Caja Mercado Libre + Deudas Clientes - Deudas Proveedores
    const neto = cajaSteffen
      .plus(cajaMercadoLibre)
      .plus(deudasClientes)
      .minus(deudasProveedores);

    return {
      cajaSteffen,
      cajaMercadoLibre,
      deudasClientes,
      deudasProveedores,
      neto,
    };
  }

  async listSupplierDebtsWithActivity(): Promise<AdminSupplierDebtRecord[]> {
    const { data, error } = await (this.client.rpc as any)('get_admin_supplier_debts');
    if (error) {
      throw new DomainError(`Error obteniendo deudas de proveedores: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      supplierId: row.supplier_id,
      name: row.supplier_name,
      balanceArs: new Decimal(row.balance_ars),
      lastPaymentDate: row.last_payment_date ? String(row.last_payment_date) : null,
      lastPurchaseDate: row.last_purchase_date ? String(row.last_purchase_date) : null,
    }));
  }

  /**
   * Última actividad (Último Pago / Última Compra) de todos los clientes con
   * al menos una, en una única consulta batch (sin N+1). Fecha funcional
   * (business_operations.business_date), nunca created_at.
   */
  async getCustomerLastActivityMap(): Promise<Map<string, CustomerLastActivityRecord>> {
    const { data, error } = await (this.client.rpc as any)('get_customer_last_activity');
    if (error) {
      throw new DomainError(`Error obteniendo última actividad de clientes: ${error.message}`);
    }

    const map = new Map<string, CustomerLastActivityRecord>();
    for (const row of data || []) {
      map.set(row.customer_id, {
        customerId: row.customer_id,
        lastPaymentDate: row.last_payment_date ? String(row.last_payment_date) : null,
        lastPurchaseDate: row.last_purchase_date ? String(row.last_purchase_date) : null,
      });
    }
    return map;
  }

  async listRecentMovements(limit = 10): Promise<PatrimonialMovementFullRecord[]> {
    return this.listMovements({ limit });
  }

  async listMovements(filter: MovementsFilter = {}): Promise<PatrimonialMovementFullRecord[]> {
    // Con rango de fechas se usa !inner: el filtro sobre business_operations.business_date
    // debe excluir los MOV fuera del período (sin !inner PostgREST solo filtra el embed).
    const hasDateRange = Boolean(filter.startDate || filter.endDate);
    const buildQuery = () => {
      let query = this.client
        .from('patrimonial_movements')
        .select(`
          id,
          code,
          operation_id,
          movement_type,
          description,
          amount_ars,
          created_at,
          ${hasDateRange ? 'business_operations!inner(id, business_date)' : 'business_operations(id, business_date)'},
          financial_entries(
            id,
            delta_ars,
            financial_accounts(id, account_type, name)
          )
        `)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (filter.movementType && filter.movementType !== 'TODOS') {
        query = query.eq('movement_type', filter.movementType);
      }

      if (filter.startDate) {
        query = query.gte('business_operations.business_date', filter.startDate);
      }

      if (filter.endDate) {
        query = query.lte('business_operations.business_date', filter.endDate);
      }
      return query;
    };

    let data: unknown[] = [];
    if (filter.limit || filter.offset) {
      let query = buildQuery();
      if (filter.limit) {
        query = query.limit(filter.limit);
      }
      if (filter.offset) {
        query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1);
      }
      const { data: page, error } = await query;
      if (error) {
        throw new DomainError(`Error obteniendo movimientos patrimoniales: ${error.message}`);
      }
      data = page || [];
    } else {
      // Sin límite explícito: se pagina hasta agotar el rango (PostgREST corta cada respuesta
      // en su máximo de filas), así un período nunca queda truncado en silencio.
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: page, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) {
          throw new DomainError(`Error obteniendo movimientos patrimoniales: ${error.message}`);
        }
        data = data.concat(page || []);
        if (!page || page.length < PAGE_SIZE) break;
      }
    }

    let records: PatrimonialMovementFullRecord[] = data.map((row: any) => {
      const bDate = row.business_operations?.business_date || (row.created_at ? row.created_at.split('T')[0] : '');
      const variation = formatPatrimonialVariationFromEntries(row.financial_entries || []);

      return {
        id: row.id,
        code: row.code,
        operationId: row.operation_id,
        businessDate: bDate,
        movementType: row.movement_type as PatrimonialMovementType,
        description: row.description,
        amountArs: new Decimal(row.amount_ars),
        patrimonialVariation: variation,
        createdAt: row.created_at,
      };
    });

    if (filter.search && filter.search.trim()) {
      const s = filter.search.toLowerCase().trim();
      records = records.filter(
        (r) =>
          r.code.toLowerCase().includes(s) ||
          r.description.toLowerCase().includes(s) ||
          r.movementType.toLowerCase().includes(s)
      );
    }

    // Orden determinista por business_date desc, created_at desc
    records.sort((a, b) => {
      if (a.businessDate !== b.businessDate) {
        return b.businessDate.localeCompare(a.businessDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    return records;
  }

  async postPatrimonialMovementAtomic(input: PostPatrimonialMovementRpcInput): Promise<PatrimonialMovementRpcResult> {
    const entriesPayload = input.entries.map((e) => ({
      financial_account_id: e.financialAccountId,
      delta_ars: toNumericString(e.deltaArs),
    }));

    const { data, error } = await (this.client.rpc as any)('post_patrimonial_movement', {
      p_operation_id: input.operationId,
      p_movement_type: input.movementType,
      p_description: input.description,
      p_amount_ars: toNumericString(input.amountArs),
      p_entries: entriesPayload,
    });

    if (error) {
      throw new DomainError(`Error registrando movimiento patrimonial: ${error.message}`);
    }

    const result = data as any;
    return {
      movementId: result.movement_id,
      code: result.code,
    };
  }

  async registerCustomerPaymentAtomic(input: {
    customerId: string;
    amountArs: Decimal;
    businessDate: string;
  }): Promise<PaymentAtomicRpcResult> {
    const { data, error } = await (this.client.rpc as any)('register_customer_payment_atomic', {
      p_customer_id: input.customerId,
      p_amount_ars: toNumericString(input.amountArs),
      p_business_date: input.businessDate,
    });

    if (error) {
      throw new DomainError(`Error registrando pago de cliente: ${error.message}`);
    }

    const res = data as any;
    return {
      operationId: res.operation_id,
      paymentId: res.payment_id,
      movementId: res.movement_id,
      code: res.code,
      amountArs: new Decimal(res.amount_ars),
      businessDate: res.business_date,
    };
  }

  async registerSupplierPaymentAtomic(input: {
    supplierId: string;
    amountArs: Decimal;
    businessDate: string;
  }): Promise<PaymentAtomicRpcResult> {
    const { data, error } = await (this.client.rpc as any)('register_supplier_payment_atomic', {
      p_supplier_id: input.supplierId,
      p_amount_ars: toNumericString(input.amountArs),
      p_business_date: input.businessDate,
    });

    if (error) {
      throw new DomainError(`Error registrando pago a proveedor: ${error.message}`);
    }

    const res = data as any;
    return {
      operationId: res.operation_id,
      paymentId: res.payment_id,
      movementId: res.movement_id,
      code: res.code,
      amountArs: new Decimal(res.amount_ars),
      businessDate: res.business_date,
    };
  }

  async editPaymentAtomic(input: {
    paymentId: string;
    newAmountArs: Decimal;
    newBusinessDate?: string;
  }): Promise<EditPaymentAtomicRpcResult> {
    const { data, error } = await (this.client.rpc as any)('edit_payment_atomic', {
      p_payment_id: input.paymentId,
      p_new_amount_ars: toNumericString(input.newAmountArs),
      p_new_business_date: input.newBusinessDate || undefined,
    });

    if (error) {
      throw new DomainError(`Error editando pago: ${error.message}`);
    }

    const res = data as any;
    return {
      paymentId: res.payment_id,
      operationId: res.operation_id,
      movementId: res.movement_id,
      code: res.code,
      oldAmountArs: new Decimal(res.old_amount_ars),
      newAmountArs: new Decimal(res.new_amount_ars),
      deltaArs: new Decimal(res.delta_ars),
      businessDate: res.business_date,
    };
  }

  async registerWithdrawalAtomic(input: {
    amountArs: Decimal;
    description: string;
    businessDate: string;
  }): Promise<WithdrawalAtomicRpcResult> {
    const { data, error } = await (this.client.rpc as any)('register_withdrawal_atomic', {
      p_amount_ars: toNumericString(input.amountArs),
      p_description: input.description,
      p_business_date: input.businessDate,
    });

    if (error) {
      throw new DomainError(`Error registrando retiro de caja: ${error.message}`);
    }

    const res = data as any;
    return {
      operationId: res.operation_id,
      withdrawalId: res.withdrawal_id,
      movementId: res.movement_id,
      code: res.code,
      amountArs: new Decimal(res.amount_ars),
      businessDate: res.business_date,
    };
  }

  async registerOperatingExpenseAtomic(input: {
    expenseType: string;
    description?: string;
    amountArs: Decimal;
    businessDate: string;
  }): Promise<OperatingExpenseAtomicRpcResult> {
    const { data, error } = await (this.client.rpc as any)('register_operating_expense_atomic', {
      p_expense_type: input.expenseType,
      p_description: input.description || '',
      p_amount_ars: toNumericString(input.amountArs),
      p_business_date: input.businessDate,
    });

    if (error) {
      throw new DomainError(`Error registrando gasto operativo: ${error.message}`);
    }

    const res = data as any;
    return {
      operationId: res.operation_id,
      expenseId: res.expense_id,
      movementId: res.movement_id,
      code: res.code,
      amountArs: new Decimal(res.amount_ars),
      businessDate: res.business_date,
    };
  }

  private get rpcCall(): RpcCaller {
    return this.client.rpc.bind(this.client) as unknown as RpcCaller;
  }

  async registerCashDepositAtomic(input: {
    amountArs: Decimal;
    description: string;
    businessDate: string;
  }): Promise<CashDepositAtomicRpcResult> {
    const fn = 'register_cash_deposit_atomic';
    const { data, error } = await this.rpcCall(fn, {
      p_amount_ars: toNumericString(input.amountArs),
      p_description: input.description,
      p_business_date: input.businessDate,
    });

    if (error) {
      throw new DomainError(`Error registrando ingreso de caja: ${error.message}`);
    }

    const res = asRecord(data, fn);
    return {
      operationId: readText(res, 'operation_id', fn),
      cashDepositId: readText(res, 'cash_deposit_id', fn),
      movementId: readText(res, 'movement_id', fn),
      code: readText(res, 'code', fn),
      amountArs: readExactDecimal(res.amount_ars, `${fn}.amount_ars`),
      businessDate: readText(res, 'business_date', fn),
    };
  }

  async getOpeningBalanceState(partyType: OpeningBalancePartyType, partyId: string): Promise<OpeningBalanceStateRecord> {
    const fn = 'get_opening_balance_state';
    const { data, error } = await this.rpcCall(fn, { p_party_type: partyType, p_party_id: partyId });

    if (error) {
      throw toOpeningBalanceError(error, 'Error consultando saldo de apertura');
    }

    const res = asRecord(data, fn);
    const accountId = readOptionalText(res, 'account_id');
    if (!accountId) {
      return { accountId: null, accountType: null, currentBalance: null, opening: null, hasOtherActivity: false };
    }

    const openingId = readOptionalText(res, 'opening_balance_id');
    return {
      accountId,
      accountType: readText(res, 'account_type', fn) as AccountType,
      currentBalance: readExactDecimal(res.current_balance, `${fn}.current_balance`),
      opening: openingId
        ? {
            id: openingId,
            amountArs: readExactDecimal(res.amount_ars, `${fn}.amount_ars`),
            businessDate: readText(res, 'business_date', fn),
            observation: readOptionalText(res, 'observation'),
            movementCode: readOptionalText(res, 'movement_code') ?? '',
          }
        : null,
      hasOtherActivity: res.has_other_activity === true,
    };
  }

  async registerOpeningBalanceAtomic(input: {
    financialAccountId: string;
    amountArs: Decimal;
    businessDate: string;
    observation?: string;
  }): Promise<OpeningBalanceRpcResult> {
    const fn = 'register_opening_balance_atomic';
    const { data, error } = await this.rpcCall(fn, {
      p_financial_account_id: input.financialAccountId,
      p_amount_ars: toNumericString(input.amountArs),
      p_business_date: input.businessDate,
      p_observation: input.observation ?? null,
    });

    if (error) {
      throw toOpeningBalanceError(error, 'Error registrando saldo de apertura');
    }

    const res = asRecord(data, fn);
    return {
      openingBalanceId: readText(res, 'opening_balance_id', fn),
      operationId: readText(res, 'operation_id', fn),
      movementId: readText(res, 'movement_id', fn),
      code: readText(res, 'code', fn),
      financialAccountId: readText(res, 'financial_account_id', fn),
      amountArs: readExactDecimal(res.amount_ars, `${fn}.amount_ars`),
      businessDate: readText(res, 'business_date', fn),
    };
  }

  async editOpeningBalanceAtomic(input: {
    openingBalanceId: string;
    newAmountArs: Decimal;
    newBusinessDate: string;
    observation?: string;
  }): Promise<EditOpeningBalanceRpcResult> {
    const fn = 'edit_opening_balance_atomic';
    const { data, error } = await this.rpcCall(fn, {
      p_opening_balance_id: input.openingBalanceId,
      p_new_amount_ars: toNumericString(input.newAmountArs),
      p_new_business_date: input.newBusinessDate,
      p_observation: input.observation ?? null,
    });

    if (error) {
      throw toOpeningBalanceError(error, 'Error editando saldo de apertura');
    }

    const res = asRecord(data, fn);
    return {
      openingBalanceId: readText(res, 'opening_balance_id', fn),
      operationId: readText(res, 'operation_id', fn),
      movementId: readText(res, 'movement_id', fn),
      code: readText(res, 'code', fn),
      financialAccountId: readText(res, 'financial_account_id', fn),
      oldAmountArs: readExactDecimal(res.old_amount_ars, `${fn}.old_amount_ars`),
      newAmountArs: readExactDecimal(res.new_amount_ars, `${fn}.new_amount_ars`),
      deltaArs: readExactDecimal(res.delta_ars, `${fn}.delta_ars`),
      businessDate: readText(res, 'business_date', fn),
    };
  }

  async deleteOpeningBalanceAtomic(openingBalanceId: string): Promise<DeleteOpeningBalanceRpcResult> {
    const fn = 'delete_opening_balance_atomic';
    const { data, error } = await this.rpcCall(fn, { p_opening_balance_id: openingBalanceId });

    if (error) {
      throw toOpeningBalanceError(error, 'Error eliminando saldo de apertura');
    }

    const res = asRecord(data, fn);
    return {
      openingBalanceId: readText(res, 'opening_balance_id', fn),
      operationId: readText(res, 'operation_id', fn),
      code: readText(res, 'code', fn),
      financialAccountId: readText(res, 'financial_account_id', fn),
      amountArs: readExactDecimal(res.amount_ars, `${fn}.amount_ars`),
    };
  }

  /** Fila APERTURA del estado de cuenta (si la cuenta tiene saldo de apertura). */
  private async openingBalanceMovement(
    partyType: OpeningBalancePartyType,
    partyId: string
  ): Promise<AccountMovementRecord | null> {
    const state = await this.getOpeningBalanceState(partyType, partyId);
    if (!state.opening) return null;
    return {
      id: state.opening.id,
      date: state.opening.businessDate,
      type: 'APERTURA',
      documentCode: state.opening.movementCode,
      amountArs: state.opening.amountArs,
      isPayment: false,
    };
  }

  async getPaymentById(paymentId: string): Promise<PaymentDetailRecord | null> {
    const { data, error } = await this.client
      .from('payments')
      .select(`
        id,
        operation_id,
        payment_type,
        customer_id,
        supplier_id,
        amount_ars,
        created_at,
        customers(name),
        suppliers(name),
        business_operations(business_date)
      `)
      .eq('id', paymentId)
      .limit(1);

    if (error) {
      throw new DomainError(`Error obteniendo detalle de pago: ${error.message}`);
    }

    if (!data || data.length === 0) return null;

    const row = data[0] as any;
    let movCode = '';

    if (row.operation_id) {
      const { data: movData } = await this.client
        .from('patrimonial_movements')
        .select('code')
        .eq('operation_id', row.operation_id)
        .limit(1);
      if (movData && movData.length > 0) {
        movCode = movData[0].code;
      }
    }

    return {
      id: row.id,
      operationId: row.operation_id,
      paymentType: row.payment_type,
      customerId: row.customer_id,
      customerName: row.customers?.name,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.name,
      amountArs: new Decimal(row.amount_ars),
      businessDate: row.business_operations?.business_date || '',
      code: movCode,
      createdAt: row.created_at,
    };
  }

  async listCustomerAccountMovements(customerId: string): Promise<AccountMovementRecord[]> {
    // 1. Pagos del cliente (editables)
    const { data: paymentsData, error: paymentsError } = await this.client
      .from('payments')
      .select(`
        id,
        operation_id,
        amount_ars,
        created_at,
        business_operations(business_date)
      `)
      .eq('customer_id', customerId);

    if (paymentsError) {
      throw new DomainError(`Error listando pagos de cliente: ${paymentsError.message}`);
    }

    const opIds = (paymentsData || []).map((r: any) => r.operation_id).filter(Boolean);
    const movCodeMap = new Map<string, string>();

    if (opIds.length > 0) {
      const { data: movData } = await this.client
        .from('patrimonial_movements')
        .select('operation_id, code')
        .in('operation_id', opIds);

      for (const m of movData || []) {
        movCodeMap.set(m.operation_id, m.code);
      }
    }

    // 2. Ventas (RTO) del cliente registrado (no editables). La deuda se genera al
    // confirmar el RTO (Fase 12), independientemente de si el RTM ya se completó,
    // por lo que se listan todos sin filtrar por status. Se usa exclusivamente el
    // snapshot definitivo total_order_ars: nunca total_to_collect_ars ni saldo anterior.
    const { data: remittancesData, error: remittancesError } = await this.client
      .from('remittances')
      .select(`
        id,
        code,
        total_order_ars,
        created_at,
        business_operations(business_date)
      `)
      .eq('customer_id', customerId);

    if (remittancesError) {
      throw new DomainError(`Error listando ventas (RTO) de cliente: ${remittancesError.message}`);
    }

    // Estado del PDF del RTO (generated_documents), por remito, para activar el
    // ícono de documento en Cuenta Cliente (Fase 14). Nunca renderiza: solo lectura.
    const remittanceIds = (remittancesData || []).map((r) => r.id);
    const rtoDocStatusMap = new Map<string, string>();
    if (remittanceIds.length > 0) {
      const { data: docsData, error: docsError } = await this.client
        .from('generated_documents')
        .select('source_id, generation_status, created_at')
        .eq('source_type', 'RTO')
        .in('source_id', remittanceIds)
        .order('created_at', { ascending: false });

      if (docsError) {
        throw new DomainError(`Error listando estados de PDF RTO de cliente: ${docsError.message}`);
      }

      for (const d of docsData || []) {
        if (!rtoDocStatusMap.has(d.source_id)) {
          rtoDocStatusMap.set(d.source_id, d.generation_status);
        }
      }
    }

    const movements: AccountMovementRecord[] = [];

    for (const p of paymentsData || []) {
      const code = movCodeMap.get((p as any).operation_id) || '';

      movements.push({
        id: p.id,
        date: (p as any).business_operations?.business_date || p.created_at?.split('T')[0] || '',
        type: 'PAGO',
        documentCode: code,
        amountArs: new Decimal(p.amount_ars),
        isPayment: true,
        paymentId: p.id,
      });
    }

    for (const r of remittancesData || []) {
      movements.push({
        id: r.id,
        date: (r as any).business_operations?.business_date || r.created_at?.split('T')[0] || '',
        type: 'VENTA',
        documentCode: r.code,
        amountArs: new Decimal(r.total_order_ars),
        isPayment: false,
        remittanceId: r.id,
        rtoDocumentStatus: rtoDocStatusMap.get(r.id) || 'MISSING',
      });
    }

    // 3. Saldo de apertura (deuda previa al inicio operativo; no es venta)
    const opening = await this.openingBalanceMovement('CUSTOMER', customerId);
    if (opening) movements.push(opening);

    movements.sort((a, b) => b.date.localeCompare(a.date));
    return movements;
  }

  async listSupplierAccountMovements(supplierId: string): Promise<AccountMovementRecord[]> {
    // 1. Obtener pagos a proveedor
    const { data: paymentsData, error: paymentsError } = await this.client
      .from('payments')
      .select(`
        id,
        operation_id,
        amount_ars,
        created_at,
        business_operations(business_date)
      `)
      .eq('supplier_id', supplierId);

    if (paymentsError) {
      throw new DomainError(`Error listando pagos a proveedor: ${paymentsError.message}`);
    }

    const opIds = (paymentsData || []).map((r: any) => r.operation_id).filter(Boolean);
    const movCodeMap = new Map<string, string>();

    if (opIds.length > 0) {
      const { data: movData } = await this.client
        .from('patrimonial_movements')
        .select('operation_id, code')
        .in('operation_id', opIds);

      for (const m of movData || []) {
        movCodeMap.set(m.operation_id, m.code);
      }
    }

    // 2. Obtener compras a proveedor
    const { data: purchasesData, error: purchasesError } = await this.client
      .from('purchases')
      .select(`
        id,
        code,
        payment_mode,
        currency_code_snapshot,
        total_net_source_currency,
        total_gross_ars,
        created_at,
        business_operations(business_date)
      `)
      .eq('supplier_id', supplierId);

    if (purchasesError) {
      throw new DomainError(`Error listando compras a proveedor: ${purchasesError.message}`);
    }

    const movements: AccountMovementRecord[] = [];

    for (const p of paymentsData || []) {
      const code = movCodeMap.get(p.operation_id) || '';

      movements.push({
        id: p.id,
        date: p.business_operations?.business_date || p.created_at?.split('T')[0] || '',
        type: 'PAGO',
        documentCode: code,
        amountArs: new Decimal(p.amount_ars),
        isPayment: true,
        paymentId: p.id,
      });
    }

    for (const c of purchasesData || []) {
      movements.push({
        id: c.id,
        date: c.business_operations?.business_date || c.created_at?.split('T')[0] || '',
        type: 'COMPRA',
        documentCode: c.code,
        amountArs: new Decimal(c.total_gross_ars),
        isPayment: false,
        purchaseId: c.id,
        paymentMode: c.payment_mode,
        currencyCodeSnapshot: c.currency_code_snapshot,
        totalNetSourceCurrency: c.total_net_source_currency != null ? String(c.total_net_source_currency) : undefined,
      });
    }

    // 3. Saldo de apertura (deuda previa al inicio operativo; no es compra)
    const opening = await this.openingBalanceMovement('SUPPLIER', supplierId);
    if (opening) movements.push(opening);

    movements.sort((a, b) => b.date.localeCompare(a.date));
    return movements;
  }
}
