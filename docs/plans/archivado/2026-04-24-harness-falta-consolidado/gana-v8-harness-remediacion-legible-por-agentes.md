# Plan de remediacion legible por agentes para checks y fallos - gana-v8

## Estado actual confirmado (2026-04-23)

- `pnpm lint` ya ejecuta `scripts/workspace-lint.mjs` y valida entrypoints, secciones obligatorias, links locales, planes activos y drift de comandos.
- Los runbooks describen como diagnosticar verification larga, certification drift, runtime release, rollback, recovery y staleness.
- CI sube artifacts de diagnostico y evidencia para algunos jobs.
- Los errores de checks todavia no siguen un contrato uniforme con causa probable, reproduccion minima, artifacts relevantes y proxima accion para agentes.

## Ya cubierto

- Lint estructural para docs y workspaces.
- Runbooks operativos activos con routing canonico.
- Evidencia CI para sandbox certification y runtime release.
- Contrato de handoff que exige comandos ejecutados, riesgos y proxima accion.

## Faltantes exclusivos

### 1. Taxonomia de fallos del harness

- Definir categorias estables: drift documental, link roto, comando canonico obsoleto, golden drift, DB compartida, migration drift, runtime release blocked, smoke vivo degradado, UI no navegable.
- Asignar cada categoria a runbook, comando minimo de reproduccion y owner logico.
- Evitar mensajes genericos que obliguen al agente a redescubrir el diagnostico.

### 2. Mensajes de error accionables

- Extender checks mecanicos para emitir causa probable, archivo afectado, comando recomendado y enlace al runbook.
- Normalizar salida de `scripts/workspace-lint.mjs`, certification y runtime release cuando sea viable.
- Hacer que un fallo pueda convertirse directamente en siguiente accion de handoff.

### 3. Artifacts indexados

- Definir un resumen machine-readable por corrida costosa con status, comandos, paths de evidencia y fallos priorizados.
- Enlazar artifacts CI/locales a runbooks y a la rubrica de evaluacion.
- Evitar evidencia suelta en `.artifacts/` sin indice de interpretacion.

### 4. Criterios de escalamiento humano

- Definir que fallos puede resolver un agente con remediacion mecanica y cuales requieren decision humana.
- Incluir escalamiento en runtime release, rollback, drift intencional de goldens y acciones manuales de operador.
- Mantener el principio de escalar solo cuando se requiera juicio humano real.

### 5. Uso recomendado de subagentes para este frente

- Explorer subagent: clasifica fallos actuales y mensajes existentes.
- Implementer subagent: mejora scripts/checks dentro de ownership estrecho.
- Reviewer subagent: valida que cada mensaje tenga reproduccion minima y no duplique runbooks.
- Evaluator subagent: aplica una falla simulada y decide si la remediacion reduce reexploracion.

## Interfaces/contratos afectados

- `scripts/workspace-lint.mjs`
- `tests/sandbox/certification.mjs`
- `tests/sandbox/runtime-release.mjs`
- `scripts/workspace-dev.mjs`
- `runbooks/README.md`
- Runbooks especificos de verification, certification, runtime release y smoke.
- CI diagnostics/evidence artifacts.

## Dependencias

- Debe reutilizar `runbooks/expensive-verification-triage.md` como escalera para checks largos y DB-backed.
- Debe coordinarse con el registro de goldens para mensajes de drift.
- Debe coordinarse con QA navegable si se agregan artifacts DOM/captura.
- Toma de [OpenAI](https://openai.com/es-419/index/harness-engineering/) la idea de hacer logs, metricas y herramientas estandar legibles para Codex.
- Toma de [Web Reactiva](https://www.webreactiva.com/blog/ai-harness) la exigencia de convertir fallos recurrentes en restricciones, hooks o verificaciones.

## Criterio de done

- Los checks principales emiten errores accionables con causa probable, reproduccion minima y runbook recomendado.
- Cada artifact costoso tiene un resumen indexado que otro agente pueda interpretar.
- La taxonomia de fallos esta documentada y enlazada desde el routing operativo.
- La rubrica o handoff pueden referenciar la salida de remediacion sin narracion adicional.
- Los casos que requieren juicio humano estan diferenciados de los reparables por agente.

## Fuentes consolidadas

- Repo actual: `scripts/workspace-lint.mjs`, `tests/sandbox/certification.mjs`, `tests/sandbox/runtime-release.mjs`, `runbooks/README.md`, `runbooks/expensive-verification-triage.md`.
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
- Fuente externa: [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness).
- Fuente externa: [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps).
