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
- sólo rutas materializadas en git cuando ya existe contenido real

El layout objetivo completo vive en `docs/plans/`, especialmente en `docs/plans/gana-v8-monorepo-layout.md`. Directorios como `data-contracts/`, `fixtures/`, `infra/`, `notebooks/`, `registry/`, `scripts/`, `tests/` y partes de `docs/` se crean a medida que tengan artefactos concretos, en vez de preservarse con placeholders vacíos.

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
pnpm test:sandbox:certification
pnpm build
```

## Superficies operativas

`public-api` puede correrse como servicio HTTP interno:

```bash
pnpm --filter @gana-v8/public-api serve
```

Si definís `GANA_PUBLIC_API_VIEWER_TOKEN` y/o `GANA_PUBLIC_API_OPERATOR_TOKEN`, el servicio exige `Authorization: Bearer ...`.

La consola web de operación corre separada y consume solo `public-api`:

```bash
pnpm --filter @gana-v8/operator-console serve:web
```

La consola ahora también muestra el estado de `sandbox certification` y puede inspeccionar el diff por golden usando `public-api`.

Variables clave:

- `GANA_OPERATOR_CONSOLE_PUBLIC_API_URL`
- `GANA_OPERATOR_CONSOLE_PUBLIC_API_TOKEN`
- `GANA_PUBLIC_API_PORT`
- `GANA_OPERATOR_CONSOLE_PORT`

## Sandbox y certification

La certificación determinística de sandbox usa goldens versionadas en `fixtures/replays/goldens/` y genera evidence packs en `.artifacts/sandbox-certification/`:

```bash
pnpm test:sandbox:certification
```

También podés correr un certificado puntual con el runner:

```bash
pnpm --filter @gana-v8/sandbox-runner certify -- --mode smoke --profile ci-smoke --pack football-dual-smoke --golden fixtures/replays/goldens/ci-smoke/football-dual-smoke.json --artifact .artifacts/sandbox-certification/ci-smoke/football-dual-smoke.evidence.json
```

Runbook:

- `runbooks/sandbox-certification.md`

## Base de datos por defecto

- Prisma y el runtime quedan orientados a MySQL como default de desarrollo.
- Copiá `.env.example` a `.env` y completá `DATABASE_URL` (y opcionalmente `DATABASE_ADMIN_URL`) con la conexión MySQL administrada en DigitalOcean.
- Para DigitalOcean managed MySQL sin CA local configurada, usá `sslaccept=accept_invalid_certs` en la URL
- El baseline actual de `prisma/migrations/` ya fue regenerado para MySQL.

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

- `docs/plans/falta/gana-v8-plan-cierre-plataforma-operacion.md`
- `docs/plans/falta/gana-v8-plan-cierre-data-research.md`
- `docs/plans/falta/gana-v8-plan-cierre-sandbox-qa.md`
- `docs/plans/hermes-v8-migracion-v7-a-v8-git-worktrees.md`
- `docs/plans/gana-v8-monorepo-layout.md`
- `docs/plans/hermes-v8-blueprint-prediccion-partidos.md`
