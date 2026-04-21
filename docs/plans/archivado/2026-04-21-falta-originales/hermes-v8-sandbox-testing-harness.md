# V8 Hermes — arquitectura de sandbox y test harness para predicción deportiva

> Estado actual: `FALTA`.
> Pendiente principal: ya hay sandbox runner y certificación, pero todavía faltan perfiles importantes del harness, el modo `hybrid` y una versión más completa del ecosistema aislado descrito aquí.

## 1. Objetivo

Diseñar un entorno de sandbox que permita ejecutar el ecosistema completo de V8 Hermes sin tocar producción, cubriendo:

- crons,
- workers,
- DB operacional e histórica,
- skills,
- memory,
- sessions,
- providers mock y reales,
- replay de fixtures y payloads,
- smoke tests,
- regression,
- validación end-to-end.

La meta no es sólo correr tests unitarios, sino disponer de un "mini-Hermes aislado" reproducible, auditable y reseteable que pueda simular un día operativo completo o re-jugar un partido histórico con inputs controlados.

## 2. Principios de diseño

1. Aislamiento fuerte por entorno: ningún componente del sandbox comparte DB, colas, memoria, sesiones ni credenciales con producción.
2. Reproducibilidad: toda corrida debe poder reconstruirse a partir de un profile + fixture pack + seed + run_manifest.
3. Time-travel explícito: el sistema debe poder correr en tiempo real o en tiempo virtual acelerado.
4. Replay first: todo input relevante debe poder provenir de payloads archivados o fixtures sintéticos.
5. Contract-driven: conectores, skills, workers y orquestadores validan contratos de entrada/salida estables.
6. Mezcla controlada de mocks y reales: algunos providers pueden ir mocked mientras otros permanecen reales, pero siempre declarados por profile.
7. Determinismo por defecto: los tests de regression no deben depender de red externa ni del reloj real salvo que el profile lo permita.
8. Observabilidad total: cada corrida sandbox debe emitir traces, artefactos, snapshots y métricas comparables.
9. Fast reset: crear y destruir un sandbox debe ser barato para soportar CI, pruebas locales y experimentos ad hoc.
10. Promotion safety: nada generado en sandbox puede publicarse o mutar artefactos productivos sin una compuerta explícita.

## 3. Qué se debe aislar

Cada sandbox debe tener namespace propio en todas estas capas:

1. Runtime namespace
   - env_id = prod | stage | sbx-{profile}-{timestamp}-{sha}
   - run_id
   - logical_clock_id

2. Config namespace
   - config overlays por profile
   - provider routing policy
   - policy flags
   - skill enablement map

3. Persistence namespace
   - Postgres schema o DB dedicada
   - warehouse dataset/schema dedicado
   - object storage prefix dedicado
   - Redis DB/index o key prefix dedicado
   - vector store / memory collection dedicada

4. Execution namespace
   - colas separadas
   - cron registry separado
   - worker pool separado
   - lock namespace separado
   - temp filesystem separado

5. Identity namespace
   - hermes_instance_id aislado
   - session_id prefixado
   - memory peer/user IDs aislados
   - audit actor IDs del sandbox

6. Secrets namespace
   - credenciales mock
   - credenciales reales permitidas sólo por allowlist
   - tokens de publicación deshabilitados por defecto

## 4. Vista macro del sandbox

Componentes propuestos:

1. Sandbox Control Plane
   - crea/destruye sandboxes
   - aplica profiles
   - inicializa DB, colas, storage y clocks
   - registra manifiesto de corrida

2. Environment Overlay Resolver
   - compone configuración base + overlay de deporte + overlay de profile + overrides ad hoc

3. Provider Router
   - enruta cada dependencia a uno de tres modos:
     - mock,
     - replay,
     - live.

4. Synthetic Data Factory
   - genera ligas, equipos, jugadores, odds, lesiones, lineups, noticias y outcomes sintéticos coherentes

5. Replay Engine
   - reinyecta payloads raw históricos o fixtures versionados
   - simula delays, errores, correcciones y llegadas tardías

6. Isolated Workflow Runtime
   - scheduler sandbox
   - cola sandbox
   - workers sandbox
   - subagentes/skills habilitados según profile

7. Validation Harness
   - ejecuta assertions por etapa
   - compara outputs contra golden datasets o invariants
   - publica scorecards de regresión

8. Artifact Store
   - guarda logs, prompts, traces, snapshots, predictions, diffs y reportes

## 5. Profiles recomendados

El profile define propósito, costo, realismo y nivel de aislamiento.

### 5.1 local-dev

Uso:
- desarrollo rápido de skills y orquestación.

Características:
- DB local efímera,
- Redis efímero,
- object storage en filesystem,
- providers 100% mock/replay,
- reloj virtual opcional,
- dataset pequeño.

Objetivo:
- feedback en minutos,
- debugging funcional.

### 5.2 ci-smoke

Uso:
- pipeline de CI por commit/PR.

Características:
- tests cortos,
- 1 o 2 ligas,
- 3 a 10 fixtures,
- sólo mocks/replay,
- assertions mínimas de salud end-to-end,
- tiempo máximo agresivo.

Objetivo:
- detectar roturas gruesas de wiring, contratos y schema.

### 5.3 ci-regression

Uso:
- nightly o pre-release.

Características:
- replay determinístico,
- varios fixture packs históricos y sintéticos,
- comparación contra golden outputs,
- drift thresholds,
- cobertura de rutas normales y patológicas.

Objetivo:
- detectar cambios de comportamiento en predicción, research y políticas.

### 5.4 staging-like

Uso:
- ensayo operacional cercano a producción.

Características:
- topología completa,
- crons reales habilitados en namespace aislado,
- algunos providers live permitidos,
- otros en replay/mock,
- volumen mediano,
- observabilidad completa.

Objetivo:
- validar que scheduler, workers, retry, locks y publicación interna funcionen como ecosistema.

### 5.5 historical-backtest

Uso:
- re-jugar ventanas históricas.

Características:
- reloj virtual,
- snapshots as_of,
- odds/news/lineups en secuencia temporal,
- resultado final conocido pero oculto hasta el final del replay.

Objetivo:
- medir reproducibilidad de decisiones pre-kickoff y evaluar calibración.

### 5.6 chaos-provider

Uso:
- resiliencia.

Características:
- providers con 429, 500, timeouts, payloads corruptos, duplicados y respuestas fuera de orden.

Objetivo:
- probar retry, fallback, deduplicación, circuit breakers e idempotencia.

### 5.7 human-qa-demo

Uso:
- demo interna o validación manual.

Características:
- UI/panel habilitado,
- fixtures visibles,
- trazas navegables,
- posibilidad de inyectar eventos manuales.

Objetivo:
- revisión humana del sistema completo sin riesgo operativo.

## 6. Matriz de modos por dependencia

Cada provider o subsistema debe soportar estos modos declarativos:

1. mock
   - responde desde stub tipado.
   - útil para tests de contrato y paths nominales.

2. replay
   - responde desde payload archivado con secuencia temporal.
   - útil para regresión e históricos.

3. hybrid
   - unas rutas replay y otras live.
   - útil para staging-like.

4. live-readonly
   - permite leer de provider real.
   - bloquea side effects externos.

5. live-full
   - sólo permitido fuera de sandbox o bajo flag excepcional.
   - en este diseño no debería ser el default para ningún test harness.

Ejemplo de routing policy declarativa:

- fixtures_api = replay
- odds_api = replay
- weather_api = live-readonly
- news_search = mock
- llm_provider = mock o live-readonly según profile
- messaging publish = disabled
- bankroll/publishing service = disabled

## 7. Diseño de configuración por overlays

Se recomienda una composición de configuración de 4 capas:

1. base
   - contratos globales,
   - wiring estándar,
   - defaults de tracing.

2. domain overlay
   - fútbol, NBA, tenis, etc.
   - reglas, mercados y ventanas específicas.

3. profile overlay
   - local-dev, ci-smoke, historical-backtest, etc.

4. run override
   - overrides ad hoc de una corrida puntual.

Campos mínimos del sandbox manifest:

- sandbox_id
- profile_name
- created_at
- git_sha
- config_version
- schema_version
- fixture_pack_version
- replay_pack_version
- synthetic_seed
- clock_mode
- provider_modes
- db_namespace
- storage_prefix
- worker_topology
- assertions_pack

## 8. Aislamiento de DB y persistencia

## 8.1 Estrategia recomendada

Separar en dos niveles:

1. por entorno mayor
   - prod,
   - stage,
   - sandbox.

2. dentro de sandbox, por corrida/profile
   - schema dedicado o DB efímera por run.

Recomendación práctica:

- Postgres:
  - sandbox DB cluster separado de producción.
  - una DB por suite grande o schema por run.
- Warehouse:
  - dataset/schema por sandbox_id.
- Redis:
  - instancia separada o DB index dedicado + key prefix obligatorio.
- Object storage:
  - bucket no productivo o prefix sandbox://{sandbox_id}/...
- Vector/memory store:
  - colección por sandbox_id.

## 8.2 Regla de oro

Un proceso sandbox nunca debe poder resolver DSN/URL de producción sin un guard-rail que falle hard.

Guard-rails obligatorios:

- allowlist explícita de hosts/DBs,
- startup check que valida namespace,
- bloqueo si detecta schema/bucket con nombre productivo,
- policy que invalida publishing tokens en sandbox.

## 8.3 Seed y reset

El harness debe soportar tres modos de boot:

1. empty boot
   - crea schema vacío y migra.

2. seed boot
   - aplica dataset mínimo canónico.

3. snapshot boot
   - restaura dump o snapshot versionado.

Reset modes:

- hard reset: drop y recreate.
- soft reset: truncate tablas mutable + conservar catálogos.
- checkpoint restore: volver a snapshot previo a una fase.

## 9. Memory, sessions y skills

## 9.1 Sessions

Toda sesión de sandbox debe llevar:

- session_id prefijado con sandbox_id,
- tags de profile, fixture_pack y run_id,
- lineage al workflow que la generó.

Regla:
- no reusar session stores productivos.

## 9.2 Memory

Separar tres memorias:

1. conversational/session memory
2. operational memory
3. learned/source reliability memory

En sandbox:
- pueden resetearse independientemente,
- deben versionarse con seed y replay pack,
- la memoria aprendida no debe contaminar rankings productivos.

## 9.3 Skills

Cada skill debe declararse como:

- enabled,
- mocked,
- live,
- forbidden.

Esto permite, por ejemplo:
- usar research planner real,
- mockear browser/search,
- re-jugar evidence normalizer,
- deshabilitar publishing skill.

## 10. Synthetic fixtures y datos sintéticos

## 10.1 Objetivo

No depender exclusivamente de históricos reales. Hace falta generar mundos controlados para cubrir edge cases raros.

## 10.2 Entidades a generar

1. Competencias y calendarios
2. Equipos con rating latente
3. Jugadores con disponibilidad y roles
4. Historial reciente
5. Odds snapshots multi-book
6. Lesiones, suspensiones, rotaciones
7. Noticias y rumores con verdad subyacente conocida
8. Weather/venue
9. Resultado final y eventos del partido

## 10.3 Propiedades de un buen generador sintético

- coherencia causal,
- relaciones temporales válidas,
- ruido configurable,
- truth labels internas,
- capacidad de generar contradicciones controladas,
- parametrización por deporte.

## 10.4 Clases de fixture packs sintéticos

1. nominal-pack
   - datos completos, sin anomalías.

2. sparse-pack
   - coverage incompleta, fuentes faltantes.

3. contradiction-pack
   - fuentes oficiales y rumores contradictorios.

4. late-breaking-pack
   - lesión/alineación confirmada minutos antes del kickoff.

5. odds-shock-pack
   - movimiento abrupto de cuotas.

6. postponement-pack
   - partido reprogramado/cancelado.

7. dirty-data-pack
   - nombres inconsistentes, IDs cruzados erróneos, duplicados.

8. multi-leg-pack
   - varios partidos correlacionados para parlay/ranking.

## 10.5 Truth model recomendado

El generador sintético debe guardar la verdad interna separada de lo observable:

- latent_truth/
  - expected_strength
  - actual_availability
  - true_lineup
  - true_weather
  - true_outcome

- observable_world/
  - provider_payloads
  - news items
  - rumors
  - odds snapshots
  - lineups publicadas

Esto permite evaluar si Hermes infiere bien desde observables parciales, no sólo si coincide con la verdad final.

## 11. Replay engine

## 11.1 Capacidades necesarias

El replay engine debe poder:

1. reinyectar respuestas raw por orden temporal,
2. reproducir cambios de estado entre T-24h y post-match,
3. simular polling y eventos push,
4. conservar headers/meta para pruebas de idempotencia y rate limit,
5. ocultar información futura hasta el punto temporal correcto,
6. ejecutar a velocidad real o acelerada.

## 11.2 Unidades de replay

1. provider call replay
   - reproduce respuesta por endpoint.

2. event replay
   - emite eventos canónicos: new_fixture, odds_update, lineup_confirmed, result_final.

3. workflow replay
   - reejecuta una corrida entera con scheduler y workers.

4. decision replay
   - reproduce sólo la etapa de features/predicción usando snapshots congelados.

## 11.3 Timeline model

Toda corrida histórica debe tener eventos con:

- event_at
- available_at
- effective_at
- provider_code
- sequence_no
- correlation_id
- replay_group

Esto permite modelar:
- correcciones tardías,
- datos disponibles después pero efectivos antes,
- llegadas fuera de orden.

## 11.4 Artefactos mínimos del replay pack

- manifest.yaml
- fixtures.jsonl
- provider_calls.jsonl
- canonical_events.jsonl
- expected_assertions.yaml
- golden_outputs/
- snapshots/
- notes.md

## 12. Cron y worker sandbox

## 12.1 Scheduler aislado

El scheduler sandbox debe correr en namespace propio y soportar dos modos:

1. wall-clock mode
   - útil para staging-like.

2. virtual-clock mode
   - útil para replays y backtests.

## 12.2 Virtual clock

El reloj virtual debe permitir:

- freeze,
- advance,
- jump to next event,
- accelerate xN,
- deterministic now().

Todo componente sensible al tiempo debe leer de ClockService y nunca del reloj del sistema directamente.

## 12.3 Worker topology

Separar workers por familia:

- ingestion workers
- normalization workers
- research workers
- feature workers
- prediction workers
- validation workers
- audit/report workers

En sandbox, cada worker publica:
- queue lag,
- processed jobs,
- retries,
- poison messages,
- side effects bloqueados.

## 13. Estrategia de validación

## 13.1 Pirámide recomendada

1. Unit tests
   - lógica pura, parsers, scoring, transforms.

2. Contract tests
   - conectores/proveedores/skills contra schemas fijos.

3. Component integration tests
   - DB + cola + worker + provider mock.

4. Workflow tests
   - cron -> ingest -> normalize -> features -> predict -> validate.

5. End-to-end sandbox tests
   - ecosistema completo con scheduler, workers, sessions, memory y artifact store.

6. Historical regression packs
   - comparación contra outputs históricos esperados.

## 13.2 Tipos de assertions

### Assertions estructurales

- tablas creadas,
- jobs ejecutados,
- mensajes en cola consumidos,
- artefactos persistidos,
- session lineage completo.

### Assertions de calidad de datos

- no nulos críticos,
- unicidad de claves,
- monotonía temporal,
- idempotencia,
- cobertura mínima por fixture.

### Assertions funcionales

- se generó predicción por fixture elegible,
- fixtures no elegibles quedaron bloqueados,
- quality gates actuaron correctamente,
- fallback activado ante provider fallido.

### Assertions de negocio/modelo

- edge score dentro de rango,
- confidence degradada cuando faltó research,
- no se usaron datos post-kickoff para decisiones pre-kickoff,
- parlays respetan límites de correlación.

### Assertions de seguridad

- ningún write a recursos productivos,
- ningún token prohibido cargado,
- publishing skill bloqueada.

## 14. Validación end-to-end propuesta

Escenario E2E mínimo para cada release:

1. crear sandbox con profile ci-regression,
2. cargar fixture pack mixto real+sintético,
3. inicializar DB desde snapshot,
4. arrancar scheduler y workers,
5. ejecutar T-24h -> T-2h -> T-30m -> kickoff -> post-match en reloj virtual,
6. capturar outputs por etapa,
7. verificar assertions estructurales, funcionales y de negocio,
8. comparar golden outputs y thresholds,
9. destruir sandbox y guardar reportes.

Golden outputs sugeridos:

- canonical fixtures,
- research bundles,
- feature vectors resumidos,
- prediction artifacts,
- ranking top-N,
- validation/postmortem metrics,
- audit trail.

## 15. Regression harness

## 15.1 Qué congelar

Para regresión útil no basta con guardar la respuesta final. Conviene versionar:

- config hash,
- prompt versions,
- feature set version,
- source reliability priors,
- replay pack,
- model/provider policy,
- schema version.

## 15.2 Qué comparar

1. hard-equal
   - schemas,
   - conteos,
   - estados workflow,
   - gating decisions.

2. threshold-based
   - probabilidades,
   - confidence,
   - ranking positions,
   - calibration metrics.

3. semantic diff
   - rationale/resúmenes,
   - alerts,
   - explanation bundles.

## 15.3 Presupuesto de drift

Definir budgets por tipo de cambio:

- data drift esperado por provider real,
- model drift aceptado por release,
- prompt drift aceptado sólo con aprobación explícita,
- workflow drift no aceptado en smoke.

## 16. Observabilidad y artefactos

Cada corrida sandbox debe emitir:

- run_manifest,
- config_resolved.yaml,
- cron execution graph,
- queue/job logs,
- provider routing map,
- DB migration version,
- snapshots por fase,
- traces por fixture,
- metrics summary,
- assertion results,
- diff vs golden.

KPIs sugeridos del harness:

- tiempo total por suite,
- flakiness,
- cobertura de fixture packs,
- tasa de idempotencia correcta,
- cantidad de side effects bloqueados,
- divergencia de predicción vs golden,
- cobertura de fallbacks.

## 17. Propuesta de estructura de artefactos

```text
sandbox/
  profiles/
    local-dev.yaml
    ci-smoke.yaml
    ci-regression.yaml
    staging-like.yaml
    historical-backtest.yaml
  fixture-packs/
    real/
      epl-2025-03-arsenal-chelsea/
      nba-2025-01-lakers-celtics/
    synthetic/
      nominal-pack-v1/
      contradiction-pack-v1/
      odds-shock-pack-v1/
  replay-packs/
    provider-level/
    workflow-level/
  snapshots/
  assertions/
    smoke.yaml
    regression.yaml
    safety.yaml
  reports/
  manifests/
```

## 18. Contratos mínimos entre componentes

## 18.1 Sandbox profile contract

Debe declarar al menos:

- runtime_topology
- provider_modes
- db_boot_mode
- storage_boot_mode
- clock_mode
- enabled_skills
- allowed_side_effects
- fixture_pack_refs
- assertion_pack_refs
- teardown_policy

## 18.2 Provider adapter contract

Todo adapter debe exponer:

- request descriptor normalizado,
- response schema version,
- deterministic mock capability,
- replay loader capability,
- fault injection hooks opcionales.

## 18.3 Workflow assertion contract

Toda suite E2E debe poder declarar:

- preconditions,
- execution steps,
- expected artifacts,
- hard assertions,
- threshold assertions,
- forbidden events.

## 19. Roadmap de implementación sugerido

### Fase 1 — base de aislamiento

- namespaces de config, DB, storage y sessions,
- profile loader,
- startup guard-rails,
- reset/teardown.

### Fase 2 — providers mock/replay

- provider router,
- stubs tipados,
- replay pack format,
- clock abstraction.

### Fase 3 — datos sintéticos

- synthetic data factory,
- latent truth model,
- packs nominales y edge cases.

### Fase 4 — workflow E2E

- scheduler virtual,
- workers aislados,
- assertions packs,
- smoke suite completa.

### Fase 5 — regresión avanzada

- golden outputs,
- diff semántico,
- drift budgets,
- suites nightly.

### Fase 6 — staging-like y chaos

- profiles híbridos con providers reales,
- fault injection,
- observabilidad operativa fina.

## 20. Recomendación final

La arquitectura recomendada para V8 Hermes es un test harness centrado en profiles declarativos y namespaces fuertes, con tres pilares:

1. sandbox reproducible por corrida
   - DB, memory, sessions, queues y storage segregados.

2. data input controlado
   - fixtures sintéticos + replay histórico + posibilidad híbrida con providers reales readonly.

3. validación multicapa
   - smoke, regression, chaos y E2E con reloj virtual.

Si hubiera que priorizar, el orden más rentable es:

1. aislar namespaces y guard-rails,
2. construir provider router mock/replay/live-readonly,
3. implementar replay engine con virtual clock,
4. agregar fixture packs sintéticos con truth model,
5. montar suites E2E y regression con golden outputs.

Eso daría un Hermes sandbox realmente útil para probar crons, workers, skills, memory, sessions y decisiones de predicción sin contaminar producción y con capacidad de reproducir bugs o validar releases completas.
