# Cierre completado de harness de verificación, release ops y runbooks — gana-v8

## Resultado materializado (2026-04-22)

El frente de release ops del harness quedó implementado de forma sustancial en el repo actual. El cierre incluye persistencia durable para corridas de certificación y telemetría operativa, separación explícita entre `synthetic-integrity` y `runtime-release`, endpoints operativos unificados en `public-api`, consumo coherente desde `operator-console`, catálogo mínimo de runbooks y jobs CI MySQL-backed alineados con Prisma migrations.

## Capacidades materializadas

- Prisma, `domain-core` y `storage-adapters` ahora persisten `SandboxCertificationRun`, `OperationalTelemetryEvent` y `OperationalMetricSample`, además de enriquecer `AuditEvent` con actor/subject/action/trace/correlation/lineage.
- `TaskStatus` y los contratos derivados ya aceptan `quarantined`, y `OperationalSummary.taskCounts` lo refleja como estado operativo bloqueante.
- `pnpm test:sandbox:certification` quedó preservado como flujo sintético append-only, mientras `pnpm test:runtime:release` ejecuta la evidencia MySQL-backed de release ops de forma separada.
- `packages/observability` y `packages/audit-lineage` soportan sinks durables; `hermes-scheduler`, `hermes-dispatcher`, `hermes-recovery`, `sandbox-runner` y las acciones manuales de `public-api` emiten telemetría persistida con `traceId`/`correlationId`.
- `public-api` expone `/sandbox-certification`, `/sandbox-certification/runs`, `/sandbox-certification/runs/:runId`, `/telemetry/events` y `/telemetry/metrics`, con filtros de consulta y snapshots DB-backed para ETL, certificación y telemetría.
- `operator-console` consume esos read models y refleja historia de corridas, recovery/manual review, telemetría reciente y estados de promoción con la misma terminología de `public-api`.
- `runbooks/` quedó normalizado con procedimientos explícitos para sandbox certification, drift, recovery/redrive, quarantine/manual review, runtime release review, rollback, incidentes de observabilidad, staleness entre API/consola y fallos del smoke E2E.
- CI ejecuta `sandbox-certification`, `runtime-release` y `e2e-smoke` sobre MySQL con `pnpm db:migrate:deploy`, además de exportar evidence packs de certificación y runtime release.

## Validación relevante

- `pnpm prisma migrate status` reporta `Database schema is up to date!` tras corregir la migración `20260422_release_ops_certification_telemetry` para MySQL.
- `pnpm --filter @gana-v8/public-api test` pasó con 34/34 tests, incluyendo filtros de telemetría, detalle por `runId` y telemetría durable de acciones manuales.
- `pnpm --filter @gana-v8/control-plane-runtime test` pasó con 6/6 tests MySQL-backed para scheduler, dispatcher y recovery.
- `pnpm test:sandbox:certification` pasó con 6 goldens y mantuvo la ruta sintética separada del gate `runtime-release`.
- `node scripts/workspace-lint.mjs --repo .` quedó verde tras sincronizar planes, README y runbooks.

## Notas operativas

- `pnpm test:runtime:release` es un gate deliberadamente sensible al estado real del runtime durable. En entornos compartidos puede devolver `blocked` si detecta tasks `quarantined`, fallos activos o cobertura contractual insuficiente dentro de la ventana inspeccionada.
- El job CI de `runtime-release` fija `SANDBOX_CERT_NOW` y `SANDBOX_CERT_LOOKBACK_HOURS` para que la ventana de certificación cubra los fixtures temporales sembrados por las pruebas DB-backed en la base efímera del pipeline.
- `.artifacts/sandbox-certification/` sigue siendo export/debug y artifact de CI, mientras la historia consultable canónica queda en DB.
