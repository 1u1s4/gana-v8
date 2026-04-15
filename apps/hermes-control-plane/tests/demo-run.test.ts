import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHermesCronSpecs,
  createHermesJobRouter,
  describeWorkspace,
  runDemoControlPlane,
} from "../src/index.js";

test("buildHermesCronSpecs exposes hermes-native schedules for fixtures and odds", () => {
  const specs = buildHermesCronSpecs();

  assert.equal(specs.length, 2);
  assert.equal(specs.every((spec) => spec.labels?.includes("hermes-native")), true);
  assert.equal(specs.some((spec) => spec.intent === "ingest-fixtures"), true);
  assert.equal(specs.some((spec) => spec.intent === "ingest-odds"), true);
});

test("router registers ingest workflows", () => {
  const router = createHermesJobRouter();

  assert.deepEqual(router.intents().sort(), ["ingest-fixtures", "ingest-odds"]);
  assert.match(describeWorkspace(), /hermes-control-plane/);
});

test("runDemoControlPlane dispatches fixture and odds demo jobs", async () => {
  const summary = await runDemoControlPlane(new Date("2026-04-15T12:00:00.000Z"));

  assert.equal(summary.queuedBeforeRun, 2);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.results.every((result) => result.status === "succeeded"), true);
  assert.equal(summary.results.some((result) => result.intent === "ingest-fixtures" && result.observedRecords > 0), true);
  assert.equal(summary.results.some((result) => result.intent === "ingest-odds" && result.observedRecords > 0), true);
});
