-- ============================================================================
-- MIGRACIÓN: 20261002000028_phase13_complete_rtm_atomic.sql
-- FASE 13 — RTM / REMITO DE MARGEN (ERP STEFFEN)
--
-- Implementa el cierre atómico definitivo de la venta:
-- RTO RTM_PENDING -> RTM -> RTO COMPLETED.
--
-- El RTO ya materializó la venta (stock, MST, MOV VENTA, deuda/caja) en la
-- Fase 12. Este RPC NO vuelve a vender: únicamente agrega el snapshot de
-- costo teórico, el costo de productos, el transporte opcional, la ganancia,
-- y cierra el RTO.
--
-- Acciones dentro de una única transacción:
-- 1. Validar transporte >= 0.
-- 2. Bloquear la fila de `remittances` (FOR UPDATE) y validar status = RTM_PENDING.
-- 3. Defensa adicional: rechazar si ya existe un margin_remittances para este remito
--    (además de la UNIQUE constraint ya existente en remittance_id).
-- 4. Para cada remittance_item: obtener el costo teórico ACTUAL del PRO desde la
--    vista canónica `v_current_product_cost` (misma fuente que usa el resto del
--    ERP; no se duplica la fórmula de costeo) y congelarlo como snapshot.
-- 5. Calcular products_cost_total_ars = Σ(quantity_sent × costo unitario snapshot).
-- 6. Calcular gain_ars = remittance.total_order_ars - products_cost_total_ars - transporte.
--    (prior_balance_snapshot_ars y total_to_collect_ars NUNCA participan).
-- 7. Generar RTMxxxx (secuencia canónica get_next_code_sequence).
-- 8. Crear business_operation (operation_type = 'SALE_RTM').
-- 9. Crear margin_remittances y margin_remittance_items con los valores YA
--    calculados (nunca se hace UPDATE sobre margin_remittances tras crearla,
--    para no chocar con ninguna futura guarda de inmutabilidad).
-- 10. Si transporte > 0: bloquear CASH_STEFFEN, crear MOV TRANSPORTE y
--     financial_entry negativo (Caja Steffen puede quedar negativa: no se
--     bloquea por saldo insuficiente). Si transporte = 0: no se toca Caja Steffen.
-- 11. RTO -> COMPLETED (única transición de estado permitida por el guard de
--     inmutabilidad de la migración 20261002000027).
--
-- La concurrencia sobre el MISMO remito queda garantizada por el FOR UPDATE
-- sobre la fila de `remittances` (el recurso disputado) combinado con la
-- UNIQUE constraint preexistente en `margin_remittances.remittance_id`: no
-- hace falta un advisory lock global como en Fase 12, porque aquí el remito
-- a cerrar ya viene identificado por su id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_rtm_atomic(
  p_remittance_id UUID,
  p_transport_cost_ars NUMERIC,
  p_business_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remittance RECORD;
  v_business_date DATE;
  v_rtm_code VARCHAR;
  v_mov_code VARCHAR := NULL;
  v_op_id UUID;
  v_margin_remittance_id UUID;
  v_mov_id UUID;
  v_cash_steffen_id UUID;
  v_products_cost_total_ars NUMERIC(20,6) := 0;
  v_gain_ars NUMERIC(20,6) := 0;
  v_item RECORD;
  v_unit_cost NUMERIC(20,6);
  v_line_cost NUMERIC(20,6);
  v_calculated_items JSONB := '[]'::JSONB;
BEGIN
  -- 1. Validar transporte
  IF p_transport_cost_ars IS NULL OR p_transport_cost_ars < 0 THEN
    RAISE EXCEPTION 'El transporte no puede ser negativo.' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Bloquear remittance y validar precondición RTM_PENDING
  SELECT * INTO v_remittance
  FROM public.remittances
  WHERE id = p_remittance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Remito % no encontrado.', p_remittance_id;
  END IF;

  IF v_remittance.status != 'RTM_PENDING' THEN
    RAISE EXCEPTION 'El remito debe estar en estado RTM_PENDING para generar su RTM. Estado actual: %.', v_remittance.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Defensa adicional ante doble RTM (la UNIQUE sobre remittance_id ya lo garantiza)
  IF EXISTS (SELECT 1 FROM public.margin_remittances WHERE remittance_id = p_remittance_id) THEN
    RAISE EXCEPTION 'Ya existe un RTM generado para este remito.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.remittance_items WHERE remittance_id = p_remittance_id) THEN
    RAISE EXCEPTION 'El remito no tiene líneas enviadas.';
  END IF;

  -- 4-5. Costo teórico ACTUAL por línea (fuente canónica: v_current_product_cost)
  --      y acumulación de products_cost_total_ars
  FOR v_item IN
    SELECT ri.id AS remittance_item_id, ri.product_id, ri.quantity_sent
    FROM public.remittance_items ri
    WHERE ri.remittance_id = p_remittance_id
    ORDER BY ri.id ASC
  LOOP
    SELECT vcp.total_product_cost_ars INTO v_unit_cost
    FROM public.v_current_product_cost vcp
    WHERE vcp.product_id = v_item.product_id;

    IF NOT FOUND OR v_unit_cost IS NULL THEN
      v_unit_cost := 0;
    END IF;

    v_line_cost := ROUND(v_item.quantity_sent * v_unit_cost, 6);
    v_products_cost_total_ars := v_products_cost_total_ars + v_line_cost;

    v_calculated_items := v_calculated_items || jsonb_build_object(
      'product_id', v_item.product_id,
      'quantity_sent', v_item.quantity_sent,
      'unit_cost_theoretical_snapshot_ars', v_unit_cost,
      'total_cost_snapshot_ars', v_line_cost
    );
  END LOOP;

  -- 6. Ganancia: NUNCA participan prior_balance_snapshot_ars ni total_to_collect_ars
  v_gain_ars := v_remittance.total_order_ars - v_products_cost_total_ars - p_transport_cost_ars;

  -- Fecha funcional del cierre (hoy, salvo override explícito)
  IF p_business_date IS NOT NULL THEN
    v_business_date := p_business_date;
  ELSE
    v_business_date := CURRENT_DATE;
  END IF;

  -- 7. Código RTM (secuencia canónica; nunca MAX(code)+1)
  v_rtm_code := get_next_code_sequence('RTM');

  -- 8. business_operation SALE_RTM
  INSERT INTO public.business_operations (operation_type, business_date)
  VALUES ('SALE_RTM', v_business_date)
  RETURNING id INTO v_op_id;

  -- 9. margin_remittances (valores ya calculados: nunca se actualiza después)
  INSERT INTO public.margin_remittances (
    code,
    operation_id,
    remittance_id,
    products_cost_total_ars,
    transport_cost_ars,
    gain_ars
  ) VALUES (
    v_rtm_code,
    v_op_id,
    p_remittance_id,
    v_products_cost_total_ars,
    p_transport_cost_ars,
    v_gain_ars
  ) RETURNING id INTO v_margin_remittance_id;

  INSERT INTO public.margin_remittance_items (
    margin_remittance_id,
    product_id,
    quantity_sent,
    unit_cost_theoretical_snapshot_ars,
    total_cost_snapshot_ars
  )
  SELECT
    v_margin_remittance_id,
    (i->>'product_id')::UUID,
    (i->>'quantity_sent')::INTEGER,
    (i->>'unit_cost_theoretical_snapshot_ars')::NUMERIC,
    (i->>'total_cost_snapshot_ars')::NUMERIC
  FROM jsonb_array_elements(v_calculated_items) AS i;

  -- 10. Transporte: solo si > 0. Caja Steffen puede quedar negativa (no se bloquea).
  IF p_transport_cost_ars > 0 THEN
    SELECT id INTO v_cash_steffen_id
    FROM public.financial_accounts
    WHERE account_type = 'CASH_STEFFEN'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la cuenta Caja Steffen (CASH_STEFFEN).';
    END IF;

    v_mov_code := get_next_code_sequence('MOV');

    INSERT INTO public.patrimonial_movements (
      code,
      operation_id,
      movement_type,
      description,
      amount_ars
    ) VALUES (
      v_mov_code,
      v_op_id,
      'TRANSPORTE',
      'Transporte ' || v_remittance.code,
      p_transport_cost_ars
    ) RETURNING id INTO v_mov_id;

    INSERT INTO public.financial_entries (
      patrimonial_movement_id,
      financial_account_id,
      delta_ars
    ) VALUES (
      v_mov_id,
      v_cash_steffen_id,
      -p_transport_cost_ars
    );

    UPDATE public.financial_accounts
    SET current_balance = current_balance - p_transport_cost_ars,
        updated_at = NOW()
    WHERE id = v_cash_steffen_id;
  END IF;

  -- 11. RTO -> COMPLETED (única transición de estado permitida por el guard de Fase 12)
  UPDATE public.remittances
  SET status = 'COMPLETED'
  WHERE id = p_remittance_id;

  RETURN jsonb_build_object(
    'margin_remittance_id', v_margin_remittance_id,
    'code', v_rtm_code,
    'operation_id', v_op_id,
    'remittance_id', p_remittance_id,
    'remittance_code', v_remittance.code,
    'products_cost_total_ars', v_products_cost_total_ars,
    'transport_cost_ars', p_transport_cost_ars,
    'gain_ars', v_gain_ars,
    'mov_code', v_mov_code,
    'business_date', v_business_date,
    'rto_status', 'COMPLETED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_rtm_atomic(UUID, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_rtm_atomic(UUID, NUMERIC, DATE) TO authenticated, service_role;
