# Decision Matrix — gana-v8

## Binding Rules

- If only docs, plans, or runbook links changed, stop at `pnpm lint` unless the user explicitly asks for more.
- If `packages/authz` changed, do not escalate past repo-local checks until `@gana-v8/authz` `typecheck` and `test` are green.
- If `apps/public-api` changed, do not run `pnpm test` until `@gana-v8/public-api` `typecheck` and `test` are green.
- If `apps/operator-console` changed together with `public-api`, both workspaces must be green before any broad sweep.
- If `apps/sandbox-runner` or `packages/control-plane-runtime` changed, reproduce the relevant DB-backed path in isolation before any repo-wide sweep.
- If a failure touched dispatcher, manifest scoping, runtime release, or Hermes smoke, isolate it first. Do not rerun `pnpm test` as the next step.

## Preferred Escalation Ladder

1. Focused workspace `typecheck`
2. Focused workspace `test`
3. DB-backed isolated repro when the changed surface uses MySQL or release evidence
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm test`
7. `pnpm build`
8. `pnpm test:sandbox:certification`
9. `pnpm test:runtime:release`

## Prohibited Shortcuts

- Do not jump from a focused red check directly to `pnpm test`.
- Do not rerun the whole monorepo after a late DB-backed failure without isolation plus cleanup.
- Do not use “the command is still printing output” as a reason to skip time-checkpoint decisions.
