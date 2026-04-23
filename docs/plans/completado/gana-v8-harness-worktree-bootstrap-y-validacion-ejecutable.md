# Plan de cierre de harness para worktree bootstrap y validacion ejecutable - gana-v8

## Estado actual confirmado (2026-04-23)

- El repo ya documenta una estrategia historica de worktrees y deja claro en `docs/agentic-handoff.md` que para trabajo paralelo largo conviene `una rama y un worktree por frente`.
- `README.md` ya expone como levantar `public-api` y `operator-console`, y el repo ya tiene surfaces consultables para release ops, certification y telemetria.
- Sin embargo, no existe hoy un bootstrap canonico por worktree para levantar un entorno aislado del harness de forma repetible para agentes.
- `scripts/workspace-dev.mjs` sigue siendo un placeholder que no arranca un entorno util para validacion real.
- Tampoco existe una ruta canonica de validacion ejecutable tipo browser/UI o evidencia visual dentro del repo; la mayor parte de la verificacion actual es por tests, curl y consola textual.

## Ya cubierto

- Estrategia documental de worktrees y ownership por frente.
- Comandos para servir `public-api` y `operator-console`.
- Superficies operativas suficientes para inspeccionar certification, runtime release y telemetria.
- Tests de `public-api`, `operator-console`, runtime durable y certification ya materializados.

## Faltantes exclusivos

### 1. Bootstrap canonico por worktree

- Definir el contrato minimo para levantar un entorno aislado por worktree: puertos, DB, variables, artifacts y limpieza.
- Evitar que cada sesion tenga que improvisar como arrancar el repo para validar una hipotesis o reproducir un bug.
- Hacer que el bootstrap sea legible tanto por humanos como por agentes.

### 2. Validacion ejecutable del sistema vivo

- Definir una ruta minima y otra ampliada para validar el comportamiento del harness corriendo, no solo su codigo o sus tests unitarios.
- Incluir health HTTP, surfaces de operador y, donde aporte valor, validacion navegable de `operator-console`.
- Acordar que evidencia deja esa validacion: logs, snapshots, capturas, artifacts o trazas.

### 3. Politica de aislamiento para entornos agentic

- Definir como se separan worktrees, bases, artifacts y puertos para evitar bleed entre corridas.
- Explicitar que superficies pueden ser mock, replay, live-readonly o reales durante validaciones del harness.
- Reutilizar el conocimiento ya existente de certification y release ops sin mezclar perfiles incompatibles.

### 4. Herramientas de validacion orientadas a agentes

- Decidir si el repo necesita una capa oficial para browser automation, capturas o snapshots del DOM, o si basta una ruta mas acotada.
- Formalizar la interfaz de esas herramientas para que un agente pueda reproducir bugs y verificar fixes de manera consistente.
- Evitar que cada sesion resuelva esto con scripts ad hoc.

### 5. Uso recomendado de subagentes para este frente

- Ejecutar este plan con ownership separado para bootstrap, validacion ejecutable y consolidacion de evidencia.
- Mantener worktrees aislados por subagente y no mezclar cambios en bootstrap con cambios en operator surfaces sin handoff.
- Hacer que cada subagente entregue un procedimiento reproducible, no solo una implementacion puntual.

## Interfaces/contratos afectados

- `docs/agentic-handoff.md`
- `README.md`
- `scripts/workspace-dev.mjs`
- Contrato canonico de bootstrap por worktree
- Contrato canonico de validacion ejecutable para `public-api` y `operator-console`

## Dependencias

- Reutiliza `docs/plans/completado/hermes-v8-migracion-v7-a-v8-git-worktrees.md` como contexto historico, no como fuente activa.
- Debe coordinarse con `runbooks/release-review-promotion.md`, `runbooks/rollback.md` y `runbooks/public-api-operator-console-read-model-staleness.md`.
- Debe apoyarse en las surfaces ya existentes de `public-api`, `operator-console` y `sandbox-runner`.
- Toma principios de legibilidad operativa, worktrees arrancables y validacion del sistema vivo desde [OpenAI](https://openai.com/es-419/index/harness-engineering/) y de evaluacion sobre aplicacion corriendo desde [Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## Criterio de done

- Existe un bootstrap canonico por worktree para levantar un entorno aislado del harness.
- Hay una ruta de validacion ejecutable documentada y reproducible sobre el sistema vivo.
- Queda definida la politica de aislamiento de puertos, DB, artifacts y perfiles por worktree.
- El repo deja de depender de `workspace-dev` como placeholder y ofrece una alternativa util para agentes.
- El uso de subagentes para bootstrap y validacion queda explicitado sin conflicto con `docs/agentic-handoff.md`.

## Fuentes consolidadas

- Repo actual: `docs/agentic-handoff.md`, `README.md`, `scripts/workspace-dev.mjs`, `apps/public-api/`, `apps/operator-console/`, `tests/e2e/hermes-smoke.mjs`.
- Historial interno: `docs/plans/completado/hermes-v8-migracion-v7-a-v8-git-worktrees.md`.
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
- Fuente externa: [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps).
