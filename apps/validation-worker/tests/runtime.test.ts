import assert from "node:assert/strict";
import test from "node:test";

import {
  createFixture,
  createPrediction,
  publishPrediction,
  type FixtureEntity,
  type PredictionEntity,
} from "@gana-v8/domain-core";
import { buildParlayFromCandidates } from "@gana-v8/parlay-engine";
import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  deriveBttsOutcomeFromFixture,
  deriveAwayCornersFromStatisticSnapshot,
  deriveDoubleChanceOutcomesFromFixture,
  deriveHomeCornersFromStatisticSnapshot,
  deriveMoneylineOutcomeFromFixture,
  deriveTotalCornersFromStatisticSnapshot,
  deriveTotalsOutcomeFromFixture,
  describeWorkspace,
  runValidationWorker,
} from "../src/index.js";

interface FixtureStatisticSnapshotLike {
  readonly id: string;
  readonly fixtureId: string;
  readonly capturedAt: string;
  readonly statistics?: unknown;
  readonly payload?: unknown;
}

const fixture = (overrides: Partial<FixtureEntity> = {}): FixtureEntity =>
  createFixture({
    id: "fx-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Chelsea",
    awayTeam: "Arsenal",
    scheduledAt: "2026-04-16T19:00:00.000Z",
    status: "completed",
    score: { home: 2, away: 1 },
    metadata: {},
    ...overrides,
  });

const fixtureWithoutScore = (overrides: Partial<FixtureEntity> = {}): FixtureEntity =>
  createFixture({
    id: "fx-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Chelsea",
    awayTeam: "Arsenal",
    scheduledAt: "2026-04-16T19:00:00.000Z",
    status: "completed",
    metadata: {},
    ...overrides,
  });

const prediction = (overrides: Partial<PredictionEntity> = {}): PredictionEntity =>
  publishPrediction(
    createPrediction({
      id: "pred-1",
      fixtureId: "fx-1",
      market: "moneyline",
      outcome: "home",
      status: "draft",
      confidence: 0.68,
      probabilities: { implied: 0.5, model: 0.6, edge: 0.1 },
      rationale: ["Home edge"],
      ...overrides,
    }),
    overrides.publishedAt ?? "2026-04-16T12:00:00.000Z",
  );

const withFixtureStatisticSnapshots = (
  unitOfWork: ReturnType<typeof createInMemoryUnitOfWork>,
  snapshots: readonly FixtureStatisticSnapshotLike[],
): ReturnType<typeof createInMemoryUnitOfWork> =>
  Object.assign(unitOfWork, {
    fixtureStatisticSnapshots: {
      async list() {
        return [...snapshots];
      },
      async findByFixtureId(fixtureId: string) {
        return snapshots.filter((snapshot) => snapshot.fixtureId === fixtureId);
      },
    },
  });

test("deriveMoneylineOutcomeFromFixture returns match result for completed fixtures with score", () => {
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ score: { home: 3, away: 0 } })), "home");
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ score: { home: 1, away: 1 } })), "draw");
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ score: { home: 0, away: 2 } })), "away");
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ status: "live" })), null);
  assert.equal(deriveMoneylineOutcomeFromFixture(fixtureWithoutScore()), null);
});

test("score-derived outcome helpers resolve completed fixture scores", () => {
  assert.equal(deriveTotalsOutcomeFromFixture(fixture({ score: { home: 2, away: 1 } }), 2.5), "over");
  assert.equal(deriveTotalsOutcomeFromFixture(fixture({ score: { home: 1, away: 1 } }), 2.5), "under");
  assert.equal(deriveBttsOutcomeFromFixture(fixture({ score: { home: 2, away: 1 } })), "yes");
  assert.equal(deriveBttsOutcomeFromFixture(fixture({ score: { home: 2, away: 0 } })), "no");
  assert.deepEqual(
    deriveDoubleChanceOutcomesFromFixture(fixture({ score: { home: 2, away: 1 } })),
    ["home-draw", "home-away"],
  );
  assert.deepEqual(
    deriveDoubleChanceOutcomesFromFixture(fixture({ score: { home: 1, away: 1 } })),
    ["home-draw", "draw-away"],
  );
  assert.deepEqual(
    deriveDoubleChanceOutcomesFromFixture(fixture({ score: { home: 0, away: 2 } })),
    ["home-away", "draw-away"],
  );
});

test("corner statistic helpers derive home, away, and total corners from snapshots", () => {
  const directSnapshot = {
    id: "stats-1",
    fixtureId: "fx-1",
    capturedAt: "2026-04-16T21:00:00.000Z",
    statistics: {
      home: { corners: "5" },
      away: { cornerKicks: 7 },
    },
  };
  const providerPayloadSnapshot = {
    id: "stats-2",
    fixtureId: "fx-1",
    capturedAt: "2026-04-16T21:05:00.000Z",
    payload: {
      response: [
        { statistics: [{ type: "Corner Kicks", value: "4" }] },
        { statistics: [{ type: "Corner Kicks", value: 3 }] },
      ],
    },
  };

  assert.equal(deriveHomeCornersFromStatisticSnapshot(directSnapshot), 5);
  assert.equal(deriveAwayCornersFromStatisticSnapshot(directSnapshot), 7);
  assert.equal(deriveTotalCornersFromStatisticSnapshot(directSnapshot), 12);
  assert.equal(deriveHomeCornersFromStatisticSnapshot(providerPayloadSnapshot), 4);
  assert.equal(deriveAwayCornersFromStatisticSnapshot(providerPayloadSnapshot), 3);
  assert.equal(deriveTotalCornersFromStatisticSnapshot(providerPayloadSnapshot), 7);
});

test("runValidationWorker settles published moneyline predictions and persists prediction validations", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const completedFixture = fixture();
  const publishedPrediction = prediction();

  await unitOfWork.fixtures.save(completedFixture);
  await unitOfWork.predictions.save(publishedPrediction);

  const result = await runValidationWorker(undefined, {
    executedAt: "2026-04-16T21:30:00.000Z",
    unitOfWork,
  });

  const settledPrediction = await unitOfWork.predictions.getById(publishedPrediction.id);
  const validations = await unitOfWork.validations.findByTargetId(publishedPrediction.id);
  const workflow = await unitOfWork.fixtureWorkflows.findByFixtureId(completedFixture.id);

  assert.match(describeWorkspace(), /validation-worker/);
  assert.equal(result.settledPredictionCount, 1);
  assert.equal(result.skippedPredictionCount, 0);
  assert.equal(result.predictionResults[0]?.verdict, "won");
  assert.equal(settledPrediction?.status, "settled");
  assert.equal(settledPrediction?.settledAt, "2026-04-16T21:30:00.000Z");
  assert.equal(validations.length, 1);
  assert.equal(validations[0]?.targetType, "prediction");
  assert.equal(validations[0]?.kind, "prediction-settlement");
  assert.equal(validations[0]?.status, "passed");
  assert.equal(workflow?.validationStatus, "succeeded");
});

test("runValidationWorker settles submitted parlays whose legs are all settled and persists parlay validations", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixtureOne = fixture({ id: "fx-1", score: { home: 2, away: 1 } });
  const fixtureTwo = fixture({ id: "fx-2", homeTeam: "Inter", awayTeam: "Milan", score: { home: 0, away: 1 } });
  const predictionOne = prediction({ id: "pred-1", fixtureId: fixtureOne.id, outcome: "home" });
  const predictionTwo = prediction({ id: "pred-2", fixtureId: fixtureTwo.id, outcome: "away" });
  const parlay = {
    ...buildParlayFromCandidates({
      id: "parlay-1",
      stake: 10,
      source: "automatic",
      candidates: [
        {
          predictionId: predictionOne.id,
          fixtureId: fixtureOne.id,
          market: predictionOne.market,
          outcome: predictionOne.outcome,
          price: 1.8,
          confidence: predictionOne.confidence,
          modelProbability: predictionOne.probabilities.model,
        },
        {
          predictionId: predictionTwo.id,
          fixtureId: fixtureTwo.id,
          market: predictionTwo.market,
          outcome: predictionTwo.outcome,
          price: 2.1,
          confidence: predictionTwo.confidence,
          modelProbability: predictionTwo.probabilities.model,
        },
      ],
    }).parlay,
    status: "submitted" as const,
  };

  await unitOfWork.fixtures.save(fixtureOne);
  await unitOfWork.fixtures.save(fixtureTwo);
  await unitOfWork.predictions.save(predictionOne);
  await unitOfWork.predictions.save(predictionTwo);
  await unitOfWork.parlays.save(parlay);

  const result = await runValidationWorker(undefined, {
    executedAt: "2026-04-16T22:00:00.000Z",
    unitOfWork,
  });

  const settledParlay = await unitOfWork.parlays.getById(parlay.id);
  const parlayValidations = await unitOfWork.validations.findByTargetId(parlay.id);

  assert.equal(result.settledPredictionCount, 2);
  assert.equal(result.settledParlayCount, 1);
  assert.equal(result.parlayResults[0]?.verdict, "won");
  assert.equal(settledParlay?.status, "settled");
  assert.equal(settledParlay?.settledAt, "2026-04-16T22:00:00.000Z");
  assert.equal(settledParlay?.legs.every((leg) => leg.status === "won"), true);
  assert.equal(parlayValidations.length, 1);
  assert.equal(parlayValidations[0]?.targetType, "parlay");
  assert.equal(parlayValidations[0]?.kind, "parlay-settlement");
  assert.equal(parlayValidations[0]?.status, "passed");
});

test("runValidationWorker settles score-derived predictions from final score", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const totalsFixture = fixture({ id: "fx-totals", score: { home: 2, away: 1 } });
  const bttsFixture = fixture({ id: "fx-btts", score: { home: 2, away: 0 } });
  const doubleChanceFixture = fixture({ id: "fx-double-chance", score: { home: 1, away: 1 } });
  const totalsPrediction = prediction({
    id: "pred-totals",
    fixtureId: totalsFixture.id,
    market: "totals",
    outcome: "over",
    probabilities: { implied: 0.5, model: 0.6, edge: 0.1, line: 2.5 },
  });
  const bttsPrediction = prediction({
    id: "pred-btts",
    fixtureId: bttsFixture.id,
    market: "both-teams-score",
    outcome: "no",
  });
  const doubleChancePrediction = prediction({
    id: "pred-double-chance",
    fixtureId: doubleChanceFixture.id,
    market: "double-chance",
    outcome: "home-draw",
  });

  await unitOfWork.fixtures.save(totalsFixture);
  await unitOfWork.fixtures.save(bttsFixture);
  await unitOfWork.fixtures.save(doubleChanceFixture);
  await unitOfWork.predictions.save(totalsPrediction);
  await unitOfWork.predictions.save(bttsPrediction);
  await unitOfWork.predictions.save(doubleChancePrediction);

  const result = await runValidationWorker(undefined, {
    executedAt: "2026-04-16T22:30:00.000Z",
    unitOfWork,
  });

  assert.equal(result.settledPredictionCount, 3);
  assert.equal(result.skippedPredictionCount, 0);
  assert.equal(result.predictionResults.every((item) => item.verdict === "won"), true);
  assert.equal((await unitOfWork.validations.list()).length, 3);
});

test("runValidationWorker settles corners-total and corners-h2h from fixture statistic snapshots", async () => {
  const unitOfWork = withFixtureStatisticSnapshots(createInMemoryUnitOfWork(), [
    {
      id: "stats-1",
      fixtureId: "fx-corners",
      capturedAt: "2026-04-16T21:10:00.000Z",
      statistics: {
        home: { corners: 4 },
        away: { corners: 7 },
      },
    },
  ]);
  const cornersFixture = fixtureWithoutScore({ id: "fx-corners" });
  const cornersTotalPrediction = prediction({
    id: "pred-corners-total",
    fixtureId: cornersFixture.id,
    market: "corners-total" as unknown as PredictionEntity["market"],
    outcome: "over",
    probabilities: { implied: 0.52, model: 0.57, edge: 0.05, line: 10.5 },
  });
  const cornersH2hPrediction = prediction({
    id: "pred-corners-h2h",
    fixtureId: cornersFixture.id,
    market: "corners-h2h" as unknown as PredictionEntity["market"],
    outcome: "away",
    probabilities: { implied: 0.48, model: 0.54, edge: 0.06 },
  });

  await unitOfWork.fixtures.save(cornersFixture);
  await unitOfWork.predictions.save(cornersTotalPrediction);
  await unitOfWork.predictions.save(cornersH2hPrediction);

  const result = await runValidationWorker(undefined, {
    executedAt: "2026-04-16T22:30:00.000Z",
    unitOfWork,
  });

  assert.equal(result.settledPredictionCount, 2);
  assert.equal(result.skippedPredictionCount, 0);
  assert.equal(result.predictionResults.every((item) => item.verdict === "won"), true);
  assert.equal((await unitOfWork.predictions.getById(cornersTotalPrediction.id))?.status, "settled");
  assert.equal((await unitOfWork.predictions.getById(cornersH2hPrediction.id))?.status, "settled");
});

test("runValidationWorker voids pushed corners-total and skips corners predictions without stats", async () => {
  const unitOfWork = withFixtureStatisticSnapshots(createInMemoryUnitOfWork(), [
    {
      id: "stats-1",
      fixtureId: "fx-push",
      capturedAt: "2026-04-16T21:10:00.000Z",
      statistics: {
        home: { corners: 5 },
        away: { corners: 5 },
      },
    },
  ]);
  const pushFixture = fixtureWithoutScore({ id: "fx-push" });
  const missingStatsFixture = fixtureWithoutScore({ id: "fx-missing-stats" });
  const pushPrediction = prediction({
    id: "pred-corners-push",
    fixtureId: pushFixture.id,
    market: "corners-total" as unknown as PredictionEntity["market"],
    outcome: "over",
    probabilities: { implied: 0.5, model: 0.55, edge: 0.05, line: 10 },
  });
  const missingStatsPrediction = prediction({
    id: "pred-corners-missing",
    fixtureId: missingStatsFixture.id,
    market: "corners-h2h" as unknown as PredictionEntity["market"],
    outcome: "home",
    probabilities: { implied: 0.5, model: 0.55, edge: 0.05 },
  });

  await unitOfWork.fixtures.save(pushFixture);
  await unitOfWork.fixtures.save(missingStatsFixture);
  await unitOfWork.predictions.save(pushPrediction);
  await unitOfWork.predictions.save(missingStatsPrediction);

  const result = await runValidationWorker(undefined, {
    executedAt: "2026-04-16T22:30:00.000Z",
    unitOfWork,
  });

  const pushValidation = (await unitOfWork.validations.findByTargetId(pushPrediction.id))[0];

  assert.equal(result.settledPredictionCount, 1);
  assert.equal(result.skippedPredictionCount, 1);
  assert.equal(result.predictionResults.find((item) => item.predictionId === pushPrediction.id)?.verdict, "voided");
  assert.equal((await unitOfWork.predictions.getById(pushPrediction.id))?.status, "voided");
  assert.equal(pushValidation?.status, "partial");
  assert.match(
    result.predictionResults.find((item) => item.predictionId === missingStatsPrediction.id)?.reason ?? "",
    /corners statistic coverage/i,
  );
});

test("runValidationWorker settles mixed-market parlays when every leg is gradeable", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixtureOne = fixture({ id: "fx-1", score: { home: 2, away: 1 } });
  const fixtureTwo = fixture({ id: "fx-2", score: { home: 1, away: 1 } });
  const predictionOne = prediction({
    id: "pred-totals",
    fixtureId: fixtureOne.id,
    market: "totals",
    outcome: "over",
    probabilities: { implied: 0.5, model: 0.6, edge: 0.1, line: 2.5 },
  });
  const predictionTwo = prediction({
    id: "pred-double-chance",
    fixtureId: fixtureTwo.id,
    market: "double-chance",
    outcome: "draw-away",
  });
  const parlay = {
    ...buildParlayFromCandidates({
      id: "parlay-mixed",
      stake: 10,
      source: "automatic",
      candidates: [
        {
          predictionId: predictionOne.id,
          fixtureId: fixtureOne.id,
          market: predictionOne.market,
          outcome: predictionOne.outcome,
          price: 2,
          confidence: predictionOne.confidence,
          modelProbability: predictionOne.probabilities.model,
        },
        {
          predictionId: predictionTwo.id,
          fixtureId: fixtureTwo.id,
          market: predictionTwo.market,
          outcome: predictionTwo.outcome,
          price: 1.6,
          confidence: predictionTwo.confidence,
          modelProbability: predictionTwo.probabilities.model,
        },
      ],
    }).parlay,
    status: "submitted" as const,
  };

  await unitOfWork.fixtures.save(fixtureOne);
  await unitOfWork.fixtures.save(fixtureTwo);
  await unitOfWork.predictions.save(predictionOne);
  await unitOfWork.predictions.save(predictionTwo);
  await unitOfWork.parlays.save(parlay);

  const result = await runValidationWorker(undefined, {
    executedAt: "2026-04-16T22:45:00.000Z",
    unitOfWork,
  });

  const settledParlay = await unitOfWork.parlays.getById(parlay.id);

  assert.equal(result.settledPredictionCount, 2);
  assert.equal(result.settledParlayCount, 1);
  assert.equal(result.parlayResults[0]?.verdict, "won");
  assert.equal(settledParlay?.legs.every((leg) => leg.status === "won"), true);
});

test("runValidationWorker skips ungradeable score-derived predictions and completed fixtures without score", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const missingScoreFixture = fixtureWithoutScore();
  const totalsFixture = fixture({ id: "fx-2", score: { home: 1, away: 0 } });
  const missingScorePrediction = prediction({ id: "pred-1", fixtureId: missingScoreFixture.id });
  const totalsPrediction = prediction({ id: "pred-2", fixtureId: totalsFixture.id, market: "totals", outcome: "over" });

  await unitOfWork.fixtures.save(missingScoreFixture);
  await unitOfWork.fixtures.save(totalsFixture);
  await unitOfWork.predictions.save(missingScorePrediction);
  await unitOfWork.predictions.save(totalsPrediction);

  const result = await runValidationWorker(undefined, {
    executedAt: "2026-04-16T22:30:00.000Z",
    unitOfWork,
  });

  const validations = await unitOfWork.validations.list();

  assert.equal(result.settledPredictionCount, 0);
  assert.equal(result.skippedPredictionCount, 2);
  assert.match(result.predictionResults.find((item) => item.predictionId === "pred-1")?.reason ?? "", /score/i);
  assert.match(result.predictionResults.find((item) => item.predictionId === "pred-2")?.reason ?? "", /metadata/i);
  assert.equal(validations.length, 0);
});
