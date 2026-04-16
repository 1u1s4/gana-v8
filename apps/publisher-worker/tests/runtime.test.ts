import assert from "node:assert/strict";
import test from "node:test";

import { createFixture, createPrediction } from "@gana-v8/domain-core";
import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  describeWorkspace,
  publishParlayMvp,
  toAtomicCandidateFromPrediction,
  type PublishedPredictionRecord,
  type PublisherWorkerPrismaClientLike,
} from "../src/index.js";

const fixture = (id: string, overrides: Partial<PublishedPredictionRecord["fixture"]> = {}) =>
  createFixture({
    id,
    sport: "football",
    competition: "Premier League",
    homeTeam: `Home ${id}`,
    awayTeam: `Away ${id}`,
    scheduledAt: "2026-04-16T18:00:00.000Z",
    status: "scheduled",
    metadata: {},
    ...overrides,
  });

const predictionRecord = (
  id: string,
  fixtureId: string,
  overrides: Partial<PublishedPredictionRecord> = {},
): PublishedPredictionRecord => ({
  ...createPrediction({
    id,
    fixtureId,
    market: "moneyline",
    outcome: "home",
    status: "published",
    confidence: 0.66,
    probabilities: { implied: 0.5, model: 0.62, edge: 0.12 },
    rationale: ["Deterministic edge"],
    publishedAt: "2026-04-16T12:00:00.000Z",
    createdAt: "2026-04-16T11:55:00.000Z",
    updatedAt: "2026-04-16T12:00:00.000Z",
  }),
  fixture: fixture(fixtureId),
  ...overrides,
});

const createClient = (
  predictions: readonly PublishedPredictionRecord[],
): PublisherWorkerPrismaClientLike => ({
  prediction: {
    async findMany() {
      return predictions.map((entry) => structuredClone(entry));
    },
  },
});

test("toAtomicCandidateFromPrediction derives decimal price from implied probability", () => {
  const candidate = toAtomicCandidateFromPrediction(predictionRecord("pred-1", "fx-1"));

  assert.equal(candidate.price, 2);
  assert.equal(candidate.market, "moneyline");
  assert.equal(candidate.competition, "Premier League");
  assert.deepEqual(candidate.teamKeys, ["home-fx-1", "away-fx-1"]);
});

test("publishParlayMvp persists a two-leg parlay from published moneyline predictions", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-1", "fx-1", {
        confidence: 0.71,
        probabilities: { implied: 0.5, model: 0.64, edge: 0.14 },
      }),
      predictionRecord("pred-2", "fx-2", {
        confidence: 0.69,
        probabilities: { implied: 0.4761904762, model: 0.61, edge: 0.1338095238 },
      }),
      predictionRecord("pred-3", "fx-1", {
        publishedAt: "2026-04-16T11:00:00.000Z",
        updatedAt: "2026-04-16T11:00:00.000Z",
      }),
      predictionRecord("pred-4", "fx-4", {
        market: "totals",
        outcome: "over",
      }),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
  });

  const parlays = await unitOfWork.parlays.list();

  assert.match(describeWorkspace(), /publisher-worker/);
  assert.equal(result.status, "persisted");
  assert.equal(result.scorecard.ready, true);
  assert.equal(result.selectedCandidates.length, 2);
  assert.equal(result.selectedCandidates[0]?.price, 2);
  assert.equal(parlays.length, 1);
  assert.equal(parlays[0]?.legs.length, 2);
  assert.equal(parlays[0]?.status, "ready");
  assert.equal(
    result.skipReasons.some((skip) => skip.reason === "duplicate-fixture"),
    true,
  );
  assert.equal(
    result.skipReasons.some((skip) => skip.reason === "unsupported-market"),
    true,
  );
});

test("publishParlayMvp returns scorecard and reasons when not enough valid predictions", async () => {
  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-1", "fx-1"),
      predictionRecord("pred-2", "fx-2", {
        probabilities: { implied: 0, model: 0.58, edge: 0.58 },
      }),
    ]),
    generatedAt: "2026-04-16T12:35:00.000Z",
    stake: 10,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.parlay, undefined);
  assert.equal(result.scorecard.ready, false);
  assert.match(result.scorecard.reasons.join(" | "), /requires at least 2 legs/);
  assert.equal(
    result.skipReasons.some((skip) => skip.reason === "invalid-implied-probability"),
    true,
  );
});
