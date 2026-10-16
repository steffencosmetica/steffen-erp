-- Fase 16 — Fecha comercial única (Dashboard y Administración).
--
-- Fuente read-only de la fecha comercial vigente: CURRENT_DATE de PostgreSQL,
-- la misma que usan por defecto business_operations.business_date y la vista
-- v_current_reports. Dashboard y Administración derivan año/mes de aquí; nunca
-- de la hora del servidor de aplicación ni de created_at.

CREATE OR REPLACE VIEW public.v_current_business_date AS
SELECT CURRENT_DATE AS business_date;

-- Mismo esquema de permisos que el resto de vistas (lockdown 20261002000007):
-- solo service_role (contexto servidor del ERP).
ALTER VIEW public.v_current_business_date SET (security_invoker = true);
REVOKE ALL ON public.v_current_business_date FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_current_business_date TO service_role;
