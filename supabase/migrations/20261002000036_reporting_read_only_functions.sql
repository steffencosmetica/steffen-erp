-- ============================================================================
-- MIGRACIÓN: 20261002000036_reporting_read_only_functions.sql
-- FASE REPORTES R4.3 — FUNCIONES ANALÍTICAS READ-ONLY
--
-- Contrato funcional: docs/REPORTES.md (BUSINESS_RULES §36, DATA_MODEL §65).
--
-- Migración ADITIVA. No crea ni altera tablas operativas y no escribe datos:
--   - 5 funciones LANGUAGE sql, STABLE, SECURITY INVOKER (solo SELECT);
--   - 2 índices de soporte sobre FKs sin indexar.
--
-- Reglas comunes:
--   - Venta = remittances.status = 'COMPLETED' con INNER JOIN a
--     margin_remittances (un RTO COMPLETED sin RTM es una inconsistencia de
--     datos fuera del contrato y no se recupera).
--   - Fecha analítica = business_operations.business_date de la operación
--     SALE_RTO del RTO (remittances.operation_id); nunca la del RTM ni
--     created_at.
--   - Gastos operativos = operating_expenses por la business_date de su propia
--     operación, sin filtrar operation_type (incluye la comisión de Mercado
--     Libre registrada por la liquidación).
--   - Corte común business_date <= p_as_of_date (fecha comercial vigente que
--     provee la aplicación desde v_current_business_date): excluye operaciones
--     futuras del año corriente; los años cerrados quedan completos.
--   - Todo NUMERIC monetario se devuelve como text (sin pasar por float).
--
-- Permisos: solo service_role (mismo patrón que get_customer_last_activity).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Primer año con información relevante (selector global de año)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reporting_first_year(p_as_of_date DATE)
RETURNS TABLE (
  first_year INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXTRACT(YEAR FROM MIN(src.first_date))::INTEGER AS first_year
  FROM (
    SELECT MIN(bo.business_date) AS first_date
    FROM public.remittances r
    JOIN public.margin_remittances mr ON mr.remittance_id = r.id
    JOIN public.business_operations bo ON bo.id = r.operation_id
    WHERE r.status = 'COMPLETED'
      AND bo.operation_type = 'SALE_RTO'
      AND bo.business_date <= p_as_of_date
    UNION ALL
    SELECT MIN(bo.business_date) AS first_date
    FROM public.operating_expenses oe
    JOIN public.business_operations bo ON bo.id = oe.operation_id
    WHERE bo.business_date <= p_as_of_date
  ) src;
$$;

REVOKE ALL ON FUNCTION public.get_reporting_first_year(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reporting_first_year(DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Facturación: meses con datos de p_year, p_year - 1 y p_year - 2
--    (resumen anual, evolución mensual y comparación interanual).
--    Solo meses con ventas o gastos; el relleno enero–diciembre es de dominio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reporting_billing_months(p_year INTEGER, p_as_of_date DATE)
RETURNS TABLE (
  year INTEGER,
  month INTEGER,
  sales_count BIGINT,
  billed_ars TEXT,
  gain_ars TEXT,
  transport_ars TEXT,
  expenses_ars TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH sales_by_month AS (
    SELECT
      EXTRACT(YEAR FROM bo.business_date)::INTEGER AS y,
      EXTRACT(MONTH FROM bo.business_date)::INTEGER AS m,
      COUNT(*)::BIGINT AS sales_count,
      SUM(r.total_order_ars) AS billed_ars,
      SUM(mr.gain_ars) AS gain_ars,
      SUM(mr.transport_cost_ars) AS transport_ars
    FROM public.remittances r
    JOIN public.margin_remittances mr ON mr.remittance_id = r.id
    JOIN public.business_operations bo ON bo.id = r.operation_id
    WHERE r.status = 'COMPLETED'
      AND bo.operation_type = 'SALE_RTO'
      AND bo.business_date >= make_date(p_year - 2, 1, 1)
      AND bo.business_date < make_date(p_year + 1, 1, 1)
      AND bo.business_date <= p_as_of_date
    GROUP BY 1, 2
  ),
  expenses_by_month AS (
    SELECT
      EXTRACT(YEAR FROM bo.business_date)::INTEGER AS y,
      EXTRACT(MONTH FROM bo.business_date)::INTEGER AS m,
      SUM(oe.amount_ars) AS expenses_ars
    FROM public.operating_expenses oe
    JOIN public.business_operations bo ON bo.id = oe.operation_id
    WHERE bo.business_date >= make_date(p_year - 2, 1, 1)
      AND bo.business_date < make_date(p_year + 1, 1, 1)
      AND bo.business_date <= p_as_of_date
    GROUP BY 1, 2
  )
  SELECT
    COALESCE(s.y, e.y) AS year,
    COALESCE(s.m, e.m) AS month,
    COALESCE(s.sales_count, 0)::BIGINT AS sales_count,
    COALESCE(s.billed_ars, 0)::TEXT AS billed_ars,
    COALESCE(s.gain_ars, 0)::TEXT AS gain_ars,
    COALESCE(s.transport_ars, 0)::TEXT AS transport_ars,
    COALESCE(e.expenses_ars, 0)::TEXT AS expenses_ars
  FROM sales_by_month s
  FULL OUTER JOIN expenses_by_month e ON e.y = s.y AND e.m = s.m
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.get_reporting_billing_months(INTEGER, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reporting_billing_months(INTEGER, DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Productos del año: unidades, facturación atribuida, costo histórico y
--    contribución por product_id (REPORTES §6).
--
--    a) Ventas y costos se agregan POR SEPARADO por (remittance_id, product_id)
--       antes de cruzarse (margin_remittance_items no tiene remittance_item_id
--       y un producto puede repetirse dentro de un RTO).
--    b) Atribución HALF-UP exacta a 6 decimales con div() sobre NUMERIC
--       (ver comentario en el CTE attributed).
--    c) Residuo por RTO (total_order − Σ redondeados) al producto de mayor
--       subtotal bruto; empate por product_id ASC (row_number). Así
--       Σ atribuida del RTO = total_order_ars exactamente.
--    d) Contribución = atribuida − costo snapshot del RTM (sin transporte;
--       puede ser negativa; un costo snapshot 0 se usa literalmente).
--    e) Etiqueta = nombre ACTUAL del maestro (stock_items.name).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reporting_products(p_year INTEGER, p_as_of_date DATE)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  units BIGINT,
  billed_ars TEXT,
  cost_ars TEXT,
  contribution_ars TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH sales AS (
    SELECT r.id AS remittance_id, r.subtotal_ars, r.total_order_ars
    FROM public.remittances r
    JOIN public.margin_remittances mr ON mr.remittance_id = r.id
    JOIN public.business_operations bo ON bo.id = r.operation_id
    WHERE r.status = 'COMPLETED'
      AND bo.operation_type = 'SALE_RTO'
      AND bo.business_date >= make_date(p_year, 1, 1)
      AND bo.business_date < make_date(p_year + 1, 1, 1)
      AND bo.business_date <= p_as_of_date
  ),
  sold AS (
    SELECT
      ri.remittance_id,
      ri.product_id AS pid,
      SUM(ri.quantity_sent)::BIGINT AS units,
      SUM(ri.line_total_ars) AS gross_ars
    FROM public.remittance_items ri
    JOIN sales s ON s.remittance_id = ri.remittance_id
    GROUP BY ri.remittance_id, ri.product_id
  ),
  attributed AS (
    SELECT
      so.remittance_id,
      so.pid,
      so.units,
      s.total_order_ars,
      -- Atribución HALF-UP exacta a 6 decimales. subtotal_ars > 0 está
      -- garantizado por el flujo válido de RTO (confirm_order_to_remittance_atomic
      -- exige ≥ 1 línea AG > 0 y order_items.unit_price_ars_snapshot > 0) y los
      -- operandos monetarios son no negativos. div() calcula directamente el
      -- entero de millonésimas (floor((2·q·10^6 + 1) / 2) del cociente exacto
      -- q = bruto × total / subtotal), evitando el doble redondeo potencial de
      -- una división NUMERIC (escala implícita) seguida de ROUND. El residuo
      -- posterior sigue garantizando Σ atribuida del RTO = total_order_ars.
      div(
        so.gross_ars * s.total_order_ars * 2000000 + s.subtotal_ars,
        2 * s.subtotal_ars
      ) * 0.000001::NUMERIC AS rounded_ars,
      ROW_NUMBER() OVER (
        PARTITION BY so.remittance_id
        ORDER BY so.gross_ars DESC, so.pid ASC
      ) AS residue_rank
    FROM sold so
    JOIN sales s ON s.remittance_id = so.remittance_id
  ),
  billed AS (
    SELECT
      a.remittance_id,
      a.pid,
      a.units,
      a.rounded_ars
        + CASE
            WHEN a.residue_rank = 1
              THEN a.total_order_ars - SUM(a.rounded_ars) OVER (PARTITION BY a.remittance_id)
            ELSE 0
          END AS billed_ars
    FROM attributed a
  ),
  costs AS (
    SELECT
      mr.remittance_id,
      mri.product_id AS pid,
      SUM(mri.total_cost_snapshot_ars) AS cost_ars
    FROM public.margin_remittance_items mri
    JOIN public.margin_remittances mr ON mr.id = mri.margin_remittance_id
    JOIN sales s ON s.remittance_id = mr.remittance_id
    GROUP BY mr.remittance_id, mri.product_id
  ),
  per_sale AS (
    SELECT
      b.pid,
      b.units,
      b.billed_ars,
      COALESCE(c.cost_ars, 0) AS cost_ars
    FROM billed b
    LEFT JOIN costs c ON c.remittance_id = b.remittance_id AND c.pid = b.pid
  )
  SELECT
    ps.pid AS product_id,
    si.name::TEXT AS product_name,
    SUM(ps.units)::BIGINT AS units,
    SUM(ps.billed_ars)::TEXT AS billed_ars,
    SUM(ps.cost_ars)::TEXT AS cost_ars,
    (SUM(ps.billed_ars) - SUM(ps.cost_ars))::TEXT AS contribution_ars
  FROM per_sale ps
  JOIN public.stock_items si ON si.id = ps.pid
  GROUP BY ps.pid, si.name
  ORDER BY ps.pid;
$$;

REVOKE ALL ON FUNCTION public.get_reporting_products(INTEGER, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reporting_products(INTEGER, DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Entidades analíticas del año (REPORTES §7): una por cliente registrado
--    (customer_id), una para Mercado Libre y una para Consumidor Final
--    (customer_id NULL). Identidad por remittances.customer_source (congelado
--    en el RTO), nunca por recipient_name_snapshot. Etiqueta futura de
--    clientes registrados = customers.name (incluye clientes inactivos).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reporting_entities(p_year INTEGER, p_as_of_date DATE)
RETURNS TABLE (
  customer_source TEXT,
  customer_id UUID,
  customer_name TEXT,
  sales_count BIGINT,
  billed_ars TEXT,
  first_purchase_date DATE,
  last_purchase_date DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH entity_sales AS (
    SELECT
      r.customer_source AS src,
      CASE WHEN r.customer_source = 'REGISTERED_CUSTOMER' THEN r.customer_id END AS cid,
      COUNT(*)::BIGINT AS sales_count,
      SUM(r.total_order_ars) AS billed_ars,
      MIN(bo.business_date) AS first_purchase_date,
      MAX(bo.business_date) AS last_purchase_date
    FROM public.remittances r
    JOIN public.margin_remittances mr ON mr.remittance_id = r.id
    JOIN public.business_operations bo ON bo.id = r.operation_id
    WHERE r.status = 'COMPLETED'
      AND bo.operation_type = 'SALE_RTO'
      AND bo.business_date >= make_date(p_year, 1, 1)
      AND bo.business_date < make_date(p_year + 1, 1, 1)
      AND bo.business_date <= p_as_of_date
    GROUP BY 1, 2
  )
  SELECT
    es.src::TEXT AS customer_source,
    es.cid AS customer_id,
    c.name::TEXT AS customer_name,
    es.sales_count,
    es.billed_ars::TEXT AS billed_ars,
    es.first_purchase_date,
    es.last_purchase_date
  FROM entity_sales es
  LEFT JOIN public.customers c ON c.id = es.cid
  ORDER BY es.src, es.cid;
$$;

REVOKE ALL ON FUNCTION public.get_reporting_entities(INTEGER, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reporting_entities(INTEGER, DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Ventas (RTO COMPLETED) de una entidad en el año: historial, KPIs y serie
--    mensual del análisis individual (REPORTES §9).
--    REGISTERED_CUSTOMER exige p_customer_id no nulo y coincidente;
--    MERCADO_LIBRE / CONSUMER_FINAL exigen p_customer_id NULL y filas con
--    customer_id NULL. Cualquier otra combinación devuelve 0 filas (sin
--    excepciones: la validación sintáctica de la clave es de dominio).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reporting_entity_sales(
  p_year INTEGER,
  p_as_of_date DATE,
  p_customer_source TEXT,
  p_customer_id UUID
)
RETURNS TABLE (
  remittance_id UUID,
  rto_code TEXT,
  business_date DATE,
  total_order_ars TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    r.id AS remittance_id,
    r.code::TEXT AS rto_code,
    bo.business_date AS business_date,
    r.total_order_ars::TEXT AS total_order_ars
  FROM public.remittances r
  JOIN public.margin_remittances mr ON mr.remittance_id = r.id
  JOIN public.business_operations bo ON bo.id = r.operation_id
  WHERE r.status = 'COMPLETED'
    AND bo.operation_type = 'SALE_RTO'
    AND bo.business_date >= make_date(p_year, 1, 1)
    AND bo.business_date < make_date(p_year + 1, 1, 1)
    AND bo.business_date <= p_as_of_date
    AND r.customer_source = p_customer_source
    AND (
      (
        p_customer_source = 'REGISTERED_CUSTOMER'
        AND p_customer_id IS NOT NULL
        AND r.customer_id = p_customer_id
      )
      OR (
        p_customer_source IN ('MERCADO_LIBRE', 'CONSUMER_FINAL')
        AND p_customer_id IS NULL
        AND r.customer_id IS NULL
      )
    )
  ORDER BY bo.business_date DESC, r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_reporting_entity_sales(INTEGER, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reporting_entity_sales(INTEGER, DATE, TEXT, UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Índices de soporte (FKs sin indexar recorridas por get_reporting_products)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_remittance_items_remittance
ON public.remittance_items (remittance_id);

CREATE INDEX IF NOT EXISTS idx_margin_remittance_items_margin_remittance
ON public.margin_remittance_items (margin_remittance_id);
