import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  materializeSandboxRun,
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
    };
  };

  assert.equal(rendered.summary.profileName, "historical-backtest");
  assert.equal(rendered.summary.stats.replayEventCount, 12);
});
