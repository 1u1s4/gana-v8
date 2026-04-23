# Plan de harness QA navegable y flujos operativos - gana-v8

## Estado actual confirmado (2026-04-23)

- `pnpm harness:validate -- --level smoke` valida `public-api` y `operator-console` con requests HTTP/HTML y deja evidencia en `.artifacts/workspace-dev/`.
- CI ya ejecuta `pnpm verify`, `pnpm test:sandbox:certification`, `pnpm test:runtime:release` y `pnpm test:e2e:hermes-smoke`.
- `docs/agentic-sprint-contract.md` y `docs/agentic-evaluation-rubric.md` ya separan planner, implementer, reviewer y evaluador para trabajo agentic no trivial.
- La ruta viva de UI todavia no tiene un evaluador navegable oficial que haga clickthrough de flujos de operador, capture evidencia visual/DOM y valide acciones multi-step.

## Ya cubierto

- Bootstrap aislado por worktree con puertos, variables, logs y limpieza.
- Smoke HTTP sobre endpoints operativos y assets de consola.
- Read models para sandbox certification, runtime release, promotion gates y telemetria.
- Contrato documental para evaluador separado y decision `promotable` / `review-required` / `blocked`.

## Faltantes exclusivos

### 1. Evaluador navegable oficial

- Definir una ruta repo-native para que un evaluador pueda conducir `operator-console` como usuario real.
- Cubrir navegacion, filtros, estados de carga/error, acciones manuales y lectura cruzada contra `public-api`.
- Decidir si la primera version usa Playwright, browser MCP, snapshots DOM o una combinacion con artifacts HTML/JSON.

### 2. Certificacion de flujos operativos multi-step

- Convertir flujos como runtime release review, promotion, rollback, recovery/redrive y quarantine/manual review en escenarios verificables.
- Separar smoke de disponibilidad de QA de comportamiento operativo.
- Dejar claro que un endpoint verde no basta si el operador no puede completar el flujo.

### 3. Evidencia reproducible para evaluadores

- Guardar capturas, snapshots DOM, requests/responses relevantes, logs y resumen de decisiones en una carpeta estable bajo `.artifacts/`.
- Hacer que la evidencia pueda compararse entre baseline y candidate.
- Definir que evidencia minima exige la rubrica antes de aprobar cambios que toquen `public-api` u `operator-console`.

### 4. Calibracion del evaluador

- Crear ejemplos versionados de aprobaciones, fallos y falsos positivos para calibrar criterios de UI/operacion.
- Alinear esos ejemplos con `docs/agentic-evaluation-rubric.md` sin duplicarla.
- Establecer thresholds duros para funcionalidad critica, no solo comentarios narrativos.

### 5. Uso recomendado de subagentes para este frente

- Planner subagent: delimita escenarios operativos y criterio de done por flujo.
- Implementer subagent: implementa runner/evidence pack navegable en archivos bajo ownership acordado.
- Evaluator subagent: ejecuta la ruta viva, revisa artifacts y emite decision accionable.
- Integrador: sincroniza runbooks, README y rubrica si el contrato de evidencia cambia.

## Interfaces/contratos afectados

- `scripts/workspace-dev.mjs`
- `runbooks/worktree-bootstrap-validation.md`
- `docs/agentic-evaluation-rubric.md`
- `apps/operator-console/`
- `apps/public-api/`
- `.artifacts/workspace-dev/`
- CI si se promueve alguna ruta navegable como gate.

## Dependencias

- Reutiliza el bootstrap y smoke ya cerrados en `docs/plans/completado/gana-v8-harness-worktree-bootstrap-y-validacion-ejecutable.md`.
- Debe coordinarse con `runbooks/release-review-promotion.md`, `runbooks/rollback.md`, `runbooks/recovery-redrive.md` y `runbooks/quarantine-manual-review.md`.
- Debe respetar `runbooks/expensive-verification-triage.md` antes de convertir navegacion viva o DB-backed en gate frecuente.
- Toma el patron planner/generator/evaluator y validacion de aplicacion viva desde [Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Toma la exigencia de apps arrancables por worktree y observables por agentes desde [OpenAI](https://openai.com/es-419/index/harness-engineering/).

## Criterio de done

- Existe un evaluador navegable documentado y reproducible para al menos los flujos operativos criticos.
- La evidencia incluye artifacts suficientes para que otro agente reproduzca la decision sin depender del chat.
- La rubrica define cuando un cambio UI/API requiere evaluador separado y que thresholds bloquean merge.
- Los runbooks enlazan la ruta navegable cuando el diagnostico humano necesite validar consola viva.
- La ruta distingue claramente smoke rapido, QA navegable y gates DB-backed costosos.

## Fuentes consolidadas

- Repo actual: `README.md`, `runbooks/worktree-bootstrap-validation.md`, `docs/agentic-sprint-contract.md`, `docs/agentic-evaluation-rubric.md`, `apps/public-api/`, `apps/operator-console/`.
- Fuente externa: [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
- Fuente externa: [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness).
