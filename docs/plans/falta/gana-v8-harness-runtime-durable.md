# Plan de cierre de harness runtime durable — gana-v8

**Estado actual confirmado (2026-04-22)**

- `packages/control-plane-runtime` y las apps `apps/hermes-scheduler`, `apps/hermes-dispatcher` y `apps/hermes-recovery` ya existen como topología operativa recomendada.
- `packages/queue-adapters` ya cubre `retry`, `backoff`, `quarantine`, `requeue`, `claim`, `claimNext` y `renewLease`, con pruebas que hoy pasan.
- `AutomationCycle` ya está persistido para `scheduler`, `dispatcher` y `recovery`, con `summary`, `metadata` y `error`.
- `Task` en Prisma todavía no persiste `leaseOwner` ni `leaseExpiresAt`, aunque el runtime sí modela ambos conceptos.
- El scheduler nuevo encola `research`, `prediction` y `validation`, pero no está alineado con el contrato de cron/ingestión que también expone `packages/orchestration-sdk`.
- El dispatcher nuevo no soporta `fixture-ingestion` ni `odds-ingestion`.
- `sandbox-replay` hoy está cableado como no-op exitoso en `control-plane-runtime`.
- `apps/hermes-control-plane` conserva semántica más madura para gating, ownership e idempotencia, y además tiene pruebas DB-backed que la topología nueva todavía no replica.

## Resumen actual

`gana-v8` ya no está en cero en el plano runtime: tiene cola persistida, ciclos operativos, recovery y separación básica de procesos. El problema no es ausencia de piezas, sino que la topología nueva todavía funciona más como runtime operativo inicial que como harness durable para corridas largas, reinicios, redrives, ownership por manifest y handoff confiable entre ciclos.

El faltante exclusivo de este frente es convertir la topología `scheduler/dispatcher/recovery` en la fuente oficial de ejecución durable. Eso implica cerrar el modelo de leases persistidos, alinear el runtime con sus propios contratos, reintroducir la semántica madura que hoy vive en `apps/hermes-control-plane`, y dar garantías explícitas de idempotencia, cursor durable, heartbeat, cierre correcto de ciclos y sandbox replay real.

## Ya cubierto

- `packages/orchestration-sdk` ya define contratos útiles como `TaskEnvelope`, `WorkflowPlan`, budgets y cron specs.
- `packages/queue-adapters` ya modela estados terminales y no terminales, intentos, task runs y operaciones de recuperación.
- `packages/control-plane-runtime` ya persiste y expone `AutomationCycle` para scheduler, dispatcher y recovery.
- `runRecoveryCycle` ya detecta leases expirados, redrivea, cuarentena y deja trazabilidad de acciones en `metadata`.
- El storage actual ya tiene `FixtureWorkflow`, políticas de cobertura y `SandboxNamespace`, que pueden alimentar ownership y gating más ricos.
- La fachada legacy `apps/hermes-control-plane` ya prueba semántica de coverage gating, dedupe e integración más madura del pipeline.

## Faltantes exclusivos

### 1. Modelo durable de claim y lease

- Persistir como first-class los datos de lease y claim en `Task`, en vez de inferir expiración desde `updatedAt`.
- Definir ownership explícito del claim: quién tomó la tarea, cuándo, hasta cuándo y con qué heartbeat.
- Hacer que recovery, dispatcher y cualquier read model operen sobre la misma verdad persistida, no sobre heurísticas divergentes.

### 2. Manifest, workflow, trace y correlation first-class

- Sacar de `payload` los identificadores que deben soportar idempotencia, observabilidad y replay: `manifestId`, `workflowId`, `traceId`, `correlationId`, `source`.
- Formalizar ownership por manifest para que scheduler produzca una unidad durable y dispatcher, publisher y validation consuman solo el subconjunto correcto.
- Definir cómo se reconstruye la historia de una corrida sin depender de inspección manual de múltiples tablas o JSONs heterogéneos.

### 3. Scheduler durable y alineado con contratos

- Persistir cursor o estado durable de cron para evitar duplicados y para reanudar scheduling tras reinicios.
- Alinear `runSchedulerCycle` con el contrato oficial de `orchestration-sdk`, incluyendo `fixture-ingestion` y `odds-ingestion` si siguen siendo parte del harness objetivo.
- Eliminar el gap actual entre contrato publicado y runtime efectivo: no puede existir un `taskKind` oficial sin routing claro ni semántica de scheduling asociada.

### 4. Port explícito de semántica madura desde legacy

- Llevar a la topología nueva la semántica que hoy vive en `apps/hermes-control-plane`: coverage gating, overrides manuales, dedupe y publisher scoping por ciclo.
- Definir qué comportamientos legacy son canónicos y deben migrarse, y cuáles quedan realmente descartados.
- Evitar que la migración se cierre solo por naming o topología si la semántica de harness quedó atrás.

### 5. Heartbeat, cierre de ciclos y tolerancia a fallos

- Introducir renovación de lease durante ejecución larga en dispatcher, no solo como herramienta disponible para recovery.
- Garantizar que `AutomationCycle` siempre cierre en `succeeded` o `failed`, con error y partial summary si hubo excepción.
- Definir comportamiento oficial ante crash parcial, reclaim, retry agotado y fallos de workers durante una corrida activa.

### 6. Sandbox replay real y pruebas end-to-end

- Convertir `sandbox-replay` en executor real o en failure explícito y trazable; el no-op exitoso actual no es suficiente para un harness durable.
- Agregar pruebas DB-backed del runtime nuevo para `scheduler -> dispatcher -> recovery`, crash/reclaim, retry/quarantine, dedupe y scoping por manifest.
- Cerrar la brecha entre las pruebas maduras de `apps/hermes-control-plane` y la cobertura todavía mínima de la topología nueva.

## Interfaces/contratos afectados

- Esquema Prisma de `Task`, `TaskRun` y `AutomationCycle`.
- Contrato de ownership por `manifestId`, `workflowId`, `traceId` y `correlationId`.
- Mapping oficial entre `taskKind` y worker ejecutor.
- Contrato de scheduler cursor/cron state durable.
- Semántica de `sandbox-replay` dentro del runtime nuevo.
- Read models mínimos para explicar una corrida completa y sus transiciones.

## Dependencias

- Depende del plan `gana-v8-harness-verificacion-release-ops-y-runbooks.md` para convertir señales de runtime en gates, evidencia y operación visible.
- Debe quedar indexado desde el futuro entrypoint agentic definido por `gana-v8-harness-core-y-claridad-agente.md`.
- Debe reutilizar la semántica ya validada en `apps/hermes-control-plane` cuando esa semántica siga siendo parte del objetivo de harness.

## Criterio de done

- `Task` persiste claims y leases de forma durable, sin fallback implícito en `updatedAt`.
- Scheduler y dispatcher quedan alineados con el contrato oficial de `taskKind` y cron del repo.
- Existe ownership por manifest/corrida, con dedupe e idempotencia explícitos.
- Dispatcher renueva leases durante trabajos largos y recovery opera sobre el mismo modelo persistido.
- `AutomationCycle` siempre cierra correctamente ante éxito, error o fallo parcial.
- `sandbox-replay` deja de ser no-op y la topología nueva gana cobertura DB-backed comparable a la semántica legacy que reemplaza.

## Fuentes consolidadas

- Repo actual: `packages/control-plane-runtime/`, `packages/orchestration-sdk/`, `packages/queue-adapters/`, `packages/storage-adapters/`, `prisma/schema.prisma`, `tests/e2e/hermes-smoke.mjs`.
- Semántica legacy: `apps/hermes-control-plane/` y sus pruebas DB-backed.
- Referencia externa: [Anthropic, “Harness design for long-running application development”](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Referencia externa: [Web Reactiva, “Qué es el AI harness y el harness engineering”](https://www.webreactiva.com/blog/ai-harness).
- Referencia externa: [OpenAI, “Ingeniería de sistemas: Codex en un mundo centrado en agentes”](https://openai.com/es-419/index/harness-engineering/).
