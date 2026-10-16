-- ============================================================================
-- MIGRACIÓN: 20261002000034_phase19_1_opening_balances_and_cash_deposits.sql
-- FASE 19.1 — SALDO DE APERTURA (clientes / proveedores) + INGRESO DE CAJA
--
-- Reglas normativas (BUSINESS_RULES §20.2, §26.1):
-- 1. Saldo de apertura: deuda previa al inicio operativo del ERP. Aumenta la
--    cuenta CUSTOMER_RECEIVABLE (cliente debe a Steffen) o SUPPLIER_PAYABLE
--    (Steffen debe al proveedor) con la convención de signos vigente
--    (saldo > 0 = deuda). No constituye venta, compra, ingreso, egreso ni
--    movimiento de stock: solo afecta la cuenta corriente correspondiente.
--    - máximo 1 por cuenta (UNIQUE financial_account_id);
--    - importe > 0; nunca sobre cuentas CASH;
--    - crear / editar / eliminar solo mientras la cuenta no tenga ninguna otra
--      actividad (asientos, pagos, compras o RTO).
-- 2. Ingreso de caja: contraparte de Retiro de caja. Caja Steffen += importe.
--    Mismo patrón y mismo criterio de edición que Retiro (solo alta).
-- 3. Toda escritura es atómica (una sola transacción PL/pgSQL): operación,
--    MOV, asiento y current_balance.
-- 4. Errores de negocio con SQLSTATE propio para mapearlos a errores de dominio:
--    SA001 apertura duplicada · SA002 cuenta con actividad · SA003 tipo de cuenta
--    no admitido.
--
-- Replay-safe: CHECKs reemplazados por definición, tablas IF NOT EXISTS,
-- funciones CREATE OR REPLACE. Compatible con base nueva y con la base dev.
-- ============================================================================

-- ------------------------------------------------------------------------------
-- 1. Nuevos tipos de operación de negocio y de movimiento patrimonial
--    (los CHECK originales son inline, sin nombre explícito: se ubican por
--    definición y se reemplazan por un CHECK con nombre estable)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.business_operations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%operation_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.business_operations DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.patrimonial_movements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%movement_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.patrimonial_movements DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.business_operations
  ADD CONSTRAINT business_operations_operation_type_check CHECK (
    operation_type IN (
      'BULK_PRODUCTION',
      'PACKAGING',
      'PURCHASE',
      'SALE_RTO',
      'SALE_RTM',
      'CUSTOMER_PAYMENT',
      'SUPPLIER_PAYMENT',
      'OPERATING_EXPENSE',
      'WITHDRAWAL',
      'MARKETPLACE_SETTLEMENT',
      'STOCK_ADJUSTMENT',
      'OPENING_BALANCE',
      'CASH_DEPOSIT'
    )
  );

ALTER TABLE public.patrimonial_movements
  ADD CONSTRAINT patrimonial_movements_movement_type_check CHECK (
    movement_type IN (
      'RETIRO',
      'COMPRA',
      'PAGO_PROVEEDOR',
      'PAGO_CLIENTE',
      'TRANSPORTE',
      'VENTA',
      'GASTO_OPERATIVO',
      'TRANSFERENCIA_MERCADO_LIBRE',
      'SALDO_APERTURA',
      'INGRESO_CAJA'
    )
  );

-- ------------------------------------------------------------------------------
-- 2. Tablas
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  financial_account_id UUID NOT NULL UNIQUE REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  amount_ars NUMERIC(20,6) NOT NULL CHECK (amount_ars > 0),
  observation TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE REFERENCES public.business_operations(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  amount_ars NUMERIC(20,6) NOT NULL CHECK (amount_ars > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_deposits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.opening_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cash_deposits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.opening_balances TO service_role;
GRANT ALL ON public.cash_deposits TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Actividad de una cuenta corriente distinta del propio saldo de apertura
--    (asientos de cualquier otro MOV, pagos, compras o RTO de la contraparte).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.opening_balance_account_has_activity(
  p_account_id UUID,
  p_opening_movement_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id UUID;
  v_supplier_id UUID;
BEGIN
  SELECT customer_id, supplier_id INTO v_customer_id, v_supplier_id
  FROM public.financial_accounts
  WHERE id = p_account_id;

  IF EXISTS (
    SELECT 1 FROM public.financial_entries
    WHERE financial_account_id = p_account_id
      AND (p_opening_movement_id IS NULL OR patrimonial_movement_id <> p_opening_movement_id)
  ) THEN
    RETURN TRUE;
  END IF;

  IF v_customer_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.payments WHERE customer_id = v_customer_id)
    OR EXISTS (SELECT 1 FROM public.remittances WHERE customer_id = v_customer_id)
  ) THEN
    RETURN TRUE;
  END IF;

  IF v_supplier_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.payments WHERE supplier_id = v_supplier_id)
    OR EXISTS (SELECT 1 FROM public.purchases WHERE supplier_id = v_supplier_id)
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Estado del saldo de apertura de un cliente / proveedor (solo lectura).
--    Importes como texto exacto (NUMERIC::text), nunca como número JSON.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_opening_balance_state(
  p_party_type VARCHAR,
  p_party_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account RECORD;
  v_opening RECORD;
  v_movement_id UUID;
  v_movement_code VARCHAR;
BEGIN
  IF p_party_type = 'CUSTOMER' THEN
    SELECT id, account_type, current_balance INTO v_account
    FROM public.financial_accounts
    WHERE customer_id = p_party_id AND account_type = 'CUSTOMER_RECEIVABLE';
  ELSIF p_party_type = 'SUPPLIER' THEN
    SELECT id, account_type, current_balance INTO v_account
    FROM public.financial_accounts
    WHERE supplier_id = p_party_id AND account_type = 'SUPPLIER_PAYABLE';
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'SA003',
      MESSAGE = format('Tipo de contraparte no admitido para saldo de apertura: %s.', p_party_type);
  END IF;

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('account_id', NULL);
  END IF;

  SELECT ob.id, ob.amount_ars, ob.observation, ob.operation_id, bo.business_date
  INTO v_opening
  FROM public.opening_balances ob
  JOIN public.business_operations bo ON bo.id = ob.operation_id
  WHERE ob.financial_account_id = v_account.id;

  IF v_opening.id IS NOT NULL THEN
    SELECT id, code INTO v_movement_id, v_movement_code
    FROM public.patrimonial_movements
    WHERE operation_id = v_opening.operation_id
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'account_id', v_account.id,
    'account_type', v_account.account_type,
    'current_balance', v_account.current_balance::text,
    'opening_balance_id', v_opening.id,
    'amount_ars', v_opening.amount_ars::text,
    'business_date', v_opening.business_date::text,
    'observation', v_opening.observation,
    'movement_code', v_movement_code,
    'has_other_activity', public.opening_balance_account_has_activity(v_account.id, v_movement_id)
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Registrar saldo de apertura (atómico)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_opening_balance_atomic(
  p_financial_account_id UUID,
  p_amount_ars NUMERIC,
  p_business_date DATE,
  p_observation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account RECORD;
  v_party_name VARCHAR;
  v_operation_id UUID;
  v_opening_id UUID;
  v_mov_id UUID;
  v_mov_code VARCHAR;
  v_amount NUMERIC(20,6);
  v_observation TEXT;
BEGIN
  IF p_amount_ars IS NULL THEN
    RAISE EXCEPTION 'El importe del saldo de apertura es obligatorio.';
  END IF;

  v_amount := ROUND(p_amount_ars::NUMERIC, 6);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El importe del saldo de apertura debe ser mayor a cero.';
  END IF;

  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'La fecha de apertura es obligatoria.';
  END IF;

  v_observation := NULLIF(TRIM(COALESCE(p_observation, '')), '');

  -- 1. Bloquear la cuenta (serializa con pagos / compras / RTO sobre la misma cuenta)
  SELECT id, account_type, customer_id, supplier_id INTO v_account
  FROM public.financial_accounts
  WHERE id = p_financial_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cuenta financiera % no encontrada.', p_financial_account_id;
  END IF;

  IF v_account.account_type NOT IN ('CUSTOMER_RECEIVABLE', 'SUPPLIER_PAYABLE') THEN
    RAISE EXCEPTION USING ERRCODE = 'SA003',
      MESSAGE = format('El saldo de apertura solo admite cuentas de clientes o proveedores (cuenta %s).', v_account.account_type);
  END IF;

  -- 2. Máximo un saldo de apertura por cuenta
  IF EXISTS (SELECT 1 FROM public.opening_balances WHERE financial_account_id = v_account.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'SA001',
      MESSAGE = 'La cuenta ya tiene un saldo de apertura registrado.';
  END IF;

  -- 3. Solo antes de cualquier otra actividad de la cuenta
  IF public.opening_balance_account_has_activity(v_account.id, NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'SA002',
      MESSAGE = 'No se puede registrar el saldo de apertura: la cuenta ya tiene movimientos.';
  END IF;

  IF v_account.account_type = 'CUSTOMER_RECEIVABLE' THEN
    SELECT name INTO v_party_name FROM public.customers WHERE id = v_account.customer_id;
  ELSE
    SELECT name INTO v_party_name FROM public.suppliers WHERE id = v_account.supplier_id;
  END IF;

  -- 4. Operación + registro de apertura
  INSERT INTO public.business_operations (operation_type, business_date)
  VALUES ('OPENING_BALANCE', p_business_date)
  RETURNING id INTO v_operation_id;

  INSERT INTO public.opening_balances (operation_id, financial_account_id, amount_ars, observation)
  VALUES (v_operation_id, v_account.id, v_amount, v_observation)
  RETURNING id INTO v_opening_id;

  -- 5. MOV + asiento: la deuda aumenta (delta = +importe) en la cuenta corriente
  v_mov_code := get_next_code_sequence('MOV');

  INSERT INTO public.patrimonial_movements (code, operation_id, movement_type, description, amount_ars)
  VALUES (v_mov_code, v_operation_id, 'SALDO_APERTURA', 'Saldo de apertura: ' || COALESCE(v_party_name, ''), v_amount)
  RETURNING id INTO v_mov_id;

  INSERT INTO public.financial_entries (patrimonial_movement_id, financial_account_id, delta_ars)
  VALUES (v_mov_id, v_account.id, v_amount);

  UPDATE public.financial_accounts
  SET current_balance = current_balance + v_amount,
      updated_at = NOW()
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'opening_balance_id', v_opening_id,
    'operation_id', v_operation_id,
    'movement_id', v_mov_id,
    'code', v_mov_code,
    'financial_account_id', v_account.id,
    'amount_ars', v_amount::text,
    'business_date', p_business_date::text
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Editar saldo de apertura (atómico). Igual que Edición de pago (§23.3):
--    modifica el MOV original y recalcula la cuenta; sin movimiento compensatorio.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_opening_balance_atomic(
  p_opening_balance_id UUID,
  p_new_amount_ars NUMERIC,
  p_new_business_date DATE,
  p_observation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id UUID;
  v_opening RECORD;
  v_mov_id UUID;
  v_mov_code VARCHAR;
  v_new_amount NUMERIC(20,6);
  v_delta NUMERIC(20,6);
BEGIN
  IF p_new_amount_ars IS NULL THEN
    RAISE EXCEPTION 'El importe del saldo de apertura es obligatorio.';
  END IF;

  v_new_amount := ROUND(p_new_amount_ars::NUMERIC, 6);
  IF v_new_amount <= 0 THEN
    RAISE EXCEPTION 'El importe del saldo de apertura debe ser mayor a cero.';
  END IF;

  IF p_new_business_date IS NULL THEN
    RAISE EXCEPTION 'La fecha de apertura es obligatoria.';
  END IF;

  SELECT financial_account_id INTO v_account_id
  FROM public.opening_balances
  WHERE id = p_opening_balance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saldo de apertura % no encontrado.', p_opening_balance_id;
  END IF;

  -- Mismo orden de bloqueo que el alta: cuenta y luego registro de apertura
  PERFORM 1 FROM public.financial_accounts WHERE id = v_account_id FOR UPDATE;

  SELECT id, operation_id, amount_ars INTO v_opening
  FROM public.opening_balances
  WHERE id = p_opening_balance_id
  FOR UPDATE;

  SELECT id, code INTO v_mov_id, v_mov_code
  FROM public.patrimonial_movements
  WHERE operation_id = v_opening.operation_id;

  IF public.opening_balance_account_has_activity(v_account_id, v_mov_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'SA002',
      MESSAGE = 'No se puede editar el saldo de apertura: la cuenta ya tiene movimientos posteriores.';
  END IF;

  v_delta := v_new_amount - v_opening.amount_ars;

  UPDATE public.opening_balances
  SET amount_ars = v_new_amount,
      observation = NULLIF(TRIM(COALESCE(p_observation, '')), ''),
      updated_at = NOW()
  WHERE id = v_opening.id;

  UPDATE public.business_operations
  SET business_date = p_new_business_date,
      updated_at = NOW()
  WHERE id = v_opening.operation_id;

  UPDATE public.patrimonial_movements
  SET amount_ars = v_new_amount
  WHERE id = v_mov_id;

  UPDATE public.financial_entries
  SET delta_ars = v_new_amount
  WHERE patrimonial_movement_id = v_mov_id
    AND financial_account_id = v_account_id;

  IF v_delta <> 0 THEN
    UPDATE public.financial_accounts
    SET current_balance = current_balance + v_delta,
        updated_at = NOW()
    WHERE id = v_account_id;
  END IF;

  RETURN jsonb_build_object(
    'opening_balance_id', v_opening.id,
    'operation_id', v_opening.operation_id,
    'movement_id', v_mov_id,
    'code', v_mov_code,
    'financial_account_id', v_account_id,
    'old_amount_ars', v_opening.amount_ars::text,
    'new_amount_ars', v_new_amount::text,
    'delta_ars', v_delta::text,
    'business_date', p_new_business_date::text
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Eliminar saldo de apertura (atómico). Solo durante la carga inicial: la
--    cuenta no puede tener ninguna otra actividad. Revierte el saldo y elimina
--    asiento, MOV, registro y operación propios de la apertura.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_opening_balance_atomic(
  p_opening_balance_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id UUID;
  v_opening RECORD;
  v_mov_id UUID;
  v_mov_code VARCHAR;
BEGIN
  SELECT financial_account_id INTO v_account_id
  FROM public.opening_balances
  WHERE id = p_opening_balance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saldo de apertura % no encontrado.', p_opening_balance_id;
  END IF;

  PERFORM 1 FROM public.financial_accounts WHERE id = v_account_id FOR UPDATE;

  SELECT id, operation_id, amount_ars INTO v_opening
  FROM public.opening_balances
  WHERE id = p_opening_balance_id
  FOR UPDATE;

  SELECT id, code INTO v_mov_id, v_mov_code
  FROM public.patrimonial_movements
  WHERE operation_id = v_opening.operation_id;

  IF public.opening_balance_account_has_activity(v_account_id, v_mov_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'SA002',
      MESSAGE = 'No se puede eliminar el saldo de apertura: la cuenta ya tiene movimientos posteriores.';
  END IF;

  UPDATE public.financial_accounts
  SET current_balance = current_balance - v_opening.amount_ars,
      updated_at = NOW()
  WHERE id = v_account_id;

  DELETE FROM public.opening_balances WHERE id = v_opening.id;
  -- financial_entries del MOV se eliminan en cascada
  DELETE FROM public.patrimonial_movements WHERE id = v_mov_id;
  DELETE FROM public.business_operations WHERE id = v_opening.operation_id;

  RETURN jsonb_build_object(
    'opening_balance_id', v_opening.id,
    'operation_id', v_opening.operation_id,
    'code', v_mov_code,
    'financial_account_id', v_account_id,
    'amount_ars', v_opening.amount_ars::text
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Registrar ingreso de caja (atómico). Contraparte exacta de
--    register_withdrawal_atomic con efecto inverso: Caja Steffen += importe.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_cash_deposit_atomic(
  p_amount_ars NUMERIC,
  p_description TEXT,
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
  v_deposit_id UUID;
  v_mov_id UUID;
  v_mov_code VARCHAR;
  v_amount NUMERIC(20,6);
  v_desc TEXT;
BEGIN
  IF p_amount_ars IS NULL THEN
    RAISE EXCEPTION 'El importe del ingreso es obligatorio.';
  END IF;

  v_amount := ROUND(p_amount_ars::NUMERIC, 6);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El importe del ingreso debe ser mayor a cero.';
  END IF;

  v_desc := TRIM(p_description);
  IF v_desc IS NULL OR v_desc = '' THEN
    RAISE EXCEPTION 'El concepto del ingreso de caja es obligatorio.';
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
  VALUES ('CASH_DEPOSIT', p_business_date)
  RETURNING id INTO v_operation_id;

  -- 3. Crear ingreso de caja
  INSERT INTO public.cash_deposits (operation_id, description, amount_ars)
  VALUES (v_operation_id, v_desc, v_amount)
  RETURNING id INTO v_deposit_id;

  -- 4. MOV + asiento: Caja Steffen += importe
  v_mov_code := get_next_code_sequence('MOV');

  INSERT INTO public.patrimonial_movements (code, operation_id, movement_type, description, amount_ars)
  VALUES (v_mov_code, v_operation_id, 'INGRESO_CAJA', 'Ingreso de caja: ' || v_desc, v_amount)
  RETURNING id INTO v_mov_id;

  INSERT INTO public.financial_entries (patrimonial_movement_id, financial_account_id, delta_ars)
  VALUES (v_mov_id, v_caja_steffen_id, v_amount);

  UPDATE public.financial_accounts
  SET current_balance = current_balance + v_amount,
      updated_at = NOW()
  WHERE id = v_caja_steffen_id;

  RETURN jsonb_build_object(
    'operation_id', v_operation_id,
    'cash_deposit_id', v_deposit_id,
    'movement_id', v_mov_id,
    'code', v_mov_code,
    'amount_ars', v_amount::text,
    'business_date', p_business_date::text
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. Permisos: exclusivamente service_role (mismo criterio que 20261002000031)
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.opening_balance_account_has_activity(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opening_balance_account_has_activity(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_opening_balance_state(VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_opening_balance_state(VARCHAR, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.register_opening_balance_atomic(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_opening_balance_atomic(UUID, NUMERIC, DATE, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.edit_opening_balance_atomic(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_opening_balance_atomic(UUID, NUMERIC, DATE, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.delete_opening_balance_atomic(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_opening_balance_atomic(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.register_cash_deposit_atomic(NUMERIC, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_cash_deposit_atomic(NUMERIC, TEXT, DATE) TO service_role;
