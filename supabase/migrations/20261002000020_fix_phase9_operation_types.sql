-- ============================================================================
-- MIGRACIÓN: 20261002000020_fix_phase9_operation_types.sql
-- FASE 9 — CORRECCIÓN DE OPERATION_TYPES EN RPCS ATÓMICOS
--
-- Corrige operation_type en business_operations:
-- 1. register_customer_payment_atomic -> CUSTOMER_PAYMENT
-- 2. register_supplier_payment_atomic -> SUPPLIER_PAYMENT
-- 3. register_operating_expense_atomic -> OPERATING_EXPENSE
-- 4. edit_payment_atomic -> p_new_business_date opcional
-- ============================================================================

-- 1. REGISTRAR PAGO CLIENTE ATÓMICO
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

  -- 1. Obtener y validar cliente (clientes inactivos con deuda/saldo pueden recibir pagos)
  SELECT id, name, code INTO v_customer_record
  FROM public.customers
  WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente % no encontrado.', p_customer_id;
  END IF;

  -- 2. Obtener y bloquear cuenta del cliente
  SELECT id INTO v_account_id
  FROM public.financial_accounts
  WHERE customer_id = p_customer_id AND account_type = 'CUSTOMER_RECEIVABLE'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.financial_accounts (account_type, name, customer_id, current_balance, active)
    VALUES ('CUSTOMER_RECEIVABLE', 'Cuenta ' || v_customer_record.name, p_customer_id, 0, true)
    RETURNING id INTO v_account_id;
    
    PERFORM 1 FROM public.financial_accounts WHERE id = v_account_id FOR UPDATE;
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

  -- 1. Obtener y validar proveedor (proveedores inactivos con saldo pueden recibir pagos)
  SELECT id, name, code, currency_code INTO v_supplier_record
  FROM public.suppliers
  WHERE id = p_supplier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor % no encontrado.', p_supplier_id;
  END IF;

  -- 2. Obtener y bloquear cuenta del proveedor
  SELECT id INTO v_account_id
  FROM public.financial_accounts
  WHERE supplier_id = p_supplier_id AND account_type = 'SUPPLIER_PAYABLE'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.financial_accounts (account_type, name, supplier_id, current_balance, active)
    VALUES ('SUPPLIER_PAYABLE', 'Deuda ' || v_supplier_record.name, p_supplier_id, 0, true)
    RETURNING id INTO v_account_id;
    
    PERFORM 1 FROM public.financial_accounts WHERE id = v_account_id FOR UPDATE;
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

-- 3. EDITAR PAGO ATÓMICO (ESTRATEGIA DELTA)
CREATE OR REPLACE FUNCTION public.edit_payment_atomic(
  p_payment_id UUID,
  p_new_amount_ars NUMERIC,
  p_new_business_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment RECORD;
  v_old_amount NUMERIC(20,6);
  v_new_amount NUMERIC(20,6);
  v_delta NUMERIC(20,6);
  v_party_account_id UUID;
  v_caja_steffen_id UUID;
  v_mov_id UUID;
  v_mov_code VARCHAR;
BEGIN
  v_new_amount := ROUND(p_new_amount_ars::NUMERIC, 6);
  IF v_new_amount <= 0 THEN
    RAISE EXCEPTION 'El nuevo importe del pago debe ser mayor a cero.';
  END IF;

  -- 1. Bloquear pago FOR UPDATE
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago % no encontrado.', p_payment_id;
  END IF;

  v_old_amount := v_payment.amount_ars;
  v_delta := v_new_amount - v_old_amount;

  -- 2. Bloquear cuentas afectadas
  IF v_payment.payment_type = 'CUSTOMER' THEN
    SELECT id INTO v_party_account_id
    FROM public.financial_accounts
    WHERE customer_id = v_payment.customer_id AND account_type = 'CUSTOMER_RECEIVABLE'
    FOR UPDATE;
  ELSE
    SELECT id INTO v_party_account_id
    FROM public.financial_accounts
    WHERE supplier_id = v_payment.supplier_id AND account_type = 'SUPPLIER_PAYABLE'
    FOR UPDATE;
  END IF;

  SELECT id INTO v_caja_steffen_id
  FROM public.financial_accounts
  WHERE account_type = 'CASH_STEFFEN'
  FOR UPDATE;

  -- 3. Actualizar payment
  UPDATE public.payments
  SET amount_ars = v_new_amount,
      updated_at = NOW()
  WHERE id = p_payment_id;

  -- 4. Actualizar business_operations.business_date (si fue provista)
  IF p_new_business_date IS NOT NULL THEN
    UPDATE public.business_operations
    SET business_date = p_new_business_date,
        updated_at = NOW()
    WHERE id = v_payment.operation_id;
  END IF;

  -- 5. Obtener MOV relacionado
  SELECT id, code INTO v_mov_id, v_mov_code
  FROM public.patrimonial_movements
  WHERE operation_id = v_payment.operation_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimiento patrimonial asociado al pago % no encontrado.', p_payment_id;
  END IF;

  -- Actualizar MOV amount_ars
  UPDATE public.patrimonial_movements
  SET amount_ars = v_new_amount
  WHERE id = v_mov_id;

  -- 6. Aplicar ajuste de saldos si el importe cambió (v_delta != 0)
  IF v_delta != 0 THEN
    IF v_payment.payment_type = 'CUSTOMER' THEN
      -- Cliente: nuevo importe mayor reduce más la deuda
      UPDATE public.financial_accounts
      SET current_balance = current_balance - v_delta,
          updated_at = NOW()
      WHERE id = v_party_account_id;

      -- Caja Steffen: nuevo importe mayor aumenta más la caja
      UPDATE public.financial_accounts
      SET current_balance = current_balance + v_delta,
          updated_at = NOW()
      WHERE id = v_caja_steffen_id;

      -- Actualizar financial_entries correspondientes
      UPDATE public.financial_entries
      SET delta_ars = -v_new_amount
      WHERE patrimonial_movement_id = v_mov_id AND financial_account_id = v_party_account_id;

      UPDATE public.financial_entries
      SET delta_ars = v_new_amount
      WHERE patrimonial_movement_id = v_mov_id AND financial_account_id = v_caja_steffen_id;

    ELSE
      -- Proveedor: nuevo importe mayor reduce más la deuda
      UPDATE public.financial_accounts
      SET current_balance = current_balance - v_delta,
          updated_at = NOW()
      WHERE id = v_party_account_id;

      -- Caja Steffen: nuevo importe mayor reduce más la caja
      UPDATE public.financial_accounts
      SET current_balance = current_balance - v_delta,
          updated_at = NOW()
      WHERE id = v_caja_steffen_id;

      -- Actualizar financial_entries
      UPDATE public.financial_entries
      SET delta_ars = -v_new_amount
      WHERE patrimonial_movement_id = v_mov_id AND financial_account_id = v_party_account_id;

      UPDATE public.financial_entries
      SET delta_ars = -v_new_amount
      WHERE patrimonial_movement_id = v_mov_id AND financial_account_id = v_caja_steffen_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', p_payment_id,
    'operation_id', v_payment.operation_id,
    'movement_id', v_mov_id,
    'code', v_mov_code,
    'old_amount_ars', v_old_amount,
    'new_amount_ars', v_new_amount,
    'delta_ars', v_delta,
    'business_date', p_new_business_date
  );
END;
$$;

-- 4. REGISTRAR GASTO OPERATIVO ATÓMICO
CREATE OR REPLACE FUNCTION public.register_operating_expense_atomic(
  p_expense_type VARCHAR,
  p_description TEXT,
  p_amount_ars NUMERIC,
  p_business_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caja_steffen_id UUID;
  v_operation_id UUID;
  v_expense_id UUID;
  v_mov_id UUID;
  v_mov_code VARCHAR;
  v_amount NUMERIC(20,6);
  v_desc TEXT;
  v_mov_desc TEXT;
BEGIN
  v_amount := ROUND(p_amount_ars::NUMERIC, 6);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El importe del gasto operativo debe ser mayor a cero.';
  END IF;

  IF p_expense_type NOT IN ('LUZ', 'ALQUILER', 'COMISIÓN', 'OTRO') THEN
    RAISE EXCEPTION 'Tipo de gasto operativo no válido: %', p_expense_type;
  END IF;

  v_desc := TRIM(COALESCE(p_description, ''));
  IF p_expense_type = 'OTRO' AND (v_desc IS NULL OR v_desc = '') THEN
    RAISE EXCEPTION 'La descripción es obligatoria cuando el tipo de gasto es OTRO.';
  END IF;

  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'La fecha de la operación es obligatoria.';
  END IF;

  -- 1. Obtener y bloquear Caja Steffen
  SELECT id INTO v_caja_steffen_id
  FROM public.financial_accounts
  WHERE account_type = 'CASH_STEFFEN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta Caja Steffen no encontrada en financial_accounts.';
  END IF;

  -- 2. Crear business_operation
  INSERT INTO public.business_operations (operation_type, business_date)
  VALUES ('OPERATING_EXPENSE', p_business_date)
  RETURNING id INTO v_operation_id;

  -- 3. Crear operating_expense
  INSERT INTO public.operating_expenses (
    operation_id,
    expense_type,
    description,
    amount_ars,
    source_account_id
  ) VALUES (
    v_operation_id,
    p_expense_type,
    NULLIF(v_desc, ''),
    v_amount,
    v_caja_steffen_id
  ) RETURNING id INTO v_expense_id;

  -- 4. Generar código MOV seguro
  v_mov_code := get_next_code_sequence('MOV');

  -- 5. Crear movimiento patrimonial
  v_mov_desc := CASE 
    WHEN v_desc != '' THEN 'Gasto operativo (' || p_expense_type || '): ' || v_desc
    ELSE 'Gasto operativo: ' || p_expense_type
  END;

  INSERT INTO public.patrimonial_movements (
    code,
    operation_id,
    movement_type,
    description,
    amount_ars
  ) VALUES (
    v_mov_code,
    v_operation_id,
    'GASTO_OPERATIVO',
    v_mov_desc,
    v_amount
  ) RETURNING id INTO v_mov_id;

  -- 6. Crear entry y actualizar balance de Caja Steffen
  INSERT INTO public.financial_entries (patrimonial_movement_id, financial_account_id, delta_ars)
  VALUES (v_mov_id, v_caja_steffen_id, -v_amount);

  UPDATE public.financial_accounts
  SET current_balance = current_balance - v_amount,
      updated_at = NOW()
  WHERE id = v_caja_steffen_id;

  RETURN jsonb_build_object(
    'operation_id', v_operation_id,
    'expense_id', v_expense_id,
    'movement_id', v_mov_id,
    'code', v_mov_code,
    'amount_ars', v_amount,
    'business_date', p_business_date
  );
END;
$$;

-- Permisos de seguridad para los RPCs
REVOKE ALL ON FUNCTION public.register_customer_payment_atomic(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_customer_payment_atomic(UUID, NUMERIC, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.register_supplier_payment_atomic(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment_atomic(UUID, NUMERIC, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.edit_payment_atomic(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_payment_atomic(UUID, NUMERIC, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.register_operating_expense_atomic(VARCHAR, TEXT, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_operating_expense_atomic(VARCHAR, TEXT, NUMERIC, DATE) TO authenticated, service_role;
