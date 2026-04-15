# gana-v8 — slice de testing, QA y ecosistema aislado

## 1. Objetivo

Definir un slice accionable para que Hermes pueda probar gana-v8 de punta a punta sin tocar producción, complementando el master plan v8 y reutilizando lo ya validado en `v0-v7`.

Este slice cubre:

- smoke tests diarios,
- contract tests,
- sandbox con datos sintéticos,
- replay determinístico,
- validación de cron workflows,
- pruebas de subagentes,
- gates de promoción `dev -> staging -> prod`,
- aislamiento de un Hermes de prueba con profiles, memoria y datos separados.

La meta no es sólo "tener tests", sino crear un runtime verificable donde Hermes pueda ejecutar el ciclo completo:

ingesta -> research -> scoring -> parlays -> validación -> operator console -> publicación interna simulada

sin compartir estado, secretos ni side effects con prod.

## 2. Base reutilizable desde v0-v7

Lo ya existente en `v0-v7` permite arrancar este slice más rápido:

1. Suite Vitest ya operativa
   - `lib/ai/*.test.ts`
   - `lib/atomics/output-schema.test.ts`
   - `lib/ops/tasks/*.test.ts`
   - `lib/db/retry.test.ts`
   - `app/api/ops/*/*.test.ts`

2. Contratos parciales ya expresados en Zod
   - `lib/atomics/output-schema.ts`
   - `lib/parlays/output-schema.ts`
   - `lib/ai/allowed-models-schema.ts`
   - validación de request payloads en `app/api/*/route.ts`

3. Runtime operativo reusable
   - ETL: `lib/etl/*`
   - cola/worker: `lib/ops/tasks/*`
   - AI runtime: `lib/ai/*`
   - atomics: `lib/atomics/*`
   - parlays: `lib/parlays/*`
   - validation: `lib/validation/*`
   - worker loop: `scripts/ops-worker.ts`

4. Gaps que v8 debe cerrar
   - tests centrados en módulos, no en ecosistema completo,
   - falta de sandbox aislado por namespace,
   - falta de replay end-to-end determinístico,
   - falta de gates de promoción formales,
   - falta de pruebas explícitas para crons, subagentes y publicación segura.

## 3. Principios rectores del slice

1. Testear el sistema como producto, no sólo paquetes aislados.
2. Todo test importante debe correr en `sandbox` o `staging-like`, nunca contra prod.
3. Replay y synthetic packs son activos de producto versionados.
4. Contract tests bloquean drift entre apps, packages y workers.
5. Los smoke diarios deben ser baratos, rápidos y confiables.
6. Las regresiones nocturnas deben ser determinísticas y comparables contra golden outputs.
7. Ningún workflow promociona artefactos si falla data quality, policy, contract o replay parity.
8. Hermes de prueba debe tener identidad, memoria, colas, storage y secretos separados.

## 4. Alcance del slice por dominios

El slice de testing debe cubrir explícitamente estas superficies:

1. ETL y canonical pipeline
2. AI/runtime y provider routing
3. predicciones atómicas
4. parlays
5. validation/settlement/scorecards
6. control plane Hermes
7. crons y scheduler
8. subagentes de research
9. operator console
10. workers y colas
11. publisher interno simulado
12. observabilidad, audit y lineage

## 5. Taxonomía de pruebas recomendada

## 5.1 Nivel A — static y schema gates

Objetivo:
romper lo más temprano posible.

Incluye:

- lint
- typecheck
- schema generation
- migration validation
- contract checksum validation
- config/profile validation

Artifacts a validar:

- `TaskEnvelope`
- `WorkflowIntent`
- `ResearchBundle`
- `FeatureVectorSnapshot`
- `PredictionArtifact`
- `ParlayArtifact`
- `ValidationRun`
- `PublishedPayload`
- `RunManifest`
- `EnvironmentOverlay`

Gate mínimo:
ningún PR entra a `main` si estos checks fallan.

## 5.2 Nivel B — unit y property tests

Objetivo:
blindar lógica determinística.

Cobertura prioritaria:

- mapping raw -> canonical
- deduplicación e idempotencia ETL
- scoring/ranking helpers
- correlación y exclusión de parlays
- settlement rules
- policy evaluation
- routing de providers `mock/replay/live-readonly`
- compilación de overlays por entorno
- validadores de artefactos y envelopes

Reuso v0-v7:
portar primero las suites existentes de `lib/ai`, `lib/ops/tasks`, `lib/atomics`, `lib/db`.

## 5.3 Nivel C — contract tests

Objetivo:
verificar que productores y consumidores compartan el mismo contrato real.

Tipos:

1. Provider contract tests
   - raw payload archivado valida contra schema raw versionado
   - mapper raw -> canonical produce contrato esperado

2. App/package contract tests
   - control plane -> worker
   - worker -> artifact store
   - research-worker -> scoring-worker
   - validation-worker -> operator console views

3. AI output contract tests
   - prompts y adapters sólo pueden persistir JSON que matchee schema
   - fallbacks también deben cumplir contrato

4. UI/API contract tests
   - operator console consume snapshots y details estables
   - API interna y consola comparten `view schemas`

Regla operativa:
si cambia un contrato mayor, se exige:

- nuevo `contract_version`,
- fixtures actualizados,
- golden outputs regenerados,
- changelog del contrato.

## 5.4 Nivel D — integration tests por slice

Objetivo:
probar wiring entre paquetes sin necesidad de día operativo completo.

Suites mínimas:

1. ETL integration
   - ingest raw payload pack
   - persist raw
   - canonicalizar
   - verificar snapshots e idempotencia

2. Workflow integration
   - crear `WorkflowIntent`
   - encolar tasks
   - claim/lock/complete
   - verificar retries y dead-letter

3. Prediction integration
   - fixture ready
   - research bundle disponible
   - scoring produce `PredictionArtifact`
   - ranking/policy clasifica publicable/no publicable

4. Parlay integration
   - toma board de atómicas activas
   - aplica reglas de correlación y riesgo
   - produce parlay + lineage a legs

5. Validation integration
   - fixture final + outcome observation
   - settlement rules
   - scorecard actualizado

## 5.5 Nivel E — sandbox e2e

Objetivo:
simular el ecosistema completo.

Perfiles base:

- `local-dev`
- `ci-smoke`
- `ci-regression`
- `staging-like`
- `historical-backtest`
- `chaos-provider`
- `human-qa-demo`

Estos perfiles ya están alineados con el plan de sandbox previo; este slice los convierte en gates operativos.

## 6. Estructura concreta a agregar en gana-v8

Se recomienda materializar este slice con esta estructura:

```text
apps/
  sandbox-runner/
  hermes-control-plane/

packages/
  contract-schemas/
  testing-fixtures/
  observability/
  policy-engine/
  orchestration-sdk/

tests/
  contract/
    provider/
    workflow/
    artifacts/
    console/
  integration/
    etl/
    runtime/
    scoring/
    parlays/
    validation/
  smoke/
    daily/
    cron/
    operator/
  replay/
    daily-window/
    historical/
  sandbox/
    profiles/
    scenarios/
  agents/
    planner/
    lineup/
    weather/
    rumor/
    synthesizer/
  promotion/
    dev-to-staging/
    staging-to-prod/

fixtures/
  providers/
  canonical/
  research/
  predictions/
  validation/
  synthetic/
  replays/
  goldens/

registry/
  profiles/
  prompts/
  rule-packs/
  contracts/
```

## 7. Sandbox aislado: diseño operativo mínimo

## 7.1 Namespace obligatorio

Cada sandbox debe tener:

- `env_id = sbx-{profile}-{run_id}`
- Postgres schema o DB dedicada
- Redis DB/prefix dedicado
- object storage prefix dedicado
- artifact prefix dedicado
- queue namespace dedicado
- cron registry dedicada
- lock namespace dedicado
- temp filesystem dedicado
- Hermes memory namespace dedicado
- `session_id` prefijado
- `hermes_instance_id` propio
- secrets overlay con publicación deshabilitada

## 7.2 Run manifest obligatorio

Toda corrida sandbox debe persistir un `RunManifest` con:

- `run_id`
- `env_id`
- `profile_name`
- `git_sha`
- `contract_versions`
- `prompt_versions`
- `rule_pack_versions`
- `provider_routing_policy`
- `fixture_pack_refs`
- `synthetic_seed`
- `logical_clock`
- `budget_policy`
- `started_at`, `completed_at`
- `result_status`

## 7.3 Provider routing por profile

Matriz mínima:

- sports provider: `replay` o `mock`
- odds provider: `replay`
- weather: `mock` o `live-readonly`
- search/news: `mock` o `replay`
- LLM: `mock`, `replay` o `live-readonly` según profile
- Telegram/publicación: `disabled`
- bankroll/publishing externo: `disabled`

## 8. Datos sintéticos y fixture packs

## 8.1 Tipos de packs necesarios

1. `tiny-smoke-pack`
   - 1 liga
   - 2 a 4 fixtures
   - 1 fixture ready
   - 1 fixture bloqueado por research
   - 1 fixture con cambios de odds
   - 1 fixture finalizado para validation

2. `daily-ops-pack`
   - jornada completa chica
   - ventanas T-24h -> post-match
   - atómicas + parlays + validation

3. `historical-replay-pack`
   - payloads raw históricos con secuencia temporal
   - lineups tardías
   - odds drift
   - outcome final oculto hasta el final del replay

4. `chaos-pack`
   - 429
   - 500
   - timeouts
   - duplicados
   - payload corrupto
   - corrección tardía

5. `operator-demo-pack`
   - datos navegables y visuales para consola
   - incidentes, retries y diffs visibles

## 8.2 Reglas del synthetic factory

Debe generar entidades coherentes entre sí:

- ligas, equipos, players, venues
- calendarios válidos
- odds consistentes con probabilidades aproximadas
- lesiones/sanciones alineadas con lineups
- weather con impacto plausible
- claims/news/rumors con timestamps y fuentes
- resultados finales compatibles con los mercados evaluados

## 8.3 Semillas obligatorias

Guardar semilla fija por pack:

- `seed_core_entities`
- `seed_market_drift`
- `seed_research_noise`
- `seed_validation_outcomes`

Esto permite regenerar datasets sintéticos sin drift accidental.

## 9. Smoke tests diarios

## 9.1 Objetivo

Detectar roturas gruesas todos los días antes de pensar en release.

## 9.2 Suite diaria mínima

Debe correr en `ci-smoke` y durar idealmente menos de 10-15 minutos.

Casos:

1. Smoke ETL
   - ingesta `tiny-smoke-pack`
   - raw persisted
   - canonical persisted
   - rerun no duplica negocio

2. Smoke control plane
   - cron genera `WorkflowIntent`
   - router encola tasks correctas
   - worker consume y completa

3. Smoke research/scoring
   - fixture elegible produce `ResearchBundle`
   - scoring produce `PredictionArtifact`
   - artifact cumple schema

4. Smoke parlay
   - board de atómicas -> parlay candidato
   - policy lo clasifica correctamente

5. Smoke validation
   - fixture finalizado -> settlement automático
   - scorecard actualizado

6. Smoke operator console
   - snapshot general responde
   - detalle de workflow, ai run y prediction cargan

7. Smoke safety
   - publisher externo bloqueado
   - secrets de prod ausentes
   - namespaces de sandbox válidos

## 9.3 Ejecución recomendada

- diario por cron interno
- en cada merge a `main`
- manual desde Hermes: `run sandbox ci-smoke`

## 10. Contract tests accionables

## 10.1 Contratos prioritarios fase 1

1. `TaskEnvelopeV1`
2. `WorkflowIntentV1`
3. `CanonicalFixtureV1`
4. `CanonicalMarketSnapshotV1`
5. `ResearchTaskV1`
6. `ResearchBundleV1`
7. `AtomicPredictionInputV1`
8. `AtomicPredictionOutputV1`
9. `ParlayPredictionOutputV1`
10. `ValidationResolvedV1`
11. `PublishedPayloadV1`
12. `ConsoleSnapshotViewV1`

## 10.2 Regla de enforcement

Cada contrato debe tener:

- schema runtime
- fixture válido
- fixture inválido
- checksum del schema
- consumer tests
- producer tests

## 10.3 Fuentes de verdad iniciales

A partir de v0-v7 se recomienda migrar primero:

- `lib/atomics/output-schema.ts`
- `lib/parlays/output-schema.ts`
- request schemas con Zod
- tipos de `ops` relevantes pero ya separados por dominio

## 11. Replay determinístico

## 11.1 Qué debe soportar el replay

1. replay de día operativo completo
2. replay de fixture individual
3. replay de AI run
4. replay de settlement
5. replay diferencial baseline vs candidate

## 11.2 Inputs congelados

El replay debe congelar:

- raw payload refs
- canonical snapshots
- research bundle snapshots
- prompt/template version
- model selection
- rule pack version
- policy version
- logical clock

## 11.3 Salidas comparables

Comparar al menos:

- artifacts producidos
- estado de workflows
- scorecards
- clasificación publicable/no publicable
- métricas de costo/latencia
- diffs de confianza, ranking y rationale estructurado

## 11.4 Thresholds sugeridos

- schema mismatch: fail duro
- cambio de decisión publicable: fail duro salvo allowlist
- drift de probabilidad > umbral: warning/fail según mercado
- diferencia de scorecard > umbral: fail
- latencia/costo fuera de budget: fail en staging-like

## 12. Validación de cron workflows

## 12.1 Crons a cubrir

1. T-24h ingestión inicial
2. T-12h refresh de jornada
3. T-6h research inicial
4. T-90m / T-30m refresh lineups-news-weather
5. pre-publicación scoring/parlay
6. post-match settlement
7. nightly replay + scorecards

## 12.2 Qué verificar en cada cron test

- genera un `WorkflowIntent` con `cron_spec_version`
- crea las tasks correctas
- respeta ventanas y silencios por entorno
- no dispara duplicados con misma key lógica
- maneja retry sin duplicar outputs activos
- deja audit trail y métricas

## 12.3 Harness recomendado

Usar reloj virtual y cron registry sandbox:

- adelantar tiempo a hitos definidos
- inspeccionar workflows generados
- drenar workers
- validar estados finales y artefactos

## 13. Pruebas de subagentes

## 13.1 Roles a testear

- planner
- source discovery
- news intelligence
- rumor verification
- lineup & availability
- weather & venue
- market context
- evidence normalizer
- reliability judge
- research synthesizer

## 13.2 Tipos de prueba por subagente

1. Contract test
   - input/output schema válido

2. Deterministic replay test
   - mismo fixture pack + mismo seed -> mismo output estructurado

3. Adversarial test
   - fuentes contradictorias
   - rumor sin corroboración
   - lineup oficial tardía
   - weather inconsistente

4. Budget/policy test
   - respeta timeout, tool budget y source allowlist

5. Escalation test
   - contradicción crítica -> `DEGRADED` o `BLOCKED`

## 13.3 Regla de aceptación

Ningún subagente puede promover un claim crítico a señal utilizable sin:

- source metadata,
- timestamp,
- evidence ref,
- confidence score,
- estado de corroboración.

## 14. Operator console QA

La consola debe validarse como consumidor de artefactos, no como fuente de verdad.

Pruebas mínimas:

1. snapshot general del día
2. detalle de workflow con tasks y estados
3. detalle de prediction con lineage
4. detalle de parlay con legs
5. detalle de validation/scorecard
6. vista de incidentes/retries/dead-letter
7. filtros por entorno, profile y fixture
8. bloqueo visual de acciones no permitidas en sandbox

Reusar como base conceptual lo ya existente en `app/ops` y `lib/ops/queries.ts` de `v0-v7`, pero migrando a vistas desacopladas y versionadas.

## 15. Gates de promoción dev -> staging -> prod

## 15.1 Gate dev -> staging

Requisitos obligatorios:

- lint/typecheck verdes
- unit + contract + integration verdes
- `ci-smoke` verde
- migraciones aplican en DB efímera
- no hay cambios de contrato sin versión
- replay baseline vs candidate sin fail duro en `tiny-smoke-pack`

Resultado:
se permite desplegar a `staging-like`.

## 15.2 Gate staging -> pre-prod signoff

Requisitos obligatorios:

- `staging-like` e2e verde
- replay de `daily-ops-pack` verde
- cron workflow validation verde
- operator console QA básica verde
- chaos subset verde
- budgets de research/AI dentro de umbral
- publisher externo sigue deshabilitado
- rollback plan validado

Resultado:
se habilita candidato de release.

## 15.3 Gate pre-prod -> prod

Requisitos obligatorios:

- nightly regression estable por N corridas consecutivas
- scorecards no muestran drift material no explicado
- zero contract mismatches
- sin incidentes abiertos severos en scheduler/worker/runtime
- checklist de promoción aprobada por Hermes + operador humano
- secrets y endpoints productivos verificados explícitamente

Resultado:
recién ahí puede existir promoción de código a prod.

## 15.4 Regla central

Sandbox, dev y staging pueden promover código.
Sólo prod puede promover side effects externos reales.
Ningún artifact generado en sandbox puede publicarse fuera de su namespace.

## 16. Cómo aislar un Hermes de prueba

## 16.1 Identidad separada

Crear `HermesTestInstance` con:

- `hermes_instance_id = hermes-sbx-{profile}`
- `agent_namespace = gana-v8-sbx`
- `memory_namespace = memory-sbx-{profile}`
- `session_prefix = sbx-{profile}-`
- `audit_actor = hermes-test`

## 16.2 Profiles separados

Perfiles mínimos:

1. `hermes-test-local`
2. `hermes-test-ci-smoke`
3. `hermes-test-ci-regression`
4. `hermes-test-staging-like`
5. `hermes-test-demo`

Cada profile define:

- tools permitidas
- provider routing
- budgets
- source allowlist
- publication disabled flags
- observability verbosity
- cron enablement
- fixture pack por default

## 16.3 Datos y memoria separados

Separar obligatoriamente:

- DB/schema
- Redis prefix
- artifact storage prefix
- vector/memory collection
- session transcripts
- prompts cache
- provider cache
- run manifests

## 16.4 Publicación desactivada por defecto

Para Hermes de prueba:

- Telegram real: disabled o canal interno sandbox
- webhooks externos: disabled
- publisher-worker: modo `dry-run`
- secrets productivos: no montados

## 16.5 Auditoría

Todo comando emitido por Hermes de prueba debe registrar:

- quién inició la corrida
- profile usado
- fixture pack usado
- overrides aplicados
- diff respecto al profile base

## 17. Scorecards y métricas del slice

KPIs mínimos del ecosistema de QA:

- smoke success rate diaria
- contract pass rate
- replay parity rate
- cron workflow success rate
- mean sandbox setup time
- mean sandbox reset time
- idempotency violations
- duplicate workflow rate
- policy gate failures por tipo
- subagent contradiction escalation rate
- operator console data freshness
- percentage de corridas con artifacts completos

## 18. Backlog de implementación recomendado

## Tramo 1 — Fundaciones de testing

1. crear `packages/testing-fixtures`
2. crear `tests/contract`, `tests/integration`, `tests/smoke`, `tests/replay`, `tests/agents`
3. migrar Zod schemas clave a `packages/contract-schemas`
4. portar tests de `v0-v7` que cubren AI, ops y output schemas
5. definir `RunManifestV1` y `EnvironmentOverlayV1`

Salida esperada:
contract tests y smoke mínimo del pipeline básico.

## Tramo 2 — Sandbox runner mínimo

1. levantar `apps/sandbox-runner`
2. soportar profiles `local-dev` y `ci-smoke`
3. crear `tiny-smoke-pack`
4. aislar DB/Redis/storage/queues por `env_id`
5. bloquear publicación externa por policy

Salida esperada:
Hermes puede correr un día chico sin tocar prod.

## Tramo 3 — Replay y cron validation

1. crear `historical-replay-pack`
2. incorporar reloj virtual
3. validar T-24h, T-6h, T-30m, post-match, nightly
4. baseline vs candidate diffing
5. scorecards persistentes de regresión

Salida esperada:
nightly determinístico con evidencia comparable.

## Tramo 4 — Subagentes y staging-like

1. tests de planner y especialistas
2. adversarial packs
3. profile `staging-like`
4. smoke de operator console
5. gates automáticos `dev -> staging`

Salida esperada:
validación realista del ecosistema multiagente.

## Tramo 5 — Promotion hardening

1. gates `staging -> prod`
2. checklist de rollback
3. chaos subset programado
4. budgets y thresholds finales
5. runbooks de incidente

Salida esperada:
promoción gobernada por evidencia, no por intuición.

## 19. Definición de done del slice

Este slice se considera listo cuando Hermes puede:

1. crear un sandbox aislado con profile explícito,
2. cargar fixture pack sintético o histórico,
3. ejecutar crons y workers completos,
4. generar research, atómicas y parlays,
5. correr validation y scorecards,
6. inspeccionar resultados desde la operator console,
7. comparar baseline vs candidate,
8. demostrar que ninguna operación tocó prod,
9. bloquear promoción si falla un contract, replay o policy gate.

## 20. Recomendación final de priorización

Para complementar el master plan v8, este slice debería arrancar en paralelo desde Fase 1 y no dejarse sólo para Fase 9.

Orden recomendado:

1. contratos + fixtures + smoke mínimo,
2. sandbox runner mínimo,
3. replay y cron validation,
4. subagentes + operator QA,
5. promotion gates completos.

Así se evita el riesgo ya identificado en el master plan: llegar al final con backend funcional pero sin evidencia reproducible de que Hermes puede operar el sistema completo sin tocar producción.
