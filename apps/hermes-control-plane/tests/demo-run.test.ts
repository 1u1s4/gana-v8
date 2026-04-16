import assert from "node:assert/strict";
import test from "node:test";

import { createFixture } from "@gana-v8/domain-core";
import { createPrismaClient, createPrismaUnitOfWork } from "@gana-v8/storage-adapters";

import {
  buildHermesCronSpecs,
  createHermesJobRouter,
  describeWorkspace,
  enqueuePersistedTask,
  enqueuePredictionForEligibleFixtures,
  loadPersistedTaskSummary,
  maybeClaimNextPersistedTask,
  runAutomationCycle,
  runDemoControlPlane,
  runNextPersistedTask,
} from "../src/index.js";

const createAutomationFixtureWithOdds = async (
  databaseUrl: string,
  prefix: string,
  suffix: string,
): Promise<{ fixtureId: string }> => {
  const prisma = createPrismaClient(databaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  const fixtureId = `${prefix}-fixture-${suffix}`;
  const providerFixtureId = `${prefix}-provider-${suffix}`;
  const batchId = `${prefix}-batch-${suffix}`;
  const capturedAt = new Date("2099-01-01T09:00:00.000Z");

  try {
    await unitOfWork.fixtures.save(
      createFixture({
        id: fixtureId,
        sport: "football",
        competition: "Automation Test League",
        homeTeam: `Home ${suffix}`,
        awayTeam: `Away ${suffix}`,
        scheduledAt: `2099-01-0${suffix}T18:00:00.000Z`,
        status: "scheduled",
        metadata: {
          providerCode: "api-football",
          providerFixtureId,
        },
        createdAt: "2099-01-01T08:00:00.000Z",
        updatedAt: "2099-01-01T08:00:00.000Z",
      }),
    );

    await prisma.rawIngestionBatch.create({
      data: {
        id: batchId,
        providerCode: "api-football",
        endpointFamily: "odds",
        sourceName: "tests",
        sourceEndpoint: "/odds",
        runId: `${prefix}-run-${suffix}`,
        schemaVersion: "v1",
        fetchedAt: capturedAt,
        extractionTime: capturedAt,
        coverageWindowStart: capturedAt,
        coverageWindowEnd: capturedAt,
        coverageGranularity: "fixture",
        checksum: `${prefix}-checksum-${suffix}`,
        extractionStatus: "completed",
        warnings: [],
        sourceQualityScore: 1,
        recordCount: 1,
        rawObjectRefs: [],
      },
    });

    await prisma.oddsSnapshot.create({
      data: {
        id: `${prefix}-odds-${suffix}`,
        batchId,
        fixtureId,
        providerFixtureId,
        providerCode: "api-football",
        bookmakerKey: "bet365",
        marketKey: "h2h",
        capturedAt,
        payload: { source: "hermes-control-plane.test" },
        selections: {
          create: [
            {
              id: `${prefix}-odds-${suffix}-home`,
              index: 0,
              selectionKey: "home",
              label: "home",
              priceDecimal: 1.8,
            },
            {
              id: `${prefix}-odds-${suffix}-draw`,
              index: 1,
              selectionKey: "draw",
              label: "draw",
              priceDecimal: 3.7,
            },
            {
              id: `${prefix}-odds-${suffix}-away`,
              index: 2,
              selectionKey: "away",
              label: "away",
              priceDecimal: 4.9,
            },
          ],
        },
      },
    });

    return { fixtureId };
  } finally {
    await prisma.$disconnect();
  }
};

const cleanupAutomationArtifacts = async (databaseUrl: string, prefix: string): Promise<void> => {
  const prisma = createPrismaClient(databaseUrl);

  try {
    const fixtureIds = (
      await prisma.fixture.findMany({
        where: { id: { startsWith: `${prefix}-fixture-` } },
        select: { id: true },
      })
    ).map((fixture) => fixture.id);

    const predictionIds = fixtureIds.length
      ? (
          await prisma.prediction.findMany({
            where: { fixtureId: { in: fixtureIds } },
            select: { id: true },
          })
        ).map((prediction) => prediction.id)
      : [];

    const parlayIds = predictionIds.length
      ? (
          await prisma.parlay.findMany({
            where: { legs: { some: { predictionId: { in: predictionIds } } } },
            select: { id: true },
          })
        ).map((parlay) => parlay.id)
      : [];

    if (predictionIds.length || parlayIds.length) {
      await prisma.validation.deleteMany({
        where: {
          OR: [
            ...(predictionIds.length ? [{ targetId: { in: predictionIds } }] : []),
            ...(parlayIds.length ? [{ targetId: { in: parlayIds } }] : []),
          ],
        },
      });
    }

    if (parlayIds.length) {
      await prisma.parlay.deleteMany({ where: { id: { in: parlayIds } } });
    }

    if (predictionIds.length) {
      await prisma.prediction.deleteMany({ where: { id: { in: predictionIds } } });
    }

    const taskIds = (
      await prisma.task.findMany({ select: { id: true, payload: true } })
    )
      .filter((task) => {
        const payload = task.payload as Record<string, unknown>;
        return (
          task.id.includes(prefix) ||
          (typeof payload.fixtureId === "string" && payload.fixtureId.startsWith(prefix)) ||
          (typeof payload.executedAt === "string" && task.id.startsWith(prefix))
        );
      })
      .map((task) => task.id);

    if (taskIds.length) {
      await prisma.taskRun.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    }

    await prisma.oddsSelectionSnapshot.deleteMany({ where: { id: { startsWith: `${prefix}-odds-` } } });
    await prisma.oddsSnapshot.deleteMany({ where: { id: { startsWith: `${prefix}-odds-` } } });
    await prisma.rawIngestionBatch.deleteMany({ where: { id: { startsWith: `${prefix}-batch-` } } });
    await prisma.fixture.deleteMany({ where: { id: { startsWith: `${prefix}-fixture-` } } });
  } finally {
    await prisma.$disconnect();
  }
};

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

test("runNextPersistedTask processes prediction and validation tasks deterministically", async () => {
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
    await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-validation`,
      kind: "validation",
      payload: { target: "cycle" },
      now: new Date("2026-04-16T11:02:00.000Z"),
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

    const validationResult = await runNextPersistedTask(databaseUrl, {
      research: async () => ({ summary: "unexpected" }),
      prediction: async () => ({ summary: "unexpected" }),
      validation: async () => ({ settledPredictionCount: 3 }),
    });

    assert.ok(validationResult);
    assert.equal(validationResult.task.id, `${taskPrefix}-validation`);
    assert.equal(validationResult.task.status, "succeeded");
    assert.equal(validationResult.taskRun.status, "succeeded");
    assert.equal(validationResult.output.settledPredictionCount, 3);

    const exhausted = await runNextPersistedTask(databaseUrl, {
      research: async () => ({}),
      prediction: async () => ({}),
      validation: async () => ({}),
    });

    assert.equal(exhausted, null);
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

test("enqueuePredictionForEligibleFixtures creates deterministic persisted scoring tasks without duplicates", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prefix = `hae${Date.now().toString(36)}`;

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  try {
    const fixtureOne = await createAutomationFixtureWithOdds(databaseUrl, prefix, "1");
    const fixtureTwo = await createAutomationFixtureWithOdds(databaseUrl, prefix, "2");

    const firstRun = await enqueuePredictionForEligibleFixtures(databaseUrl, {
      now: new Date("2099-01-01T10:00:00.000Z"),
      fixtureIds: [fixtureOne.fixtureId, fixtureTwo.fixtureId],
      maxFixtures: 2,
    });
    const secondRun = await enqueuePredictionForEligibleFixtures(databaseUrl, {
      now: new Date("2099-01-01T10:00:00.000Z"),
      fixtureIds: [fixtureOne.fixtureId, fixtureTwo.fixtureId],
      maxFixtures: 2,
    });

    assert.equal(firstRun.eligibleFixtureCount, 2);
    assert.equal(firstRun.enqueuedCount, 2);
    assert.equal(firstRun.tasks.every((task) => task.kind === "prediction"), true);
    assert.equal(firstRun.tasks.every((task) => task.payload.step === "score"), true);
    assert.equal(secondRun.enqueuedCount, 0);
    assert.equal(secondRun.skippedFixtures.length, 2);
    assert.equal(
      secondRun.skippedFixtures.every((fixture) => /already exists/.test(fixture.reason)),
      true,
    );
  } finally {
    await cleanupAutomationArtifacts(databaseUrl, prefix);
  }
});

test("runAutomationCycle processes scoring tasks, builds a parlay, and executes validation worker", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prefix = `hac${Date.now().toString(36)}`;

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  try {
    const fixtureOne = await createAutomationFixtureWithOdds(databaseUrl, prefix, "1");
    const fixtureTwo = await createAutomationFixtureWithOdds(databaseUrl, prefix, "2");

    const summary = await runAutomationCycle(databaseUrl, {
      now: new Date("2099-01-01T10:00:00.000Z"),
      fixtureIds: [fixtureOne.fixtureId, fixtureTwo.fixtureId],
      maxFixtures: 2,
      scoringGeneratedAt: "2099-01-01T10:05:00.000Z",
      parlayGeneratedAt: "2099-01-01T10:06:00.000Z",
      validationExecutedAt: "2099-01-01T10:07:00.000Z",
      validationTaskId: `${prefix}-validation-task`,
    });

    const prisma = createPrismaClient(databaseUrl);
    try {
      const predictions = await prisma.prediction.findMany({
        where: { fixtureId: { startsWith: `${prefix}-fixture-` } },
      });
      const parlays = await prisma.parlay.findMany({
        where: {
          legs: {
            some: {
              predictionId: { in: predictions.map((prediction) => prediction.id) },
            },
          },
        },
        include: { legs: true },
      });

      assert.equal(summary.enqueuedPredictions.enqueuedCount, 2);
      assert.equal(summary.processedPredictionCount, 2);
      assert.equal(summary.predictionExecutions.every((execution) => execution.task.status === "succeeded"), true);
      assert.equal(predictions.length, 2);
      assert.equal(predictions.every((prediction) => prediction.status === "published"), true);
      assert.equal(summary.parlayResult.status, "persisted");
      assert.equal(parlays.length, 1);
      assert.equal(parlays[0]?.legs.length, 2);
      assert.equal(summary.validationTask.kind, "validation");
      assert.equal(summary.validationExecution.task.status, "succeeded");
      assert.equal(summary.validationResult.skippedPredictionCount >= 2, true);
      assert.equal(summary.validationResult.pendingParlayCount >= 1, true);
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await cleanupAutomationArtifacts(databaseUrl, prefix);
  }
});
