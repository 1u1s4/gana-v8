import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  certifySandboxRun,
  createSandboxGoldenSnapshot,
  diffSandboxGoldenSnapshot,
  compareSandboxReleases,
  materializeSandboxRun,
  parseSandboxRunnerArgs,
  parseSandboxCertificationArgs,
  runSandboxCli,
  runSandboxCertificationCli,
  runSandboxScenario,
  writeSandboxGoldenSnapshot,
} from "../src/index.ts";

test("sandbox runner emits smoke summary with dry-run safety guarantees", () => {
  const summary = runSandboxScenario({
    mode: "smoke",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    gitSha: "abcdef1234567890",
    now: new Date("2026-08-16T20:00:00.000Z"),
  });

  assert.equal(summary.stats.fixtureCount, 2);
  assert.equal(summary.stats.replayEventCount, 4);
  assert.equal(summary.clock.mode, "virtual");
  assert.equal(summary.clock.tickCount, 4);
  assert.equal(summary.replayTimeline.length, 4);
  assert.equal(summary.golden.packId, "football-dual-smoke");
  assert.equal(summary.comparison.changed, false);
  assert.equal(summary.safety.publishEnabled, false);
  assert.equal(summary.safety.cronDryRunOnly, true);
  assert.ok(summary.namespaceKeys.every((key) => key.startsWith(`sandbox:${summary.sandboxId}:`)));
});

test("sandbox runner blocks profile and pack combinations outside the allowlist", () => {
  assert.throws(
    () =>
      runSandboxScenario({
        mode: "replay",
        profileName: "ci-smoke",
        packId: "football-replay-late-swing",
        gitSha: "abcdef1234567890",
      }),
    /not approved/,
  );
});

test("sandbox runner materializes isolated namespaces through the storage unit of work", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const materialized = await materializeSandboxRun(
    {
      mode: "smoke",
      profileName: "ci-smoke",
      packId: "football-dual-smoke",
      gitSha: "abcdef1234567890",
      now: new Date("2026-08-16T20:00:00.000Z"),
    },
    unitOfWork,
  );

  assert.equal(materialized.persistedNamespaceCount, 4);
  assert.equal(materialized.persistedNamespaceIds.length, 4);

  const persisted = await unitOfWork.sandboxNamespaces.list();
  assert.equal(persisted.length, 4);
  assert.ok(persisted.every((namespace) => namespace.sandboxId === materialized.summary.sandboxId));
});

test("sandbox runner rolls back persisted namespaces when materialization fails midway", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  let saveCount = 0;
  const originalSave = unitOfWork.sandboxNamespaces.save.bind(unitOfWork.sandboxNamespaces);

  unitOfWork.sandboxNamespaces.save = async (namespace) => {
    saveCount += 1;
    if (saveCount === 3) {
      throw new Error("simulated sandbox namespace persistence failure");
    }

    return originalSave(namespace);
  };

  await assert.rejects(
    materializeSandboxRun(
      {
        mode: "smoke",
        profileName: "ci-smoke",
        packId: "football-dual-smoke",
        gitSha: "abcdef1234567890",
        now: new Date("2026-08-16T20:00:00.000Z"),
      },
      unitOfWork,
    ),
    /simulated sandbox namespace persistence failure/,
  );

  assert.deepEqual(await unitOfWork.sandboxNamespaces.list(), []);
});

test("cli parsing and rendering stay deterministic", () => {
  const parsed = parseSandboxRunnerArgs([
    "--mode",
    "replay",
    "--profile",
    "historical-backtest",
    "--pack",
    "football-replay-late-swing",
    "--git-sha",
    "1234567890abcdef",
    "--now",
    "2026-08-16T20:30:00.000Z",
  ]);

  assert.equal(parsed.mode, "replay");
  assert.equal(parsed.profileName, "historical-backtest");

  const output = runSandboxCli([
    "--mode",
    "replay",
    "--profile",
    "historical-backtest",
    "--pack",
    "football-replay-late-swing",
    "--git-sha",
    "1234567890abcdef",
    "--now",
    "2026-08-16T20:30:00.000Z",
  ]);

  const rendered = JSON.parse(output) as {
    summary: {
      profileName: string;
      stats: { replayEventCount: number };
      clock: { tickCount: number };
      golden: { fingerprint: string };
    };
  };

  assert.equal(rendered.summary.profileName, "historical-backtest");
  assert.equal(rendered.summary.stats.replayEventCount, 12);
  assert.equal(rendered.summary.clock.tickCount, 12);
  assert.equal(typeof rendered.summary.golden.fingerprint, "string");
});

test("sandbox runner compares releases reproducibly for the same pack", () => {
  const comparison = compareSandboxReleases({
    profileName: "historical-backtest",
    packId: "football-replay-late-swing",
    baselineGitSha: "1111111abcdef",
    candidateGitSha: "2222222fedcba",
    now: new Date("2026-08-16T20:30:00.000Z"),
  });

  assert.equal(comparison.packId, "football-replay-late-swing");
  assert.equal(comparison.changed, false);
  assert.equal(comparison.fingerprintChanged, false);
  assert.deepEqual(comparison.changedFixtureIds, []);
});

test("sandbox runner creates stable golden snapshots and empty diffs for the same scenario", () => {
  const summary = runSandboxScenario({
    mode: "smoke",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    gitSha: "abcdef1234567890",
    now: new Date("2026-08-16T20:00:00.000Z"),
  });
  const baseline = createSandboxGoldenSnapshot(summary);
  const candidate = createSandboxGoldenSnapshot(summary);
  const diff = diffSandboxGoldenSnapshot(baseline, candidate);

  assert.equal(baseline.schemaVersion, "sandbox-golden-v1");
  assert.equal(diff.changed, false);
  assert.equal(diff.entryCount, 0);
});

test("sandbox runner certification detects golden drift and writes evidence artifacts", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "gana-v8-sandbox-cert-"));
  const goldenPath = join(tempRoot, "golden.json");
  const artifactPath = join(tempRoot, "evidence.json");

  await writeSandboxGoldenSnapshot(goldenPath, {
    schemaVersion: "sandbox-golden-v1",
    mode: "smoke",
    fixturePackId: "football-dual-smoke",
    profileName: "ci-smoke",
    assertions: ["wrong-assertion"],
    providerModes: { fixtures_api: "replay" },
    stats: {
      fixtureCount: 99,
      completedFixtures: 0,
      replayEventCount: 0,
      replayChannels: [],
      cronJobsValidated: 0,
    },
    clock: {
      mode: "virtual",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
      tickCount: 0,
    },
    replayTimeline: [],
    golden: {
      packId: "football-dual-smoke",
      version: "bad",
      fingerprint: "drifted",
    },
    comparison: {
      baselinePackId: "football-dual-smoke",
      candidatePackId: "football-dual-smoke",
      changed: true,
      fixtureDelta: 1,
      replayEventDelta: 1,
      changedFixtureIds: ["bad-fixture"],
    },
    safety: {
      publishEnabled: false,
      allowedHosts: [],
      cronDryRunOnly: true,
    },
  });

  const result = await certifySandboxRun({
    mode: "smoke",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    gitSha: "abcdef1234567890",
    now: new Date("2026-08-16T20:00:00.000Z"),
    goldenPath,
    artifactPath,
  });

  assert.equal(result.status, "failed");
  assert.ok(result.diff.entryCount > 0);
  assert.equal(typeof result.artifactPath, "string");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    schemaVersion: string;
    summary: { fixturePackId: string };
  };
  assert.equal(artifact.schemaVersion, "sandbox-certification-v1");
  assert.equal(artifact.summary.fixturePackId, "football-dual-smoke");
});

test("sandbox runner certification cli parses golden and artifact flags", () => {
  const parsed = parseSandboxCertificationArgs([
    "--certify",
    "--mode",
    "replay",
    "--profile",
    "ci-regression",
    "--pack",
    "football-replay-late-swing",
    "--git-sha",
    "1234567890abcdef",
    "--golden",
    "/tmp/golden.json",
    "--artifact",
    "/tmp/evidence.json",
  ]);

  assert.equal(parsed.mode, "replay");
  assert.equal(parsed.profileName, "ci-regression");
  assert.equal(parsed.goldenPath, "/tmp/golden.json");
  assert.equal(parsed.artifactPath, "/tmp/evidence.json");
});

test("sandbox runner certification cli renders a passed certification payload", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "gana-v8-sandbox-cert-cli-"));
  const goldenPath = join(tempRoot, "golden.json");
  const artifactPath = join(tempRoot, "evidence.json");
  const summary = runSandboxScenario({
    mode: "smoke",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    gitSha: "abcdef1234567890",
    now: new Date("2026-08-16T20:00:00.000Z"),
  });

  await writeSandboxGoldenSnapshot(goldenPath, createSandboxGoldenSnapshot(summary));

  const rendered = JSON.parse(
    await runSandboxCertificationCli([
      "--certify",
      "--mode",
      "smoke",
      "--profile",
      "ci-smoke",
      "--pack",
      "football-dual-smoke",
      "--git-sha",
      "abcdef1234567890",
      "--now",
      "2026-08-16T20:00:00.000Z",
      "--golden",
      goldenPath,
      "--artifact",
      artifactPath,
    ]),
  ) as {
    status: string;
    diff: { entryCount: number };
    evidence: { goldenSnapshot: { fixturePackId: string } };
  };

  assert.equal(rendered.status, "passed");
  assert.equal(rendered.diff.entryCount, 0);
  assert.equal(rendered.evidence.goldenSnapshot.fixturePackId, "football-dual-smoke");
});
