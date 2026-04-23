# Quarantine Manual Review

## Objetivo

Resolver tareas o fixtures que quedaron en cuarentena sin perder contexto de por qué el harness pidió intervención humana.

## Disparadores

- `readiness` o `operational-summary` reportan tareas `quarantined`.
- El operador necesita detener una tarea en ejecución con `quarantine`.
- Un `runtime-release` termina en `review-required` y exige decisión humana antes de promover.

## Precondiciones

- `public-api` disponible localmente o en el entorno a revisar.
- Identificar `taskId`, `taskRunId` o fixture afectada.
- Tener motivo explícito para la acción manual; no usar cuarentena como reemplazo de un retry normal.

## Comandos

1. Inspeccionar el estado antes de actuar:

```bash
pnpm --filter @gana-v8/public-api serve
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/tasks
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/operational-summary
```

2. Si la tarea sigue corriendo y debe detenerse manualmente:

```bash
curl -s -X POST http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/tasks/<task-id>/quarantine \
  -H 'content-type: application/json' \
  -d '{"reason":"Manual operator stop","occurredAt":"2026-04-22T00:32:00.000Z"}'
```

3. Si después del review la tarea puede volver a cola:

```bash
curl -s -X POST http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/tasks/<task-id>/requeue \
  -H 'content-type: application/json' \
  -d '{"occurredAt":"2026-04-22T00:33:00.000Z"}'
```

4. Si el review manual aplica a una corrida `runtime-release`:

```bash
curl -s -X POST http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/sandbox-certification/runs/<run-id>/promotion-decision \
  -H "authorization: Bearer ${GANA_PUBLIC_API_OPERATOR_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "decision":"rejected",
    "reason":"Shared staging shows runtime drift and cannot be promoted.",
    "evidenceRefs":["https://ci.example/runs/5678"]
  }'
```

Notas:

- `ci-ephemeral` no admite override humano; si ese perfil aparece en review, corregir el entorno o rerunear la evidencia.
- `staging-shared` lo decide el operador on-duty.
- `pre-release` lo decide el release owner por el mismo endpoint o desde `operator-console`.

## Evidencia esperada

- La tarea cambia a `quarantined` con razón explícita y `taskRun` fallido asociado.
- El historial de `taskRuns` conserva el evento de cuarentena y el posible `requeue`.
- `readiness` y `operational-summary` reflejan la cuarentena como señal de review o bloqueo.
- Las decisiones de `runtime-release` quedan reflejadas como `AuditEvent` append-only y aparecen en el detalle del run.

## Decisiones humanas

- Si la razón de cuarentena es operativa y corregible, documentar el motivo y requeue.
- Si la cuarentena expone un bug de runtime, bloquear promoción y enlazar `runbooks/release-review-promotion.md`.
- Si la tarea debe permanecer detenida, mantenerla en cuarentena y registrar owner/siguiente acción fuera del runbook.
- Si el review es de `runtime-release`, registrar `approved` o `rejected` con `reason` y `evidenceRefs`; no dejar la decisión sólo en chat o CI logs.

## Salida

- Tarea reinsertada con criterio explícito, o cuarentena mantenida como bloqueo documentado.
