# Plan de cierre de data y research — gana-v8

**Estado actual confirmado (2026-04-21)**

- `prisma/schema.prisma` ya modela `RawIngestionBatch`, `OddsSnapshot`, `OddsSelectionSnapshot`, `Fixture` y `FixtureWorkflow`.
- `packages/source-connectors` y `apps/ingestion-worker` ya cubren ingestión raw con checksum, lineage e idempotencia básica.
- `packages/canonical-pipeline` ya materializa snapshots canónicos de fixtures y odds con pruebas.
- `packages/research-engine`, `packages/research-contracts`, `packages/feature-store` y `apps/research-worker` ya producen dossier determinístico con AI opcional, además de feature snapshots y metadata de traza AI.
- `apps/research-worker` ya persiste metadata útil en fixtures, pero no existe todavía un `ResearchBundle` rico con `Claim`, `SourceRecord` y conflictos estructurados.

## Resumen actual

El frente de data/research ya tiene base funcional suficiente para alimentar scoring: entra raw, se normaliza a una forma canónica útil, se construye un dossier determinístico, AI puede enriquecer síntesis y el feature snapshot deja trazas operativas en metadata.

Lo pendiente ya no es inventar ETL o research desde cero, sino cerrar el salto entre una implementación útil y una capa de datos/research plenamente gobernada. Eso implica ensanchar el modelo raw/canonical, formalizar contratos de research más ricos, persistir mejor lo que hoy vive comprimido en metadata y pasar de un dossier por fixture a un bundle multiartefacto con quality gates y subtareas especializadas.

## Ya cubierto

- Ingestión raw con proveedor deportivo, checksum, windowing e idempotencia básica.
- Persistencia de batches y snapshots de odds en Prisma mediante `RawIngestionBatch`, `OddsSnapshot` y `OddsSelectionSnapshot`.
- Canonicalización idempotente para fixtures y odds a través de `packages/canonical-pipeline`.
- Research determinístico con brief, evidence y directional scoring utilizable aguas abajo.
- Modo AI opcional para research con fallback determinístico, persistencia de `AiRun` y metadata asociada.
- Feature snapshots derivados del dossier con readiness básica y traza de síntesis AI persistida en `Fixture.metadata`.
- Tipos explícitos ya presentes para `ResearchBrief`, `EvidenceItem`, `ResearchDossier` y hooks de síntesis.

## Faltantes vigentes

### 1. Contratos ricos de research

- `research-contracts` todavía se queda en `ResearchBrief`, `EvidenceItem` y `ResearchDossier`.
- Faltan contratos explícitos para `Claim`, `SourceRecord`, `ResearchBundle`, conflicto entre claims, freshness windows y estado de corroboración.
- Tampoco existe una versión canónica de "bundle listo para features/UI" que capture coverage, contradicciones y quality gates.

### 2. Persistencia rica de research y features

- Hoy gran parte del resultado de research termina comprimido dentro de `Fixture.metadata`.
- Falta persistencia dedicada para artefactos de research, bundles, claims, fuentes, quality gates y snapshots de features con versionado más claro.
- También falta una historia durable de cómo cambió el research de un fixture entre distintas ventanas temporales.

### 3. Modelo raw/canonical más amplio

- La base actual cubre fixtures y odds, pero sigue corta frente a la ambición documental original para standings, availability, lineups, contextos complementarios, resultados derivados, backfills amplios y serving datasets más ricos.
- Faltan familias de endpoint y tablas/vistas más completas para sostener replay, feature generation y análisis histórico con menos dependencia de metadata ad hoc.
- El problema no es ausencia total de ETL, sino cobertura todavía demasiado estrecha respecto del dominio objetivo.

### 4. Quality gates formales para research

- Existen readiness checks básicos en feature generation, pero no hay gates formales por frescura, corroboración, contradicción, criticidad o source admissibility.
- Falta definir qué evidencia puede promoverse a señal utilizable, cuál debe degradar el fixture y cuál debe bloquear o escalar a review.
- El ownership funcional de estos gates vive aquí; su test/replay vive en el plan sandbox/QA.

### 5. Orquestación multiagente real

- El research actual sigue siendo esencialmente determinístico con apoyo AI opcional, no un swarm de subtareas especializadas.
- Faltan planner, assignments especializados, presupuestos, timeouts, consolidación por dimensión y síntesis multiagente por fixture.
- También faltan contratos claros para que distintos agentes entreguen evidencia homogénea que pueda auditarse y mezclarse sin texto libre aguas abajo.

## Plan de cierre priorizado

### Tramo 1. Contratos V1 de research

- Definir `Claim`, `SourceRecord`, `ResearchBundle`, estados de corroboración y campos mínimos de freshness, conflicto y audit trail.
- Mantener compatibilidad conceptual con el dossier actual, pero mover el centro de gravedad hacia contratos consumibles por features, scoring y UI.
- Evitar que los mismos conceptos vivan duplicados en `research-engine`, `research-contracts` y metadata libre.

### Tramo 2. Persistencia y versionado

- Introducir persistencia dedicada para bundles, claims, fuentes y snapshots de features con lineage explícito.
- Reservar `Fixture.metadata` para resumen operativo, no para almacenar toda la verdad de research.
- Versionar snapshots y ventanas temporales de forma que replay y auditoría no dependan de reconstrucción indirecta.

### Tramo 3. Expansión de raw/canonical

- Ensanchar cobertura de raw y canonical más allá de fixtures y odds hacia señales estructuradas críticas del dominio.
- Definir qué familias entran primero por impacto real en scoring y research.
- Asegurar idempotencia, backfill y serving dataset suficientes para esas nuevas familias antes de multiplicar conectores.

### Tramo 4. Quality gates y publicación de señales

- Formalizar gates por frescura, corroboración, contradicción, acción y cobertura mínima.
- Hacer que el bundle final exprese de forma estructurada si una señal está aprobada, degradada, retenida o requiere review.
- Dejar explícito qué sale hacia feature generation y qué queda sólo como evidencia auditada.

### Tramo 5. Multiagencia por subtareas

- Introducir un planner por fixture y workers/agentes especializados por dimensión de research.
- Normalizar outputs de cada subtarea al bundle estructurado, no a texto libre.
- Integrar budgets, timeouts y prioridades temporales sin mover este frente a un experimento de "swarm" sin throughput real.

## Criterio de done

- Existe un contrato V1 explícito para `Claim`, `SourceRecord` y `ResearchBundle`.
- Research y features dejan de depender principalmente de `Fixture.metadata` como almacenamiento de verdad.
- Raw/canonical cubre más que fixtures y odds para las señales que impactan la decisión diaria.
- Los quality gates de research están formalizados y producen estados consumibles por scoring, UI y auditoría.
- El research multiagente deja bundles estructurados y auditables por fixture, con subtareas y consolidación reales.
