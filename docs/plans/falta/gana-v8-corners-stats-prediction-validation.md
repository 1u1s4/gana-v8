# Plan de corners: stats, prediccion y validacion - gana-v8

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan despues de cerrar ingestion/scoring multi-mercado base. No mezclar corners con BTTS/totals/double chance en el mismo PR.

**Goal:** permitir que el harness prediga y liquide mercados de tiros de esquina usando odds de corners y estadisticas finales de corners.

**Architecture:** corners no puede liquidarse con `Fixture.score`, asi que requiere un feed estadistico adicional. El plan agrega ingestion canonica de fixture statistics, persiste estadisticas por fixture/equipo, conecta odds de corners a scoring y extiende validation para liquidar over/under o h2h de corners.

**Tech Stack:** TypeScript, pnpm, Prisma/MySQL, API-Football fixture statistics, source-connectors, ingestion-worker, scoring-worker, validation-worker.

---

## Estado actual confirmado

- `Fixture.score` solo cubre goles home/away.
- No existe modelo Prisma dedicado para estadisticas finales de partido/corners.
- `source-connectors` declara dominios `fixtures | odds | availability | lineups`; no incluye `statistics`.
- `validation-worker` liquida solo moneyline desde score, y aun despues del plan multi-mercado base solo podria liquidar mercados derivados de goles.
- Odds de corners pueden persistirse como `OddsSnapshot` si el provider las devuelve, pero eso no alcanza para saber si ganaron.

## Ya cubierto

- `OddsSnapshot.marketKey` puede guardar `corners-total` o `corners-h2h` una vez que taxonomy los normalice.
- `RawIngestionBatch` puede usarse como patron para un nuevo endpoint family.
- `Fixture` ya tiene relacion con odds y status completed.
- `validation-worker` ya tiene patron para settlement de predictions/parlays.

## Faltantes exclusivos

### 1. Ingestion de fixture statistics

Agregar dominio `statistics` al source connector y al ingestion worker.

API-Football endpoint esperado:

- `/fixtures/statistics?fixture=<providerFixtureId>`

Campos a extraer:

- team home/away o team id/name
- statistic type `Corner Kicks` o equivalente
- value numerico
- raw payload completo para auditoria

### 2. Modelo persistido de estadisticas

Crear tabla dedicada para estadisticas por fixture:

- `FixtureStatisticSnapshot`
- `fixtureId`
- `providerFixtureId`
- `providerCode`
- `capturedAt`
- `statKey` ejemplo `corners`
- `scope` ejemplo `home`, `away`, `match`
- `valueNumeric`
- `payload`
- `batchId`

### 3. Normalizacion de corners finales

Derivar:

- `homeCorners`
- `awayCorners`
- `totalCorners`
- `cornersH2hOutcome`: `home`, `away`, `draw`
- `cornersTotalOutcome(line)`: `over`/`under`

### 4. Scoring corners

Predicciones iniciales:

- `corners-total` over/under, usando odds y linea
- opcional `corners-h2h` home/away/draw si provider lo trae

### 5. Validation corners

No liquidar corners si falta statistic snapshot final.

Estados esperados:

- `settled` si fixture completed + stats corners disponibles
- `skipped` con reason claro si fixture completed pero corners missing
- `pending` si fixture aun scheduled/live

## Interfaces/contratos afectados

- `packages/source-connectors/src/models/raw.ts`
- `packages/source-connectors/src/clients/api-football.ts`
- `packages/source-connectors/src/clients/football-api.ts`
- `packages/source-connectors/src/jobs/ingest-statistics-window.ts` nuevo
- `apps/ingestion-worker/src/index.ts`
- `apps/ingestion-worker/tests/runtime.test.ts`
- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_add_fixture_statistic_snapshots/migration.sql`
- `packages/storage-adapters/src/*`
- `apps/scoring-worker/src/index.ts`
- `apps/validation-worker/src/index.ts`
- `apps/public-api/src/index.ts`
- `apps/operator-console/src/index.ts`
- `scripts/run-live-ingestion.mjs`

## Dependencias

- Depende de `docs/plans/completado/gana-v8-multi-market-odds-taxonomy-ingestion.md` para odds de corners.
- Depende parcialmente de `docs/plans/falta/gana-v8-multi-market-scoring-publishing-validation.md` para publisher multi-mercado.
- Requiere confirmar que el plan/API-Football contratado expone `/fixtures/statistics` para fixtures de las ligas objetivo.
- No debe bloquear los mercados basados en goles si el provider no trae corners.

## Tareas de implementacion

### Task 1: Agregar tipos raw para fixture statistics

**Objective:** modelar estadisticas raw sin tocar DB aun.

**Files:**
- Modify: `packages/source-connectors/src/models/raw.ts`
- Test: `packages/source-connectors/tests/api-football-http.test.ts`

**Implementation sketch:**

```ts
export type SourceDomain = 'fixtures' | 'odds' | 'availability' | 'lineups' | 'statistics';

export interface RawFixtureStatisticRecord {
  readonly recordType: 'fixture-statistic';
  readonly providerFixtureId: string;
  readonly providerCode: string;
  readonly statKey: string;
  readonly scope: 'home' | 'away' | 'match';
  readonly valueNumeric?: number;
  readonly payload: Record<string, unknown>;
  readonly sourceUpdatedAt?: string;
}

export interface FetchFixtureStatisticsInput {
  readonly fixtureIds: readonly string[];
  readonly window: SourceCoverageWindow;
}
```

**Verification:**

```bash
pnpm --filter @gana-v8/source-connectors test -- --test-name-pattern "statistics"
```

Expected initially FAIL then PASS.

### Task 2: API-Football client fetches fixture statistics

**Objective:** llamar `/fixtures/statistics` y normalizar corners.

**Files:**
- Modify: `packages/source-connectors/src/clients/api-football.ts`
- Modify: `packages/source-connectors/src/clients/football-api.ts`
- Test: `packages/source-connectors/tests/api-football-http.test.ts`

**Implementation guidance:** agregar metodo:

```ts
fetchFixtureStatistics(input: FetchFixtureStatisticsInput): Promise<readonly RawFixtureStatisticRecord[]>;
```

Normalizar `Corner Kicks`:

```ts
const normalizeStatisticKey = (type: string | undefined): string => {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (normalized === 'corner kicks' || normalized.includes('corner')) return 'corners';
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
};
```

**Verification:** mock response con home corners 6 y away corners 3 produce dos records `statKey='corners'`.

### Task 3: Persistir FixtureStatisticSnapshot

**Objective:** crear schema y storage para estadisticas.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_fixture_statistic_snapshots/migration.sql`
- Modify: `packages/storage-adapters/src/prisma/*`
- Tests: `packages/storage-adapters/tests/*.test.ts`

**Schema propuesta:**

```prisma
model FixtureStatisticSnapshot {
  id                String            @id
  batchId           String
  batch             RawIngestionBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  fixtureId         String?
  fixture           Fixture?          @relation(fields: [fixtureId], references: [id], onDelete: SetNull)
  providerFixtureId String
  providerCode      String
  statKey           String
  scope             String
  valueNumeric      Float?
  capturedAt        DateTime
  payload           Json
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@unique([batchId, providerFixtureId, statKey, scope])
  @@index([fixtureId, statKey, capturedAt])
}
```

**Verification:**

```bash
pnpm prisma validate --schema prisma/schema.prisma
pnpm --filter @gana-v8/storage-adapters test
```

### Task 4: Ingestion-worker soporta modo statistics

**Objective:** correr ingestion de stats como task persistida.

**Files:**
- Modify: `apps/ingestion-worker/src/index.ts`
- Test: `apps/ingestion-worker/tests/runtime.test.ts`

**Implementation guidance:** seguir patron `fixtures` y `odds`:

- intent: `ingest-fixture-statistics`
- taskKind: si enum no soporta, agregar `fixture_statistics_ingestion` o mapear cuidadosamente
- endpointFamily: `statistics`
- output counters: `observedRecords`, `upsertedStatisticSnapshots`

**Verification:**

```bash
pnpm --filter @gana-v8/ingestion-worker test -- --test-name-pattern "statistics"
```

### Task 5: Runner CLI para stats

**Objective:** permitir `node scripts/run-live-ingestion.mjs statistics`.

**Files:**
- Modify: `scripts/run-live-ingestion.mjs`
- Modify: `scripts/run-live-ingestion-top-leagues.mjs` opcional

**Verification:**

```bash
node --check scripts/run-live-ingestion.mjs
GANA_LIVE_STATISTICS_FIXTURE_IDS=1388584 node scripts/run-live-ingestion.mjs statistics
```

Expected: JSON final con endpointFamily `statistics`, sin imprimir secrets.

### Task 6: Helpers de settlement de corners

**Objective:** calcular outcomes de corners desde statistic snapshots.

**Files:**
- Modify: `apps/validation-worker/src/index.ts`
- Test: `apps/validation-worker/tests/runtime.test.ts`

**Implementation sketch:**

```ts
export interface CornerStatisticsSummary {
  readonly homeCorners: number;
  readonly awayCorners: number;
  readonly totalCorners: number;
}

export const deriveCornerStatisticsSummary = (records: readonly FixtureStatisticSnapshotLike[]): CornerStatisticsSummary | null => {
  const home = records.find((record) => record.statKey === 'corners' && record.scope === 'home')?.valueNumeric;
  const away = records.find((record) => record.statKey === 'corners' && record.scope === 'away')?.valueNumeric;
  if (home === undefined || away === undefined) return null;
  return { homeCorners: home, awayCorners: away, totalCorners: home + away };
};
```

### Task 7: Validation liquida corners-total y corners-h2h

**Objective:** cerrar settlement real de corners.

**Files:**
- Modify: `apps/validation-worker/src/index.ts`
- Test: `apps/validation-worker/tests/runtime.test.ts`

**Rules:**

- `corners-total:over` gana si `totalCorners > line`
- `corners-total:under` gana si `totalCorners < line`
- si `totalCorners === line`, void o push segun policy inicial; documentar decision
- `corners-h2h:home` gana si homeCorners > awayCorners
- `corners-h2h:away` gana si awayCorners > homeCorners
- `corners-h2h:draw` gana si son iguales

**Important:** line debe estar estructurada. Si no existe, skip con reason `Corner total line is missing.`

### Task 8: Scoring corners como experimental

**Objective:** generar predictions de corners solo si hay odds y feature flag.

**Files:**
- Modify: `apps/scoring-worker/src/index.ts`
- Test: `apps/scoring-worker/tests/runtime.test.ts`

**Feature flag:**

```env
GANA_ENABLE_CORNERS_MARKETS=1
```

**Policy inicial:** no publicar corners por default en parlays hasta tener validation real probada.

### Task 9: Public API/operator-console muestran coverage de stats

**Objective:** que el operador vea si hay stats de corners para liquidar.

**Files:**
- Modify: `apps/public-api/src/index.ts`
- Modify: `apps/operator-console/src/index.ts`
- Tests: public-api/operator-console

**Read model sugerido:**

```ts
fixtureOps.statistics = {
  corners: {
    status: 'available' | 'missing' | 'pending',
    homeCorners?: number,
    awayCorners?: number,
    totalCorners?: number,
    capturedAt?: string,
  }
}
```

## Criterio de done

- API-Football statistics se ingiere para fixtures concretas.
- DB persiste corners home/away con batch y payload raw auditable.
- Scoring puede generar corners predictions con feature flag.
- Validation liquida corners cuando fixture completed + stats disponibles.
- Si faltan stats, validation deja skip/pending legible, no falla silenciosamente.
- Public API/operator-console muestran si corners stats estan disponibles.
- Tests pasan en source-connectors, ingestion-worker, storage-adapters, scoring-worker, validation-worker, public-api y operator-console.
- Harness smoke pasa despues de cambios.

## Fuentes consolidadas

- Codigo actual: `Fixture.score` solo cubre goles, no corners.
- Codigo actual: `source-connectors` no tiene dominio `statistics`.
- Codigo actual: `validation-worker` no liquida mercados no-moneyline.
- Plan previo requerido: `docs/plans/completado/gana-v8-multi-market-odds-taxonomy-ingestion.md`.
- Plan relacionado: `docs/plans/falta/gana-v8-multi-market-scoring-publishing-validation.md`.
