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
  deriveMoneylineOutcomeFromFixture,
  describeWorkspace,
  runValidationWorker,
} from "../src/index.js";

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

test("deriveMoneylineOutcomeFromFixture returns match result for completed fixtures with score", () => {
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ score: { home: 3, away: 0 } })), "home");
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ score: { home: 1, away: 1 } })), "draw");
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ score: { home: 0, away: 2 } })), "away");
  assert.equal(deriveMoneylineOutcomeFromFixture(fixture({ status: "live" })), null);
  assert.equal(deriveMoneylineOutcomeFromFixture(fixtureWithoutScore()), null);
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

test("runValidationWorker skips unsupported markets and completed fixtures without score", async () => {
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
  assert.match(result.predictionResults.find((item) => item.predictionId === "pred-2")?.reason ?? "", /moneyline/i);
  assert.equal(validations.length, 0);
});
