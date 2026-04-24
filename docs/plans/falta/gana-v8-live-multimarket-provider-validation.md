# Plan de validacion live multi-mercado contra provider - gana-v8

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan. Mantener secretos fuera de logs, docs y commits.

**Goal:** demostrar con evidencia real que API-Football devuelve y el harness persiste mercados multi-mercado y statistics para fixtures de ligas top.

**Architecture:** ejecutar corridas live acotadas con fixtures conocidos, usar `scripts/report-fixture-market-availability.mjs` como fuente de evidencia y registrar gaps por mercado sin convertir ausencias del provider en fallas del pipeline base.

**Tech Stack:** Node scripts, pnpm, Prisma/MySQL, API-Football, `run-live-ingestion.mjs`, `report-fixture-market-availability.mjs`.

---

## Estado actual confirmado

- El harness ya implementa ingestion multi-mercado y fixture statistics.
- `scripts/run-live-ingestion.mjs` soporta modos `fixtures`, `odds`, `statistics` y `both`.
- `GANA_FOOTBALL_MARKET_KEYS` permite pedir mercados como `h2h,totals-goals,both-teams-score,double-chance,corners-total`.
- `scripts/report-fixture-market-availability.mjs` existe para reportar mercados disponibles/faltantes por fixture.
- Corners sigue siendo experimental y requiere `GANA_ENABLE_CORNERS_MARKETS=1` para scoring.
- Falta una validacion live documentada con fixtures reales que pruebe que los mercados existen en el provider y quedan persistidos.

## Ya cubierto

- Taxonomia canonica de mercados.
- Ingestion y persistencia de odds multi-mercado.
- Ingestion y persistencia de fixture statistics.
- Scoring/publisher/validation multi-mercado con tests.
- Public API/operator-console con labels y corners stats.

## Faltantes exclusivos

### 1. Fixture set live canonico

- Definir un set pequeno de fixtures por liga top para validar mercado real.
- Preferir fixtures scheduled proximas con odds disponibles y fixtures completed para statistics.
- Evitar fixtures sinteticas o 2099.

### 2. Corrida live reproducible

- Documentar comandos con envs, sin exponer valores.
- Separar corrida base de mercados score-derived de corrida experimental de corners.
- Guardar outputs/artifacts sanitizados con market availability.

### 3. Matriz provider vs harness

- Para cada fixture, listar mercados pedidos, mercados disponibles, bookmakers, snapshot count y latest capturedAt.
- Distinguir `provider_missing` de `harness_failed`.
- Registrar si fixture statistics trae corners home/away o no.

### 4. Criterio de promocion operativa

- Definir cuando un mercado pasa de "implementado en tests" a "validado live".
- Mantener corners como experimental hasta que odds + statistics + settlement esten probados en vivo.

## Interfaces/contratos afectados

- `scripts/run-live-ingestion.mjs`
- `scripts/run-live-ingestion-top-leagues.mjs`
- `scripts/report-fixture-market-availability.mjs`
- `scripts/top-football-leagues.mjs`
- `apps/ingestion-worker/src/index.ts`
- `apps/scoring-worker/src/index.ts`
- `apps/validation-worker/src/index.ts`
- `runbooks/`
- `docs/plans/falta/`

## Dependencias

- Requiere `.env` local con DB/API-Football, pero el plan no debe imprimir secretos.
- Depende de que la DB real este migrada: `pnpm prisma migrate status --schema prisma/schema.prisma`.
- Depende de fixtures reales con odds disponibles en API-Football.
- No debe bloquear el flujo base si corners o algun mercado no esta disponible por provider/bookmaker.

## Criterio de done

- Existe un runbook o doc con comandos live reproducibles y sanitizados.
- Se ejecuta al menos una corrida live para mercados base: `h2h,totals-goals,both-teams-score,double-chance`.
- Se ejecuta una corrida separada experimental para `corners-total` y fixture statistics.
- `report-fixture-market-availability` produce evidencia por fixture con available/missing markets.
- Se documentan gaps del provider como tales, sin confundirlos con errores del harness.
- Se confirma si cada mercado esta: `implemented`, `live-validated`, `provider-missing` o `experimental`.

## Fuentes consolidadas

- Codigo actual: `scripts/run-live-ingestion.mjs`, `scripts/report-fixture-market-availability.mjs`, `apps/ingestion-worker/src/index.ts`.
- Validacion previa de tests: source-connectors, ingestion-worker, scoring-worker, publisher-worker, validation-worker, public-api, operator-console.
- Observacion de review: faltaba corrida live end-to-end multi-mercado despues de implementar el loop.
