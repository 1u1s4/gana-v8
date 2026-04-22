# ADR-001: Monorepo con fronteras explícitas entre apps y packages

- Status: Accepted
- Date: 2026-04-15

## Context

La fase 0 del master plan exige un monorepo modular con separación explícita entre apps, packages e infra. El repo ya materializa esa dirección: existen workspaces desplegables en `apps/*` y lógica reusable en `packages/*`, con TypeScript compartido, CI mínima y scripts uniformes.

Sin una decisión explícita, el repo puede degradarse rápido hacia dos anti-patrones:

1. apps que importan lógica de negocio ad hoc entre sí;
2. packages convertidos en cajón de sastre sin ownership operativo.

## Decision

gana-v8 se organiza como monorepo por límites operativos, no por framework ni por equipo circunstancial.

### Reglas base

1. `apps/*` contiene procesos desplegables y puntos de entrada operativos.
   - Ejemplos actuales: `apps/hermes-control-plane`, `apps/operator-console`, `apps/public-api`, workers y `apps/sandbox-runner`.
2. `packages/*` contiene capacidades reutilizables, contratos y dominio compartido.
   - Ejemplos actuales: `packages/domain-core`, `packages/orchestration-sdk`, `packages/source-connectors`, `packages/canonical-pipeline`, `packages/parlay-engine`, `packages/storage-adapters`.
3. Una app puede depender de packages, pero no debe depender de otra app como frontera de negocio.
4. La evolución del sistema debe introducir nuevas capacidades primero como package reusable cuando la lógica no sea específica del runtime desplegable.
5. Artefactos de soporte operativo, documentación, pruebas e infraestructura viven fuera de `apps/` y `packages/`.

## Implementation alignment observed in repo

- `README.md` ya documenta workspaces separados en `apps/*` y `packages/*`.
- `docs/plans/completado/gana-v8-plan-cierre-plataforma-operacion.md` y `docs/plans/gana-v8-monorepo-layout.md` describen esta topología como base actual y como cierre operacional ya materializado.
- El repo ya tiene múltiples apps y packages compilables, lo que confirma que esta decisión no es aspiracional sino la base actual del scaffold.

## Consequences

### Positivas

- ownership técnico más claro entre runtime desplegable y lógica reusable;
- mayor reuso entre workers, sandbox y control plane;
- cambios arquitectónicos más auditables que en un repo mezclado por framework.

### Costos

- más disciplina para mantener fronteras limpias;
- necesidad de contratos explícitos y versionado interno cuando una capability crece.
