import assert from "node:assert/strict";
import test from "node:test";

import {
  createCronValidationPlan,
  createSandboxRunManifest,
  getSyntheticFixturePack,
  listSandboxProfiles,
  listSyntheticFixturePackIds,
  summarizeNamespaces,
} from "../src/index.ts";

test("fixture catalog exposes deterministic synthetic packs", () => {
  const packIds = listSyntheticFixturePackIds();
  assert.deepEqual(packIds, ["football-dual-smoke", "football-replay-late-swing"]);

  const pack = getSyntheticFixturePack("football-replay-late-swing");
  assert.equal(pack.validationTargets.expectedFixtureCount, 3);
  assert.equal(pack.validationTargets.expectedReplayEvents, 12);
  assert.equal(pack.fixtures[0]?.metadata.synthetic, "true");
});

test("sandbox manifest builds isolated namespaces and dry-run cron validation", () => {
  const manifest = createSandboxRunManifest({
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    gitSha: "abcdef1234567890",
    now: new Date("2026-08-16T19:45:00.000Z"),
  });

  assert.match(manifest.sandboxId, /^sbx-ci-smoke-football-dual-smoke-/);
  assert.equal(manifest.profile.isolation.publishEnabled, false);

  const namespaceKeys = summarizeNamespaces(manifest.namespaces);
  assert.equal(namespaceKeys.length, 4);
  assert.ok(namespaceKeys.every((key) => key.startsWith(`sandbox:${manifest.sandboxId}:`)));

  const cronPlan = createCronValidationPlan(manifest);
  assert.equal(cronPlan.length, 1);
  assert.equal(cronPlan[0]?.dryRun, true);
  assert.equal(cronPlan[0]?.writesAllowed, false);
});

test("profile catalog keeps isolated sandbox-only profiles", () => {
  assert.deepEqual(listSandboxProfiles(), [
    "local-dev",
    "ci-smoke",
    "ci-regression",
    "historical-backtest",
  ]);
});
