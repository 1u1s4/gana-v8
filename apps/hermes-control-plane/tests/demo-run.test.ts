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

  assert.deepEqual([...router.intents()].sort(), ["ingest-fixtures", "ingest-odds"]);
  assert.match(describeWorkspace(), /hermes-control-plane/);
});

test("runDemoControlPlane dispatches fixture and odds demo jobs", async () => {
  const summary = await runDemoControlPlane(new Date("2026-04-15T12:00:00.000Z"));

  assert.equal(summary.queuedBeforeRun, 2);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.runtime.appEnv, "development");
  assert.equal(summary.runtime.profile, "local-dev");
  assert.equal(summary.runtime.providerSource, "mock");
  assert.equal(summary.runtime.providerBaseUrl, "mock://api-football");
  assert.equal(summary.runtime.dryRun, true);
  assert.equal(summary.runtime.demoMode, true);
  assert.equal(summary.results.every((result) => result.status === "succeeded"), true);
  assert.equal(summary.results.some((result) => result.intent === "ingest-fixtures" && result.observedRecords > 0), true);
  assert.equal(summary.results.some((result) => result.intent === "ingest-odds" && result.observedRecords > 0), true);
});

test("runDemoControlPlane exposes runtime overrides from config-runtime", async () => {
  const summary = await runDemoControlPlane(new Date("2026-04-15T12:00:00.000Z"), {
    env: {
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_LOG_LEVEL: "warn",
      GANA_PROVIDER_BASE_URL: "https://replay.gana.test/v1",
      GANA_RUNTIME_PROFILE: "ci-regression",
      NODE_ENV: "test",
    },
  });

  assert.deepEqual(summary.runtime, {
    appEnv: "test",
    profile: "ci-regression",
    providerSource: "replay",
    providerBaseUrl: "https://replay.gana.test/v1",
    logLevel: "warn",
    dryRun: false,
    demoMode: false,
  });
  assert.equal(summary.results.every((result) => result.status === "succeeded"), true);
});
