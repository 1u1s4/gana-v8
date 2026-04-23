# Plan residual de adopción operativa de runtime-release y calibración de ventanas — gana-v8

**Estado actual confirmado (2026-04-22)**

- El cierre principal de harness, release ops y runbooks ya quedó materializado en `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md`.
- `pnpm test:sandbox:certification` ya quedó acotado a `synthetic-integrity`, mientras `pnpm test:runtime:release` ejecuta el gate MySQL-backed en flujo separado.
- CI ya usa `pnpm db:migrate:deploy` y exporta evidence packs de `runtime-release`.
- `public-api`, `operator-console`, `scheduler`, `dispatcher`, `recovery` y `sandbox-runner` ya persisten señales durables de certificación y telemetría.
- En entornos compartidos, `runtime-release` puede devolver `blocked` por estado operativo real del runtime durable, no por ausencia de la capacidad.

## Ya cubierto

- Schema, contratos, repositorios y migración durable para certificación, telemetría y audit lineage.
- Endpoints/history/detail/filtros de certificación y telemetría en `public-api`.
- Consumo operativo desde `operator-console`.
- Runbooks mínimos de certificación, review de release, rollback, quarantine/manual review, recovery/redrive, observabilidad y staleness.
- Jobs CI `sandbox-certification`, `runtime-release` y `e2e-smoke` sobre MySQL real.

## Faltantes exclusivos

### 1. Calibración operativa de ventanas y baseline refs

- Definir defaults por entorno para `SANDBOX_CERT_NOW`, `SANDBOX_CERT_LOOKBACK_HOURS`, `baselineRef` y `candidateRef` sin depender de overrides ad hoc.
- Separar explícitamente perfiles de evidencia para CI efímero, staging compartido y revisión pre-release sobre entornos persistentes.

### 2. Retención y pruning de historia durable

- Diseñar política de pruning/retention para `SandboxCertificationRun`, `OperationalTelemetryEvent` y `OperationalMetricSample`.
- Definir límites por endpoint, estrategia de archivo y housekeeping para evitar crecimiento indefinido.

### 3. Operación humana y overrides formales

- Formalizar quién aprueba `review-required`, cómo se registra el override y qué evidencia mínima debe adjuntarse en entornos compartidos.
- Alinear esa decisión humana con dashboards, runbooks y auditoría sin reintroducir lógica paralela fuera de `public-api`.

## Interfaces/contratos afectados

- Variables de entorno y defaults del flujo `runtime-release`.
- Consultas y retención sobre `SandboxCertificationRun`, `OperationalTelemetryEvent` y `OperationalMetricSample`.
- Runbooks de `release-review-promotion`, `rollback` y `observability-traceability-incident`.

## Dependencias

- Parte del cierre completado en `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md`.
- Runtime durable ya establecido en `docs/plans/completado/gana-v8-harness-runtime-durable.md`.

## Criterio de done

- Existe una política clara por entorno para ventanas, baseline refs y candidate refs de `runtime-release`.
- La historia durable tiene retención/pruning definidos y automatizables.
- Los overrides humanos de promoción/revisión quedan trazables, auditables y consumidos por las mismas superficies operativas.

## Fuentes consolidadas

- `apps/sandbox-runner/`
- `apps/public-api/`
- `apps/operator-console/`
- `packages/control-plane-runtime/`
- `.github/workflows/ci.yml`
- `runbooks/release-review-promotion.md`
- `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md`
