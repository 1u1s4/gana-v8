import test from "node:test";
import assert from "node:assert/strict";

import {
  createOperationSnapshot,
  createPublicApiHandlers,
  getHealth,
  getValidationSummary,
  listFixtures,
  listParlays,
  listPredictions,
  publicApiEndpointPaths,
} from "../src/index.js";

test("public api snapshot exposes fixtures, predictions, parlays, validation summary, and health", () => {
  const snapshot = createOperationSnapshot();

  assert.equal(listFixtures(snapshot).length, 2);
  assert.equal(listPredictions(snapshot).length, 2);
  assert.equal(listParlays(snapshot).length, 1);
  assert.equal(getValidationSummary(snapshot).total, 2);
  assert.equal(getValidationSummary(snapshot).partial, 1);
  assert.equal(getHealth(snapshot).status, "ok");
  assert.equal(publicApiEndpointPaths.health, "/health");
});

test("public api handlers return consistent derived read models", () => {
  const snapshot = createOperationSnapshot();
  const api = createPublicApiHandlers(snapshot);

  assert.deepEqual(api.snapshot(), snapshot);
  assert.equal(api.fixtures()[0]?.homeTeam, "Boca Juniors");
  assert.equal(api.predictions()[1]?.outcome, "over");
  assert.equal(api.parlays()[0]?.legs.length, 2);
  assert.equal(api.validationSummary().completionRate, 1);
  assert.match(api.health().checks[0]?.detail ?? "", /fixture/);
});
