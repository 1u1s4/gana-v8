# Plan de taxonomia e ingestion multi-mercado - gana-v8

> **Estado de cierre (2026-04-24):** taxonomia canonica, normalizacion multi-mercado, runners, coverage seed y reporte de disponibilidad quedaron materializados. La ingesta live acotada para fixtures `1388584` y `1378200` persistio `h2h`, `totals-goals`, `both-teams-score` y `double-chance`; `corners-total` queda soportado por taxonomia y opt-in de coverage sin forzarse por default.

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan task-by-task. Mantener TDD y commits chicos.

**Goal:** hacer que el harness pueda ingerir y persistir odds de goles/totals, BTTS, doble oportunidad y corners sin romper el flujo h2h actual.

**Architecture:** separar el problema en una taxonomia canonica de mercados y un adaptador de API-Football que traduzca nombres/ids del provider a `marketKey` estable. La ingesta debe seguir append-only en `RawIngestionBatch` + `OddsSnapshot`, reutilizando `marketKeys` y coverage policies existentes.

**Tech Stack:** TypeScript, pnpm, Prisma/MySQL, API-Football, node:test.

---

## Estado actual confirmado

- `packages/source-connectors/src/clients/api-football.ts` normaliza solo `Match Winner` / bet id `1` como `h2h`.
- Cualquier otro mercado queda como slug generico tipo `<id>-<name>`.
- `FetchOddsWindowInput.marketKeys` ya existe, pero hoy el runner default usa `['h2h']`.
- `scripts/run-live-ingestion.mjs` y `apps/ingestion-worker/src/index.ts` aceptan `marketKeys`, pero el camino top leagues usa h2h por defecto.
- `LeagueCoveragePolicy.marketsAllowed` ya existe y los seed scripts actuales guardan `['h2h']`.
- Para los 5 fixtures analizados el estado real en DB solo tenia `OddsSnapshot.marketKey = 'h2h'`.

## Ya cubierto

- Persistencia generica de `OddsSnapshot.marketKey` y `OddsSelectionSnapshot`.
- `RawIngestionBatch` append-only para odds.
- Runners live con `GANA_FOOTBALL_MARKET_KEYS` y `GANA_LIVE_ODDS_FIXTURE_IDS`.
- Coverage policies por liga con `marketsAllowed`.

## Faltantes exclusivos

### 1. Taxonomia canonica de mercados

Crear una taxonomia central para mapear API-Football a claves internas:

- `h2h` -> ganador 1X2 actual
- `totals-goals` -> over/under goles del partido
- `both-teams-score` -> BTTS yes/no
- `double-chance` -> 1X, 12, X2
- `corners-total` -> over/under corners totales
- `corners-h2h` -> equipo con mas corners, si el provider lo expone

### 2. Normalizacion robusta de selections

Mapear selections canonicas:

- Totals/goles: `over`, `under`, con metadata de linea si viene en label/payload
- BTTS: `yes`, `no`
- Doble oportunidad: `home-draw`, `home-away`, `draw-away`
- Corners total: `over`, `under`, con linea
- Corners h2h: `home`, `away`, `draw` si aplica

### 3. Defaults multi-mercado en runners

Permitir que el runner use un set default mas amplio cuando se active:

- `GANA_FOOTBALL_MARKET_KEYS=h2h,totals-goals,both-teams-score,double-chance,corners-total`
- mantener default seguro `h2h` si no se setea nada

### 4. Coverage policies multi-mercado

Actualizar seed de ligas top para permitir los nuevos mercados, sin forzar corners si no hay soporte de provider.

### 5. Observabilidad de mercados disponibles

Agregar query/script de diagnostico que diga, por fixture:

- marketKeys disponibles
- snapshot count
- bookmakers
- capturedAt latest
- missing expected markets

## Interfaces/contratos afectados

- `packages/source-connectors/src/clients/api-football.ts`
- `packages/source-connectors/src/models/raw.ts`
- `packages/source-connectors/tests/api-football-http.test.ts`
- `apps/ingestion-worker/src/index.ts`
- `apps/ingestion-worker/tests/runtime.test.ts`
- `scripts/run-live-ingestion.mjs`
- `scripts/run-live-ingestion-top-leagues.mjs`
- `scripts/seed-top-league-coverage.mjs`
- `scripts/top-football-leagues.mjs`
- `prisma/schema.prisma` solo si hace falta index adicional, evitar migration si no es necesario

## Dependencias

- Debe completarse antes del plan de scoring multi-mercado.
- Debe mantener compatible el mercado `h2h` y no cambiar IDs existentes de odds.
- Debe validar contra API-Football real con un subset pequeño de fixtures antes de activar por cron.
- No debe imprimir ni commitear `.env` ni claves del provider.

## Tareas de implementacion

### Task 1: Crear taxonomia canonica de mercados

**Objective:** centralizar los nombres internos de mercados y aliases de provider.

**Files:**
- Create: `packages/source-connectors/src/markets.ts`
- Modify: `packages/source-connectors/src/index.ts`
- Test: `packages/source-connectors/tests/markets.test.ts`

**Step 1: Write failing test**

Agregar tests para:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProviderMarketKey } from '../src/markets.js';

test('normalizes API-Football market names to canonical keys', () => {
  assert.equal(normalizeProviderMarketKey({ id: '1', name: 'Match Winner' }), 'h2h');
  assert.equal(normalizeProviderMarketKey({ id: '5', name: 'Goals Over/Under' }), 'totals-goals');
  assert.equal(normalizeProviderMarketKey({ id: '8', name: 'Both Teams Score' }), 'both-teams-score');
  assert.equal(normalizeProviderMarketKey({ id: '12', name: 'Double Chance' }), 'double-chance');
  assert.equal(normalizeProviderMarketKey({ id: '45', name: 'Corners Over Under' }), 'corners-total');
});
```

**Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @gana-v8/source-connectors test -- --test-name-pattern "market names"
```

Expected: FAIL because `markets.ts` does not exist.

**Step 3: Implement minimal taxonomy**

Crear `packages/source-connectors/src/markets.ts`:

```ts
export type CanonicalOddsMarketKey =
  | 'h2h'
  | 'totals-goals'
  | 'both-teams-score'
  | 'double-chance'
  | 'corners-total'
  | 'corners-h2h';

export interface ProviderMarketDescriptor {
  readonly id?: string | number;
  readonly name?: string;
}

const normalize = (value: string | number | undefined): string =>
  String(value ?? '').trim().toLowerCase();

const includesAll = (value: string, tokens: readonly string[]): boolean =>
  tokens.every((token) => value.includes(token));

export const normalizeProviderMarketKey = (market: ProviderMarketDescriptor): string => {
  const id = normalize(market.id);
  const name = normalize(market.name);

  if (id === '1' || name === 'match winner') return 'h2h';
  if (includesAll(name, ['both', 'teams', 'score'])) return 'both-teams-score';
  if (includesAll(name, ['double', 'chance'])) return 'double-chance';
  if (name.includes('corner') && (name.includes('over') || name.includes('under'))) return 'corners-total';
  if (name.includes('corner') && (name.includes('winner') || name.includes('match'))) return 'corners-h2h';
  if ((name.includes('goal') || name.includes('goals')) && (name.includes('over') || name.includes('under'))) {
    return 'totals-goals';
  }

  return id ? `${id}-${name || 'market'}`.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') :
    (name || 'market').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
};
```

Exportar desde `packages/source-connectors/src/index.ts`.

**Step 4: Verify pass**

Run:

```bash
pnpm --filter @gana-v8/source-connectors test -- --test-name-pattern "market names"
```

Expected: PASS.

### Task 2: Usar taxonomia en ApiFootballHttpClient

**Objective:** reemplazar `toMarketKey` local por la taxonomia canonica.

**Files:**
- Modify: `packages/source-connectors/src/clients/api-football.ts`
- Test: `packages/source-connectors/tests/api-football-http.test.ts`

**Step 1: Write failing test**

Agregar fixture mock con bets `Goals Over/Under`, `Both Teams Score`, `Double Chance` y confirmar marketKeys canonicos.

**Step 2: Run targeted test**

```bash
pnpm --filter @gana-v8/source-connectors test -- --test-name-pattern "canonical market"
```

Expected: FAIL si todavia devuelve slugs genericos.

**Step 3: Implement**

Importar `normalizeProviderMarketKey` en `api-football.ts` y reemplazar el cuerpo de `toMarketKey(bet)` por:

```ts
const toMarketKey = (bet: ApiFootballBetResponse): string =>
  normalizeProviderMarketKey({ id: bet.id, name: bet.name });
```

**Step 4: Verify**

```bash
pnpm --filter @gana-v8/source-connectors test
```

Expected: PASS.

### Task 3: Normalizar selections por mercado

**Objective:** hacer que selections de BTTS y doble oportunidad queden estables.

**Files:**
- Modify: `packages/source-connectors/src/clients/api-football.ts`
- Test: `packages/source-connectors/tests/api-football-http.test.ts`

**Implementation guidance:** cambiar `toSelectionKey(value, home, away)` para recibir `marketKey`:

```ts
const toSelectionKey = (
  value: string | undefined,
  homeTeamName: string,
  awayTeamName: string,
  marketKey = 'h2h',
): string => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'unknown';

  if (marketKey === 'both-teams-score') {
    if (['yes', 'y', 'si', 'sí'].includes(normalized)) return 'yes';
    if (['no', 'n'].includes(normalized)) return 'no';
  }

  if (marketKey === 'double-chance') {
    if (['home/draw', '1x', 'home or draw'].includes(normalized)) return 'home-draw';
    if (['home/away', '12', 'home or away'].includes(normalized)) return 'home-away';
    if (['draw/away', 'x2', 'draw or away'].includes(normalized)) return 'draw-away';
  }

  if (marketKey === 'totals-goals' || marketKey === 'corners-total') {
    if (normalized.startsWith('over')) return 'over';
    if (normalized.startsWith('under')) return 'under';
  }

  // existing h2h behavior remains here
};
```

**Verification:** test values like `Over 2.5`, `Under 2.5`, `Yes`, `No`, `1X`, `12`, `X2`.

### Task 4: Agregar defaults multi-mercado opt-in al runner top leagues

**Objective:** permitir activar varios mercados sin cambiar codigo cada vez.

**Files:**
- Modify: `scripts/run-live-ingestion-top-leagues.mjs`
- Modify: `scripts/run-live-ingestion.mjs` si el parser no soporta CSV robusto
- Test: si hay tests de scripts, agregarlos; si no, validar con `node --check`

**Implementation guidance:** mantener h2h default, agregar helper:

```js
const parseMarketKeys = () =>
  (process.env.GANA_FOOTBALL_MARKET_KEYS ?? 'h2h')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
```

**Verification:**

```bash
node --check scripts/run-live-ingestion-top-leagues.mjs
GANA_FOOTBALL_MARKET_KEYS=h2h,totals-goals,both-teams-score,double-chance node scripts/run-live-ingestion-top-leagues.mjs odds
```

Expected: runner manifest muestra esos `marketKeys`.

### Task 5: Actualizar coverage seed para mercados base

**Objective:** que ligas top permitan mercados nuevos.

**Files:**
- Modify: `scripts/seed-top-league-coverage.mjs`
- Modify: `scripts/top-football-leagues.mjs`

**Implementation guidance:** definir mercados base:

```js
export const TOP_FOOTBALL_BASE_MARKETS = [
  'h2h',
  'totals-goals',
  'both-teams-score',
  'double-chance',
];

export const TOP_FOOTBALL_EXPERIMENTAL_MARKETS = ['corners-total'];
```

Usar base por default y permitir corners con `GANA_ENABLE_CORNERS_MARKETS=1`.

**Verification:**

```bash
node --check scripts/top-football-leagues.mjs
node --check scripts/seed-top-league-coverage.mjs
node scripts/seed-top-league-coverage.mjs
```

Expected: policies actualizadas sin imprimir secretos.

### Task 6: Crear diagnostico de disponibilidad de mercados

**Objective:** tener evidencia rapida de que provider/DB trae cada mercado esperado.

**Files:**
- Create: `scripts/report-fixture-market-availability.mjs`

**Output esperado:** JSON con `fixtureId`, `match`, `expectedMarkets`, `availableMarkets`, `missingMarkets`.

**Verification:**

```bash
node scripts/report-fixture-market-availability.mjs --fixture-ids 1388584,1378200
```

Expected: imprime disponibilidad sin connection strings ni secrets.

## Criterio de done

- `source-connectors` normaliza a claves canonicas para h2h, totals-goals, both-teams-score, double-chance y corners-total.
- La ingesta live puede persistir odds multi-mercado para fixtures concretas.
- Coverage policies de ligas top soportan mercados base.
- Existe un reporte de disponibilidad que muestra que mercados existen/faltan por fixture.
- `pnpm --filter @gana-v8/source-connectors test` pasa.
- `pnpm --filter @gana-v8/ingestion-worker test` pasa.
- `node --check` pasa para scripts tocados.
- Harness smoke pasa despues de cambios: `pnpm harness:validate -- --worktree-id multi-market-ingestion --base-port 4500 --level smoke`.

## Fuentes consolidadas

- Estado real observado: DB actual de fixtures top leagues solo tenia `OddsSnapshot.marketKey = 'h2h'`.
- Codigo actual: `packages/source-connectors/src/clients/api-football.ts`, `apps/ingestion-worker/src/index.ts`, `scripts/run-live-ingestion.mjs`, `scripts/run-live-ingestion-top-leagues.mjs`, `scripts/seed-top-league-coverage.mjs`.
- Plan dependiente: `docs/plans/falta/gana-v8-multi-market-scoring-publishing-validation.md`.
