-- ============================================================================
-- MIGRACIÓN: 20261002000026_phase12_confirm_order_to_remittance_atomic.sql
-- FASE 12 — RTO / CONFIRMACIÓN DE VENTA (ERP STEFFEN)
--
-- Implementa la conversión atómica definitiva de:
-- PED OPEN -> RTO -> Venta real.
--
-- Acciones dentro de una única transacción:
-- 1. Gate de concurrencia: exclusión mutua global para RTM_PENDING (advisory lock)
-- 2. Validación de ausencia de RTO previo en estado RTM_PENDING
-- 3. Bloqueo FOR UPDATE del pedido y validación de estado OPEN
-- 4. Validación estricta de líneas y cantidades AG (enteros >= 0, al menos un AG > 0)
-- 5. Bloqueo determinista de stock_balances (ordenado por product_id ASC)
-- 6. Validación de stock disponible PRO (prohibición absoluta de stock negativo)
-- 7. Recálculo financiero real basado exclusivamente en AG > 0:
--    - subtotal_ars
--    - remittance_discount_steps (descuentos sucesivos congelados del PED)
--    - total_order_ars (pesos enteros redondeados)
--    - prior_balance_snapshot_ars (saldo actual de CUSTOMER_RECEIVABLE para clientes registrados, 0 para ML/CF)
--    - total_to_collect_ars = total_order_ars + prior_balance_snapshot_ars
--    - weight_kg_snapshot = suma(AG * weight_kg)
-- 8. Creación de business_operations (operation_type = 'SALE_RTO')
-- 9. Creación de remittances (status = 'RTM_PENDING') con snapshots de destinatario
-- 10. Creación de remittance_discount_steps
-- 11. Creación de remittance_items (solo para AG > 0)
-- 12. Descuento de stock_balances y creación de MST VENTA por cada línea enviada
-- 13. Creación de MOV VENTA en patrimonial_movements por total_order_ars
-- 14. Registro en financial_entries y actualización de financial_accounts (CUSTOMER_RECEIVABLE / CASH_MERCADO_LIBRE / CASH_STEFFEN)
-- 15. Actualización del pedido: status = 'CONVERTED', converted_rto_id = RTO.id
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_remittances_status ON public.remittances (status);
CREATE INDEX IF NOT EXISTS idx_remittances_order_id ON public.remittances (order_id);

CREATE OR REPLACE FUNCTION public.confirm_order_to_remittance_atomic(
  p_order_id UUID,
  p_business_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending_rtm_code VARCHAR;
  v_order RECORD;
  v_customer_record RECORD;
  v_business_date DATE;
  v_rto_code VARCHAR;
  v_mov_code VARCHAR;
  v_mst_code VARCHAR;
  v_op_id UUID;
  v_remittance_id UUID;
  v_mov_id UUID;
  v_account_id UUID;
  v_prior_balance_ars NUMERIC(20,6) := 0;
  v_subtotal_ars NUMERIC(20,6) := 0;
  v_total_order_ars NUMERIC(20,6) := 0;
  v_total_to_collect_ars NUMERIC(20,6) := 0;
  v_weight_kg_snapshot NUMERIC(12,3) := 0;
  v_positive_ag_count INTEGER := 0;
  v_recipient_name VARCHAR;
  v_address VARCHAR;
  v_locality VARCHAR;
  v_province VARCHAR;
  v_phone VARCHAR;
  v_transport_name VARCHAR;
  v_transport_address VARCHAR;
  v_item RECORD;
  v_req_product_ids UUID[];
  v_prod_balance RECORD;
  v_running_subtotal NUMERIC(20,6);
  v_discount_record RECORD;
  v_discount_amount NUMERIC(20,6);
  v_calculated_discounts JSONB := '[]'::JSONB;
BEGIN
  -- 1. Gate de concurrencia: lock asesor a nivel de transacción para serializar confirmaciones de RTO
  -- y proteger el invariante de un único RTM_PENDING en el ERP.
  PERFORM pg_advisory_xact_lock(hashtext('global_rtm_pending_lock'));

  -- 2. Verificar ausencia de RTM pendiente en el ERP
  SELECT code INTO v_pending_rtm_code
  FROM public.remittances
  WHERE status = 'RTM_PENDING'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Existe un remito con RTM pendiente (%). No se puede confirmar un nuevo remito hasta completar el remito de margen.', v_pending_rtm_code
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Bloquear y validar Pedido (SELECT FOR UPDATE)
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado.', p_order_id;
  END IF;

  IF v_order.status != 'OPEN' THEN
    RAISE EXCEPTION 'El pedido debe estar en estado ABIERTO para confirmarse como remito. Estado actual: %.', v_order.status;
  END IF;

  IF v_order.converted_rto_id IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido ya fue convertido previamente a remito.';
  END IF;

  -- 4. Validar que no exista remito asociado en la tabla remittances (por order_id UNIQUE)
  IF EXISTS (SELECT 1 FROM public.remittances WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Ya existe un remito generado para este pedido.';
  END IF;

  -- 5. Validar líneas de pedido y cantidades AG
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'El pedido no tiene líneas de producto.';
  END IF;

  -- Validar que TODAS las líneas tengan AG definido y >= 0
  FOR v_item IN
    SELECT oi.*, si.code as product_code, si.name as product_name
    FROM public.order_items oi
    JOIN public.stock_items si ON si.id = oi.product_id
    WHERE oi.order_id = p_order_id
    ORDER BY oi.sort_order ASC
  LOOP
    IF v_item.ag_quantity IS NULL THEN
      RAISE EXCEPTION 'Todas las líneas del pedido deben tener cantidad AG cargada. (Producto: % - %)', v_item.product_code, v_item.product_name;
    END IF;

    IF v_item.ag_quantity < 0 THEN
      RAISE EXCEPTION 'La cantidad AG no puede ser negativa. (Producto: % - %)', v_item.product_code, v_item.product_name;
    END IF;

    IF v_item.ag_quantity > 0 THEN
      v_positive_ag_count := v_positive_ag_count + 1;
    END IF;
  END LOOP;

  IF v_positive_ag_count = 0 THEN
    RAISE EXCEPTION 'Debe existir al menos una línea con cantidad AG mayor a cero para confirmar el remito.';
  END IF;

  -- 6. Bloqueo determinista y validación de stock disponible para productos con AG > 0
  -- Obtenemos IDs únicos ordenados ascendentemente para prevenir deadlocks
  SELECT ARRAY_AGG(t.product_id ORDER BY t.product_id ASC)
  INTO v_req_product_ids
  FROM (
    SELECT DISTINCT product_id
    FROM public.order_items
    WHERE order_id = p_order_id AND ag_quantity > 0
  ) t;

  -- Bloqueo FOR UPDATE determinista de stock_balances
  PERFORM 1
  FROM public.stock_balances
  WHERE stock_item_id = ANY(v_req_product_ids)
  ORDER BY stock_item_id ASC
  FOR UPDATE;

  -- Validar suficiencia de stock sumando requerimientos por producto
  FOR v_item IN
    SELECT 
      oi.product_id,
      si.code AS product_code,
      si.name AS product_name,
      SUM(oi.ag_quantity)::INTEGER AS total_ag_required
    FROM public.order_items oi
    JOIN public.stock_items si ON si.id = oi.product_id
    WHERE oi.order_id = p_order_id AND oi.ag_quantity > 0
    GROUP BY oi.product_id, si.code, si.name
  LOOP
    SELECT quantity INTO v_prod_balance
    FROM public.stock_balances
    WHERE stock_item_id = v_item.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró balance de stock para el producto % (%).', v_item.product_name, v_item.product_code;
    END IF;

    IF v_prod_balance.quantity < v_item.total_ag_required THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto % (%). Disponible: %, Requerido AG: %.',
        v_item.product_name, v_item.product_code, v_prod_balance.quantity, v_item.total_ag_required;
    END IF;
  END LOOP;

  -- 7. Calcular importes reales de venta basados exclusivamente en AG > 0
  SELECT 
    COALESCE(SUM(oi.ag_quantity * oi.unit_price_ars_snapshot), 0),
    COALESCE(SUM(oi.ag_quantity * COALESCE(p.weight_kg, 0)), 0)
  INTO v_subtotal_ars, v_weight_kg_snapshot
  FROM public.order_items oi
  JOIN public.products p ON p.stock_item_id = oi.product_id
  WHERE oi.order_id = p_order_id AND oi.ag_quantity > 0;

  -- Aplicar descuentos congelados sucesivamente
  v_running_subtotal := v_subtotal_ars;

  FOR v_discount_record IN
    SELECT position, percent
    FROM public.order_discount_steps
    WHERE order_id = p_order_id
    ORDER BY position ASC
  LOOP
    IF v_discount_record.percent > 0 THEN
      v_discount_amount := ROUND(v_running_subtotal * (v_discount_record.percent / 100.0), 6);
      v_calculated_discounts := v_calculated_discounts || jsonb_build_object(
        'position', v_discount_record.position,
        'percent', v_discount_record.percent,
        'amount_ars', v_discount_amount
      );
      v_running_subtotal := v_running_subtotal - v_discount_amount;
    END IF;
  END LOOP;

  -- Total pedido redondeado a pesos enteros sin centavos
  v_total_order_ars := ROUND(v_running_subtotal, 0);

  -- 8. Resolver cuenta de destino y saldo anterior
  IF v_order.customer_source = 'REGISTERED_CUSTOMER' THEN
    -- Obtener saldo ACTUAL de CUSTOMER_RECEIVABLE en este momento
    SELECT id, current_balance INTO v_account_id, v_prior_balance_ars
    FROM public.financial_accounts
    WHERE customer_id = v_order.customer_id AND account_type = 'CUSTOMER_RECEIVABLE'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la cuenta CUSTOMER_RECEIVABLE para el cliente registrado %.', v_order.customer_id;
    END IF;

    v_total_to_collect_ars := v_total_order_ars + v_prior_balance_ars;

    -- Datos del destinatario congelados desde cliente / orden
    SELECT name, address, locality, province, phone, transport_name, transport_address
    INTO v_customer_record
    FROM public.customers
    WHERE id = v_order.customer_id;

    v_recipient_name := v_customer_record.name;
    v_address := COALESCE(v_order.address, v_customer_record.address);
    v_locality := COALESCE(v_order.locality, v_customer_record.locality);
    v_province := COALESCE(v_order.province, v_customer_record.province);
    v_phone := COALESCE(v_order.phone, v_customer_record.phone);
    v_transport_name := COALESCE(v_order.transport_name, v_customer_record.transport_name);
    v_transport_address := COALESCE(v_order.transport_address, v_customer_record.transport_address);

  ELSIF v_order.customer_source = 'MERCADO_LIBRE' THEN
    v_prior_balance_ars := 0;
    v_total_to_collect_ars := v_total_order_ars;

    SELECT id INTO v_account_id
    FROM public.financial_accounts
    WHERE account_type = 'CASH_MERCADO_LIBRE'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la cuenta Caja Mercado Libre (CASH_MERCADO_LIBRE).';
    END IF;

    v_recipient_name := COALESCE(v_order.recipient_name, 'Mercado Libre');
    v_address := v_order.address;
    v_locality := v_order.locality;
    v_province := v_order.province;
    v_phone := v_order.phone;
    v_transport_name := v_order.transport_name;
    v_transport_address := v_order.transport_address;

  ELSIF v_order.customer_source = 'CONSUMER_FINAL' THEN
    v_prior_balance_ars := 0;
    v_total_to_collect_ars := v_total_order_ars;

    SELECT id INTO v_account_id
    FROM public.financial_accounts
    WHERE account_type = 'CASH_STEFFEN'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la cuenta Caja Steffen (CASH_STEFFEN).';
    END IF;

    v_recipient_name := v_order.recipient_name;
    v_address := v_order.address;
    v_locality := v_order.locality;
    v_province := v_order.province;
    v_phone := v_order.phone;
    v_transport_name := v_order.transport_name;
    v_transport_address := v_order.transport_address;
  END IF;

  -- 9. Fecha funcional
  IF p_business_date IS NOT NULL THEN
    v_business_date := p_business_date;
  ELSE
    v_business_date := COALESCE(v_order.business_date, CURRENT_DATE);
  END IF;

  -- 10. Generar códigos secuenciales RTO y MOV
  v_rto_code := get_next_code_sequence('RTO');
  v_mov_code := get_next_code_sequence('MOV');

  -- 11. Crear business_operation (SALE_RTO)
  INSERT INTO public.business_operations (operation_type, business_date)
  VALUES ('SALE_RTO', v_business_date)
  RETURNING id INTO v_op_id;

  -- 12. Insertar cabecera de remittances (RTO)
  INSERT INTO public.remittances (
    code,
    operation_id,
    order_id,
    status,
    customer_source,
    customer_id,
    recipient_name_snapshot,
    address_snapshot,
    locality_snapshot,
    province_snapshot,
    phone_snapshot,
    transport_name_snapshot,
    transport_address_snapshot,
    package_count_snapshot,
    weight_kg_snapshot,
    subtotal_ars,
    total_order_ars,
    prior_balance_snapshot_ars,
    total_to_collect_ars
  ) VALUES (
    v_rto_code,
    v_op_id,
    p_order_id,
    'RTM_PENDING',
    v_order.customer_source,
    v_order.customer_id,
    v_recipient_name,
    v_address,
    v_locality,
    v_province,
    v_phone,
    v_transport_name,
    v_transport_address,
    v_order.package_count,
    v_weight_kg_snapshot,
    v_subtotal_ars,
    v_total_order_ars,
    v_prior_balance_ars,
    v_total_to_collect_ars
  ) RETURNING id INTO v_remittance_id;

  -- 13. Insertar remittance_discount_steps
  INSERT INTO public.remittance_discount_steps (
    remittance_id,
    position,
    percent,
    amount_ars_snapshot
  )
  SELECT 
    v_remittance_id,
    (d->>'position')::INTEGER,
    (d->>'percent')::NUMERIC,
    (d->>'amount_ars')::NUMERIC
  FROM jsonb_array_elements(v_calculated_discounts) AS d;

  -- 14. Insertar remittance_items, descontar stock PRO y generar MST VENTA
  -- Únicamente para líneas con AG > 0
  FOR v_item IN
    SELECT 
      oi.product_id,
      oi.ag_quantity,
      oi.unit_price_ars_snapshot,
      p.presentation,
      COALESCE(p.weight_kg, 0) AS weight_kg,
      si.code AS product_code,
      si.name AS product_name
    FROM public.order_items oi
    JOIN public.products p ON p.stock_item_id = oi.product_id
    JOIN public.stock_items si ON si.id = oi.product_id
    WHERE oi.order_id = p_order_id AND oi.ag_quantity > 0
    ORDER BY oi.sort_order ASC
  LOOP
    -- Insertar ítem de remito
    INSERT INTO public.remittance_items (
      remittance_id,
      product_id,
      product_code_snapshot,
      product_name_snapshot,
      presentation_snapshot,
      weight_kg_snapshot,
      quantity_sent,
      unit_price_ars_snapshot,
      line_total_ars
    ) VALUES (
      v_remittance_id,
      v_item.product_id,
      v_item.product_code,
      v_item.product_name,
      COALESCE(v_item.presentation, ''),
      v_item.weight_kg,
      v_item.ag_quantity,
      v_item.unit_price_ars_snapshot,
      v_item.ag_quantity * v_item.unit_price_ars_snapshot
    );

    -- Descontar stock_balances
    UPDATE public.stock_balances
    SET quantity = quantity - v_item.ag_quantity,
        updated_at = NOW()
    WHERE stock_item_id = v_item.product_id;

    -- Generar código MST y registrar movimiento en stock_movements
    v_mst_code := get_next_code_sequence('MST');

    INSERT INTO public.stock_movements (
      code,
      operation_id,
      stock_item_id,
      movement_type,
      quantity_delta,
      description
    ) VALUES (
      v_mst_code,
      v_op_id,
      v_item.product_id,
      'VENTA',
      -v_item.ag_quantity,
      'Venta ' || v_rto_code || ' - ' || v_item.product_name
    );
  END LOOP;

  -- 15. Crear MOV VENTA y financial_entries
  INSERT INTO public.patrimonial_movements (
    code,
    operation_id,
    movement_type,
    description,
    amount_ars
  ) VALUES (
    v_mov_code,
    v_op_id,
    'VENTA',
    'Venta ' || v_rto_code || ' (' || COALESCE(v_recipient_name, 'Cliente') || ')',
    v_total_order_ars
  ) RETURNING id INTO v_mov_id;

  INSERT INTO public.financial_entries (
    patrimonial_movement_id,
    financial_account_id,
    delta_ars
  ) VALUES (
    v_mov_id,
    v_account_id,
    v_total_order_ars
  );

  UPDATE public.financial_accounts
  SET current_balance = current_balance + v_total_order_ars,
      updated_at = NOW()
  WHERE id = v_account_id;

  -- 16. Actualizar pedido: CONVERTED y vincular converted_rto_id
  UPDATE public.orders
  SET status = 'CONVERTED',
      converted_rto_id = v_remittance_id,
      updated_at = NOW()
  WHERE id = p_order_id;

  -- 17. Retornar resumen completo en JSONB
  RETURN jsonb_build_object(
    'remittance_id', v_remittance_id,
    'code', v_rto_code,
    'operation_id', v_op_id,
    'order_id', p_order_id,
    'status', 'RTM_PENDING',
    'customer_source', v_order.customer_source,
    'recipient_name', v_recipient_name,
    'subtotal_ars', v_subtotal_ars,
    'total_order_ars', v_total_order_ars,
    'prior_balance_snapshot_ars', v_prior_balance_ars,
    'total_to_collect_ars', v_total_to_collect_ars,
    'weight_kg_snapshot', v_weight_kg_snapshot,
    'mov_code', v_mov_code,
    'business_date', v_business_date
  );
END;
$$;

-- Permisos de seguridad para confirm_order_to_remittance_atomic
REVOKE ALL ON FUNCTION public.confirm_order_to_remittance_atomic(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_to_remittance_atomic(UUID, DATE) TO authenticated, service_role;
