# Hermes E2E Smoke Failure

## Objetivo

Diagnosticar fallos del smoke end-to-end de Hermes y separar problemas de compilación, wiring de apps y runtime durable.

## Disparadores

- Falla `pnpm test:e2e:hermes-smoke`.
- Falla el job `e2e-smoke` en CI.
- Un cambio en `hermes-scheduler`, `hermes-dispatcher`, `hermes-recovery` o `control-plane-runtime` rompe la ruta de smoke de procesos vivos.

## Precondiciones

- MySQL accesible y base creada para la corrida.
- `DATABASE_URL`, `DATABASE_ADMIN_URL` y `GANA_RUNTIME_PROFILE=ci-smoke`.
- Dependencias instaladas con `pnpm install`.

## Comandos

1. Preparar schema:

```bash
pnpm db:generate
pnpm db:migrate:deploy
```

2. Reproducir el smoke local:

```bash
GANA_RUNTIME_PROFILE=ci-smoke pnpm test:e2e:hermes-smoke
```

3. Si el fallo parece más profundo que wiring/compilación, correr también el gate MySQL-backed del runtime:

```bash
pnpm --filter @gana-v8/control-plane-runtime test
```

## Evidencia esperada

- El smoke levanta o ejercita procesos vivos equivalentes de `@gana-v8/hermes-scheduler`, `@gana-v8/hermes-dispatcher` y `@gana-v8/hermes-recovery`, además de validar el runtime compartido.
- Si falla, el error queda localizado en build, import/export contract o runtime durable.
- La misma base permite decidir si el problema es del smoke wrapper o del runtime real.
- Si la corrida solo valida imports/compilación, marcar la evidencia como degradada y no tratarla como smoke end-to-end completo.

## Decisiones humanas

- Si falla solo el smoke pero `runtime-release` pasa, tratarlo como regresión de wiring/entrypoint y no como rollback automático.
- Si fallan smoke y runtime-release, bloquear promoción y seguir `runbooks/release-review-promotion.md`.
- Si el fallo afecta solo certificación sintética, derivar a `runbooks/sandbox-certification-drift.md`.

## Salida

- Smoke recuperado o incidente clasificado con owner claro para wiring, runtime durable o certificación.
