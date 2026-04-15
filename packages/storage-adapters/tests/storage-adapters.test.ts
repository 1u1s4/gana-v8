import test from "node:test";
import assert from "node:assert/strict";

import {
  createFixture,
  createParlay,
  createPrediction,
  createSandboxNamespace,
  createValidation,
} from "@gana-v8/domain-core";

import { createInMemoryUnitOfWork } from "../src/index.js";

test("in-memory repositories store and query core aggregates", async () => {
  const uow = createInMemoryUnitOfWork();

  const fixture = createFixture({
    id: "fx-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    scheduledAt: "2026-04-14T21:00:00.000Z",
    status: "scheduled",
    metadata: { source: "feed-a" },
  });

  const prediction = createPrediction({
    id: "pred-1",
    fixtureId: fixture.id,
    market: "moneyline",
    outcome: "home",
    status: "draft",
    confidence: 0.66,
    probabilities: { implied: 0.53, model: 0.66, edge: 0.13 },
    rationale: ["Home team projected xG advantage"],
  });

  const parlay = createParlay({
    id: "parlay-1",
    status: "ready",
    stake: 10,
    source: "automatic",
    legs: [
      {
        predictionId: prediction.id,
        fixtureId: fixture.id,
        market: "moneyline",
        outcome: "home",
        price: 1.9,
        status: "pending",
      },
    ],
    correlationScore: 0.08,
    expectedPayout: 19,
  });

  const validation = createValidation({
    id: "val-1",
    targetId: parlay.id,
    kind: "parlay-settlement",
    status: "pending",
    checks: [],
    summary: "",
  });

  const sandbox = createSandboxNamespace({
    id: "ns-1",
    environment: "sandbox",
    sandboxId: "sbx-100",
    scope: "smoke",
    storagePrefix: "sandbox://sbx-100",
    queuePrefix: "sbx-100-queue",
    metadata: { owner: "tests" },
  });

  await uow.fixtures.save(fixture);
  await uow.predictions.save(prediction);
  await uow.parlays.save(parlay);
  await uow.validations.save(validation);
  await uow.sandboxNamespaces.save(sandbox);

  assert.equal(
    (await uow.fixtures.findByCompetition("Premier League")).length,
    1,
  );
  assert.equal((await uow.predictions.findByFixtureId(fixture.id)).length, 1);
  assert.equal((await uow.parlays.findByPredictionId(prediction.id)).length, 1);
  assert.equal((await uow.validations.findByTargetId(parlay.id)).length, 1);
  assert.equal(
    (await uow.sandboxNamespaces.findByEnvironment("sandbox")).length,
    1,
  );
});
