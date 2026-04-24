import test from "node:test";
import assert from "node:assert/strict";

import { predictionSchema, sandboxNamespaceSchema } from "../src/index.js";

test("prediction schema accepts a valid prediction payload", () => {
  const parsed = predictionSchema.parse({
    id: "pred-1",
    fixtureId: "fx-1",
    market: "moneyline",
    outcome: "home",
    status: "published",
    confidence: 0.73,
    probabilities: { implied: 0.58, model: 0.73, edge: 0.15 },
    rationale: ["Model edge > 10%"],
    publishedAt: "2026-04-14T21:05:00.000Z",
    createdAt: "2026-04-14T21:00:00.000Z",
    updatedAt: "2026-04-14T21:05:00.000Z",
  });

  assert.equal(parsed.market, "moneyline");
});

test("prediction schema accepts score-derived market payloads", () => {
  const totals = predictionSchema.parse({
    id: "pred-totals-1",
    fixtureId: "fx-1",
    market: "totals",
    outcome: "over",
    status: "published",
    confidence: 0.61,
    probabilities: { implied: 0.49, model: 0.59, edge: 0.1, line: 2.5 },
    rationale: ["Model edge > 5%"],
    publishedAt: "2026-04-14T21:05:00.000Z",
    createdAt: "2026-04-14T21:00:00.000Z",
    updatedAt: "2026-04-14T21:05:00.000Z",
  });
  const doubleChance = predictionSchema.parse({
    id: "pred-double-chance-1",
    fixtureId: "fx-1",
    market: "double-chance",
    outcome: "home-draw",
    status: "published",
    confidence: 0.68,
    probabilities: { implied: 0.7, model: 0.76, edge: 0.06 },
    rationale: ["Model edge > 5%"],
    publishedAt: "2026-04-14T21:05:00.000Z",
    createdAt: "2026-04-14T21:00:00.000Z",
    updatedAt: "2026-04-14T21:05:00.000Z",
  });

  assert.equal(totals.probabilities.line, 2.5);
  assert.equal(doubleChance.outcome, "home-draw");
});

test("sandbox namespace schema rejects sandbox without sandboxId", () => {
  const result = sandboxNamespaceSchema.safeParse({
    id: "ns-1",
    environment: "sandbox",
    scope: "ci",
    storagePrefix: "sandbox://ci",
    queuePrefix: "ci-queue",
    metadata: {},
    createdAt: "2026-04-14T21:00:00.000Z",
    updatedAt: "2026-04-14T21:00:00.000Z",
  });

  assert.equal(result.success, false);
});
