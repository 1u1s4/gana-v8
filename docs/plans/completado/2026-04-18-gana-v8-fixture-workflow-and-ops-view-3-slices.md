# Gana V8 Fixture Workflow + Ops View Implementation Plan

> For Hermes: usar test-driven-development en cada slice y validar por package, no sólo por monorepo completo

Goal: cerrar el gap operativo más grande contra v0-v7 creando workflow persistido por fixture y una vista operativa centrada por fixture

Architecture: en vez de seguir derivando todo ad hoc desde tasks, taskRuns y validations, agregar un agregado persistido `FixtureWorkflow` como fuente de verdad operativa por fixture. Después enriquecer telemetry de task/task-run y finalmente proyectar eso en `public-api` y `operator-console`

Tech Stack: Prisma MySQL, packages/domain-core, packages/storage-adapters, apps/hermes-control-plane, apps/research-worker, apps/scoring-worker, apps/publisher-worker, apps/validation-worker, apps/public-api, apps/operator-console

---

## Slice 1 — FixtureWorkflow persistido

Objective: introducir el agregado persistido por fixture que reemplace el vacío actual frente a `fac_fixture_pipeline_state`

### Scope funcional mínimo
- persistir por fixture:
  - ingestionStatus
  - oddsStatus
  - enrichmentStatus
  - candidateStatus
  - predictionStatus
  - parlayStatus
  - validationStatus
  - isCandidate
  - minDetectedOdd
  - qualityScore
  - selectionScore
  - lastIngestedAt
  - lastEnrichedAt
  - lastPredictedAt
  - lastParlayAt
  - lastValidatedAt
  - errorCount
  - lastErrorMessage
  - diagnostics
- lectura/escritura desde storage adapters
- entidades y factories en domain-core

### Files
- Modify: `prisma/schema.prisma`
- Create: `packages/domain-core/src/entities/fixture-workflow.ts`
- Modify: `packages/domain-core/src/index.ts`
- Modify: `packages/domain-core/src/repositories.ts`
- Modify: `packages/storage-adapters/src/prisma/mappers.ts`
- Modify: `packages/storage-adapters/src/prisma/repositories.ts`
- Modify: `packages/storage-adapters/src/unit-of-work.ts`
- Test: `packages/domain-core/tests/domain-core.test.ts`
- Test: `packages/storage-adapters/tests/storage-adapters.test.ts`

### TDD steps
1. Escribir test rojo del entity factory en `domain-core`
2. Correr `pnpm --filter @gana-v8/domain-core test`
3. Implementar `FixtureWorkflowEntity`
4. Volver a correr tests
5. Escribir test rojo de persistencia en `storage-adapters`
6. Correr `pnpm --filter @gana-v8/storage-adapters test`
7. Agregar modelo Prisma + mapper + repository
8. Volver a correr tests del package
9. Correr validación final del slice:
   - `pnpm --filter @gana-v8/domain-core test`
   - `pnpm --filter @gana-v8/storage-adapters test`
   - `pnpm --filter @gana-v8/storage-adapters typecheck`

### Acceptance criteria
- existe modelo Prisma persistido para workflow por fixture
- hay entity y repository reales
- guardar y leer workflow funciona con tests
- no rompe builds existentes

---

## Slice 2 — Actualización del workflow desde workers + telemetry mínima de ejecución

Objective: dejar de tener workflow muerto y empezar a alimentarlo desde ejecución real

### Scope funcional mínimo
- al encolar/correr tasks, actualizar stages correspondientes
- research-worker actualiza enrichment/candidate
- scoring-worker actualiza prediction
- publisher-worker actualiza parlay
- validation-worker actualiza validation
- hermes-control-plane incrementa errorCount y lastErrorMessage si falla un task
- enriquecer Task/TaskRun con mínimo útil:
  - triggerKind
  - dedupeKey
  - maxAttempts
  - lastErrorMessage
  - workerName en TaskRun
  - result payload en TaskRun
  - retryScheduledFor en TaskRun

### Files
- Modify: `prisma/schema.prisma`
- Modify: `packages/domain-core/src/entities/task.ts`
- Modify: `packages/domain-core/src/entities/task-run.ts`
- Modify: `packages/domain-core/src/repositories.ts`
- Modify: `packages/storage-adapters/src/prisma/mappers.ts`
- Modify: `packages/storage-adapters/src/prisma/repositories.ts`
- Modify: `apps/hermes-control-plane/src/index.ts`
- Modify: `apps/research-worker/src/index.ts`
- Modify: `apps/scoring-worker/src/index.ts`
- Modify: `apps/publisher-worker/src/index.ts`
- Modify: `apps/validation-worker/src/index.ts`
- Test: `apps/hermes-control-plane/tests/demo-run.test.ts`
- Test: `apps/research-worker/tests/research-worker.test.ts`
- Test: `apps/scoring-worker/tests/runtime.test.ts`
- Test: `apps/publisher-worker/tests/runtime.test.ts`
- Test: `apps/validation-worker/tests/runtime.test.ts`

### TDD steps
1. Fijar tests rojos en control-plane para telemetry mínima nueva
2. Correr tests del package correspondiente
3. Implementar schema/entity/repository para Task/TaskRun enriquecidos
4. Volver a verde control-plane
5. Fijar tests rojos por worker para actualización de workflow
6. Implementar actualizaciones mínimas por worker
7. Validar por package tocado
8. Validación final del slice:
   - `pnpm --filter @gana-v8/hermes-control-plane test`
   - `pnpm --filter @gana-v8/research-worker test`
   - `pnpm --filter @gana-v8/scoring-worker test`
   - `pnpm --filter @gana-v8/publisher-worker test`
   - `pnpm --filter @gana-v8/validation-worker test`

### Acceptance criteria
- cada worker deja huella en `FixtureWorkflow`
- fallos incrementan errorCount/lastErrorMessage
- Task/TaskRun ya no son tan planos como hoy
- tests por worker siguen verdes

---

## Slice 3 — Fixture-centric ops read model

Objective: exponer una vista por fixture que una workflow + odds + research readiness + predictions + parlays + validations + errores

### Scope funcional mínimo
- `public-api` agrega read model `FixtureOpsDetail`
- nueva ruta tipo `/fixtures/:id/ops` o equivalente
- incluir:
  - fixture base
  - workflow
  - latest odds snapshot
  - provider summary relevante
  - prediction list vinculada
  - parlay list vinculada
  - validations vinculadas
  - recent task/task-run errors del fixture
- `operator-console` agrega panel o render fixture-centric

### Files
- Modify: `apps/public-api/src/index.ts`
- Modify: `apps/public-api/tests/public-api.test.ts`
- Modify: `apps/operator-console/src/index.ts`
- Modify: `apps/operator-console/tests/operator-console.test.ts`

### TDD steps
1. Escribir test rojo para `public-api` fixture ops detail
2. Correr `pnpm --filter @gana-v8/public-api test`
3. Implementar read model y ruta
4. Volver a verde
5. Escribir test rojo para panel/render en operator-console
6. Correr `pnpm --filter @gana-v8/operator-console test`
7. Implementar panel fixture-centric
8. Validar:
   - `pnpm --filter @gana-v8/public-api test`
   - `pnpm --filter @gana-v8/operator-console test`
   - `pnpm --filter @gana-v8/operator-console typecheck`

### Acceptance criteria
- existe vista por fixture realmente útil para ops
- ya no dependemos de inspección manual dispersa entre rutas planas
- operator-console puede auditar un fixture de punta a punta

---

## Orden recomendado de ejecución
1. Slice 1 completo
2. Slice 2 completo
3. Slice 3 completo

No conviene empezar por Slice 3 sin Slice 1 porque quedarías proyectando estado derivado débil otra vez

## Riesgos concretos
- Prisma migration puede crecer rápido si metemos demasiados campos a la vez
- mantener package metadata/exports alineados si aparece un workspace nuevo o se toca runtime packaging
- no reintroducir lógica duplicada entre `public-api` y `operator-console`
- evitar que workers escriban workflow con reglas inconsistentes; conviene centralizar helpers de transición

## Definition of done global
- workflow persistido por fixture
- workflow actualizado por ejecución real
- telemetry básica de task/task-run enriquecida
- read model fixture-centric operativo en API y consola
- tests verdes por package tocado

## Recommended first move right now
Arrancar por Slice 1 con TDD
