# Runtime Release Review

## Objetivo

Validar el candidato de release contra el runtime durable real del harness y decidir si queda `blocked`, `review-required` o `promotable`.

## Disparadores

- Antes de promover cambios a `main` que toquen runtime, release ops, CI, readiness o runbooks.
- Fallo del job `runtime-release` o del job `e2e-smoke`.
- Cambios que alteren scheduler, dispatcher, recovery, policy, `public-api` u operator surfaces.

## Precondiciones

- MySQL accesible y una base ya creada para la corrida.
- `DATABASE_URL` y `DATABASE_ADMIN_URL` apuntando al entorno a usar para la validación.
- Dependencias instaladas con `pnpm install`.
- Certificación sintética revisada con `runbooks/sandbox-certification.md`.

## Comandos

1. Preparar schema y cliente Prisma:

```bash
pnpm db:generate
pnpm db:migrate:deploy
```

2. Ejecutar el gate MySQL-backed de runtime release:

```bash
pnpm --filter @gana-v8/control-plane-runtime test
pnpm test:runtime:release
```

3. Ejecutar el smoke Hermes end-to-end sobre la misma base:

```bash
GANA_RUNTIME_PROFILE=ci-smoke pnpm test:e2e:hermes-smoke
```

4. Si querés inspección operativa, levantar las surfaces:

```bash
pnpm --filter @gana-v8/public-api serve
pnpm --filter @gana-v8/operator-console serve:web
```

## Evidencia esperada

- `packages/control-plane-runtime/tests/runtime.db.test.ts` pasa cubriendo scheduler cursors, manifest scoping y recovery/redrive sobre MySQL real.
- `tests/e2e/hermes-smoke.mjs` pasa compilando y validando `hermes-scheduler`, `hermes-dispatcher` y `hermes-recovery`.
- `public-api` puede exponer `/health`, `/readiness`, `/operational-summary` y `/operational-logs` sin contradicciones obvias con la corrida.

## Decisiones humanas

- `blocked`: falla `runtime-release`, hay recovery/redrive inconsistente o la lectura operativa no coincide con lo que reporta CI.
- `review-required`: todo pasa, pero hubo cambios deliberados en promotion gates, manual review paths o evidencia que requieren aprobación explícita.
- `promotable`: pasan `runtime-release`, `e2e-smoke` y la certificación sintética, y no queda discrepancia operativa abierta.

## Salida

- Estado de release clasificado como `blocked`, `review-required` o `promotable`, con evidencia enlazada a la corrida revisada.
