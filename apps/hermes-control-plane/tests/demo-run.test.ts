import assert from "node:assert/strict";
import test from "node:test";

import { createFixture, createFixtureWorkflow, createTaskRun } from "@gana-v8/domain-core";
import { createPrismaClient, createPrismaUnitOfWork } from "@gana-v8/storage-adapters";

import {
  buildHermesCronSpecs,
  createHermesJobRouter,
  createPersistedTaskQueue,
  describeWorkspace,
  enqueuePersistedTask,
  enqueuePredictionForEligibleFixtures,
  loadAutomationOpsSummary,
  loadPersistedTaskSummary,
  maybeClaimNextPersistedTask,
  requeuePersistedTask,
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

const createAutomationFixtureWorkflowOps = async (
  databaseUrl: string,
  fixtureId: string,
  input: {
    readonly manualSelectionStatus?: "none" | "selected" | "rejected";
    readonly selectionOverride?: "none" | "force-include" | "force-exclude";
    readonly manualReason?: string;
    readonly overrideReason?: string;
  } = {},
): Promise<void> => {
  const prisma = createPrismaClient(databaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);

  try {
    const workflow = await unitOfWork.fixtureWorkflows.save(
      createFixtureWorkflow({
        fixtureId,
        ingestionStatus: "succeeded",
        oddsStatus: "succeeded",
        enrichmentStatus: "pending",
        candidateStatus: "pending",
        predictionStatus: "pending",
        parlayStatus: "pending",
        validationStatus: "pending",
        isCandidate: false,
        manualSelectionStatus: input.manualSelectionStatus ?? "none",
        ...(input.manualReason !== undefined ? { manualSelectionReason: input.manualReason } : {}),
        selectionOverride: input.selectionOverride ?? "none",
        ...(input.overrideReason !== undefined ? { overrideReason: input.overrideReason } : {}),
      }),
    );

    if ((input.manualSelectionStatus ?? "none") !== "none") {
      await unitOfWork.auditEvents.save({
        id: `audit:${fixtureId}:manual-selection`,
        aggregateType: "fixture-workflow",
        aggregateId: fixtureId,
        eventType: "fixture-workflow.manual-selection.updated",
        actor: "ops-user",
        payload: {
          status: input.manualSelectionStatus,
          reason: input.manualReason ?? null,
        },
        occurredAt: workflow.updatedAt,
        createdAt: workflow.updatedAt,
        updatedAt: workflow.updatedAt,
      });
    }

    if ((input.selectionOverride ?? "none") !== "none") {
      await unitOfWork.auditEvents.save({
        id: `audit:${fixtureId}:selection-override`,
        aggregateType: "fixture-workflow",
        aggregateId: fixtureId,
        eventType: "fixture-workflow.selection-override.updated",
        actor: "public-api",
        payload: {
          mode: input.selectionOverride,
          reason: input.overrideReason ?? null,
        },
        occurredAt: workflow.updatedAt,
        createdAt: workflow.updatedAt,
        updatedAt: workflow.updatedAt,
      });
    }
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

test("router registers ingest workflows", async () => {
  const router = createHermesJobRouter();
  const publicApiModule = await import("@gana-v8/public-api");

  assert.deepEqual([...router.intents()].sort(), ["ingest-fixtures", "ingest-odds"]);
  assert.match(describeWorkspace(), /hermes-control-plane/);
  assert.equal(typeof publicApiModule.findFixtureOpsById, "function");
  assert.equal(typeof publicApiModule.loadOperationSnapshotFromUnitOfWork, "function");
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

test("createPersistedTaskQueue runs a persisted task lifecycle through the shared queue adapter", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = createPrismaClient(databaseUrl);
  const taskPrefix = `hermes-test-queue-adapter-${Date.now()}`;
  const queue = createPersistedTaskQueue(databaseUrl);

  try {
    await queue.enqueue({
      id: `${taskPrefix}-validation`,
      kind: "validation",
      payload: { source: "test" },
      now: new Date("2026-04-16T11:00:00.000Z"),
    });

    const claim = await queue.claimNext(undefined, new Date("2026-04-16T11:01:00.000Z"));
    assert.ok(claim);
    assert.equal(claim.task.kind, "validation");
    assert.equal(claim.taskRun.attemptNumber, 1);

    const completed = await queue.complete(
      claim.task.id,
      claim.taskRun.id,
      new Date("2026-04-16T11:02:00.000Z"),
    );
    assert.equal(completed.task.status, "succeeded");
    assert.equal(completed.task.triggerKind, "system");
    assert.equal(completed.task.maxAttempts, 3);
    assert.equal(completed.taskRun.status, "succeeded");
    assert.equal(completed.taskRun.workerName, "queue-adapter");
    assert.deepEqual(completed.taskRun.result, { status: "succeeded" });
    assert.equal(completed.task.attempts.length, 1);
    assert.equal(completed.task.attempts[0]?.startedAt, "2026-04-16T11:01:00.000Z");
    assert.equal(completed.task.attempts[0]?.finishedAt, "2026-04-16T11:02:00.000Z");

    const summary = await queue.summary();
    assert.ok(summary.succeeded >= 1);
  } finally {
    await queue.close();
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

test("maybeClaimNextPersistedTask orders ready queued tasks by scheduledFor, priority, and createdAt", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = createPrismaClient(databaseUrl);
  const taskPrefix = `hermes-test-enqueue-${Date.now()}`;

  try {
    const immediateLowPriority = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-immediate-low`,
      kind: "research",
      payload: { fixtureId: "fx-123", prompt: "immediate low" },
      now: new Date("2026-04-16T10:00:00.000Z"),
    });
    const immediateHighPriority = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-immediate-high`,
      kind: "prediction",
      payload: { fixtureId: "fx-123", market: "moneyline" },
      now: new Date("2026-04-16T10:01:00.000Z"),
      priority: 10,
    });
    const scheduledLowPriority = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-scheduled-low`,
      kind: "validation",
      payload: { target: "low-priority" },
      now: new Date("2026-04-16T10:02:00.000Z"),
      scheduledFor: new Date("2026-04-16T10:04:00.000Z"),
      priority: 1,
    });
    const scheduledHighPriority = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-scheduled-high`,
      kind: "prediction",
      payload: { fixtureId: "fx-123", market: "moneyline" },
      now: new Date("2026-04-16T10:03:00.000Z"),
      scheduledFor: new Date("2026-04-16T10:04:00.000Z"),
      priority: 5,
    });
    await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-future`,
      kind: "research",
      payload: { fixtureId: "fx-123", prompt: "future task" },
      now: new Date("2026-04-16T10:04:00.000Z"),
      scheduledFor: new Date("2026-04-16T10:10:00.000Z"),
      priority: 100,
    });

    const claimNow = new Date("2026-04-16T10:05:00.000Z");
    const firstClaim = await maybeClaimNextPersistedTask(databaseUrl, undefined, claimNow);
    const secondClaim = await maybeClaimNextPersistedTask(databaseUrl, undefined, claimNow);
    const thirdClaim = await maybeClaimNextPersistedTask(databaseUrl, undefined, claimNow);
    const fourthClaim = await maybeClaimNextPersistedTask(databaseUrl, undefined, claimNow);
    const exhausted = await maybeClaimNextPersistedTask(databaseUrl, undefined, claimNow);

    assert.ok(firstClaim);
    assert.ok(secondClaim);
    assert.ok(thirdClaim);
    assert.ok(fourthClaim);
    assert.equal(exhausted, null);
    assert.deepEqual(
      [firstClaim.task.id, secondClaim.task.id, thirdClaim.task.id, fourthClaim.task.id],
      [
        immediateHighPriority.id,
        immediateLowPriority.id,
        scheduledHighPriority.id,
        scheduledLowPriority.id,
      ],
    );
    assert.deepEqual(
      [
        firstClaim.taskRun.attemptNumber,
        secondClaim.taskRun.attemptNumber,
        thirdClaim.taskRun.attemptNumber,
        fourthClaim.taskRun.attemptNumber,
      ],
      [1, 1, 1, 1],
    );
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

test("maybeClaimNextPersistedTask increments attempt number from existing task runs", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = createPrismaClient(databaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  const taskPrefix = `hermes-test-attempt-${Date.now()}`;

  try {
    const queuedTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-prediction`,
      kind: "prediction",
      payload: { fixtureId: "fx-999", market: "totals" },
      now: new Date("2026-04-16T12:00:00.000Z"),
    });

    await unitOfWork.taskRuns.save(
      createTaskRun({
        id: `${queuedTask.id}:attempt:3`,
        taskId: queuedTask.id,
        attemptNumber: 3,
        status: "failed",
        startedAt: "2026-04-16T12:01:00.000Z",
        finishedAt: "2026-04-16T12:02:00.000Z",
        error: "previous failure",
        createdAt: "2026-04-16T12:01:00.000Z",
        updatedAt: "2026-04-16T12:02:00.000Z",
      }),
    );

    const claimedTask = await maybeClaimNextPersistedTask(
      databaseUrl,
      undefined,
      new Date("2026-04-16T12:03:00.000Z"),
    );

    assert.ok(claimedTask);
    assert.equal(claimedTask.task.id, queuedTask.id);
    assert.equal(claimedTask.taskRun.attemptNumber, 4);
    assert.equal(claimedTask.taskRun.id, `${queuedTask.id}:attempt:4`);
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

test("requeuePersistedTask requeues failed and cancelled tasks without deleting task run history", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = createPrismaClient(databaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  const taskPrefix = `hermes-test-requeue-${Date.now()}`;

  try {
    const failedTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-failed`,
      kind: "prediction",
      payload: { fixtureId: "fx-rq-1", market: "moneyline" },
      now: new Date("2026-04-16T13:00:00.000Z"),
    });
    await prisma.task.update({
      where: { id: failedTask.id },
      data: {
        status: "failed",
        updatedAt: new Date("2026-04-16T13:03:00.000Z"),
      },
    });
    await unitOfWork.taskRuns.save(
      createTaskRun({
        id: `${failedTask.id}:attempt:1`,
        taskId: failedTask.id,
        attemptNumber: 1,
        status: "failed",
        startedAt: "2026-04-16T13:01:00.000Z",
        finishedAt: "2026-04-16T13:02:00.000Z",
        error: "first failure",
        createdAt: "2026-04-16T13:01:00.000Z",
        updatedAt: "2026-04-16T13:02:00.000Z",
      }),
    );
    await unitOfWork.taskRuns.save(
      createTaskRun({
        id: `${failedTask.id}:attempt:2`,
        taskId: failedTask.id,
        attemptNumber: 2,
        status: "failed",
        startedAt: "2026-04-16T13:02:30.000Z",
        finishedAt: "2026-04-16T13:03:00.000Z",
        error: "second failure",
        createdAt: "2026-04-16T13:02:30.000Z",
        updatedAt: "2026-04-16T13:03:00.000Z",
      }),
    );

    const cancelledTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-cancelled`,
      kind: "research",
      payload: { fixtureId: "fx-rq-2", prompt: "retry me" },
      now: new Date("2026-04-16T14:00:00.000Z"),
    });
    await prisma.task.update({
      where: { id: cancelledTask.id },
      data: {
        status: "cancelled",
        updatedAt: new Date("2026-04-16T14:02:00.000Z"),
      },
    });
    await unitOfWork.taskRuns.save(
      createTaskRun({
        id: `${cancelledTask.id}:attempt:1`,
        taskId: cancelledTask.id,
        attemptNumber: 1,
        status: "cancelled",
        startedAt: "2026-04-16T14:01:00.000Z",
        finishedAt: "2026-04-16T14:02:00.000Z",
        createdAt: "2026-04-16T14:01:00.000Z",
        updatedAt: "2026-04-16T14:02:00.000Z",
      }),
    );

    const failedRequeuedAt = new Date("2026-04-16T15:00:00.000Z");
    const failedRequeued = await requeuePersistedTask(databaseUrl, failedTask.id, failedRequeuedAt);
    const cancelledRequeued = await requeuePersistedTask(
      databaseUrl,
      cancelledTask.id,
      new Date("2026-04-16T15:05:00.000Z"),
    );

    const failedRunsAfter = await unitOfWork.taskRuns.findByTaskId(failedTask.id);
    const cancelledRunsAfter = await unitOfWork.taskRuns.findByTaskId(cancelledTask.id);

    assert.equal(failedRequeued.id, failedTask.id);
    assert.equal(failedRequeued.status, "queued");
    assert.equal(failedRequeued.updatedAt, failedRequeuedAt.toISOString());
    assert.equal(failedRunsAfter.length, 2);
    assert.deepEqual(
      failedRunsAfter.map((taskRun) => taskRun.id),
      [`${failedTask.id}:attempt:1`, `${failedTask.id}:attempt:2`],
    );
    assert.equal(cancelledRequeued.id, cancelledTask.id);
    assert.equal(cancelledRequeued.status, "queued");
    assert.equal(cancelledRequeued.updatedAt, "2026-04-16T15:05:00.000Z");
    assert.equal(cancelledRunsAfter.length, 1);
    assert.equal(cancelledRunsAfter[0]?.id, `${cancelledTask.id}:attempt:1`);
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

test("requeuePersistedTask rejects succeeded tasks and missing task ids with clear errors", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = createPrismaClient(databaseUrl);
  const taskPrefix = `hermes-test-requeue-errors-${Date.now()}`;

  try {
    const succeededTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-succeeded`,
      kind: "validation",
      payload: { target: "finished" },
      now: new Date("2026-04-16T16:00:00.000Z"),
    });
    await prisma.task.update({
      where: { id: succeededTask.id },
      data: {
        status: "succeeded",
        updatedAt: new Date("2026-04-16T16:02:00.000Z"),
      },
    });

    await assert.rejects(
      requeuePersistedTask(databaseUrl, succeededTask.id),
      /cannot be requeued from status succeeded/i,
    );
    await assert.rejects(
      requeuePersistedTask(databaseUrl, `${taskPrefix}-missing`),
      /persisted task .* was not found/i,
    );
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

test("loadAutomationOpsSummary exposes scoring eligibility and recent workflow audit trail via public-api exports", async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const prefix = `haos${Date.now().toString(36)}`;

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  try {
    const includedFixture = await createAutomationFixtureWithOdds(databaseUrl, prefix, "1");
    const excludedFixture = await createAutomationFixtureWithOdds(databaseUrl, prefix, "2");

    await createAutomationFixtureWorkflowOps(databaseUrl, includedFixture.fixtureId, {
      manualSelectionStatus: "selected",
      selectionOverride: "force-include",
      manualReason: "desk review",
      overrideReason: "priority slate",
    });
    await createAutomationFixtureWorkflowOps(databaseUrl, excludedFixture.fixtureId, {
      manualSelectionStatus: "rejected",
      manualReason: "bad market",
    });

    const summary = await loadAutomationOpsSummary(databaseUrl, {
      fixtureIds: [includedFixture.fixtureId, excludedFixture.fixtureId],
    });

    const included = summary.fixtures.find((fixture) => fixture.fixtureId === includedFixture.fixtureId);
    const excluded = summary.fixtures.find((fixture) => fixture.fixtureId === excludedFixture.fixtureId);

    assert.equal(summary.fixtures.length, 2);
    assert.ok(included);
    assert.ok(excluded);
    assert.equal(included?.scoringEligibility.eligible, true);
    assert.match(included?.scoringEligibility.reason ?? "", /force-included/i);
    assert.equal(included?.recentAuditEvents.length, 2);
    assert.equal(included?.recentAuditEvents[0]?.eventType, "fixture-workflow.manual-selection.updated");
    assert.equal(excluded?.scoringEligibility.eligible, false);
    assert.match(excluded?.scoringEligibility.reason ?? "", /force-excluded/i);
  } finally {
    await cleanupAutomationArtifacts(databaseUrl, prefix);
  }
});
