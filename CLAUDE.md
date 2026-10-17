# ERP STEFFEN — INSTRUCCIONES PARA CLAUDE CODE

## Fuente de verdad

Antes de implementar cualquier fase o cambio, leer:

- AI_STUDIO_INSTRUCTIONS.md
- docs/PROJECT.md
- docs/BUSINESS_RULES.md
- docs/DATA_MODEL.md
- docs/FLOWS.md
- docs/DESIGN.md
- docs/COMPONENTS.md
- docs/AUDIT.md
- docs/IMPLEMENTATION_PLAN.md
- docs/AGENT_INSTRUCTIONS.md

Para PDFs:
- docs/PDFS.md

Para Reportes:
- docs/REPORTES.md (contrato funcional consolidado; leer junto con las fuentes normativas, no las reemplaza)

Jerarquía funcional:
1. BUSINESS_RULES.md
2. DATA_MODEL.md
3. FLOWS.md
4. IMPLEMENTATION_PLAN.md
5. Figma / referencias visuales
6. implementación existente

Autoridad por dominio:
- BUSINESS_RULES / FLOWS → comportamiento.
- DESIGN / COMPONENTS / nuevo Figma → apariencia.
- IMPLEMENTATION_PLAN → secuencia de implementación.
- PDFS → contrato documental/histórico.

No inventar reglas de negocio.

## Arquitectura

UI
→ Server Actions
→ Domain Services
→ Repositories
→ Supabase/PostgreSQL

- composition.ts es server-only.
- Client Components no importan repositorios, DB ni servicios server-only.
- No usar `any`.
- NUMERIC debe preservarse como string/Decimal.
- No usar Number para cálculos monetarios críticos.
- Decimal precision = 28.
- ROUND_HALF_UP donde corresponda.

## Stock

Stock negativo está absolutamente prohibido para:

- MPR
- COM
- PRO

Toda salida que deje balance < 0 debe rechazarse atómicamente.

No modificar esta regla.

## Git

- No trabajar directamente sobre main para una fase incompleta.
- No hacer commit, push, merge, reset, rebase o borrados destructivos salvo instrucción explícita.
- No avanzar a la siguiente fase sin smoke manual del usuario.

## Migraciones

- Nunca editar migraciones ya aplicadas.
- Verificar la última migración real antes de crear una nueva.
- No usar MAX(code)+1.
- Usar secuencias canónicas del proyecto.
- Regenerar tipos Supabase oficialmente si cambia esquema.
- No editar database/types.ts manualmente.

## Tests

Tests contra DB compartida:
npm test

No dejar fixtures persistentes.

## Build

Nunca ejecutar `npm run build` mientras `npm run dev` esté activo.

Secuencia:
1. detener dev
2. npm run build
3. dry-run Supabase
4. reiniciar dev

## Diseño

Fuente de verdad visual: docs/DESIGN.md + docs/COMPONENTS.md + nuevo Figma (docs/visual-references/figma/).

- UI general dark (fondo #000000) según DESIGN.md / COMPONENTS.md.
- Gold (Primary) #C38926 — único dorado normativo. Obsoletos: #D2AB68, #B99D22.
- Blue #0E50A0 (hover #6E96C6)
- Green #008102 (hover #015C02)
- Red #DD0000 (hover #B10000)
- Headers de tabla: normalmente gris oscuro (ver DESIGN.md §12), no claros.
- #D9D9D9 queda como Border / superficie clara; no es el color global de header de tabla.
- botones / inputs rounded-[5px], fondo Surface Dark Degrade (#121212→#000000), borde Border Button #D9D9D9
- paneles / contenedores rounded-[10px], fondo #000000, borde Border Contenedor #393939; fondo de página #101010
- sin shadows

Seguir Figma antes de inventar UI.

## Estado actual

ERP base (Fases 0–19.1 del IMPLEMENTATION_PLAN) integrado en main (release de producción).

Fase actual:
REPORTES R — Reportes analíticos (IMPLEMENTATION_PLAN §22.2)

Rama: feat/reportes-analytics

- R1 Auditoría: COMPLETADA.
- R2 Contrato funcional: COMPLETADA.
- R2.1 Documentación funcional (docs/REPORTES.md): COMPLETADA.
- R3.1 Desktop / R3.2 Interacciones / R3.3 Responsive: APROBADOS.
- R3.4 Documentación UX (DESIGN §35, COMPONENTS §60.1, REPORTES §17): COMPLETADA.
- Siguiente: R4 Backend analítico. Después: R5 UI.

Reglas: BUSINESS_RULES §36 + docs/REPORTES.md (la antigua definición de "cuatro cards" de Reportes está derogada; esas métricas siguen en el Dashboard, §35.5).

Reportes es 100% READ-ONLY: no modificar Pedidos, RTO, RTM, Clientes, Compras, Patrimonio, Fábrica ni Stock. Mantener intactos ReportDomainService, ReportRepository y v_current_reports.

NO avanzar de subfase sin smoke/aprobación manual del usuario.