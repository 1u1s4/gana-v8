# Arquitectura Hermes-native multiagente y sandbox de prueba para gana-v8

> Estado actual: `FALTA`.
> Pendiente principal: ya existe la base de control plane, workers y sandbox, pero faltan contratos y estados operativos clave del diseño multiagente propuesto.

## 1. Objetivo

Definir una propuesta completa y operable para gana-v8 donde Hermes sea el control plane real del ecosistema: scheduler, routing, subagentes, skills, workers, policies, approvals, observabilidad y sandbox aislado para replay y validación end-to-end.

La propuesta se apoya en:

- la visión v8 ya documentada en `docs/plans/*` de `gana-v8`,
- capacidades existentes y reutilizables de `v0-v7`,
- capacidades Hermes ya presentes en runtime: gateway, cron, skills, approvals, aislamiento de sesión y soporte de sandbox.

## 2. Tesis de diseño

gana-v8 no debe modelarse como una app web con jobs accesorios. Debe modelarse como un sistema operativo de workflows deportivos donde:

- Hermes coordina,
- los workers ejecutan,
- los subagentes investigan y sintetizan,
- las policies deciden límites y gates,
- la consola y Telegram supervisan,
- el sandbox permite probar el ecosistema completo sin tocar producción.

## 3. Principios rectores

1. Hermes coordina pero no hace cómputo pesado.
2. Todo workflow se expresa con contratos explícitos y artefactos versionados.
3. El research es fixture-first y claim-first.
4. La publicación nunca ocurre sin pasar por policy y readiness gates.
5. Prod, stage y sandbox comparten código pero no estado.
6. El sandbox es parte del producto, no una utilidad auxiliar.
7. Cada decisión debe dejar lineage: inputs, prompts, policy, outputs, aprobación y resultado ex post.
8. El uso de web search, skills y herramientas se limita por rol, entorno y budget.

## 4. Arquitectura lógica de alto nivel

### 4.1 Capas

1. Experience layer
   - `apps/operator-console`
   - Telegram Hermes gateway
   - API interna y webhooks

2. Control plane layer
   - `apps/hermes-control-plane`
   - intake de eventos y comandos
   - workflow engine
   - scheduler/cron manager
   - router de tasks y agent assignments
   - approvals
   - policy enforcement

3. Intelligence layer
   - planner de research
   - swarm de subagentes
   - scoring y ranking
   - parlay composition
   - validation y replay

4. Execution layer
   - `apps/ingestion-worker`
   - `apps/research-worker`
   - `apps/scoring-worker`
   - `apps/validation-worker`
   - `apps/publisher-worker`
   - `apps/sandbox-runner`

5. Data/governance layer
   - Postgres operacional
   - raw object store append-only
   - cache/queue/locks
   - audit-lineage store
   - métricas, logs y traces
   - scorecards y artefactos de replay

### 4.2 Regla central de separación

Hermes decide qué hacer, cuándo hacerlo y bajo qué permisos.
Los workers hacen el trabajo determinístico o intensivo.
Los subagentes hacen tareas cognitivas acotadas con contratos, budgets y TTL.

## 5. Control plane Hermes-native

## 5.1 Responsabilidades del control plane

`apps/hermes-control-plane` debe concentrar:

- intake de triggers humanos, crons y eventos,
- creación de workflows con `workflow_id`, `run_id`, `correlation_id`,
- compilación de policy por entorno,
- planificación de tasks,
- asignación a workers o subagentes,
- consolidación de estados,
- approval gates,
- escritura del audit trail de alto nivel,
- exposición de estado operacional a consola/Telegram/API.

## 5.2 Módulos internos sugeridos

- `workflow-orchestrator`
- `cron-scheduler`
- `task-router`
- `agent-assignment-manager`
- `approval-service`
- `policy-compiler`
- `run-manifest-service`
- `incident-escalation-service`
- `environment-overlay-resolver`

## 5.3 Contrato base Hermes → worker/subagente

Extender el patrón ya sugerido en v8:

- `TaskEnvelope`
  - `task_id`
  - `workflow_id`
  - `run_id`
  - `task_type`
  - `environment`
  - `priority`
  - `idempotency_key`
  - `payload_ref`
  - `input_snapshot_refs[]`
  - `policy_context_ref`
  - `deadline_at`
  - `correlation_id`

- `AgentAssignment`
  - `assignment_id`
  - `agent_role`
  - `skill_bundle`
  - `tool_access_profile`
  - `budget_policy`
  - `retry_policy`
  - `timeout_policy`
  - `approval_mode`
  - `output_contract`

## 5.4 Estado operacional del workflow

Estados recomendados:

- `QUEUED`
- `RUNNING`
- `WAITING_INPUT`
- `WAITING_APPROVAL`
- `DEGRADED`
- `BLOCKED`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

Esto mejora el modelo simple de cola de `v0-v7/lib/ops/tasks/*`, que ya aporta una base útil de claiming, locking, polling y task runs.

## 6. Scheduler y crons

## 6.1 Modelo

Hermes debe usar cron como generador de workflows, no como ejecutor final. Cada cron crea un `WorkflowIntent` y el control plane lo traduce a tasks concretas.

## 6.2 Familias de crons

1. Ingestión diaria
   - bootstrap de fixtures futuros
   - refresh de odds
   - refresh de resultados

2. Ingestión intradía
   - refresh por ventana cercana a kickoff
   - polling de lineups / injuries / weather
   - reconciliation de cambios tardíos

3. Research
   - research inicial por fixture elegible
   - refresh de research en T-6h, T-90m, T-30m, T-10m
   - refresh por incidente: lesión, cambio de odds, noticia crítica

4. Scoring/publicación
   - scoring inicial cuando el fixture entra a readiness mínima
   - rescoring por cambios materiales
   - publicación programada por canal/ventana

5. Validación
   - settlement sweep post-match
   - replay nocturno
   - scorecards nightly
   - recalibración/source reliability batch

6. Sandbox
   - smoke por PR
   - replay regression nightly
   - chaos drills programados

## 6.3 Reglas del scheduler

- cron no ejecuta lógica de negocio pesada,
- toda ejecución es idempotente,
- se aplican ventanas de silencio por entorno,
- los cron runs deben respetar inactivity timeouts y budgets,
- cada disparo registra `cron_spec_version` y `trigger_reason`.

## 7. Mapa de workers

## 7.1 ingestion-worker

Reusa temprano lo existente de v0-v7:

- `lib/api-football/*`
- `lib/etl/*`
- `lib/db/*`

Responsabilidades:

- extraer payloads raw,
- persistir raw append-only,
- emitir `SourceIngestionBatch`,
- alimentar canonical pipeline,
- detectar rate limits, duplicados y gaps.

## 7.2 research-worker

Responsabilidades:

- recibir `BuildResearchPlan` o `RefreshResearchBundle`,
- invocar el swarm multiagente,
- normalizar evidencia,
- producir `ResearchBundle`,
- emitir coverage/freshness/contradiction alerts.

## 7.3 scoring-worker

Responsabilidades:

- materializar `FeatureVectorSnapshot`,
- ejecutar inferencia/model registry,
- generar `PredictionArtifact`,
- construir `RankedPredictionBoard`.

## 7.4 validation-worker

Base reutilizable de v0-v7:

- `lib/validation/*`

Evolución v8:

- convertir settlement overwrite-only en runs y rule evaluations versionadas,
- producir scorecards comparables,
- disparar feedback a source reliability y policy tuning.

## 7.5 publisher-worker

Responsabilidades:

- aplicar última `publication policy`,
- formatear salida por canal,
- respetar expiración y retracts,
- bloquear publicación desde sandbox salvo explicit promotion gate.

## 7.6 sandbox-runner

Responsabilidades:

- crear/destruir entorno aislado,
- aplicar profiles,
- inicializar runtime namespace,
- levantar scheduler y workers sandbox,
- ejecutar smoke/replay/backtest/chaos,
- generar reportes y scorecards.

## 8. Subagentes por rol

La capa multiagente debe vivir en `packages/research-engine` con contratos en `packages/research-contracts`.

## 8.1 Supervisor

1. Hermes Research Supervisor
   - coordina el flujo end-to-end,
   - reparte assignments,
   - controla presupuesto,
   - resuelve contradicciones simples,
   - escala conflictos duros a hold/review.

## 8.2 Planner

2. Research Planner Agent
   - decide qué dimensiones investigar,
   - prioriza según kickoff, criticidad, coverage y budget.

## 8.3 Discovery/evidence agents

3. Source Discovery Agent
4. News Intelligence Agent
5. Rumor Verification Agent
6. Lineup & Availability Agent
7. Weather & Venue Agent
8. Market Context Agent

## 8.4 Consolidación y calidad

9. Evidence Normalizer Agent
10. Reliability Judge Agent
11. Research Synthesizer Agent
12. Quality Gate Agent

## 8.5 Operación y post-mortem

13. Validation Analyst Agent
14. Replay Analyst Agent
15. Incident Triage Agent

## 8.6 Regla de diseño de los subagentes

Los subagentes no deben tener acceso irrestricto a terminal, red o escritura. Deben operar con perfiles mínimos:

- herramientas permitidas,
- skills permitidas,
- budget de tokens/llamadas,
- TTL de output,
- contratos de salida obligatorios,
- posibilidad de degradación en vez de fallo total.

## 9. Skills Hermes para gana-v8

## 9.1 Tipos de skills

1. Orchestration skills
   - crear workflow
   - consultar run state
   - reintentar task
   - escalar incidente
   - ejecutar replay

2. Data ops skills
   - inspección de batches raw
   - comparador de snapshots
   - checksum/dedupe
   - bootstrap de fixture pack

3. Research skills
   - búsqueda web enfocada por fixture
   - extracción de claims
   - clasificación de autoridad de fuente
   - resolución de entidades deportivas

4. Validation/replay skills
   - diff baseline vs candidate
   - inspección de lineage
   - scorecard comparativo
   - restatement explorer

5. Operator skills
   - aprobar/rechazar publicación
   - hold/release de fixture
   - override limitado de policy
   - abrir incidente / generar RCA inicial

## 9.2 Principios para skills

- cada skill declara prerequisitos y config,
- se habilita por entorno y por rol,
- puede mapearse a slash commands en gateway/Telegram,
- debe registrar versión y parámetros usados,
- en sandbox puede apuntar a mock/replay/live-readonly según profile.

## 10. Web search como capability gobernada

En v0-v7 ya existe una integración simple (`lib/ai/web-search.ts`) que activa `web_search` como tool. En v8 debe elevarse a capability explícita con policy.

## 10.1 Modos de web search

- `off`
- `auto`
- `required`
- `required-multi-source`
- `sandbox-replay-only`

## 10.2 Reglas de uso

- sólo agentes de research pueden usar web search por defecto,
- claims críticos requieren 2+ fuentes salvo fuente oficial tier A,
- toda cita debe persistir URL, dominio, fetched_at, extracto, hash y claim linkage,
- los resultados de search expiran por TTL según signal type,
- en CI/regression el search debe resolverse por replay o corpus congelado.

## 10.3 Artefactos mínimos

- `SourceRecord`
- `EvidenceItem`
- `Claim`
- `ConflictRecord`
- `ResearchBundle`

## 11. Policies y approvals

## 11.1 Policy engine

`packages/policy-engine` debe evaluar reglas declarativas por entorno y workflow:

- readiness policy
- source admissibility policy
- publication policy
- parlay risk policy
- environment isolation policy
- sandbox provider routing policy
- budget policy
- escalation policy

## 11.2 Niveles de decisión

1. Auto-allow
   - tasks internas de bajo riesgo
   - replay y lectura en sandbox

2. Auto-deny
   - publicar desde sandbox
   - usar credenciales no permitidas en un profile
   - mezclar namespaces de prod y sandbox

3. Human approval required
   - publicación externa
   - override manual de hold
   - promotion de artefactos de sandbox a stage/prod
   - live provider enablement excepcional

## 11.3 Modelo de approval

Hermes ya soporta approvals nativos y botones en gateway/Telegram. gana-v8 debe aprovechar eso con un `ApprovalRequest` estructurado:

- `approval_id`
- `environment`
- `action_type`
- `subject_ref`
- `risk_level`
- `reason`
- `requested_by`
- `expires_at`
- `allow_once | allow_run | deny`

## 11.4 Overrides seguros

- todo override debe dejar motivo y actor,
- nunca reemplaza el artefacto original; crea una nueva decisión enlazada,
- los overrides deben tener vencimiento y scope mínimo,
- un override en sandbox no puede cambiar policy global de prod.

## 12. Observabilidad y auditoría

## 12.1 Señales obligatorias

1. Logs estructurados
   - `environment`
   - `run_id`
   - `workflow_id`
   - `task_id`
   - `assignment_id`
   - `fixture_id`
   - `prediction_id`
   - `policy_version`

2. Metrics
   - throughput por worker
   - scheduler lag
   - queue depth
   - claim coverage/freshness
   - approval latency
   - search hit/corroboration rate
   - publish hold rate
   - replay pass/fail rate

3. Traces
   - trigger -> workflow -> tasks -> subagentes -> artefactos -> publicación/validación

4. Artefactos
   - prompts
   - snapshots
   - raw payload refs
   - diffs baseline/candidate
   - scorecards
   - approval decisions

## 12.2 Dashboards mínimos

- `Ops Overview`
- `Fixture Readiness`
- `Research Coverage & Contradictions`
- `Prediction Pipeline`
- `Publication Gate Status`
- `Validation & Calibration`
- `Sandbox Regression Board`

## 12.3 Incidentes

El control plane debe abrir incidentes automáticamente cuando ocurra alguno de estos casos:

- caída de cobertura crítica,
- contradicción fuerte en lineups/news,
- drift de scorecards sobre umbral,
- fallo reiterado de cron crítico,
- contaminación potencial entre namespaces.

## 13. Sandbox aislado

## 13.1 Objetivo

Proveer un mini-ecosistema Hermes reproducible, reseteable y auditable que ejecute scheduler, workers, skills, sessions, memory y providers sin compartir estado con prod.

## 13.2 Namespaces que deben aislarse

- `env_id`
- `run_id`
- DB/schema
- queues y locks
- object storage prefix
- Redis/keyspace
- memory/vector collections
- secrets/profile
- session IDs y actor IDs
- filesystem temporal

## 13.3 Componentes del sandbox

1. Sandbox Control Plane
2. Overlay Resolver
3. Provider Router
4. Synthetic Data Factory
5. Replay Engine
6. Isolated Workflow Runtime
7. Validation Harness
8. Artifact Store

## 13.4 Profiles recomendados

- `local-dev`
- `ci-smoke`
- `ci-regression`
- `staging-like`
- `historical-backtest`
- `chaos-provider`
- `human-qa-demo`

## 13.5 Routing por provider

Todo provider debe declararse en uno de estos modos:

- `mock`
- `replay`
- `hybrid`
- `live-readonly`
- `live-full` solo fuera de sandbox o con aprobación excepcional

## 13.6 Guardrails del sandbox

- publicación externa deshabilitada por defecto,
- secretos reales sólo por allowlist,
- promotion entre entornos mediante export/import firmado,
- ningún identificador de prod puede escribirse desde sandbox,
- validación de `environment isolation policy` en cada boot del sandbox.

## 14. Cómo Hermes prueba el ecosistema aislado

## 14.1 Patrón general

Hermes debe poder probar el sistema no solo ejecutando unit tests sino corriendo workflows reales en miniatura dentro del sandbox.

Secuencia propuesta:

1. Crear sandbox profile
2. Resolver overlays y provider routing
3. Cargar fixture pack o replay spec
4. Sembrar reloj lógico y dataset
5. Levantar scheduler + colas + workers sandbox
6. Ejecutar runbook de prueba
7. Recolectar artefactos, traces y métricas
8. Evaluar assertions e invariants
9. Emitir scorecard y diff contra baseline
10. Destruir o conservar el sandbox según profile

## 14.2 Tipos de pruebas que Hermes debe correr

1. Smoke end-to-end
   - ingesta -> canonical -> research -> scoring -> publicación interna -> validation simulada

2. Contract tests
   - validar `TaskEnvelope`, `ResearchBundle`, `PredictionArtifact`, `ValidationArtifact`

3. Replay determinístico
   - re-jugar fixtures históricos con snapshots congelados

4. Regression
   - comparar baseline vs candidate por scorecards y golden files

5. Chaos
   - simular 429, 500, timeouts, duplicados y respuestas fuera de orden

6. Approval drills
   - verificar que acciones peligrosas entren en espera y no avancen sin aprobación

7. Isolation tests
   - confirmar que ningún artefacto, lock, cola o secreto de prod sea accesible

## 14.3 Invariantes clave

- no hay side effects externos en sandbox sin flag aprobado,
- todo `PredictionArtifact` referencia snapshots y policy version,
- un `ResearchBundle` crítico sin corroboración suficiente termina en `hold` o `degraded`,
- replay determinístico produce el mismo resultado dentro del umbral esperado,
- chaos no rompe idempotencia ni duplica settlement/publicación,
- destroy del sandbox elimina DB schema, queues, storage prefix y sessions.

## 15. Propuesta de estructura monorepo v8

### Apps

- `apps/hermes-control-plane`
- `apps/operator-console`
- `apps/public-api`
- `apps/ingestion-worker`
- `apps/research-worker`
- `apps/scoring-worker`
- `apps/validation-worker`
- `apps/publisher-worker`
- `apps/sandbox-runner`

### Packages

- `packages/domain-core`
- `packages/contract-schemas`
- `packages/orchestration-sdk`
- `packages/source-connectors`
- `packages/canonical-pipeline`
- `packages/research-contracts`
- `packages/research-engine`
- `packages/feature-store`
- `packages/model-registry`
- `packages/prediction-engine`
- `packages/parlay-engine`
- `packages/validation-engine`
- `packages/publication-engine`
- `packages/policy-engine`
- `packages/audit-lineage`
- `packages/observability`
- `packages/config-runtime`
- `packages/storage-adapters`
- `packages/queue-adapters`
- `packages/authz`
- `packages/testing-fixtures`
- `packages/dev-cli`

## 16. Reuso concreto desde v0-v7

Migrar primero, luego refactorizar:

- `lib/ai/*` como semilla de provider registry, structured output y web-search gating
- `lib/api-football/*` y `lib/etl/*` para ingestion-worker
- `lib/ops/tasks/*` como base del task lifecycle y worker drain
- `lib/atomics/*` hacia prediction-engine
- `lib/parlays/*` hacia parlay-engine
- `lib/validation/*` hacia validation-engine
- `prisma/schema.prisma` como base del modelo operacional
- `app/ops` y `components/ops/*` como insumo para operator-console

## 17. Roadmap recomendado por slices

### Slice 1: Control plane mínimo viable
- `TaskEnvelope`, `WorkflowRun`, `AgentAssignment`
- router de workers
- cron manager
- audit trail base

### Slice 2: Ingestion + canonical
- migrar ETL y provider adapters
- snapshots y raw lineage

### Slice 3: Research swarm
- planner + discovery + lineup/news/weather + synthesizer
- `ResearchBundle` y quality gates

### Slice 4: Scoring/publication
- feature snapshots
- prediction artifacts
- publication policy

### Slice 5: Validation y replay
- run/versioning de settlement
- scorecards y baseline/candidate diff

### Slice 6: Sandbox completo
- overlays
- provider router
- replay engine
- smoke/regression/chaos harness

## 18. Decisiones fuertes recomendadas

1. Hermes debe vivir como app explícita (`apps/hermes-control-plane`), no como lógica dispersa.
2. El scheduler debe crear intents y no ejecutar cómputo pesado.
3. Research multiagente debe producir contratos estructurados, no texto libre consumido aguas abajo.
4. Web search debe ser capability gobernada por policy, no una opción ad hoc del modelo.
5. Sandbox debe reutilizar el mismo código que prod con overlays y namespaces distintos.
6. Approval y publication deben estar desacoplados del scoring.
7. Replay y validación deben tratarse como flujos de primera clase, no como scripts secundarios.

## 19. Resultado esperado

gana-v8 queda definido como una plataforma Hermes-native donde:

- Hermes es el cerebro operativo,
- los workers son el músculo especializado,
- los subagentes son la capa cognitiva dirigida,
- las policies gobiernan riesgo y aislamiento,
- las approvals controlan side effects,
- la observabilidad permite auditoría real,
- el sandbox vuelve verificable todo el ecosistema antes de tocar producción.
