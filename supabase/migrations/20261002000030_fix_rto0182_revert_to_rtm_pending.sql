-- ============================================================================
-- MIGRACIÓN CORRECTIVA (REPLAY-SAFE): 20261002000030_fix_rto0182_revert_to_rtm_pending.sql
-- FASE 13 — REPARACIÓN PUNTUAL DE RTO0182
--
-- Incidente: la suite de tests tests/margin-remittance.test.ts tenía un helper
-- de limpieza de gate (heredado del patrón de tests/remittance.test.ts) que
-- ejecutaba:
--   UPDATE remittances SET status = 'COMPLETED' WHERE status = 'RTM_PENDING'
-- SIN filtrar por los remitos propios de la suite. En su primera corrida
-- (fallida por una validación de BOM en la creación de fixtures, antes de que
-- la suite llegara a crear ningún remito propio), ese UPDATE alcanzó también
-- a RTO0182 -- un remito real generado durante el smoke manual de Fase 12 --
-- marcándolo COMPLETED sin que jamás se haya generado un RTM real para él.
--
-- Esta migración repara EXCLUSIVAMENTE ese remito, identificado por su UUID
-- exacto (no por LIKE ni por code en aislado), revirtiendo únicamente:
--   COMPLETED -> RTM_PENDING
-- No modifica snapshots, stock, MST, MOV VENTA ni cuentas: únicamente la
-- columna `status` de esa única fila de `remittances`.
--
-- NOTA DE EXCEPCIÓN A LA REGLA "nunca editar una migración ya aplicada":
-- Esta es una reparación de DATOS de un incidente puntual de desarrollo, no un
-- cambio de esquema, ligada a un UUID que solo existe en la base donde ocurrió
-- el incidente. Se reescribió a forma replay-safe ANTES de que este archivo
-- fuera commiteado/pusheado al repositorio (ya estaba aplicada en la base
-- remota, pero nunca había entrado a git), para que la versión canónica que
-- entra a git sea reproducible desde una base nueva. El UUID puede legítima y
-- esperablemente no existir en otras instalaciones (clon fresco, CI, DB local
-- de otro desarrollador): por eso esta migración es intencionalmente un no-op
-- seguro cuando esa fila puntual no existe, y solo actúa cuando encuentra el
-- remito exactamente en el estado histórico esperado.
--
-- Comportamiento (ver DO block):
--   A. UUID no existe            -> RAISE NOTICE informativo, no-op, sin tocar
--                                    el trigger ni ninguna otra fila.
--   B. UUID existe y coincide    -> repara quirúrgicamente (disable guard,
--      con el estado histórico      UPDATE puntual, enable guard), verifica
--      esperado                     el resultado.
--   C. UUID existe pero NO       -> ABORTA con excepción (nunca no-op
--      coincide con el estado       silencioso: podría ocultar un estado
--      histórico esperado            inesperado).
--
-- Seguridad del guard de inmutabilidad (trg_prevent_remittance_mutation,
-- migración 20261002000027): en el caso A nunca se llega a deshabilitarlo. En
-- el caso B se deshabilita quirúrgicamente solo alrededor del UPDATE puntual
-- y se reactiva de inmediato. Si cualquier paso posterior al DISABLE fallara,
-- toda la transacción de la migración se revierte (DDL transaccional de
-- Postgres), restituyendo el guard habilitado: no existe ningún camino que lo
-- deje desactivado.
-- ============================================================================

DO $$
DECLARE
  v_id CONSTANT UUID := '44d91cd9-4a02-41da-8c9d-206994807db5';
  v_row RECORD;
  v_margin_count INTEGER;
  v_final_status VARCHAR;
BEGIN
  SELECT * INTO v_row FROM public.remittances WHERE id = v_id;

  -- A. El remito histórico no existe en esta base: no-op seguro.
  IF NOT FOUND THEN
    RAISE NOTICE 'Fix RTO0182 (replay-safe): el remito % no existe en esta base (instalación nueva o distinta de aquella donde ocurrió el incidente). Nada que reparar: no-op.', v_id;
    RETURN;
  END IF;

  -- C. Existe pero no coincide con el estado histórico esperado: abortar, nunca asumir.
  IF v_row.code <> 'RTO0182' THEN
    RAISE EXCEPTION 'Fix RTO0182: el remito % tiene code=% (se esperaba RTO0182). Abortando: el estado no coincide con el incidente histórico conocido.', v_id, v_row.code;
  END IF;

  IF v_row.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Fix RTO0182: el remito % tiene status=% (se esperaba COMPLETED). Abortando: el estado no coincide con el incidente histórico conocido.', v_id, v_row.status;
  END IF;

  SELECT COUNT(*) INTO v_margin_count FROM public.margin_remittances WHERE remittance_id = v_id;
  IF v_margin_count > 0 THEN
    RAISE EXCEPTION 'Fix RTO0182: existe(n) % margin_remittance(s) real(es) asociado(s) a %. Abortando: este COMPLETED es legítimo (tiene RTM real), no es el incidente a reparar.', v_margin_count, v_id;
  END IF;

  -- B. Las 3 condiciones históricas se cumplen exactamente: reparar quirúrgicamente.
  RAISE NOTICE 'Fix RTO0182: precondiciones verificadas (id=%, code=%, status=%, margin_remittances=0). Revirtiendo a RTM_PENDING...', v_id, v_row.code, v_row.status;

  EXECUTE 'ALTER TABLE public.remittances DISABLE TRIGGER trg_prevent_remittance_mutation';

  UPDATE public.remittances
  SET status = 'RTM_PENDING'
  WHERE id = v_id
    AND code = 'RTO0182'
    AND status = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1 FROM public.margin_remittances WHERE remittance_id = v_id
    );

  EXECUTE 'ALTER TABLE public.remittances ENABLE TRIGGER trg_prevent_remittance_mutation';

  SELECT status INTO v_final_status FROM public.remittances WHERE id = v_id;
  IF v_final_status IS DISTINCT FROM 'RTM_PENDING' THEN
    RAISE EXCEPTION 'Fix RTO0182: la reparación no tuvo efecto (status final = %). Abortando para revisión manual.', v_final_status;
  END IF;

  RAISE NOTICE 'Fix RTO0182: reparación aplicada correctamente. status = RTM_PENDING.';
END $$;
