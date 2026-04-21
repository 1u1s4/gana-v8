# Plan ejecutable de migración V7 → V8 con ramas, worktrees y merges

## 1. Qué existe hoy en V7

Repositorio origen inspeccionado: `/root/work/v0-v7`

Stack actual detectado:
- Next.js 16 + React 19 + TypeScript + Prisma + MySQL
- UI de consola operativa en `app/ops` + `components/ops`
- Lógica de dominio ya separada en módulos reutilizables dentro de `lib/`

Áreas principales encontradas:
- `lib/etl`: 8 archivos
- `lib/ops`: 12 archivos
- `lib/atomics`: 7 archivos
- `lib/parlays`: 6 archivos
- `lib/validation`: 7 archivos
- `lib/ai`: 25 archivos
- `lib/db`: 4 archivos
- `components/ops`: consola y paneles operativos
- `app/api/*`: route handlers que hoy mezclan capa web con dominio
- `prisma/schema.prisma`: esquema grande y ya bastante alineado al rediseño v2

Conclusión operativa:
V7 ya contiene una separación natural por dominios. La migración no debe empezar por copiar `app/` completo, sino por extraer primero los módulos de dominio y dejar la UI para una fase posterior.

## 2. Objetivo de V8

Crear un repo nuevo V8 como monorepo modular, donde:
- el dominio viva fuera de Next.js
- la app web sea un adaptador fino
- ETL, workers y validación sean ejecutables independientes
- los merges se hagan por dominio y no por “big bang”
- varios subagentes puedan trabajar en paralelo usando worktrees aislados

## 3. Principio central de migración

Estrategia recomendada: “strangler + vertical slices”.

No mover todo de golpe.
Se crea un V8 mínimo arrancable y luego se van incorporando slices funcionales en este orden:
1. contratos y tipos compartidos
2. persistencia y esquema
3. ETL
4. task queue / worker orchestration
5. AI runtime
6. atomic predictions
7. parlays
8. validation
9. API adapters
10. UI ops console

Esto reduce riesgo porque cada merge agrega un subsistema con frontera clara y verificable.

## 4. Estructura objetivo del repo V8

Nombre sugerido del repo nuevo: `/root/work/hermes-v8`

Estructura propuesta:

```text
hermes-v8/
  apps/
    web/                 # Next.js app, sólo UI + route handlers finos
    worker/              # proceso de drenado de cola / jobs
    cli/                 # comandos operativos / backfills / smoke tests
  packages/
    config/              # tsconfig/eslint/shared env parsing
    db/                  # prisma schema, client, migrations, repositories
    domain/              # tipos de dominio puros
    etl/                 # ingestion, normalization, enrichment
    ops/                 # queue, task orchestration, events, audit
    ai/                  # provider registry, structured outputs, model resolution
    predictions/         # atomics + parlays
    validation/          # reconcile + settlement logic
    shared/              # utils cross-package muy pequeñas
    ui/                  # componentes compartidos, opcional
  infra/
    docker/
    scripts/
  docs/
```

Regla fuerte:
- `apps/web` no puede contener lógica de negocio pesada.
- Todo lo que hoy está en `lib/*` debe terminar en `packages/*`.
- `app/api/*/route.ts` debe transformarse en thin adapters que llaman casos de uso exportados por paquetes.

## 5. Mapping V7 → V8 por módulos

### Copiar primero casi intacto
Estas áreas ya están suficientemente desacopladas y conviene migrarlas temprano:
- `lib/db/*` → `packages/db/src/*`
- `lib/ai/*` → `packages/ai/src/*`
- `lib/etl/*` → `packages/etl/src/*`
- `lib/ops/tasks/*` → `packages/ops/src/tasks/*`
- `lib/validation/*` → `packages/validation/src/*`
- `lib/atomics/*` + `lib/parlays/*` → `packages/predictions/src/{atomics,parlays}/*`
- `types/ops.ts` → dividir entre `packages/domain` y `packages/shared`

### Copiar después con refactor
- `app/api/*` → `apps/web/app/api/*` como adaptadores mínimos
- `components/ops/*` → `apps/web/components/ops/*` o `packages/ui/*`
- `app/ops/page.tsx` → reconstruido encima de los casos de uso ya migrados

### No copiar tal cual
- dependencias implícitas de path alias `@/`
- mezcla de tipos UI + tipos de dominio en `types/ops.ts`
- cualquier acceso a Prisma desde UI o route handlers, si existe
- scripts sueltos sin contrato (`scripts/*.ts|*.mjs`) antes de reasignarlos a `apps/cli` o `infra/scripts`

## 6. Fases de migración

## Fase 0 — Bootstrap de V8

Objetivo:
crear el repo vacío, monorepo, CI mínima y contratos base.

Entregables:
- repo nuevo inicializado
- workspace package manager configurado
- TypeScript project references o workspace tsconfig
- lint/test/build por paquete
- `apps/web` con página health mínima
- `packages/{db,domain,shared}` creados

Branch:
- `main`
- `integration/bootstrap-v8`

Worktree:
- `/root/worktrees/hermes-v8-bootstrap`

Criterio de merge:
- el repo compila en vacío
- Prisma genera cliente
- CI verde sin features migradas

## Fase 1 — Contratos y modelo de datos

Objetivo:
trasladar primero el lenguaje del sistema antes que la UI.

Copiar/refactorizar:
- `prisma/schema.prisma`
- enums y tipos de `types/ops.ts`
- utilidades de fecha y normalización de dominio

Resultado esperado:
- `packages/domain`: tipos puros sin imports de Next
- `packages/db`: prisma client + repositories base
- esquema Prisma funcional y desacoplado del app router

Branch:
- `slice/contracts-domain`
- `slice/prisma-schema-base`

Merge order:
1. `slice/contracts-domain`
2. `slice/prisma-schema-base`
3. merge a `integration/bootstrap-v8`

Riesgo evitado:
si primero se copia la UI, los tipos quedan anclados a Next y se repite la arquitectura V7.

## Fase 2 — ETL como paquete autónomo

Objetivo:
migrar la pieza con menos dependencia de UI y mayor valor sistémico.

Origen principal:
- `lib/etl/*`
- `lib/api-football/*`
- parte de `lib/db/*`
- scripts ETL relevantes

Destino:
- `packages/etl`
- `packages/db`
- `apps/cli` para comandos de ejecución manual

Entregables:
- API de paquete: `runDailyEtl`, `refreshFixturesByIds`, `refreshFixtureEnrichment`
- tests de normalización y persistencia
- comando CLI smoke: `etl run --date YYYY-MM-DD`

Branches paralelos:
- `slice/etl-core`
- `slice/etl-provider-api-football`
- `slice/etl-cli-smoke`

Merge order:
- merge first: `etl-core`
- then provider
- then cli
- finally squash/merge into `integration/etl`

Verificación de salida:
- ETL corre sin `apps/web`
- se pueden poblar fixtures/odds/enrichment desde CLI

## Fase 3 — Cola operativa y worker

Objetivo:
separar la orquestación de tareas del runtime web.

Origen principal:
- `lib/ops/tasks/*`
- fragmentos de `lib/etl/runner.ts` asociados a creación/completado de tareas
- scripts worker/drain

Destino:
- `packages/ops`
- `apps/worker`
- `apps/cli`

Entregables:
- claim/lock/drain/complete/fail desacoplados de Next
- event sink estándar
- worker process independiente

Branches paralelos:
- `slice/ops-queue-core`
- `slice/ops-event-stream`
- `slice/worker-runner`

Criterio de merge:
- un worker puede drenar tareas de ETL y registrar runs
- sin dependencia de route handlers

## Fase 4 — Runtime AI

Objetivo:
centralizar proveedor, selección de modelo y structured output.

Origen:
- `lib/ai/*`

Destino:
- `packages/ai`

Entregables:
- provider registry
- model selection
- structured output parse/validate
- tests aislados por proveedor

Branches:
- `slice/ai-runtime-core`
- `slice/ai-provider-codex`
- `slice/ai-template-catalog`

Observación:
esta fase debe entrar antes de atomics/parlays porque ambos dependen de ella.

## Fase 5 — Predicciones atómicas

Objetivo:
migrar el primer caso de uso end-to-end de valor.

Origen:
- `lib/atomics/*`

Destino:
- `packages/predictions/src/atomics`

Entregables:
- `runAtomicGenerationTask`
- inputs/prompt/persistence/output-schema desacoplados
- smoke test con fixture real o fixture fixtureado

Branches:
- `slice/atomics-inputs-persistence`
- `slice/atomics-prompt-runtime`
- `slice/atomics-task-runner`

Criterio de merge:
- una tarea atómica se ejecuta por worker y persiste salida válida

## Fase 6 — Parlays

Objetivo:
migrar la segunda capa de predicción encima de atomics ya portadas.

Origen:
- `lib/parlays/*`

Destino:
- `packages/predictions/src/parlays`

Branches:
- `slice/parlays-inputs-persistence`
- `slice/parlays-runtime`

Regla:
no abrir esta fase hasta que atomics esté fusionado en integración.

## Fase 7 — Validation y reconcile

Objetivo:
portar settlement y cierre post-partido.

Origen:
- `lib/validation/*`

Destino:
- `packages/validation`

Branches:
- `slice/validation-core`
- `slice/validation-reconcile-final`

Criterio de merge:
- sweep de validación ejecutable por CLI/worker

## Fase 8 — API adapters

Objetivo:
recrear el contract surface web sin volver a meter lógica de negocio en `app/api`.

Origen:
- `app/api/*`

Destino:
- `apps/web/app/api/*`

Regla técnica:
Cada route handler sólo hace 4 cosas:
1. parse request
2. auth opcional
3. llama un caso de uso en paquetes
4. serializa respuesta/SSE

Branches:
- `slice/api-etl-adapters`
- `slice/api-ops-task-adapters`
- `slice/api-atomics-parlays-adapters`

## Fase 9 — Ops console UI

Objetivo:
reconstruir la UI sobre V8 ya estable.

Origen:
- `components/ops/*`
- `app/ops/page.tsx`
- partes de `lib/ops/queries.ts`

Destino:
- `apps/web/app/ops/*`
- `apps/web/components/ops/*`
- `packages/ui` opcional

Orden recomendado dentro de UI:
1. header + snapshot loader
2. ETL panel
3. queue panel
4. atomic panel
5. parlay panel
6. validation panel
7. AI inspector / audit terminal

Razón:
la UI es consumidora; debe llegar al final para no bloquear el dominio.

## 7. Estrategia de ramas

Modelo recomendado:

```text
main
  integration/bootstrap-v8
  integration/etl
  integration/ops-runtime
  integration/predictions
  integration/web-adapters
  integration/ui

feature/slice/...     # ramas cortas por subdominio
fix/...               # fixes puntuales
```

Reglas:
- `main` siempre desplegable/verde.
- Cada fase grande vive primero en una `integration/*`.
- Cada subagente trabaja sobre `feature/slice/*` creada desde la `integration/*` activa.
- Nunca mandar 5 dominios juntos al mismo PR.

Tamaño objetivo por PR:
- 300–900 líneas cuando sea refactor delicado
- máximo 1500 si el cambio es mostly mechanical

## 8. Estrategia de worktrees

Layout sugerido:

```text
/root/work/hermes-v8                  # repo principal
/root/worktrees/hermes-v8-bootstrap
/root/worktrees/hermes-v8-etl
/root/worktrees/hermes-v8-ops
/root/worktrees/hermes-v8-ai
/root/worktrees/hermes-v8-atomics
/root/worktrees/hermes-v8-parlays
/root/worktrees/hermes-v8-validation
/root/worktrees/hermes-v8-api
/root/worktrees/hermes-v8-ui
```

Comandos base sugeridos:

```bash
git clone <nuevo-remote> /root/work/hermes-v8
cd /root/work/hermes-v8
git checkout -b integration/bootstrap-v8

git worktree add /root/worktrees/hermes-v8-etl -b slice/etl-core integration/bootstrap-v8
git worktree add /root/worktrees/hermes-v8-ops -b slice/ops-queue-core integration/bootstrap-v8
git worktree add /root/worktrees/hermes-v8-ai -b slice/ai-runtime-core integration/bootstrap-v8
```

Regla operativa para subagentes:
- un worktree = un subagente = una rama
- nunca compartir worktree
- rebase frecuente sobre la rama `integration/*` correspondiente

## 9. Estrategia de merges

### Patrón recomendado
1. subagente abre rama slice desde `integration/*`
2. termina una pieza pequeña y autocontenida
3. ejecuta tests locales del paquete afectado
4. merge a `integration/*`
5. al completar la fase, hacer PR/merge de `integration/*` a `main`

### Tipo de merge recomendado
- `--no-ff` para ramas de integración
- squash opcional para slices muy mecánicas
- evitar reescritura de historia una vez compartida con otros subagentes

### Cuándo usar cherry-pick
- sólo para fixes pequeños cross-phase
- no para transportar módulos completos

### Conflictos previsibles
1. `package.json` / workspace config
2. aliases TS
3. exports index por paquete
4. `schema.prisma`
5. tipos compartidos

Mitigación:
- designar un “integration owner” por fase
- reservar archivos globales para merges secuenciales, no paralelos

## 10. Qué copiar primero, exactamente

Orden concreto de copia inicial:

1. `prisma/schema.prisma`
2. `lib/db/prisma.ts`, `lib/db/prisma-types.ts`, `lib/db/retry.ts`
3. enums y tipos canónicos de `types/ops.ts`
4. `lib/ops/date.ts`
5. `lib/api-football/*`
6. `lib/etl/*`
7. `lib/ops/tasks/*`
8. `lib/ai/*`
9. `lib/atomics/*`
10. `lib/parlays/*`
11. `lib/validation/*`
12. recién después `app/api/*`
13. al final `components/ops/*` y `app/ops/page.tsx`

Razón:
ese orden sigue las dependencias reales: data → orchestration → AI → use cases → adapters → UI.

## 11. Qué refactorizar después, no antes

No gastar la primera semana en:
- renombrado exhaustivo de todos los símbolos
- rediseño visual de la consola
- reescribir todos los tests snapshot
- cambiar proveedor de DB
- micro-optimizar queries

Sí refactorizar después de tener slices andando:
- separar interfaces/ports vs implementaciones
- crear repositories explícitos por agregado
- mover path aliases `@/` a imports por paquete
- dividir `types/ops.ts` en bounded contexts
- convertir scripts ad hoc en comandos de `apps/cli`
- revisar nombres V7 legacy (`mega`, `prompt_runs`, etc.) a nombres V8

## 12. Cómo evitar romper todo

### Guardrails técnicos
- mantener V7 intacto como sistema de referencia
- V8 arranca “dark”, sin reemplazar producción hasta tener ETL + worker + atomics mínimos
- cada fase debe tener smoke tests propios
- no mezclar refactor arquitectónico con cambio funcional grande en el mismo PR

### Guardrails de migración
- primero hacer “copy, adapt imports, compile”
- luego “refactor internals”
- luego “optimizar”

### Guardrails de datos
- no apuntar V8 a la base productiva de V7 durante las primeras fases
- usar DB nueva o schema aislado
- si se necesita replay, poblar desde ETL en entorno aparte

### Guardrails de release
- hitos de activación:
  1. V8 ETL-only
  2. V8 ETL + worker
  3. V8 atomics end-to-end
  4. V8 parlays + validation
  5. V8 web console

## 13. Paquetes mínimos que deben existir antes de mandar subagentes

Checklist de preparación:
- workspace manager decidido (`pnpm` recomendado)
- convenciones de branch naming
- convención de worktrees
- plantilla de PR
- package boundaries escritos
- owners por paquete
- matriz de dependencias entre paquetes
- CI que permita test por paquete

Si esto no existe, los subagentes se pisan entre sí.

## 14. Matriz de subagentes lista para ejecutar

### Subagente A — bootstrap/domain/db
- rama: `slice/contracts-domain`
- worktree: `/root/worktrees/hermes-v8-bootstrap`
- objetivo: packages base + tipos + prisma base
- depende de: nadie

### Subagente B — etl core
- rama: `slice/etl-core`
- worktree: `/root/worktrees/hermes-v8-etl`
- objetivo: portar runner/persistence/api-football
- depende de: A

### Subagente C — ops runtime
- rama: `slice/ops-queue-core`
- worktree: `/root/worktrees/hermes-v8-ops`
- objetivo: claim/drain/worker/event sink
- depende de: A y parcialmente B

### Subagente D — ai runtime
- rama: `slice/ai-runtime-core`
- worktree: `/root/worktrees/hermes-v8-ai`
- objetivo: provider registry + structured output + catalog
- depende de: A

### Subagente E — atomics
- rama: `slice/atomics-task-runner`
- worktree: `/root/worktrees/hermes-v8-atomics`
- objetivo: caso de uso completo de predicción atómica
- depende de: B + C + D

### Subagente F — parlays
- rama: `slice/parlays-runtime`
- worktree: `/root/worktrees/hermes-v8-parlays`
- objetivo: parlays sobre atomics activas
- depende de: E

### Subagente G — validation
- rama: `slice/validation-core`
- worktree: `/root/worktrees/hermes-v8-validation`
- objetivo: reconcile + settlement
- depende de: A y preferible B

### Subagente H — web adapters
- rama: `slice/api-ops-task-adapters`
- worktree: `/root/worktrees/hermes-v8-api`
- objetivo: route handlers finos para ETL/tasks/atomics/parlays
- depende de: B/C/D/E/F/G

### Subagente I — UI ops console
- rama: `slice/ui-ops-console`
- worktree: `/root/worktrees/hermes-v8-ui`
- objetivo: reconstrucción progresiva de consola
- depende de: H

## 15. Definición de done por fase

Una fase sólo se considera cerrada si cumple:
- compila de forma aislada
- tests/smoke del paquete pasan
- exports del paquete están estabilizados
- no depende de imports desde `apps/web`
- existe un comando o test reproducible que demuestre uso real
- mergeado a su `integration/*`

## 16. Recomendación final

La migración V7 → V8 no debe ser repo-copy + cleanup posterior.
Debe ser:
- repo nuevo
- monorepo modular
- slices por dominio
- worktrees por subagente
- merges por integración
- UI al final

La secuencia más segura y rápida es:
1. bootstrap
2. domain/db
3. etl
4. ops worker
5. ai runtime
6. atomics
7. parlays
8. validation
9. api adapters
10. ui

Ese orden reutiliza al máximo lo ya bueno de V7 y minimiza regresiones sistémicas.