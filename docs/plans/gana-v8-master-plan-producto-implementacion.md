# Master plan de producto e implementación — gana-v8

## 1. Propósito

Definir un plan maestro para gana-v8 que combine visión de producto, alcance, arquitectura, hitos de implementación, entregables, criterios de aceptación, riesgos y orden recomendado de ejecución.

Este plan consolida tres insumos:

1. Lo mejor ya validado en `/root/work/v0-v7`.
2. La intención funcional y operativa documentada en `/root/work/gana-v7/docs`.
3. La nueva visión Hermes multiagente documentada en los planes V8 del workspace.

La tesis central es simple: gana-v8 no debe rehacer desde cero lo que v7 ya resolvió bien; debe extraerlo, modularizarlo y elevarlo a una plataforma operable por Hermes como control plane multiagente, con una sola consola, mayor trazabilidad y ejecución progresivamente más autónoma.

## 2. Objetivo del producto

Construir una plataforma de predicción deportiva y construcción de parlays operada por Hermes que pueda:

- ingerir fixtures, odds, señales complementarias y resultados,
- enriquecer cada fixture con contexto estructurado y research verificable,
- seleccionar automáticamente partidos elegibles,
- producir predicciones atómicas estructuradas,
- componer parlays con reglas de riesgo y correlación,
- validar resultados ex post,
- auditar todo el ciclo de decisión,
- exponer una consola operativa única para supervisión, overrides y publicación.

Objetivo operativo de v8:
transformar el sistema actual, hoy útil pero todavía parcialmente acoplado a Next/UI y a flujos manuales, en una plataforma modular y gobernada por workflows donde Hermes coordina agentes y workers especializados.

## 3. Visión consolidada

### 3.1 Qué preservar de v0-v7

Del análisis de `/root/work/v0-v7` conviene preservar y migrar, no reemplazar, estas capacidades:

- ETL ya dividido en módulos reutilizables: `lib/etl/*`.
- Integración con proveedor deportivo y manejo de cuota: `lib/api-football/*`.
- Runtime AI estructurado y selección de proveedor/modelo: `lib/ai/*`.
- Task queue y drenado de worker: `lib/ops/tasks/*`.
- Motor de atómicas: `lib/atomics/*`.
- Motor de parlays: `lib/parlays/*`.
- Validación y settlement: `lib/validation/*`.
- Esquema de datos amplio y cercano al SRS: `prisma/schema.prisma`.
- Consola operativa ya probada en UX y framing: `app/ops` + `components/ops/*`.

### 3.2 Qué cambiar respecto de v7

gana-v8 debe cambiar cinco cosas estructurales:

1. Separar dominio y ejecución del framework web.
2. Convertir Hermes en orquestador explícito, no en lógica dispersa o informal.
3. Elevar research externo a capability de primera clase, con trazabilidad y quality gates.
4. Introducir aislamiento real entre prod, staging y sandbox.
5. Pasar de módulos útiles a plataforma gobernada por contratos, eventos y artefactos auditables.

### 3.3 Visión final deseada

gana-v8 debe sentirse como una “ops platform” con tres modos coordinados:

- modo ingestión y preparación de datos,
- modo inteligencia/predicción multiagente,
- modo supervisión/validación/publicación.

Hermes actúa como supervisor y policy brain; los workers y agentes especializados ejecutan el trabajo pesado; la consola da visibilidad y control humano mínimo.

## 4. Alcance

### 4.1 In scope

Para el primer release funcional de gana-v8 entra en alcance:

- monorepo modular con apps y packages separados por responsabilidad,
- control plane Hermes para workflows, scheduler, routing y policy,
- ingestion worker para fixtures, odds, estadísticas, resultados y snapshots,
- capa canonical + persistencia operacional + raw/audit lineage,
- research multiagente por fixture con bundle consolidado,
- feature/enrichment pipeline mínimo necesario para scoring,
- motor de predicción atómica estructurada,
- motor de composición de parlays con reglas de correlación y riesgo,
- validación post-partido y settlement,
- operator console única para operación interna,
- API interna/externa estable para lectura de estado y outputs,
- sandbox aislado para replay, smoke, regresión y experimentación,
- observabilidad, logs, métricas y trazabilidad end-to-end.

### 4.2 Out of scope para v8 inicial

Quedan fuera del alcance inicial:

- ejecución real de apuestas con bookmakers,
- pagos, wallets o conciliación financiera,
- marketplace público o app de consumo masivo,
- autoentrenamiento avanzado continuo como prerequisito del MVP,
- expansión multi-deporte completa si compromete foco de fútbol primero,
- research ilimitado sin budgets ni policy gates,
- reemplazo total inmediato de v7 en big bang sin convivencia controlada.

### 4.3 Supuestos

- Se mantiene fútbol como vertical prioritaria.
- Se aprovecha el modelo conceptual de `gana-v7/docs/SRS_v2_consola_autonoma.md`.
- Hermes y su ecosistema multiagente son parte del core de v8, no un add-on.
- La migración debe ser por slices, verificable y reversible.

## 5. Principios rectores

1. Reutilizar primero, reescribir sólo donde el acoplamiento o la visión v8 lo exijan.
2. Contratos explícitos entre módulos antes de UI o automatización avanzada.
3. Persistir raw + canonical + artefactos de decisión para replay y auditoría.
4. Predicción estructurada desde origen; nada crítico debe depender de texto libre.
5. Idempotencia fuerte en ETL, workflows, scoring y validation.
6. Una sola consola operativa, múltiples procesos detrás.
7. Aprobaciones y overrides humanos como excepción, no como paso obligado.
8. Sandbox y test harness como parte del producto, no como deuda futura.
9. Quality gates antes de publicar o promover resultados.
10. Evolución por fases con aceptación objetiva por cada slice.

## 6. Arquitectura de alto nivel

## 6.1 Capas

### A. Experience layer

Canales de entrada y consulta:

- operator console,
- Telegram/CLI/webhooks internos,
- public/internal API.

### B. Orchestration layer

Hermes como control plane:

- supervisor de workflows,
- scheduler/cron manager,
- task router,
- policy engine,
- gestor de subagentes y workers,
- approval gates.

### C. Execution layer

Procesos especializados:

- ingestion-worker,
- research-worker,
- scoring-worker,
- validation-worker,
- publisher-worker,
- sandbox-runner.

### D. Data & knowledge layer

Persistencia separada por propósito:

- raw store append-only,
- operational DB,
- feature store,
- audit store,
- historical warehouse opcional según fase.

### E. Intelligence layer

Capas de decisión:

- enrichment/feature engineering,
- prediction engine,
- ranking y selection engine,
- parlay engine,
- confidence/risk engine,
- post-mortem/validation engine.

### F. Governance layer

- observabilidad,
- tracing,
- data quality,
- lineage,
- prompt/version tracking,
- source reliability,
- publication gates.

### G. Isolation layer

- dev,
- staging,
- prod,
- sandbox por profile.

## 6.2 Componentes principales del monorepo

Estructura objetivo recomendada para gana-v8:

- `apps/hermes-control-plane`
- `apps/operator-console`
- `apps/public-api`
- `apps/ingestion-worker`
- `apps/research-worker`
- `apps/scoring-worker`
- `apps/validation-worker`
- `apps/publisher-worker`
- `apps/sandbox-runner`
- `packages/domain-core`
- `packages/contract-schemas`
- `packages/orchestration-sdk`
- `packages/source-connectors`
- `packages/canonical-pipeline`
- `packages/research-engine`
- `packages/feature-store`
- `packages/prediction-engine`
- `packages/parlay-engine`
- `packages/validation-engine`
- `packages/policy-engine`
- `packages/audit-lineage`
- `packages/observability`
- `packages/storage-adapters`
- `packages/queue-adapters`
- `packages/testing-fixtures`

## 6.3 Reuso recomendado de v7 → v8

### Reusar temprano casi intacto

- `lib/db/*`
- `lib/ai/*`
- `lib/etl/*`
- `lib/api-football/*`
- `lib/ops/tasks/*`
- `lib/validation/*`
- `lib/atomics/*`
- `lib/parlays/*`
- `prisma/schema.prisma`

### Reusar con refactor

- `types/ops.ts` → dividir en dominio, contratos y tipos UI.
- `app/api/*` → convertir en thin adapters.
- `components/ops/*` → migrar a `apps/operator-console` o package de UI.
- `lib/ops/queries.ts` → separar queries de lectura operacional del ensamblado de view models.

### No trasladar tal cual

- imports acoplados a `@/` y a Next como frontera de dominio,
- lógica de negocio embebida en route handlers,
- dependencias implícitas entre UI, Prisma y ejecución de jobs,
- flujos manuales heredados que contradicen la visión automática de v8.

## 7. Modelo operativo objetivo

Flujo recomendado de punta a punta:

1. Scheduler dispara ventana T-24h/T-12h.
2. Ingestion worker captura fixtures, odds y contexto base.
3. Canonical pipeline normaliza entidades y actualiza snapshots.
4. Research supervisor crea agenda por fixture.
5. Swarm de research produce EvidenceItems, Claims y ResearchBundle.
6. Quality gates definen si el fixture queda listo, degradado o bloqueado.
7. Scoring worker genera predicción atómica estructurada.
8. Ranking/policy decide publicabilidad y prioridad.
9. Parlay engine compone selección compuesta con constraints.
10. Publisher entrega outputs a consola/API/canal interno.
11. Post-match ingestion captura resultado final y closing context.
12. Validation worker liquida atómicas y parlays.
13. Audit y observabilidad registran artefactos, métricas y diffs.
14. Sandbox/backtest permite replay y regresión sin tocar prod.

## 8. Fases, milestones y entregables

## Fase 0 — Blueprint y bootstrap del monorepo

Objetivo:
crear la base estructural de gana-v8 sin migrar todavía comportamiento complejo.

Entregables:

- repositorio/monorepo inicial con apps y packages base,
- tooling de build, test, lint y CI mínima,
- package de dominio y contratos iniciales,
- app mínima de control plane con healthcheck,
- operator console placeholder,
- convenciones de config por entorno,
- ADR iniciales de arquitectura.

Criterios de aceptación:

- el monorepo compila en limpio,
- los paquetes base publican tipos/contratos reutilizables,
- CI valida build + test básico,
- existe separación explícita entre apps, packages e infra,
- ningún módulo de dominio depende de Next o de la UI.

## Fase 1 — Contratos, esquema y persistencia base

Objetivo:
trasladar primero el lenguaje del sistema y el modelo de datos.

Entregables:

- `domain-core` y `contract-schemas` con entidades canónicas y eventos,
- esquema Prisma/Postgres base inspirado en v7 y extendido para lineage/research,
- storage adapters y repositories base,
- tablas de runs, tasks, artifacts, audit y provider health,
- estrategia de IDs canónicos y entity resolution.

Criterios de aceptación:

- se generan migraciones sin ambigüedad,
- el esquema cubre fixture, odds, prediction, parlay, validation, task run y audit,
- existen constraints de idempotencia para ingesta y workflows,
- el dominio puede importarse desde cualquier app sin dependencias web,
- hay tests de schema/contract y repositorios mínimos en verde.

## Fase 2 — Ingesta y canonical pipeline

Objetivo:
llevar a v8 la parte más madura y de mayor valor sistémico de v7.

Entregables:

- source connectors reutilizados desde `lib/api-football/*` y equivalentes,
- ingestion-worker operativo,
- raw landing append-only,
- canonical pipeline con upserts determinísticos,
- refresh intradía por fixture y backfill básico,
- manejo de rate limits, retries y deduplicación,
- CLI o comando operativo para correr ETL smoke.

Criterios de aceptación:

- se puede correr ETL sin la app web,
- fixtures y odds quedan persistidos con lineage mínimo,
- reejecutar misma ventana no duplica registros de negocio,
- fallos de proveedor quedan auditados y son reintentables,
- existe snapshot confiable para al menos una jornada completa.

## Fase 3 — Cola operativa, scheduler y worker runtime

Objetivo:
separar definitivamente la ejecución del runtime web e introducir workflows gobernados.

Entregables:

- task queue desacoplada,
- claim/lock/drain/complete/fail con idempotencia,
- scheduler con crons base T-24h, T-12h, T-6h, T-2h, T-30m, post-match y nocturno,
- event envelopes y workflow state machine,
- dashboards mínimos de jobs y errores.

Criterios de aceptación:

- un workflow completo puede dispararse por cron o manualmente,
- jobs concurrentes no procesan dos veces la misma unidad lógica,
- errores dejan estado recuperable y auditado,
- el sistema soporta retries controlados y dead-letter,
- la consola puede consultar estado de cola y runs.

## Fase 4 — Research multiagente y quality gates

Objetivo:
introducir la principal capacidad nueva de v8: research verificable y gobernado por Hermes.

Entregables:

- research supervisor por fixture,
- planner y swarm especializado: news, rumors, lineups, weather, market context,
- normalización a EvidenceItem, Claim, SourceRecord y ResearchBundle,
- scoring de confiabilidad por fuente/claim,
- thresholds de freshness y coverage,
- gates que marcan fixture como ready, degraded o blocked.

Criterios de aceptación:

- cada fixture investigado produce un bundle trazable,
- señales críticas tienen citas, timestamps y source metadata,
- contradicciones quedan visibles y scoreadas,
- fixtures sin evidencia suficiente no se publican como si fueran completos,
- el costo y tiempo de research están acotados por policy y presupuesto.

## Fase 5 — Enrichment, scoring y predicción atómica

Objetivo:
combinar los assets de v7 con la nueva capa de research para generar picks estructurados y auditables.

Entregables:

- feature/enrichment service mínimo,
- prediction-engine con salidas estructuradas,
- integración del runtime AI reutilizando `lib/ai/*`,
- artifacts de predicción con probabilidad, confianza, rationale breve y evidence refs,
- ranking board y selection engine,
- policy de publicación mínima.

Criterios de aceptación:

- cada predicción referencia inputs, versión de prompt/modelo y evidence bundle,
- no se generan outputs productivos en texto libre no parseable,
- el scoring puede ejecutarse por fixture o por jornada,
- un rerun no crea duplicados activos incompatibles,
- existe tablero con picks ordenados y estado publicable/no publicable.

## Fase 6 — Parlay engine y publicación

Objetivo:
armar la capa de decisión compuesta y la salida operativa.

Entregables:

- composición de parlays con límites de legs,
- reglas de correlación, diversidad y riesgo,
- artifact de parlay estructurado y legible,
- publisher-worker para consola/API/Telegram interno,
- trazabilidad entre parlay y legs atómicas.

Criterios de aceptación:

- el parlay nunca mezcla legs inválidos o bloqueados por policy,
- cada leg del parlay se puede rastrear a su artifact atómico,
- existen reglas configurables de composición y exclusión,
- el payload publicable es consistente entre consola y API,
- el sistema puede producir al menos una selección compuesta diaria sin intervención obligatoria.

## Fase 7 — Validación, settlement y scorecards

Objetivo:
cerrar el loop de aprendizaje operativo y medición.

Entregables:

- validation-worker reutilizando lógica de `lib/validation/*`,
- settlement de atómicas y parlays,
- comparación contra resultado real y closing context,
- métricas por mercado, estrategia, fuente y ventana,
- scorecards operativos y post-mortems básicos.

Criterios de aceptación:

- fixtures finalizados actualizan estado de settlement automáticamente,
- atómicas y parlays quedan liquidados con explicación verificable,
- existen métricas básicas de acierto y cobertura,
- validación puede reejecutarse sin corromper resultados,
- la consola muestra estado post-match y trazabilidad de outcome.

## Fase 8 — Operator console unificada

Objetivo:
recuperar y mejorar la mejor UX de v7 dentro de la nueva arquitectura desacoplada.

Entregables:

- migración/refactor de `components/ops/*` a `apps/operator-console`,
- panel único de ETL, queue, enrichment, research, atomics, parlays, validation y audit,
- acciones de override, rerun, approve, exclude, pin,
- streaming/logs operativos,
- filtros por fecha, estado, entorno y criticidad.

Criterios de aceptación:

- la consola opera sobre APIs/casos de uso, no sobre acceso directo al dominio acoplado,
- el operador puede supervisar el día completo desde una sola vista,
- existen acciones de intervención mínima y auditada,
- los estados operativos son consistentes con los workers y la DB,
- la UX cubre al menos el mismo valor operativo que `app/ops` en v7.

## Fase 9 — Sandbox, replay y hardening pre-release

Objetivo:
asegurar que v8 sea experimentable, regresionable y promovible sin riesgo.

Entregables:

- sandbox-runner aislado,
- profiles `local-dev`, `ci-smoke`, `ci-regression`, `staging-like`, `historical-backtest`,
- replay de payloads y fixture packs,
- smoke tests end-to-end,
- regression suite y golden outputs,
- runbooks operativos y de incidente.

Criterios de aceptación:

- un día operativo puede simularse sin tocar prod,
- los contratos principales tienen cobertura de test automatizado,
- hay evidencia de regresión estable antes de release,
- prod y sandbox no comparten namespaces críticos,
- existe checklist de promoción y rollback.

## 9. Criterios globales de aceptación del programa gana-v8

El programa gana-v8 se considerará aceptado como release inicial cuando se cumplan en conjunto estas condiciones:

1. Puede ejecutar un ciclo diario completo: ingestión → research/enrichment → atómicas → parlay → validación.
2. Hermes actúa realmente como orquestador y policy layer, no sólo como interfaz cosmética.
3. El núcleo del dominio corre fuera de Next/UI.
4. Cada artefacto clave tiene trazabilidad mínima: inputs, versión, timestamps, actor/runtime y estado.
5. Existen quality gates que evitan publicar decisiones sin evidencia suficiente.
6. La operator console permite supervisión y override desde una sola vista.
7. El sistema soporta reruns idempotentes y manejo de errores recuperable.
8. Sandbox y regresión existen antes de considerar el reemplazo operativo de v7.
9. Hay convivencia o migración progresiva sin big bang no verificable.
10. El valor funcional de v7 no se pierde durante la migración.

## 10. Riesgos principales y mitigación

### Riesgo 1 — Big bang migration

Problema:
intentar reemplazar v7 completo de una vez.

Mitigación:
- migración por vertical slices,
- convivencia temporal v7/v8,
- aceptación por fase antes de sumar complejidad.

### Riesgo 2 — Sobrediseño multiagente sin throughput real

Problema:
crear demasiados agentes antes de estabilizar contratos y workers.

Mitigación:
- primero control plane + workers + research supervisor mínimo,
- agregar specialist swarm sólo cuando los contratos estén cerrados.

### Riesgo 3 — Acoplamiento residual a Next/UI

Problema:
arrastrar lógica de negocio a adapters web.

Mitigación:
- regla de thin adapters,
- tests de paquetes fuera de app,
- revisión de imports y ownership.

### Riesgo 4 — Falta de idempotencia

Problema:
duplicados de predicción, artifacts o jobs.

Mitigación:
- claves lógicas por workflow,
- constraints de dedupe,
- raw append-only + canonical determinístico + status transitions controladas.

### Riesgo 5 — Research costoso o poco confiable

Problema:
web research caro, lento o ruidoso.

Mitigación:
- policy engine con budgets,
- source tiers,
- freshness windows,
- degraded mode si falta evidencia.

### Riesgo 6 — Observabilidad tardía

Problema:
tener pipeline complejo sin visibilidad de dónde falla.

Mitigación:
- audit store y tracing desde fases tempranas,
- dashboards mínimos desde Fase 3.

### Riesgo 7 — Sandbox como deuda futura

Problema:
llegar a release sin replay ni regression.

Mitigación:
- tratar sandbox como milestone obligatorio pre-release,
- fixture packs y profiles desde etapas medias.

### Riesgo 8 — Pérdida de valor UX respecto de v7

Problema:
mejorar backend pero degradar operación humana.

Mitigación:
- preservar la operator console como producto de primera clase,
- migrarla una vez que los casos de uso backend estén estables.

## 11. Orden recomendado de ejecución

Orden recomendado, de menor riesgo a mayor complejidad acumulada:

1. Bootstrap del monorepo y contratos base.
2. Modelo de datos, persistencia y lineage.
3. ETL/ingestión y canonical pipeline.
4. Task runtime, scheduler y workers.
5. Observabilidad y audit mínimos ya integrados.
6. Research supervisor mínimo y luego swarm especializado.
7. Enrichment/scoring y predicción atómica.
8. Parlay engine.
9. Validación y scorecards.
10. Operator console completa sobre APIs desacopladas.
11. Sandbox, replay y hardening final.
12. Promoción gradual de workloads desde v7 a v8.

Racional del orden:

- primero se construyen las fronteras del sistema,
- luego se migra la parte más madura y reusable,
- después se incorpora la principal novedad de v8, que es el research multiagente,
- finalmente se monta la UX completa y el hardening necesario para operar.

## 12. Release strategy recomendada

### Release A — Foundation

Incluye Fases 0 a 3.
Resultado: plataforma arrancable con ingestión y workflow runtime.

### Release B — Intelligence MVP

Incluye Fases 4 a 6.
Resultado: research, atómicas y parlays productivos internos.

### Release C — Closed-loop Ops

Incluye Fases 7 y 8.
Resultado: ciclo completo con validación y consola unificada.

### Release D — Production hardening

Incluye Fase 9.
Resultado: sandbox, replay, regresión y readiness de promoción.

## 13. Definición práctica de éxito

gana-v8 será exitoso si logra simultáneamente:

- conservar el valor probado de v7,
- reducir acoplamiento y fragilidad operativa,
- introducir research multiagente útil y gobernado,
- operar un ciclo diario con trazabilidad completa,
- permitir a un operador humano controlar todo desde una sola consola,
- habilitar mejora continua con sandbox, replay y post-mortems.

## 14. Recomendación ejecutiva final

La mejor estrategia no es “construir gana-v8” como un producto completamente nuevo, sino “evolucionar v7 a una plataforma Hermes-native” mediante extracción disciplinada de dominio, workers y contratos.

En términos prácticos:

- reutilizar fuerte ETL, AI runtime, atomics, parlays, validation y schema de v7,
- reconstruir la arquitectura alrededor de Hermes control plane + workers + contracts,
- agregar research multiagente y sandbox como grandes capacidades nuevas,
- dejar la consola como capa final de consolidación, no como punto de partida técnico.

Esa secuencia maximiza velocidad, minimiza regresión y mantiene foco en valor operativo real.