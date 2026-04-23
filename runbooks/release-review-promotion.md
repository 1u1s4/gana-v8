# Runtime Release Review

## Objetivo

Validar el candidato de release contra el runtime durable real del harness, clasificarlo como `blocked`, `review-required` o `promotable`, y registrar cualquier aprobación humana por la misma vía auditable que ya usan las superficies operativas.

## Disparadores

- Antes de promover cambios a `main` que toquen runtime, release ops, CI, readiness o runbooks.
- Fallo del job `runtime-release` o del job `e2e-smoke`.
- Corridas `runtime-release` con `promotionStatus=review-required`.

## Perfiles operativos

- `ci-ephemeral`: usa `SANDBOX_CERT_NOW=2100-01-02T00:00:00.000Z`, `lookback=48h` y baseline/candidate resueltos desde CI/GitHub. Sirve para CI efímero y no acepta override humano.
- `staging-shared`: usa reloj real, `lookback=72h` y el approval lo registra el operador on-duty.
- `pre-release`: usa reloj real, `lookback=168h` y el approval lo registra el release owner.

Resolución de refs:

- `baselineRef`: `SANDBOX_CERT_BASELINE_REF` > `GITHUB_BASE_REF` > `main`
- `candidateRef`: `SANDBOX_CERT_CANDIDATE_REF` > `GITHUB_SHA` > git sha/branch actual

## Precondiciones

- MySQL accesible y una base ya creada para la corrida.
- `DATABASE_URL` y `DATABASE_ADMIN_URL` apuntando al entorno a usar para la validación.
- Dependencias instaladas con `pnpm install`.
- Certificación sintética revisada con `runbooks/sandbox-certification.md`.
- Token de `public-api` con capability `release:approve` cuando vaya a registrarse una decisión humana.

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

5. Si la corrida queda `review-required`, registrar la decisión humana:

```bash
curl -s -X POST \
  http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/sandbox-certification/runs/<run-id>/promotion-decision \
  -H "authorization: Bearer ${GANA_PUBLIC_API_OPERATOR_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "decision":"approved",
    "reason":"Release owner reviewed runtime evidence and approved promotion.",
    "evidenceRefs":["https://ci.example/runs/1234","operator-console://runtime-release/<run-id>"]
  }'
```

## Evidencia esperada

- `packages/control-plane-runtime/tests/runtime.db.test.ts` pasa cubriendo scheduler cursors, manifest scoping y recovery/redrive sobre MySQL real.
- `tests/e2e/hermes-smoke.mjs` pasa compilando y validando `hermes-scheduler`, `hermes-dispatcher` y `hermes-recovery`.
- `public-api` expone `/sandbox-certification/runs?verificationKind=runtime-release` y el detalle `/sandbox-certification/runs/:runId`.
- `operator-console` muestra un inspector dedicado de `runtime-release` con el historial reciente de decisiones.
- Cada decisión humana queda como `AuditEvent` append-only sobre `sandbox-certification-run`.

## Decisiones humanas

- `blocked`: falla `runtime-release`, hay recovery/redrive inconsistente o la lectura operativa no coincide con lo que reporta CI.
- `review-required`: el gate técnico pasa, pero la promoción depende de aprobación explícita.
- `promotable`: pasan `runtime-release`, `e2e-smoke` y la certificación sintética, y no queda discrepancia operativa abierta.
- `ci-ephemeral`: no se aprueba manualmente; si la corrida requiere override, se considera señal de configuración incorrecta.

## Salida

- Estado de release clasificado como `blocked`, `review-required` o `promotable`, con evidencia enlazada a la corrida revisada y decisión humana auditable cuando aplique.
