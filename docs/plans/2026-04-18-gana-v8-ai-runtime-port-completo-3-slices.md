# Plan A — port COMPLETO útil del AI runtime a v8 en 3 slices

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task

**Goal:** portar a gana-v8 la capa útil del runtime AI de v0-v7 para que v8 tenga ejecución LLM real, selección de modelos, prompts versionados, structured output, trazabilidad rica de AiRun y una integración operativa primero en research y luego en scoring

**Architecture:** el port no debe reemplazar el pipeline determinístico actual sino encapsular un runtime reusable en packages nuevos/fortalecidos. research-worker pasa a poder correr en modo determinístico o LLM-backed con fallback, mientras scoring-worker conserva su baseline determinístico pero gana la capacidad de usar synthesis/decision support y de persistir trazas ricas de ejecución. model-registry deja de ser placeholder y se vuelve la fuente de verdad para catálogo, selección y versionado de prompts/modelos

**Tech Stack:** TypeScript, NodeNext, pnpm workspaces, Prisma/MySQL, packages/model-registry, nuevo packages/ai-runtime, apps/research-worker, apps/scoring-worker, domain-core AiRun, public-api/operator-console

---

## Scope real del port

### Sí entra en este plan
- provider abstraction real
- ejecución sync y stream de modelos
- model selection + allowed models + catálogo con fallback
- prompt registry versionado
- structured output helper con validación
- trazabilidad rica en AiRun
- integración de research-worker con runtime AI real y fallback determinístico
- integración mínima útil de scoring-worker con runtime AI sin romper el baseline determinístico
- read models/ops para inspeccionar runs reales

### No entra en este plan
- portar web-search necesariamente en el primer corte salvo que el provider elegido lo soporte limpio
- reescribir todo el research-engine determinístico
- hacer scoring full-LLM desde el día 1
- cerrar todos los gaps schema/pipeline legacy fuera de AI runtime

---

# Slice 1 — foundation: model-registry + ai-runtime + contratos de ejecución

**Objective:** dejar lista una base reusable y testeada para correr modelos reales desde v8, con catálogo, selección, prompts y structured output

**Files:**
- Create: `packages/ai-runtime/package.json`
- Create: `packages/ai-runtime/tsconfig.json`
- Create: `packages/ai-runtime/tsconfig.build.json`
- Create: `packages/ai-runtime/src/index.ts`
- Create: `packages/ai-runtime/src/types.ts`
- Create: `packages/ai-runtime/src/errors.ts`
- Create: `packages/ai-runtime/src/run-http-ai.ts`
- Create: `packages/ai-runtime/src/structured-output.ts`
- Create: `packages/ai-runtime/src/provider-registry.ts`
- Create: `packages/ai-runtime/src/clients.ts`
- Create: `packages/ai-runtime/src/providers/codex-http.ts`
- Create: `packages/ai-runtime/tests/*.test.ts`
- Modify: `packages/model-registry/src/index.ts`
- Create: `packages/model-registry/src/allowed-models.ts`
- Create: `packages/model-registry/src/allowed-models-schema.ts`
- Create: `packages/model-registry/src/model-catalog.ts`
- Create: `packages/model-registry/src/model-selection.ts`
- Create: `packages/model-registry/src/prompt-registry.ts`
- Create: `packages/model-registry/src/template-catalog.ts`
- Create: `packages/model-registry/tests/*.test.ts`
- Modify: `tsconfig.base.json`
- Modify: `pnpm-workspace.yaml` si hace falta registrar el package nuevo
- Modify: `packages/domain-core/src/entities/ai-run.ts` solo si faltan campos de trazabilidad reutilizables
- Test: `packages/ai-runtime/tests/*.test.ts`
- Test: `packages/model-registry/tests/*.test.ts`

### Task 1.1: crear el package `@gana-v8/ai-runtime`

**Step 1: Write failing test**
- Crear `packages/ai-runtime/tests/ai-runtime.test.ts` que importe `describeWorkspace` y `workspaceInfo`
- Verificar que el package exporta al menos:
  - `runHttpAi`
  - `streamHttpAi`
  - `AiExecutionError`
  - tipos base de request/response

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/ai-runtime test`
Expected: FAIL por package inexistente

**Step 3: Write minimal implementation**
- Crear scaffolding del package siguiendo el patrón de otros packages del repo
- Exponer `workspaceInfo` y `describeWorkspace`

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/ai-runtime test`
Expected: PASS del smoke básico

**Step 5: Commit**
```bash
git add packages/ai-runtime tsconfig.base.json pnpm-workspace.yaml
git commit -m "feat: scaffold ai runtime package"
```

### Task 1.2: portar contratos y errores del runtime viejo

**Objective:** mover la capa de tipos y errores sin acoplarla al repo viejo

**Files:**
- Create: `packages/ai-runtime/src/types.ts`
- Create: `packages/ai-runtime/src/errors.ts`
- Test: `packages/ai-runtime/tests/types.test.ts`

**Step 1: Write failing test**
- testear que existen tipos/exportaciones para:
  - `RunHttpAiInput`
  - `RunHttpAiResult`
  - `RunHttpAiStreamEvent`
  - `NormalizedAiResponse`
  - `AiProviderAdapter`
  - `AiExecutionError`

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/ai-runtime test -- --testNamePattern types`
Expected: FAIL

**Step 3: Write minimal implementation**
- adaptar desde `/root/work/v0-v7/lib/ai/types.ts` y `errors.ts`
- quitar imports de alias legacy `@/types/ops`
- reemplazar por tipos internos de v8

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/ai-runtime test`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/ai-runtime/src/types.ts packages/ai-runtime/src/errors.ts packages/ai-runtime/tests/types.test.ts
git commit -m "feat: port ai runtime types and errors"
```

### Task 1.3: volver `model-registry` operativo

**Objective:** dejar `packages/model-registry` como fuente real para allowed models, catálogo, selección y prompts

**Files:**
- Modify: `packages/model-registry/src/index.ts`
- Create: `packages/model-registry/src/allowed-models.ts`
- Create: `packages/model-registry/src/allowed-models-schema.ts`
- Create: `packages/model-registry/src/model-catalog.ts`
- Create: `packages/model-registry/src/model-selection.ts`
- Create: `packages/model-registry/src/prompt-registry.ts`
- Create: `packages/model-registry/src/template-catalog.ts`
- Create: `packages/model-registry/tests/model-registry.test.ts`

**Step 1: Write failing test**
- validar exports y al menos estos comportamientos:
  - catálogo fallback no vacío
  - selección de modelo devuelve resolución estable
  - prompt registry resuelve una prompt version conocida para research

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/model-registry test`
Expected: FAIL

**Step 3: Write minimal implementation**
- adaptar lo útil desde:
  - `/root/work/v0-v7/lib/ai/allowed-models.ts`
  - `/root/work/v0-v7/lib/ai/model-catalog.ts`
  - `/root/work/v0-v7/lib/ai/codex-model-selection.ts`
  - `/root/work/v0-v7/lib/ai/prompt-registry.ts`
  - `/root/work/v0-v7/lib/ai/template-catalog.ts`
- separar tres responsabilidades:
  - catálogo y allowlist
  - resolución de modelo/reasoning
  - prompts versionados de research/scoring

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/model-registry test && pnpm --filter @gana-v8/model-registry typecheck`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/model-registry
git commit -m "feat: implement model registry and prompt catalog"
```

### Task 1.4: implementar provider registry + cliente HTTP real

**Objective:** habilitar ejecución real contra provider con interfaz reusable

**Files:**
- Create: `packages/ai-runtime/src/provider-registry.ts`
- Create: `packages/ai-runtime/src/clients.ts`
- Create: `packages/ai-runtime/src/providers/codex-http.ts`
- Test: `packages/ai-runtime/tests/provider-registry.test.ts`
- Test: `packages/ai-runtime/tests/clients.test.ts`

**Step 1: Write failing test**
- testear:
  - `getAiProviderAdapter("codex")` devuelve adapter
  - mock client permite ejecución offline en tests
  - errores se normalizan correctamente

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/ai-runtime test`
Expected: FAIL

**Step 3: Write minimal implementation**
- portar lo útil desde:
  - `/root/work/v0-v7/lib/ai/provider-registry.ts`
  - `/root/work/v0-v7/lib/ai/providers/codex-http.ts`
  - `/root/work/v0-v7/lib/ai/clients.ts`
- limpiar dependencias legacy y dejar config compatible con v8
- usar variables/config runtime del repo actual, no hardcode legacy

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/ai-runtime test`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/ai-runtime/src/provider-registry.ts packages/ai-runtime/src/clients.ts packages/ai-runtime/src/providers packages/ai-runtime/tests
git commit -m "feat: add ai runtime providers and http client"
```

### Task 1.5: implementar `runHttpAi`, `streamHttpAi` y structured output

**Objective:** cerrar el runtime reusable completo

**Files:**
- Create: `packages/ai-runtime/src/run-http-ai.ts`
- Create: `packages/ai-runtime/src/structured-output.ts`
- Modify: `packages/ai-runtime/src/index.ts`
- Test: `packages/ai-runtime/tests/run-http-ai.test.ts`
- Test: `packages/ai-runtime/tests/structured-output.test.ts`

**Step 1: Write failing test**
- cubrir:
  - selección de modelo desde model-registry
  - normalización de respuesta
  - fallback a catálogo local
  - parsing JSON estructurado limpio y fenced
  - stream delta/event/complete

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/ai-runtime test`
Expected: FAIL

**Step 3: Write minimal implementation**
- adaptar desde:
  - `/root/work/v0-v7/lib/ai/run-http-ai.ts`
  - `/root/work/v0-v7/lib/ai/structured-output.ts`
- importante: el runtime nuevo debe depender de `@gana-v8/model-registry`, no reimplementar catálogo/selección dentro del package

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/ai-runtime test && pnpm --filter @gana-v8/ai-runtime typecheck`
Expected: PASS

**Step 5: Commit**
```bash
git add packages/ai-runtime
git commit -m "feat: implement reusable ai execution runtime"
```

### Verification for Slice 1
Run:
```bash
pnpm --filter @gana-v8/model-registry test
pnpm --filter @gana-v8/model-registry typecheck
pnpm --filter @gana-v8/ai-runtime test
pnpm --filter @gana-v8/ai-runtime typecheck
```
Expected: all PASS

---

# Slice 2 — research-worker LLM-backed con fallback determinístico

**Objective:** hacer que research-worker pueda usar runtime AI real con prompts versionados y structured output sin romper el flujo actual

**Files:**
- Modify: `apps/research-worker/package.json`
- Modify: `apps/research-worker/src/index.ts`
- Modify: `packages/research-engine/src/index.ts` solo si hace falta exponer hooks mejores
- Modify: `packages/feature-store/src/index.ts` si hace falta persistir metadata adicional
- Create: `apps/research-worker/tests/research-worker-ai-runtime.test.ts`
- Modify: `apps/research-worker/tests/research-worker.test.ts`
- Modify: `packages/domain-core/src/entities/ai-run.ts` si faltan campos
- Modify: `packages/contract-schemas/src/ai-run.ts` si corresponde

### Target behavior
- research-worker soporta dos modos:
  - deterministic baseline actual
  - ai-assisted synthesis usando `@gana-v8/ai-runtime`
- si el provider falla, se vuelve al baseline determinístico sin romper el pipeline
- AiRun persiste:
  - provider
  - model
  - promptVersion
  - providerRequestId
  - usage tokens si existen
  - outputRef o raw artifact ref
  - status/error correctos
- fixture metadata sigue recibiendo researchRecommendedLean, readiness y señales útiles

### Task 2.1: introducir config y wiring AI en research-worker

**Step 1: Write failing test**
- testear que research-worker puede recibir un `synthesisHook` backed por runtime AI y que conserva fallback determinístico

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/research-worker test`
Expected: FAIL

**Step 3: Write minimal implementation**
- agregar dependencia a `@gana-v8/ai-runtime` y `@gana-v8/model-registry`
- agregar una función tipo `runResearchSynthesisAi(...)`
- pasarla como `synthesisHook` cuando el modo AI esté habilitado

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/research-worker test`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/research-worker packages/research-engine packages/feature-store
git commit -m "feat: wire ai runtime into research worker"
```

### Task 2.2: persistir trazabilidad rica de AiRun para research

**Step 1: Write failing test**
- crear test que verifique que un run AI exitoso deja persistido:
  - provider
  - model
  - promptVersion
  - status
  - providerRequestId u outputRef
  - usage cuando aplique

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/research-worker test -- --testNamePattern AiRun`
Expected: FAIL

**Step 3: Write minimal implementation**
- si hacen falta campos, extender dominio y contrato de AiRun
- persistir el run desde research-worker
- no perder compatibilidad con scoring-worker actual

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/research-worker test`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/research-worker packages/domain-core packages/contract-schemas
 git commit -m "feat: persist rich ai run metadata for research"
```

### Task 2.3: endurecer structured output y fallback

**Step 1: Write failing test**
- casos:
  - JSON válido
  - JSON fenced
  - respuesta inválida del provider
  - timeout/provider error
  - fallback a dossier determinístico

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/research-worker test`
Expected: FAIL

**Step 3: Write minimal implementation**
- usar helper de structured output del runtime
- si parseo/provider falla, degradar a baseline determinístico y dejar AiRun failed o degraded según diseño
- persistir summary claro de fallback en metadata o outputRef

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/research-worker test && pnpm --filter @gana-v8/research-worker typecheck`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/research-worker packages/ai-runtime
git commit -m "feat: add structured ai research fallback path"
```

### Verification for Slice 2
Run:
```bash
pnpm --filter @gana-v8/research-worker test
pnpm --filter @gana-v8/research-worker typecheck
pnpm --filter @gana-v8/feature-store test
pnpm --filter @gana-v8/feature-store typecheck
```
Expected: all PASS

---

# Slice 3 — scoring integration mínima útil + observabilidad operativa

**Objective:** integrar el runtime AI al flujo de scoring sin perder la ruta determinística estable, y exponer trazabilidad operativa real en read models/console

**Files:**
- Modify: `apps/scoring-worker/package.json`
- Modify: `apps/scoring-worker/src/index.ts`
- Modify: `apps/scoring-worker/tests/runtime.test.ts`
- Modify: `apps/public-api/src/index.ts`
- Modify: `apps/public-api/tests/**/*.test.ts`
- Modify: `apps/operator-console/src/index.ts`
- Modify: `apps/operator-console/tests/operator-console.test.ts`
- Modify: `packages/model-registry/src/prompt-registry.ts`

### Target behavior
- scoring-worker conserva baseline determinístico para decisión principal
- puede opcionalmente correr un AI-assisted synthesis o explanation step antes de persistir AiRun/Prediction
- public-api expone trazabilidad AI más rica
- operator-console permite ver provider/model/promptVersion/status/request ids/usage/fallback reason cuando existan

### Task 3.1: introducir AI-assisted scoring step sin romper baseline

**Step 1: Write failing test**
- testear que scoring sigue funcionando en modo determinístico
- testear que con modo AI habilitado se corre un paso adicional de synthesis sin cambiar la ruta de fallback

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/scoring-worker test`
Expected: FAIL

**Step 3: Write minimal implementation**
- agregar hook AI opcional al scoring path
- no reemplazar `buildAtomicPrediction` todavía
- usar AI para summary/signal explanation o re-rank advisory, nunca como dependencia única del MVP

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/scoring-worker test`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/scoring-worker packages/model-registry
 git commit -m "feat: add ai-assisted scoring synthesis"
```

### Task 3.2: enriquecer public-api read models de AiRun

**Step 1: Write failing test**
- validar que read models incluyen cuando existan:
  - providerRequestId
  - usage
  - outputRef
  - latestPromptVersion
  - fallback reason o degraded status si aplica

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/public-api test`
Expected: FAIL

**Step 3: Write minimal implementation**
- extender mapper/read model de AiRun
- asegurar compatibilidad con runs viejos internos

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/public-api test && pnpm --filter @gana-v8/public-api typecheck`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/public-api
git commit -m "feat: expose rich ai run fields in public api"
```

### Task 3.3: endurecer operator-console para inspección AI real

**Step 1: Write failing test**
- testear panel/lineas que muestren:
  - provider real
  - model real
  - promptVersion
  - status
  - error/fallback
  - usage o request id si existe

**Step 2: Run test to verify failure**
Run: `pnpm --filter @gana-v8/operator-console test`
Expected: FAIL

**Step 3: Write minimal implementation**
- agregar panel o enriquecer paneles existentes de AI runs
- no romper los snapshots de operator console ya existentes, solo extenderlos

**Step 4: Run test to verify pass**
Run: `pnpm --filter @gana-v8/operator-console test && pnpm --filter @gana-v8/operator-console typecheck`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/operator-console
 git commit -m "feat: expand operator console ai run inspection"
```

### Verification for Slice 3
Run:
```bash
pnpm --filter @gana-v8/scoring-worker test
pnpm --filter @gana-v8/public-api test
pnpm --filter @gana-v8/public-api typecheck
pnpm --filter @gana-v8/operator-console test
pnpm --filter @gana-v8/operator-console typecheck
```
Expected: all PASS

---

# Final integration checklist

- [ ] `@gana-v8/model-registry` deja de ser placeholder
- [ ] existe `@gana-v8/ai-runtime` reusable
- [ ] research-worker puede usar runtime AI real con fallback determinístico
- [ ] AiRun persiste trazabilidad rica para research y scoring
- [ ] scoring-worker mantiene baseline determinístico y agrega capa AI útil no destructiva
- [ ] public-api expone metadata AI real
- [ ] operator-console deja inspeccionar runs AI reales
- [ ] no se rompe la ruta MVP actual de predicción determinística

## Full verification commands

```bash
pnpm --filter @gana-v8/model-registry test
pnpm --filter @gana-v8/model-registry typecheck
pnpm --filter @gana-v8/ai-runtime test
pnpm --filter @gana-v8/ai-runtime typecheck
pnpm --filter @gana-v8/research-worker test
pnpm --filter @gana-v8/research-worker typecheck
pnpm --filter @gana-v8/scoring-worker test
pnpm --filter @gana-v8/public-api test
pnpm --filter @gana-v8/public-api typecheck
pnpm --filter @gana-v8/operator-console test
pnpm --filter @gana-v8/operator-console typecheck
pnpm --filter @gana-v8/feature-store test
pnpm --filter @gana-v8/feature-store typecheck
```

## Suggested execution order

1. Slice 1 completo antes de tocar research/scoring
2. Slice 2 completo y estable antes de meter scoring AI
3. Slice 3 solo cuando research AI ya persista AiRun rico

## Commit strategy

- un commit por task como indica cada bloque
- no mezclar docs/arquitectura/audio sueltos con este port
- si aparece deuda accidental, crear commit `chore:` separado

## Notes for implementer

- mantener el baseline determinístico como fallback en todo momento
- no meter imports frágiles a `dist/...` si se puede evitar
- si un provider real obliga a credenciales nuevas, encapsularlo en config/runtime y tests con mock client
- preferir que `packages/ai-runtime` dependa de `packages/model-registry`, no al revés
- si el path de web-search del runtime viejo complica demasiado el slice inicial, dejarlo detrás de una interfaz opcional y no bloquear Slice 1
