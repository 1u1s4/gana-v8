# Gana-v8 harness gap analysis and closure plan

> Estado actual: `FALTA`.
> Pendiente principal: el repo ya cubre buena parte de la superficie v8, pero todavía aparecen señales de scaffold y placeholders operativos, sobre todo en desarrollo local y publicación.

> For Hermes: use `subagent-driven-development` to execute this plan by slices, with spec review and code review after each slice

**Goal:** cerrar las brechas entre el estado actual de `gana-v8` y la visión de v8 como harness/plataforma genética completa, operable, auditable, aislada y promovible a producción

**Architecture:** tomar `v0-v7` como baseline ejecutable real, `gana-v7/docs` como baseline documental, y `gana-v8` como plataforma modular en evolución. Priorizar robustez operacional, contracts, replay/sandbox, governance y rollout por encima de agregar features cosméticas

**Tech Stack:** TypeScript monorepo, Prisma/MySQL, workers/apps separados, Hermes control-plane, API-Football, AI runtime/model registry, tests por workspace, CI con pnpm

---

## 1. Resumen ejecutivo

`gana-v8` ya no es scaffold vacío. Tiene slices reales y testeadas de:
- ingestión
- public-api
- research
- scoring
- publisher/parlay MVP
- validation
- operator-console
- storage adapters / queues / config runtime

Pero todavía **no califica como harness completo** por cinco brechas maestras:
1. robustez operacional insuficiente
2. governance/observability incompleta
3. sandbox/replay todavía liviano
4. aislamiento/rollout/entornos todavía frágil
5. cobertura funcional y contractual más delgada que `v0-v7` en varias superficies operativas

---

## 2. Definición operativa de “harness completo”

Para este repo, un harness completo significa que el sistema puede:
- correr el ciclo ingestión → research → scoring → publication → validation de forma confiable
- aislar dev/staging/prod/sandbox sin bleed de datos o credenciales
- reejecutar, reproducir y auditar decisiones históricas
- exponer control operativo, read models, logs y quality gates consistentes
- degradar con seguridad ante errores de proveedor, schema drift, datos faltantes o fallos parciales
- promover releases con gates, rollback y evidencia objetiva

---

## 3. Matriz exhaustiva de carencias

## A. Orchestration / control-plane

### Falta
- leases/heartbeat/recovery robustos para tasks running
- retry policy real con backoff y DLQ
- scheduler persistente de verdad, no sólo ciclos in-process
- separación más fuerte entre scheduler, dispatcher y workers
- gating operacional por capability
- estado de workflow más completo y explicable por fixture/jornada

### Evidencia
- existen `Task`, `TaskRun`, `retryScheduledFor`, `maxAttempts`
- pero el comportamiento efectivo todavía es más MVP que orquestador resiliente
- el build/test completo de `hermes-control-plane` sigue pesado y difícil de validar end-to-end

### Impacto
- riesgo de tareas zombies
- reintentos inconsistentes
- recuperación manual
- poca confianza para operación distribuida

---

## B. Execution workers

### Falta
- endurecimiento productivo del `ingestion-worker`
- retry/recovery por worker
- manifests de ejecución persistidos de forma homogénea
- contratos más estrictos entre control-plane y workers
- smoke e2e cross-worker

### Evidencia
- workers existen y varios pasan tests
- incidentes reales recientes:
  - `season` requerido para fixtures live
  - `Task.error` demasiado largo en ingestión de odds
  - fixes locales para runner live

### Impacto
- el pipeline existe, pero todavía puede caerse por edge cases de runtime reales

---

## C. Data plane

### Falta
- política fuerte contra schema drift
- lineage más profundo y consultable de raw → canonical → feature → prediction/parlay/validation
- normalización más fuerte de metadata hoy stringificada
- warehouse/backfill/replay dataset formalizados
- query surfaces más robustas para análisis longitudinal

### Evidencia
- raw/canonical/operational existen en forma básica
- ya hubo drift real de migration no aplicada en DB
- varios campos operativos siguen demasiado apoyados en `Json`/`metadata`

### Impacto
- riesgo de inconsistencias silenciosas
- menor reproducibilidad
- analytics y auditoría más débiles de lo necesario

---

## D. Intelligence / AI / research

### Falta
- adoption realmente uniforme del AI runtime en todos los puntos donde aporte valor
- research supervisor/swarm más cercano a la visión multiagente completa
- quality gates más ricos por evidencia/fuente/conflicto
- soporte multi-mercado más allá de moneyline/h2h MVP
- policy/risk/calibration más profundos

### Evidencia
- `ai-runtime`, `model-registry`, `research-worker` y `scoring-worker` sí existen y pasan tests
- pero el sistema todavía está optimizado a MVP determinístico + AI opcional, no a un harness completo de inteligencia

### Impacto
- mejor que v6/v7 en modularidad
- todavía corto en profundidad analítica y gobernanza de decisiones

---

## E. Publisher / publication layer

### Falta
- `publication-engine` real
- separación dura por environment/source cohort/lineage
- publicación multicanal formal
- gating de publication y rollback por canal

### Evidencia
- `publication-engine` sigue placeholder
- hubo mezcla demo/live en publisher y se corrigió con filtros de ventana live
- eso endurece el caso real, pero todavía no reemplaza una separación estructural por cohorts

### Impacto
- riesgo de contaminación de outputs y publishing accidental si cambia la lógica de selección

---

## F. Validation / post-mortem

### Falta
- settlement más rico que moneyline MVP
- scorecards de release/model drift
- post-mortem longitudinal y comparación entre versiones
- integración más fuerte con replay/backtest

### Evidencia
- validation existe y pasa tests
- pero sigue orientada a settlement funcional, no a evaluación integral del harness

### Impacto
- el loop cierra, pero no aprende ni audita todo lo que debería

---

## G. Governance / observability

### Falta
- métricas y tracing reales
- SLOs/SLIs por worker y provider
- dashboards y alerts reales
- health/readiness más serios
- policy-engine real
- authz real

### Evidencia
- `observability`, `policy-engine`, `authz` están incompletos o placeholder
- `/health` hoy es útil, pero sigue siendo derivado de datos presentes, no de operación real multi-capa

### Impacto
- baja detección temprana
- menor capacidad de operar con confianza

---

## H. Isolation / sandbox / replay

### Falta
- sandbox product-like real
- replay determinístico end-to-end con virtual clock
- golden datasets y release certification packs
- barreras duras para que local/sandbox no usen assets de prod

### Evidencia
- `sandbox-runner` existe, pero su madurez es más demo/harness sintético que entorno completo
- scripts live todavía usaban fallback cross-repo a `.env` externo

### Impacto
- riesgo de bleed entre entornos
- sandbox insuficiente para certificar cambios críticos

---

## I. Operator experience / API delivery

### Falta
- operator console más completa como consola interna integral
- auth/rate limit/versionado fuerte en public-api
- docs de contratos y runbooks operativos
- surfaces completas de logs/runs/backfills/replays

### Evidencia
- `public-api` y `operator-console` están fuertes para el slice actual
- pero todavía no cubren todo el harness operativo deseado

### Impacto
- buena visibilidad del MVP, no todavía de toda la plataforma

---

## J. Testing / CI / DX / release

### Falta
- smoke e2e completo del pipeline con entorno aislado
- release gates y promotion checklist
- CI más rica que un solo flujo básico
- builds menos encadenados y menos dependientes de `dist`
- top-level harness de tests/replays/fixtures como proponía el layout

### Evidencia
- muchos package tests pasan
- pero el build encadenado total sigue pesado y a veces cae por timeout/SIGTERM

### Impacto
- feedback loop lento
- release confidence menor a la deseada

---

## 4. Clasificación de brechas por severidad

## Severidad crítica
1. schema drift / migration discipline
2. persistencia frágil de errores y summaries (`VARCHAR`/payload largo)
3. retry/backoff/DLQ/leases ausentes o incompletos
4. isolation débil entre entornos y secrets

## Severidad alta
5. sandbox/replay no product-like
6. publication layer incompleta
7. observability/policy/authz incompletos
8. task lifecycle incompleto para operación real
9. metadata/schema debt en campos operativos

## Severidad media
10. AI/research todavía parcial respecto a la visión completa
11. validation/post-mortem aún MVP
12. build/test DX pesado
13. operator experience incompleta como consola única integral
14. CI/release/promoción incompletos

## Severidad baja pero acumulativa
15. placeholders que todavía inflan percepción de madurez
16. estructura de docs/contracts/runbooks incompleta
17. falta de harness top-level de tests/fixtures/notebooks/registry/infra

---

## 5. Plan integral de cierre por fases

## Fase 0 — Seguridad operacional mínima

**Objetivo:** impedir que el harness falle por drift, errores largos o bleed entre entornos

### Entregables
- migration gate obligatoria en deploy/startup
- ampliar o rediseñar persistencia de errores/summaries
- eliminar fallback cross-repo de `.env`
- guard-rails de environment/profile/DB host
- política estándar de IDs cortos/opacos

### Criterio de aceptación
- ninguna app crítica arranca con drift de schema silencioso
- errores reales largos no rompen persistencia
- local-dev no puede tocar prod por accidente

---

## Fase 1 — Queue/runtime resiliente

**Objetivo:** convertir tasks/workers en un runtime confiable

### Entregables
- leases con expiración
- heartbeat
- recovery de tasks zombies
- retry con backoff
- DLQ/quarantine
- reason codes consistentes

### Criterio de aceptación
- una tarea fallida puede reintentarse automáticamente y/o caer a DLQ
- una tarea running huérfana puede recuperarse sin intervención manual destructiva

---

## Fase 2 — Ingestión live robusta

**Objetivo:** endurecer el primer tramo del pipeline

### Entregables
- ingestion live declarativa por league/window/provider
- runner oficial soportado, no script auxiliar ad hoc
- manifests de ejecución
- mejor modelado de errores de proveedor
- soportes explícitos de season/window/provider quirks

### Criterio de aceptación
- fixtures + odds live se ejecutan por cron o manual sin fixes locales ni drift

---

## Fase 3 — Publication/governance hardening

**Objetivo:** impedir contaminación y publication insegura

### Entregables
- `publication-engine` real
- cohorts/environment/source lineage como restricciones estructurales
- publication gates por canal
- kill switches por capability
- authz básico real para acciones operativas sensibles

### Criterio de aceptación
- ningún parlay/prediction demo puede contaminar outputs live
- publication puede pausarse por canal sin tocar scoring

---

## Fase 4 — Observability y operator-grade health

**Objetivo:** hacer operable el harness sin adivinar

### Entregables
- métricas por worker/task/provider
- tracing/correlation ids
- dashboards y alerts mínimos
- health/readiness/freshness reales
- surfaces de logs/runs/backfills/retries en API/console
- `policy-engine` inicial real

### Criterio de aceptación
- se puede responder rápido qué falló, dónde, por qué y qué está atrasado

---

## Fase 5 — Sandbox/replay product-like

**Objetivo:** convertir v8 en harness verdadero

### Entregables
- scheduler virtual / virtual clock
- replay end-to-end de jornadas congeladas
- golden fixture packs
- comparación release N vs N+1
- sandbox aislado por namespace, storage, queue y DB

### Criterio de aceptación
- se puede certificar un cambio crítico sin tocar prod y con diff de outputs reproducible

---

## Fase 6 — Intelligence depth

**Objetivo:** acercar research/scoring/validation a la visión completa

### Entregables
- richer research bundles y conflict handling
- más mercados además de moneyline/h2h
- calibration / drift / scorecards
- risk engine y ranking más maduros
- adoption uniforme de AI runtime donde aplique

### Criterio de aceptación
- decisiones más explicables, más trazables y menos ad hoc

---

## Fase 7 — DX/CI/release platform

**Objetivo:** que el repo se pueda operar, probar y promover con confianza

### Entregables
- CI por niveles
- smoke e2e
- release checklist/runbooks
- menos dependencia de builds encadenados
- limpieza de imports a `dist`
- top-level `tests/`, `fixtures/`, `infra/`, `docs/runbooks`, `docs/contracts`

### Criterio de aceptación
- release reproducible, con gates objetivos y rollback claro

---

## 6. Orden recomendado de ejecución

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 4
6. Fase 5
7. Fase 7
8. Fase 6

Racional:
- primero confiabilidad básica
- después automation y publication segura
- luego observabilidad y sandbox
- y después profundización analítica

---

## 7. Mapa de ownership sugerido

- `apps/hermes-control-plane` + `packages/queue-adapters` → leases/retries/DLQ
- `apps/ingestion-worker` + `packages/source-connectors` → hardening live ingestion
- `apps/publisher-worker` + `packages/publication-engine` → publication-safe cohorts/gates
- `packages/storage-adapters` + `prisma/` → schema hardening y migration discipline
- `packages/observability` + `apps/public-api` + `apps/operator-console` → metrics/health/log surfaces
- `apps/sandbox-runner` + `packages/testing-fixtures` → replay harness
- `packages/policy-engine` + `packages/authz` → governance

---

## 8. Regla de auditoría continua

Cada slice nuevo debe clasificarse explícitamente como:
- placeholder
- demo
- partial
- production-like

Y no puede promocionarse a `production-like` sin:
- tests propios verdes
- validación runtime real si toca operación
- contrato/documentación mínima
- observabilidad suficiente

---

## 9. Resultado esperado al cerrar este plan

Al finalizar estas fases, `gana-v8` debería poder ser defendido como:
- plataforma modular
- control-plane operable
- harness reproducible
- sistema con aislamiento real
- pipeline auditable end-to-end
- releaseable con confianza

En ese punto sí tendría sentido decir que v8 ya no es sólo un MVP modular, sino un harness/plataforma completa
