-- ============================================================================
-- MIGRACIÓN: 20261002000035_global_usd_exchange_rate_write.sql
-- COTIZACIÓN GLOBAL USD → ARS: escritura atómica y auditable
--
-- Reutiliza la estructura existente (sin tablas nuevas):
-- - exchange_rates (20261002000001): historial, rate_to_ars NUMERIC(20,6) CHECK > 0,
--   effective_at / created_at, is_current;
-- - idx_exchange_rates_current (20261002000002): máximo UNA vigente por moneda;
-- - RLS habilitado y acceso solo service_role (20261002000007).
--
-- Agrega únicamente el flujo de escritura que faltaba:
--   set_current_exchange_rate_atomic(p_currency_code, p_rate_to_ars)
--   1. valida moneda (solo USD) y cotización > 0 con a lo sumo 6 decimales (sin redondeo);
--   2. serializa actualizaciones concurrentes de la misma moneda;
--   3. la vigente anterior deja de ser vigente (se conserva en el historial);
--   4. inserta la nueva como vigente (effective_at = now()).
--
-- No toca compras: purchases.exchange_rate_used es snapshot histórico y no se reescribe.
-- Replay-safe (CREATE OR REPLACE). Compatible con base nueva (34 previas) y con dev.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_current_exchange_rate_atomic(
  p_currency_code VARCHAR,
  p_rate_to_ars NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_rate NUMERIC(20,6);
  v_new_id UUID;
  v_effective_at TIMESTAMPTZ;
BEGIN
  IF p_currency_code IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION 'Solo se admite cotización global para USD (recibido: %).', p_currency_code;
  END IF;

  IF p_rate_to_ars IS NULL OR p_rate_to_ars <= 0 THEN
    RAISE EXCEPTION 'La cotización debe ser mayor a cero.';
  END IF;

  IF p_rate_to_ars <> ROUND(p_rate_to_ars, 6) THEN
    RAISE EXCEPTION 'La cotización admite como máximo 6 decimales (%).', p_rate_to_ars;
  END IF;

  IF p_rate_to_ars >= 100000000000000 THEN
    RAISE EXCEPTION 'La cotización excede el máximo admitido (%).', p_rate_to_ars;
  END IF;

  -- Serializa actualizaciones concurrentes de la misma moneda (también la primera, sin fila previa)
  PERFORM pg_advisory_xact_lock(hashtext('exchange_rates:' || p_currency_code));

  UPDATE public.exchange_rates
  SET is_current = false
  WHERE currency_code = p_currency_code
    AND is_current = true
  RETURNING rate_to_ars INTO v_previous_rate;

  INSERT INTO public.exchange_rates (currency_code, rate_to_ars, effective_at, is_current)
  VALUES (p_currency_code, p_rate_to_ars, NOW(), true)
  RETURNING id, effective_at INTO v_new_id, v_effective_at;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'currency_code', p_currency_code,
    'rate_to_ars', p_rate_to_ars::NUMERIC(20,6)::text,
    'previous_rate_to_ars', v_previous_rate::text,
    'effective_at', v_effective_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_current_exchange_rate_atomic(VARCHAR, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_exchange_rate_atomic(VARCHAR, NUMERIC) TO service_role;
