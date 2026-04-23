# Public API / Operator Console Read Model Staleness

## Objetivo

Diagnosticar divergencias entre `public-api`, `operator-console` y el estado durable real cuando los read models quedan atrasados, incompletos o mezclan fuentes inconsistentes.

## Disparadores

- `operator-console` muestra counts, certification runs o telemetry distintos a `public-api`.
- `public-api` refleja datos viejos aunque MySQL ya tenga nuevas corridas, task runs o telemetry.
- El operador no puede saber si el problema es del runtime o de la capa de lectura.

## Precondiciones

- `public-api` accesible contra el entorno afectado.
- Acceso al `DATABASE_URL` del entorno o a una réplica donde puedas consultar Prisma/MySQL.
- Tener claro qué entidad parece stale: certificación, telemetry, automation cycles o summaries operativos.

## Comandos

1. Capturar la lectura canónica desde `public-api`:

```bash
pnpm --filter @gana-v8/public-api serve
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/operational-summary
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/sandbox-certification
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/sandbox-certification/runs
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/telemetry/events
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/telemetry/metrics
```

2. Contrastar contra la base durable:

```bash
pnpm db:generate
pnpm db:push
pnpm --filter @gana-v8/control-plane-runtime test
```

3. Si la consola sigue mostrando datos viejos, relanzar `operator-console` apuntando explícitamente al mismo `public-api`:

```bash
GANA_OPERATOR_CONSOLE_PUBLIC_API_URL=http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100} \
pnpm --filter @gana-v8/operator-console serve:web
```

## Evidencia esperada

- Respuesta consistente entre `/sandbox-certification`, `/sandbox-certification/runs`, `/telemetry/events` y `/telemetry/metrics`.
- Confirmación de si la staleness viene de DB, de loaders Prisma/read repositories o del wiring de `operator-console`.
- Identificación de la entidad exacta que quedó fuera de sincronía: `AutomationCycle`, `Task`, `TaskRun`, `SandboxCertificationRun`, `OperationalTelemetryEvent` o `OperationalMetricSample`.

## Decisiones humanas

- Si `public-api` ya refleja el estado correcto y la consola no, tratarlo como bug de consumo/render de `operator-console`.
- Si `public-api` también está stale frente a MySQL, tratarlo como incidente de read model y bloquear promoción.
- Si la divergencia coincide con un incidente de runtime real, seguir además `runbooks/observability-traceability-incident.md` o el runbook específico del frente afectado.

## Salida

- Divergencia clasificada como problema de runtime, de read model o de consola, con evidencia suficiente para corregir sin promover a ciegas.
