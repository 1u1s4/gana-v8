---
name: gana-v8-verification-guard
description: Stage and troubleshoot expensive verification in the gana-v8 monorepo. Use when Codex is about to run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:sandbox:certification`, `pnpm test:runtime:release`, or DB-backed Hermes/runtime-release checks; when a validation command is slow, appears stuck, or has already consumed tens of minutes; and when changes touch `public-api`, `operator-console`, `sandbox-runner`, `control-plane-runtime`, Prisma-backed adapters, or release-review flows.
---

# Gana V8 Verification Guard

## Overview

Avoid multi-hour verification loops by proving the smallest risky surface first, keeping shared MySQL state clean, and escalating to repo-wide checks only once targeted checks are green.

Read [verification-profile.md](references/verification-profile.md) for the repo-specific cost model, [decision-matrix.md](references/decision-matrix.md) for binding escalation rules, and [shared-db-cleanup.md](references/shared-db-cleanup.md) when manual repros touched MySQL state.

## Mandatory Preflight

Before running any expensive command, write down these five items in the working notes or user update:

1. Changed surfaces.
2. Whether `DATABASE_URL` is shared or isolated.
3. The exact focused checks you will run first.
4. The condition that allows escalation to repo-wide checks.
5. The cleanup plan if you already ran manual repros against MySQL.

## Workflow

1. Map the touched surfaces to the cheapest proving checks before running anything global.
2. Run targeted `typecheck` and `test` commands for edited workspaces first.
3. If a change touches runtime durable flows, reproduce DB-backed behavior in isolation before `pnpm test`.
4. Run the repo-wide exit battery only once, at the end, in the harness order from `AGENTS.md`.

Treat the decision table in [decision-matrix.md](references/decision-matrix.md) as binding. Do not improvise a broader sweep unless its entry condition is satisfied.

## Stop Conditions Before Full Verification

Do not jump straight to `pnpm test` or `pnpm verify` if any of these are true:

- The change is still failing focused package `typecheck` or `test`.
- A DB-backed failure has not been reproduced in isolation with the exact failing workspace or test.
- Manual repros have left fixtures, tasks, manifests, or audit events in the shared database.
- The doc sync required by `README.md`, `docs/plans/README.md`, or `docs/plans/falta/` is still incomplete.

## Full Sweep Budget

- Budget exactly one initial repo-wide sweep per change set.
- If that sweep fails late, do not rerun it immediately.
- After a late failure, isolate the failing workspace or test, clean DB residue if applicable, and rerun the broad sweep only after the focused repro is green.
- If the user explicitly wants a second broad sweep before isolation, call out that this is a high-cost choice and why.

## Shared-DB Guardrails

- Treat `DATABASE_URL` as shared unless you proved otherwise.
- Use unique prefixes for manual fixtures, tasks, manifests, packs, and lease owners.
- Clean every manual artifact before rerunning global suites.
- Prefer explicit IDs such as `manifestId`, `fixtureId`, or `runId` in DB-backed tests instead of relying on "the first ready row".
- If an isolated DB-backed test passes but the global suite fails, suspect state contamination before assuming a product regression.

Use [shared-db-cleanup.md](references/shared-db-cleanup.md) as the minimum cleanup contract. Do not assume a single deleted row is enough.

## Slow-Run Triage

When a long command is already running:

1. Let it emit real progress, but do not wait blindly forever.
2. If output stalls for roughly 10-15 minutes, inspect the process from another shell and identify the current workspace or test.
3. On the first failure, stop broad reruns and reproduce that workspace or test directly.
4. Fix determinism or cleanup issues locally, then resume the broader battery.

## Time Checkpoints

- At 15 minutes: identify the active workspace or test and confirm it is still the intended proof point.
- At 30 minutes: decide explicitly whether the command is still buying signal or whether you should isolate a smaller surface.
- At 60 minutes: justify in writing why you are still waiting instead of branching into isolate-and-debug mode, even if output is still moving.
- For commands known to be structurally expensive in this repo, active output is not enough by itself to keep waiting.

## Repo-Specific Notes

- `pnpm test` is structurally expensive because Turbo `test` depends on `build`, and many workspaces run `pnpm run build` again inside `test`.
- `packages/control-plane-runtime` is especially heavy because its `build` depends on many apps and workers.
- `tests/sandbox/runtime-release.mjs` builds `@gana-v8/sandbox-runner` and opens a Prisma persistence session against MySQL.
- Shared-state DB tests can fail late and non-deterministically if manual repros or other suites leave rows behind.

## Output Expectations

When using this skill, explicitly tell the user:

- The cheapest checks you will run first.
- Why a full repo sweep is justified or not yet justified.
- Whether shared DB state is a risk.
- Whether manual repro cleanup is required before any rerun.
- The exact point where you will escalate to `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:sandbox:certification`, and `pnpm test:runtime:release`.

## References

- For command-level heuristics and concrete examples, read [verification-profile.md](references/verification-profile.md).
- For binding escalation rules, read [decision-matrix.md](references/decision-matrix.md).
- For shared-DB cleanup expectations, read [shared-db-cleanup.md](references/shared-db-cleanup.md).
