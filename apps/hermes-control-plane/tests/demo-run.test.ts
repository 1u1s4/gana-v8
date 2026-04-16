import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHermesCronSpecs,
  createHermesJobRouter,
  describeWorkspace,
  enqueuePersistedTask,
  loadPersistedTaskSummary,
  maybeClaimNextPersistedTask,
  runDemoControlPlane,
  runNextPersistedTask,
} from "../src/index.js";
import { createPrismaClient } from "@gana-v8/storage-adapters";

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

test("loadPersistedTaskSummary reads persisted task status buckets", async () => {
  const summary = await loadPersistedTaskSummary(process.env.DATABASE_URL!);

  assert.ok(summary.total >= 1);
  assert.ok(summary.succeeded >= 1);
  assert.ok(summary.latestTasks.length >= 1);
});

test("enqueuePersistedTask persists queued research and prediction tasks in createdAt order", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = createPrismaClient(databaseUrl);
  const taskPrefix = `hermes-test-enqueue-${Date.now()}`;

  try {
    const firstTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-research`,
      kind: "research",
      payload: { fixtureId: "fx-123", prompt: "research this match" },
      now: new Date("2026-04-16T10:00:00.000Z"),
    });
    const secondTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-prediction`,
      kind: "prediction",
      payload: { fixtureId: "fx-123", market: "moneyline" },
      now: new Date("2026-04-16T10:01:00.000Z"),
      priority: 5,
    });

    assert.equal(firstTask.status, "queued");
    assert.equal(secondTask.status, "queued");

    const summary = await loadPersistedTaskSummary(databaseUrl);
    const createdTasks = summary.latestTasks.filter((task) => task.id.startsWith(taskPrefix));

    assert.equal(createdTasks.length, 2);
    assert.deepEqual(
      createdTasks.map((task) => task.id),
      [secondTask.id, firstTask.id],
    );

    const claimedTask = await maybeClaimNextPersistedTask(databaseUrl);

    assert.ok(claimedTask);
    assert.equal(claimedTask.task.id, firstTask.id);
    assert.equal(claimedTask.task.status, "running");
    assert.equal(claimedTask.taskRun.taskId, firstTask.id);
    assert.equal(claimedTask.taskRun.attemptNumber, 1);
    assert.equal(claimedTask.taskRun.status, "running");
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

test("runNextPersistedTask processes one persisted task deterministically and records failure state", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = createPrismaClient(databaseUrl);
  const taskPrefix = `hermes-test-run-${Date.now()}`;

  try {
    const firstTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-research`,
      kind: "research",
      payload: { fixtureId: "fx-001", prompt: "collect context" },
      now: new Date("2026-04-16T11:00:00.000Z"),
    });
    await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-prediction`,
      kind: "prediction",
      payload: { fixtureId: "fx-001", market: "totals" },
      now: new Date("2026-04-16T11:01:00.000Z"),
    });

    const firstResult = await runNextPersistedTask(databaseUrl, {
      research: async (task) => ({
        summary: `researched:${String(task.payload.fixtureId)}`,
      }),
      prediction: async () => {
        throw new Error("prediction handler should not run first");
      },
    });

    assert.ok(firstResult);
    assert.equal(firstResult.task.id, firstTask.id);
    assert.equal(firstResult.task.status, "succeeded");
    assert.equal(firstResult.taskRun.status, "succeeded");
    assert.equal(firstResult.output.summary, "researched:fx-001");

    const secondResult = await runNextPersistedTask(databaseUrl, {
      research: async () => ({ summary: "unexpected" }),
      prediction: async () => {
        throw new Error("model unavailable");
      },
    });

    assert.ok(secondResult);
    assert.equal(secondResult.task.id, `${taskPrefix}-prediction`);
    assert.equal(secondResult.task.status, "failed");
    assert.equal(secondResult.taskRun.status, "failed");
    assert.match(secondResult.taskRun.error ?? "", /model unavailable/);
    assert.equal(secondResult.error?.message, "model unavailable");

    const exhausted = await runNextPersistedTask(databaseUrl, {
      research: async () => ({}),
      prediction: async () => ({}),
    });

    assert.equal(exhausted, null);
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});
