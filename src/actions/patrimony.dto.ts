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

/** Importe como string decimal exacto (nunca Number). */
export interface RegisterCashDepositDTO {
  amountArs: string;
  description: string;
  businessDate: string;
}

export type OpeningBalancePartyTypeDTO = 'CUSTOMER' | 'SUPPLIER';

export interface OpeningBalanceStateDTO {
  hasAccount: boolean;
  currentBalanceArs: string | null;
  opening: {
    id: string;
    amountArs: string;
    businessDate: string;
    observation: string | null;
    movementCode: string;
  } | null;
  /** true: se puede crear (sin apertura) o editar/eliminar (con apertura). */
  editable: boolean;
}

export interface RegisterOpeningBalanceDTO {
  partyType: OpeningBalancePartyTypeDTO;
  partyId: string;
  amountArs: string;
  businessDate: string;
  observation?: string;
}

export interface EditOpeningBalanceDTO {
  openingBalanceId: string;
  amountArs: string;
  businessDate: string;
  observation?: string;
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
  type: 'COMPRA' | 'VENTA' | 'PAGO' | 'APERTURA';
  documentCode: string;
  amountArs: string;
  isPayment: boolean;
  paymentId?: string;
  purchaseId?: string;
  remittanceId?: string;
  rtoDocumentStatus?: string;
  paymentMode?: string;
  currencyCodeSnapshot?: string;
  totalNetSourceCurrency?: string;
}
