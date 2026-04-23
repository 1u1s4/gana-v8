# Plan de cierre de harness agentic para contratos, evaluacion y handoffs largos - gana-v8

## Resultado de cierre (2026-04-23)

- Se materializo `docs/agentic-sprint-contract.md` como contrato canonico de sprint agentic.
- Se materializo `docs/agentic-evaluation-rubric.md` como rubrica versionada de evaluacion.
- `docs/agentic-handoff.md` conserva el contrato minimo de relevo y enlaza los nuevos contratos.
- `scripts/workspace-lint.mjs` valida existencia y secciones obligatorias de los contratos agentic.

## Estado actual confirmado (2026-04-23)

- El repo ya tiene un entrypoint corto para agentes en `AGENTS.md`, un mapa documental en `docs/README.md` y un contrato minimo de handoff en `docs/agentic-handoff.md`.
- `docs/agentic-handoff.md` ya fija ownership exclusivo por frente, artefacto minimo de relevo y preferencia por worktree por subagente, pero no define un contrato previo de sprint ni una separacion explicita planner/generator/evaluator.
- El harness actual ya tiene loops fuertes de verificacion para runtime y release ops (`pnpm test:sandbox:certification`, `pnpm test:runtime:release`, `pnpm test:e2e:hermes-smoke`), pero no existe una rubrica canonica para evaluar trabajo agentic largo ni para decidir cuando usar reset, compaction o relevo.
- No existe hoy un plan activo en `docs/plans/falta/` que formalice estos requisitos agentic; este frente reabre el backlog con enfoque gap-first.

## Ya cubierto

- `AGENTS.md` ya funciona como indice corto y canonico del repo.
- `docs/README.md` ya separa arquitectura, planes activos, planes completados, historico y runbooks.
- `docs/agentic-handoff.md` ya evita paralelismo sin ownership y exige un bloque minimo de relevo.
- `scripts/workspace-lint.mjs` ya convierte parte del conocimiento documental en invariantes mecanicos.
- El repo ya conserva evidencia durable para runtime y release ops en vez de depender solo de memoria humana.

## Faltantes exclusivos

### 1. Contrato canonico de sprint agentic

- Definir un artefacto versionado para acordar "que se va a construir" y "como se valida" antes de editar codigo.
- Separar ese contrato del handoff minimo actual para que no se mezcle planeacion con relevo.
- Hacer que el contrato sea util tanto para una sola sesion como para corridas largas con varios subagentes.

### 2. Separacion planner / implementer / evaluator

- Definir cuando un mismo agente puede ejecutar trabajo de punta a punta y cuando debe intervenir un evaluador separado.
- Introducir un evaluador con thresholds duros y salida accionable, no solo una autoevaluacion narrativa del implementador.
- Formalizar el baseline minimo contra el que se mide lift de calidad, costo y latencia.

### 3. Politica de contexto para trabajo largo

- Documentar cuando usar continuidad de hilo, cuando usar reset con handoff y cuando resumir contexto.
- Definir que artefactos deben sobrevivir al reset para que el repo siga siendo el system of record.
- Evitar que el progreso dependa de memoria implicita o de contexto conversacional no durable.

### 4. Rubrica de calidad agentic del repo

- Crear una rubrica corta y versionada para evaluar especificacion, implementacion, validacion y cierre.
- Convertir criterios subjetivos en checks o umbrales verificables cuando sea posible.
- Registrar como se reevalua la rubrica cuando cambian modelos, herramientas o throughput del equipo.

### 5. Uso recomendado de subagentes para este frente

- Ejecutar este plan con ownership exclusivo por superficie: un subagente planner, un subagente implementer, un subagente evaluator y un integrador final.
- Mantener la regla `un worktree = un subagente = una rama` para cualquier trabajo largo que toque contratos o reglas compartidas.
- Hacer que cada subagente deje un handoff visible dentro del propio plan o en el PR del frente.

## Interfaces/contratos afectados

- `AGENTS.md`
- `docs/agentic-handoff.md`
- Plantilla canonica de sprint contract para frentes agentic largos
- Rubrica canonica de evaluacion agentic y criterios de aprobacion/rechazo
- Regla de uso de subagentes por frente y por worktree

## Dependencias

- Reutiliza la base ya cerrada en `docs/plans/completado/gana-v8-harness-core-y-claridad-agente.md`.
- Debe apoyarse en `docs/agentic-handoff.md` sin reemplazarlo.
- Debe convivir con los gates ya existentes de `sandbox-certification`, `runtime-release` y `e2e-smoke`.
- Toma principios de [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness), [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps) y [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).

## Criterio de done

- Existe un contrato canonico de sprint agentic con definicion explicita de `done` y de verificacion.
- Queda documentada la separacion planner / implementer / evaluator, incluyendo cuando no hace falta separarlos.
- Existe una politica de reset, compaction y handoff durable para trabajo largo.
- Hay una rubrica versionada para medir calidad agentic, costo y lift frente a un baseline mas simple.
- El uso de subagentes queda definido de forma operativa y compatible con el workflow de worktrees del repo.

## Fuentes consolidadas

- Repo actual: `AGENTS.md`, `docs/README.md`, `docs/agentic-handoff.md`, `scripts/workspace-lint.mjs`, `README.md`.
- Historial interno: `docs/plans/completado/gana-v8-harness-core-y-claridad-agente.md`, `docs/plans/completado/hermes-v8-migracion-v7-a-v8-git-worktrees.md`.
- Fuente externa: [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness).
- Fuente externa: [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
