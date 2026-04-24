# Plan unificado de evidencia, cobertura y remediacion operativa del harness - gana-v8

> **Estado de cierre:** completado. El repo ya materializa registry de goldens/cobertura, enforcement en lint, summaries agent-readable para certificacion/runtime-release/workspace-dev validate, remediacion categorizada y evidencia QA multi-step sin Playwright obligatorio.

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan por slices. Este documento reemplaza los tres planes activos anteriores de QA navegable, registro de goldens/cobertura y remediacion legible por agentes.

**Goal:** consolidar la evidencia del harness para que agentes y humanos puedan saber que cubre cada golden, como interpretar artifacts y que accion tomar cuando algo falla.

**Architecture:** primero crear un registro canonico de cobertura/goldens; despues normalizar artifacts y mensajes de remediacion; finalmente elevar los flujos QA multi-step usando esa evidencia como base. No introducir Playwright/browser automation como gate obligatorio hasta que el contrato de evidencia y remediacion este estable.

**Tech Stack:** Markdown canonico, Node scripts, pnpm, workspace lint, sandbox certification, runtime-release artifacts, public-api/operator-console.

---

## Estado actual confirmado

- `docs/plans/falta/` tenia tres planes activos separados: QA navegable, registro de goldens/cobertura y remediacion legible por agentes.
- Los tres frentes comparten la misma raiz: evidencia del harness que debe ser interpretable por agentes y accionable por humanos.
- `fixtures/replays/goldens/`, `tests/sandbox/certification.mjs` y `apps/sandbox-runner` ya ejecutan certificacion sintetica con goldens versionadas.
- `pnpm harness:validate -- --level smoke` valida `public-api` y `operator-console` por HTTP/HTML y deja artifacts en `.artifacts/workspace-dev/`.
- `scripts/workspace-lint.mjs` valida indices documentales, links, secciones obligatorias y comandos canonicos.
- `runbooks/` ya contiene procedimientos operativos, pero no hay un registro canonico que relacione cada golden/artifact/fallo con cobertura, intencion y remediacion.
- La evidencia UI canonica actual es HTTP/HTML/API; no existe Playwright/browser automation repo-native como requisito de smoke.

## Ya cubierto

- Bootstrap y validacion por worktree.
- Smoke de `public-api` y `operator-console`.
- Goldens sinteticas versionadas y comparadas por certification.
- Runtime-release DB-backed con artifacts.
- Runbooks para certificacion, drift, runtime release, recovery, rollback, quarantine y smoke.
- Lint estructural de docs/planes/runbooks/comandos.
- Rubrica agentic y handoff para trabajo largo.

## Faltantes exclusivos

### 1. Registro canonico de goldens y cobertura

- Crear metadata por golden: proposito, perfil, clase de riesgo, fixtures cubiertas, owner logico, criterio de regeneracion y artifacts esperados.
- Crear matriz de cobertura por capacidad: synthetic replay, DB-backed runtime-release, public-api, operator-console, provider modes, promotion gates, safety/failure modes.
- Detectar goldens sin metadata minima desde `pnpm lint` o un check dedicado.
- Evitar que una golden sea solo un JSON opaco sin intencion documentada.

### 2. Contrato de artifacts interpretable por agentes

- Definir un summary machine-readable comun para certification, runtime-release y harness validate.
- Exponer status, comando ejecutado, evidence root, paths relevantes, fallos priorizados y runbook sugerido.
- Mantener paths estables para que subagentes no tengan que leer todos los JSON/logs.
- Diferenciar artifacts sinteticos, DB-backed y UI/operator.

### 3. Remediacion accionable de checks

- Definir taxonomia unica de fallos: drift de golden, drift de runtime, link roto, comando invalido, service unavailable, authz, readiness, DB/migration, provider/live.
- Cada fallo debe indicar causa probable, reproduccion minima, archivo o artifact afectado, comando recomendado y runbook.
- Separar problemas resolubles por agente de decisiones humanas.
- Hacer que scripts criticos emitan errores mas legibles sin esconder el traceback original.

### 4. QA operativa multi-step

- Definir escenarios criticos: release review, promotion, rollback, recovery/redrive, quarantine/manual review y fixture ops.
- Empezar con evidencia API/DOM/artifacts compatible con el smoke actual.
- Evaluar Playwright o browser automation solo si no alcanza la evidencia HTTP/HTML/API.
- No convertir pruebas caras en gate obligatorio sin pasar por `runbooks/expensive-verification-triage.md`.

### 5. Consolidacion documental

- Mantener un solo plan activo para este frente.
- Preservar los tres planes anteriores en `docs/plans/archivado/2026-04-24-harness-falta-consolidado/` como trazabilidad historica.
- Sincronizar `README.md`, `AGENTS.md` y `docs/plans/README.md` cuando cambie el estado.

## Interfaces/contratos afectados

- `fixtures/replays/goldens/`
- `tests/sandbox/certification.mjs`
- `tests/sandbox/runtime-release.mjs`
- `scripts/workspace-dev.mjs`
- `scripts/workspace-dev-validate.mjs`
- `scripts/workspace-lint.mjs`
- `runbooks/sandbox-certification.md`
- `runbooks/sandbox-certification-drift.md`
- `runbooks/worktree-bootstrap-validation.md`
- `runbooks/expensive-verification-triage.md`
- `docs/agentic-evaluation-rubric.md`
- `docs/agentic-handoff.md`
- `apps/public-api/`
- `apps/operator-console/`
- CI artifacts

## Dependencias

- Primero debe existir registry/matriz de goldens para no crear mas evidencia sin indice.
- Luego debe definirse el contrato comun de artifacts y remediacion.
- QA multi-step debe apoyarse en esos contratos, no inventar otro formato paralelo.
- El plan debe respetar la separacion actual entre smoke barato, certificacion sintetica y verificaciones DB-backed/costosas.
- Si se agrega browser automation, debe justificar costo y valor contra la evidencia existente.

## Criterio de done

- Cada golden activa tiene metadata minima de intencion, cobertura, owner logico y regla de regeneracion.
- Existe una matriz que muestra riesgos cubiertos, parcialmente cubiertos y sin cobertura.
- `pnpm lint` o un check dedicado detecta goldens sin metadata minima.
- Certification/runtime-release/harness validate producen o enlazan un summary interpretable por agentes.
- Los fallos principales tienen remediacion accionable con comando minimo y runbook sugerido.
- Hay al menos un flujo operativo multi-step reproducible con evidencia estable por artifact.
- `README.md`, `AGENTS.md` y `docs/plans/README.md` apuntan a este unico plan activo para el frente consolidado.

## Fuentes consolidadas

- Planes archivados reemplazados:
  - `docs/plans/archivado/2026-04-24-harness-falta-consolidado/gana-v8-harness-qa-navegable-y-flujos-operativos.md`
  - `docs/plans/archivado/2026-04-24-harness-falta-consolidado/gana-v8-harness-registro-goldens-y-cobertura.md`
  - `docs/plans/archivado/2026-04-24-harness-falta-consolidado/gana-v8-harness-remediacion-legible-por-agentes.md`
- Repo actual: `fixtures/replays/goldens/`, `tests/sandbox/certification.mjs`, `scripts/workspace-dev-validate.mjs`, `scripts/workspace-lint.mjs`, `runbooks/`.
- Convencion documental vigente: `docs/plans/README.md`, `README.md`, `AGENTS.md`.
