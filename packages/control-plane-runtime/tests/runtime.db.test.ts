import assert from "node:assert/strict";
import test from "node:test";

import { buildExampleCronSpecs } from "@gana-v8/orchestration-sdk";
import {
  createAiRun,
  createFixture,
  createFixtureWorkflow,
  createPrediction,
  createTask,
  createTaskRun,
} from "@gana-v8/domain-core";
import { PrismaClient } from "@prisma/client";
import {
  connectPrismaClientWithRetry,
  createPrismaUnitOfWork,
} from "@gana-v8/storage-adapters";

import {
  runDispatcherCycle,
  runRecoveryCycle,
  runSchedulerCycle,
} from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;

const testWithDatabase = (
  name: string,
  fn: (databaseUrl: string) => Promise<void> | void,
) =>
  test(
    name,
    { skip: databaseUrl ? false : "requires DATABASE_URL" },
    async () => {
      await fn(databaseUrl!);
    },
  );

const createPrismaClient = async (targetDatabaseUrl: string) =>
  connectPrismaClientWithRetry(
    new PrismaClient({ datasourceUrl: targetDatabaseUrl }),
  );

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

// Keep DB-backed evidence inside the ci-ephemeral runtime-release window.
const runtimeReleaseCiEvidenceNow = new Date("2100-01-02T00:00:00.000Z");

const shiftDateByMinutes = (value: Date, minutes: number): Date =>
  new Date(value.getTime() + minutes * 60 * 1000);

const toIsoString = (value: Date): string => value.toISOString();

const createFixtureWithOdds = async (
  targetDatabaseUrl: string,
  prefix: string,
  suffix: string,
  options: {
    readonly homePrice?: number;
    readonly drawPrice?: number;
    readonly awayPrice?: number;
    readonly selectionOverride?: "none" | "force-include" | "force-exclude";
    readonly referenceNow?: Date;
  } = {},
): Promise<{ fixtureId: string }> => {
  const fixtureId = `${prefix}-fixture-${suffix}`;
  const providerFixtureId = `${prefix}-provider-${suffix}`;
  const batchId = `${prefix}-batch-${suffix}`;
  const fixtureOffsetHours = Number.parseInt(suffix, 10) || 0;
  const referenceNow = options.referenceNow ?? runtimeReleaseCiEvidenceNow;
  const capturedAt = shiftDateByMinutes(referenceNow, -180);
  const createdAt = shiftDateByMinutes(referenceNow, -240);
  const scheduledAt = shiftDateByMinutes(
    referenceNow,
    (6 + fixtureOffsetHours) * 60,
  );

  const prisma = await createPrismaClient(targetDatabaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);

  try {
    await unitOfWork.fixtures.save(
      createFixture({
        id: fixtureId,
        sport: "football",
        competition: "Runtime Test League",
        homeTeam: `Home ${suffix}`,
        awayTeam: `Away ${suffix}`,
        scheduledAt: toIsoString(scheduledAt),
        status: "scheduled",
        metadata: {
          providerCode: "api-football",
          providerFixtureId,
          providerLeagueId: `${prefix}-league`,
          providerHomeTeamId: `${prefix}-home-${suffix}`,
          providerAwayTeamId: `${prefix}-away-${suffix}`,
        },
        createdAt: toIsoString(createdAt),
        updatedAt: toIsoString(createdAt),
      }),
    );

    if ((options.selectionOverride ?? "none") !== "none") {
      await unitOfWork.fixtureWorkflows.save(
        createFixtureWorkflow({
          fixtureId,
          ingestionStatus: "pending",
          oddsStatus: "pending",
          enrichmentStatus: "pending",
          candidateStatus: "pending",
          predictionStatus: "pending",
          parlayStatus: "pending",
          validationStatus: "pending",
          isCandidate: false,
          selectionOverride: options.selectionOverride ?? "none",
          createdAt: toIsoString(createdAt),
          updatedAt: toIsoString(createdAt),
        }),
      );
    }

    await prisma.rawIngestionBatch.create({
      data: {
        id: batchId,
        providerCode: "api-football",
        endpointFamily: "odds",
        sourceName: "control-plane-runtime.test",
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
        payload: { source: "control-plane-runtime.test" },
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
              priceDecimal: options.drawPrice ?? 3.6,
            },
            {
              id: `${prefix}-odds-${suffix}-away`,
              index: 2,
              selectionKey: "away",
              label: "away",
              priceDecimal: options.awayPrice ?? 4.4,
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

const seedHistoricalPublishedPrediction = async (
  targetDatabaseUrl: string,
  prefix: string,
  fixtureId: string,
  referenceNow: Date = runtimeReleaseCiEvidenceNow,
): Promise<void> => {
  const prisma = await createPrismaClient(targetDatabaseUrl);
  const unitOfWork = createPrismaUnitOfWork(prisma);
  const taskCreatedAt = shiftDateByMinutes(referenceNow, -31);
  const taskUpdatedAt = shiftDateByMinutes(referenceNow, -30);
  const aiRunCreatedAt = shiftDateByMinutes(referenceNow, -30);
  const predictionCreatedAt = shiftDateByMinutes(referenceNow, -29.5);
  const predictionPublishedAt = shiftDateByMinutes(referenceNow, -29);

  try {
    const historicalTask = await unitOfWork.tasks.save(
      createTask({
        id: `${prefix}-task-prediction`,
        kind: "prediction",
        status: "succeeded",
        priority: 99,
        payload: {
          fixtureId,
          source: "historical-fixture",
          step: "score",
        },
        scheduledFor: toIsoString(taskCreatedAt),
        createdAt: toIsoString(taskCreatedAt),
        updatedAt: toIsoString(taskUpdatedAt),
      }),
    );
    const historicalAiRun = await unitOfWork.aiRuns.save(
      createAiRun({
        id: `${prefix}-airun`,
        taskId: historicalTask.id,
        provider: "internal",
        model: "deterministic-moneyline-v1",
        promptVersion: "scoring-worker-mvp-v1",
        status: "completed",
        outputRef: `${prefix}.json`,
        createdAt: toIsoString(aiRunCreatedAt),
        updatedAt: toIsoString(aiRunCreatedAt),
      }),
    );
    await unitOfWork.predictions.save(
      createPrediction({
        id: `${prefix}-prediction`,
        fixtureId,
        aiRunId: historicalAiRun.id,
        market: "moneyline",
        outcome: "home",
        status: "published",
        confidence: 0.94,
        probabilities: { implied: 0.4, model: 0.74, edge: 0.34 },
        rationale: ["historical published prediction"],
        publishedAt: toIsoString(predictionPublishedAt),
        createdAt: toIsoString(predictionCreatedAt),
        updatedAt: toIsoString(predictionPublishedAt),
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
};

const cleanupRuntimeArtifacts = async (
  targetDatabaseUrl: string,
  prefix: string,
): Promise<void> => {
  const prisma = await createPrismaClient(targetDatabaseUrl);

  try {
    const cycleIds = (
      await prisma.automationCycle.findMany({
        where: { leaseOwner: { startsWith: prefix } },
        select: { id: true },
      })
    ).map((cycle) => cycle.id);

    const fixtureIds = (
      await prisma.fixture.findMany({
        where: { id: { startsWith: `${prefix}-fixture-` } },
        select: { id: true },
      })
    ).map((fixture) => fixture.id);

    const taskIds = (
      await prisma.task.findMany({
        select: { id: true, manifestId: true, payload: true },
      })
    )
      .filter((task) => {
        const payload = asRecord(task.payload);
        return (
          task.id.startsWith(prefix) ||
          (task.manifestId !== null && cycleIds.includes(task.manifestId)) ||
          (typeof payload?.fixtureId === "string" &&
            payload.fixtureId.startsWith(prefix)) ||
          (typeof payload?.packId === "string" && payload.packId === prefix)
        );
      })
      .map((task) => task.id);

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

    if (
      predictionIds.length ||
      parlayIds.length ||
      taskIds.length ||
      fixtureIds.length
    ) {
      await prisma.validation.deleteMany({
        where: {
          OR: [
            ...(predictionIds.length
              ? [{ targetId: { in: predictionIds } }]
              : []),
            ...(parlayIds.length ? [{ targetId: { in: parlayIds } }] : []),
            ...(taskIds.length ? [{ targetId: { in: taskIds } }] : []),
            ...(fixtureIds.length ? [{ targetId: { in: fixtureIds } }] : []),
          ],
        },
      });
    }

    const auditEventIds = (
      await prisma.auditEvent.findMany({
        select: { id: true, aggregateId: true },
      })
    )
      .filter(
        (event) =>
          event.id.startsWith(prefix) ||
          event.aggregateId.startsWith(prefix) ||
          taskIds.includes(event.aggregateId) ||
          fixtureIds.includes(event.aggregateId),
      )
      .map((event) => event.id);
    if (auditEventIds.length) {
      await prisma.auditEvent.deleteMany({
        where: { id: { in: auditEventIds } },
      });
    }

    if (parlayIds.length) {
      await prisma.parlay.deleteMany({ where: { id: { in: parlayIds } } });
    }

    if (predictionIds.length) {
      await prisma.prediction.deleteMany({
        where: { id: { in: predictionIds } },
      });
    }

    if (taskIds.length) {
      await prisma.taskRun.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.aiRun.deleteMany({ where: { taskId: { in: taskIds } } });
      await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    }

    const sandboxNamespaceIds = (
      await prisma.sandboxNamespace.findMany({
        select: { id: true, metadata: true },
      })
    )
      .filter((namespace) => {
        const metadata = asRecord(namespace.metadata);
        return (
          namespace.id.startsWith(prefix) ||
          asString(metadata?.fixturePackId) === prefix ||
          asString(metadata?.packId) === prefix
        );
      })
      .map((namespace) => namespace.id);
    if (sandboxNamespaceIds.length) {
      await prisma.sandboxNamespace.deleteMany({
        where: { id: { in: sandboxNamespaceIds } },
      });
    }

    await prisma.oddsSelectionSnapshot.deleteMany({
      where: { id: { startsWith: `${prefix}-odds-` } },
    });
    await prisma.oddsSnapshot.deleteMany({
      where: { id: { startsWith: `${prefix}-odds-` } },
    });
    await prisma.rawIngestionBatch.deleteMany({
      where: { id: { startsWith: `${prefix}-batch-` } },
    });
    await prisma.fixture.deleteMany({
      where: { id: { startsWith: `${prefix}-fixture-` } },
    });
    if (cycleIds.length) {
      await prisma.automationCycle.deleteMany({
        where: { id: { in: cycleIds } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
};

const snapshotSchedulerCursorState = async (
  targetDatabaseUrl: string,
): Promise<
  ReadonlyMap<
    string,
    {
      id: string;
      specId: string;
      lastTriggeredAt: Date | null;
      metadata: unknown;
    } | null
  >
> => {
  const cursorIds = buildExampleCronSpecs().map(
    (spec) => `scheduler-cursor:${spec.id}`,
  );

  const prisma = await createPrismaClient(targetDatabaseUrl);

  try {
    const records = await prisma.schedulerCursor.findMany({
      where: { id: { in: cursorIds } },
    });
    const byId = new Map(records.map((record) => [record.id, record] as const));
    return new Map(
      cursorIds.map(
        (cursorId) => [cursorId, byId.get(cursorId) ?? null] as const,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
};

const restoreSchedulerCursorState = async (
  targetDatabaseUrl: string,
  snapshot: ReadonlyMap<
    string,
    {
      id: string;
      specId: string;
      lastTriggeredAt: Date | null;
      metadata: unknown;
    } | null
  >,
): Promise<void> => {
  const prisma = await createPrismaClient(targetDatabaseUrl);

  try {
    for (const [cursorId, record] of snapshot.entries()) {
      if (!record) {
        await prisma.schedulerCursor.deleteMany({ where: { id: cursorId } });
        continue;
      }

      await prisma.schedulerCursor.upsert({
        where: { id: record.id },
        create: {
          id: record.id,
          specId: record.specId,
          lastTriggeredAt: record.lastTriggeredAt,
          metadata: (record.metadata ?? null) as never,
        },
        update: {
          specId: record.specId,
          lastTriggeredAt: record.lastTriggeredAt,
          metadata: (record.metadata ?? null) as never,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
};

testWithDatabase(
  "runSchedulerCycle persists scheduler cursors and carries durable ownership metadata",
  async (targetDatabaseUrl) => {
    const prefix = `rt-scheduler-${Date.now().toString(36)}`;
    const leaseOwner = `${prefix}:scheduler`;
    const priorCursorState =
      await snapshotSchedulerCursorState(targetDatabaseUrl);
    const now = shiftDateByMinutes(runtimeReleaseCiEvidenceNow, -720);
    const clearedCursorState = new Map(
      [...priorCursorState.keys()].map((cursorId) => [cursorId, null] as const),
    );

    await cleanupRuntimeArtifacts(targetDatabaseUrl, prefix);
    await restoreSchedulerCursorState(targetDatabaseUrl, clearedCursorState);

    try {
      const eligibleFixture = await createFixtureWithOdds(
        targetDatabaseUrl,
        prefix,
        "1",
        {
          selectionOverride: "force-include",
          referenceNow: now,
        },
      );
      const blockedFixture = await createFixtureWithOdds(
        targetDatabaseUrl,
        prefix,
        "2",
        {
          homePrice: 1.05,
          drawPrice: 7.2,
          awayPrice: 15,
          referenceNow: now,
        },
      );
      const firstRun = await runSchedulerCycle(targetDatabaseUrl, {
        fixtureIds: [eligibleFixture.fixtureId, blockedFixture.fixtureId],
        leaseOwner,
        now,
      });
      const prisma = await createPrismaClient(targetDatabaseUrl);
      try {
        const manifestTasks = await prisma.task.findMany({
          where: { manifestId: firstRun.cycle.id },
          orderBy: [{ kind: "asc" }, { id: "asc" }],
        });
        assert.equal(
          manifestTasks.filter((task) => task.kind === "research").length,
          1,
        );
        assert.equal(
          manifestTasks.filter(
            (task) =>
              task.kind === "fixture_ingestion" ||
              task.kind === "odds_ingestion",
          ).length,
          2,
        );
        assert.equal(
          manifestTasks.every(
            (task) =>
              task.manifestId === firstRun.cycle.id &&
              task.workflowId !== null &&
              task.traceId !== null &&
              task.correlationId === firstRun.cycle.id &&
              task.source !== null,
          ),
          true,
        );

        const secondRun = await runSchedulerCycle(targetDatabaseUrl, {
          fixtureIds: [eligibleFixture.fixtureId, blockedFixture.fixtureId],
          leaseOwner: `${leaseOwner}:repeat`,
          now,
        });
        const secondManifestTasks = await prisma.task.findMany({
          where: { manifestId: secondRun.cycle.id },
        });
        assert.equal(
          secondManifestTasks.filter(
            (task) =>
              task.kind === "fixture_ingestion" ||
              task.kind === "odds_ingestion",
          ).length,
          0,
        );
        assert.equal(
          secondManifestTasks.filter((task) => task.kind === "research").length,
          1,
        );
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      await cleanupRuntimeArtifacts(targetDatabaseUrl, prefix);
      await restoreSchedulerCursorState(targetDatabaseUrl, priorCursorState);
    }
  },
);

testWithDatabase(
  "runDispatcherCycle scopes work to a single manifest and publisher uses only current manifest prediction task ids",
  async (targetDatabaseUrl) => {
    const prefix = `rt-dispatcher-${Date.now().toString(36)}`;
    const historicalPrefix = `${prefix}-historical`;
    const now = shiftDateByMinutes(runtimeReleaseCiEvidenceNow, -839);

    await cleanupRuntimeArtifacts(targetDatabaseUrl, prefix);
    await cleanupRuntimeArtifacts(targetDatabaseUrl, historicalPrefix);

    try {
      const currentFixtureOne = await createFixtureWithOdds(
        targetDatabaseUrl,
        prefix,
        "1",
        {
          selectionOverride: "force-include",
          referenceNow: now,
        },
      );
      const currentFixtureTwo = await createFixtureWithOdds(
        targetDatabaseUrl,
        prefix,
        "2",
        {
          selectionOverride: "force-include",
          referenceNow: now,
        },
      );
      const historicalFixture = await createFixtureWithOdds(
        targetDatabaseUrl,
        historicalPrefix,
        "1",
        {
          referenceNow: now,
        },
      );
      await seedHistoricalPublishedPrediction(
        targetDatabaseUrl,
        historicalPrefix,
        historicalFixture.fixtureId,
        now,
      );
      const schedulerRun = await runSchedulerCycle(targetDatabaseUrl, {
        fixtureIds: [currentFixtureOne.fixtureId, currentFixtureTwo.fixtureId],
        leaseOwner: `${prefix}:scheduler`,
        now,
      });

      const prisma = await createPrismaClient(targetDatabaseUrl);
      try {
        await prisma.task.create({
          data: {
            id: `${prefix}-foreign-research`,
            kind: "research",
            status: "queued",
            triggerKind: "manual",
            priority: 1,
            manifestId: `${prefix}-foreign-manifest`,
            workflowId: `${prefix}-foreign-workflow`,
            traceId: `${prefix}-foreign-trace`,
            correlationId: `${prefix}-foreign-manifest`,
            source: "foreign-manifest",
            payload: {
              fixtureId: `${prefix}-foreign-fixture`,
              manifestId: `${prefix}-foreign-manifest`,
              workflowId: `${prefix}-foreign-workflow`,
              traceId: `${prefix}-foreign-trace`,
              correlationId: `${prefix}-foreign-manifest`,
              source: "foreign-manifest",
            },
            maxAttempts: 3,
            createdAt: now,
            updatedAt: now,
          },
        });
      } finally {
        await prisma.$disconnect();
      }

      const dispatcherRun = await runDispatcherCycle(targetDatabaseUrl, {
        leaseOwner: `${prefix}:dispatcher`,
        manifestId: schedulerRun.cycle.id,
        maxClaims: 20,
        now,
      });
      assert.equal(dispatcherRun.cycle.status, "succeeded");

      const verifyPrisma = await createPrismaClient(targetDatabaseUrl);
      try {
        const foreignTask = await verifyPrisma.task.findUnique({
          where: { id: `${prefix}-foreign-research` },
        });
        assert.equal(foreignTask?.status, "queued");

        const currentManifestTasks = await verifyPrisma.task.findMany({
          where: { manifestId: schedulerRun.cycle.id },
        });
        assert.equal(
          currentManifestTasks.filter(
            (task) => task.kind === "research" && task.status === "succeeded",
          ).length,
          2,
        );
        assert.equal(
          currentManifestTasks.filter(
            (task) => task.kind === "prediction" && task.status === "succeeded",
          ).length,
          2,
        );
        assert.equal(
          currentManifestTasks.some(
            (task) => task.kind === "validation" && task.status === "succeeded",
          ),
          true,
        );

        const dispatcherMetadata = asRecord(dispatcherRun.cycle.metadata);
        const parlayMetadata = asRecord(dispatcherMetadata?.parlayMetadata);
        const successfulPredictionTaskIds = asStringArray(
          dispatcherMetadata?.successfulPredictionTaskIds,
        );
        const selectedPredictionIds = asStringArray(
          parlayMetadata?.selectedPredictionIds,
        );
        const currentManifestPredictionTaskIds = currentManifestTasks
          .filter(
            (task) => task.kind === "prediction" && task.status === "succeeded",
          )
          .map((task) => task.id)
          .sort();

        assert.deepEqual(
          successfulPredictionTaskIds.sort(),
          currentManifestPredictionTaskIds,
        );
        assert.equal(
          selectedPredictionIds.includes(`${historicalPrefix}-prediction`),
          false,
        );
      } finally {
        await verifyPrisma.$disconnect();
      }
    } finally {
      await cleanupRuntimeArtifacts(targetDatabaseUrl, historicalPrefix);
      await cleanupRuntimeArtifacts(targetDatabaseUrl, prefix);
    }
  },
);

testWithDatabase(
  "runRecoveryCycle redrives expired durable leases without relying on updatedAt fallbacks",
  async (targetDatabaseUrl) => {
    const prefix = `rt-recovery-${Date.now().toString(36)}`;
    const taskId = `${prefix}-task`;
    const taskRunId = `${prefix}-run-1`;
    const now = shiftDateByMinutes(runtimeReleaseCiEvidenceNow, -1420);
    const prisma = await createPrismaClient(targetDatabaseUrl);
    const unitOfWork = createPrismaUnitOfWork(prisma);
    const claimedAt = shiftDateByMinutes(now, -20);
    const heartbeatAt = shiftDateByMinutes(now, -19);
    const leaseExpiresAt = shiftDateByMinutes(now, -15);

    await cleanupRuntimeArtifacts(targetDatabaseUrl, prefix);

    try {
      await unitOfWork.tasks.save(
        createTask({
          id: taskId,
          kind: "prediction",
          status: "running",
          priority: 50,
          payload: {
            fixtureId: `${prefix}-fixture-expired`,
            source: "recovery-test",
          },
          maxAttempts: 3,
          leaseOwner: "recovery-test-worker",
          leaseExpiresAt: toIsoString(leaseExpiresAt),
          claimedAt: toIsoString(claimedAt),
          lastHeartbeatAt: toIsoString(heartbeatAt),
          activeTaskRunId: taskRunId,
          createdAt: toIsoString(claimedAt),
          updatedAt: toIsoString(heartbeatAt),
        }),
      );
      await unitOfWork.taskRuns.save(
        createTaskRun({
          id: taskRunId,
          taskId,
          attemptNumber: 1,
          status: "running",
          startedAt: toIsoString(claimedAt),
          createdAt: toIsoString(claimedAt),
          updatedAt: toIsoString(heartbeatAt),
        }),
      );

      const recoveryRun = await runRecoveryCycle(targetDatabaseUrl, {
        leaseOwner: `${prefix}:recovery`,
        now,
        redriveLimit: 0,
        leaseRecoveryLimit: 1,
      });
      assert.equal(recoveryRun.cycle.status, "succeeded");

      const recoveredTask = await unitOfWork.tasks.getById(taskId);
      const taskRuns = await unitOfWork.taskRuns.findByTaskId(taskId);
      assert.equal(recoveredTask?.status, "queued");
      assert.equal(recoveredTask?.activeTaskRunId, undefined);
      assert.equal(recoveredTask?.leaseOwner, undefined);
      assert.equal(
        recoveredTask?.lastErrorMessage,
        "Recovered expired lease; scheduling redrive.",
      );
      assert.equal(taskRuns.length, 2);
      assert.equal(taskRuns[0]?.status, "failed");
      assert.equal(taskRuns[0]?.error, "Task lease expired before completion.");
      assert.equal(taskRuns[1]?.status, "failed");
      assert.equal(
        taskRuns[1]?.error,
        "Recovered expired lease; scheduling redrive.",
      );
    } finally {
      await prisma.$disconnect();
      await cleanupRuntimeArtifacts(targetDatabaseUrl, prefix);
    }
  },
);
