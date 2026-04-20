import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReplayTimeline,
  compareFixturePacks,
  createCronValidationPlan,
  createGoldenFixturePackFingerprint,
  createSandboxRunManifest,
  createVirtualClockPlan,
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

test("testing fixtures build a deterministic replay timeline and virtual clock plan", () => {
  const manifest = createSandboxRunManifest({
    profileName: "historical-backtest",
    packId: "football-replay-late-swing",
    gitSha: "abcdef1234567890",
    now: new Date("2026-08-16T20:30:00.000Z"),
  });

  const timeline = buildReplayTimeline(manifest);
  const clock = createVirtualClockPlan(manifest);

  assert.equal(timeline.length, 12);
  assert.equal(timeline[0]?.offsetMinutes, 0);
  assert.equal(clock.mode, "virtual");
  assert.equal(clock.tickCount, 12);
  assert.equal(clock.startAt, timeline[0]?.scheduledAt);
  assert.equal(clock.endAt, timeline.at(-1)?.scheduledAt);
});

test("testing fixtures expose golden fingerprints and stable pack comparisons", () => {
  const smoke = getSyntheticFixturePack("football-dual-smoke");
  const replay = getSyntheticFixturePack("football-replay-late-swing");

  const smokeFingerprint = createGoldenFixturePackFingerprint(smoke);
  const replayFingerprint = createGoldenFixturePackFingerprint(replay);
  const diff = compareFixturePacks(smoke, replay);

  assert.equal(typeof smokeFingerprint.fingerprint, "string");
  assert.equal(typeof replayFingerprint.fingerprint, "string");
  assert.equal(diff.changed, true);
  assert.equal(diff.fixtureDelta, 1);
  assert.equal(diff.replayEventDelta, 8);
  assert.ok(diff.changedFixtureIds.length >= 1);
});
