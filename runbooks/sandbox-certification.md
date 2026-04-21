# Sandbox Certification

## Objetivo

`gana-v8` usa certificación de sandbox para detectar drift estructural en los packs sintéticos y en los perfiles de ejecución antes de promover cambios del harness.

## Qué se certifica

- `fixtures/replays/goldens/ci-smoke/football-dual-smoke.json`
- `fixtures/replays/goldens/ci-regression/football-replay-late-swing.json`

Cada golden fija:

- modo (`smoke` o `replay`)
- pack y perfil aprobados
- provider modes
- conteos de fixtures y replay events
- replay timeline
- fingerprint del pack
- safety rails

## Cómo correrlo

```bash
pnpm test:sandbox:certification
```

Salida:

- artifacts en `.artifacts/sandbox-certification/`
- diff legible en stdout si alguna golden deriva

## Cómo actualizar una golden

1. Verificá primero que el drift sea intencional.
2. Corré el sandbox runner localmente para inspeccionar el evidence pack.
3. Reemplazá la golden correspondiente en `fixtures/replays/goldens/`.
4. Volvé a correr `pnpm test:sandbox:certification`.
5. Incluí en el cambio una nota explícita sobre por qué cambió el fingerprint, la timeline o los safety rails.

## Uso en CI

- El job `sandbox-certification` ejecuta la certificación sin depender de MySQL.
- Los evidence packs se suben como artifact aun cuando falle la comparación.
