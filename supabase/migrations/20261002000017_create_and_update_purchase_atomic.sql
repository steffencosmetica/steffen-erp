-- Migración 00017: RPCs atómicas para Registro y Edición de Compras (CMP)
-- Cumple con BUSINESS_RULES.md (Sección 19), DATA_MODEL.md (Secciones 29, 30, 31) y FLOWS.md (Secciones 21, 22).
--
-- 1. create_purchase_atomic:
--    - Valida proveedor activo y su moneda única inmutable.
--    - Valida ítems válidos (solo MPR y COM activos, rechaza PRO).
--    - Valida cantidades (> 0, UNIT enteras, KG hasta 3 decimales).
--    - Valida cotización obligatoria > 0 si proveedor opera en USD.
--    - Bloquea cuentas patrimoniales y stock_items de forma determinista (ORDER BY id ASC FOR UPDATE).
--    - Genera código visible seguro CMPxxxx mediante get_next_code_sequence('CMP').
--    - Crea business_operations (PURCHASE), purchases y purchase_items.
--    - Aplica incremento de stock y genera MSTxxxx mediante apply_stock_movement.
--    - Asocia o actualiza supplier_items con price_updated_at = NOW() (fuente del nuevo costo teórico actual).
--    - Según payment_mode:
--        * PAID: Disminuye Caja Steffen (CASH_STEFFEN) y genera MOV COMPRA.
--        * DEBT: Aumenta Deuda Proveedor (SUPPLIER_PAYABLE) y genera MOV COMPRA.
--
-- 2. update_purchase_atomic:
--    - Bloquea la compra existente, proveedor, cuentas contables y stock_items determinísticamente.
--    - Calcula deltas de stock por ítem.
--    - Valida que ninguna reducción de cantidad resulte en stock negativo (invariante quantity >= 0).
--    - Si stock < |delta|, rechaza atómicamente con ERRCODE = 'check_violation'.
--    - Ajusta stock_balances y ledger stock_movements (actualiza delta o añade/elimina movimientos de la compra).
--    - Reemplaza purchase_items con los renglones recalculados.
--    - Actualiza supplier_items con los nuevos precios y price_updated_at = NOW().
--    - Reversa el efecto financiero anterior y aplica el nuevo efecto sobre Caja Steffen o Deuda Proveedor.
--    - Actualiza MOV patrimonial existente, financial_entries y business_operations.business_date.
--    - Retorna el estado consolidado de la compra.

CREATE OR REPLACE FUNCTION public.create_purchase_atomic(
  p_supplier_id UUID,
  p_business_date DATE,
  p_payment_mode VARCHAR,
  p_exchange_rate_used NUMERIC,
  p_observations TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_supplier RECORD;
  v_fx_rate NUMERIC(20,6);
  v_caja_steffen_id UUID;
  v_supplier_account_id UUID;
  v_target_account_id UUID;
  v_financial_delta NUMERIC(20,6);
  v_cmp_code VARCHAR(30);
  v_operation_id UUID;
  v_purchase_id UUID;
  v_total_net_source NUMERIC(20,6) := 0;
  v_total_gross_ars NUMERIC(20,6) := 0;
  v_business_date DATE;
  v_item JSONB;
  v_stock_item_id UUID;
  v_item_type VARCHAR(10);
  v_unit_type VARCHAR(10);
  v_item_code VARCHAR(30);
  v_item_active BOOLEAN;
  v_quantity NUMERIC(20,3);
  v_unit_price_net NUMERIC(20,6);
  v_vat_rate NUMERIC(7,4);
  v_unit_price_gross_ars NUMERIC(20,6);
  v_line_total_gross_ars NUMERIC(20,6);
  v_line_total_net_source NUMERIC(20,6);
  v_sort_order INTEGER := 0;
  v_mst_res JSONB;
  v_mov_res JSONB;
  v_items_result JSONB := '[]'::JSONB;
  v_item_ids UUID[];
BEGIN
  -- 1. Validaciones básicas de entrada
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'El proveedor es obligatorio.';
  END IF;

  IF p_payment_mode NOT IN ('PAID', 'DEBT') THEN
    RAISE EXCEPTION 'Modalidad de pago inválida (%). Debe ser PAID o DEBT.', p_payment_mode;
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra debe contener al menos un ítem.';
  END IF;

  v_business_date := COALESCE(p_business_date, CURRENT_DATE);

  -- 2. Validar y bloquear proveedor
  SELECT id, name, currency_code, active INTO v_supplier
  FROM public.suppliers
  WHERE id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor % no encontrado.', p_supplier_id;
  END IF;

  IF NOT v_supplier.active THEN
    RAISE EXCEPTION 'El proveedor % está inactivo y no puede registrar nuevas compras.', v_supplier.name;
  END IF;

  -- 3. Validación de Moneda y Cotización
  IF v_supplier.currency_code = 'USD' THEN
    IF p_exchange_rate_used IS NOT NULL AND p_exchange_rate_used > 0 THEN
      v_fx_rate := p_exchange_rate_used;
    ELSE
      -- Consultar cotización global vigente si no se especificó un override
      SELECT rate_to_ars INTO v_fx_rate
      FROM public.exchange_rates
      WHERE currency_code = 'USD' AND is_current = true
      ORDER BY effective_at DESC
      LIMIT 1;

      IF v_fx_rate IS NULL OR v_fx_rate <= 0 THEN
        RAISE EXCEPTION 'El proveedor opera en USD pero no se proporcionó cotización y no existe cotización global vigente.';
      END IF;
    END IF;
  ELSE
    v_fx_rate := 1.000000;
  END IF;

  -- 4. Bloqueo determinista de Cuentas Financieras
  -- Obtener cuenta Caja Steffen
  SELECT id INTO v_caja_steffen_id
  FROM public.financial_accounts
  WHERE account_type = 'CASH_STEFFEN'
  FOR UPDATE;

  IF v_caja_steffen_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta patrimonial Caja Steffen no encontrada.';
  END IF;

  -- Obtener o asegurar cuenta corriente del proveedor
  SELECT id INTO v_supplier_account_id
  FROM public.financial_accounts
  WHERE supplier_id = p_supplier_id AND account_type = 'SUPPLIER_PAYABLE'
  FOR UPDATE;

  IF v_supplier_account_id IS NULL THEN
    INSERT INTO public.financial_accounts (
      name, account_type, supplier_id, customer_id, current_balance, active
    ) VALUES (
      'CC Proveedor - ' || v_supplier.name, 'SUPPLIER_PAYABLE', p_supplier_id, NULL, 0, true
    )
    RETURNING id INTO v_supplier_account_id;
  END IF;

  -- 5. Extraer y bloquear todos los stock_items determinísticamente (ORDER BY id ASC)
  SELECT pg_catalog.array_agg(DISTINCT (item->>'stock_item_id')::UUID ORDER BY (item->>'stock_item_id')::UUID ASC)
  INTO v_item_ids
  FROM pg_catalog.jsonb_array_elements(p_items) item;

  -- Validar que no haya duplicados indebidos en las líneas de compra
  IF pg_catalog.array_length(v_item_ids, 1) <> pg_catalog.jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'No se permite duplicar el mismo ítem en múltiples líneas de la compra.';
  END IF;

  PERFORM id
  FROM public.stock_items
  WHERE id = ANY(v_item_ids)
  ORDER BY id ASC
  FOR UPDATE;

  -- Bloquear también relaciones supplier_items existentes
  PERFORM id
  FROM public.supplier_items
  WHERE supplier_id = p_supplier_id AND stock_item_id = ANY(v_item_ids)
  ORDER BY id ASC
  FOR UPDATE;

  -- 6. Generar código visible CMPxxxx
  v_cmp_code := public.get_next_code_sequence('CMP');

  -- 7. Crear business_operations
  INSERT INTO public.business_operations (
    operation_type,
    business_date
  ) VALUES (
    'PURCHASE',
    v_business_date
  )
  RETURNING id INTO v_operation_id;

  -- 8. Validar cada ítem y calcular totales
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := (v_item->>'stock_item_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC(20,3);
    v_unit_price_net := (v_item->>'unit_price_net_source')::NUMERIC(20,6);
    v_vat_rate := COALESCE((v_item->>'vat_rate_pct')::NUMERIC(7,4), 21.0000);

    -- Validaciones de ítem
    SELECT item_type, unit_type, code, active
    INTO v_item_type, v_unit_type, v_item_code, v_item_active
    FROM public.stock_items
    WHERE id = v_stock_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ítem de stock % no encontrado.', v_stock_item_id;
    END IF;

    IF NOT v_item_active THEN
      RAISE EXCEPTION 'El ítem % (%) se encuentra inactivo.', v_item_code, v_stock_item_id;
    END IF;

    IF v_item_type NOT IN ('MPR', 'COM') THEN
      RAISE EXCEPTION 'Solo se permite comprar Materias Primas (MPR) y Componentes (COM). Ítem % es de tipo %.', v_item_code, v_item_type;
    END IF;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad del ítem % debe ser mayor a 0 (recibido %).', v_item_code, v_quantity;
    END IF;

    IF v_unit_type = 'UNIT' AND v_quantity <> pg_catalog.trunc(v_quantity) THEN
      RAISE EXCEPTION 'El ítem % es por unidad y no admite cantidades fraccionarias (%).', v_item_code, v_quantity;
    END IF;

    IF v_unit_type = 'KG' AND v_quantity <> pg_catalog.round(v_quantity, 3) THEN
      RAISE EXCEPTION 'El ítem % (KG) admite como máximo 3 decimales (%).', v_item_code, v_quantity;
    END IF;

    IF v_unit_price_net <= 0 THEN
      RAISE EXCEPTION 'El precio unitario neto del ítem % debe ser mayor a 0.', v_item_code;
    END IF;

    IF v_vat_rate < 0 THEN
      RAISE EXCEPTION 'El porcentaje de IVA no puede ser negativo.';
    END IF;

    -- Cálculos monetarios exactos
    v_unit_price_gross_ars := pg_catalog.round(
      (v_unit_price_net * v_fx_rate) * (1.000000 + (v_vat_rate / 100.0000)),
      6
    );
    v_line_total_gross_ars := pg_catalog.round(v_quantity * v_unit_price_gross_ars, 6);
    v_line_total_net_source := pg_catalog.round(v_quantity * v_unit_price_net, 6);

    v_total_net_source := v_total_net_source + v_line_total_net_source;
    v_total_gross_ars := v_total_gross_ars + v_line_total_gross_ars;
  END LOOP;

  -- 9. Insertar cabecera de Compra
  INSERT INTO public.purchases (
    code,
    operation_id,
    supplier_id,
    payment_mode,
    currency_code_snapshot,
    exchange_rate_used,
    total_net_source_currency,
    total_gross_ars,
    observations
  ) VALUES (
    v_cmp_code,
    v_operation_id,
    p_supplier_id,
    p_payment_mode,
    v_supplier.currency_code,
    CASE WHEN v_supplier.currency_code = 'USD' THEN v_fx_rate ELSE NULL END,
    v_total_net_source,
    v_total_gross_ars,
    p_observations
  )
  RETURNING id INTO v_purchase_id;

  -- 10. Insertar renglones, aplicar movimientos de stock (MST) y actualizar supplier_items
  v_sort_order := 0;
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_sort_order := v_sort_order + 1;
    v_stock_item_id := (v_item->>'stock_item_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC(20,3);
    v_unit_price_net := (v_item->>'unit_price_net_source')::NUMERIC(20,6);
    v_vat_rate := COALESCE((v_item->>'vat_rate_pct')::NUMERIC(7,4), 21.0000);

    v_unit_price_gross_ars := pg_catalog.round(
      (v_unit_price_net * v_fx_rate) * (1.000000 + (v_vat_rate / 100.0000)),
      6
    );
    v_line_total_gross_ars := pg_catalog.round(v_quantity * v_unit_price_gross_ars, 6);

    -- Insertar renglón de compra
    INSERT INTO public.purchase_items (
      purchase_id,
      stock_item_id,
      quantity,
      unit_price_net_source,
      vat_rate_pct,
      unit_price_gross_ars_snapshot,
      line_total_gross_ars,
      sort_order
    ) VALUES (
      v_purchase_id,
      v_stock_item_id,
      v_quantity,
      v_unit_price_net,
      v_vat_rate,
      v_unit_price_gross_ars,
      v_line_total_gross_ars,
      v_sort_order
    );

    -- Aplicar incremento físico de stock mediante el ledger MST
    v_mst_res := public.apply_stock_movement(
      v_operation_id,
      v_stock_item_id,
      'COMPRA',
      v_quantity,
      'Compra ' || v_cmp_code || ' - ' || v_supplier.name
    );

    -- Asociar o actualizar precio en supplier_items (con price_updated_at = NOW())
    INSERT INTO public.supplier_items (
      supplier_id,
      stock_item_id,
      quoted_unit_price_net,
      price_updated_at,
      active
    ) VALUES (
      p_supplier_id,
      v_stock_item_id,
      v_unit_price_net,
      pg_catalog.now(),
      true
    )
    ON CONFLICT (supplier_id, stock_item_id) DO UPDATE
    SET quoted_unit_price_net = EXCLUDED.quoted_unit_price_net,
        price_updated_at = EXCLUDED.price_updated_at,
        active = true,
        updated_at = pg_catalog.now();

    v_items_result := v_items_result || pg_catalog.jsonb_build_object(
      'stock_item_id', v_stock_item_id,
      'quantity', v_quantity,
      'unit_price_net_source', v_unit_price_net,
      'unit_price_gross_ars', v_unit_price_gross_ars,
      'line_total_gross_ars', v_line_total_gross_ars,
      'mst_code', v_mst_res->>'code'
    );
  END LOOP;

  -- 11. Registrar efecto patrimonial según modalidad
  IF p_payment_mode = 'PAID' THEN
    v_target_account_id := v_caja_steffen_id;
    v_financial_delta := -v_total_gross_ars;
  ELSE
    v_target_account_id := v_supplier_account_id;
    v_financial_delta := v_total_gross_ars;
  END IF;

  v_mov_res := public.post_patrimonial_movement(
    v_operation_id,
    'COMPRA',
    'Compra ' || v_cmp_code || ' - ' || v_supplier.name,
    v_total_gross_ars,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'financial_account_id', v_target_account_id,
        'delta_ars', v_financial_delta
      )
    )
  );

  -- 12. Retornar DTO de resultado completo
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'code', v_cmp_code,
    'operation_id', v_operation_id,
    'business_date', v_business_date,
    'supplier_id', p_supplier_id,
    'supplier_name', v_supplier.name,
    'payment_mode', p_payment_mode,
    'currency_code', v_supplier.currency_code,
    'exchange_rate_used', CASE WHEN v_supplier.currency_code = 'USD' THEN v_fx_rate ELSE NULL END,
    'total_net_source_currency', v_total_net_source::text,
    'total_gross_ars', v_total_gross_ars::text,
    'patrimonial_movement_code', v_mov_res->>'code',
    'items', v_items_result
  );
END;
$$;

-- 2. Edición atómica de Compra
CREATE OR REPLACE FUNCTION public.update_purchase_atomic(
  p_purchase_id UUID,
  p_business_date DATE,
  p_payment_mode VARCHAR,
  p_exchange_rate_used NUMERIC,
  p_observations TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_purchase RECORD;
  v_supplier RECORD;
  v_fx_rate NUMERIC(20,6);
  v_caja_steffen_id UUID;
  v_supplier_account_id UUID;
  v_business_date DATE;
  v_mov RECORD;
  v_item JSONB;
  v_stock_item_id UUID;
  v_item_type VARCHAR(10);
  v_unit_type VARCHAR(10);
  v_item_code VARCHAR(30);
  v_item_active BOOLEAN;
  v_quantity NUMERIC(20,3);
  v_unit_price_net NUMERIC(20,6);
  v_vat_rate NUMERIC(7,4);
  v_unit_price_gross_ars NUMERIC(20,6);
  v_line_total_gross_ars NUMERIC(20,6);
  v_line_total_net_source NUMERIC(20,6);
  v_total_net_source NUMERIC(20,6) := 0;
  v_total_gross_ars NUMERIC(20,6) := 0;
  v_sort_order INTEGER := 0;
  v_old_items_count INTEGER;
  v_new_item_ids UUID[];
  v_all_item_ids UUID[];
  v_target_account_id UUID;
  v_new_delta_ars NUMERIC(20,6);
  v_item_cur RECORD;
  v_old_qty NUMERIC(20,3);
  v_new_qty NUMERIC(20,3);
  v_qty_delta NUMERIC(20,3);
  v_cur_balance NUMERIC(20,3);
  v_mst_code VARCHAR(30);
  v_items_result JSONB := '[]'::JSONB;
BEGIN
  -- 1. Validaciones básicas
  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'El identificador de la compra es obligatorio.';
  END IF;

  IF p_payment_mode NOT IN ('PAID', 'DEBT') THEN
    RAISE EXCEPTION 'Modalidad de pago inválida (%). Debe ser PAID o DEBT.', p_payment_mode;
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra debe contener al menos un ítem.';
  END IF;

  v_business_date := COALESCE(p_business_date, CURRENT_DATE);

  -- 2. Bloquear compra y proveedor
  SELECT * INTO v_old_purchase
  FROM public.purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra % no encontrada.', p_purchase_id;
  END IF;

  SELECT id, name, currency_code, active INTO v_supplier
  FROM public.suppliers
  WHERE id = v_old_purchase.supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor de la compra no encontrado.';
  END IF;

  -- 3. Cotización y Moneda
  IF v_supplier.currency_code = 'USD' THEN
    IF p_exchange_rate_used IS NOT NULL AND p_exchange_rate_used > 0 THEN
      v_fx_rate := p_exchange_rate_used;
    ELSE
      SELECT rate_to_ars INTO v_fx_rate
      FROM public.exchange_rates
      WHERE currency_code = 'USD' AND is_current = true
      ORDER BY effective_at DESC
      LIMIT 1;

      IF v_fx_rate IS NULL OR v_fx_rate <= 0 THEN
        RAISE EXCEPTION 'Para compras en USD debe especificarse una cotización válida mayor a 0.';
      END IF;
    END IF;
  ELSE
    v_fx_rate := 1.000000;
  END IF;

  -- 4. Bloqueo determinista de Cuentas Financieras
  SELECT id INTO v_caja_steffen_id
  FROM public.financial_accounts
  WHERE account_type = 'CASH_STEFFEN'
  FOR UPDATE;

  SELECT id INTO v_supplier_account_id
  FROM public.financial_accounts
  WHERE supplier_id = v_old_purchase.supplier_id AND account_type = 'SUPPLIER_PAYABLE'
  FOR UPDATE;

  -- 5. Extraer y bloquear todos los stock_items (unión de antiguos y nuevos) determinísticamente
  SELECT pg_catalog.array_agg(DISTINCT (item->>'stock_item_id')::UUID ORDER BY (item->>'stock_item_id')::UUID ASC)
  INTO v_new_item_ids
  FROM pg_catalog.jsonb_array_elements(p_items) item;

  IF pg_catalog.array_length(v_new_item_ids, 1) <> pg_catalog.jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'No se permite duplicar el mismo ítem en múltiples líneas de la compra.';
  END IF;

  SELECT pg_catalog.array_agg(DISTINCT id ORDER BY id ASC)
  INTO v_all_item_ids
  FROM (
    SELECT stock_item_id AS id FROM public.purchase_items WHERE purchase_id = p_purchase_id
    UNION
    SELECT unnest(v_new_item_ids) AS id
  ) t;

  PERFORM id
  FROM public.stock_items
  WHERE id = ANY(v_all_item_ids)
  ORDER BY id ASC
  FOR UPDATE;

  PERFORM stock_item_id
  FROM public.stock_balances
  WHERE stock_item_id = ANY(v_all_item_ids)
  ORDER BY stock_item_id ASC
  FOR UPDATE;

  -- 6. Validar datos de los nuevos ítems
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := (v_item->>'stock_item_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC(20,3);
    v_unit_price_net := (v_item->>'unit_price_net_source')::NUMERIC(20,6);
    v_vat_rate := COALESCE((v_item->>'vat_rate_pct')::NUMERIC(7,4), 21.0000);

    SELECT item_type, unit_type, code, active
    INTO v_item_type, v_unit_type, v_item_code, v_item_active
    FROM public.stock_items
    WHERE id = v_stock_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ítem de stock % no encontrado.', v_stock_item_id;
    END IF;

    IF v_item_type NOT IN ('MPR', 'COM') THEN
      RAISE EXCEPTION 'Solo se permite comprar Materias Primas (MPR) y Componentes (COM).';
    END IF;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad del ítem % debe ser mayor a 0.', v_item_code;
    END IF;

    IF v_unit_type = 'UNIT' AND v_quantity <> pg_catalog.trunc(v_quantity) THEN
      RAISE EXCEPTION 'El ítem % es por unidad y no admite cantidades fraccionarias (%).', v_item_code, v_quantity;
    END IF;

    IF v_unit_type = 'KG' AND v_quantity <> pg_catalog.round(v_quantity, 3) THEN
      RAISE EXCEPTION 'El ítem % (KG) admite como máximo 3 decimales (%).', v_item_code, v_quantity;
    END IF;

    IF v_unit_price_net <= 0 THEN
      RAISE EXCEPTION 'El precio unitario neto del ítem % debe ser mayor a 0.', v_item_code;
    END IF;

    v_unit_price_gross_ars := pg_catalog.round(
      (v_unit_price_net * v_fx_rate) * (1.000000 + (v_vat_rate / 100.0000)),
      6
    );
    v_line_total_gross_ars := pg_catalog.round(v_quantity * v_unit_price_gross_ars, 6);
    v_line_total_net_source := pg_catalog.round(v_quantity * v_unit_price_net, 6);

    v_total_net_source := v_total_net_source + v_line_total_net_source;
    v_total_gross_ars := v_total_gross_ars + v_line_total_gross_ars;
  END LOOP;

  -- 7. Determinar deltas de stock y validar PROHIBICIÓN DE STOCK NEGATIVO
  -- Crear tabla temporal en memoria para mapear cantidades anteriores y nuevas
  CREATE TEMPORARY TABLE _tmp_stock_deltas (
    stock_item_id UUID PRIMARY KEY,
    old_qty NUMERIC(20,3) NOT NULL DEFAULT 0,
    new_qty NUMERIC(20,3) NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  -- Cargar cantidades viejas
  INSERT INTO _tmp_stock_deltas (stock_item_id, old_qty)
  SELECT stock_item_id, quantity
  FROM public.purchase_items
  WHERE purchase_id = p_purchase_id;

  -- Cargar cantidades nuevas
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := (v_item->>'stock_item_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC(20,3);

    INSERT INTO _tmp_stock_deltas (stock_item_id, new_qty)
    VALUES (v_stock_item_id, v_quantity)
    ON CONFLICT (stock_item_id) DO UPDATE
    SET new_qty = EXCLUDED.new_qty;
  END LOOP;

  -- Validar regla de no negatividad para cada ítem con delta negativo
  FOR v_item_cur IN SELECT * FROM _tmp_stock_deltas
  LOOP
    v_qty_delta := v_item_cur.new_qty - v_item_cur.old_qty;

    SELECT COALESCE(quantity, 0) INTO v_cur_balance
    FROM public.stock_balances
    WHERE stock_item_id = v_item_cur.stock_item_id;

    IF (v_cur_balance + v_qty_delta) < 0 THEN
      SELECT code INTO v_item_code FROM public.stock_items WHERE id = v_item_cur.stock_item_id;
      RAISE EXCEPTION 'Stock insuficiente para reducir la compra del ítem % (código %): saldo actual %, retiro requerido % (resultaría en saldo negativo %).',
        v_item_cur.stock_item_id, v_item_code, v_cur_balance, pg_catalog.abs(v_qty_delta), (v_cur_balance + v_qty_delta)
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- 8. Aplicar deltas a stock_balances y sincronizar ledger stock_movements
  FOR v_item_cur IN SELECT * FROM _tmp_stock_deltas
  LOOP
    v_qty_delta := v_item_cur.new_qty - v_item_cur.old_qty;

    IF v_qty_delta <> 0 THEN
      UPDATE public.stock_balances
      SET quantity = quantity + v_qty_delta,
          updated_at = pg_catalog.now()
      WHERE stock_item_id = v_item_cur.stock_item_id;

      IF NOT FOUND THEN
        INSERT INTO public.stock_balances (stock_item_id, quantity, updated_at)
        VALUES (v_item_cur.stock_item_id, v_qty_delta, pg_catalog.now());
      END IF;
    END IF;

    -- Movimientos MST:
    IF v_item_cur.old_qty > 0 AND v_item_cur.new_qty > 0 THEN
      -- Ítem persiste con cantidad modificada: actualizar el movimiento original
      UPDATE public.stock_movements
      SET quantity_delta = v_item_cur.new_qty,
          description = 'Compra ' || v_old_purchase.code || ' - ' || v_supplier.name || ' (editada)'
      WHERE operation_id = v_old_purchase.operation_id
        AND stock_item_id = v_item_cur.stock_item_id;
    ELSIF v_item_cur.old_qty = 0 AND v_item_cur.new_qty > 0 THEN
      -- Ítem nuevo agregado a la compra: generar nuevo MST
      v_mst_code := public.get_next_code_sequence('MST');
      INSERT INTO public.stock_movements (
        code,
        operation_id,
        stock_item_id,
        movement_type,
        quantity_delta,
        description
      ) VALUES (
        v_mst_code,
        v_old_purchase.operation_id,
        v_item_cur.stock_item_id,
        'COMPRA',
        v_item_cur.new_qty,
        'Compra ' || v_old_purchase.code || ' - ' || v_supplier.name || ' (ítem agregado)'
      );
    ELSIF v_item_cur.old_qty > 0 AND v_item_cur.new_qty = 0 THEN
      -- Ítem retirado de la compra: eliminar su movimiento de esta operación
      DELETE FROM public.stock_movements
      WHERE operation_id = v_old_purchase.operation_id
        AND stock_item_id = v_item_cur.stock_item_id;
    END IF;
  END LOOP;

  -- 9. Reemplazar líneas de purchase_items
  DELETE FROM public.purchase_items WHERE purchase_id = p_purchase_id;

  v_sort_order := 0;
  FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    v_sort_order := v_sort_order + 1;
    v_stock_item_id := (v_item->>'stock_item_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC(20,3);
    v_unit_price_net := (v_item->>'unit_price_net_source')::NUMERIC(20,6);
    v_vat_rate := COALESCE((v_item->>'vat_rate_pct')::NUMERIC(7,4), 21.0000);

    v_unit_price_gross_ars := pg_catalog.round(
      (v_unit_price_net * v_fx_rate) * (1.000000 + (v_vat_rate / 100.0000)),
      6
    );
    v_line_total_gross_ars := pg_catalog.round(v_quantity * v_unit_price_gross_ars, 6);

    INSERT INTO public.purchase_items (
      purchase_id,
      stock_item_id,
      quantity,
      unit_price_net_source,
      vat_rate_pct,
      unit_price_gross_ars_snapshot,
      line_total_gross_ars,
      sort_order
    ) VALUES (
      p_purchase_id,
      v_stock_item_id,
      v_quantity,
      v_unit_price_net,
      v_vat_rate,
      v_unit_price_gross_ars,
      v_line_total_gross_ars,
      v_sort_order
    );

    -- Actualizar precio de proveedor y price_updated_at
    INSERT INTO public.supplier_items (
      supplier_id,
      stock_item_id,
      quoted_unit_price_net,
      price_updated_at,
      active
    ) VALUES (
      v_old_purchase.supplier_id,
      v_stock_item_id,
      v_unit_price_net,
      pg_catalog.now(),
      true
    )
    ON CONFLICT (supplier_id, stock_item_id) DO UPDATE
    SET quoted_unit_price_net = EXCLUDED.quoted_unit_price_net,
        price_updated_at = EXCLUDED.price_updated_at,
        active = true,
        updated_at = pg_catalog.now();

    v_items_result := v_items_result || pg_catalog.jsonb_build_object(
      'stock_item_id', v_stock_item_id,
      'quantity', v_quantity,
      'unit_price_net_source', v_unit_price_net,
      'unit_price_gross_ars', v_unit_price_gross_ars,
      'line_total_gross_ars', v_line_total_gross_ars
    );
  END LOOP;

  -- 10. Recalcular y reajustar efectos financieros
  -- Obtener MOV patrimonial original
  SELECT id INTO v_mov
  FROM public.patrimonial_movements
  WHERE operation_id = v_old_purchase.operation_id;

  -- 10.1 Revertir efecto anterior
  IF v_old_purchase.payment_mode = 'PAID' THEN
    UPDATE public.financial_accounts
    SET current_balance = current_balance + v_old_purchase.total_gross_ars,
        updated_at = pg_catalog.now()
    WHERE id = v_caja_steffen_id;
  ELSE
    UPDATE public.financial_accounts
    SET current_balance = current_balance - v_old_purchase.total_gross_ars,
        updated_at = pg_catalog.now()
    WHERE id = v_supplier_account_id;
  END IF;

  -- 10.2 Aplicar nuevo efecto
  IF p_payment_mode = 'PAID' THEN
    UPDATE public.financial_accounts
    SET current_balance = current_balance - v_total_gross_ars,
        updated_at = pg_catalog.now()
    WHERE id = v_caja_steffen_id;
    v_target_account_id := v_caja_steffen_id;
    v_new_delta_ars := -v_total_gross_ars;
  ELSE
    UPDATE public.financial_accounts
    SET current_balance = current_balance + v_total_gross_ars,
        updated_at = pg_catalog.now()
    WHERE id = v_supplier_account_id;
    v_target_account_id := v_supplier_account_id;
    v_new_delta_ars := v_total_gross_ars;
  END IF;

  -- 10.3 Actualizar cabecera MOV y financial_entries
  IF v_mov.id IS NOT NULL THEN
    UPDATE public.patrimonial_movements
    SET amount_ars = v_total_gross_ars,
        description = 'Compra ' || v_old_purchase.code || ' - ' || v_supplier.name
    WHERE id = v_mov.id;

    DELETE FROM public.financial_entries
    WHERE patrimonial_movement_id = v_mov.id;

    INSERT INTO public.financial_entries (
      patrimonial_movement_id,
      financial_account_id,
      delta_ars
    ) VALUES (
      v_mov.id,
      v_target_account_id,
      v_new_delta_ars
    );
  END IF;

  -- 11. Actualizar purchases y business_operations
  UPDATE public.purchases
  SET payment_mode = p_payment_mode,
      exchange_rate_used = CASE WHEN v_supplier.currency_code = 'USD' THEN v_fx_rate ELSE NULL END,
      total_net_source_currency = v_total_net_source,
      total_gross_ars = v_total_gross_ars,
      observations = p_observations,
      updated_at = pg_catalog.now()
  WHERE id = p_purchase_id;

  UPDATE public.business_operations
  SET business_date = v_business_date,
      updated_at = pg_catalog.now()
  WHERE id = v_old_purchase.operation_id;

  -- 12. Retornar DTO de resultado
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'code', v_old_purchase.code,
    'operation_id', v_old_purchase.operation_id,
    'business_date', v_business_date,
    'supplier_id', v_old_purchase.supplier_id,
    'supplier_name', v_supplier.name,
    'payment_mode', p_payment_mode,
    'currency_code', v_supplier.currency_code,
    'exchange_rate_used', CASE WHEN v_supplier.currency_code = 'USD' THEN v_fx_rate ELSE NULL END,
    'total_net_source_currency', v_total_net_source::text,
    'total_gross_ars', v_total_gross_ars::text,
    'items', v_items_result
  );
END;
$$;

-- 3. Seguridad RPC: Revocar de roles anónimos/autenticados y otorgar exclusivamente a service_role
REVOKE ALL ON FUNCTION public.create_purchase_atomic(UUID, DATE, VARCHAR, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_atomic(UUID, DATE, VARCHAR, NUMERIC, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.update_purchase_atomic(UUID, DATE, VARCHAR, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_purchase_atomic(UUID, DATE, VARCHAR, NUMERIC, TEXT, JSONB) TO service_role;
