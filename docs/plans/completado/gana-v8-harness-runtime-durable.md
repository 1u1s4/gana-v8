# Plan completado de harness runtime durable — gana-v8

**Estado final (2026-04-22)**

- `packages/control-plane-runtime` y `apps/hermes-scheduler`, `apps/hermes-dispatcher` y `apps/hermes-recovery` quedaron consolidados como topologia durable oficial del harness.
- `Task` persiste ownership y lease first-class mediante `manifestId`, `workflowId`, `traceId`, `correlationId`, `source`, `leaseOwner`, `leaseExpiresAt`, `claimedAt`, `lastHeartbeatAt` y `activeTaskRunId`.
- `AutomationCycle.id` es el `manifestId` oficial del scheduler y `SchedulerCursor` quedo persistido como estado durable de cron.
- El dispatcher ya enruta `fixture-ingestion`, `odds-ingestion`, `research`, `prediction`, `validation` y `sandbox-replay`; tambien renueva leases durante trabajos largos y conserva scoping por manifest.
- `sandbox-replay` dejo de ser no-op y ahora materializa corridas reales via `materializeSandboxRun(..., mode: "replay")`.
- La MySQL compartida quedo alineada con `20260421_automation_cycle_runtime`, `20260422_task_durable_runtime_contract` y `20260422_research_runtime_support_tables`; durante el cierre `pnpm prisma migrate status --schema prisma/schema.prisma` quedo limpio.
- La cobertura DB-backed de la topologia nueva quedo materializada en `packages/control-plane-runtime/tests/runtime.db.test.ts`, mientras `apps/hermes-control-plane` siguio funcionando como oracle temporal de parity sin bloquear el cierre del frente.

## Alcance materializado

- Contratos y persistencia: Prisma, mappers, repositorios y queue adapters ya operan con leases durables y ownership explicito por corrida.
- Runtime operativo: scheduler, dispatcher y recovery quedaron separados en modulos, cierran siempre su `AutomationCycle` y comparten la misma verdad durable para claims, heartbeat y redrive.
- Semantica legacy portada: coverage gating, latest odds `h2h`, `manualSelectionStatus`, `selectionOverride`, manifest scoping y publisher scoping quedaron reintroducidos en la topologia nueva.
- Read models y superficies operativas: `public-api` expone ownership minimo de corrida, deadlines de lease y estado de ciclo para reconstruir una corrida durable sin depender de inspeccion manual de JSONs dispersos.

## Verificacion de cierre

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:sandbox:certification`
- `pnpm prisma migrate status --schema prisma/schema.prisma`
- `pnpm lint`

## Notas de compatibilidad

- `apps/hermes-control-plane` permanece como compatibilidad temporal y oracle de parity, pero el gap central de runtime durable ya no vive alli.
- El follow-up que dependia de este cierre ya quedo materializado en `docs/plans/completado/gana-v8-runtime-release-adopcion-operativa.md`, que tomo estas senales durables como base operativa.

## Fuentes consolidadas

- Repo actual: `packages/control-plane-runtime/`, `packages/queue-adapters/`, `packages/storage-adapters/`, `apps/hermes-scheduler/`, `apps/hermes-dispatcher/`, `apps/hermes-recovery/`, `apps/hermes-control-plane/`, `apps/public-api/`, `prisma/schema.prisma`.
- Migraciones: `20260421_automation_cycle_runtime`, `20260422_task_durable_runtime_contract`, `20260422_research_runtime_support_tables`.
- Verificacion operativa: `packages/control-plane-runtime/tests/runtime.db.test.ts`, `tests/sandbox/certification.mjs`.
