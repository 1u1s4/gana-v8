# Planes de trabajo

Esta carpeta agrupa planes y propuestas de implementación de `gana-v8`.

## Estructura

- `completado/`: planes cuyo alcance principal ya quedó materializado de forma sustancial en el repo actual.
- `falta/`: planes canónicos vigentes para cerrar brechas reales del repo actual.
- `archivado/2026-04-21-falta-originales/`: snapshot íntegro de los 7 planes previos que se consolidaron durante la limpieza documental del 21 de abril de 2026.
- `archivado/2026-04-24-harness-falta-consolidado/`: snapshot de los 3 planes activos de harness que fueron reemplazados por un único plan consolidado de evidencia/cobertura/remediación.

## Planes vigentes en `falta/`

- `gana-v8-corners-experimental-guardrails.md`
- `gana-v8-harness-evidencia-cobertura-y-remediacion-operativa.md`
- `gana-v8-live-multimarket-provider-validation.md`
- `gana-v8-market-line-extraction-hardening.md`
- `gana-v8-provider-market-alias-hardening.md`

La lista anterior debe coincidir exactamente con los archivos reales dentro de `docs/plans/falta/` y con el bloque equivalente en `README.md`.

## Estado actual del backlog

- El analisis de harness del 24 de abril de 2026 consolida los tres planes activos de QA navegable, registro de goldens/cobertura y remediacion legible por agentes en `gana-v8-harness-evidencia-cobertura-y-remediacion-operativa.md`.
- Los tres planes reemplazados quedaron preservados en `docs/plans/archivado/2026-04-24-harness-falta-consolidado/` para trazabilidad, sin competir como fuente activa.
- El frente de multi-mercado ya quedo implementado, pero quedan hardenings activos: validacion live contra provider, expansion de aliases, extraccion segura de lineas y guardrails de corners.
- El frente de principios dorados y garbage collection ya quedo materializado con contrato canonico, scorecard advisory, enforcement estructural y runbook de patrullaje.
- El cierre principal de harness, release ops y runbooks ya quedo materializado en `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md`.
- El cierre complementario de adopcion operativa de `runtime-release` ya quedo materializado en `docs/plans/completado/gana-v8-runtime-release-adopcion-operativa.md`.
- El gap de bootstrap por worktree ya quedo materializado con CLI canonica, runbook operativo y validacion ejecutable HTTP/UI del harness vivo.
- El frente de doc-gardening/runbooks ya quedo materializado con `runbooks/README.md`, matriz canonica de preparacion e invariantes de lint.
- El frente de contratos/evaluacion agentic ya quedo materializado con `docs/agentic-sprint-contract.md`, `docs/agentic-evaluation-rubric.md` e invariantes de lint.
- El frente de fidelidad de `runtime-release` ya quedo cerrado con snapshots baseline/candidate persistidos en DB, smoke Hermes con procesos vivos y surfaces `public-api`/`operator-console` mostrando fingerprint, diff y cobertura.
- El frente de taxonomia e ingestion multi-mercado ya quedo cerrado con market keys canonicos, ingestion live multi-mercado, coverage seed base y reporte de disponibilidad por fixture.
- El frente de scoring, publisher y validation multi-mercado ya quedo cerrado con predicciones multi-market persistidas, publicacion allowlisted, validacion score-derived y labels operativos.
- El frente de corners stats/prediction/validation ya quedo cerrado con ingestion de fixture statistics, persistencia auditable, scoring experimental flaggeado, validation de corners y cobertura operativa.

## Planes relevantes en `completado/`

- `gana-v8-harness-runtime-durable.md`
- `gana-v8-harness-worktree-bootstrap-y-validacion-ejecutable.md`
- `gana-v8-harness-runtime-release-y-verificacion-fiel.md`
- `gana-v8-harness-doc-gardening-y-runbooks.md`
- `gana-v8-harness-contratos-agentic-y-evaluacion.md`
- `gana-v8-harness-principios-dorados-y-garbage-collection.md`
- `gana-v8-runtime-release-adopcion-operativa.md`
- `gana-v8-harness-verificacion-release-ops-y-runbooks.md`
- `gana-v8-corners-stats-prediction-validation.md`
- `gana-v8-multi-market-scoring-publishing-validation.md`
- `gana-v8-multi-market-odds-taxonomy-ingestion.md`
- `gana-v8-harness-core-y-claridad-agente.md`
- `gana-v8-plan-cierre-sandbox-qa.md`
- `gana-v8-plan-cierre-plataforma-operacion.md`

## Criterio de clasificación

La clasificación se hizo comparando cada plan contra el estado real del código, contratos, apps, paquetes, Prisma, scripts y superficies operativas del repositorio.

Un plan quedó en `completado/` cuando su resultado principal ya existe en el repo, aunque haya diferencias menores de naming o layout.

Un plan quedó en `falta/` cuando el repo ya tiene avance claro, pero todavía faltan capacidades, contratos, perfiles, tablas, flujos o superficies que el documento proponía como parte central del alcance.

## Nota de mantenimiento

Los planes dentro de `falta/` están escritos con enfoque `gap-first`: parten del estado actual confirmado, separan explícitamente lo ya cubierto de lo todavía pendiente y asignan cada gap a un solo plan. Cuando un plan deja de tener gaps centrales abiertos, debe moverse a `completado/`, dejando `falta/` vacio si no quedan frentes abiertos.

Los 7 documentos originales que antes vivían en `falta/` se conservaron sin editar dentro de `archivado/2026-04-21-falta-originales/` para mantener trazabilidad histórica sin dejar múltiples fuentes activas compitiendo entre sí.

## Reglas de lifecycle

- Un frente activo debe tener un solo plan canónico en `falta/`.
- Un plan pasa a `completado/` cuando su gap central ya existe de forma sustancial en el repo actual.
- Un plan va a `archivado/` cuando se preserva solo por trazabilidad histórica y ya no compite como fuente activa.
- Si cambia el estado de un plan, también deben actualizarse `README.md` y este índice en la misma edición.

## Plantilla obligatoria para planes activos

Cada archivo en `docs/plans/falta/` debe incluir como mínimo estas secciones:

- `Estado actual confirmado`
- `Ya cubierto`
- `Faltantes exclusivos`
- `Interfaces/contratos afectados`
- `Dependencias`
- `Criterio de done`
- `Fuentes consolidadas`
