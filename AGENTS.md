# AGENTS.md

Entry point corto y canónico para agentes que trabajen en `gana-v8`.

## Arranque rápido

1. Leer `README.md` para topología operativa, comandos y superficies activas.
2. Leer `docs/README.md` para el mapa documental y la taxonomía vigente.
3. Tratar `docs/plans/falta/` como la fuente de verdad para gaps activos del repo.
4. Usar `docs/agentic-handoff.md` cuando haya subagentes, handoff entre sesiones o trabajo largo.
5. Usar `docs/agentic-sprint-contract.md` y `docs/agentic-evaluation-rubric.md` para trabajo agentic no trivial, paralelo o con evaluador separado.
6. Ir a `runbooks/README.md` para elegir procedimientos operativos activos; usar `runbooks/expensive-verification-triage.md` para corridas largas o DB-backed y `runbooks/sandbox-certification.md` para la certificación sintética.

## Topología oficial hoy

- El runtime recomendado vive en `packages/control-plane-runtime` y en `apps/hermes-scheduler`, `apps/hermes-dispatcher` y `apps/hermes-recovery`.
- `apps/hermes-control-plane` sigue existiendo solo como compatibilidad temporal para tests, imports y flujos legacy.
- La certificación determinística del harness vive en `fixtures/replays/goldens/`, `tests/sandbox/certification.mjs` y `apps/sandbox-runner`.

## Mapa mínimo del repo

- `apps/`: procesos desplegables y workers.
- `packages/`: dominio reusable, runtime y adapters.
- `prisma/`: schema y migraciones.
- `docs/`: arquitectura, ADRs, planes y mapas documentales.
- `runbooks/`: operación humana y procedimientos activos.
- `fixtures/`: goldens y artefactos sintéticos versionados.
- `tests/`: smoke, sandbox y suites del monorepo.
- `scripts/`: utilidades operativas y checks mecánicos.

## Reglas de trabajo

- La verdad durable debe quedar en el repo, no solo en chat o memoria humana.
- No crear documentos activos que compitan con otro documento ya canónico para el mismo frente.
- Si el cambio altera el estado del backlog, sincronizar `README.md`, `docs/plans/README.md` y `docs/plans/falta/` en la misma edición.
- Para trabajo no trivial, declarar objetivo, alcance, baseline, validación y criterio de done antes de editar.
- Para trabajo paralelo largo: un worktree = un subagente = una rama. No compartir worktree.
- Cada handoff debe dejar objetivo, estado, decisiones, riesgos abiertos y próxima acción.
- Para una estrategia extensa de worktrees y merges, usar como referencia `docs/plans/completado/hermes-v8-migracion-v7-a-v8-git-worktrees.md`.

## Checks de salida

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:sandbox:certification
```

`pnpm lint` debe fallar si deriva el mapa mínimo del harness (`AGENTS.md`, índices de planes, índice de runbooks, secciones obligatorias, comandos canónicos o links locales).

## Planes activos

`docs/plans/falta/` contiene planes activos hoy. Mantener esta lista alineada con `README.md`, `docs/plans/README.md` y los archivos reales:

- `docs/plans/falta/gana-v8-harness-worktree-bootstrap-y-validacion-ejecutable.md`

Último cierre relevante:

- `docs/plans/completado/gana-v8-harness-doc-gardening-y-runbooks.md`
- `docs/plans/completado/gana-v8-harness-contratos-agentic-y-evaluacion.md`
- `docs/plans/completado/gana-v8-harness-runtime-release-y-verificacion-fiel.md`
- `docs/plans/completado/gana-v8-runtime-release-adopcion-operativa.md`
- `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md`
