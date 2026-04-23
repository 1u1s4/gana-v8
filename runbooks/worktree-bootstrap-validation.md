# Worktree Bootstrap and Executable Validation

## Objetivo

Levantar un slice vivo del harness por worktree, con puertos, entorno y evidencia aislados, para que humanos y agentes puedan validar `public-api` y `operator-console` sin improvisar scripts locales.

## Disparadores

- Un subagente necesita reproducir o validar una hipotesis en su propio worktree.
- Un cambio toca bootstrap, superficies operativas, `public-api`, `operator-console` o contratos agentic.
- Se requiere evidencia ejecutable del sistema vivo sin agregar browser automation repo-native.

## Precondiciones

- Dependencias instaladas con `pnpm install`.
- Worktree dedicado para el owner del frente cuando el trabajo corre en paralelo.
- Saber si `DATABASE_URL` apunta a una base compartida o aislada. Si no esta probado, tratarla como compartida.

## Bootstrap por worktree

Usar un `worktree-id` estable y legible, preferentemente el nombre corto del frente:

```bash
pnpm harness:bootstrap -- --worktree-id codex-harness --base-port 4100 --db-mode push --skip-db
```

El comando genera:

- `.artifacts/workspace-dev/<worktree-id>/env`
- `.artifacts/workspace-dev/<worktree-id>/metadata.json`
- puertos derivados de `--base-port`
- `GANA_OPERATOR_CONSOLE_PUBLIC_API_URL` apuntando al `public-api` aislado

Reglas:

- No edita `.env`.
- `--db-mode push` es solo para bases efimeras o throwaway.
- `--db-mode migrate` es la ruta release-grade con migraciones versionadas.
- Si `DATABASE_URL` existe y `GANA_WORKSPACE_DEV_DATABASE_ISOLATED=true` no esta definido, la DB se considera compartida.
- Usar `--skip-db` cuando solo se quiere validar las superficies HTTP con snapshot vacio o estado ya preparado.

## Servir el harness vivo

```bash
pnpm harness:serve -- --worktree-id codex-harness --base-port 4100
```

Esto arranca:

- `public-api` en `http://127.0.0.1:<base-port>`
- `operator-console` en `http://127.0.0.1:<base-port + 1>`

Los logs quedan bajo `.artifacts/workspace-dev/<worktree-id>/logs/`.

## Validacion ejecutable

```bash
pnpm harness:validate -- --worktree-id codex-harness --base-port 4100 --level smoke
```

La validacion `smoke` arranca los servicios, fuerza `DATABASE_URL`/`GANA_DATABASE_URL` a vacio salvo DB aislada explicita, y verifica:

- `public-api`: `/health`, `/readiness`, `/snapshot`, `/operational-summary`, `/sandbox-certification`, `/sandbox-certification/runs?verificationKind=runtime-release`, `/telemetry/events`, `/telemetry/metrics`
- `operator-console`: `/`, `/app.js`, `/styles.css`, `/api/console`

La evidencia queda en `.artifacts/workspace-dev/<worktree-id>/validation/<timestamp>/` con:

- respuestas JSON/HTML/texto
- logs stdout/stderr por proceso
- `summary.json` con resultado por check

Esta ruta es la evidencia UI canonica de v1: prueba HTML/API de la consola viva sin Playwright ni capturas de navegador versionadas.

Los niveles `live` y `release` preservan las variables de base de datos del entorno para validar contra estado preparado; antes de usarlos, aplicar `expensive-verification-triage.md` y confirmar si la DB es compartida o aislada.

## Limpieza

```bash
pnpm harness:clean -- --worktree-id codex-harness
```

La limpieza borra solo `.artifacts/workspace-dev/<worktree-id>/`. No borra `.env`, `.artifacts/sandbox-certification/` global, worktrees ni ramas.

## Handoff agentic

Cada subagente debe dejar:

- objetivo del frente y worktree usado
- `worktree-id`, puertos y artifact root
- comandos ejecutados y resultado
- si la DB era compartida o aislada
- proxima accion concreta

Para verificaciones largas o DB-backed, seguir primero `expensive-verification-triage.md`.
