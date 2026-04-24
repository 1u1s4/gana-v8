# Plan de scoring, publisher y validation multi-mercado - gana-v8

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan task-by-task. Mantener TDD y no mezclar este alcance con corners stats.

**Goal:** hacer que el harness genere, publique y valide predicciones de goles/totals, BTTS y doble oportunidad usando odds persistidas y score final.

**Architecture:** extender el motor de prediccion para producir candidatos por mercado desde snapshots de odds canonicos, luego quitar los guards MVP que bloquean todo lo no-moneyline en publisher y validation. Goles, BTTS y doble oportunidad se liquidan con `Fixture.score`, por eso no necesitan ingestion de estadisticas extra.

**Tech Stack:** TypeScript, pnpm, Prisma/MySQL, prediction-engine, scoring-worker, publisher-worker, validation-worker, node:test.

---

## Estado actual confirmado

- `packages/prediction-engine/src/index.ts` declara `PredictionMarket = 'moneyline' | 'totals' | 'spread' | 'both-teams-score'`.
- `generateMarketCandidates(...)` solo genera candidatos `moneyline` para `home`, `draw`, `away`.
- `apps/scoring-worker/src/index.ts` deriva probabilidades desde un snapshot `h2h` y crea prediction id `prediction:<fixtureId>:moneyline:<outcome>:<generatedAt>`.
- `apps/publisher-worker/src/index.ts` salta cualquier prediction cuyo market no sea `moneyline` con `unsupported-market`.
- `apps/validation-worker/src/index.ts` salta cualquier prediction cuyo market no sea `moneyline`.
- `Fixture.score` ya existe y permite liquidar moneyline, totals, BTTS y doble oportunidad.

## Ya cubierto

- Entidad `Prediction` ya tiene campos `market`, `outcome`, `probabilities`, `confidence`, `rationale`.
- `PredictionMarket` ya contempla `totals` y `both-teams-score`.
- `PredictionOutcome` ya contempla `over`, `under`, `yes`, `no`.
- Validation worker ya puede leer fixtures completed con score.
- Publisher ya puede convertir una `Prediction` en `AtomicCandidate` si se elimina la restriccion hardcoded a moneyline.

## Faltantes exclusivos

### 1. Contrato de mercado extendido

Alinear nombres internos:

- `totals` para goles over/under, alimentado desde odds `totals-goals`
- `both-teams-score` para BTTS yes/no
- `double-chance` para 1X/12/X2

Agregar outcomes para double chance:

- `home-draw`
- `home-away`
- `draw-away`

### 2. Scoring multi-mercado

El scoring debe producir una prediccion por mercado elegible, no solo una prediction moneyline por fixture.

Mercados base:

- moneyline desde `h2h`
- totals desde `totals-goals`
- both-teams-score desde `both-teams-score`
- double-chance desde `double-chance`

### 3. Publisher multi-mercado controlado

El publisher debe aceptar candidatos no-moneyline, pero con politica de riesgo:

- max 1 leg por fixture
- no mezclar mercados altamente correlacionados del mismo fixture
- permitir parlays mixtos entre fixtures diferentes
- mantener `workflow` force-include/force-exclude

### 4. Validation para score-derived markets

Liquidar:

- moneyline: home/draw/away actual
- totals: over/under con linea en metadata o rationale/payload
- BTTS: yes/no si ambos equipos anotaron
- double-chance: outcome gana si el resultado final cae en uno de los dos lados

### 5. Read models y consola

Mostrar mercado/outcome de forma legible en:

- `public-api` predictions/parlays/fixture ops
- `operator-console` fixture ops y parlay cards

## Interfaces/contratos afectados

- `packages/prediction-engine/src/index.ts`
- `packages/prediction-engine/tests/index.test.ts`
- `apps/scoring-worker/src/index.ts`
- `apps/scoring-worker/tests/runtime.test.ts`
- `apps/publisher-worker/src/index.ts`
- `apps/publisher-worker/tests/runtime.test.ts`
- `apps/validation-worker/src/index.ts`
- `apps/validation-worker/tests/runtime.test.ts`
- `apps/public-api/src/index.ts`
- `apps/public-api/tests/*.test.ts`
- `apps/operator-console/src/index.ts`
- `apps/operator-console/tests/*.test.ts`
- `prisma/schema.prisma` solo si hace falta guardar line/threshold de forma estructurada; preferir metadata JSON primero si ya existe espacio en `Prediction.probabilities`/rationale no alcanza

## Dependencias

- Depende de `docs/plans/falta/gana-v8-multi-market-odds-taxonomy-ingestion.md` para tener odds canonicas.
- Corners queda fuera de este plan porque requiere estadisticas finales adicionales.
- Debe preservar compatibilidad total con moneyline y parlays actuales.
- Debe evitar publicar parlays de mercados correlacionados sin policy explicita.

## Tareas de implementacion

### Task 1: Extender tipos de mercado y outcome

**Objective:** permitir `double-chance` y outcomes compuestos en prediction-engine.

**Files:**
- Modify: `packages/prediction-engine/src/index.ts:40-42`
- Test: `packages/prediction-engine/tests/index.test.ts`

**Step 1: Write failing test**

Agregar un test de tipos/runtime que construya candidatos double chance:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { isScoreDerivedMarketOutcome } from '../src/index.js';

test('score derived markets include double chance outcomes', () => {
  assert.equal(isScoreDerivedMarketOutcome('double-chance', 'home-draw'), true);
  assert.equal(isScoreDerivedMarketOutcome('double-chance', 'home-away'), true);
  assert.equal(isScoreDerivedMarketOutcome('double-chance', 'draw-away'), true);
});
```

**Step 2: Run failure**

```bash
pnpm --filter @gana-v8/prediction-engine test -- --test-name-pattern "double chance"
```

Expected: FAIL because helper/types do not exist.

**Step 3: Implement minimal contract**

```ts
export type PredictionMarket =
  | 'moneyline'
  | 'totals'
  | 'spread'
  | 'both-teams-score'
  | 'double-chance';

export type PredictionOutcome =
  | 'home'
  | 'away'
  | 'draw'
  | 'over'
  | 'under'
  | 'yes'
  | 'no'
  | 'home-draw'
  | 'home-away'
  | 'draw-away';

export const isScoreDerivedMarketOutcome = (market: PredictionMarket, outcome: PredictionOutcome): boolean => {
  if (market === 'moneyline') return ['home', 'draw', 'away'].includes(outcome);
  if (market === 'totals') return ['over', 'under'].includes(outcome);
  if (market === 'both-teams-score') return ['yes', 'no'].includes(outcome);
  if (market === 'double-chance') return ['home-draw', 'home-away', 'draw-away'].includes(outcome);
  return false;
};
```

**Step 4: Verify**

```bash
pnpm --filter @gana-v8/prediction-engine test
```

Expected: PASS.

### Task 2: Crear helpers de implied probability por market snapshot

**Objective:** calcular probabilidades normalizadas para snapshots no-h2h.

**Files:**
- Modify: `apps/scoring-worker/src/index.ts`
- Test: `apps/scoring-worker/tests/runtime.test.ts`

**Step 1: Write failing tests**

Casos:

- `deriveMarketImpliedProbabilities(totals-goals)` devuelve `over`/`under`
- `deriveMarketImpliedProbabilities(both-teams-score)` devuelve `yes`/`no`
- `deriveMarketImpliedProbabilities(double-chance)` devuelve `home-draw`/`home-away`/`draw-away`

**Step 2: Implement helper**

Agregar helper puro:

```ts
export const deriveMarketImpliedProbabilities = (
  snapshot: OddsSnapshotLike,
): Record<string, number> | null => {
  const raw: Record<string, number> = {};
  for (const selection of snapshot.selections) {
    if (!Number.isFinite(selection.priceDecimal) || selection.priceDecimal <= 0) continue;
    raw[selection.selectionKey] = 1 / selection.priceDecimal;
  }
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number((value / total).toFixed(4))]));
};
```

**Step 3: Verify**

```bash
pnpm --filter @gana-v8/scoring-worker test -- --test-name-pattern "market implied"
```

Expected: PASS.

### Task 3: Generar candidatos multi-mercado en prediction-engine

**Objective:** agregar generacion de candidates para totals, BTTS y double chance.

**Files:**
- Modify: `packages/prediction-engine/src/index.ts`
- Test: `packages/prediction-engine/tests/index.test.ts`

**Implementation guidance:** no sobrecargar `generateMarketCandidates(...)` original si complica compatibilidad. Crear nuevo helper:

```ts
export interface MarketProbabilityInput {
  readonly market: PredictionMarket;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly line?: number;
}

export const generateCandidatesForMarket = (
  marketInput: MarketProbabilityInput,
  dossier: ResearchDossierLike,
): MarketCandidate[] => {
  // map outcomes from probabilities, compute edge/confidence conservatively
};
```

**Policy inicial:** modelo baseline = implied probability ajustada por research solo si el market es moneyline; para otros mercados usar implied como baseline y exigir edge configurable mas bajo hasta tener features especificas.

**Verification:**

```bash
pnpm --filter @gana-v8/prediction-engine test
```

Expected: PASS.

### Task 4: Scoring worker produce una prediction por mercado elegible

**Objective:** cambiar scoring de single artifact a artifacts por market.

**Files:**
- Modify: `apps/scoring-worker/src/index.ts`
- Test: `apps/scoring-worker/tests/runtime.test.ts`

**Implementation guidance:** crear nueva funcion interna:

```ts
const MARKET_TO_PREDICTION_MARKET = {
  h2h: 'moneyline',
  'totals-goals': 'totals',
  'both-teams-score': 'both-teams-score',
  'double-chance': 'double-chance',
} as const;
```

Buscar latest snapshot por cada marketKey requerido y crear prediction id:

```ts
const createPredictionId = (fixtureId: string, market: string, outcome: string, generatedAt: string): string =>
  `prediction:${fixtureId}:${market}:${outcome}:${generatedAt}`;
```

**Important:** preservar `scoreFixturePrediction(...)` legacy para moneyline o cambiarlo de forma backward compatible. Agregar nueva funcion:

```ts
export const scoreFixtureMarkets = async (...): Promise<ScoreFixtureMarketsResult> => { ... }
```

**Verification:**

```bash
pnpm --filter @gana-v8/scoring-worker test
```

Expected: tests existentes + multi-market passing.

### Task 5: Publisher acepta candidatos multi-mercado

**Objective:** quitar `unsupported-market` hardcoded y reemplazarlo por allowlist/policy.

**Files:**
- Modify: `apps/publisher-worker/src/index.ts:538-632`
- Test: `apps/publisher-worker/tests/runtime.test.ts`

**Step 1: Write failing test**

Agregar test:

```ts
test('publishParlayMvp accepts score-derived markets when policy allows them', async () => {
  // seed predictions from different fixtures: totals over + btts yes
  // expect persisted parlay with both legs
});
```

**Implementation guidance:** reemplazar guard por:

```ts
const SUPPORTED_PARLAY_MARKETS = new Set(['moneyline', 'totals', 'both-teams-score', 'double-chance']);
```

Agregar policy anti-correlacion:

- mismo fixture: max 1 leg
- mercados distintos del mismo fixture se saltan con `duplicate-fixture` o `correlated-fixture-market`

**Verification:**

```bash
pnpm --filter @gana-v8/publisher-worker test
```

Expected: PASS.

### Task 6: Validation para totals, BTTS y double chance

**Objective:** liquidar mercados score-derived con `Fixture.score`.

**Files:**
- Modify: `apps/validation-worker/src/index.ts`
- Test: `apps/validation-worker/tests/runtime.test.ts`

**Implementation guidance:** agregar helpers puros:

```ts
export const deriveTotalsOutcomeFromFixture = (fixture: FixtureEntity, line = 2.5): 'over' | 'under' | null => {
  if (fixture.status !== 'completed' || !fixture.score) return null;
  return fixture.score.home + fixture.score.away > line ? 'over' : 'under';
};

export const deriveBttsOutcomeFromFixture = (fixture: FixtureEntity): 'yes' | 'no' | null => {
  if (fixture.status !== 'completed' || !fixture.score) return null;
  return fixture.score.home > 0 && fixture.score.away > 0 ? 'yes' : 'no';
};

export const deriveDoubleChanceOutcomesFromFixture = (fixture: FixtureEntity): readonly string[] | null => {
  const moneyline = deriveMoneylineOutcomeFromFixture(fixture);
  if (!moneyline) return null;
  if (moneyline === 'home') return ['home-draw', 'home-away'];
  if (moneyline === 'draw') return ['home-draw', 'draw-away'];
  return ['home-away', 'draw-away'];
};
```

Para totals, la linea debe venir de metadata estructurada. Si no existe todavia, usar `2.5` solo como fallback temporal y registrar reason si falta line.

**Verification:**

```bash
pnpm --filter @gana-v8/validation-worker test
```

Expected: PASS.

### Task 7: Public API y operator-console muestran mercados multi-mercado

**Objective:** que las superficies no asuman moneyline en labels.

**Files:**
- Modify: `apps/public-api/src/index.ts`
- Modify: `apps/operator-console/src/index.ts`
- Tests: `apps/public-api/tests/*.test.ts`, `apps/operator-console/tests/*.test.ts`

**Implementation guidance:** crear formatter compartido si no existe:

```ts
const formatPredictionMarketLabel = (market: string, outcome: string): string => {
  if (market === 'both-teams-score') return `BTTS ${outcome}`;
  if (market === 'double-chance') return `Double chance ${outcome}`;
  if (market === 'totals') return `Goals ${outcome}`;
  return `${market} ${outcome}`;
};
```

**Verification:**

```bash
pnpm --filter @gana-v8/public-api test
pnpm --filter @gana-v8/operator-console test
```

Expected: PASS.

### Task 8: Runtime validation con DB real en modo controlado

**Objective:** demostrar una corrida real sin forzar publicacion peligrosa.

**Commands:**

```bash
pnpm --filter @gana-v8/prediction-engine test
pnpm --filter @gana-v8/scoring-worker test
pnpm --filter @gana-v8/publisher-worker test
pnpm --filter @gana-v8/validation-worker test
pnpm --filter @gana-v8/public-api test
pnpm --filter @gana-v8/operator-console test
```

Luego:

```bash
GANA_FOOTBALL_MARKET_KEYS=h2h,totals-goals,both-teams-score,double-chance node scripts/run-live-ingestion.mjs odds
```

Y correr scoring multi-market para 1 fixture scheduled con odds completas. Confirmar en DB:

- predictions published por market esperado
- publisher no salta por `unsupported-market`
- validation liquida correctamente cuando fixture este completed con score

## Criterio de done

- Prediction engine genera candidatos para `moneyline`, `totals`, `both-teams-score`, `double-chance`.
- Scoring worker persiste predictions multi-mercado con IDs que incluyen market real.
- Publisher acepta mercados soportados y aplica anti-correlacion por fixture.
- Validation worker liquida totals, BTTS y double chance desde score final.
- Public API/operator-console muestran market/outcome legible.
- Tests pasan para paquetes/apps afectados.
- Harness smoke pasa despues de cambios.

## Fuentes consolidadas

- Codigo actual: `packages/prediction-engine/src/index.ts`, `apps/scoring-worker/src/index.ts`, `apps/publisher-worker/src/index.ts`, `apps/validation-worker/src/index.ts`.
- Estado actual confirmado: publisher y validation bloquean no-moneyline explicitamente.
- Plan previo requerido: `docs/plans/falta/gana-v8-multi-market-odds-taxonomy-ingestion.md`.
- Plan separado para corners: `docs/plans/falta/gana-v8-corners-stats-prediction-validation.md`.
