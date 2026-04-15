import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSandboxRunnerArgs,
  runSandboxCli,
  runSandboxScenario,
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
    };
  };

  assert.equal(rendered.summary.profileName, "historical-backtest");
  assert.equal(rendered.summary.stats.replayEventCount, 12);
});
