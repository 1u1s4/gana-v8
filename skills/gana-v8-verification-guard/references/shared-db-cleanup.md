# Shared DB Cleanup Contract — gana-v8

## When Cleanup Is Mandatory

- You ran manual `tsx`, Prisma, or app-level repros against `DATABASE_URL`.
- A DB-backed test failed after seeding fixtures, tasks, manifests, or audit events.
- An isolated repro passed but the next broad suite still failed in runtime durable paths.

## Minimum Cleanup Scope

Clean by unique prefix or explicit IDs across every entity touched by the repro. The minimum recurring set in this repo is:

- `automationCycle`
- `task`
- `taskRun`
- `aiRun`
- `auditEvent`
- `fixture`
- `prediction`
- `parlay`
- related odds/raw ingestion snapshots
- any sandbox certification rows or telemetry rows created by the repro

Use the cleanup coverage in `packages/control-plane-runtime/tests/runtime.db.test.ts` as the baseline shape to mirror when the failing path touched runtime durable flows.

## Required Verification After Cleanup

1. Confirm the targeted repro data no longer exists.
2. Re-run the isolated failing test or workspace check.
3. Only if that is green, consider rerunning a broad suite.

## Notes

- Prefer unique prefixes at creation time so cleanup is deterministic.
- Prefer explicit selectors such as `manifestId` to avoid accidentally reading foreign rows from a shared DB.
- If you cannot prove cleanup, assume the DB is still contaminated.
