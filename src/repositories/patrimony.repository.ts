import { BaseSupabaseRepository } from './base.repository';
import type { AccountType, PatrimonialMovementType } from '@/database/domain-types';
import { DomainError } from '@/domain/errors';
import { Decimal, toNumericString } from '@/domain/decimal';

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

export interface AccountMovementRecord {
  id: string;
  date: string;
  type: 'COMPRA' | 'VENTA' | 'PAGO';
  documentCode: string;
  amountArs: Decimal;
  isPayment: boolean;
  paymentId?: string;
  purchaseId?: string;
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
  getPaymentById(paymentId: string): Promise<PaymentDetailRecord | null>;
  listCustomerAccountMovements(customerId: string): Promise<AccountMovementRecord[]>;
  listSupplierAccountMovements(supplierId: string): Promise<AccountMovementRecord[]>;
  listSupplierDebtsWithActivity(): Promise<AdminSupplierDebtRecord[]>;
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

  async listRecentMovements(limit = 10): Promise<PatrimonialMovementFullRecord[]> {
    return this.listMovements({ limit });
  }

  async listMovements(filter: MovementsFilter = {}): Promise<PatrimonialMovementFullRecord[]> {
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
        business_operations(id, business_date),
        financial_entries(
          id,
          delta_ars,
          financial_accounts(id, account_type, name)
        )
      `)
      .order('created_at', { ascending: false });

    if (filter.movementType && filter.movementType !== 'TODOS') {
      query = query.eq('movement_type', filter.movementType);
    }

    if (filter.startDate) {
      query = query.gte('business_operations.business_date', filter.startDate);
    }

    if (filter.endDate) {
      query = query.lte('business_operations.business_date', filter.endDate);
    }

    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    if (filter.offset) {
      query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new DomainError(`Error obteniendo movimientos patrimoniales: ${error.message}`);
    }

    let records: PatrimonialMovementFullRecord[] = (data || []).map((row: any) => {
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
    const { data, error } = await this.client
      .from('payments')
      .select(`
        id,
        operation_id,
        amount_ars,
        created_at,
        business_operations(business_date)
      `)
      .eq('customer_id', customerId);

    if (error) {
      throw new DomainError(`Error listando pagos de cliente: ${error.message}`);
    }

    const opIds = (data || []).map((r: any) => r.operation_id).filter(Boolean);
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

    const movements: AccountMovementRecord[] = (data || []).map((row: any) => {
      const code = movCodeMap.get(row.operation_id) || '';

      return {
        id: row.id,
        date: row.business_operations?.business_date || row.created_at?.split('T')[0] || '',
        type: 'PAGO',
        documentCode: code,
        amountArs: new Decimal(row.amount_ars),
        isPayment: true,
        paymentId: row.id,
      };
    });

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

    movements.sort((a, b) => b.date.localeCompare(a.date));
    return movements;
  }
}
