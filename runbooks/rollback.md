# Runtime Release Rollback

## Objetivo

Retirar un candidato de release del harness cuando el runtime durable o la evidencia operativa dejan de ser confiables.

## Disparadores

- Regresión detectada después de aprobar un candidato.
- Fallo en `runtime-release`, `e2e-smoke` o `sandbox-certification` sobre el commit candidato.
- Inconsistencia entre `public-api`, `operator-console` y el estado real de cola/recovery.

## Precondiciones

- Tener identificado el SHA o branch conocido como bueno.
- Confirmar si el rollback aplica a código, baseline sintética o ambos.
- Acordar ownership humano de la decisión antes de cortar una nueva promoción.

## Comandos

1. Pausar la promoción del candidato y volver al SHA/branch previamente aprobado usando el flujo Git de tu equipo.

2. Sobre el candidato de rollback, revalidar los gates obligatorios:

```bash
pnpm test:sandbox:certification
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @gana-v8/control-plane-runtime test
GANA_RUNTIME_PROFILE=ci-smoke pnpm test:e2e:hermes-smoke
```

3. Si necesitás inspección operativa del rollback:

```bash
pnpm --filter @gana-v8/public-api serve
pnpm --filter @gana-v8/operator-console serve:web
```

## Evidencia esperada

- El SHA de rollback vuelve a pasar certificación sintética, `runtime-release` y `e2e-smoke`.
- `public-api` y `operator-console` recuperan un estado coherente de readiness/health.
- La razón del rollback queda asociada a un fallo concreto de release ops, no a una intuición sin evidencia.

## Decisiones humanas

- Si el rollback recupera las señales esperadas, cerrar la promoción del candidato fallido y abrir follow-up para la regresión.
- Si el rollback también falla, tratarlo como incidente del harness y seguir `runbooks/observability-traceability-incident.md`.
- Si el problema era solo drift sintético, desviar a `runbooks/sandbox-certification-drift.md` en vez de forzar rollback de runtime.

## Salida

- Candidato retirado y reemplazado por una baseline aprobada, o incidente escalado cuando no existe rollback confiable inmediato.
