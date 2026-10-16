'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, isUserAuthorized } from '@/auth/guard';
import {
  getPatrimonyService,
  getCustomerService,
  getSupplierService,
} from '@/services/composition';
import type {
  RegisterCustomerPaymentDTO,
  RegisterSupplierPaymentDTO,
  EditPaymentDTO,
  RegisterWithdrawalDTO,
  RegisterOperatingExpenseDTO,
  RegisterCashDepositDTO,
  OpeningBalancePartyTypeDTO,
  OpeningBalanceStateDTO,
  RegisterOpeningBalanceDTO,
  EditOpeningBalanceDTO,
  PatrimonialMovementDTO,
  AccountPaymentOptionDTO,
  PaymentDetailDTO,
  AccountMovementDTO,
} from './patrimony.dto';
import { toNumericString, Decimal } from '@/domain/decimal';
import type { MovementsFilter } from '@/repositories/patrimony.repository';

async function checkAuth() {
  const user = await getAuthenticatedUser();
  if (!user || !isUserAuthorized(user)) {
    throw new Error('No autorizado');
  }
  return user;
}

export async function registerCustomerPaymentAction(dto: RegisterCustomerPaymentDTO) {
  try {
    await checkAuth();
    const service = getPatrimonyService();

    const res = await service.registerCustomerPayment({
      customerId: dto.customerId,
      amountArs: dto.amountArs,
      businessDate: dto.businessDate,
    });

    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/clientes');
    revalidatePath('/movimientos');

    return {
      success: true,
      data: {
        operationId: res.operationId,
        paymentId: res.paymentId,
        movementId: res.movementId,
        code: res.code,
        amountArs: toNumericString(res.amountArs),
        businessDate: res.businessDate,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error registrando pago de cliente',
    };
  }
}

export async function registerSupplierPaymentAction(dto: RegisterSupplierPaymentDTO) {
  try {
    await checkAuth();
    const service = getPatrimonyService();

    const res = await service.registerSupplierPayment({
      supplierId: dto.supplierId,
      amountArs: dto.amountArs,
      businessDate: dto.businessDate,
    });

    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/proveedores');
    revalidatePath('/movimientos');

    return {
      success: true,
      data: {
        operationId: res.operationId,
        paymentId: res.paymentId,
        movementId: res.movementId,
        code: res.code,
        amountArs: toNumericString(res.amountArs),
        businessDate: res.businessDate,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error registrando pago a proveedor',
    };
  }
}

export async function editPaymentAction(dto: EditPaymentDTO) {
  try {
    await checkAuth();
    const service = getPatrimonyService();

    const res = await service.editPayment({
      paymentId: dto.paymentId,
      newAmountArs: dto.newAmountArs,
      newBusinessDate: dto.newBusinessDate,
    });

    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/clientes');
    revalidatePath('/proveedores');
    revalidatePath('/movimientos');

    return {
      success: true,
      data: {
        paymentId: res.paymentId,
        operationId: res.operationId,
        movementId: res.movementId,
        code: res.code,
        oldAmountArs: toNumericString(res.oldAmountArs),
        newAmountArs: toNumericString(res.newAmountArs),
        deltaArs: toNumericString(res.deltaArs),
        businessDate: res.businessDate,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error editando pago',
    };
  }
}

export async function registerWithdrawalAction(dto: RegisterWithdrawalDTO) {
  try {
    await checkAuth();
    const service = getPatrimonyService();

    const res = await service.registerWithdrawal({
      amountArs: dto.amountArs,
      description: dto.description,
      businessDate: dto.businessDate,
    });

    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/movimientos');

    return {
      success: true,
      data: {
        operationId: res.operationId,
        withdrawalId: res.withdrawalId,
        movementId: res.movementId,
        code: res.code,
        amountArs: toNumericString(res.amountArs),
        businessDate: res.businessDate,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error registrando retiro de caja',
    };
  }
}

export async function registerOperatingExpenseAction(dto: RegisterOperatingExpenseDTO) {
  try {
    await checkAuth();
    const service = getPatrimonyService();

    const res = await service.registerOperatingExpense({
      expenseType: dto.expenseType,
      description: dto.description,
      amountArs: dto.amountArs,
      businessDate: dto.businessDate,
    });

    revalidatePath('/');
    revalidatePath('/administracion');
    revalidatePath('/movimientos');

    return {
      success: true,
      data: {
        operationId: res.operationId,
        expenseId: res.expenseId,
        movementId: res.movementId,
        code: res.code,
        amountArs: toNumericString(res.amountArs),
        businessDate: res.businessDate,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error registrando gasto operativo',
    };
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function revalidateAccounts(partyPath?: '/clientes' | '/proveedores') {
  revalidatePath('/');
  revalidatePath('/administracion');
  revalidatePath('/movimientos');
  if (partyPath) revalidatePath(partyPath);
}

const partyPathOf = (partyType: OpeningBalancePartyTypeDTO) =>
  partyType === 'CUSTOMER' ? '/clientes' : '/proveedores';

export async function registerCashDepositAction(dto: RegisterCashDepositDTO) {
  try {
    await checkAuth();
    const res = await getPatrimonyService().registerCashDeposit({
      amountArs: dto.amountArs,
      description: dto.description,
      businessDate: dto.businessDate,
    });

    revalidateAccounts();

    return {
      success: true,
      data: {
        operationId: res.operationId,
        cashDepositId: res.cashDepositId,
        movementId: res.movementId,
        code: res.code,
        amountArs: toNumericString(res.amountArs),
        businessDate: res.businessDate,
      },
    };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Error registrando ingreso de caja') };
  }
}

export async function getOpeningBalanceStateAction(
  partyType: OpeningBalancePartyTypeDTO,
  partyId: string
): Promise<{ success: boolean; data?: OpeningBalanceStateDTO; error?: string }> {
  try {
    await checkAuth();
    const state = await getPatrimonyService().getOpeningBalanceState(partyType, partyId);

    return {
      success: true,
      data: {
        hasAccount: state.accountId !== null,
        currentBalanceArs: state.currentBalance ? toNumericString(state.currentBalance) : null,
        opening: state.opening
          ? {
              id: state.opening.id,
              amountArs: toNumericString(state.opening.amountArs),
              businessDate: state.opening.businessDate,
              observation: state.opening.observation,
              movementCode: state.opening.movementCode,
            }
          : null,
        editable: state.accountId !== null && !state.hasOtherActivity,
      },
    };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Error consultando saldo de apertura') };
  }
}

export async function registerOpeningBalanceAction(dto: RegisterOpeningBalanceDTO) {
  try {
    await checkAuth();
    const res = await getPatrimonyService().registerOpeningBalance({
      partyType: dto.partyType,
      partyId: dto.partyId,
      amountArs: dto.amountArs,
      businessDate: dto.businessDate,
      observation: dto.observation,
    });

    revalidateAccounts(partyPathOf(dto.partyType));

    return {
      success: true,
      data: { openingBalanceId: res.openingBalanceId, code: res.code, amountArs: toNumericString(res.amountArs) },
    };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Error registrando saldo de apertura') };
  }
}

export async function editOpeningBalanceAction(partyType: OpeningBalancePartyTypeDTO, dto: EditOpeningBalanceDTO) {
  try {
    await checkAuth();
    const res = await getPatrimonyService().editOpeningBalance({
      openingBalanceId: dto.openingBalanceId,
      newAmountArs: dto.amountArs,
      newBusinessDate: dto.businessDate,
      observation: dto.observation,
    });

    revalidateAccounts(partyPathOf(partyType));

    return {
      success: true,
      data: { openingBalanceId: res.openingBalanceId, code: res.code, newAmountArs: toNumericString(res.newAmountArs) },
    };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Error editando saldo de apertura') };
  }
}

export async function deleteOpeningBalanceAction(partyType: OpeningBalancePartyTypeDTO, openingBalanceId: string) {
  try {
    await checkAuth();
    const res = await getPatrimonyService().deleteOpeningBalance(openingBalanceId);

    revalidateAccounts(partyPathOf(partyType));

    return { success: true, data: { openingBalanceId: res.openingBalanceId, code: res.code } };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error, 'Error eliminando saldo de apertura') };
  }
}

export async function getPatrimonialMovementsAction(filter?: MovementsFilter): Promise<{
  success: boolean;
  data?: PatrimonialMovementDTO[];
  error?: string;
}> {
  try {
    await checkAuth();
    const service = getPatrimonyService();
    const movements = await service.listMovements(filter);

    return {
      success: true,
      data: movements.map((m) => ({
        id: m.id,
        code: m.code,
        date: m.businessDate,
        type: m.movementType,
        description: m.description,
        amountArs: toNumericString(m.amountArs),
        patrimonialVariation: m.patrimonialVariation,
      })),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error obteniendo movimientos patrimoniales',
    };
  }
}

export async function getCustomerPaymentOptionsAction(): Promise<{
  success: boolean;
  data?: AccountPaymentOptionDTO[];
  error?: string;
}> {
  try {
    await checkAuth();
    const customerService = getCustomerService();
    // Clientes inactivos con deuda pendiente pueden recibir pagos, pero SOLO si saldo > 0
    const customers = await customerService.listCustomers(true);
    const customersWithDebt = customers.filter((c) => {
      const bal = c.balanceArs ? new Decimal(c.balanceArs) : new Decimal(0);
      return bal.gt(0);
    });

    return {
      success: true,
      data: customersWithDebt.map((c) => {
        const bal = c.balanceArs ? new Decimal(c.balanceArs) : new Decimal(0);
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          balanceArs: toNumericString(bal),
          hasDebt: true,
        };
      }),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error obteniendo listado de clientes',
    };
  }
}

export async function getSupplierPaymentOptionsAction(): Promise<{
  success: boolean;
  data?: AccountPaymentOptionDTO[];
  error?: string;
}> {
  try {
    await checkAuth();
    const supplierService = getSupplierService();
    // Proveedores inactivos con deuda pendiente pueden recibir pagos, pero SOLO si saldo > 0
    const suppliers = await supplierService.listSuppliers(true);
    const suppliersWithDebt = suppliers.filter((s) => {
      const bal = s.balance ? new Decimal(s.balance) : new Decimal(0);
      return bal.gt(0);
    });

    return {
      success: true,
      data: suppliersWithDebt.map((s) => {
        const bal = s.balance ? new Decimal(s.balance) : new Decimal(0);
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          balanceArs: toNumericString(bal),
          hasDebt: true,
        };
      }),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error obteniendo listado de proveedores',
    };
  }
}

export async function getPaymentDetailAction(paymentId: string): Promise<{
  success: boolean;
  data?: PaymentDetailDTO;
  error?: string;
}> {
  try {
    await checkAuth();
    const service = getPatrimonyService();
    const payment = await service.getPayment(paymentId);

    if (!payment) {
      return { success: false, error: 'Pago no encontrado' };
    }

    return {
      success: true,
      data: {
        id: payment.id,
        operationId: payment.operationId,
        paymentType: payment.paymentType,
        entityId: (payment.paymentType === 'CUSTOMER' ? payment.customerId : payment.supplierId) || '',
        entityName: (payment.paymentType === 'CUSTOMER' ? payment.customerName : payment.supplierName) || '',
        amountArs: toNumericString(payment.amountArs),
        businessDate: payment.businessDate,
        code: payment.code,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error obteniendo detalle del pago',
    };
  }
}

export async function getCustomerMovementsAction(customerId: string): Promise<{
  success: boolean;
  data?: AccountMovementDTO[];
  error?: string;
}> {
  try {
    await checkAuth();
    const service = getPatrimonyService();
    const movements = await service.listCustomerMovements(customerId);

    return {
      success: true,
      data: movements.map((m) => ({
        id: m.id,
        date: m.date,
        type: m.type,
        documentCode: m.documentCode,
        amountArs: toNumericString(m.amountArs),
        isPayment: m.isPayment,
        paymentId: m.paymentId,
        remittanceId: m.remittanceId,
        rtoDocumentStatus: m.rtoDocumentStatus,
      })),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error obteniendo movimientos del cliente',
    };
  }
}

export async function getSupplierMovementsAction(supplierId: string): Promise<{
  success: boolean;
  data?: AccountMovementDTO[];
  error?: string;
}> {
  try {
    await checkAuth();
    const service = getPatrimonyService();
    const movements = await service.listSupplierMovements(supplierId);

    return {
      success: true,
      data: movements.map((m) => ({
        id: m.id,
        date: m.date,
        type: m.type,
        documentCode: m.documentCode,
        amountArs: toNumericString(m.amountArs),
        isPayment: m.isPayment,
        paymentId: m.paymentId,
        purchaseId: m.purchaseId,
        paymentMode: m.paymentMode,
        currencyCodeSnapshot: m.currencyCodeSnapshot,
        totalNetSourceCurrency: m.totalNetSourceCurrency,
      })),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error obteniendo movimientos del proveedor',
    };
  }
}
