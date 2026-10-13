-- ============================================================================
-- MIGRACIÓN: 20261002000021_enforce_initial_positive_balance_for_payments.sql
-- FASE 9 — VALIDACIÓN AUTORITATIVA DE SALDO INICIAL > 0 PARA NUEVOS PAGOS
--
-- Reglas normativas:
-- 1. Un nuevo Pago Cliente SOLO puede iniciarse si la cuenta tiene saldo > 0.
--    Si el saldo inicial es <= 0, se rechaza la operación.
--    Sobrepago permitido: si saldo > 0, un pago mayor deja saldo final < 0.
-- 2. Un nuevo Pago Proveedor SOLO puede iniciarse si la cuenta tiene saldo > 0.
--    Si el saldo inicial es <= 0, se rechaza la operación.
--    Sobrepago permitido: si saldo > 0, un pago mayor deja saldo final < 0.
-- 3. edit_payment_atomic permanece sin esta restricción (edición histórica permitida).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_customer_payment_atomic(
  p_customer_id UUID,
  p_amount_ars NUMERIC,
  p_business_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_record RECORD;
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

  -- 1. Obtener y validar cliente
  SELECT id, name, code INTO v_customer_record
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente % no encontrado.', p_customer_id;
  END IF;

  -- 2. Obtener y bloquear cuenta del cliente
  SELECT id, current_balance INTO v_account_id, v_current_balance
  FROM public.financial_accounts
  WHERE customer_id = p_customer_id AND account_type = 'CUSTOMER_RECEIVABLE'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.financial_accounts (account_type, name, customer_id, current_balance, active)
    VALUES ('CUSTOMER_RECEIVABLE', 'Cuenta ' || v_customer_record.name, p_customer_id, 0, true)
    RETURNING id, current_balance INTO v_account_id, v_current_balance;
    
    PERFORM 1 FROM public.financial_accounts WHERE id = v_account_id FOR UPDATE;
  END IF;

  -- VALIDACIÓN NORMATIVA: Solamente se permite iniciar pago sobre cliente con saldo > 0
  IF v_current_balance <= 0 THEN
    RAISE EXCEPTION 'No se puede registrar un nuevo pago para un cliente sin saldo deudor pendiente (saldo actual: %).', v_current_balance;
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
  VALUES ('CUSTOMER_PAYMENT', p_business_date)
  RETURNING id INTO v_operation_id;

  -- 5. Crear payment
  INSERT INTO public.payments (operation_id, payment_type, customer_id, amount_ars)
  VALUES (v_operation_id, 'CUSTOMER', p_customer_id, v_amount)
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
    'PAGO_CLIENTE',
    'Cobro / Pago de cliente: ' || v_customer_record.name,
    v_amount
  ) RETURNING id INTO v_mov_id;

  -- 8. Crear entries y actualizar balances
  -- Cuenta cliente: se reduce la deuda (delta = -v_amount)
  INSERT INTO public.financial_entries (patrimonial_movement_id, financial_account_id, delta_ars)
  VALUES (v_mov_id, v_account_id, -v_amount);

  UPDATE public.financial_accounts
  SET current_balance = current_balance - v_amount,
      updated_at = NOW()
  WHERE id = v_account_id;

  -- Caja Steffen: ingresa el cobro (delta = +v_amount)
  INSERT INTO public.financial_entries (patrimonial_movement_id, financial_account_id, delta_ars)
  VALUES (v_mov_id, v_caja_steffen_id, v_amount);

  UPDATE public.financial_accounts
  SET current_balance = current_balance + v_amount,
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

-- 2. REGISTRAR PAGO PROVEEDOR ATÓMICO
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
  -- Deuda proveedor: se reduce la deuda (delta = -v_amount)
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

REVOKE ALL ON FUNCTION public.register_customer_payment_atomic(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_customer_payment_atomic(UUID, NUMERIC, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.register_supplier_payment_atomic(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment_atomic(UUID, NUMERIC, DATE) TO authenticated, service_role;
