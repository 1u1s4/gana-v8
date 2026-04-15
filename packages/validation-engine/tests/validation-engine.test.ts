import assert from "node:assert/strict";
import test from "node:test";

import { createPrediction, publishPrediction } from "@gana-v8/domain-core";
import { buildParlayFromCandidates } from "@gana-v8/parlay-engine";

import { replayValidationRun, settleAtomicTicket } from "../src/index.js";

const publishedPrediction = (input: Parameters<typeof createPrediction>[0]) =>
  publishPrediction(createPrediction(input), "2026-04-15T00:00:00.000Z");

test("settleAtomicTicket computes verdict and calibration metrics", () => {
  const prediction = publishedPrediction({
    id: "pred-1",
    fixtureId: "fx-1",
    market: "moneyline",
    outcome: "home",
    status: "draft",
    confidence: 0.7,
    probabilities: { implied: 0.52, model: 0.64, edge: 0.12 },
    rationale: ["Home edge"],
  });

  const settled = settleAtomicTicket(
    { prediction, price: 1.95, stake: 10 },
    { fixtureId: "fx-1", market: "moneyline", winningOutcomes: ["home"] },
    "2026-04-15T02:00:00.000Z",
  );

  assert.equal(settled.verdict, "won");
  assert.equal(settled.prediction.status, "settled");
  assert.ok(settled.actualPayout > 10);
  assert.ok(settled.calibrationError < 1);
  assert.ok(settled.logLoss > 0);
});

test("replayValidationRun settles atomics and parlays into a basic scorecard", () => {
  const homeWin = publishedPrediction({
    id: "pred-10",
    fixtureId: "fx-10",
    market: "moneyline",
    outcome: "home",
    status: "draft",
    confidence: 0.72,
    probabilities: { implied: 0.51, model: 0.65, edge: 0.14 },
    rationale: ["Pressing mismatch"],
  });
  const overGoals = publishedPrediction({
    id: "pred-11",
    fixtureId: "fx-11",
    market: "totals",
    outcome: "over",
    status: "draft",
    confidence: 0.66,
    probabilities: { implied: 0.53, model: 0.6, edge: 0.07 },
    rationale: ["Pace and xG trend"],
  });

  const parlay = {
    ...buildParlayFromCandidates({
      id: "parlay-10",
      stake: 15,
      source: "automatic",
      candidates: [
        {
          predictionId: homeWin.id,
          fixtureId: homeWin.fixtureId,
          market: homeWin.market,
          outcome: homeWin.outcome,
          price: 1.95,
          confidence: homeWin.confidence,
          modelProbability: homeWin.probabilities.model,
          competition: "Premier League",
          teamKeys: ["arsenal", "chelsea"],
        },
        {
          predictionId: overGoals.id,
          fixtureId: overGoals.fixtureId,
          market: overGoals.market,
          outcome: overGoals.outcome,
          price: 1.9,
          confidence: overGoals.confidence,
          modelProbability: overGoals.probabilities.model,
          competition: "Serie A",
          teamKeys: ["inter", "milan"],
        },
      ],
    }).parlay,
    status: "submitted" as const,
  };

  const replay = replayValidationRun({
    id: "validation-run-1",
    executedAt: "2026-04-16T00:00:00.000Z",
    atomics: [
      { prediction: homeWin, price: 1.95, stake: 10 },
      { prediction: overGoals, price: 1.9, stake: 10 },
    ],
    parlays: [parlay],
    outcomes: [
      { fixtureId: "fx-10", market: "moneyline", winningOutcomes: ["home"] },
      { fixtureId: "fx-11", market: "totals", winningOutcomes: ["under"] },
    ],
  });

  assert.equal(replay.validation.status, "passed");
  assert.equal(replay.scorecard.totalAtomics, 2);
  assert.equal(replay.scorecard.atomicWins, 1);
  assert.equal(replay.scorecard.atomicLosses, 1);
  assert.equal(replay.scorecard.parlayLosses, 1);
  assert.ok(replay.scorecard.roi < 0);
  assert.equal(replay.parlays[0]?.verdict, "lost");
});
