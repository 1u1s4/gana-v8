# Plan de hardening de aliases de mercados del provider - gana-v8

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan despues o junto con la validacion live multi-mercado.

**Goal:** robustecer la normalizacion de mercados de API-Football para que cambios de nombre/id del provider no rompan ingestion, scoring ni reportes.

**Architecture:** ampliar `packages/source-connectors/src/markets.ts` con aliases basados en payloads reales sanitizados, mantener fallback slugificado para mercados desconocidos y exponer unknown/provider-specific markets en reportes de disponibilidad.

**Tech Stack:** TypeScript, node:test, source-connectors, API-Football payloads sanitizados.

---

## Estado actual confirmado

- `packages/source-connectors/src/markets.ts` define claves canonicas: `h2h`, `totals-goals`, `both-teams-score`, `double-chance`, `corners-total`, `corners-h2h`.
- Los aliases por id actuales cubren `1`, `5`, `8`, `12`, `45`.
- Tambien hay heuristicas por nombre para match winner, BTTS, double chance, corners y goals over/under.
- `matchesMarketFilter()` acepta canonical key, nombre normalizado o id.
- Falta validar esos aliases contra payloads reales variados por liga/bookmaker.

## Ya cubierto

- Taxonomia canonica inicial.
- Tests basicos de `normalizeProviderMarketKey()`.
- Fallback slugificado para mercados desconocidos.
- Filtro por `marketKeys` en API-Football client.

## Faltantes exclusivos

### 1. Corpus de aliases reales sanitizado

- Capturar ejemplos reales de `bet.id` y `bet.name` sin incluir secrets ni payload sensible.
- Guardar fixtures test sintéticas derivadas de esos ejemplos.
- Cubrir variantes por bookmaker/liga si el provider cambia labels.

### 2. Aliases por mercado base

- h2h: Match Winner, Full Time Result y variantes.
- totals-goals: Goals Over/Under, Over/Under, Total Goals y variantes.
- BTTS: Both Teams Score, Both Teams To Score, BTTS.
- double-chance: Double Chance, 1X/12/X2 naming.
- corners: Corners Over Under, Total Corners, Corners Match Winner si existe.

### 3. Reporte de unknown markets

- `report-fixture-market-availability` debe mostrar markets desconocidos/provider-specific en una seccion separada.
- No fallar ingestion por mercado desconocido; hacerlo visible para ampliar aliases.

### 4. Proceso de mantenimiento

- Documentar como agregar un alias nuevo con test.
- Evitar depender solo de IDs del provider cuando nombre permite confirmar intencion.

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

- Tests cubren multiples aliases por mercado, no solo un happy path por id.
- `normalizeProviderMarketKey()` no depende exclusivamente de ids fragiles.
- `matchesMarketFilter()` acepta canonical key, provider slug, id y nombre normalizado.
- Los unknown/provider-specific markets quedan visibles en reportes.
- Existe una guia corta para agregar aliases nuevos con test.
- `pnpm --filter @gana-v8/source-connectors test` pasa.

## Fuentes consolidadas

- Codigo actual: `packages/source-connectors/src/markets.ts`, `packages/source-connectors/src/clients/api-football.ts`.
- Plan relacionado: `docs/plans/falta/gana-v8-live-multimarket-provider-validation.md`.
- Observacion de review: aliases actuales son correctos como inicio, pero necesitan validacion con payloads reales.
