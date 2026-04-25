# Gana V8 LLM Web Research Evidence Pipeline Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Forzar research web via LLM en `gana-v8` y convertir las fuentes/citas devueltas por el modelo en evidencia y claims persistibles que puedan pasar el gate de research antes de scoring.

**Architecture:** El repo ya puede pasar `web_search_preview` al provider Codex cuando `GANA_RESEARCH_WEB_SEARCH_MODE=required`, pero hoy el resultado AI sólo modifica `summary` y `risks`. Este plan agrega un contrato estructurado para fuentes/claims web, normaliza esa salida como `EvidenceItem` y/o `Claim`, la mezcla antes de construir el bundle final, y deja un runner operativo que falle si el LLM no usó web research cuando el modo es `required`.

**Tech Stack:** TypeScript, Node test runner, Zod, Prisma/MySQL, `@gana-v8/ai-runtime`, `apps/research-worker`, `packages/research-engine`, `packages/research-contracts`, `apps/scoring-worker`, `apps/publisher-worker`.

---

## Estado actual confirmado

- `packages/ai-runtime/src/providers/codex-http.ts` ya traduce `webSearchMode !== "disabled"` en `tools: [{ type: "web_search_preview" }]` y `toolChoice: "required" | "auto"`.
- `apps/research-worker/src/index.ts` ya lee `GANA_RESEARCH_WEB_SEARCH_MODE=auto|required` y propaga `webSearchMode` a `runStructuredOutput(...)`.
- `apps/scoring-worker/src/index.ts` también soporta `GANA_SCORING_WEB_SEARCH_MODE`, pero el bloqueo observado está antes: research deja bundles en `hold`.
- `runResearchTask(...)` construye primero un `baselineBundle` determinístico y, si AI está activo, llama `runResearchSynthesisAi(...)`.
- El AI trace actual sólo aplica `summary` y `risks` con `applyResearchSynthesis(...)`; no agrega evidence, sources ni claims accionables al bundle.
- La corrida live reciente tuvo odds h2h persistidas para fixtures reales, pero scoring saltó porque research quedó en `hold` con razones tipo `No actionable claims were produced` y `Critical non-official claims need corroboration`.
- `EvidenceItem`, `SourceRecord`, `Claim` y el gate de research ya existen en `packages/research-contracts/src/index.ts`.

## Ya cubierto

- Transporte base de web search hacia Codex Responses API.
- Variables de entorno para activar AI-assisted research y web search.
- Persistencia de `AiRun`, `ResearchBundle`, `ResearchClaim`, `ResearchSource`, `ResearchClaimSource`, `FeatureSnapshot`.
- Gate de research que bloquea scoring cuando el bundle no es publishable.
- Ingesta live de fixtures/odds y scripts multi-liga.

## Faltantes exclusivos

1. Contrato estructurado de salida AI que incluya fuentes web, citas, evidencia candidata, dirección, impacto, confianza, tipo de fuente y corroboración.
2. Prompt de research que obligue al LLM a buscar web y devolver fuentes verificables cuando `webSearchMode=required`.
3. Mapeador `AI structured output -> EvidenceItem[]` con ids determinísticos, metadata de provenance y normalización de `kind`, `direction`, `confidence`, `impact`, `extractedAt`.
4. Rebuild del research bundle con evidencia web antes del gate, no sólo resumen/riesgos después del bundle determinístico.
5. Validación fuerte: si `webSearchMode=required` y no hay fuentes/evidencia web, marcar fallback/error explícito en trace y mantener `hold` con razón clara.
6. Runner operativo para correr research web sobre fixtureIds reales y reportar `AiRun`, fuentes, claims, gate status y si scoring quedó habilitado.
7. Observabilidad en public-api/operator-console o reporte CLI para distinguir `web-research-used`, `web-research-empty`, `web-research-fallback`.

## Interfaces/contratos afectados

- `packages/research-contracts/src/index.ts`
  - Puede requerir nuevos tipos para `ResearchAiSourceCandidate`, `ResearchAiEvidenceCandidate` o extender `ResearchSynthesisHookOutput`.
- `apps/research-worker/src/index.ts`
  - `researchStructuredOutputSchema`
  - `runResearchSynthesisAi(...)`
  - `runResearchTask(...)`
  - nuevos helpers de normalización/persistencia.
- `apps/research-worker/tests/research-worker.test.ts`
  - Tests unitarios del contrato AI y de gate publishable con evidencia web corroborada.
- `packages/ai-runtime/src/providers/codex-http.ts`
  - Sólo si hace falta exponer evidence de eventos/citations crudos; el transporte de tools ya existe.
- `packages/ai-runtime/src/clients.ts`
  - Puede requerir normalizar annotations/citations si Responses API las devuelve fuera del JSON estructurado.
- `scripts/run-research-web.mjs` o nombre equivalente
  - Runner operativo para fixtures reales.
- `.env.example`
  - Documentar variables y modo recomendado.
- `docs/plans/README.md`, `README.md`, `AGENTS.md`
  - Mantener lista de planes activos alineada.

## Dependencias

- Credencial AI/Codex funcional para `@gana-v8/ai-runtime`; no guardar ni exponer tokens.
- Modelo compatible con structured output + `web_search_preview`.
- Fixtures reales y odds persistidas en MySQL para reproducir el caso.
- `GANA_RESEARCH_SYNTHESIS_MODE=ai-assisted` o `GANA_ENABLE_RESEARCH_AI=1`.
- `GANA_RESEARCH_WEB_SEARCH_MODE=required` para forzar búsqueda web.
- Policy de research actual: no bajarla primero; el objetivo es alimentar evidencia suficiente antes de relajar gates.

## Criterio de done

- Un test confirma que `webSearchMode=required` manda tools web al provider y queda visible en trace/metadata.
- Un test confirma que una salida AI con dos fuentes independientes se convierte en `EvidenceItem[]` y claims persistibles con `corroboration.status = corroborated` u otro estado aceptado por el gate.
- Un test confirma que `runResearchTask(...)` con AI web evidence reconstruye el bundle final con `evidenceCount > 0`, `claims.length > 0` y gate no queda en `hold` por `No actionable claims were produced`.
- Un test confirma que `webSearchMode=required` + cero fuentes devuelve estado explícito `web-research-empty`/fallback y NO publica silently.
- Runner real permite ejecutar research web para fixtureIds concretos sin exponer secretos.
- Corrida live sobre al menos 2 fixtures con odds produce research bundles con fuentes/claims web persistidos; si scoring sigue bloqueado, la razón ya no debe ser `No actionable claims were produced`.
- `pnpm --filter @gana-v8/ai-runtime test`, `pnpm --filter @gana-v8/research-worker test`, `pnpm --filter @gana-v8/scoring-worker test`, `pnpm lint` pasan.
- Harness smoke pasa con `pnpm harness:validate -- --worktree-id jo-web-research --base-port 4700 --level smoke`.

## Fuentes consolidadas

- Incidente live del 2026-04-25: fixtures/odds persistidos, pero scoring saltó por research bundles en `hold` sin claims accionables.
- `apps/research-worker/src/index.ts:1333-1408`: AI config y ejecución estructurada con webSearchMode.
- `apps/research-worker/src/index.ts:1451-1524`: `runResearchTask` aplica AI sólo como synthesis summary/risks.
- `packages/ai-runtime/src/providers/codex-http.ts:64-87`: Codex request ya incluye web search tools según modo.
- `packages/research-contracts/src/index.ts`: contratos existentes de `EvidenceItem`, `SourceRecord`, `Claim`, `ResearchBundle` y gate.
- `docs/plans/README.md`: plantilla obligatoria y lifecycle de planes activos.

---

## Plan de implementación

### Task 1: Capturar baseline rojo del gap actual

**Objective:** Probar que AI-assisted research con webSearchMode no agrega evidencia ni claims al bundle final hoy.

**Files:**
- Modify: `apps/research-worker/tests/research-worker.test.ts`

**Step 1: Write failing test**

Agregar un test con `codexAdapter` fake que devuelve structured output con `summary` y `risks`, y configurar `webSearchMode: "required"`.

Expected assertions iniciales:
- `result.featureSnapshot.researchTrace?.synthesisMode === "ai-assisted"`
- `result.persistableResearchBundle.sources.length === 0`
- `result.persistableResearchBundle.claims.length === 0`
- `result.persistableResearchBundle.gateResult.status === "hold" | "degraded"`

Este test documenta el comportamiento actual. Si ya existe un test similar, reforzarlo con `webSearchMode: "required"`.

**Step 2: Run test**

Run:
```bash
pnpm --filter @gana-v8/research-worker test
```

Expected: PASS como baseline documental o FAIL si se escribe directamente contra el comportamiento deseado de tasks posteriores.

**Step 3: Commit**

```bash
git add apps/research-worker/tests/research-worker.test.ts
git commit -m "test: document research web evidence gap"
```

### Task 2: Definir contrato structured output para web research

**Objective:** Extender el schema AI de research para que el LLM devuelva fuentes y evidencia candidata, no sólo resumen/riesgos.

**Files:**
- Modify: `apps/research-worker/src/index.ts`
- Modify: `apps/research-worker/tests/research-worker.test.ts`

**Step 1: Add schema fields**

Extender `researchStructuredOutputSchema` con campos opcionales:

```ts
sources: z.array(z.object({
  title: z.string().min(1),
  url: z.string().url().optional(),
  provider: z.string().min(1),
  publishedAt: z.string().datetime().optional(),
  capturedAt: z.string().datetime().optional(),
  sourceType: z.enum(["official", "news", "market", "stats", "social", "other"]).default("news"),
  independenceKey: z.string().min(1).optional(),
  snippet: z.string().min(1),
})).default([]),
evidence: z.array(z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  kind: z.enum(["form", "schedule", "availability", "lineups", "motivation", "market", "tactical", "model-hook"]),
  direction: z.enum(["home", "away", "draw", "neutral"]),
  confidence: z.number().min(0).max(1),
  impact: z.number().min(0).max(1),
  sourceIndexes: z.array(z.number().int().nonnegative()).min(1),
  tags: z.array(z.string()).default([]),
})).default([])
```

**Step 2: Test schema accepts useful web evidence**

Add unit test using fake provider output with two sources and one evidence item.

Run:
```bash
pnpm --filter @gana-v8/research-worker test
```

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/research-worker/src/index.ts apps/research-worker/tests/research-worker.test.ts
git commit -m "feat: extend research ai output with web evidence"
```

### Task 3: Update research prompt to require citations when web search is required

**Objective:** Make the prompt tell the LLM exactly what to search and how to cite evidence.

**Files:**
- Modify: `apps/research-worker/src/index.ts`
- Test: `apps/research-worker/tests/research-worker.test.ts`

**Step 1: Locate `renderResearchAiPrompt(...)`**

Add instructions:
- If web search is available/required, search current team news, injuries, suspensions, probable lineups, tactical context and market-moving facts.
- Return at least two independent sources for any critical claim.
- Prefer official club/league/team channels for lineups/availability; trusted media/stats for supporting claims.
- Do not invent URLs.
- If no source is found, return empty `sources`/`evidence` and explain in `risks`.

**Step 2: Test prompt content**

Add assertion that rendered prompt mentions:
- `sources`
- `evidence`
- `two independent sources`
- `Do not invent URLs`

Run:
```bash
pnpm --filter @gana-v8/research-worker test
```

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/research-worker/src/index.ts apps/research-worker/tests/research-worker.test.ts
git commit -m "feat: require cited web research in fixture prompt"
```

### Task 4: Normalize AI web sources into EvidenceItem[]

**Objective:** Convert structured AI web output into canonical `EvidenceItem` records consumable by `buildResearchBundle(...)`.

**Files:**
- Modify: `apps/research-worker/src/index.ts`
- Test: `apps/research-worker/tests/research-worker.test.ts`

**Step 1: Add helper**

Create helper near the AI synthesis functions:

```ts
const buildAiWebEvidence = ({
  fixture,
  generatedAt,
  structuredOutput,
}: {
  fixture: FixtureEntity;
  generatedAt: string;
  structuredOutput: ResearchStructuredOutput;
}): EvidenceItem[] => {
  // deterministic id: evidence:web-ai:<fixtureId>:<index>:<hash>
  // source.provider: `web:${source.provider}`
  // source.reference: source.url ?? source.title
  // metadata includes source title/url/sourceType/publishedAt/capturedAt
};
```

Rules:
- Drop evidence whose `sourceIndexes` do not point to existing sources.
- Clamp confidence/impact to 0..1.
- Use `generatedAt` if source has no `capturedAt`.
- Use `metadata.webResearchMode = "llm-web-search"`.
- Preserve URL in metadata, never as secret.

**Step 2: Test normalizer**

Input: two sources + one evidence item.

Assert:
- evidence length = 1
- `source.provider` starts with `web:`
- `source.reference` is URL when present
- tags preserved
- direction/kind/confidence/impact preserved.

Run:
```bash
pnpm --filter @gana-v8/research-worker test
```

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/research-worker/src/index.ts apps/research-worker/tests/research-worker.test.ts
git commit -m "feat: normalize ai web research evidence"
```

### Task 5: Rebuild final bundle with AI web evidence before gate

**Objective:** Ensure web evidence affects claims, sources, directional score, feature snapshot and publishability gate.

**Files:**
- Modify: `apps/research-worker/src/index.ts`
- Test: `apps/research-worker/tests/research-worker.test.ts`

**Step 1: Change runResearchTask flow**

After successful `runResearchSynthesisAi(...)`:

```ts
const aiWebEvidence = buildAiWebEvidence({ fixture: input.fixture, generatedAt, structuredOutput: aiTrace.structuredOutput });
if (aiWebEvidence.length > 0) {
  bundle = buildResearchBundle(input.fixture, {
    ...baseBundleOptions,
    evidence: [...baselineBundle.evidence, ...aiWebEvidence],
    synthesisHook: {
      synthesize() {
        return {
          summary: aiTrace.structuredOutput.summary,
          risks: aiTrace.structuredOutput.risks ?? [],
        };
      },
    },
  });
} else {
  bundle = applyResearchSynthesis(bundle, { summary, risks });
}
```

Important: avoid double-applying evidence. Preserve deterministic baseline when AI fails.

**Step 2: Test final bundle**

Fake AI returns two independent sources and evidence with strong confidence/impact.

Assert:
- `persistableResearchBundle.sources.length > 0`
- `persistableResearchBundle.claims.length > 0`
- `persistableFeatureSnapshot.evidenceCount > 0`
- gate reason no longer includes `No actionable claims were produced`.

Run:
```bash
pnpm --filter @gana-v8/research-worker test
```

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/research-worker/src/index.ts apps/research-worker/tests/research-worker.test.ts
git commit -m "feat: feed ai web evidence into research gate"
```

### Task 6: Make required web research fail loudly when no sources are returned

**Objective:** Prevent a misleading AI-assisted run that used no web evidence from looking successful.

**Files:**
- Modify: `apps/research-worker/src/index.ts`
- Test: `apps/research-worker/tests/research-worker.test.ts`

**Step 1: Add metadata/status reason**

If `input.ai.webSearchMode === "required"` and `structuredOutput.sources.length === 0`:
- Add trace metadata: `webResearchStatus: "empty"` if type extension is acceptable, or add `fallbackSummary`/risk string.
- Add risk: `Required web research returned no sources.`
- Keep bundle gate in hold/degraded; do not coerce publishable.

**Step 2: Test empty web research**

Fake AI returns summary but empty sources/evidence.

Assert:
- bundle remains blocked or degraded.
- risks include `Required web research returned no sources`.
- `AiRun.status === "completed"` but trace makes empty web explicit.

Run:
```bash
pnpm --filter @gana-v8/research-worker test
```

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/research-worker/src/index.ts apps/research-worker/tests/research-worker.test.ts
git commit -m "fix: flag empty required web research"
```

### Task 7: Add a real runner for fixture web research

**Objective:** Provide an operational command to run LLM web research for selected fixtures and print gate/scoring readiness.

**Files:**
- Create: `scripts/run-research-web.mjs`
- Test: optional `tests/run-research-web.test.mjs` if script helpers are exportable.

**Step 1: Implement script**

Behavior:
- Load `.env` from repo, prioritizing repo `GANA_DATABASE_URL`/`DATABASE_URL` over inherited env.
- Parse `--fixture-ids=1379303,1379304` or env `GANA_RESEARCH_FIXTURE_IDS`.
- Set defaults:
  - `GANA_RESEARCH_SYNTHESIS_MODE=ai-assisted`
  - `GANA_RESEARCH_WEB_SEARCH_MODE=required`
  - `GANA_RUNTIME_PROFILE=production` only when DB URL is remote and already intended.
- Build Prisma unit of work with explicit DB URL.
- Load fixtures by canonical id `fixture:api-football:<id>` or full fixture id.
- Call `runResearchWorker({ fixtures, persistence, generatedAt, ai: resolveResearchAiConfig(env) })`.
- Print sanitized JSON:
  - fixtureId
  - match
  - aiRunId/provider/model/providerRequestId presence only
  - evidenceCount
  - sourceCount
  - claimCount
  - gateStatus
  - gateReasons

**Step 2: Manual smoke**

Run with one known fixture:
```bash
GANA_RESEARCH_SYNTHESIS_MODE=ai-assisted \
GANA_RESEARCH_WEB_SEARCH_MODE=required \
node scripts/run-research-web.mjs --fixture-ids 1379303
```

Expected:
- If credentials are present: AI run completes and prints source/evidence/gate summary.
- If credentials are absent: fails clearly with missing AI credential, no secret output.

**Step 3: Commit**

```bash
git add scripts/run-research-web.mjs
git commit -m "feat: add fixture web research runner"
```

### Task 8: Wire web research into official scoring validation flow

**Objective:** Make the official run sequence deterministic: odds -> web research -> scoring -> publisher -> verification.

**Files:**
- Create or Modify: `runbooks/web-research-scoring.md`
- Modify: `runbooks/README.md` if adding runbook index is required.

**Step 1: Document commands**

Runbook should include:
```bash
node scripts/run-live-ingestion-top-leagues.mjs fixtures
GANA_LIVE_ODDS_FIXTURE_IDS=<ids> GANA_FOOTBALL_MARKET_KEYS=h2h node scripts/run-live-ingestion.mjs odds
GANA_RESEARCH_SYNTHESIS_MODE=ai-assisted GANA_RESEARCH_WEB_SEARCH_MODE=required node scripts/run-research-web.mjs --fixture-ids <ids>
node scripts/run-scoring-worker.mjs --fixture-ids <ids>
node scripts/run-publisher-worker.mjs
```

Use actual existing script names where available; if `run-scoring-worker.mjs` does not exist, the task must either create it or document the current `node --input-type=module` invocation.

**Step 2: Verification SQL/API**

Document checks:
- `ResearchBundle.gateResult.status`
- counts of `ResearchSource`, `ResearchClaim`, `FeatureSnapshot.evidenceCount`
- `Prediction` count/status
- `Parlay` count/status
- `/fixtures/:id/ops`

**Step 3: Commit**

```bash
git add runbooks/web-research-scoring.md runbooks/README.md
git commit -m "docs: add web research scoring runbook"
```

### Task 9: Add observability for web research provenance

**Objective:** Make it visible whether a fixture was researched via real web search and whether evidence was actionable.

**Files:**
- Modify: `apps/public-api/src/index.ts` or relevant read model file.
- Modify: `apps/operator-console/src/*` if console displays fixture ops.
- Test: `apps/public-api/tests/*`, `apps/operator-console/tests/*`.

**Step 1: Public API read model**

Expose in fixture ops:
- `research.webSearchMode`
- `research.webResearchStatus`
- `research.sourceCount`
- `research.claimCount`
- `research.gateStatus`
- `research.gateReasons`
- latest `aiRunId`, provider/model, providerRequestId presence.

Never expose credentials or raw provider request payloads.

**Step 2: Console**

Display concise line:
- `research: web required / sources 4 / claims 2 / gate publishable`
- if empty: `research: web required but no sources returned`

**Step 3: Tests**

Run:
```bash
pnpm --filter @gana-v8/public-api test
pnpm --filter @gana-v8/operator-console test
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/public-api apps/operator-console
git commit -m "feat: expose web research provenance in ops"
```

### Task 10: Full verification on live fixtures

**Objective:** Prove the gap is closed on real fixtures without presenting market-only picks as official.

**Files:**
- No source edits unless bugs are found.

**Step 1: Build and test targeted workspaces**

```bash
pnpm --filter @gana-v8/ai-runtime test
pnpm --filter @gana-v8/research-worker test
pnpm --filter @gana-v8/scoring-worker test
pnpm --filter @gana-v8/public-api test
pnpm --filter @gana-v8/operator-console test
pnpm lint
```

**Step 2: Run harness smoke**

```bash
pnpm harness:bootstrap -- --worktree-id jo-web-research --base-port 4700 --skip-db
pnpm harness:validate -- --worktree-id jo-web-research --base-port 4700 --level smoke
pnpm harness:clean -- --worktree-id jo-web-research
```

If ports remain open, identify and kill only the harness processes for 4700/4701.

**Step 3: Live fixture proof**

Use 2 fixtures with odds h2h:
```bash
GANA_RESEARCH_SYNTHESIS_MODE=ai-assisted \
GANA_RESEARCH_WEB_SEARCH_MODE=required \
node scripts/run-research-web.mjs --fixture-ids <ids>
```

Then run official scoring/publisher.

Expected proof:
- `AiRun.provider = codex` or configured provider.
- `AiRun.providerRequestId` present when provider returns one.
- `ResearchSource.count > 0` for fixture.
- `ResearchClaim.count > 0` for fixture.
- Gate reason no longer says `No actionable claims were produced`.
- At least one prediction persists if confidence/edge gates also pass.

**Step 4: Commit final docs if needed**

```bash
git status --short
git commit -m "test: verify web research scoring flow" # only if docs/artifacts intentionally changed
```

---

## Riesgos y decisiones abiertas

- Si Codex Responses API devuelve citations fuera del JSON estructurado, habrá que normalizar eventos/annotations desde `rawEvents` además de pedir JSON.
- Si el provider no permite `web_search_preview` en el modelo configurado, el runner debe fallar claro y sugerir modelo compatible.
- No relajar el gate de research en el primer slice. Primero hay que demostrar evidencia web accionable.
- Si aun con evidencia web el gate bloquea por corroboración, el siguiente ajuste debe ser explícito: mapear dos fuentes independientes al mismo claim o ajustar `requiredSourceCount` por kind/source tier.
- Para partidos de bajo perfil puede no haber fuentes suficientes; eso debe quedar como `hold` legítimo, no como error técnico.
