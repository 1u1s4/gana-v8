# Plan de guardrails experimentales de corners - gana-v8

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan como hardening de seguridad antes de promover corners a mercado base.

**Goal:** mantener corners usable para pruebas reales sin permitir que odds o stats incompletas publiquen parlays inseguros.

**Architecture:** corners debe permanecer opt-in, con evidencia separada de odds y statistics, validation conservadora y criterios explicitos para pasar de experimental a base.

**Tech Stack:** TypeScript, scoring-worker, publisher-worker, validation-worker, public-api/operator-console, Node scripts.

---

## Estado actual confirmado

- `corners-total` y `corners-h2h` existen en taxonomia y contratos.
- Scoring de corners esta gateado por `GANA_ENABLE_CORNERS_MARKETS=1`.
- Validation puede liquidar corners si hay fixture statistics con corners home/away.
- Public API/operator-console exponen corners stats.
- Falta un plan activo que defina criterios de promocion y guardrails operativos para corners.

## Ya cubierto

- Feature flag de scoring experimental.
- Ingestion de fixture statistics.
- Persistencia de `FixtureStatisticSnapshot`.
- Validation de corners-total y corners-h2h con tests.
- Labels y stats visibles en superficies operativas.

## Faltantes exclusivos

### 1. Guardrails de activacion

- Confirmar que ningun default de top leagues scorea corners sin flag.
- Confirmar que publisher no prioriza corners sin policy explicita.
- Separar reportes de corners de mercados base para que ausencia de corners no degrade el flujo principal.

### 2. Evidencia minima para promocion

- Odds de corners disponibles en provider para ligas objetivo.
- Fixture statistics de corners disponibles tras completed.
- Line extraction confiable para corners-total.
- Settlement real verificado contra stats finales.

### 3. Politica anti-correlacion

- Evitar mezclar corners de un fixture con otros mercados del mismo fixture salvo allowlist explicita.
- Registrar skip reason especifico para corners experimentales cuando no cumplen guardrails.

### 4. Observabilidad y fallback

- Reportar estados: `experimental-enabled`, `experimental-disabled`, `stats-missing`, `line-missing`, `settlement-ready`.
- Si faltan stats, validation debe quedar skipped/pending con razon legible, nunca fallar silenciosamente.

## Interfaces/contratos afectados

- `apps/scoring-worker/src/index.ts`
- `apps/publisher-worker/src/index.ts`
- `apps/validation-worker/src/index.ts`
- `apps/public-api/src/index.ts`
- `apps/operator-console/src/index.ts`
- `scripts/report-fixture-market-availability.mjs`
- `scripts/top-football-leagues.mjs`
- `scripts/seed-top-league-coverage.mjs`
- `runbooks/`

## Dependencias

- Depende de `gana-v8-live-multimarket-provider-validation.md` para evidencia real de odds/stats.
- Depende del cierre `docs/plans/completado/gana-v8-market-line-extraction-hardening.md` para corners-total confiable.
- Debe preservar la operacion base aunque corners no exista en provider.
- No debe convertir corners en default hasta tener evidencia real suficiente.

## Criterio de done

- Tests confirman que corners no se scorea sin `GANA_ENABLE_CORNERS_MARKETS=1`.
- Reporte de disponibilidad puede mostrar corners expected/absent sin marcar fallo base.
- Publisher aplica politica anti-correlacion o skip reason especifico para corners experimentales.
- Validation de corners informa `stats missing`, `line missing` o settlement listo con mensajes accionables.
- Existe checklist de promocion de corners de experimental a base.
- `pnpm --filter @gana-v8/scoring-worker test`, `publisher-worker test`, `validation-worker test`, `public-api test` y `operator-console test` pasan.

## Fuentes consolidadas

- Codigo actual: `apps/scoring-worker/src/index.ts`, `apps/validation-worker/src/index.ts`, `apps/public-api/src/index.ts`, `apps/operator-console/src/index.ts`.
- Observacion de review: corners esta correctamente flaggeado, pero necesita criterios explicitos de promocion y reporting operativo.
- Planes relacionados:
  - `docs/plans/falta/gana-v8-live-multimarket-provider-validation.md`
  - `docs/plans/completado/gana-v8-market-line-extraction-hardening.md`
