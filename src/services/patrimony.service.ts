import {
  IPatrimonyRepository,
  PatrimonyRepository,
  FinancialAccountRecord,
  PatrimonialMovementFullRecord,
  PaymentAtomicRpcResult,
  EditPaymentAtomicRpcResult,
  WithdrawalAtomicRpcResult,
  OperatingExpenseAtomicRpcResult,
  PatrimonialSummary,
  AdminSupplierDebtRecord,
  MovementsFilter,
  PaymentDetailRecord,
  AccountMovementRecord,
} from '@/repositories/patrimony.repository';
import type { PatrimonialMovementType, ExpenseType } from '@/database/domain-types';
import { DomainError } from '@/domain/errors';
import { Decimal } from '@/domain/decimal';

export interface FinancialEntryParam {
  financialAccountId: string;
  deltaArs: Decimal | number | string;
}

export interface PostPatrimonialMovementParams {
  operationId: string;
  movementType: PatrimonialMovementType;
  description: string;
  amountArs: Decimal | number | string;
  entries: FinancialEntryParam[];
}

export interface PatrimonialMovementResult {
  movementId: string;
  code: string;
}

export interface RegisterCustomerPaymentParams {
  customerId: string;
  amountArs: Decimal | number | string;
  businessDate: string;
}

export interface RegisterSupplierPaymentParams {
  supplierId: string;
  amountArs: Decimal | number | string;
  businessDate: string;
}

export interface EditPaymentParams {
  paymentId: string;
  newAmountArs: Decimal | number | string;
  newBusinessDate?: string;
}

export interface RegisterWithdrawalParams {
  amountArs: Decimal | number | string;
  description: string;
  businessDate: string;
}

export interface RegisterOperatingExpenseParams {
  expenseType: string;
  description?: string;
  amountArs: Decimal | number | string;
  businessDate: string;
}

export interface IPatrimonyDomainService {
  getFinancialAccountBalance(accountId: string): Promise<Decimal>;
  listAccounts(): Promise<FinancialAccountRecord[]>;
  getSummary(): Promise<PatrimonialSummary>;
  getPatrimonialSummary(): Promise<PatrimonialSummary>;
  listRecentMovements(limit?: number): Promise<PatrimonialMovementFullRecord[]>;
  listMovements(filter?: MovementsFilter): Promise<PatrimonialMovementFullRecord[]>;
  postPatrimonialMovement(params: PostPatrimonialMovementParams): Promise<PatrimonialMovementResult>;
  registerCustomerPayment(params: RegisterCustomerPaymentParams): Promise<PaymentAtomicRpcResult>;
  registerSupplierPayment(params: RegisterSupplierPaymentParams): Promise<PaymentAtomicRpcResult>;
  editPayment(params: EditPaymentParams): Promise<EditPaymentAtomicRpcResult>;
  registerWithdrawal(params: RegisterWithdrawalParams): Promise<WithdrawalAtomicRpcResult>;
  registerOperatingExpense(params: RegisterOperatingExpenseParams): Promise<OperatingExpenseAtomicRpcResult>;
  getPayment(paymentId: string): Promise<PaymentDetailRecord | null>;
  listCustomerMovements(customerId: string): Promise<AccountMovementRecord[]>;
  listSupplierMovements(supplierId: string): Promise<AccountMovementRecord[]>;
  listSupplierDebtsWithActivity(): Promise<AdminSupplierDebtRecord[]>;
}

export class PatrimonyDomainService implements IPatrimonyDomainService {
  constructor(private readonly patrimonyRepo: IPatrimonyRepository = new PatrimonyRepository()) {}

  async listAccounts(): Promise<FinancialAccountRecord[]> {
    return this.patrimonyRepo.listAccounts();
  }

  async getSummary(): Promise<PatrimonialSummary> {
    return this.patrimonyRepo.getPatrimonialSummary();
  }

  async listRecentMovements(limit = 10): Promise<PatrimonialMovementFullRecord[]> {
    return this.patrimonyRepo.listRecentMovements(limit);
  }

  async listMovements(filter?: MovementsFilter): Promise<PatrimonialMovementFullRecord[]> {
    return this.patrimonyRepo.listMovements(filter);
  }

  async getFinancialAccountBalance(accountId: string): Promise<Decimal> {
    if (!accountId) {
      throw new DomainError('El accountId es obligatorio.');
    }
    const account = await this.patrimonyRepo.getAccount(accountId);
    if (!account) {
      throw new DomainError(`Cuenta financiera ${accountId} no encontrada.`);
    }
    return account.currentBalance;
  }

  async postPatrimonialMovement(params: PostPatrimonialMovementParams): Promise<PatrimonialMovementResult> {
    const { operationId, movementType, description, amountArs, entries } = params;

    if (!operationId) throw new DomainError('operationId es obligatorio.');
    if (!movementType) throw new DomainError('movementType es obligatorio.');
    if (!description || !description.trim()) throw new DomainError('description es obligatoria.');

    const amount = new Decimal(amountArs);
    if (amount.isNegative()) {
      throw new DomainError('El importe de movimiento patrimonial no puede ser negativo.');
    }

    if (!entries || entries.length === 0) {
      throw new DomainError('Debe incluirse al menos una variación en entries.');
    }

    const formattedEntries: Array<{ financialAccountId: string; deltaArs: Decimal }> = [];

    for (const entry of entries) {
      if (!entry.financialAccountId) {
        throw new DomainError('Cada entrada financiera debe especificar un financialAccountId.');
      }
      const delta = new Decimal(entry.deltaArs);
      if (delta.isZero()) {
        throw new DomainError('El deltaArs de una entrada financiera no puede ser 0.');
      }
      formattedEntries.push({
        financialAccountId: entry.financialAccountId,
        deltaArs: delta,
      });
    }

    const rpcResult = await this.patrimonyRepo.postPatrimonialMovementAtomic({
      operationId,
      movementType,
      description: description.trim(),
      amountArs: amount,
      entries: formattedEntries,
    });

    return {
      movementId: rpcResult.movementId,
      code: rpcResult.code,
    };
  }

  async registerCustomerPayment(params: RegisterCustomerPaymentParams): Promise<PaymentAtomicRpcResult> {
    const { customerId, amountArs, businessDate } = params;

    if (!customerId || !customerId.trim()) {
      throw new DomainError('El cliente es obligatorio para registrar un pago.');
    }

    if (!businessDate || !businessDate.trim()) {
      throw new DomainError('La fecha de la operación es obligatoria.');
    }

    const amount = new Decimal(amountArs);
    if (amount.lte(0)) {
      throw new DomainError('El importe del pago debe ser mayor a cero.');
    }

    return this.patrimonyRepo.registerCustomerPaymentAtomic({
      customerId: customerId.trim(),
      amountArs: amount,
      businessDate: businessDate.trim(),
    });
  }

  async registerSupplierPayment(params: RegisterSupplierPaymentParams): Promise<PaymentAtomicRpcResult> {
    const { supplierId, amountArs, businessDate } = params;

    if (!supplierId || !supplierId.trim()) {
      throw new DomainError('El proveedor es obligatorio para registrar un pago.');
    }

    if (!businessDate || !businessDate.trim()) {
      throw new DomainError('La fecha de la operación es obligatoria.');
    }

    const amount = new Decimal(amountArs);
    if (amount.lte(0)) {
      throw new DomainError('El importe del pago debe ser mayor a cero.');
    }

    return this.patrimonyRepo.registerSupplierPaymentAtomic({
      supplierId: supplierId.trim(),
      amountArs: amount,
      businessDate: businessDate.trim(),
    });
  }

  async editPayment(params: EditPaymentParams): Promise<EditPaymentAtomicRpcResult> {
    const { paymentId, newAmountArs, newBusinessDate } = params;

    if (!paymentId || !paymentId.trim()) {
      throw new DomainError('El identificador del pago es obligatorio.');
    }

    const newAmount = new Decimal(newAmountArs);
    if (newAmount.lte(0)) {
      throw new DomainError('El nuevo importe del pago debe ser mayor a cero.');
    }

    return this.patrimonyRepo.editPaymentAtomic({
      paymentId: paymentId.trim(),
      newAmountArs: newAmount,
      newBusinessDate: newBusinessDate ? newBusinessDate.trim() : undefined,
    });
  }

  async registerWithdrawal(params: RegisterWithdrawalParams): Promise<WithdrawalAtomicRpcResult> {
    const { amountArs, description, businessDate } = params;

    if (!description || !description.trim()) {
      throw new DomainError('El motivo / descripción del retiro es obligatorio.');
    }

    if (!businessDate || !businessDate.trim()) {
      throw new DomainError('La fecha de la operación es obligatoria.');
    }

    const amount = new Decimal(amountArs);
    if (amount.lte(0)) {
      throw new DomainError('El importe del retiro debe ser mayor a cero.');
    }

    return this.patrimonyRepo.registerWithdrawalAtomic({
      amountArs: amount,
      description: description.trim(),
      businessDate: businessDate.trim(),
    });
  }

  async registerOperatingExpense(params: RegisterOperatingExpenseParams): Promise<OperatingExpenseAtomicRpcResult> {
    const { expenseType, description, amountArs, businessDate } = params;

    const validTypes: ExpenseType[] = ['LUZ', 'ALQUILER', 'COMISIÓN', 'OTRO'];
    if (!expenseType || !validTypes.includes(expenseType as ExpenseType)) {
      throw new DomainError(`Tipo de gasto operativo no válido: ${expenseType}. Debe ser LUZ, ALQUILER, COMISIÓN u OTRO.`);
    }

    const desc = (description || '').trim();
    if (expenseType === 'OTRO' && !desc) {
      throw new DomainError('La descripción es obligatoria cuando el tipo de gasto es OTRO.');
    }

    if (!businessDate || !businessDate.trim()) {
      throw new DomainError('La fecha de la operación es obligatoria.');
    }

    const amount = new Decimal(amountArs);
    if (amount.lte(0)) {
      throw new DomainError('El importe del gasto operativo debe ser mayor a cero.');
    }

    return this.patrimonyRepo.registerOperatingExpenseAtomic({
      expenseType,
      description: desc,
      amountArs: amount,
      businessDate: businessDate.trim(),
    });
  }

  async getPayment(paymentId: string): Promise<PaymentDetailRecord | null> {
    if (!paymentId || !paymentId.trim()) return null;
    return this.patrimonyRepo.getPaymentById(paymentId.trim());
  }

  async listCustomerMovements(customerId: string): Promise<AccountMovementRecord[]> {
    if (!customerId || !customerId.trim()) return [];
    return this.patrimonyRepo.listCustomerAccountMovements(customerId.trim());
  }

  async listSupplierMovements(supplierId: string): Promise<AccountMovementRecord[]> {
    if (!supplierId || !supplierId.trim()) return [];
    return this.patrimonyRepo.listSupplierAccountMovements(supplierId.trim());
  }

  async getPatrimonialSummary(): Promise<PatrimonialSummary> {
    return this.patrimonyRepo.getPatrimonialSummary();
  }

  async listSupplierDebtsWithActivity(): Promise<AdminSupplierDebtRecord[]> {
    return this.patrimonyRepo.listSupplierDebtsWithActivity();
  }
}
