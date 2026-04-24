# Plan de hardening de aliases de mercados del provider - gana-v8

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan despues o junto con la validacion live multi-mercado.

**Goal:** robustecer la normalizacion de mercados de API-Football para que cambios de nombre/id del provider no rompan ingestion, scoring ni reportes.

**Architecture:** ampliar `packages/source-connectors/src/markets.ts` con aliases basados en payloads reales sanitizados, mantener fallback slugificado para mercados desconocidos y exponer unknown/provider-specific markets en reportes de disponibilidad.

**Tech Stack:** TypeScript, node:test, source-connectors, API-Football payloads sanitizados.

---

## Estado actual confirmado

- `packages/source-connectors/src/markets.ts` define claves canonicas: `h2h`, `totals-goals`, `both-teams-score`, `double-chance`, `corners-total`, `corners-h2h`.
- `packages/source-connectors/src/markets.ts` usa una tabla explicita de aliases por mercado canonico.
- El nombre reconocido gana sobre IDs fragiles; el ID queda como fallback compatible para payloads legacy o incompletos.
- `matchesMarketFilter()` acepta canonical key, provider slug con ID, slug de nombre, nombre normalizado o ID.
- `scripts/report-fixture-market-availability.mjs` expone markets provider-specific en seccion separada cuando ya fueron persistidos.
- Existe runbook de mantenimiento en `runbooks/provider-market-alias-maintenance.md`.
- Sigue faltando validar los aliases contra payloads live reales variados por liga/bookmaker.

## Ya cubierto

- Taxonomia canonica inicial.
- Tests de `normalizeProviderMarketKey()` con matriz de aliases por mercado, IDs cambiados, name-only, id-only y conflicto nombre/ID.
- Fallback slugificado para mercados desconocidos.
- Filtro por `marketKeys` en API-Football client con compatibilidad canonical, provider slug, name slug, nombre normalizado e ID.
- Corpus sintetico/sanitizado en `packages/source-connectors/tests/fixtures/api-football-market-aliases.json`.
- Reporte de provider-specific markets y guia corta para agregar aliases nuevos con test.

## Faltantes exclusivos

### 1. Evidencia live real sanitizada

- Capturar ejemplos reales de `bet.id` y `bet.name` sin incluir secrets ni payload sensible.
- Reemplazar o complementar el corpus sintetico con fixtures test derivadas de esos ejemplos reales sanitizados.
- Cubrir variantes por bookmaker/liga si el provider cambia labels.

### 2. Confirmacion operativa de unknown markets

- Ejecutar discovery live sin filtro canonico estricto o con fixture controlado para confirmar que unknown/provider-specific markets quedan persistidos y visibles.
- Registrar la evidencia live sanitizada o mantener este plan activo con el riesgo aceptado.

## Interfaces/contratos afectados

- `packages/source-connectors/src/markets.ts`
- `packages/source-connectors/tests/markets.test.ts`
- `packages/source-connectors/tests/api-football-client.test.ts`
- `packages/source-connectors/src/clients/api-football.ts`
- `scripts/report-fixture-market-availability.mjs`
- `runbooks/` si se agrega procedimiento operativo

## Dependencias

- Depende de `gana-v8-live-multimarket-provider-validation.md` para obtener ejemplos reales.
- Debe mantener backwards compatibility con `h2h` y slugs previos.
- No debe hardcodear datos sensibles ni payloads completos con credenciales.
- Debe permitir que mercados desconocidos sigan persistiendo bajo slug provider-specific.

## Criterio de done

- Existe evidencia live real sanitizada de `bet.id`/`bet.name` por mercado base o por variante observada.
- El corpus de tests incluye ejemplos derivados de esa evidencia live.
- La corrida de discovery confirma que unknown/provider-specific markets quedan visibles en reportes.
- `pnpm --filter @gana-v8/source-connectors test` pasa.

## Fuentes consolidadas

- Codigo actual: `packages/source-connectors/src/markets.ts`, `packages/source-connectors/src/clients/api-football.ts`, `scripts/report-fixture-market-availability.mjs`.
- Runbook: `runbooks/provider-market-alias-maintenance.md`.
- Plan relacionado: `docs/plans/falta/gana-v8-live-multimarket-provider-validation.md`.
- Observacion de review: el hardening sintetico ya esta materializado, pero el cierre del plan requiere validacion con payloads reales.
