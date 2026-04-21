import assert from "node:assert/strict";
import test from "node:test";

import {
  createAiRun,
  createDailyAutomationPolicy,
  createFixture,
  createFixtureWorkflow,
  createLeagueCoveragePolicy,
  createOpaqueTaskRunId,
  createPrediction,
  createTask,
  createTaskRun,
  createTeamCoveragePolicy,
} from "@gana-v8/domain-core";
import { runLiveIngestion } from "@gana-v8/ingestion-worker";
import { PrismaClient } from "@prisma/client";
import type { RawFixtureRecord, RawOddsMarketRecord } from "@gana-v8/source-connectors";
import { createPrismaUnitOfWork } from "@gana-v8/storage-adapters";

import {
  buildHermesCronSpecs,
  createPersistedTaskQueue,
  createHermesJobRouter,
  describeWorkspace,
  enqueuePersistedTask,
  enqueuePredictionForEligibleFixtures,
  loadAutomationOpsSummary,
  loadHermesRuntimeConfig,
  loadLiveIngestionOpsSummary,
  loadPersistedTaskSummary,
  maybeClaimNextPersistedTask,
  requeuePersistedTask,
  runAutomationCycle,
  runDemoControlPlane,
  runNextPersistedTask,
} from "../src/index.js";

const TEST_RUNTIME_ENV = {
  NODE_ENV: "test",
} as const;

const createPrismaClient = (databaseUrl: string) => new PrismaClient({ datasourceUrl: databaseUrl });
const databaseUrl = process.env.DATABASE_URL;
const testWithDatabase = (
  name: string,
  fn: (databaseUrl: string) => Promise<void> | void,
) =>
  test(name, { skip: databaseUrl ? false : "requires DATABASE_URL" }, async () => {
    await fn(databaseUrl!);
  });

const createAutomationFixtureWithOdds = async (
  databaseUrl: string,
  prefix: string,
  suffix: string,
  options: {
    readonly competition?: string;
    readonly homeTeam?: string;
    readonly awayTeam?: string;
    readonly providerLeagueId?: string;
    readonly providerHomeTeamId?: string;
    readonly providerAwayTeamId?: string;
    readonly homePrice?: number;
    readonly drawPrice?: number;
    readonly awayPrice?: number;
  } = {},
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
        competition: options.competition ?? "Automation Test League",
        homeTeam: options.homeTeam ?? `Home ${suffix}`,
        awayTeam: options.awayTeam ?? `Away ${suffix}`,
        scheduledAt: `2099-01-0${suffix}T18:00:00.000Z`,
        status: "scheduled",
        metadata: {
          providerCode: "api-football",
          providerFixtureId,
          providerLeagueId: options.providerLeagueId ?? `${prefix}-league-${suffix}`,
          providerHomeTeamId: options.providerHomeTeamId ?? `${prefix}-home-${suffix}`,
          providerAwayTeamId: options.providerAwayTeamId ?? `${prefix}-away-${suffix}`,
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
              priceDecimal: options.homePrice ?? 1.8,
            },
            {
              id: `${prefix}-odds-${suffix}-draw`,
              index: 1,
              selectionKey: "draw",
              label: "draw",
              priceDecimal: options.drawPrice ?? 3.7,
            },
            {
              id: `${prefix}-odds-${suffix}-away`,
              index: 2,
              selectionKey: "away",
              label: "away",
              priceDecimal: options.awayPrice ?? 4.9,
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

const createAutomationCoverageKeys = (prefix: string) => ({
  leagueKey: `league-${prefix}`,
  teamKey: `team-${prefix}`,
});

const createAutomationCoveragePolicies = async (
  databaseUrl: string,
  prefix: string,
  options: {
    readonly leagueKey?: string;
    readonly teamKey?: string;
    readonly leagueName?: string;
    readonly teamName?: string;
    readonly season?: number;
  } = {},
): Promise<void> => {
  const prisma = createPrismaClient(databaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  const coverageKeys = createAutomationCoverageKeys(prefix);

  try {
    await unitOfWork.leagueCoveragePolicies.save(
      createLeagueCoveragePolicy({
        id: `${prefix}-league-policy`,
        provider: "api-football",
        leagueKey: options.leagueKey ?? coverageKeys.leagueKey,
        leagueName: options.leagueName ?? "Premier League",
        season: options.season ?? 2099,
        enabled: true,
        alwaysOn: true,
        priority: 90,
        marketsAllowed: ["moneyline"],
      }),
    );
    await unitOfWork.teamCoveragePolicies.save(
      createTeamCoveragePolicy({
        id: `${prefix}-team-policy`,
        provider: "api-football",
        teamKey: options.teamKey ?? coverageKeys.teamKey,
        teamName: options.teamName ?? "Liverpool",
        enabled: true,
        alwaysTrack: true,
        priority: 95,
        followHome: true,
        followAway: true,
        forceResearch: true,
      }),
    );
    await unitOfWork.dailyAutomationPolicies.save(
      createDailyAutomationPolicy({
        id: `${prefix}-daily-policy`,
        policyName: `${prefix}-default-daily-policy`,
        enabled: true,
        timezone: "America/Guatemala",
        minAllowedOdd: 1.2,
        defaultMaxFixturesPerRun: 30,
        defaultLookaheadHours: 24,
        defaultLookbackHours: 6,
        requireTrackedLeagueOrTeam: true,
        allowManualInclusionBypass: true,
      }),
    );
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
    await prisma.leagueCoveragePolicy.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.teamCoveragePolicy.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.dailyAutomationPolicy.deleteMany({ where: { id: { startsWith: prefix } } });
  } finally {
    await prisma.$disconnect();
  }
};

const cleanupAutomationArtifactsByResourceIds = async (
  databaseUrl: string,
  input: {
    readonly fixtureIds?: readonly string[];
    readonly batchIds?: readonly string[];
    readonly taskIdPrefix?: string;
    readonly policyPrefix?: string;
  },
): Promise<void> => {
  const prisma = createPrismaClient(databaseUrl);
  const fixtureIds = [...new Set(input.fixtureIds ?? [])];
  const batchIds = [...new Set(input.batchIds ?? [])];

  try {
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
      await prisma.task.findMany({
        select: {
          id: true,
          payload: true,
        },
      })
    )
      .filter((task) => {
        const payload = task.payload as Record<string, unknown>;
        const payloadFixtureId = typeof payload.fixtureId === "string" ? payload.fixtureId : null;
        const payloadFixtureIds = Array.isArray(payload.fixtureIds)
          ? payload.fixtureIds.filter((value): value is string => typeof value === "string")
          : [];
        const payloadBatchId = typeof payload.batchId === "string" ? payload.batchId : null;

        return (
          (input.taskIdPrefix ? task.id.startsWith(input.taskIdPrefix) : false) ||
          (payloadFixtureId !== null && fixtureIds.includes(payloadFixtureId)) ||
          payloadFixtureIds.some((fixtureId) => fixtureIds.includes(fixtureId)) ||
          (payloadBatchId !== null && batchIds.includes(payloadBatchId))
        );
      })
      .map((task) => task.id);

    if (taskIds.length) {
      await prisma.taskRun.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    }

    const auditAggregateIds = [...fixtureIds, ...predictionIds, ...parlayIds, ...taskIds];
    if (auditAggregateIds.length) {
      await prisma.auditEvent.deleteMany({ where: { aggregateId: { in: auditAggregateIds } } });
    }

    if (batchIds.length || fixtureIds.length) {
      await prisma.oddsSnapshot.deleteMany({
        where: {
          OR: [
            ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
            ...(fixtureIds.length ? [{ fixtureId: { in: fixtureIds } }] : []),
          ],
        },
      });
    }

    if (batchIds.length) {
      await prisma.rawIngestionBatch.deleteMany({ where: { id: { in: batchIds } } });
    }

    if (fixtureIds.length) {
      await prisma.fixture.deleteMany({ where: { id: { in: fixtureIds } } });
    }

    if (input.policyPrefix) {
      await prisma.leagueCoveragePolicy.deleteMany({ where: { id: { startsWith: input.policyPrefix } } });
      await prisma.teamCoveragePolicy.deleteMany({ where: { id: { startsWith: input.policyPrefix } } });
      await prisma.dailyAutomationPolicy.deleteMany({ where: { id: { startsWith: input.policyPrefix } } });
    }
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
  const router = createHermesJobRouter(loadHermesRuntimeConfig(TEST_RUNTIME_ENV));
  const publicApiModule = await import("@gana-v8/public-api");

  assert.deepEqual([...router.intents()].sort(), ["ingest-fixtures", "ingest-odds"]);
  assert.match(describeWorkspace(), /hermes-control-plane/);
  assert.equal(typeof publicApiModule.findFixtureOpsById, "function");
  assert.equal(typeof publicApiModule.loadOperationSnapshotFromUnitOfWork, "function");
});

test("runDemoControlPlane dispatches fixture and odds demo jobs", async () => {
  const summary = await runDemoControlPlane(new Date("2026-04-15T12:00:00.000Z"), { env: TEST_RUNTIME_ENV });

  assert.equal(summary.queuedBeforeRun, 2);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.runtime.appEnv, "test");
  assert.equal(summary.runtime.profile, "ci-smoke");
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
      ...TEST_RUNTIME_ENV,
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_LOG_LEVEL: "warn",
      GANA_PROVIDER_BASE_URL: "https://replay.gana.test/v1",
      GANA_RUNTIME_PROFILE: "ci-regression",
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

testWithDatabase("loadPersistedTaskSummary reads persisted task status buckets", async (databaseUrl) => {
  const summary = await loadPersistedTaskSummary(databaseUrl);

  assert.ok(summary.total >= 1);
  assert.ok(summary.succeeded >= 1);
  assert.ok(summary.latestTasks.length >= 1);
});

testWithDatabase("createPersistedTaskQueue runs a persisted task lifecycle through the shared queue adapter", async (databaseUrl) => {
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

testWithDatabase("maybeClaimNextPersistedTask orders ready queued tasks by scheduledFor, priority, and createdAt", async (databaseUrl) => {
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

testWithDatabase("maybeClaimNextPersistedTask increments attempt number from existing task runs", async (databaseUrl) => {
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
    assert.match(claimedTask.taskRun.id, /^trn_[a-f0-9]{16}$/);
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

testWithDatabase("maybeClaimNextPersistedTask recovers expired running tasks whose lease window elapsed", async (databaseUrl) => {
  const prisma = createPrismaClient(databaseUrl);
  const taskPrefix = `hermes-test-expired-lease-${Date.now()}`;
  const queue = createPersistedTaskQueue(databaseUrl);

  try {
    const queuedTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-prediction`,
      kind: "prediction",
      payload: { fixtureId: "fx-expired-lease", market: "moneyline" },
      now: new Date("2026-04-16T12:00:00.000Z"),
    });

    const firstClaim = await queue.claimNext(undefined, new Date("2026-04-16T12:01:00.000Z"));
    assert.ok(firstClaim);
    assert.equal(firstClaim.task.id, queuedTask.id);
    assert.equal(firstClaim.taskRun.attemptNumber, 1);

    const reclaimed = await maybeClaimNextPersistedTask(
      databaseUrl,
      undefined,
      new Date("2026-04-16T12:06:01.000Z"),
    );

    assert.ok(reclaimed);
    assert.equal(reclaimed.task.id, queuedTask.id);
    assert.equal(reclaimed.taskRun.attemptNumber, 2);
    assert.match(reclaimed.taskRun.id, /^trn_[a-f0-9]{16}$/);
  } finally {
    await queue.close();
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

testWithDatabase("requeuePersistedTask requeues failed and cancelled tasks without deleting task run history", async (databaseUrl) => {
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

testWithDatabase("requeuePersistedTask rejects succeeded tasks and missing task ids with clear errors", async (databaseUrl) => {
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

testWithDatabase("runNextPersistedTask processes prediction and validation tasks deterministically", async (databaseUrl) => {
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
    }, {
      now: new Date("2026-04-16T11:03:00.000Z"),
    });

    assert.ok(secondResult);
    assert.equal(secondResult.task.id, `${taskPrefix}-prediction`);
    assert.equal(secondResult.task.status, "queued");
    assert.equal(secondResult.task.triggerKind, "retry");
    assert.equal(secondResult.taskRun.status, "failed");
    assert.match(secondResult.taskRun.error ?? "", /model unavailable/);
    assert.equal(secondResult.error?.message, "model unavailable");

    const validationResult = await runNextPersistedTask(databaseUrl, {
      research: async () => ({ summary: "unexpected" }),
      prediction: async () => ({ summary: "unexpected" }),
      validation: async () => ({ settledPredictionCount: 3 }),
    }, {
      now: new Date("2026-04-16T11:03:30.000Z"),
    });

    assert.ok(validationResult);
    assert.equal(validationResult.task.id, `${taskPrefix}-validation`);
    assert.equal(validationResult.task.status, "succeeded");
    assert.equal(validationResult.taskRun.status, "succeeded");
    assert.equal(validationResult.output.settledPredictionCount, 3);

    const exhausted = await runNextPersistedTask(
      databaseUrl,
      {
        research: async () => ({}),
        prediction: async () => ({}),
        validation: async () => ({}),
      },
      { now: new Date("2026-04-16T11:03:31.000Z") },
    );

    assert.equal(exhausted, null);
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

testWithDatabase("runNextPersistedTask supports sandbox replay persisted tasks", async (databaseUrl) => {
  const prisma = createPrismaClient(databaseUrl);
  const taskPrefix = `hermes-test-sandbox-${Date.now()}`;

  try {
    const sandboxTask = await enqueuePersistedTask(databaseUrl, {
      id: `${taskPrefix}-sandbox-replay`,
      kind: "sandbox-replay",
      payload: { fixtureId: "fx-sandbox-001", replayId: `${taskPrefix}-replay` },
      now: new Date("2026-04-16T11:10:00.000Z"),
    });

    const result = await runNextPersistedTask(databaseUrl, {
      research: async () => ({ summary: "unexpected" }),
      prediction: async () => ({ summary: "unexpected" }),
      "sandbox-replay": async (task) => ({
        replayedFixtureId: String(task.payload.fixtureId),
      }),
    });

    assert.ok(result);
    assert.equal(result.task.id, sandboxTask.id);
    assert.equal(result.task.kind, "sandbox-replay");
    assert.equal(result.task.status, "succeeded");
    assert.equal(result.taskRun.status, "succeeded");
    assert.equal(result.output.replayedFixtureId, "fx-sandbox-001");
  } finally {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: taskPrefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: taskPrefix } } });
    await prisma.$disconnect();
  }
});

testWithDatabase("enqueuePredictionForEligibleFixtures creates deterministic persisted scoring tasks without duplicates", async (databaseUrl) => {
  const prefix = `hae${Date.now().toString(36)}`;
  const coverageKeys = createAutomationCoverageKeys(prefix);

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  try {
    await createAutomationCoveragePolicies(databaseUrl, prefix, coverageKeys);
    const fixtureOne = await createAutomationFixtureWithOdds(databaseUrl, prefix, "1", {
      competition: "Premier League",
      homeTeam: "Liverpool",
      awayTeam: "Chelsea",
      providerLeagueId: coverageKeys.leagueKey,
      providerHomeTeamId: coverageKeys.teamKey,
      providerAwayTeamId: "49",
      homePrice: 1.8,
      drawPrice: 3.7,
      awayPrice: 4.9,
    });
    const fixtureTwo = await createAutomationFixtureWithOdds(databaseUrl, prefix, "2", {
      competition: "Premier League",
      homeTeam: "Liverpool",
      awayTeam: "Arsenal",
      providerLeagueId: coverageKeys.leagueKey,
      providerHomeTeamId: coverageKeys.teamKey,
      providerAwayTeamId: "50",
      homePrice: 1.9,
      drawPrice: 3.8,
      awayPrice: 4.2,
    });

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

testWithDatabase("enqueuePredictionForEligibleFixtures applies coverage watchlists and blocks fixtures below min allowed odd", async (databaseUrl) => {
  const prefix = `hacov${Date.now().toString(36)}`;
  const coverageKeys = createAutomationCoverageKeys(prefix);

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  try {
    await createAutomationCoveragePolicies(databaseUrl, prefix, coverageKeys);
    const trackedFixture = await createAutomationFixtureWithOdds(databaseUrl, prefix, "1", {
      competition: "Premier League",
      homeTeam: "Liverpool",
      awayTeam: "Chelsea",
      providerLeagueId: coverageKeys.leagueKey,
      providerHomeTeamId: coverageKeys.teamKey,
      providerAwayTeamId: "49",
      homePrice: 1.11,
      drawPrice: 5.1,
      awayPrice: 8.2,
    });
    const untrackedFixture = await createAutomationFixtureWithOdds(databaseUrl, prefix, "2", {
      competition: "Untracked League",
      homeTeam: "Home 2",
      awayTeam: "Away 2",
      providerLeagueId: "999",
      providerHomeTeamId: "9991",
      providerAwayTeamId: "9992",
      homePrice: 1.8,
      drawPrice: 3.7,
      awayPrice: 4.9,
    });

    const result = await enqueuePredictionForEligibleFixtures(databaseUrl, {
      now: new Date("2099-01-01T10:00:00.000Z"),
      fixtureIds: [trackedFixture.fixtureId, untrackedFixture.fixtureId],
      maxFixtures: 2,
    });

    assert.equal(result.enqueuedCount, 0);
    assert.equal(result.eligibleFixtureCount, 0);
    assert.equal(result.skippedFixtures.length, 2);
    assert.equal(
      result.skippedFixtures.some(
        (fixture) => fixture.fixtureId === trackedFixture.fixtureId && /below allowed threshold/i.test(fixture.reason),
      ),
      true,
    );
    assert.equal(
      result.skippedFixtures.some(
        (fixture) => fixture.fixtureId === untrackedFixture.fixtureId && /tracked league or watched team/i.test(fixture.reason),
      ),
      true,
    );
  } finally {
    await cleanupAutomationArtifacts(databaseUrl, prefix);
  }
});

testWithDatabase("runAutomationCycle enqueues research and scoring tasks, persists predictions, publishes a parlay, and executes validation", async (databaseUrl) => {
  const prefix = `har${Date.now().toString(36)}`;
  const coverageKeys = createAutomationCoverageKeys(prefix);

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  try {
    await createAutomationCoveragePolicies(databaseUrl, prefix, coverageKeys);

    const fixtureOne = await createAutomationFixtureWithOdds(databaseUrl, prefix, "1", {
      competition: "Premier League",
      providerLeagueId: coverageKeys.leagueKey,
      homeTeam: "Liverpool",
      providerHomeTeamId: coverageKeys.teamKey,
      homePrice: 1.85,
      drawPrice: 3.7,
      awayPrice: 4.6,
    });
    const fixtureTwo = await createAutomationFixtureWithOdds(databaseUrl, prefix, "2", {
      competition: "Premier League",
      providerLeagueId: coverageKeys.leagueKey,
      homePrice: 1.92,
      drawPrice: 3.5,
      awayPrice: 4.1,
    });

    const summary = await runAutomationCycle(databaseUrl, {
      env: TEST_RUNTIME_ENV,
      now: new Date("2099-01-01T10:00:00.000Z"),
      fixtureIds: [fixtureOne.fixtureId, fixtureTwo.fixtureId],
      maxFixtures: 2,
      researchGeneratedAt: "2099-01-01T10:04:00.000Z",
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
      const workflows = await prisma.fixtureWorkflow.findMany({
        where: { fixtureId: { in: [fixtureOne.fixtureId, fixtureTwo.fixtureId] } },
      });
      const fixtures = await prisma.fixture.findMany({
        where: { id: { in: [fixtureOne.fixtureId, fixtureTwo.fixtureId] } },
      });

      assert.equal(summary.enqueuedResearch.enqueuedCount, 2);
      assert.equal(summary.processedResearchCount, 2);
      assert.equal(summary.researchExecutions.every((execution) => execution.task.status === "succeeded"), true);
      assert.equal(summary.enqueuedPredictions.enqueuedCount, 2);
      assert.equal(summary.processedPredictionCount, 2);
      assert.equal(summary.predictionExecutions.every((execution) => execution.task.status === "succeeded"), true);
      assert.equal(predictions.length, 2);
      assert.equal(predictions.every((prediction) => prediction.status === "published"), true);
      assert.equal(workflows.length, 2);
      assert.equal(
        workflows.every(
          (workflow) =>
            workflow.enrichmentStatus === "succeeded" &&
            workflow.candidateStatus === "succeeded" &&
            workflow.predictionStatus === "succeeded",
        ),
        true,
      );
      assert.equal(
        fixtures.every((fixture) => {
          const metadata = fixture.metadata as Record<string, unknown>;
          return (
            metadata.researchGeneratedAt === "2099-01-01T10:04:00.000Z" &&
            typeof metadata.researchRecommendedLean === "string" &&
            typeof metadata.featureScoreHome === "string"
          );
        }),
        true,
      );
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

testWithDatabase("runAutomationCycle processes live-ingested fixtures end-to-end without manual fixture seeding", async (databaseUrl) => {
  const prefix = `hail${Date.now().toString(36)}`;
  const coverageKeys = createAutomationCoverageKeys(prefix);
  const providerFixtureIds = [`${prefix}-fixture-1`, `${prefix}-fixture-2`] as const;
  const fixtureIds = providerFixtureIds.map((providerFixtureId) => `fixture:api-football:${providerFixtureId}`);
  const fixtures: readonly RawFixtureRecord[] = [
    {
      recordType: "fixture",
      providerFixtureId: providerFixtureIds[0],
      providerCode: "api-football",
      status: "scheduled",
      scheduledAt: "2099-01-02T18:00:00.000Z",
      competition: {
        providerCompetitionId: coverageKeys.leagueKey,
        name: "Premier League",
        country: "England",
        season: "2099",
      },
      homeTeam: {
        providerTeamId: coverageKeys.teamKey,
        name: "Liverpool",
        shortName: "LIV",
        country: "England",
      },
      awayTeam: {
        providerTeamId: `${prefix}-away-1`,
        name: "Away One",
        shortName: "AW1",
        country: "England",
      },
      sourceUpdatedAt: "2099-01-01T09:55:00.000Z",
      payload: { source: "hermes-control-plane.test" },
    },
    {
      recordType: "fixture",
      providerFixtureId: providerFixtureIds[1],
      providerCode: "api-football",
      status: "scheduled",
      scheduledAt: "2099-01-03T18:00:00.000Z",
      competition: {
        providerCompetitionId: coverageKeys.leagueKey,
        name: "Premier League",
        country: "England",
        season: "2099",
      },
      homeTeam: {
        providerTeamId: `${prefix}-home-2`,
        name: "Home Two",
        shortName: "HM2",
        country: "England",
      },
      awayTeam: {
        providerTeamId: `${prefix}-away-2`,
        name: "Away Two",
        shortName: "AW2",
        country: "England",
      },
      sourceUpdatedAt: "2099-01-01T09:56:00.000Z",
      payload: { source: "hermes-control-plane.test" },
    },
  ];
  const odds: readonly RawOddsMarketRecord[] = providerFixtureIds.flatMap((providerFixtureId, index) => [
    {
      recordType: "odds",
      providerFixtureId,
      providerCode: "api-football",
      bookmakerKey: "bet365",
      marketKey: "h2h",
      selections: [
        { key: "home", label: "home", priceDecimal: index === 0 ? 1.82 : 1.91 },
        { key: "draw", label: "draw", priceDecimal: index === 0 ? 3.65 : 3.45 },
        { key: "away", label: "away", priceDecimal: index === 0 ? 4.7 : 4.2 },
      ],
      sourceUpdatedAt: `2099-01-01T09:5${index + 7}:00.000Z`,
      payload: { source: "hermes-control-plane.test" },
    },
  ]);

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  const prisma = createPrismaClient(databaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  let batchIds: string[] = [];

  try {
    await createAutomationCoveragePolicies(databaseUrl, prefix, coverageKeys);

    const ingestionSummary = await runLiveIngestion({
      env: {
        ...TEST_RUNTIME_ENV,
        GANA_DEMO_MODE: "false",
        GANA_DRY_RUN: "false",
      },
      fixtures,
      marketKeys: ["h2h"],
      mode: "both",
      now: () => new Date("2099-01-01T10:00:00.000Z"),
      odds,
      oddsFixtureIds: providerFixtureIds,
      prismaClient: prisma,
      unitOfWork,
    });
    batchIds = ingestionSummary.results.flatMap((result) =>
      result.manifest.batch ? [result.manifest.batch.batchId] : [],
    );

    const summary = await runAutomationCycle(databaseUrl, {
      env: TEST_RUNTIME_ENV,
      now: new Date("2099-01-01T10:10:00.000Z"),
      fixtureIds,
      maxFixtures: 2,
      researchGeneratedAt: "2099-01-01T10:11:00.000Z",
      scoringGeneratedAt: "2099-01-01T10:12:00.000Z",
      parlayGeneratedAt: "2099-01-01T10:13:00.000Z",
      validationExecutedAt: "2099-01-01T10:14:00.000Z",
      validationTaskId: `${prefix}-validation-task`,
    });

    const persistedFixtures = await prisma.fixture.findMany({
      where: { id: { in: fixtureIds } },
    });
    const workflows = await prisma.fixtureWorkflow.findMany({
      where: { fixtureId: { in: fixtureIds } },
    });
    const predictions = await prisma.prediction.findMany({
      where: { fixtureId: { in: fixtureIds } },
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

    assert.equal(ingestionSummary.runtime.persistenceMode, "mysql");
    assert.equal(ingestionSummary.results.every((result) => result.status === "succeeded"), true);
    assert.equal(batchIds.length, 2);
    assert.equal(summary.enqueuedResearch.enqueuedCount, 2);
    assert.equal(summary.processedResearchCount, 2);
    assert.equal(summary.researchExecutions.every((execution) => execution.task.status === "succeeded"), true);
    assert.equal(summary.enqueuedPredictions.enqueuedCount, 2);
    assert.equal(summary.processedPredictionCount, 2);
    assert.equal(summary.predictionExecutions.every((execution) => execution.task.status === "succeeded"), true);
    assert.equal(persistedFixtures.length, 2);
    assert.equal(
      persistedFixtures.every((fixture) => {
        const metadata = fixture.metadata as Record<string, unknown>;
        return (
          metadata.providerFixtureId !== undefined &&
          metadata.researchGeneratedAt === "2099-01-01T10:11:00.000Z" &&
          metadata.researchSynthesisMode === "deterministic" &&
          typeof metadata.featureScoreHome === "string"
        );
      }),
      true,
    );
    assert.equal(workflows.length, 2);
    assert.equal(
      workflows.every(
        (workflow) =>
          workflow.enrichmentStatus === "succeeded" &&
          workflow.candidateStatus === "succeeded" &&
          workflow.predictionStatus === "succeeded",
      ),
      true,
    );
    assert.equal(predictions.length, 2);
    assert.equal(predictions.every((prediction) => prediction.status === "published"), true);
    assert.equal(summary.parlayResult.status, "persisted");
    assert.equal(parlays.length, 1);
    assert.equal(summary.validationExecution.task.status, "succeeded");
  } finally {
    await prisma.$disconnect();
    await cleanupAutomationArtifactsByResourceIds(databaseUrl, {
      fixtureIds,
      batchIds,
      policyPrefix: prefix,
      taskIdPrefix: prefix,
    });
  }
});

testWithDatabase("runAutomationCycle scopes publisher selection to predictions from the current automation cycle only", async (databaseUrl) => {
  const prefix = `hars${Date.now().toString(36)}`;
  const historicalPrefix = `${prefix}old`;
  const coverageKeys = createAutomationCoverageKeys(prefix);

  await cleanupAutomationArtifacts(databaseUrl, prefix);
  await cleanupAutomationArtifacts(databaseUrl, historicalPrefix);

  try {
    const fixtureOne = await createAutomationFixtureWithOdds(databaseUrl, prefix, "1", {
      competition: "Premier League",
      providerLeagueId: coverageKeys.leagueKey,
      homeTeam: "Liverpool",
      providerHomeTeamId: coverageKeys.teamKey,
      homePrice: 1.85,
      drawPrice: 3.7,
      awayPrice: 4.6,
    });
    const fixtureTwo = await createAutomationFixtureWithOdds(databaseUrl, prefix, "2", {
      competition: "Premier League",
      providerLeagueId: coverageKeys.leagueKey,
      homePrice: 1.92,
      drawPrice: 3.5,
      awayPrice: 4.1,
    });
    const blockedFixture = await createAutomationFixtureWithOdds(databaseUrl, prefix, "3", {
      competition: "Premier League",
      providerLeagueId: coverageKeys.leagueKey,
      homePrice: 1.12,
      drawPrice: 7.1,
      awayPrice: 16.5,
    });
    const historicalFixture = await createAutomationFixtureWithOdds(databaseUrl, historicalPrefix, "1", {
      competition: "Premier League",
      providerLeagueId: "39",
      homePrice: 2.5,
      drawPrice: 3.4,
      awayPrice: 2.8,
    });

    const prisma = createPrismaClient(databaseUrl);
    const unitOfWork = createPrismaUnitOfWork(prisma);
    try {
      await unitOfWork.leagueCoveragePolicies.save(
        createLeagueCoveragePolicy({
          id: `${prefix}-league-policy`,
          provider: "api-football",
          leagueKey: coverageKeys.leagueKey,
          leagueName: "Premier League",
          season: 2099,
          enabled: true,
          alwaysOn: true,
          priority: 90,
          marketsAllowed: ["moneyline"],
        }),
      );
      await unitOfWork.teamCoveragePolicies.save(
        createTeamCoveragePolicy({
          id: `${prefix}-team-policy`,
          provider: "api-football",
          teamKey: coverageKeys.teamKey,
          teamName: "Liverpool",
          enabled: true,
          alwaysTrack: true,
          priority: 95,
          followHome: true,
          followAway: true,
          forceResearch: true,
        }),
      );
      await unitOfWork.dailyAutomationPolicies.save(
        createDailyAutomationPolicy({
          id: `${prefix}-daily-policy`,
          policyName: `${prefix}-default-daily-policy`,
          enabled: true,
          timezone: "America/Guatemala",
          minAllowedOdd: 1.2,
          defaultMaxFixturesPerRun: 30,
          defaultLookaheadHours: 24,
          defaultLookbackHours: 6,
          requireTrackedLeagueOrTeam: true,
          allowManualInclusionBypass: true,
        }),
      );

      const historicalTask = await unitOfWork.tasks.save(
        createTask({
          id: `${historicalPrefix}-task-prediction`,
          kind: "prediction",
          status: "succeeded",
          priority: 99,
          payload: {
            fixtureId: historicalFixture.fixtureId,
            source: "scoring-worker",
            step: "score",
          },
          scheduledFor: "2099-01-01T09:30:00.000Z",
          createdAt: "2099-01-01T09:30:00.000Z",
          updatedAt: "2099-01-01T09:31:00.000Z",
        }),
      );
      const historicalAiRun = await unitOfWork.aiRuns.save(
        createAiRun({
          id: `${historicalPrefix}-airun`,
          taskId: historicalTask.id,
          provider: "internal",
          model: "deterministic-moneyline-v1",
          promptVersion: "scoring-worker-mvp-v1",
          status: "completed",
          outputRef: "historical.json",
          createdAt: "2099-01-01T09:31:00.000Z",
          updatedAt: "2099-01-01T09:31:00.000Z",
        }),
      );
      await unitOfWork.predictions.save(
        createPrediction({
          id: `${historicalPrefix}-prediction`,
          fixtureId: historicalFixture.fixtureId,
          aiRunId: historicalAiRun.id,
          market: "moneyline",
          outcome: "home",
          status: "published",
          confidence: 0.99,
          probabilities: { implied: 0.4, model: 0.75, edge: 0.35 },
          rationale: ["historical best pick"],
          publishedAt: "2099-01-01T09:32:00.000Z",
          createdAt: "2099-01-01T09:31:30.000Z",
          updatedAt: "2099-01-01T09:32:00.000Z",
        }),
      );

      const summary = await runAutomationCycle(databaseUrl, {
        env: TEST_RUNTIME_ENV,
        now: new Date("2099-01-01T10:00:00.000Z"),
        fixtureIds: [fixtureOne.fixtureId, fixtureTwo.fixtureId, blockedFixture.fixtureId],
        maxFixtures: 3,
        scoringGeneratedAt: "2099-01-01T10:05:00.000Z",
        parlayGeneratedAt: "2099-01-01T10:06:00.000Z",
        validationExecutedAt: "2099-01-01T10:07:00.000Z",
        validationTaskId: `${prefix}-validation-task`,
      });

      assert.equal(summary.enqueuedPredictions.enqueuedCount, 2);
      assert.equal(summary.enqueuedPredictions.skippedCount, 1);
      assert.equal(summary.enqueuedPredictions.skippedFixtures[0]?.fixtureId, blockedFixture.fixtureId);
      assert.equal(summary.parlayResult.status, "persisted");
      assert.deepEqual(
        summary.parlayResult.parlay?.legs.map((leg) => leg.fixtureId).sort(),
        [fixtureOne.fixtureId, fixtureTwo.fixtureId].sort(),
      );
      assert.equal(
        summary.parlayResult.parlay?.legs.some((leg) => leg.fixtureId === historicalFixture.fixtureId),
        false,
      );
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await cleanupAutomationArtifacts(databaseUrl, historicalPrefix);
    await cleanupAutomationArtifacts(databaseUrl, prefix);
  }
});

testWithDatabase("loadAutomationOpsSummary exposes scoring eligibility and recent workflow audit trail via public-api exports", async (databaseUrl) => {
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
    assert.deepEqual(
      [...(included?.recentAuditEvents.map((event) => event.eventType) ?? [])].sort(),
      [
        "fixture-workflow.manual-selection.updated",
        "fixture-workflow.selection-override.updated",
      ].sort(),
    );
    assert.equal(excluded?.scoringEligibility.eligible, false);
    assert.match(excluded?.scoringEligibility.reason ?? "", /force-excluded/i);
  } finally {
    await cleanupAutomationArtifacts(databaseUrl, prefix);
  }
});

testWithDatabase("loadLiveIngestionOpsSummary exposes persisted live ingestion runs via public-api read models", async (databaseUrl) => {
  const prefix = `hlis${Date.now().toString(36)}`;

  await cleanupAutomationArtifacts(databaseUrl, prefix);

  const prisma = createPrismaClient(databaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);

  try {
    const taskId = `${prefix}-task-live-fixtures`;
    const taskRunId = createOpaqueTaskRunId(taskId, 1);
    await unitOfWork.tasks.save({
      id: taskId,
      kind: "fixture-ingestion",
      status: "succeeded",
      triggerKind: "manual",
      priority: 80,
      payload: {
        league: "39",
        season: 2025,
        window: {
          start: "2026-04-20T00:00:00.000Z",
          end: "2026-04-21T00:00:00.000Z",
          granularity: "daily",
        },
        metadata: { labels: ["official", "live", "fixtures"], source: "ingestion-worker/live-runner" },
        traceId: `${prefix}-trace-live-fixtures`,
        workflowId: `${prefix}-wf-live-fixtures`,
      },
      attempts: [{ startedAt: "2026-04-20T12:00:00.000Z", finishedAt: "2026-04-20T12:01:00.000Z" }],
      scheduledFor: "2026-04-20T12:00:00.000Z",
      maxAttempts: 3,
      createdAt: "2026-04-20T12:00:00.000Z",
      updatedAt: "2026-04-20T12:01:00.000Z",
    });
    await unitOfWork.auditEvents.save({
      id: `${prefix}-audit-live-fixtures`,
      aggregateType: "task",
      aggregateId: taskId,
      eventType: "ingest-fixtures.succeeded",
      actor: "ingestion-worker",
      payload: {
        taskRunId,
        status: "succeeded",
        intent: "ingest-fixtures",
        workflowId: `${prefix}-wf-live-fixtures`,
        request: {
          league: "39",
          season: 2025,
          window: {
            start: "2026-04-20T00:00:00.000Z",
            end: "2026-04-21T00:00:00.000Z",
            granularity: "daily",
          },
          quirksApplied: ["api-football-season-inferred"],
        },
        provider: {
          endpointFamily: "fixtures",
          providerSource: "live-readonly",
          providerBaseUrl: "https://provider.example/v3",
          requestKind: "live-runner",
        },
        batchId: `${prefix}-batch-live-fixtures`,
        checksum: `${prefix}-checksum-live-fixtures`,
        observedRecords: 4,
        rawRefs: [`memory://${prefix}/fixtures.json`],
        snapshotId: `${prefix}-snapshot-live-fixtures`,
        warnings: [],
      },
      occurredAt: "2026-04-20T12:01:00.000Z",
      createdAt: "2026-04-20T12:01:00.000Z",
      updatedAt: "2026-04-20T12:01:00.000Z",
    });

    const summary = await loadLiveIngestionOpsSummary(databaseUrl, { taskIds: [taskId] });

    assert.equal(summary.runs.length, 1);
    assert.equal(summary.runs[0]?.taskId, taskId);
    assert.equal(summary.runs[0]?.taskRunId, taskRunId);
    assert.equal(summary.runs[0]?.provider.endpointFamily, "fixtures");
    assert.equal(summary.runs[0]?.provider.providerSource, "live-readonly");
    assert.equal(summary.runs[0]?.request?.league, "39");
    assert.equal(summary.runs[0]?.batch?.batchId, `${prefix}-batch-live-fixtures`);
  } finally {
    await prisma.$disconnect();
    await cleanupAutomationArtifacts(databaseUrl, prefix);
  }
});
