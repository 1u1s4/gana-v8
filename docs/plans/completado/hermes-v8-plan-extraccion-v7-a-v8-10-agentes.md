# Plan de extracción v7 → v8 con 10 subagentes

> Para Hermes: este plan sintetiza una fase real de análisis distribuido con 10 subagentes. Úsalo como documento rector para ejecutar la migración de `v0-v7` a `gana-v8` por slices, worktrees y merges controlados.

## 1. Resultado del análisis distribuido

Se usaron 10 subagentes para auditar por separado:

1. estructura general de `v0-v7`
2. visión funcional de `gana-v7`
3. consola operativa UX de `v0-v7`
4. ETL + conectores API + jobs de ingestión
5. runtime AI + atómicas + parlays
6. validación ex post + auditoría + replay
7. datos + contratos + persistencia
8. arquitectura Hermes multiagente + sandbox
9. gobernanza Git + ramas + worktrees + merges
10. testing + QA + ecosistema aislado

Conclusión unificada:
- `v0-v7` ya resolvió gran parte del dominio útil.
- `gana-v7` sigue siendo el contrato funcional del producto.
- `gana-v8` ya existe como repo y visión, pero todavía necesita materializar apps, packages, tests y slices reales.
- La migración correcta no es copiar `app/` primero, sino extraer dominio, datos, ETL, runtime y validación antes de UI.
- Hermes debe pasar a ser control plane explícito, no integración informal.

## 2. Tesis de v8

`gana-v8` será una plataforma Hermes-native para predicción diaria de partidos que pueda:
- extraer fixtures, odds, señales y resultados vía API y web research
- normalizar y persistir raw + canonical + operational + audit data
- despachar research multiagente por fixture
- producir predicciones atómicas estructuradas
- construir parlays con reglas de riesgo y correlación
- guardar artefactos, predicciones y explicaciones
- validar resultados ex post y recalcular scorecards
- operar todo desde una sola consola y desde workflows cron gobernados por Hermes
- probar el ecosistema completo en sandbox aislado antes de tocar prod

## 3. Qué preservar de v7

### Migrar casi intacto
- `prisma/schema.prisma` como fuente para el primer modelado
- `lib/api-football/*`
- buena parte de `lib/ai/*`
- partes reutilizables de `lib/etl/*`
- `lib/ops/tasks/*`
- `lib/validation/*`
- piezas de `lib/atomics/*`
- piezas de `lib/parlays/*`
- el framing UX de `app/ops` + `components/ops/*`

### Migrar con refactor
- `types/ops.ts` → dividir en dominio, contratos, eventos, view models
- `lib/etl/runner.ts` → partir en orquestación, conectores, persistencia, progreso y snapshots
- `lib/ops/queries.ts` → separar repositories, read models y view assembly
- `app/api/*` → convertir en thin adapters
- `components/ops/*` → reconstruir como core de consola + adapters fútbol

### No trasladar tal cual
- lógica de negocio atada a route handlers
- dependencia de Next como frontera de dominio
- mezcla de UI, Prisma y jobs en el mismo flujo
- scripts sueltos sin contrato ni ubicación estable

## 4. Arquitectura objetivo

## 4.1 Apps
- `apps/hermes-control-plane`
- `apps/operator-console`
- `apps/public-api`
- `apps/ingestion-worker`
- `apps/research-worker`
- `apps/scoring-worker`
- `apps/validation-worker`
- `apps/publisher-worker`
- `apps/sandbox-runner`
- `apps/dev-cli`

## 4.2 Packages
- `packages/domain-core`
- `packages/contract-schemas`
- `packages/storage-adapters`
- `packages/source-connectors`
- `packages/canonical-pipeline`
- `packages/orchestration-sdk`
- `packages/research-engine`
- `packages/prediction-engine`
- `packages/parlay-engine`
- `packages/validation-engine`
- `packages/policy-engine`
- `packages/audit-lineage`
- `packages/observability`
- `packages/testing-fixtures`
- `packages/ui-operator`

## 4.3 Stores de datos
- raw store append-only
- canonical store versionado
- operational store para workflows, AI runs, predicciones y estados
- audit store append-only para lineage, transitions y replay

## 5. Flujo operativo v8

1. Cron diario/intradía genera `workflow intents`
2. Hermes control plane decide prioridad, budget, policies y fan-out
3. Ingestion worker extrae datos desde APIs y persiste raw
4. Canonical pipeline normaliza entidades y crea snapshots
5. Research worker lanza subagentes especializados por fixture
6. Prediction engine produce forecast + candidatos + atómica publicada
7. Parlay engine optimiza legs con reglas de riesgo/correlación
8. Publisher worker guarda salidas listas para consumo interno
9. Validation worker detecta resultados finales y liquida picks/parlays
10. Scorecards y replay actualizan performance, calibration y auditoría
11. Operator console y API leen el estado consolidado

## 6. Slices y orden de ejecución

### Slice 0 — Foundation real
Objetivo:
materializar el monorepo, no sólo documentarlo.

Entregables:
- apps y packages vacíos pero compilables
- shared tsconfig, eslint, test y turbo pipeline
- imports internos por workspace
- health checks mínimos
- docs/plans actualizados

### Slice 1 — Domain + contracts + persistence
- `packages/domain-core`
- `packages/contract-schemas`
- `packages/storage-adapters`
- primer corte del schema
- mappers y repositories base

### Slice 2 — ETL y conectores
- `packages/source-connectors`
- `packages/canonical-pipeline`
- `apps/ingestion-worker`
- `apps/dev-cli`
- jobs `ingest.fixtures.window`, `ingest.odds.window`, `canonicalize.raw-batch`

### Slice 3 — Orquestación y workers
- `packages/orchestration-sdk`
- `apps/hermes-control-plane`
- envelopes de tarea, attempts, locks, retries, DLQ

### Slice 4 — Runtime AI y research
- `packages/research-engine`
- integración de subagentes por rol
- prompt/version catalog
- policy gates para web search

### Slice 5 — Predicciones atómicas
- `packages/prediction-engine`
- artifacts de forecast y candidate set
- publicación de atómica vigente

### Slice 6 — Parlays
- `packages/parlay-engine`
- optimizador deterministic-first
- matriz de correlación y policy rules

### Slice 7 — Validación y replay
- `packages/validation-engine`
- historial de settlement
- replay, restatement y scorecards

### Slice 8 — API y consola
- `apps/public-api`
- `apps/operator-console`
- operator core desacoplado del dominio
- adapters fútbol sobre view models estables

### Slice 9 — Sandbox, QA y promoción
- `apps/sandbox-runner`
- `packages/testing-fixtures`
- perfiles Hermes aislados
- gates dev → staging → prod

## 7. Diseño Hermes-native

Hermes será el control plane y tendrá responsabilidades explícitas:
- scheduler/crons
- policy engine
- budget control
- subagent router por rol
- approvals y overrides
- orchestration de workers
- observabilidad y trazabilidad
- sandbox orchestration

### Roles sugeridos de subagentes
- data-ingestion-analyst
- connector-operator
- fixture-researcher
- odds-researcher
- news-injury-researcher
- lineups-researcher
- forecast-generator
- risk-analyst
- parlay-optimizer
- validation-auditor
- replay-runner
- operator-console-reviewer

## 8. Estrategia Git y paralelismo

### Ramas de integración
- `integration/foundation`
- `integration/contracts-data`
- `integration/etl`
- `integration/ops-runtime`
- `integration/ai-runtime`
- `integration/predictions-atomics`
- `integration/predictions-parlays`
- `integration/validation`
- `integration/web-adapters`
- `integration/ui-console`
- `integration/hardening`
- `release/v8-cutover`

### Regla de ejecución
- cada subagente trabaja en `slice/*`
- cada slice mergea primero a su rama `integration/*`
- `main` sólo recibe merges cuando la integración del slice esté verde
- evitar tocar al mismo tiempo:
  - `schema.prisma`
  - `package.json`
  - `pnpm-workspace.yaml`
  - barrels `index.ts`
  - contratos de streams

## 9. Testing y promoción

Taxonomía mínima:
- contract tests
- integration tests
- smoke diarios
- replay tests
- sandbox tests
- subagent tests
- promotion gates

Perfiles sugeridos:
- `local-dev`
- `ci-smoke`
- `ci-regression`
- `staging-like`
- `historical-backtest`
- `chaos-provider`
- `human-qa-demo`

## 10. Fase ejecutiva inmediata

### Tramo A
- materializar monorepo
- crear packages base
- crear apps base
- typecheck/build/lint/test mínimos en verde

### Tramo B
- migrar contratos y dominio core
- introducir storage adapters y schema inicial

### Tramo C
- migrar ETL + conectores + jobs de ingestión
- exponer smoke CLI

### Tramo D
- migrar runtime AI, research y predicciones

### Tramo E
- migrar parlays, validación, API, console, sandbox y QA

## 11. Definición de done para v8 inicial

Se considera que v8 quedó operable cuando:
- un cron diario puede correr sobre un entorno aislado
- ETL guarda raw + canonical + operational artifacts
- Hermes puede lanzar research multiagente por fixture
- el sistema genera atómicas estructuradas y parlays gobernados
- las predicciones y sus artefactos quedan persistidos y consultables
- validation worker liquida resultados ex post
- operator console muestra snapshot, streams y trazas
- existe sandbox reproducible con perfiles separados
- hay smoke diario, replay y gates de promoción

## 12. Riesgos principales
- copiar UI antes de estabilizar contratos
- mantener `types/ops.ts` como mega archivo
- portar `runner.ts` y `queries.ts` sin partirlos
- seguir usando Prisma/Next como frontera de dominio
- hacer big bang migration
- introducir research multiagente antes de cerrar ETL + runtime + policies
- no separar prod/staging/sandbox desde el principio

## 13. Próximo paso recomendado

Ejecutar ya la migración real por worktrees:
1. foundation
2. contracts-data
3. etl
4. ops-runtime
5. ai-runtime
6. atomics
7. parlays
8. validation
9. api/ui
10. sandbox/qa
