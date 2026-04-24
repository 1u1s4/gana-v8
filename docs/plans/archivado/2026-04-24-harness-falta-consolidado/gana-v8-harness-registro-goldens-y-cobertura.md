# Plan de registro de goldens, cobertura e intencion de replay - gana-v8

## Estado actual confirmado (2026-04-23)

- La certificacion sintetica vive en `fixtures/replays/goldens/`, `tests/sandbox/certification.mjs` y `apps/sandbox-runner`.
- `pnpm test:sandbox:certification` compara evidence packs contra goldens versionadas y CI exporta artifacts.
- `public-api` y `operator-console` ya pueden leer estados de certification y runtime release.
- No existe un registro canonico de cada golden con proposito, cobertura, owner logico, perfil, criterios de regeneracion y relacion con riesgos del harness.

## Ya cubierto

- Goldens versionadas y evidencia deterministica.
- Runbooks para certificacion, drift y release review.
- Perfiles certificados documentados en `README.md`.
- Diff de evidencia contra golden y fingerprints estables.

## Faltantes exclusivos

### 1. Registro versionado de goldens

- Definir un indice legible por humanos y agentes para cada golden pack.
- Incluir proposito, fixtures cubiertas, perfil, clase de riesgo, owner logico, ultima certificacion esperada y criterios de actualizacion.
- Evitar que una golden sea solo un JSON opaco sin intencion documentada.

### 2. Matriz de cobertura del harness

- Mapear goldens a capacidades: ingestion/replay, policy, runtime release, promotion gates, telemetry, failures, provider modes y safety.
- Detectar huecos donde el harness tiene comportamiento critico sin golden o sin evidence pack navegable.
- Separar cobertura sintetica de cobertura DB-backed y cobertura UI/operator.

### 3. Contrato de regeneracion y review

- Establecer cuando regenerar una golden, que diff se acepta y que evidencia debe acompanar el cambio.
- Exigir que cambios esperados indiquen si el drift viene de fixture, policy, runtime real o formato de evidencia.
- Vincular el flujo con `runbooks/sandbox-certification-drift.md`.

### 4. Superficie consultable por agentes

- Evaluar si el registro debe ser Markdown, JSON, endpoint de `public-api` o una combinacion.
- Hacer que agentes puedan responder "que golden cubre este riesgo?" sin leer todos los JSON.
- Definir mensajes de error con remediacion cuando falte metadata del registro.

### 5. Uso recomendado de subagentes para este frente

- Explorer subagent: inventaria goldens actuales y agrupa riesgos cubiertos/no cubiertos.
- Implementer subagent: crea el registro y checks mecanicos sobre metadata.
- Evaluator subagent: compara matriz contra runbooks y certificacion para detectar huecos de cobertura.
- Integrador: decide si la metadata queda solo en docs o tambien en contrato parseable.

## Interfaces/contratos afectados

- `fixtures/replays/goldens/`
- `tests/sandbox/certification.mjs`
- `apps/sandbox-runner/`
- `apps/public-api/`
- `runbooks/sandbox-certification.md`
- `runbooks/sandbox-certification-drift.md`
- `README.md`

## Dependencias

- Debe apoyarse en `runbooks/sandbox-certification.md` y `runbooks/sandbox-certification-drift.md` sin duplicar pasos operativos.
- Debe coordinarse con el plan de QA navegable si los flujos multi-step terminan generando evidence packs adicionales.
- Debe respetar la separacion actual entre `synthetic-integrity` y `runtime-release`.
- Toma la idea de verificacion en capas y contexto minimo navegable desde [Web Reactiva](https://www.webreactiva.com/blog/ai-harness).
- Toma la necesidad de artifacts legibles por agente desde [OpenAI](https://openai.com/es-419/index/harness-engineering/).

## Criterio de done

- Cada golden activa tiene metadata de intencion, cobertura, owner logico y regla de actualizacion.
- Existe una matriz que muestra riesgos cubiertos, parcialmente cubiertos y sin cobertura.
- La certificacion o lint detecta goldens sin metadata minima.
- Los runbooks enlazan el registro cuando explican drift, regeneracion o release review.
- Los gaps de cobertura nuevos se asignan a un plan activo o se justifican como no alcance.

## Fuentes consolidadas

- Repo actual: `fixtures/replays/goldens/`, `tests/sandbox/certification.mjs`, `apps/sandbox-runner/`, `runbooks/sandbox-certification.md`, `runbooks/sandbox-certification-drift.md`.
- Fuente externa: [Web Reactiva, "Que es el AI harness y el harness engineering"](https://www.webreactiva.com/blog/ai-harness).
- Fuente externa: [OpenAI, "Ingenieria de sistemas: Codex en un mundo centrado en agentes"](https://openai.com/es-419/index/harness-engineering/).
- Fuente externa: [Anthropic, "Harness design for long-running application development"](https://www.anthropic.com/engineering/harness-design-long-running-apps).
