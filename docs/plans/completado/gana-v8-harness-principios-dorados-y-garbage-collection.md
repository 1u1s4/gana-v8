# Plan de principios dorados y garbage collection del harness - gana-v8

## Estado actual confirmado (2026-04-23)

- El repo ya tiene convenciones en `AGENTS.md`, `README.md`, `docs/README.md`, runbooks y lint estructural.
- `docs/plans/completado/gana-v8-harness-doc-gardening-y-runbooks.md` cerro el indice de runbooks, matriz de preparacion e invariantes documentales basicas.
- Todavia no existe un contrato versionado de "principios dorados" con reglas mecanicas, scorecards recurrentes y pequenos PRs de limpieza orientados a reducir entropia agentic.
- El patrullaje recurrente esta descrito como rutina, pero no como sistema de calidad con hallazgos, puntuacion y priorizacion.

## Cierre materializado (2026-04-24)

- `docs/harness-principios-dorados.md` quedo como contrato canonico para reglas bloqueantes, guidelines, excepciones temporales y scorecard de entropia.
- `runbooks/harness-garbage-collection.md` quedo como procedimiento operativo para patrullaje recurrente, PRs pequenos y decisiones `fix now`, `active plan` o `accepted risk`.
- `scripts/harness-entropy-scorecard.mjs` expone `pnpm harness:scorecard` como lectura advisory barata y `scripts/workspace-lint.mjs` bloquea invariantes estructurales claras.
- El backlog activo quedo sincronizado en `AGENTS.md`, `README.md`, `docs/README.md`, `docs/plans/README.md` y `runbooks/README.md`.

## Ya cubierto

- Entry point corto para agentes.
- Mapa documental, lifecycle de planes y runbooks operativos.
- Lint de links, planes activos, secciones obligatorias y comandos canonicos.
- Reglas de sprint/handoff/evaluacion para trabajo no trivial.

## Faltantes exclusivos

### 1. Principios dorados versionados

- Codificar reglas de estilo arquitectonico y operacion que futuras ejecuciones agentic deben preservar.
- Priorizar principios que se puedan verificar: imports permitidos, limites runtime/apps/adapters, uso de SDKs tipados, logs estructurados, nombres canonicos, no duplicar documentos activos.
- Separar preferencias humanas de invariantes bloqueantes.

### 2. Scorecard recurrente de entropia

- Definir una corrida barata que mida drift documental, rutas legacy, helpers duplicados, stubs, tests degradados, artifacts sin indice y fallos de discoverability.
- Emitir una salida corta con puntuacion, hallazgos y acciones propuestas.
- Registrar cuando un hallazgo se corrige de inmediato, se abre plan activo o se acepta como riesgo.

### 3. Patrullaje con PRs pequenos

- Diseñar una cadencia para limpiezas pequenas y revisables, no migraciones enormes.
- Mantener ownership claro para que el patrullaje no invada features activas.
- Hacer que cada PR de limpieza tenga evidencia y no dependa de gusto no codificado.

### 4. Enforcement de fronteras runtime

- Convertir limites entre `packages/control-plane-runtime`, Hermes apps, adapters, `sandbox-runner` y compatibilidad legacy en checks estructurales donde sea posible.
- Detectar imports o dependencias que reintroduzcan `apps/hermes-control-plane` como runtime primario.
- Documentar excepciones temporales y fecha/condicion de retiro.

### 5. Uso recomendado de subagentes para este frente

- Scout subagent: identifica patrones de entropia y propone principios candidatos.
- Implementer subagent: codifica checks mecanicos o scorecards acotados.
- Reviewer subagent: valida que los principios no bloqueen trabajo legitimo ni dupliquen docs existentes.
- Evaluator subagent: compara baseline sin patrullaje contra scorecard recurrente y decide lift/costo.

## Interfaces/contratos afectados

- `AGENTS.md`
- `README.md`
- `docs/README.md`
- `docs/agentic-sprint-contract.md`
- `docs/agentic-evaluation-rubric.md`
- `scripts/workspace-lint.mjs`
- Posibles scripts nuevos bajo `scripts/`
- CI si algun scorecard se vuelve gate.

## Dependencias

- Debe reutilizar lo cerrado en `docs/plans/completado/gana-v8-harness-doc-gardening-y-runbooks.md` sin reabrir ese alcance.
- Debe coordinarse con el plan de remediacion legible por agentes para que scorecards fallen con mensajes accionables.
- Debe coordinarse con runtime boundary enforcement si se agregan checks de imports/capas.
- Toma de [OpenAI](https://openai.com/es-419/index/harness-engineering/) la practica de codificar principios dorados y limpieza recurrente para controlar entropia.
- Toma de [Web Reactiva](https://www.webreactiva.com/blog/ai-harness) el enfoque de restricciones, permisos y verificaciones como parte central del harness.

## Criterio de done

- Existe un documento o contrato canonico de principios dorados con distincion entre regla bloqueante y guideline.
- Hay un scorecard recurrente que detecta entropia relevante y produce salida accionable.
- Al menos las fronteras runtime mas criticas tienen enforcement mecanico o excepciones documentadas.
- El patrullaje recurrente tiene cadencia, owner, evidencia minima y criterio para abrir/cerrar planes.
- Los nuevos checks no duplican runbooks ni convierten preferencias vagas en bloqueos fragiles.

## Fuentes consolidadas

- Repo actual: `AGENTS.md`, `README.md`, `docs/README.md`, `docs/plans/completado/gana-v8-harness-doc-gardening-y-runbooks.md`, `scripts/workspace-lint.mjs`.
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
- Fuente externa: [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness).
- Fuente externa: [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps).
