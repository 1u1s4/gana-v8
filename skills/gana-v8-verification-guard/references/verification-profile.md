# Verification Profile — gana-v8

## Cost Model

- `pnpm lint`: cheap to medium; includes repo-harness documentation invariants, so docs drift can fail fast.
- `pnpm --filter <workspace> typecheck`: usually the cheapest useful proof for code changes.
- `pnpm --filter <workspace> test`: medium to heavy; many workspaces rebuild before testing.
- `pnpm typecheck`: heavy; multiple packages build dependencies as part of typecheck.
- `pnpm build`: heavy; broad dependency fan-out across workers and runtime packages.
- `pnpm test`: very heavy; Turbo `test` depends on `build`, and many workspace `test` scripts run `pnpm run build` again.
- `pnpm test:sandbox:certification`: medium to heavy; synthetic certification with artifact generation.
- `pnpm test:runtime:release`: heavy and DB-backed; builds `sandbox-runner`, opens Prisma persistence, and exercises release evidence flows.

## High-Risk Surfaces

- `packages/control-plane-runtime`: broad build fan-out into workers, `public-api`, `sandbox-runner`, and queue/runtime dependencies.
- `apps/public-api`: drags `storage-adapters`, `queue-adapters`, `policy-engine`, and `authz`.
- `apps/operator-console`: depends on `public-api`, so UI validation often inherits API build cost.
- `apps/sandbox-runner` and `tests/sandbox/runtime-release.mjs`: DB-backed release evidence and persistent artifacts.
- Prisma-backed tests anywhere in the repo: vulnerable to shared-state contamination if manual repros leave rows behind.

## Recommended First Checks By Surface

- Docs and plan-index changes only: `pnpm lint`
- `packages/authz`: `pnpm --filter @gana-v8/authz typecheck` then `pnpm --filter @gana-v8/authz test`
- `apps/public-api`: `pnpm --filter @gana-v8/public-api typecheck` then `pnpm --filter @gana-v8/public-api test`
- `apps/operator-console`: `pnpm --filter @gana-v8/operator-console typecheck` then `pnpm --filter @gana-v8/operator-console test`
- `apps/sandbox-runner`: `pnpm --filter @gana-v8/sandbox-runner typecheck` then `pnpm --filter @gana-v8/sandbox-runner test`
- `packages/control-plane-runtime`: `pnpm --filter @gana-v8/control-plane-runtime typecheck` then `pnpm --filter @gana-v8/control-plane-runtime test`
- Cross-surface authz/API/UI changes: prove `authz`, `public-api`, and `operator-console` in that order before any repo-wide sweep.

## DB-Backed Discipline

- Use unique prefixes for manual records.
- Prefer explicit selectors such as `manifestId` when reproducing dispatcher behavior.
- Clean manual fixtures, tasks, task runs, automation cycles, predictions, parlays, and audit events before rerunning global suites.
- If a failing test passes in isolation, treat shared DB state as the default suspect.

## Anti-Patterns

- Running `pnpm test` while focused package checks are still red.
- Rerunning the whole monorepo immediately after the first late failure instead of isolating the failing package or test.
- Waiting on a quiet long-running command for an hour without checking which workspace or test is active.
- Using manual Prisma or `tsx` repros against the shared DB and skipping cleanup afterward.
- Assuming a late DB-backed failure is a product regression before ruling out non-determinism.
