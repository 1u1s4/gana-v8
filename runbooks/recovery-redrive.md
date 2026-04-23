# Hermes Recovery Redrive

## Objetivo

Diagnosticar y recuperar trabajo fallido o leases vencidas en la topología Hermes sin perder trazabilidad de redrive y cuarentenas.

## Disparadores

- Tareas `failed` o `quarantined` en la cola.
- Leases expiradas o presión de retry visible en readiness/policy.
- Fallo del job `runtime-release` en la prueba de recovery o incidente operativo real del runtime.

## Precondiciones

- MySQL accesible y `DATABASE_URL` configurada.
- Conocer si el incidente es de lease vencida, task fallida recuperable o cuarentena que requiere revisión manual.
- Tener acceso a `public-api` o a un entorno donde puedas levantarlo.

## Comandos

1. Revisar el estado operativo:

```bash
pnpm --filter @gana-v8/public-api serve
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/operational-summary
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/readiness
```

2. Reproducir el gate MySQL-backed de recovery/redrive si necesitás validar el runtime:

```bash
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @gana-v8/control-plane-runtime test
```

3. Si el runtime ya identificó una tarea terminal recuperable, requeue manual vía API:

```bash
curl -s -X POST http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/tasks/<task-id>/requeue \
  -H 'content-type: application/json' \
  -d '{"occurredAt":"2026-04-22T00:33:00.000Z"}'
```

## Evidencia esperada

- `operational-summary` refleja presión de retries, failed/quarantined y policy coherente con el incidente.
- `readiness` explica si el estado es `blocked` o `review`.
- El task requeued vuelve a `queued` sin borrar historial de `taskRuns`.

## Decisiones humanas

- Si la tarea solo necesita redrive, requeue y monitorear la siguiente corrida.
- Si la tarea quedó `quarantined` o agotó reintentos, no forzar redrive ciego; seguir `runbooks/quarantine-manual-review.md`.
- Si recovery/redrive falla también en la ruta MySQL-backed, bloquear promoción y abrir review de runtime release.

## Salida

- Trabajo recuperado por redrive con trazabilidad intacta, o incidente escalado a cuarentena/manual review.
