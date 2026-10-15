-- ============================================================================
-- MIGRACIÓN: 20261002000029_phase13_margin_remittance_immutability_guard.sql
-- FASE 13 — RTM / GUARDA DE INMUTABILIDAD A NIVEL DE BASE DE DATOS
--
-- Motivación (misma brecha real que en Fase 12, auditada antes de implementar):
-- `margin_remittances` y `margin_remittance_items` tienen RLS habilitado, pero
-- `service_role` (el único rol que usa la aplicación server-side) tiene
-- GRANT ALL y bypassea RLS. Hoy la protección es "por ausencia": no existe
-- ninguna Server Action, método de dominio ni de repositorio que exponga una
-- edición del RTM. Esta migración la convierte en garantía real de base de
-- datos, de forma quirúrgica.
--
-- A diferencia de `remittances` (que sí tiene una transición de estado
-- legítima futura, RTM_PENDING -> COMPLETED, protegida en la migración
-- 20261002000027), el RTM no tiene ningún campo editable legítimo una vez
-- creado: costo, transporte, ganancia y líneas son definitivos. Por eso acá
-- se bloquea CUALQUIER UPDATE, sin excepciones de columna.
--
-- No se bloquea DELETE por el mismo motivo que en Fase 12: no forma parte de
-- ningún flujo de negocio y rompería la limpieza de fixtures de tests.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_margin_remittance_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'El RTM es histórico e inmutable: no se permite editar costo, transporte, ganancia ni líneas una vez creado.'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_margin_remittance_mutation ON public.margin_remittances;
CREATE TRIGGER trg_prevent_margin_remittance_mutation
  BEFORE UPDATE ON public.margin_remittances
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_margin_remittance_mutation();

DROP TRIGGER IF EXISTS trg_prevent_margin_remittance_item_mutation ON public.margin_remittance_items;
CREATE TRIGGER trg_prevent_margin_remittance_item_mutation
  BEFORE UPDATE ON public.margin_remittance_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_margin_remittance_mutation();
