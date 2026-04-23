# Plan de cierre de harness para doc-gardening, discoverability operativa y runbooks - gana-v8

## Estado actual confirmado (2026-04-23)

- El repo ya tiene taxonomia documental, indices canonicos y lint de links/planes en `docs/README.md`, `docs/plans/README.md` y `scripts/workspace-lint.mjs`.
- `runbooks/` ya contiene una bateria operativa real, pero `AGENTS.md` y `docs/README.md` siguen apuntando a `runbooks/sandbox-certification.md` como punto de entrada principal.
- Hasta esta edicion `docs/plans/falta/` estaba vacio aunque `README.md` seguia declarando follow-ups naturales de hardening operativo.
- La preparacion de base para reproducir validaciones no es del todo consistente: el README canonico usa `pnpm db:migrate:deploy`, mientras varios runbooks de diagnostico usan `pnpm db:push`.

## Ya cubierto

- `docs/README.md` ya define precedencia y lifecycle entre `falta/`, `completado/` y `archivado/`.
- `scripts/workspace-lint.mjs` ya exige entrypoints, links locales validos y sincronia de planes activos.
- Los runbooks operativos ya existen para certification, drift, rollback, recovery, observability, staleness y smoke failure.
- `README.md` ya documenta la topologia operativa y enlaza los runbooks activos mas importantes.

## Faltantes exclusivos

### 1. Indice canonico de runbooks

- Crear un punto de entrada especifico para `runbooks/` que clasifique procedimientos por objetivo, disparador y precondicion.
- Evitar que el usuario o el agente tengan que descubrir el procedimiento correcto leyendo archivos aislados uno por uno.
- Mantener un solo mapa de entrada operativo para no seguir llamando "vigente" a un unico runbook cuando el repo ya tiene varios.

### 2. Matriz canonica de bootstrap y preparacion

- Unificar que comando es canonico para cada contexto: bootstrap local, release review, recovery, smoke, staleness e incidentes.
- Explicitar cuando corresponde `db:migrate:deploy` y cuando, si alguna vez aplica, `db:push`.
- Convertir esa matriz en referencia enlazable desde README, AGENTS y runbooks.

### 3. Doc-gardening recurrente del harness

- Definir una rutina de mantenimiento para detectar drift documental, links viejos, comandos obsoletos, planes abiertos sin owner y runbooks sin discoverability.
- Tratar la "basura de IA" y el drift documental como frente continuo, no como limpieza esporadica.
- Definir donde deja evidencia esa rutina y quien decide si un drift se corrige en el momento o se abre como backlog.

### 4. Invariantes mecanicos nuevos

- Extender `scripts/workspace-lint.mjs` o un check equivalente para exigir indice de runbooks, consistencia minima de comandos y trazabilidad del backlog activo.
- Separar claramente reglas editoriales de invariantes obligatorios del harness.
- Mantener la regla de una sola fuente activa por frente tambien para procedimientos operativos.

### 5. Uso recomendado de subagentes para este frente

- Ejecutar este plan con tres ownerships claros: curador documental, verificador mecanico y revisor de consistencia operativa.
- Mantener superficies exclusivas por subagente para no mezclar README, indices y lint en paralelo sin handoff.
- Dejar cada hallazgo con siguiente accion explicita para que la limpieza no dependa de memoria de sesion.

## Interfaces/contratos afectados

- `README.md`
- `AGENTS.md`
- `docs/README.md`
- `docs/plans/README.md`
- Nuevo indice canonico de `runbooks/`
- `scripts/workspace-lint.mjs`

## Dependencias

- Reutiliza el lifecycle documental ya definido en `docs/README.md`.
- Debe respetar que `docs/plans/falta/` siga siendo la fuente de verdad del backlog activo.
- Debe apoyarse en los runbooks ya existentes sin duplicar su contenido operativo.
- Toma principios de repo-as-system-of-record y garbage collection continua desde [OpenAI](https://openai.com/es-419/index/harness-engineering/) y de verificacion en capas desde [Web Reactiva](https://www.webreactiva.com/blog/ai-harness).

## Criterio de done

- Existe un indice canonico de runbooks enlazado desde los entrypoints del repo.
- Queda definida una matriz de bootstrap y preparacion compatible con README, runbooks y release ops.
- Se documenta un proceso recurrente de doc-gardening con evidencia y ownership claros.
- El lint del repo detecta al menos las contradicciones mas costosas entre indices, backlog y procedimientos.
- El backlog activo del harness ya no vuelve a quedar vacio cuando existan follow-ups reales sin owner.

## Fuentes consolidadas

- Repo actual: `README.md`, `AGENTS.md`, `docs/README.md`, `docs/plans/README.md`, `scripts/workspace-lint.mjs`, `runbooks/`.
- Evidencia interna: `runbooks/release-review-promotion.md`, `runbooks/rollback.md`, `runbooks/recovery-redrive.md`, `runbooks/observability-traceability-incident.md`, `runbooks/public-api-operator-console-read-model-staleness.md`, `runbooks/smoke-e2e-runtime-failure.md`.
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
- Fuente externa: [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness).
