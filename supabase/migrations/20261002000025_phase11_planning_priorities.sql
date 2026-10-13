-- ============================================================================
-- MIGRACIÓN: 20261002000025_phase11_planning_priorities.sql
-- FASE 11 — PLANIFICACIÓN DE PEDIDOS: REORDENAMIENTO ATÓMICO DE PRIORIDADES
--
-- Reglas normativas:
-- 1. Prioridad de filas: planning_product_priorities (sort_key NUMERIC).
--    Persistente e independiente de si el producto tiene pedidos abiertos.
-- 2. Prioridad de columnas: orders.planning_sort_key (sort_key NUMERIC).
--    Persistente para pedidos abiertos (status = 'OPEN').
-- 3. Reordenamiento atómico mediante RPCs SECURITY DEFINER.
-- 4. No altera stock, no genera movimientos patrimoniales ni de inventario.
-- ============================================================================

-- 1. RPC para actualizar prioridades de productos (filas de planificación)
CREATE OR REPLACE FUNCTION public.update_planning_product_priorities(
  p_product_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_len INTEGER;
  v_i INTEGER;
BEGIN
  IF p_product_ids IS NULL THEN
    RETURN;
  END IF;

  v_len := array_length(p_product_ids, 1);
  IF v_len IS NULL OR v_len = 0 THEN
    RETURN;
  END IF;

  FOR v_i IN 1..v_len LOOP
    INSERT INTO public.planning_product_priorities (
      product_id,
      sort_key,
      updated_at
    ) VALUES (
      p_product_ids[v_i],
      v_i,
      NOW()
    )
    ON CONFLICT (product_id)
    DO UPDATE SET
      sort_key = v_i,
      updated_at = NOW();
  END LOOP;
END;
$$;

-- 2. RPC para actualizar prioridades de pedidos (columnas de planificación)
CREATE OR REPLACE FUNCTION public.update_planning_order_priorities(
  p_order_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_len INTEGER;
  v_i INTEGER;
BEGIN
  IF p_order_ids IS NULL THEN
    RETURN;
  END IF;

  v_len := array_length(p_order_ids, 1);
  IF v_len IS NULL OR v_len = 0 THEN
    RETURN;
  END IF;

  FOR v_i IN 1..v_len LOOP
    UPDATE public.orders
    SET
      planning_sort_key = v_i,
      updated_at = NOW()
    WHERE id = p_order_ids[v_i]
      AND status = 'OPEN';
  END LOOP;
END;
$$;

-- 3. Otorgar permisos a authenticated y service_role
GRANT EXECUTE ON FUNCTION public.update_planning_product_priorities(UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_planning_order_priorities(UUID[]) TO authenticated, service_role;
