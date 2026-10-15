import { DomainError } from '@/domain/errors';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fecha comercial normativa de un documento de venta: la `business_date` de su
 * `business_operations` (SALE_RTO para el RTO, SALE_RTM para el RTM), tal cual
 * fue congelada al confirmar. Nunca se deriva de created_at/updated_at ni de
 * conversiones de zona horaria.
 *
 * `embedded` es el resultado del embed PostgREST `business_operations(business_date, operation_type)`.
 */
export function readSaleBusinessDate(
  embedded: unknown,
  expectedType: 'SALE_RTO' | 'SALE_RTM',
  context: string
): string {
  const op = Array.isArray(embedded) ? embedded[0] : embedded;
  if (typeof op !== 'object' || op === null) {
    throw new DomainError(`${context}: no se encontró su operación de negocio (${expectedType}).`);
  }
  const { business_date: businessDate, operation_type: operationType } = op as {
    business_date?: unknown;
    operation_type?: unknown;
  };
  if (operationType !== expectedType) {
    throw new DomainError(`${context}: la operación asociada es ${String(operationType)}, se esperaba ${expectedType}.`);
  }
  if (typeof businessDate !== 'string' || !ISO_DATE_RE.test(businessDate)) {
    throw new DomainError(`${context}: business_date inválida (${String(businessDate)}).`);
  }
  return businessDate;
}
