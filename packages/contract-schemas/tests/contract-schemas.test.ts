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
