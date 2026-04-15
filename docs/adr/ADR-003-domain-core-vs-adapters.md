# ADR-003: Separar dominio puro de adapters, persistencia y transporte

- Status: Accepted
- Date: 2026-04-15

## Context

La fase 0 exige que ningún módulo de dominio dependa de Next o de la UI. El layout objetivo también pide separar software productivo de infraestructura concreta. En el repo ya existe una señal clara de esta intención:

- `packages/domain-core` expone entidades y contratos de repositorio;
- `packages/storage-adapters` concentra implementaciones de persistencia;
- `packages/orchestration-sdk` y otros packages cubren transporte/orquestación fuera del dominio.

Sin esta decisión, es fácil volver a mezclar reglas de negocio con Prisma, colas, APIs o view models, reproduciendo el acoplamiento que v8 justamente quiere evitar.

## Decision

El dominio de gana-v8 vive en packages puros y se mantiene independiente de framework, base de datos, broker y UI.

### Reglas base

1. `packages/domain-core` contiene entidades, value objects, invariantes y contratos de repositorio.
2. Los adapters de persistencia, colas, APIs externas y transporte viven en packages específicos, por ejemplo `packages/storage-adapters`, `packages/queue-adapters` y `packages/source-connectors`.
3. Las apps ensamblan dominio + adapters, pero no redefinen entidades core ni esconden reglas de negocio dentro de handlers o código de infraestructura.
4. Los contratos de repositorio se definen del lado del dominio; sus implementaciones concretas viven fuera del dominio.
5. La UI y las APIs deben consumir artefactos, view models o servicios de aplicación, no acceder directamente a detalles internos de persistencia como frontera de negocio.

## Implementation alignment observed in repo

- `packages/domain-core/src/repositories.ts` define interfaces como `FixtureRepository`, `PredictionRepository` y `AuditEventRepository`.
- `packages/storage-adapters/src/index.ts` exporta implementaciones concretas de infraestructura.
- `packages/canonical-pipeline` y `packages/source-connectors` muestran una separación entre modelos operativos y payloads de proveedor.

## Consequences

### Positivas

- dominio testeable sin runtime de infraestructura;
- reemplazo más seguro de Prisma, object store, colas o APIs sin reescribir reglas core;
- menor riesgo de acoplar la evolución del producto a una tecnología puntual.

### Costos

- más interfaces y composición explícita al principio;
- hace visible deuda de ensamblado cuando una app intenta saltar capas.
