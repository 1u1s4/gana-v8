# Plan de cierre de harness de verificación, release ops y runbooks — gana-v8

**Estado actual confirmado (2026-04-22)**

- `pnpm test:sandbox:certification` hoy pasa con 6 goldens y `0 diff entries`.
- `apps/sandbox-runner` ya genera manifests, policy snapshots, promotion gates y evidence packs.
- `public-api` y `operator-console` ya exponen `health`, `readiness`, certificación de sandbox y acciones operativas de cola como `quarantine` y `requeue`.
- CI ya corre `verify`, `e2e-smoke` y `sandbox-certification`.
- `packages/observability` y `packages/audit-lineage` existen, pero sus primitives centrales siguen siendo mayormente in-memory.
- `runbooks/` solo contiene `sandbox-certification.md`.
- Los evidence packs de certificación se sobreescriben por perfil/pack y no conservan historial accesible desde el repo.
- `OperationalSummary.taskCounts` no incluye `quarantined`, aunque otras lecturas operativas sí usan ese estado.

## Resumen actual

La parte más avanzada del paradigma harness en `gana-v8` hoy está en sandbox, replay y certificación. Ya existe evidencia útil, promotion gating base y una superficie operativa capaz de mostrar salud, readiness y controles manuales. El problema es que esas capacidades todavía viven más como slice funcional que como sistema integral de verificación y release ops.

El faltante exclusivo de este frente es convertir verificación y operación en contrato durable: certificación contra runtime real, evidencia histórica, observabilidad persistida, read models consistentes entre API y consola, política formal de promoción y un catálogo mínimo de runbooks que cierre el loop humano cuando el harness bloquee, degrade o exija review.

## Ya cubierto

- `packages/testing-fixtures` ya modela perfiles de sandbox con default-deny, allowlists y policy snapshots.
- `apps/sandbox-runner` ya materializa manifests, fingerprints, promotion reports y evidence packs.
- `tests/sandbox/certification.mjs` y `.github/workflows/ci.yml` ya integran certificación al flujo operativo del repo.
- `public-api` ya expone certificación, health, readiness, summaries operativos y acciones de cola.
- `operator-console` ya consume `public-api` y muestra certificación, promotion state, alertas, task queue y detalles operativos.
- El runbook de `sandbox-certification` ya documenta objetivo, goldens, ejecución y uso en CI.

## Faltantes exclusivos

### 1. Certificación como evidencia de release, no solo como diff sintético

- Hacer que la certificación compare baseline vs candidate del runtime real del harness, no solo snapshots sintéticos o comparaciones que pueden terminar siendo pack-vs-pack.
- Definir qué señales verifican comportamiento real del sistema y cuáles son solo integridad estructural del sandbox.
- Separar claramente la evidencia que sirve para depurar drift local de la evidencia que puede bloquear o permitir promoción.

### 2. Historial de evidence packs y retención operativa

- Dejar de sobrescribir un único `evidence.json` por `profile/pack`.
- Definir contrato de versionado, retention y lookup histórico para evidence packs, diff entries y promotion outcomes.
- Hacer que `public-api` y `operator-console` puedan mostrar historial suficiente para comparar corridas, no solo el último artefacto disponible.

### 3. Observabilidad y auditabilidad durables

- Convertir `observability` y `audit-lineage` en superficies persistibles, exportables y consultables, no solo in-memory helpers.
- Definir métricas, logs, spans y audit events mínimos para release readiness, manual review, retry pressure y redrive.
- Establecer retención y consulta operacional sin obligar a reconstruir incidentes desde objetos efímeros.

### 4. Read models operativos consistentes

- Alinear `public-api` y `operator-console` sobre una lectura única de cola, incluyendo `quarantined`.
- Definir cómo se representa manual review, redrive, release block, release with review y release promotable en todas las superficies.
- Evitar que `health`, `policy`, `readiness` y `taskCounts` cuenten historias distintas del mismo incidente.

### 5. Promotion gates y release ops formales

- Fijar estados operativos mínimos: `blocked`, `review-required` y `promotable`.
- Definir evidencia mínima, thresholds, ownership humano y rollback/retry path para promoción.
- Hacer que CI, `public-api`, `operator-console` y los futuros runbooks consuman la misma política y no variantes locales.

### 6. Catálogo obligatorio de runbooks

- Definir runbooks mínimos además de `sandbox-certification`: recovery/redrive, quarantine/manual review, drift de certificación, release review, rollback, incidentes de observabilidad y fallos de smoke E2E.
- Estandarizar formato mínimo de runbook: objetivo, disparadores, precondiciones, comandos, evidencia esperada, decisiones humanas y salida.
- Garantizar que cada estado relevante del harness tenga un runbook asociado o una razón explícita para no tenerlo.

## Interfaces/contratos afectados

- `SandboxRunManifest` y schema de evidence packs.
- Contrato de historial y naming/retention de artefactos de certificación.
- `OperationalSummary`, `PublicApiReadinessReadModel` y paneles equivalentes en `operator-console`.
- Estados de promotion gating: `blocked`, `review-required`, `promotable`.
- Plantilla mínima de runbooks operativos.
- Superficie durable de logs, métricas, trazas y audit trail para operación y release review.

## Dependencias

- Depende del plan `gana-v8-harness-runtime-durable.md` para obtener señales correctas de scheduler, dispatcher, recovery y ownership por corrida.
- Debe quedar indexado y gobernado por el future knowledge map de `gana-v8-harness-core-y-claridad-agente.md`.
- Debe reutilizar lo ya cubierto por `sandbox-runner`, `testing-fixtures`, `public-api`, `operator-console` y CI, sin reescribir su scope funcional existente.

## Criterio de done

- La certificación diferencia integridad sintética de evidencia de runtime real y se usa como insumo formal de release ops.
- Existe historial consultable de evidence packs y promotion outcomes, no solo último artefacto por perfil/pack.
- Observabilidad y auditabilidad dejan de depender solo de estructuras in-memory.
- `public-api` y `operator-console` muestran una lectura consistente de cola, cuarentenas, readiness y review manual.
- La política de promoción queda unificada entre CI, API, consola y runbooks.
- Existe un catálogo mínimo de runbooks para recovery, redrive, quarantine/manual review, release review y rollback.

## Fuentes consolidadas

- Repo actual: `apps/sandbox-runner/`, `packages/testing-fixtures/`, `packages/observability/`, `packages/audit-lineage/`, `apps/public-api/`, `apps/operator-console/`, `tests/sandbox/certification.mjs`, `.github/workflows/ci.yml`, `runbooks/sandbox-certification.md`.
- Planes internos previos: `docs/plans/completado/gana-v8-plan-cierre-sandbox-qa.md`, `docs/plans/completado/gana-v8-plan-cierre-plataforma-operacion.md`.
- Referencia externa: [Web Reactiva, “Qué es el AI harness y el harness engineering”](https://www.webreactiva.com/blog/ai-harness).
- Referencia externa: [Anthropic, “Harness design for long-running application development”](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Referencia externa: [OpenAI, “Ingeniería de sistemas: Codex en un mundo centrado en agentes”](https://openai.com/es-419/index/harness-engineering/).
