# Sandbox Certification Drift

## Objetivo

Triagear y resolver drift en certificación sintética sin confundir un cambio estructural esperado con una regresión del harness.

## Disparadores

- `pnpm test:sandbox:certification` falla.
- El artifact `sandbox-certification-evidence` difiere de la golden aprobada.
- Cambia un profile certificado, un pack o un promotion gate y no está claro si el cambio es deseado.

## Precondiciones

- Tener el diff o artifact fallido de la corrida local/CI.
- Identificar el `profile`, `pack` y golden afectado.
- Revisar `.artifacts/sandbox-certification/summary.json` para confirmar `category=golden-drift`, artifact afectado, comando mínimo de repro y runbook sugerido.
- Si el cambio también toca runtime durable o MySQL-backed behavior, preparar validación adicional con `runbooks/release-review-promotion.md`.

## Comandos

1. Reproducir la falla localmente:

```bash
pnpm test:sandbox:certification
```

2. Regenerar solo el evidence pack afectado para inspección:

```bash
pnpm --filter @gana-v8/sandbox-runner certify -- --mode replay --profile ci-regression --pack football-replay-late-swing --golden fixtures/replays/goldens/ci-regression/football-replay-late-swing.json --artifact .artifacts/sandbox-certification/ci-regression/football-replay-late-swing.evidence.json
```

3. Comparar qué cambió en la evidencia y en la golden afectada:

```bash
git diff -- fixtures/replays/goldens .artifacts/sandbox-certification
```

4. Si el cambio es intencional, actualizar la golden y volver a correr la certificación completa:

```bash
pnpm test:sandbox:certification
```

## Evidencia esperada

- Diff acotado al `profile/pack` afectado.
- Razón clara del drift: pack, provider mode, replay timeline, fingerprint, safety rails o promotion gates.
- Summary actualizado con `failures[].category=golden-drift` mientras la falla esté abierta, o sin fallos cuando la baseline aceptada vuelva a pasar.
- Corrida final con `0 diff entries` si se acepta la nueva baseline.

## Decisiones humanas

- Si el drift cambia promotion gates o safety rails sin expectativa explícita, bloquear el release.
- Si el drift solo refleja una baseline nueva aprobada, dejar la justificación en el cambio y mantener el artifact regenerado para revisión.
- Si no podés decidir si el drift es sintético o de runtime real, escalar a `runbooks/release-review-promotion.md` y no promover por intuición.

## Salida

- Drift resuelto con golden actualizada y recertificada, o incidente escalado como bloqueo de release.
