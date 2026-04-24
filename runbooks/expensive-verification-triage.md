# Expensive Verification Triage

## Objetivo

Evitar reruns globales de varias horas cuando la señal útil todavía puede obtenerse con checks focalizados, y reducir falsos negativos causados por contaminación de estado en MySQL compartido.

## Disparadores

- Cambios en `packages/control-plane-runtime`, `apps/sandbox-runner`, `apps/public-api`, `apps/operator-console`, `packages/authz` o adapters Prisma-backed.
- Cualquier frente que vaya a ejecutar `pnpm test`, `pnpm build`, `pnpm test:sandbox:certification`, `pnpm test:runtime:release` o `pnpm test:e2e:hermes-smoke`.
- Corridas largas que siguen “avanzando” pero ya consumieron demasiado tiempo sin una señal nueva.
- Repros manuales con `tsx`, Prisma o scripts ad hoc contra `DATABASE_URL`.

## Precondiciones

- Dependencias instaladas con `pnpm install`.
- Tener identificado qué superficies cambió el frente.
- Saber si `DATABASE_URL` apunta a una base compartida o aislada. Si no está probado, tratarla como compartida.
- Si hubo repros manuales, tener un prefijo o lista de IDs para limpieza.

## Preflight obligatorio

Antes de lanzar cualquier comando caro, dejar explícito:

1. Superficies tocadas.
2. Checks focalizados que van primero.
3. Condición exacta para escalar a una corrida global.
4. Riesgo de DB compartida.
5. Plan de cleanup si ya se usó MySQL manualmente.

## Escalera recomendada

1. `pnpm --filter <workspace> typecheck`
2. `pnpm --filter <workspace> test`
3. Repro DB-backed aislado si el flujo toca runtime durable, dispatcher, manifests o `runtime-release`
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm test`
7. `pnpm build`
8. `pnpm test:sandbox:certification`
9. `pnpm test:runtime:release`
10. `GANA_RUNTIME_PROFILE=ci-smoke pnpm test:e2e:hermes-smoke`

No saltar escalones salvo que el usuario lo pida explícitamente y se deje nota del costo.

## Reglas de decisión por superficie

- Solo docs/runbooks/índices: parar en `pnpm lint` si pasa.
- `packages/authz`: no escalar a sweep global hasta que `@gana-v8/authz` pase `typecheck` y `test`.
- `apps/public-api`: no correr `pnpm test` hasta que `@gana-v8/public-api` pase `typecheck` y `test`.
- `apps/operator-console` junto con `public-api`: ambos workspaces deben estar verdes antes del sweep global.
- `apps/sandbox-runner` o `packages/control-plane-runtime`: reproducir primero el flujo DB-backed exacto en aislado.
- Si la falla menciona dispatcher, `manifestId`, `runtime-release` o Hermes smoke, aislar antes de rerunear el monorepo.

## Presupuesto de sweep global

- Presupuestar una sola corrida global inicial por change set.
- Si el sweep falla tarde, queda prohibido relanzarlo de inmediato.
- Después de una falla tardía:
  1. aislar el workspace o test exacto,
  2. limpiar estado residual si hubo MySQL compartido,
  3. volver a correr el repro aislado,
  4. solo entonces considerar otro sweep.

## Checkpoints de tiempo

- A los 15 minutos: identificar workspace o test activo y confirmar que sigue siendo la mejor fuente de señal.
- A los 30 minutos: decidir explícitamente si conviene seguir esperando o aislar un frente menor.
- A los 60 minutos: justificar por qué se sigue esperando aunque el comando todavía emita output.

Salida “activa” no equivale a progreso suficiente si el comando todavía no probó el frente realmente riesgoso.

## DB compartida y cleanup

Si hubo repros manuales o una falla DB-backed, limpiar por prefijo o IDs explícitos antes de reruns amplios. En runtime durable, el baseline mínimo de entidades a barrer es el mismo que cubre la limpieza de [runtime.db.test.ts](../packages/control-plane-runtime/tests/runtime.db.test.ts):

- `automationCycle`
- `task`
- `taskRun`
- `aiRun`
- `auditEvent`
- `fixture`
- `prediction`
- `parlay`
- snapshots de odds/raw ingestion relacionadas

Además:

- Preferir prefijos únicos al sembrar datos manuales.
- Preferir `manifestId`, `fixtureId` o IDs explícitos en repros del dispatcher; no confiar en “el primer manifest listo”.
- Si un test aislado pasa pero el sweep global falla, asumir contaminación de estado antes de asumir regresión funcional.

## Comandos focalizados útiles

```bash
pnpm --filter @gana-v8/authz typecheck
pnpm --filter @gana-v8/authz test
pnpm --filter @gana-v8/public-api typecheck
pnpm --filter @gana-v8/public-api test
pnpm --filter @gana-v8/operator-console typecheck
pnpm --filter @gana-v8/operator-console test
pnpm --filter @gana-v8/sandbox-runner typecheck
pnpm --filter @gana-v8/sandbox-runner test
pnpm --filter @gana-v8/control-plane-runtime typecheck
pnpm --filter @gana-v8/control-plane-runtime test
```

## Referencias

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [runbooks/release-review-promotion.md](./release-review-promotion.md)
- [runbooks/sandbox-certification.md](./sandbox-certification.md)
- [docs/agentic-handoff.md](../docs/agentic-handoff.md)

## Salida

- Verificación escalonada con la menor superficie costosa posible.
- Sweep global ejecutado solo cuando ya existe señal focalizada suficiente.
- DB compartida limpia o riesgo residual documentado antes de cualquier rerun amplio.
- Summaries agent-readable revisados cuando existan: `.artifacts/sandbox-certification/summary.json`, `.artifacts/sandbox-certification/runtime-release/summary.json` y `.artifacts/workspace-dev/<worktree-id>/validation/<timestamp>/summary.json`.
