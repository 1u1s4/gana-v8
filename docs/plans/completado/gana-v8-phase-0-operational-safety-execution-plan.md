# Gana-v8 Phase 0 Operational Safety Execution Plan

> For Hermes: execute this plan before advancing Phase 1+. No new sophistication until operational safety is materially improved

**Goal:** eliminar las fragilidades más peligrosas de `gana-v8` relacionadas con drift de schema, persistencia de errores largos, bleed entre entornos y políticas frágiles de IDs

**Scope:** Phase 0 only

---

## Slice 0.1 — Migration gate and schema verification

**Objective:** impedir que apps/workers corran sobre DB desalineada

**Files likely touched**
- `packages/storage-adapters/src/...`
- `packages/config-runtime/src/index.ts`
- `apps/*/src/index.ts` where runtime bootstraps DB
- `scripts/` for startup verification helpers
- `docs/runbooks/` new docs

**Tasks**
1. Crear helper central `verifySchemaReadiness(databaseUrl)`
2. Hacer que workers/apps con DB llamen ese helper al boot en modo `prod/staging`
3. Exponer modo `skipSchemaVerification` sólo para tests/sandbox explícitos
4. Agregar test unitario del helper
5. Agregar smoke test de arranque con schema OK
6. Documentar runbook de migrations

**Acceptance**
- si falta una migration aplicada, el proceso falla temprano con mensaje accionable
- tests siguen verdes

---

## Slice 0.2 — Error persistence hardening

**Objective:** que errores reales no rompan la persistencia

**Files likely touched**
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `packages/storage-adapters/src/prisma/mappers.ts`
- repositorios de task/taskRun/validation/aiRun si hace falta
- workers que persisten errores

**Tasks**
1. Auditar campos vulnerables (`TaskRun.error`, `Task.lastErrorMessage`, `Validation.summary`, etc.)
2. Definir política `short code + short message + detail ref or detail json`
3. Cambiar schema donde haga falta a `Text`/JSON
4. Crear migration reproducible
5. Agregar tests de roundtrip con errores largos
6. Reproducir el caso real de odds ingestion y verificar que ya no rompe

**Acceptance**
- errores largos se persisten sin `P2000`
- logs/UI pueden mostrar una versión corta sin perder detalle completo

---

## Slice 0.3 — Environment and secret guard-rails

**Objective:** impedir bleed entre local/sandbox y prod

**Files likely touched**
- `packages/config-runtime/src/index.ts`
- `scripts/run-live-ingestion.mjs`
- `scripts/run-live-ingestion.sh`
- `.env.example`
- docs de perfiles

**Tasks**
1. Eliminar fallback cross-repo a `/root/work/v0-gana-v6-dashboard-design/.env`
2. Definir allowlist/denylist de hosts por profile (`local-dev`, `sandbox`, `staging`, `prod`)
3. Hacer fail-fast si un profile no autorizado intenta usar DB/host productivo
4. Endurecer `.env.example` para defaults seguros
5. Agregar tests de config-runtime para perfiles peligrosos

**Acceptance**
- local-dev no puede apuntar a prod sin override explícito y visible
- scripts live ya no dependen de secretos de otro repo

---

## Slice 0.4 — ID policy hardening

**Objective:** evitar nuevos `P2000` por ids composicionales demasiado largos

**Files likely touched**
- `packages/domain-core` if there are ID helpers
- `apps/publisher-worker/src/index.ts`
- otros sitios con ids compuestos de tasks/runs/audit if found
- tests asociados

**Tasks**
1. Inventariar constructores de IDs composicionales
2. Definir estándar único de ID corto/opaco (ULID o hash corto determinístico según dominio)
3. Aplicarlo a aggregates vulnerables
4. Agregar tests de límite de longitud por aggregate
5. Documentar guideline de IDs del monorepo

**Acceptance**
- ningún aggregate crítico usa IDs que dependan de concatenar strings operativos largos

---

## Definition of done for Phase 0
- migration gate activo
- error persistence hardening mergeado
- environment guard-rails activos
- ID policy documentada y aplicada en puntos críticos
- tests de workspaces afectados verdes
- validación runtime real al menos en ingestion + publisher

---

## Recommended verification commands
- `pnpm prisma migrate status --schema prisma/schema.prisma`
- `pnpm --filter @gana-v8/storage-adapters test`
- `pnpm --filter @gana-v8/ingestion-worker test`
- `pnpm --filter @gana-v8/publisher-worker test`
- `pnpm --filter @gana-v8/public-api test`
- corrida runtime real del caso que antes fallaba
