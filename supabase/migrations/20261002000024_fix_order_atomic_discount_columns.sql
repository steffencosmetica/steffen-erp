-- ============================================================================
-- MIGRACIÓN: 20261002000024_fix_order_atomic_discount_columns.sql
-- Corrección de nombres de columnas de descuentos de clientes en create_order_atomic:
-- discount_1_pct, discount_2_pct, discount_3_pct.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_source VARCHAR;
  v_customer_id UUID;
  v_business_date DATE;
  v_recipient_name VARCHAR;
  v_address VARCHAR;
  v_locality VARCHAR;
  v_province VARCHAR;
  v_phone VARCHAR;
  v_transport_name VARCHAR;
  v_transport_address VARCHAR;
  v_package_count INTEGER;
  v_manual_discount NUMERIC(7,4);
  v_price_list_id UUID;
  v_price_list_name VARCHAR;
  v_price_snapshot_at TIMESTAMPTZ;
  v_code VARCHAR;
  v_sort_key NUMERIC(20,6);
  v_order_id UUID;
  v_customer_record RECORD;
  v_item RECORD;
  v_prod_id UUID;
  v_req_qty INTEGER;
  v_ag_qty INTEGER;
  v_product_record RECORD;
  v_unit_price NUMERIC(20,0);
  v_idx INTEGER := 0;
BEGIN
  -- 1. Parsear datos principales
  v_customer_source := p_order_json->>'customer_source';
  IF v_customer_source NOT IN ('REGISTERED_CUSTOMER', 'MERCADO_LIBRE', 'CONSUMER_FINAL') THEN
    RAISE EXCEPTION 'Origen de cliente inválido: %.', v_customer_source;
  END IF;

  IF p_order_json ? 'business_date' AND p_order_json->>'business_date' IS NOT NULL THEN
    v_business_date := (p_order_json->>'business_date')::DATE;
  ELSE
    v_business_date := CURRENT_DATE;
  END IF;

  v_recipient_name := NULLIF(TRIM(p_order_json->>'recipient_name'), '');
  v_address := NULLIF(TRIM(p_order_json->>'address'), '');
  v_locality := NULLIF(TRIM(p_order_json->>'locality'), '');
  v_province := NULLIF(TRIM(p_order_json->>'province'), '');
  v_phone := NULLIF(TRIM(p_order_json->>'phone'), '');
  v_transport_name := NULLIF(TRIM(p_order_json->>'transport_name'), '');
  v_transport_address := NULLIF(TRIM(p_order_json->>'transport_address'), '');

  IF p_order_json ? 'package_count' AND p_order_json->>'package_count' IS NOT NULL AND p_order_json->>'package_count' <> '' THEN
    v_package_count := (p_order_json->>'package_count')::INTEGER;
    IF v_package_count < 0 THEN
      RAISE EXCEPTION 'La cantidad de bultos no puede ser negativa.';
    END IF;
  ELSE
    v_package_count := NULL;
  END IF;

  IF p_order_json ? 'manual_discount_percent' AND p_order_json->>'manual_discount_percent' IS NOT NULL AND p_order_json->>'manual_discount_percent' <> '' THEN
    v_manual_discount := (p_order_json->>'manual_discount_percent')::NUMERIC;
    IF v_manual_discount < 0 OR v_manual_discount > 100 THEN
      RAISE EXCEPTION 'El porcentaje de descuento debe estar entre 0 y 100.';
    END IF;
  ELSE
    v_manual_discount := 0;
  END IF;

  -- 2. Resolver origen y lista de precios
  IF v_customer_source = 'REGISTERED_CUSTOMER' THEN
    IF NOT (p_order_json ? 'customer_id') OR p_order_json->>'customer_id' IS NULL THEN
      RAISE EXCEPTION 'El cliente es obligatorio para pedidos de cliente registrado.';
    END IF;
    v_customer_id := (p_order_json->>'customer_id')::UUID;

    SELECT id, name, code, discount_1_pct, discount_2_pct, discount_3_pct, active
    INTO v_customer_record
    FROM public.customers
    WHERE id = v_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente % no encontrado.', v_customer_id;
    END IF;

    SELECT id, name INTO v_price_list_id, v_price_list_name
    FROM public.price_lists
    WHERE system_role = 'SALON_DEFAULT' AND active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la lista de precios predeterminada para Salón (SALON_DEFAULT).';
    END IF;

  ELSIF v_customer_source = 'MERCADO_LIBRE' THEN
    v_customer_id := NULL;

    SELECT id, name INTO v_price_list_id, v_price_list_name
    FROM public.price_lists
    WHERE system_role = 'ECOMMERCE_DEFAULT' AND active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la lista de precios predeterminada para Ecommerce (ECOMMERCE_DEFAULT).';
    END IF;

  ELSIF v_customer_source = 'CONSUMER_FINAL' THEN
    v_customer_id := NULL;

    SELECT id, name INTO v_price_list_id, v_price_list_name
    FROM public.price_lists
    WHERE system_role = 'PUBLIC_DEFAULT' AND active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se encontró la lista de precios predeterminada para Público (PUBLIC_DEFAULT).';
    END IF;
  END IF;

  -- 3. Validar productos en payload
  IF NOT (p_order_json ? 'items') OR jsonb_array_length(p_order_json->'items') = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
  END IF;

  -- 4. Timestamp de congelamiento de precios
  v_price_snapshot_at := NOW();

  -- 5. Generar código PED y orden de planificación
  v_code := get_next_code_sequence('PED');

  SELECT COALESCE(MAX(planning_sort_key), 0) + 1
  INTO v_sort_key
  FROM public.orders
  WHERE status = 'OPEN';

  -- 6. Insertar cabecera de pedido
  INSERT INTO public.orders (
    code,
    business_date,
    status,
    customer_source,
    customer_id,
    price_list_id,
    price_snapshot_at,
    recipient_name,
    address,
    locality,
    province,
    phone,
    transport_name,
    transport_address,
    package_count,
    planning_sort_key
  ) VALUES (
    v_code,
    v_business_date,
    'OPEN',
    v_customer_source,
    v_customer_id,
    v_price_list_id,
    v_price_snapshot_at,
    v_recipient_name,
    v_address,
    v_locality,
    v_province,
    v_phone,
    v_transport_name,
    v_transport_address,
    v_package_count,
    v_sort_key
  ) RETURNING id INTO v_order_id;

  -- 7. Congelar descuentos en order_discount_steps
  IF v_customer_source = 'REGISTERED_CUSTOMER' THEN
    IF COALESCE(v_customer_record.discount_1_pct, 0) > 0 THEN
      INSERT INTO public.order_discount_steps (order_id, position, percent)
      VALUES (v_order_id, 1, v_customer_record.discount_1_pct);
    END IF;
    IF COALESCE(v_customer_record.discount_2_pct, 0) > 0 THEN
      INSERT INTO public.order_discount_steps (order_id, position, percent)
      VALUES (v_order_id, 2, v_customer_record.discount_2_pct);
    END IF;
    IF COALESCE(v_customer_record.discount_3_pct, 0) > 0 THEN
      INSERT INTO public.order_discount_steps (order_id, position, percent)
      VALUES (v_order_id, 3, v_customer_record.discount_3_pct);
    END IF;
  ELSE
    IF v_manual_discount > 0 THEN
      INSERT INTO public.order_discount_steps (order_id, position, percent)
      VALUES (v_order_id, 1, v_manual_discount);
    END IF;
  END IF;

  -- 8. Validar e insertar renglones (order_items)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_json->'items') AS x(
    product_id UUID,
    requested_quantity INTEGER,
    ag_quantity INTEGER
  )
  LOOP
    v_idx := v_idx + 1;
    v_prod_id := v_item.product_id;
    v_req_qty := v_item.requested_quantity;
    v_ag_qty := v_item.ag_quantity;

    IF v_req_qty IS NULL OR v_req_qty <= 0 THEN
      RAISE EXCEPTION 'La cantidad solicitada debe ser mayor a 0.';
    END IF;

    IF v_ag_qty IS NOT NULL AND v_ag_qty < 0 THEN
      RAISE EXCEPTION 'La cantidad AG no puede ser negativa.';
    END IF;

    -- Validar existencia de PRO activo
    SELECT p.stock_item_id, si.name, si.active
    INTO v_product_record
    FROM public.products p
    JOIN public.stock_items si ON si.id = p.stock_item_id
    WHERE p.stock_item_id = v_prod_id;

    IF NOT FOUND OR NOT v_product_record.active THEN
      RAISE EXCEPTION 'Producto % no encontrado o inactivo.', v_prod_id;
    END IF;

    -- Obtener precio vigente en la lista al momento del congelamiento
    SELECT price_ars
    INTO v_unit_price
    FROM public.product_price_versions
    WHERE price_list_id = v_price_list_id
      AND product_id = v_prod_id
      AND valid_from <= v_price_snapshot_at
      AND (valid_to IS NULL OR valid_to > v_price_snapshot_at)
    ORDER BY valid_from DESC
    LIMIT 1;

    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
      RAISE EXCEPTION 'El producto % no posee precio vigente en la lista correspondiente.', v_product_record.name;
    END IF;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      requested_quantity,
      ag_quantity,
      unit_price_ars_snapshot,
      sort_order
    ) VALUES (
      v_order_id,
      v_prod_id,
      v_req_qty,
      v_ag_qty,
      v_unit_price,
      v_idx
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'code', v_code,
    'status', 'OPEN',
    'price_snapshot_at', v_price_snapshot_at,
    'business_date', v_business_date
  );
END;
$$;
