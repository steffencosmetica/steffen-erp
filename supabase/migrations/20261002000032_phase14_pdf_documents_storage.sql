-- ==============================================================================
-- MIGRACIÓN 20261002000032: Fase 14 — Soporte de generación de PDFs (RTO/RTM)
--
-- 1. Índice único de idempotencia en generated_documents, por
--    (source_type, source_id, template_key, template_version). Garantiza que
--    nunca se dupliquen documentos para el mismo origen+template+versión,
--    incluso bajo condiciones de carrera (ON CONFLICT en el repositorio).
-- 2. Bucket privado de Supabase Storage "generated-documents" para los PDFs
--    generados. Nunca público.
-- 3. Políticas RLS sobre storage.objects restringidas exclusivamente a
--    service_role para ese bucket, siguiendo el mismo patrón de
--    "solo service_role" ya aplicado a todas las tablas de negocio
--    (20261002000007_lockdown_tables_and_views.sql).
--
-- No modifica generated_documents más allá de agregar el índice: la tabla y su
-- contrato (columnas, checks) ya existían desde 20261002000001 y coinciden
-- exactamente con docs/PDFS.md.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Índice único de idempotencia
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_documents_source_template
  ON public.generated_documents (source_type, source_id, template_key, template_version);

-- ------------------------------------------------------------------------------
-- 2. Bucket privado para PDFs generados
--    UPSERT explícito: si el bucket no existe lo crea; si ya existe (p.ej. en
--    un ambiente donde fue creado manualmente o por una corrida anterior con
--    otros valores), fuerza la configuración normativa en cada replay en vez
--    de asumir que lo existente ya es correcto (mismo criterio que el
--    incidente de 20261002000030: nunca dar por sentado el estado, verificarlo
--    o forzarlo explícitamente).
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('generated-documents', 'generated-documents', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------------------------
-- 3. Políticas RLS en storage.objects: exclusivamente service_role
--    (RLS ya está habilitado por Supabase por defecto en storage.objects)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "generated_documents_service_role_all" ON storage.objects;

CREATE POLICY "generated_documents_service_role_all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'generated-documents')
  WITH CHECK (bucket_id = 'generated-documents');
