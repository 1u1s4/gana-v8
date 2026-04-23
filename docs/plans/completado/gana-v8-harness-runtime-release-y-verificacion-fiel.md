# Plan de cierre de harness para runtime-release y verificacion fiel - gana-v8

**Estado de cierre confirmado (2026-04-23)**

- El repo ya materializo runtime durable con `Task`, `TaskRun`, `AutomationCycle`, `SchedulerCursor`, `SandboxCertificationRun` y telemetria durable en Prisma, runtime y adapters.
- `sandbox-certification` y `runtime-release` ya existen como gates separados, con persistencia de evidencia, perfiles operativos y superficies de consulta en `public-api` y `operator-console`.
- La topologia nueva scheduler / dispatcher / recovery ya tiene pruebas DB-backed reales en `packages/control-plane-runtime/tests/runtime.db.test.ts`.
- `runtime-release` ahora compara snapshots durables baseline/candidate persistidos en DB mediante `RuntimeReleaseSnapshot`.
- La evidencia de `runtime-release` usa paginacion/batches con coverage explicito y flags de truncamiento, en vez de techos silenciosos sobre cycles, tasks, taskRuns y audit events.
- `pnpm test:e2e:hermes-smoke` levanta procesos vivos de `hermes-scheduler`, `hermes-dispatcher` y `hermes-recovery`, espera readiness/ciclos por evidencia y cierra procesos limpiamente.

**Implementacion cerrada (2026-04-23)**

- Prisma, dominio y storage exponen `RuntimeReleaseSnapshot`, repositorios de snapshots y migraciones dedicadas.
- `apps/sandbox-runner` captura candidate snapshots, resuelve baseline por perfil/ref/snapshot id, permite bootstrap solo para `ci-ephemeral` y bloquea/requiere review cuando falta baseline en perfiles compartidos o pre-release.
- `public-api` expone `baselineSnapshot`, `candidateSnapshot`, `coverageSummary` y `snapshotDiffFingerprint` en los detalles de `runtime-release`.
- `operator-console` muestra baseline/candidate/fingerprint/diff/cobertura en vistas de runtime release.
- Runbooks, README, CI y smoke Hermes quedaron alineados con la nueva semantica.

## Ya cubierto

- Runtime durable con leases, claims, renewals, quarantine y requeue.
- Certification sintetica con goldens versionadas y evidence packs.
- `runtime-release` con defaults por perfil, persistencia de corridas y promotion decisions auditables.
- Read models y consola operativa para inspeccionar certification, runtime release y telemetria.
- Housekeeping de historia operativa con retencion y audit trail.

## Faltantes exclusivos

### 1. Diff real baseline vs candidate

- Cerrado: la comparación se materializa sobre dos snapshots durables equivalentes (`baselineSnapshot` y `candidateSnapshot`) vinculados a refs reales.
- Cerrado: `baselineRef` y `candidateRef` impactan la resolucion/captura de snapshots y no quedan como metadata decorativa.
- Cerrado: los runbooks documentan como forzar snapshots por id y como interpretar el diff en promotion decisions.

### 2. Cobertura completa de evidencia

- Cerrado: se eliminaron techos silenciosos y se reemplazaron por paginacion/batches.
- Cerrado: la evidencia registra coverage y truncation flags por superficie.
- Cerrado: `public-api` y `operator-console` exponen el resumen de cobertura.

### 3. Relacion canonica entre synthetic-integrity, runtime-release y smoke

- Cerrado: `test:sandbox:certification` conserva el gate sintetico separado y explicita que runtime release vive en su flujo dedicado.
- Cerrado: `test:runtime:release` cubre evidencia DB-backed de runtime.
- Cerrado: `test:e2e:hermes-smoke` cubre topologia real multiproceso.

### 4. Smoke ejecutable de topologia real

- Cerrado: el smoke levanta scheduler, dispatcher y recovery como procesos reales.
- Cerrado: el harness espera readiness/ciclos por logs/DB y valida ciclos antes de cerrar.
- Cerrado: los logs JSONL y evidencia persistida permiten reconstruir la corrida.

### 5. Uso recomendado de subagentes para este frente

- Cerrado: el plan se ejecuto con subagentes por ownership y luego integracion principal.
- Cerrado: la integracion valido Prisma/domain/storage, sandbox-runner, Hermes live smoke y surfaces ops con checks focales y gates globales.

## Interfaces/contratos afectados

- `apps/sandbox-runner`
- `tests/sandbox/certification.mjs`
- `tests/sandbox/runtime-release.mjs`
- `tests/e2e/hermes-smoke.mjs`
- `packages/control-plane-runtime`
- `apps/public-api`
- `apps/operator-console`

## Dependencias

- Reutiliza el cierre ya materializado en `docs/plans/completado/gana-v8-harness-runtime-durable.md`.
- Reutiliza el cierre de `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md` y `docs/plans/completado/gana-v8-runtime-release-adopcion-operativa.md`.
- Debe coordinarse con runbooks de release review, rollback, recovery y smoke failure.
- Toma principios de verificaciones en capas y feedback loops desde [Web Reactiva](https://www.webreactiva.com/blog/ai-harness), [Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps) y [OpenAI](https://openai.com/es-419/index/harness-engineering/).

## Criterio de done

- `runtime-release` deja de depender de una sola fotografia de la base y expresa una comparacion fiel entre baseline y candidate, o explicita formalmente por que no lo necesita.
- La cobertura de evidencia deja de truncarse silenciosamente bajo mayor volumen operativo.
- La relacion entre certification sintetica, runtime-release y smoke queda documentada y ejecutable.
- Existe un smoke de topologia real reproducible en local y CI con evidencia util para agentes y operadores.
- Los runbooks y superficies de operador reflejan la nueva semantica sin contradicciones.

## Fuentes consolidadas

- Repo actual: `prisma/schema.prisma`, `packages/control-plane-runtime/`, `packages/queue-adapters/`, `apps/sandbox-runner/`, `tests/sandbox/certification.mjs`, `tests/sandbox/runtime-release.mjs`, `tests/e2e/hermes-smoke.mjs`, `apps/public-api/`, `apps/operator-console/`, `packages/storage-adapters/src/ops-history-retention.ts`.
- Historial interno: `docs/plans/completado/gana-v8-harness-runtime-durable.md`, `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md`, `docs/plans/completado/gana-v8-runtime-release-adopcion-operativa.md`.
- Fuente externa: [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness).
- Fuente externa: [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
