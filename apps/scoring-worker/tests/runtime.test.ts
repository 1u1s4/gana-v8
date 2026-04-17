import assert from "node:assert/strict";
import test from "node:test";

import { createFixture, createTask, type FixtureEntity } from "@gana-v8/domain-core";
import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  applyFeatureSnapshotToFixture,
} from "@gana-v8/feature-store";

import {
  buildResearchDossierFromFixture,
  describeWorkspace,
  loadEligibleFixturesForScoring,
  runScoringWorker,
  scoreFixturePrediction,
} from "../src/index.js";

interface FakeSelection {
  readonly selectionKey: string;
  readonly priceDecimal: number;
}

interface FakeOddsSnapshot {
  readonly id: string;
  readonly fixtureId?: string | null;
  readonly providerFixtureId: string;
  readonly marketKey: string;
  readonly bookmakerKey: string;
  readonly capturedAt: Date;
  readonly selections: readonly FakeSelection[];
}

const fixture = (overrides: Partial<FixtureEntity> = {}): FixtureEntity =>
  createFixture({
    id: "fx-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Chelsea",
    awayTeam: "Arsenal",
    scheduledAt: "2026-04-15T19:00:00.000Z",
    status: "scheduled",
    metadata: {
      providerFixtureId: "provider-1",
      providerCode: "api-football",
    },
    ...overrides,
  });

const snapshot = (overrides: Partial<FakeOddsSnapshot> = {}): FakeOddsSnapshot => ({
  id: "odds-1",
  fixtureId: "fx-1",
  providerFixtureId: "provider-1",
  marketKey: "h2h",
  bookmakerKey: "bet365",
  capturedAt: new Date("2026-04-15T12:00:00.000Z"),
  selections: [
    { selectionKey: "home", priceDecimal: 1.8 },
    { selectionKey: "draw", priceDecimal: 3.6 },
    { selectionKey: "away", priceDecimal: 4.8 },
  ],
  ...overrides,
});

const createFakeClient = (fixtures: readonly FixtureEntity[], snapshots: readonly FakeOddsSnapshot[]) => ({
  fixture: {
    async findMany({ where }: { where?: { status?: string } } = {}) {
      return fixtures
        .filter((item) => (where?.status ? item.status === where.status : true))
        .map((item) => ({ ...item }));
    },
    async findUnique({ where }: { where: { id: string } }) {
      return fixtures.find((item) => item.id === where.id) ?? null;
    },
  },
  oddsSnapshot: {
    async findFirst({ where }: { where: { marketKey: string; OR: Array<Record<string, unknown>> } }) {
      const matches = snapshots.filter((item) => {
        if (item.marketKey !== where.marketKey) {
          return false;
        }

        return where.OR.some((condition) => {
          if (condition.fixtureId) {
            return item.fixtureId === condition.fixtureId;
          }

          if (condition.providerFixtureId) {
            return item.providerFixtureId === condition.providerFixtureId;
          }

          return false;
        });
      });

      return [...matches].sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0] ?? null;
    },
  },
});

test("buildResearchDossierFromFixture derives deterministic implied probabilities and lean", () => {
  const dossier = buildResearchDossierFromFixture(fixture(), snapshot(), {
    generatedAt: "2026-04-15T12:05:00.000Z",
  });

  assert.equal(dossier.fixtureId, "fx-1");
  assert.equal(dossier.generatedAt, "2026-04-15T12:05:00.000Z");
  assert.equal(dossier.recommendedLean, "home");
  assert.equal(dossier.evidence.length, 3);
  assert.match(dossier.summary, /Chelsea vs Arsenal/);
  assert.equal(dossier.directionalScore.home > dossier.directionalScore.away, true);
});

test("buildResearchDossierFromFixture incorporates ready research metadata into the dossier", () => {
  const enrichedFixture = applyFeatureSnapshotToFixture(
    fixture(),
    {
      fixtureId: "fx-1",
      generatedAt: "2026-04-15T11:55:00.000Z",
      recommendedLean: "away",
      evidenceCount: 4,
      topEvidence: [
        {
          id: "injuries-away",
          title: "Away side returns two starters",
          direction: "away",
          weightedScore: 0.91,
        },
      ],
      risks: ["late lineup variance"],
      features: {
        researchScoreHome: 0.18,
        researchScoreDraw: 0.22,
        researchScoreAway: 0.81,
        formHome: 0.44,
        formAway: 0.71,
        restHomeDays: 4,
        restAwayDays: 6,
        injuriesHome: 2,
        injuriesAway: 0,
        derby: 0,
        hoursUntilKickoff: 7,
      },
      readiness: {
        status: "ready",
        reasons: [],
      },
    },
  );

  const dossier = buildResearchDossierFromFixture(enrichedFixture, snapshot(), {
    generatedAt: "2026-04-15T12:05:00.000Z",
  });

  assert.equal(dossier.recommendedLean, "away");
  assert.match(dossier.summary, /Research snapshot leans away/);
  assert.equal(dossier.evidence.some((item) => item.id === "research:fx-1"), true);
});

test("loadEligibleFixturesForScoring returns latest h2h context and skip reasons", async () => {
  const scheduledFixture = fixture();
  const skippedFixture = fixture({
    id: "fx-2",
    homeTeam: "Inter",
    awayTeam: "Milan",
    metadata: { providerFixtureId: "provider-2", providerCode: "api-football" },
  });
  const client = createFakeClient(
    [scheduledFixture, skippedFixture],
    [
      snapshot({ id: "old", capturedAt: new Date("2026-04-15T10:00:00.000Z") }),
      snapshot({ id: "new", capturedAt: new Date("2026-04-15T12:00:00.000Z") }),
    ],
  );

  const result = await loadEligibleFixturesForScoring(undefined, { client: client as never });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.fixture.id, "fx-1");
  assert.equal(result[0]?.eligible, true);
  assert.equal(result[0]?.latestOddsSnapshot?.id, "new");
  assert.equal(result[1]?.fixture.id, "fx-2");
  assert.equal(result[1]?.eligible, false);
  assert.match(result[1]?.reason ?? "", /No latest h2h odds snapshot/);
});

test("scoreFixturePrediction persists completed AiRun and published prediction for eligible fixtures", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const baseFixture = fixture();
  const task = createTask({
    id: "task-score-1",
    kind: "prediction",
    status: "queued",
    priority: 10,
    payload: { fixtureId: baseFixture.id },
    scheduledFor: "2026-04-15T12:00:00.000Z",
  });

  await unitOfWork.fixtures.save(baseFixture);
  await unitOfWork.tasks.save(task);

  const result = await scoreFixturePrediction(undefined, baseFixture.id, task.id, {
    client: createFakeClient([baseFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:05:00.000Z",
    unitOfWork,
  });

  const aiRuns = await unitOfWork.aiRuns.list();
  const predictions = await unitOfWork.predictions.list();

  assert.equal(result.status, "scored");
  assert.equal(result.prediction?.status, "published");
  assert.equal(aiRuns.length, 1);
  assert.equal(aiRuns[0]?.status, "completed");
  assert.equal(predictions.length, 1);
  assert.equal(predictions[0]?.fixtureId, baseFixture.id);
  assert.equal(predictions[0]?.aiRunId, aiRuns[0]?.id);
});

test("runScoringWorker reports skips without breaking the batch", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const eligibleFixture = fixture();
  const skippedFixture = fixture({
    id: "fx-2",
    homeTeam: "Roma",
    awayTeam: "Lazio",
    metadata: { providerFixtureId: "provider-2", providerCode: "api-football" },
  });

  await unitOfWork.fixtures.save(eligibleFixture);
  await unitOfWork.fixtures.save(skippedFixture);

  const summary = await runScoringWorker(undefined, {
    client: createFakeClient([eligibleFixture, skippedFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:05:00.000Z",
    unitOfWork,
  });

  assert.match(describeWorkspace(), /scoring-worker/);
  assert.equal(summary.totalFixtures, 2);
  assert.equal(summary.scoredCount, 1);
  assert.equal(summary.skippedCount, 1);
  assert.match(summary.results.find((item) => item.fixtureId === "fx-2")?.reason ?? "", /No latest h2h odds snapshot/);
});
