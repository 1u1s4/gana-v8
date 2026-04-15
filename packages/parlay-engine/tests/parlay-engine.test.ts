import assert from "node:assert/strict";
import test from "node:test";

import { buildParlayFromCandidates, calculateCorrelation, settleParlayTicket } from "../src/index.js";

const candidates = [
  {
    predictionId: "pred-1",
    fixtureId: "fx-1",
    market: "moneyline",
    outcome: "home",
    price: 1.95,
    confidence: 0.72,
    modelProbability: 0.62,
    competition: "UCL",
    teamKeys: ["arsenal", "real-madrid"],
    tags: ["elite"],
  },
  {
    predictionId: "pred-2",
    fixtureId: "fx-2",
    market: "totals",
    outcome: "over",
    price: 1.88,
    confidence: 0.68,
    modelProbability: 0.6,
    competition: "UCL",
    teamKeys: ["inter", "bayern"],
    tags: ["elite"],
  },
  {
    predictionId: "pred-3",
    fixtureId: "fx-1",
    market: "both-teams-score",
    outcome: "yes",
    price: 1.7,
    confidence: 0.58,
    modelProbability: 0.56,
    competition: "UCL",
    teamKeys: ["arsenal", "real-madrid"],
    tags: ["elite"],
  },
] as const;

test("buildParlayFromCandidates ranks legs and flags high correlation", () => {
  const result = buildParlayFromCandidates({
    id: "parlay-1",
    stake: 10,
    source: "automatic",
    candidates,
    maxLegs: 3,
    maxCorrelationScore: 0.3,
  });

  assert.equal(result.parlay.legs.length, 3);
  assert.equal(result.parlay.status, "draft");
  assert.ok(result.scorecard.correlationScore > 0.3);
  assert.equal(result.scorecard.ready, false);
  assert.ok(result.scorecard.parlayScore > 0);
  assert.equal(result.rankedCandidates[0]?.candidate.predictionId, "pred-1");
  assert.ok(calculateCorrelation(candidates[0], candidates[2]) > calculateCorrelation(candidates[0], candidates[1]));
});

test("settleParlayTicket grades winning parlays with void legs folded out", () => {
  const result = buildParlayFromCandidates({
    id: "parlay-2",
    stake: 20,
    source: "automatic",
    candidates: candidates.slice(0, 2),
  });

  const readyParlay = {
    ...result.parlay,
    status: "submitted" as const,
  };

  const settled = settleParlayTicket(readyParlay, [
    { predictionId: "pred-1", status: "won" },
    { predictionId: "pred-2", status: "voided" },
  ]);

  assert.equal(settled.finalized, true);
  assert.equal(settled.verdict, "won");
  assert.equal(settled.parlay.status, "settled");
  assert.equal(settled.legs[1]?.status, "voided");
  assert.ok(settled.actualPayout > readyParlay.stake);
  assert.ok(settled.profit > 0);
});
