# Sandbox Certification

## Objetivo

Detectar drift estructural en packs sintéticos, perfiles certificados y promotion gates antes de promover cambios del harness.

## Disparadores

- Cambios en `fixtures/replays/goldens/`, `apps/sandbox-runner/`, `packages/testing-fixtures/` o `tests/sandbox/certification.mjs`.
- Fallo del job `sandbox-certification` en CI.
- Necesidad de validar si un drift es intencional o si rompe la baseline aprobada.

## Precondiciones

- Dependencias instaladas con `pnpm install`.
- No usar este runbook como sustituto del gate MySQL-backed de runtime release; certifica sandbox sintético, no comportamiento durable contra MySQL.
- Tener claro qué profile/pack cambió y qué decisión humana se espera del resultado.

## Comandos

1. Ejecutar la certificación completa:

```bash
pnpm test:sandbox:certification
```

2. Si necesitás inspección puntual, regenerar un evidence pack local para un golden específico:

```bash
pnpm --filter @gana-v8/sandbox-runner certify -- --mode smoke --profile ci-smoke --pack football-dual-smoke --golden fixtures/replays/goldens/ci-smoke/football-dual-smoke.json --artifact .artifacts/sandbox-certification/ci-smoke/football-dual-smoke.evidence.json
```

3. Si el drift es esperado, actualizar la golden correspondiente y volver a correr la certificación completa antes de cerrar el cambio.

## Evidencia esperada

- `0 diff entries` cuando la baseline sigue vigente.
- Evidence packs regenerados en `.artifacts/sandbox-certification/`.
- Promotion gates explícitos por profile (`blocked`, `review-required`, `promotable`).
- En CI, artifact `sandbox-certification-evidence` aun cuando la comparación falle.

## Decisiones humanas

- Si el diff cambia fingerprints, timeline, provider modes o safety rails sin causa intencional, tratarlo como bloqueo y abrir investigación.
- Si el diff es intencional pero cambia promotion gates o policy snapshots, dejar nota explícita del motivo y revisar también `runbooks/release-review-promotion.md`.
- Si el fallo proviene de evidencia corrupta o desalineada contra goldens vigentes, seguir `runbooks/sandbox-certification-drift.md`.

## Salida

- Certificación sintética aprobada y lista para CI, o drift clasificado como bloqueo/review con siguiente acción documentada.
