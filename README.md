# gana-v8

Hermes-native sports prediction ops platform.

## Diagrama de arquitectura

![Diagrama de arquitectura de gana-v8](docs/architecture/gana-v8-architecture.png)

Versión navegable: `docs/architecture/gana-v8-architecture.html`

## Qué incluye este scaffold

Este slice materializa el scaffold inicial del monorepo con:

- workspaces reales en `apps/*` y `packages/*`
- configuración TypeScript compartida para apps y paquetes
- scripts uniformes de `build`, `lint`, `test`, `typecheck` y `clean`
- placeholders compilables para los bounded contexts definidos en la arquitectura
- estructura base adicional para `data-contracts/`, `docs/`, `fixtures/`, `infra/`, `notebooks/`, `registry/`, `scripts/` y `tests/`

## Workspaces incluidos

### Apps
- `apps/hermes-control-plane`
- `apps/operator-console`
- `apps/public-api`
- `apps/scoring-worker`
- `apps/ingestion-worker`
- `apps/research-worker`
- `apps/validation-worker`
- `apps/publisher-worker`
- `apps/sandbox-runner`

### Packages
- `packages/domain-core`
- `packages/contract-schemas`
- `packages/orchestration-sdk`
- `packages/source-connectors`
- `packages/canonical-pipeline`
- `packages/research-contracts`
- `packages/research-engine`
- `packages/feature-store`
- `packages/model-registry`
- `packages/prediction-engine`
- `packages/parlay-engine`
- `packages/validation-engine`
- `packages/publication-engine`
- `packages/policy-engine`
- `packages/audit-lineage`
- `packages/observability`
- `packages/config-runtime`
- `packages/storage-adapters`
- `packages/queue-adapters`
- `packages/authz`
- `packages/testing-fixtures`
- `packages/dev-cli`

## Comandos

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Convenciones del scaffold

- Cada workspace expone `src/index.ts` como punto de entrada mínimo.
- `build` compila a `dist/` con TypeScript.
- `lint` valida convenciones mínimas del workspace y su manifest.
- `test` verifica que el artefacto compilado exporte metadata consistente.
- `typecheck` ejecuta TypeScript sin emitir artefactos.

## Próximos pasos naturales

- agregar implementación real por slice sobre cada app/package
- introducir runtimes específicos por servicio cuando exista código funcional
- conectar CI para ejecutar `pnpm install && pnpm verify`

## Planes clave

- `docs/plans/gana-v8-master-plan-producto-implementacion.md`
- `docs/plans/hermes-v8-migracion-v7-a-v8-git-worktrees.md`
- `docs/plans/gana-v8-monorepo-layout.md`
- `docs/plans/hermes-v8-blueprint-prediccion-partidos.md`
