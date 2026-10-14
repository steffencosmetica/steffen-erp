-- ============================================================================
-- MIGRACIÓN: 20261002000027_phase12_remittance_immutability_guard.sql
-- FASE 12 — RTO / MICRO-CIERRE: GUARDA DE INMUTABILIDAD A NIVEL DE BASE DE DATOS
--
-- Motivación (brecha real detectada en auditoría):
-- La tabla `remittances` tiene RLS habilitado, pero `service_role` (el único rol
-- que usa la aplicación server-side a través de composition.ts) tiene GRANT ALL
-- y además bypassea RLS. Esto significa que, a nivel de base de datos, nada
-- impide hoy que un futuro método de repositorio ejecute un UPDATE arbitrario
-- sobre `remittances`, `remittance_items` o `remittance_discount_steps` y
-- altere snapshots o importes de una venta ya confirmada.
--
-- Hoy esa protección es puramente "por ausencia": no existe ningún Server
-- Action, método de dominio ni método de repositorio que exponga una edición.
-- Esta migración la convierte en una garantía real a nivel de base de datos,
-- de forma quirúrgica:
--
-- 1. `remittances`: bloquea cualquier UPDATE que modifique código, operación,
--    pedido, snapshots de destinatario, snapshots de importes/peso o
--    created_at. SÍ permite explícitamente la única transición de estado
--    legítima futura: RTM_PENDING -> COMPLETED (Fase 13 / RTM).
-- 2. `remittance_items` y `remittance_discount_steps`: bloquean cualquier
--    UPDATE sin excepción (no existe ningún campo editable legítimo).
--
-- No se bloquea DELETE: la eliminación de remitos no forma parte de ningún
-- flujo de negocio descripto en BUSINESS_RULES.md/FLOWS.md, y bloquearla
-- rompería la limpieza de fixtures de tests contra la base compartida.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_remittance_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.code IS DISTINCT FROM OLD.code OR
    NEW.operation_id IS DISTINCT FROM OLD.operation_id OR
    NEW.order_id IS DISTINCT FROM OLD.order_id OR
    NEW.customer_source IS DISTINCT FROM OLD.customer_source OR
    NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
    NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot OR
    NEW.address_snapshot IS DISTINCT FROM OLD.address_snapshot OR
    NEW.locality_snapshot IS DISTINCT FROM OLD.locality_snapshot OR
    NEW.province_snapshot IS DISTINCT FROM OLD.province_snapshot OR
    NEW.phone_snapshot IS DISTINCT FROM OLD.phone_snapshot OR
    NEW.transport_name_snapshot IS DISTINCT FROM OLD.transport_name_snapshot OR
    NEW.transport_address_snapshot IS DISTINCT FROM OLD.transport_address_snapshot OR
    NEW.package_count_snapshot IS DISTINCT FROM OLD.package_count_snapshot OR
    NEW.weight_kg_snapshot IS DISTINCT FROM OLD.weight_kg_snapshot OR
    NEW.subtotal_ars IS DISTINCT FROM OLD.subtotal_ars OR
    NEW.total_order_ars IS DISTINCT FROM OLD.total_order_ars OR
    NEW.prior_balance_snapshot_ars IS DISTINCT FROM OLD.prior_balance_snapshot_ars OR
    NEW.total_to_collect_ars IS DISTINCT FROM OLD.total_to_collect_ars OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'El remito (RTO) es inmutable: no se permiten modificaciones a sus snapshots ni a los importes de la venta una vez confirmado.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'RTM_PENDING' AND NEW.status = 'COMPLETED') THEN
      RAISE EXCEPTION 'Transición de estado de remito no permitida: % -> %. Solo se permite RTM_PENDING -> COMPLETED.', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_remittance_mutation ON public.remittances;
CREATE TRIGGER trg_prevent_remittance_mutation
  BEFORE UPDATE ON public.remittances
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_remittance_mutation();

CREATE OR REPLACE FUNCTION public.prevent_remittance_child_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Las líneas/pasos de descuento del remito son inmutables: no se permite editarlos una vez creados.'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_remittance_item_mutation ON public.remittance_items;
CREATE TRIGGER trg_prevent_remittance_item_mutation
  BEFORE UPDATE ON public.remittance_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_remittance_child_mutation();

DROP TRIGGER IF EXISTS trg_prevent_remittance_discount_step_mutation ON public.remittance_discount_steps;
CREATE TRIGGER trg_prevent_remittance_discount_step_mutation
  BEFORE UPDATE ON public.remittance_discount_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_remittance_child_mutation();
