# Cierre de adopción operativa de runtime-release — gana-v8

**Estado final confirmado (2026-04-22)**

- `runtime-release` ya opera con presets durables por entorno: `ci-ephemeral`, `staging-shared` y `pre-release`.
- La historia durable de certificación y telemetría ya tiene retención online de 90 días con pruning automatizable.
- `public-api` y `operator-console` ya materializan la aprobación humana formal de corridas `review-required` con `AuditEvent` append-only.
- CI dejó de depender del hack de ventana gigante y resuelve baseline/candidate refs desde defaults explícitos del resolver operativo.

## Materializado

- Resolver único de defaults en `apps/sandbox-runner` para `runtime-release`, con precedencia `SANDBOX_CERT_EVIDENCE_PROFILE` > CI/GitHub > `GANA_RUNTIME_PROFILE` > fallback `pre-release`.
- Persistencia de corridas `runtime-release` con `profileName=<evidenceProfile>` y `packId="runtime-release"`.
- Endpoint `POST /sandbox-certification/runs/:runId/promotion-decision` en `public-api`, protegido por capability `release:approve` para roles `operator` y `system`.
- Read models de detalle con `latestPromotionDecision` e historial reciente de decisiones.
- Inspector dedicado de `runtime-release` en `operator-console` con acciones aprobar/rechazar.
- Política de retención online de 90 días para `SandboxCertificationRun`, `OperationalTelemetryEvent` y `OperationalMetricSample`, preservando siempre la última corrida por `(profileName, packId, verificationKind)`.
- Entry point `pnpm ops-history-retention -- --dry-run|--apply`, con reporte JSON en `.artifacts/ops-history-retention/` y `AuditEvent` de housekeeping en modo `apply`.

## Política operativa resultante

- `ci-ephemeral`: usa reloj congelado `2100-01-02T00:00:00.000Z`, `lookback=48h` y no admite override humano.
- `staging-shared`: usa reloj real, `lookback=72h` y la aprobación la registra el operador on-duty.
- `pre-release`: usa reloj real, `lookback=168h` y la aprobación la registra el release owner.
- `baselineRef`: `SANDBOX_CERT_BASELINE_REF` > `GITHUB_BASE_REF` > `main`.
- `candidateRef`: `SANDBOX_CERT_CANDIDATE_REF` > `GITHUB_SHA` > git sha/branch actual.

## Verificación

- `pnpm --filter @gana-v8/public-api typecheck`
- `pnpm --filter @gana-v8/public-api test`
- `pnpm --filter @gana-v8/operator-console typecheck`
- `pnpm --filter @gana-v8/operator-console test`
- `pnpm --filter @gana-v8/sandbox-runner typecheck`
- `pnpm --filter @gana-v8/storage-adapters test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:sandbox:certification`
- `pnpm test:runtime:release`

## Fuentes consolidadas

- `apps/sandbox-runner/`
- `apps/public-api/`
- `apps/operator-console/`
- `packages/authz/`
- `packages/storage-adapters/`
- `packages/control-plane-runtime/`
- `.github/workflows/ci.yml`
- `scripts/ops-history-retention.ts`
- `runbooks/release-review-promotion.md`
- `runbooks/quarantine-manual-review.md`
- `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md`
