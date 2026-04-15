# gana-v8

Hermes-native sports prediction ops platform.

## Qué es

gana-v8 es la evolución de gana-v7 hacia una plataforma modular donde Hermes funciona como control plane para:

- ingestión diaria e intradía de fixtures, odds y resultados
- research multiagente por fixture
- predicciones atómicas estructuradas
- construcción de parlays con reglas de riesgo y correlación
- validación ex post y auditoría completa
- sandbox/replay para pruebas aisladas del ecosistema

## Estado actual

Este repo ya nace con:

- arquitectura V8 consolidada
- monorepo base con apps y packages
- documentación maestra de migración V7 → V8
- diagramas y ADRs iniciales
- slices base para control plane, operator console, API, workers y contratos

## Repos fuente analizados

- `v0-v7` como fuente principal de capacidades implementadas
- `gana-v7` como fuente principal de visión, SRS y modelo objetivo

## Estructura

- `apps/` procesos desplegables
- `packages/` lógica reusable por dominio
- `data-contracts/` contratos versionados
- `docs/` arquitectura, ADRs y runbooks
- `scripts/` bootstrap, migraciones y replays
- `tests/` smoke, contract, integration y sandbox

## Comandos

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

## Planes clave

- `docs/plans/gana-v8-master-plan-producto-implementacion.md`
- `docs/plans/hermes-v8-migracion-v7-a-v8-git-worktrees.md`
- `docs/plans/gana-v8-monorepo-layout.md`
- `docs/plans/hermes-v8-blueprint-prediccion-partidos.md`
