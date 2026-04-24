import assert from "node:assert/strict";
import test from "node:test";

import { createFixture } from "@gana-v8/domain-core";
import { buildResearchDossier } from "../../research-engine/src/index.ts";

import {
  buildAtomicPrediction,
  buildMatchForecast,
  evaluateCandidateEligibility,
  generateCandidatesForMarket,
  generateMarketCandidates,
  isScoreDerivedMarketOutcome,
} from "../src/index.ts";

const generatedAt = "2026-04-14T18:00:00.000Z";

const fixture = createFixture({
  id: "fx-prediction-1",
  sport: "football",
  competition: "Premier League",
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  scheduledAt: "2026-04-14T21:00:00.000Z",
  status: "scheduled",
  metadata: {
    formHome: "0.81",
    formAway: "0.44",
    restHomeDays: "6",
    restAwayDays: "3",
    injuriesHome: "0",
    injuriesAway: "3",
    drawBias: "0.09",
    powerHome: "0.22",
    powerAway: "-0.05",
    oddsHomeImplied: "0.43",
    oddsDrawImplied: "0.25",
    oddsAwayImplied: "0.30",
  },
});

test("prediction engine creates publishable atomic prediction from dossier", () => {
  const dossier = buildResearchDossier(fixture, { now: () => generatedAt });
  const forecast = buildMatchForecast(fixture, dossier, { generatedAt });
  const candidates = generateMarketCandidates(fixture, forecast, dossier);
  const homeCandidate = candidates.find((candidate) => candidate.outcome === "home");

  assert.ok(homeCandidate);
  assert.ok(forecast.homeWin > forecast.awayWin);
  assert.equal(evaluateCandidateEligibility(fixture, dossier, homeCandidate!, {}, generatedAt).eligible, true);

  const atomicPrediction = buildAtomicPrediction(fixture, dossier, {
    generatedAt,
    predictionIdFactory: () => "pred-atomic-1",
  });

  assert.ok(atomicPrediction);
  assert.equal(atomicPrediction?.candidate.outcome, "home");
  assert.equal(atomicPrediction?.prediction.id, "pred-atomic-1");
  assert.equal(atomicPrediction?.prediction.status, "published");
});

test("score-derived market outcome helper includes double chance outcomes", () => {
  assert.equal(isScoreDerivedMarketOutcome("double-chance", "home-draw"), true);
  assert.equal(isScoreDerivedMarketOutcome("double-chance", "home-away"), true);
  assert.equal(isScoreDerivedMarketOutcome("double-chance", "draw-away"), true);
  assert.equal(isScoreDerivedMarketOutcome("double-chance", "home"), false);
});

test("prediction engine generates candidates for score-derived markets", () => {
  const dossier = buildResearchDossier(fixture, { now: () => generatedAt });
  const totals = generateCandidatesForMarket(
    { market: "totals", probabilities: { over: 0.52, under: 0.48 }, line: 2.5 },
    dossier,
  );
  const btts = generateCandidatesForMarket(
    { market: "both-teams-score", probabilities: { yes: 0.57, no: 0.43 } },
    dossier,
  );
  const doubleChance = generateCandidatesForMarket(
    { market: "double-chance", probabilities: { "home-draw": 0.66, "home-away": 0.7, "draw-away": 0.64 } },
    dossier,
  );

  assert.deepEqual(totals.map((candidate) => candidate.outcome), ["over", "under"]);
  assert.equal(totals[0]?.line, 2.5);
  assert.deepEqual(btts.map((candidate) => candidate.outcome), ["yes", "no"]);
  assert.deepEqual(doubleChance.map((candidate) => candidate.outcome), ["home-draw", "home-away", "draw-away"]);
  assert.ok(doubleChance.every((candidate) => candidate.market === "double-chance"));
});

test("eligibility policy blocks publication when kickoff is too close", () => {
  const lateDossier = buildResearchDossier(fixture, { now: () => "2026-04-14T20:50:00.000Z" });
  const forecast = buildMatchForecast(fixture, lateDossier, { generatedAt: "2026-04-14T20:50:00.000Z" });
  const homeCandidate = generateMarketCandidates(fixture, forecast, lateDossier).find(
    (candidate) => candidate.outcome === "home",
  );

  const decision = evaluateCandidateEligibility(
    fixture,
    lateDossier,
    homeCandidate!,
    {},
    "2026-04-14T20:50:00.000Z",
  );

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.some((reason) => reason.includes("Kickoff lead")));
});
