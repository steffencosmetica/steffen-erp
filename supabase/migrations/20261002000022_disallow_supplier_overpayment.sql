-- ============================================================================
-- MIGRACIÓN: 20261002000022_disallow_supplier_overpayment.sql
-- FASE 9 — PROHIBICIÓN DE SOBREPAGO A PROVEEDOR Y CONSULTA BATCH DEUDAS PROVEEDORES
--
-- Reglas normativas:
-- 1. Un nuevo Pago Proveedor NO puede superar la deuda actual del proveedor:
--    - importe > 0
--    - current_balance > 0
--    - importe <= current_balance
--    Si importe > current_balance -> abortar con excepción:
--    'El importe no puede superar la deuda actual del proveedor.'
-- 2. Función batch get_admin_supplier_debts():
--    - Solo proveedores con deuda corriente (current_balance > 0).
--    - Agrega último pago funcional (business_operations.business_date).
--    - Agrega última compra funcional (business_operations.business_date).
-- ============================================================================

-- 1. REGISTRAR PAGO PROVEEDOR ATÓMICO (SIN SOBREPAGO)
CREATE OR REPLACE FUNCTION public.register_supplier_payment_atomic(
  p_supplier_id UUID,
  p_amount_ars NUMERIC,
  p_business_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_record RECORD;
  v_account_id UUID;
  v_current_balance NUMERIC(20,6);
  v_caja_steffen_id UUID;
  v_operation_id UUID;
  v_payment_id UUID;
  v_mov_id UUID;
  v_mov_code VARCHAR;
  v_amount NUMERIC(20,6);
BEGIN
  v_amount := ROUND(p_amount_ars::NUMERIC, 6);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El importe del pago debe ser mayor a cero.';
  END IF;

  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'La fecha de la operación es obligatoria.';
  END IF;

  -- 1. Obtener y validar proveedor
  SELECT id, name, code, currency_code INTO v_supplier_record
  FROM public.suppliers
  WHERE id = p_supplier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor % no encontrado.', p_supplier_id;
  END IF;

  -- 2. Obtener y bloquear cuenta del proveedor
  SELECT id, current_balance INTO v_account_id, v_current_balance
  FROM public.financial_accounts
  WHERE supplier_id = p_supplier_id AND account_type = 'SUPPLIER_PAYABLE'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.financial_accounts (account_type, name, supplier_id, current_balance, active)
    VALUES ('SUPPLIER_PAYABLE', 'Deuda ' || v_supplier_record.name, p_supplier_id, 0, true)
    RETURNING id, current_balance INTO v_account_id, v_current_balance;
    
    PERFORM 1 FROM public.financial_accounts WHERE id = v_account_id FOR UPDATE;
  END IF;

  -- VALIDACIÓN NORMATIVA: Solamente se permite iniciar pago sobre proveedor con deuda > 0
  IF v_current_balance <= 0 THEN
    RAISE EXCEPTION 'No se puede registrar un nuevo pago para un proveedor sin deuda pendiente (saldo actual: %).', v_current_balance;
  END IF;

  -- VALIDACIÓN NORMATIVA: No se permite sobrepago a proveedor
  IF v_amount > v_current_balance THEN
    RAISE EXCEPTION 'El importe no puede superar la deuda actual del proveedor.';
  END IF;

  -- 3. Obtener y bloquear Caja Steffen
  SELECT id INTO v_caja_steffen_id
  FROM public.financial_accounts
  WHERE account_type = 'CASH_STEFFEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta Caja Steffen no encontrada en financial_accounts.';
  END IF;

  -- 4. Crear business_operation
  INSERT INTO public.business_operations (operation_type, business_date)
  VALUES ('SUPPLIER_PAYMENT', p_business_date)
  RETURNING id INTO v_operation_id;

  -- 5. Crear payment
  INSERT INTO public.payments (operation_id, payment_type, supplier_id, amount_ars)
  VALUES (v_operation_id, 'SUPPLIER', p_supplier_id, v_amount)
  RETURNING id INTO v_payment_id;

  -- 6. Generar código MOV seguro
  v_mov_code := get_next_code_sequence('MOV');

  -- 7. Crear movimiento patrimonial
  INSERT INTO public.patrimonial_movements (
    code,
    operation_id,
    movement_type,
    description,
    amount_ars
  ) VALUES (
    v_mov_code,
    v_operation_id,
    'PAGO_PROVEEDOR',
    'Pago a proveedor: ' || v_supplier_record.name,
    v_amount
  ) RETURNING id INTO v_mov_id;

  -- 8. Crear entries y actualizar balances
  -- Cuenta proveedor: se reduce la deuda (delta = -v_amount)
  INSERT INTO public.financial_entries (patrimonial_movement_id, financial_account_id, delta_ars)
  VALUES (v_mov_id, v_account_id, -v_amount);

  UPDATE public.financial_accounts
  SET current_balance = current_balance - v_amount,
      updated_at = NOW()
  WHERE id = v_account_id;

  -- Caja Steffen: egresa el dinero (delta = -v_amount)
  INSERT INTO public.financial_entries (patrimonial_movement_id, financial_account_id, delta_ars)
  VALUES (v_mov_id, v_caja_steffen_id, -v_amount);

  UPDATE public.financial_accounts
  SET current_balance = current_balance - v_amount,
      updated_at = NOW()
  WHERE id = v_caja_steffen_id;

  RETURN jsonb_build_object(
    'operation_id', v_operation_id,
    'payment_id', v_payment_id,
    'movement_id', v_mov_id,
    'code', v_mov_code,
    'amount_ars', v_amount,
    'business_date', p_business_date
  );
END;
$$;

-- 2. FUNCIÓN BATCH DEUDAS PROVEEDORES PARA ADMINISTRACIÓN (FECHAS FUNCIONALES BATCH)
CREATE OR REPLACE FUNCTION public.get_admin_supplier_debts()
RETURNS TABLE (
  supplier_id UUID,
  supplier_name VARCHAR,
  balance_ars NUMERIC,
  last_payment_date DATE,
  last_purchase_date DATE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH last_purchases AS (
    SELECT 
      p.supplier_id,
      MAX(bo.business_date) AS last_purchase_date
    FROM public.purchases p
    JOIN public.business_operations bo ON bo.id = p.operation_id
    GROUP BY p.supplier_id
  ),
  last_payments AS (
    SELECT 
      pay.supplier_id,
      MAX(bo.business_date) AS last_payment_date
    FROM public.payments pay
    JOIN public.business_operations bo ON bo.id = pay.operation_id
    WHERE pay.payment_type = 'SUPPLIER'
    GROUP BY pay.supplier_id
  )
  SELECT 
    s.id AS supplier_id,
    s.name AS supplier_name,
    fa.current_balance AS balance_ars,
    lp.last_payment_date,
    lpur.last_purchase_date
  FROM public.suppliers s
  JOIN public.financial_accounts fa ON fa.supplier_id = s.id AND fa.account_type = 'SUPPLIER_PAYABLE'
  LEFT JOIN last_payments lp ON lp.supplier_id = s.id
  LEFT JOIN last_purchases lpur ON lpur.supplier_id = s.id
  WHERE fa.current_balance > 0
  ORDER BY fa.current_balance DESC, s.name ASC;
$$;

-- Permisos de ejecución exclusivos para service_role
REVOKE EXECUTE ON FUNCTION public.register_supplier_payment_atomic(UUID, NUMERIC, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment_atomic(UUID, NUMERIC, DATE) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_supplier_debts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_supplier_debts() TO service_role;
