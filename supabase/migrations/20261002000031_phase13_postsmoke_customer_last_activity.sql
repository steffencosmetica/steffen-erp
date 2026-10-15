-- ============================================================================
-- MIGRACIÓN: 20261002000031_phase13_postsmoke_customer_last_activity.sql
-- POST-SMOKE FASE 13 — MICRO-CIERRE UI CUENTAS CLIENTES
--
-- El resumen "Cuentas Clientes" de Administración mostraba ULTIMO PAGO y
-- ULTIMA COMPRA siempre en blanco (hardcodeado a null en el DTO), a
-- diferencia del resumen de Proveedores que ya usa una función canónica
-- (get_admin_supplier_debts) para resolver esto en una única consulta sin N+1.
--
-- Esta migración agrega el equivalente para clientes, siguiendo exactamente
-- el mismo patrón (CTEs agregando MAX(business_operations.business_date),
-- nunca created_at):
--
-- - ULTIMO PAGO: MAX(business_date) de operaciones CUSTOMER_PAYMENT
--   (payments.payment_type = 'CUSTOMER') del cliente.
-- - ULTIMA COMPRA: MAX(business_date) de sus RTO (remittances.customer_id,
--   vía la operación SALE_RTO original del remito — nunca la fecha del RTM).
--
-- No modifica saldos, RTO, RTM, stock, MST, MOV ni deuda de cliente: es una
-- función de solo lectura, aditiva, para completar dos columnas de UI.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_customer_last_activity()
RETURNS TABLE (
  customer_id UUID,
  last_payment_date DATE,
  last_purchase_date DATE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id AS customer_id,
    lp.last_payment_date,
    ls.last_purchase_date
  FROM public.customers c
  LEFT JOIN (
    SELECT pay.customer_id, MAX(bo.business_date) AS last_payment_date
    FROM public.payments pay
    JOIN public.business_operations bo ON bo.id = pay.operation_id
    WHERE pay.payment_type = 'CUSTOMER'
    GROUP BY pay.customer_id
  ) lp ON lp.customer_id = c.id
  LEFT JOIN (
    SELECT r.customer_id, MAX(bo.business_date) AS last_purchase_date
    FROM public.remittances r
    JOIN public.business_operations bo ON bo.id = r.operation_id
    WHERE r.customer_source = 'REGISTERED_CUSTOMER' AND r.customer_id IS NOT NULL
    GROUP BY r.customer_id
  ) ls ON ls.customer_id = c.id
  WHERE lp.last_payment_date IS NOT NULL OR ls.last_purchase_date IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_last_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_last_activity() TO service_role;
