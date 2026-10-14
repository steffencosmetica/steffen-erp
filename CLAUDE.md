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

Jerarquía funcional:
1. BUSINESS_RULES.md
2. DATA_MODEL.md
3. FLOWS.md
4. IMPLEMENTATION_PLAN.md
5. Figma / referencias visuales
6. implementación existente

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

- Gold #D2AB68
- Blue #0E50A0
- Red #DD0000
- Salmon #FFA8A8
- Header tabla #D9D9D9
- botones rounded-[2px]
- contenedores rounded-[5px]
- sin shadows

Seguir Figma antes de inventar UI.

## Estado actual

Fases 0–11 cerradas y aprobadas por smoke manual.

Fase actual:
12 — RTO

Existe implementación parcial guardada en:
wip/fase-12-rto

NO asumir que Fase 12 está completa.
Auditar lo existente antes de continuar.

NO avanzar a Fase 13.