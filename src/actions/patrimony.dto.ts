import type { PatrimonialMovementType, ExpenseType } from '@/database/domain-types';

export interface RegisterCustomerPaymentDTO {
  customerId: string;
  amountArs: string | number;
  businessDate: string;
}

export interface RegisterSupplierPaymentDTO {
  supplierId: string;
  amountArs: string | number;
  businessDate: string;
}

export interface EditPaymentDTO {
  paymentId: string;
  newAmountArs: string | number;
  newBusinessDate: string;
}

export interface RegisterWithdrawalDTO {
  amountArs: string | number;
  description: string;
  businessDate: string;
}

export interface RegisterOperatingExpenseDTO {
  expenseType: ExpenseType | string;
  description?: string;
  amountArs: string | number;
  businessDate: string;
}

export interface PatrimonialMovementDTO {
  id: string;
  code: string;
  date: string;
  type: PatrimonialMovementType | string;
  description: string;
  amountArs: string;
  patrimonialVariation: string;
}

export interface AccountPaymentOptionDTO {
  id: string;
  code: string;
  name: string;
  balanceArs: string;
  hasDebt: boolean;
}

export interface PaymentDetailDTO {
  id: string;
  operationId: string;
  paymentType: 'CUSTOMER' | 'SUPPLIER';
  entityId: string;
  entityName: string;
  amountArs: string;
  businessDate: string;
  code: string;
}

export interface AccountMovementDTO {
  id: string;
  date: string;
  type: 'COMPRA' | 'VENTA' | 'PAGO';
  documentCode: string;
  amountArs: string;
  isPayment: boolean;
  paymentId?: string;
  purchaseId?: string;
  remittanceId?: string;
  paymentMode?: string;
  currencyCodeSnapshot?: string;
  totalNetSourceCurrency?: string;
}
