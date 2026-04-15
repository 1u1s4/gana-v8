# ADR-004: Ingestión raw append-only y downstream sobre batches cerrados

- Status: Accepted
- Date: 2026-04-15

## Context

Los proveedores deportivos pueden corregir datos tarde, devolver respuestas inconsistentes entre requests o cambiar payloads sin aviso. Si la capa raw se sobreescribe, se pierde la capacidad de reconstruir qué vio el sistema al decidir.

El repo ya refleja esta necesidad: `packages/source-connectors/src/models/raw.ts` define `SourceIngestionBatch` con `batchId`, `checksum`, `coverageWindow`, `lineage`, `records` y `rawObjectRefs`. A su vez, `packages/canonical-pipeline/src/repositories/in-memory.ts` marca batches procesados y genera snapshots determinísticos.

## Decision

La capa raw de ingestión será append-only e inmutable. Los procesos aguas abajo no leen directo del proveedor: consumen batches raw cerrados y versionados.

### Metadatos mínimos requeridos por batch

- `batchId`;
- `sourceName` y `sourceEndpoint`;
- `extractionTime`;
- `coverageWindow`;
- `checksum`;
- `extractionStatus` y `warnings`;
- `lineage` con provider, endpoint family, run id y schema version;
- `rawObjectRefs`.

### Regla de frontera

- source connectors aterrizan raw y sellan batches;
- canonical pipeline normaliza desde esos batches, no desde requests ad hoc al proveedor;
- features, scoring y validación consumen artefactos derivados, nunca payloads raw mutables como dependencia informal.

## Consequences

### Positivas

- replay confiable de pipelines y debugging de incidentes;
- lineage verificable de decisiones y snapshots;
- menor riesgo de contaminar scoring o validación con datos mutados retroactivamente.

### Costos

- mayor costo de storage y retención;
- necesidad de políticas explícitas de compactación fuera de raw.
