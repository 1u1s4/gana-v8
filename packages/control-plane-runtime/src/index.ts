import { randomUUID } from "node:crypto";

import {
  buildExampleCronSpecs,
  type CronWorkflowSpec,
} from "@gana-v8/orchestration-sdk";
import {
  createAutomationCycle,
  type AutomationCycleEntity,
  type AutomationCycleKind,
  type AutomationCycleStageEntity,
} from "@gana-v8/domain-core";
import {
  createPrismaTaskQueueAdapter,
  type QueueTaskClaim,
  type QueueTaskEntity,
} from "@gana-v8/queue-adapters";
import {
  loadOperationSnapshotFromDatabase,
  type AutomationCycleReadModel,
} from "@gana-v8/public-api";
import {
  resolveResearchAiConfig,
  runResearchTask,
} from "@gana-v8/research-worker";
import { scoreFixturePrediction } from "@gana-v8/scoring-worker";
import { runPublisherWorker } from "@gana-v8/publisher-worker";
import {
  createPrismaUnitOfWork,
  createVerifiedPrismaClient,
  type PrismaUnitOfWork,
} from "@gana-v8/storage-adapters";
import { runValidationWorker } from "@gana-v8/validation-worker";

export const workspaceInfo = {
  packageName: "@gana-v8/control-plane-runtime",
  workspaceName: "control-plane-runtime",
  category: "package",
  description: "Shared runtime helpers for persisted automation cycles and Hermes operational services.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/orchestration-sdk", category: "workspace" },
    { name: "@gana-v8/queue-adapters", category: "workspace" },
    { name: "@gana-v8/public-api", category: "workspace" },
    { name: "@gana-v8/research-worker", category: "workspace" },
    { name: "@gana-v8/scoring-worker", category: "workspace" },
    { name: "@gana-v8/publisher-worker", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" },
    { name: "@gana-v8/validation-worker", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface RuntimeCycleResult {
  readonly cycle: AutomationCycleEntity;
  readonly readModel?: AutomationCycleReadModel | null;
}

export interface SchedulerCycleOptions {
  readonly fixtureIds?: readonly string[];
  readonly now?: Date;
  readonly leaseOwner?: string;
}

export interface DispatcherCycleOptions {
  readonly maxClaims?: number;
  readonly now?: Date;
  readonly leaseOwner?: string;
}

export interface RecoveryCycleOptions {
  readonly now?: Date;
  readonly leaseOwner?: string;
  readonly redriveLimit?: number;
}

const defaultLeaseOwner = (kind: AutomationCycleKind): string =>
  `${kind}:${process.pid}`;

const toIso = (value: Date): string => value.toISOString();

const cycleId = (kind: AutomationCycleKind, now: Date): string =>
  `automation-cycle:${kind}:${now.toISOString().replace(/[^0-9]/g, "")}:${randomUUID().slice(0, 8)}`;

const cloneStage = (stage: AutomationCycleStageEntity): AutomationCycleStageEntity => ({
  ...stage,
  taskIds: [...stage.taskIds],
  taskRunIds: [...stage.taskRunIds],
});

const saveCycle = async (
  databaseUrl: string,
  cycle: AutomationCycleEntity,
): Promise<AutomationCycleEntity> => {
  const client = createVerifiedPrismaClient({ databaseUrl });
  try {
    return await createPrismaUnitOfWork(client).automationCycles.save(cycle);
  } finally {
    await client.$disconnect();
  }
};

const createRuntimeQueue = (
  client: Parameters<typeof createPrismaTaskQueueAdapter>[0],
  unitOfWork: PrismaUnitOfWork,
) =>
  createPrismaTaskQueueAdapter(client, unitOfWork, {
    createTransactionalUnitOfWork: (transactionClient) =>
      createPrismaUnitOfWork(transactionClient as Parameters<typeof createPrismaUnitOfWork>[0]),
  });

export const registerAutomationCycle = async (
  databaseUrl: string,
  input: Omit<AutomationCycleEntity, "createdAt" | "updatedAt">,
): Promise<AutomationCycleEntity> =>
  saveCycle(
    databaseUrl,
    createAutomationCycle(input),
  );

export const listAutomationCycles = async (
  databaseUrl: string,
): Promise<readonly AutomationCycleEntity[]> => {
  const client = createVerifiedPrismaClient({ databaseUrl });
  try {
    return createPrismaUnitOfWork(client).automationCycles.list();
  } finally {
    await client.$disconnect();
  }
};

const loadAutomationCycleReadModel = async (
  databaseUrl: string,
  cycleIdToFind: string,
): Promise<AutomationCycleReadModel | null> => {
  const snapshot = await loadOperationSnapshotFromDatabase(databaseUrl);
  return snapshot.automationCycles.find((cycle) => cycle.id === cycleIdToFind) ?? null;
};

const updateCycle = (
  cycle: AutomationCycleEntity,
  input: {
    readonly status: AutomationCycleEntity["status"];
    readonly finishedAt: string;
    readonly summary?: AutomationCycleEntity["summary"];
    readonly metadata?: Record<string, unknown>;
    readonly error?: string;
  },
): AutomationCycleEntity =>
  createAutomationCycle({
    ...cycle,
    status: input.status,
    finishedAt: input.finishedAt,
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.error ? { error: input.error } : {}),
    updatedAt: input.finishedAt,
  });

const summarizeCronSpecs = (
  specs: readonly CronWorkflowSpec[],
): readonly string[] =>
  specs.map((spec) => `${spec.id}:${spec.intent}:${spec.cron}`);

export const runSchedulerCycle = async (
  databaseUrl: string,
  options: SchedulerCycleOptions = {},
): Promise<RuntimeCycleResult> => {
  const now = options.now ?? new Date();
  const leaseOwner = options.leaseOwner ?? defaultLeaseOwner("scheduler");
  const client = createVerifiedPrismaClient({ databaseUrl });

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const queue = createRuntimeQueue(client, unitOfWork);
    const fixtures = await unitOfWork.fixtures.list();
    const fixtureIds = (options.fixtureIds ?? fixtures.map((fixture) => fixture.id))
      .filter((fixtureId, index, values) => values.indexOf(fixtureId) === index);
    const schedulerCycle = await unitOfWork.automationCycles.save(
      createAutomationCycle({
        id: cycleId("scheduler", now),
        kind: "scheduler",
        status: "running",
        leaseOwner,
        startedAt: toIso(now),
        metadata: {
          cronSpecs: summarizeCronSpecs(buildExampleCronSpecs()),
        },
        summary: {
          source: "hermes-scheduler",
          fixtureIds,
          taskIds: [],
          stages: [
            {
              stage: "research",
              status: "pending",
              taskIds: [],
              taskRunIds: [],
              retryCount: 0,
            },
            {
              stage: "prediction",
              status: "pending",
              taskIds: [],
              taskRunIds: [],
              retryCount: 0,
            },
            {
              stage: "validation",
              status: "pending",
              taskIds: [],
              taskRunIds: [],
              retryCount: 0,
            },
          ],
        },
      }),
    );

    const researchTaskIds: string[] = [];
    const predictionTaskIds: string[] = [];
    for (const fixtureId of fixtureIds) {
      researchTaskIds.push(
        (
          await queue.enqueue({
            id: `scheduler:${now.toISOString()}:research:${fixtureId}`,
            kind: "research",
            payload: { fixtureId, traceId: `scheduler:research:${fixtureId}` },
            priority: 50,
            now,
          })
        ).id,
      );
      predictionTaskIds.push(
        (
          await queue.enqueue({
            id: `scheduler:${now.toISOString()}:prediction:${fixtureId}`,
            kind: "prediction",
            payload: { fixtureId, traceId: `scheduler:prediction:${fixtureId}` },
            priority: 40,
            now,
          })
        ).id,
      );
    }

    const validationTaskId = (
      await queue.enqueue({
        id: `scheduler:${now.toISOString()}:validation`,
        kind: "validation",
        payload: { traceId: "scheduler:validation" },
        priority: 10,
        now,
      })
    ).id;

    const finishedCycle = await unitOfWork.automationCycles.save(
      updateCycle(schedulerCycle, {
        status: "succeeded",
        finishedAt: toIso(now),
        summary: {
          source: "hermes-scheduler",
          fixtureIds,
          taskIds: [...researchTaskIds, ...predictionTaskIds, validationTaskId],
          validationTaskId,
          stages: [
            {
              stage: "research",
              status: researchTaskIds.length > 0 ? "pending" : "blocked",
              taskIds: researchTaskIds,
              taskRunIds: [],
              retryCount: 0,
            },
            {
              stage: "prediction",
              status: predictionTaskIds.length > 0 ? "pending" : "blocked",
              taskIds: predictionTaskIds,
              taskRunIds: [],
              retryCount: 0,
            },
            {
              stage: "validation",
              status: "pending",
              taskIds: [validationTaskId],
              taskRunIds: [],
              retryCount: 0,
            },
          ],
          counts: {
            researchTaskCount: researchTaskIds.length,
            predictionTaskCount: predictionTaskIds.length,
            parlayCount: 0,
            validationTaskCount: 1,
          },
        },
      }),
    );

    return {
      cycle: finishedCycle,
      readModel: await loadAutomationCycleReadModel(databaseUrl, finishedCycle.id),
    };
  } finally {
    await client.$disconnect();
  }
};

const executeClaim = async (
  databaseUrl: string,
  claim: QueueTaskClaim,
  now: Date,
): Promise<{
  readonly claim: QueueTaskClaim;
  readonly status: "succeeded" | "failed";
  readonly output?: Record<string, unknown>;
  readonly error?: string;
}> => {
  const fixtureId =
    typeof claim.task.payload.fixtureId === "string" ? claim.task.payload.fixtureId : undefined;

  try {
    if (claim.task.kind === "research" && fixtureId) {
      const client = createVerifiedPrismaClient({ databaseUrl });
      try {
        const unitOfWork = createPrismaUnitOfWork(client);
        const fixture = await unitOfWork.fixtures.getById(fixtureId);
        if (!fixture) {
          throw new Error(`Fixture not found for research task: ${fixtureId}`);
        }
        const aiConfig = resolveResearchAiConfig({
          GANA_RUNTIME_PROFILE: "ci-smoke",
          NODE_ENV: "test",
        });
        const result = await runResearchTask({
          fixture,
          generatedAt: toIso(now),
          persistence: unitOfWork,
          ai: aiConfig,
        });
        await createRuntimeQueue(client, unitOfWork).complete(claim.task.id, claim.taskRun.id, now);
        return {
          claim,
          status: "succeeded",
          output: {
            fixtureId,
            result: result.status,
            bundleId: result.persistableResearchBundle.id,
          },
        };
      } finally {
        await client.$disconnect();
      }
    }

    if (claim.task.kind === "prediction" && fixtureId) {
      const result = await scoreFixturePrediction(databaseUrl, fixtureId, claim.task.id, {
        generatedAt: toIso(now),
      });
      const client = createVerifiedPrismaClient({ databaseUrl });
      try {
        await createRuntimeQueue(client, createPrismaUnitOfWork(client)).complete(
          claim.task.id,
          claim.taskRun.id,
          now,
        );
      } finally {
        await client.$disconnect();
      }
      return {
        claim,
        status: "succeeded",
        output: {
          fixtureId,
          status: result.status,
          ...(result.reason ? { reason: result.reason } : {}),
        },
      };
    }

    if (claim.task.kind === "validation") {
      const result = await runValidationWorker(databaseUrl, { executedAt: toIso(now) });
      const client = createVerifiedPrismaClient({ databaseUrl });
      try {
        await createRuntimeQueue(client, createPrismaUnitOfWork(client)).complete(
          claim.task.id,
          claim.taskRun.id,
          now,
        );
      } finally {
        await client.$disconnect();
      }
      return {
        claim,
        status: "succeeded",
        output: {
          settledPredictionCount: result.settledPredictionCount,
          settledParlayCount: result.settledParlayCount,
        },
      };
    }

    if (claim.task.kind === "sandbox-replay") {
      const client = createVerifiedPrismaClient({ databaseUrl });
      try {
        await createRuntimeQueue(client, createPrismaUnitOfWork(client)).complete(
          claim.task.id,
          claim.taskRun.id,
          now,
        );
      } finally {
        await client.$disconnect();
      }
      return {
        claim,
        status: "succeeded",
        output: { replayed: false, reason: "No sandbox replay executor wired in control-plane-runtime." },
      };
    }

    throw new Error(`Unsupported dispatcher task kind: ${claim.task.kind}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected dispatcher error";
    const client = createVerifiedPrismaClient({ databaseUrl });
    try {
      await createRuntimeQueue(client, createPrismaUnitOfWork(client)).fail(
        claim.task.id,
        claim.taskRun.id,
        message,
        now,
      );
    } finally {
      await client.$disconnect();
    }
    return {
      claim,
      status: "failed",
      error: message,
    };
  }
};

const toDispatcherStages = (
  claims: readonly {
    readonly claim: QueueTaskClaim;
    readonly status: "succeeded" | "failed";
    readonly output?: Record<string, unknown>;
    readonly error?: string;
  }[],
  parlayStatus: AutomationCycleStageEntity["status"],
  parlayMetadata: Record<string, unknown>,
): readonly AutomationCycleStageEntity[] => {
  const stages: AutomationCycleStageEntity[] = [];
  for (const stage of ["research", "prediction", "validation"] as const) {
    const stageClaims = claims.filter((entry) => entry.claim.task.kind === stage);
    if (stageClaims.length === 0) {
      continue;
    }
    const stageEntry: AutomationCycleStageEntity = {
      stage,
      status: stageClaims.some((entry) => entry.status === "failed") ? "failed" : "succeeded",
      taskIds: stageClaims.map((entry) => entry.claim.task.id),
      taskRunIds: stageClaims.map((entry) => entry.claim.taskRun.id),
      retryCount: stageClaims.filter((entry) => entry.claim.task.attempts.length > 1).length,
    };
    const startedAt = stageClaims[0]?.claim.taskRun.startedAt;
    const completedAt = stageClaims.at(-1)?.claim.taskRun.finishedAt;
    const error = stageClaims.find((entry) => entry.error)?.error;
    if (startedAt) {
      Object.assign(stageEntry, { startedAt });
    }
    if (completedAt) {
      Object.assign(stageEntry, { completedAt });
    }
    if (error) {
      Object.assign(stageEntry, { error });
    }
    stages.push(stageEntry);
  }

  stages.push({
    stage: "parlay",
    status: parlayStatus,
    taskIds: [],
    taskRunIds: [],
    retryCount: 0,
    ...(typeof parlayMetadata.generatedAt === "string" ? { completedAt: parlayMetadata.generatedAt } : {}),
    ...(typeof parlayMetadata.error === "string" ? { error: parlayMetadata.error } : {}),
  });

  return stages.map(cloneStage);
};

export const runDispatcherCycle = async (
  databaseUrl: string,
  options: DispatcherCycleOptions = {},
): Promise<RuntimeCycleResult> => {
  const now = options.now ?? new Date();
  const leaseOwner = options.leaseOwner ?? defaultLeaseOwner("dispatcher");
  const maxClaims = Math.max(1, options.maxClaims ?? 5);
  const client = createVerifiedPrismaClient({ databaseUrl });

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const queue = createRuntimeQueue(client, unitOfWork);
    const cycle = await unitOfWork.automationCycles.save(
      createAutomationCycle({
        id: cycleId("dispatcher", now),
        kind: "dispatcher",
        status: "running",
        leaseOwner,
        startedAt: toIso(now),
        summary: {
          source: "hermes-dispatcher",
          fixtureIds: [],
          taskIds: [],
          stages: [],
        },
      }),
    );

    const claims: Array<{
      readonly claim: QueueTaskClaim;
      readonly status: "succeeded" | "failed";
      readonly output?: Record<string, unknown>;
      readonly error?: string;
    }> = [];

    for (let index = 0; index < maxClaims; index += 1) {
      const claim = await queue.claimNext(undefined, now);
      if (!claim) {
        break;
      }
      claims.push(await executeClaim(databaseUrl, claim, now));
    }

    let parlayStatus: AutomationCycleStageEntity["status"] = "blocked";
    let parlayMetadata: Record<string, unknown> = {};
    try {
      const parlayResult = await runPublisherWorker(databaseUrl, { generatedAt: toIso(now) });
      parlayStatus = parlayResult.status === "persisted" ? "succeeded" : "blocked";
      parlayMetadata = {
        generatedAt: parlayResult.generatedAt,
        status: parlayResult.status,
        candidateCount: parlayResult.candidateCount,
      };
    } catch (error) {
      parlayStatus = "failed";
      parlayMetadata = {
        error: error instanceof Error ? error.message : "Unexpected publisher error",
      };
    }

    const fixtureIds = claims.flatMap((entry) =>
      typeof entry.claim.task.payload.fixtureId === "string"
        ? [String(entry.claim.task.payload.fixtureId)]
        : [],
    );
    const taskIds = claims.map((entry) => entry.claim.task.id);
    const validationTaskId = claims.find((entry) => entry.claim.task.kind === "validation")?.claim.task.id;
    const firstClaimError = claims.find((entry) => entry.error)?.error;
    const finalCycle = await unitOfWork.automationCycles.save(
      updateCycle(cycle, {
        status: claims.some((entry) => entry.status === "failed") ? "failed" : "succeeded",
        finishedAt: toIso(now),
        ...(firstClaimError ? { error: firstClaimError } : {}),
        summary: {
          source: "hermes-dispatcher",
          fixtureIds,
          taskIds,
          ...(validationTaskId ? { validationTaskId } : {}),
          stages: toDispatcherStages(claims, parlayStatus, parlayMetadata),
          counts: {
            researchTaskCount: claims.filter((entry) => entry.claim.task.kind === "research").length,
            predictionTaskCount: claims.filter((entry) => entry.claim.task.kind === "prediction").length,
            parlayCount: parlayStatus === "succeeded" ? 1 : 0,
            validationTaskCount: claims.filter((entry) => entry.claim.task.kind === "validation").length,
          },
        },
      }),
    );

    return {
      cycle: finalCycle,
      readModel: await loadAutomationCycleReadModel(databaseUrl, finalCycle.id),
    };
  } finally {
    await client.$disconnect();
  }
};

export const runRecoveryCycle = async (
  databaseUrl: string,
  options: RecoveryCycleOptions = {},
): Promise<RuntimeCycleResult> => {
  const now = options.now ?? new Date();
  const leaseOwner = options.leaseOwner ?? defaultLeaseOwner("recovery");
  const redriveLimit = Math.max(0, options.redriveLimit ?? 3);
  const client = createVerifiedPrismaClient({ databaseUrl });

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const queue = createRuntimeQueue(client, unitOfWork);
    const cycle = await unitOfWork.automationCycles.save(
      createAutomationCycle({
        id: cycleId("recovery", now),
        kind: "recovery",
        status: "running",
        leaseOwner,
        startedAt: toIso(now),
        summary: {
          source: "hermes-recovery",
          fixtureIds: [],
          taskIds: [],
          stages: [],
        },
      }),
    );

    const summary = await queue.summary();
    const redrivenTaskIds: string[] = [];
    if (redriveLimit > 0) {
      const recoverable = (await unitOfWork.tasks.list())
        .filter((task) => task.status === "failed" || task.status === "quarantined")
        .slice(0, redriveLimit);
      for (const task of recoverable) {
        redrivenTaskIds.push((await queue.requeue(task.id, now)).id);
      }
    }

    const finalCycle = await unitOfWork.automationCycles.save(
      updateCycle(cycle, {
        status: "succeeded",
        finishedAt: toIso(now),
        summary: {
          source: "hermes-recovery",
          fixtureIds: [],
          taskIds: redrivenTaskIds,
          stages: [],
          counts: {
            researchTaskCount: 0,
            predictionTaskCount: 0,
            parlayCount: 0,
            validationTaskCount: 0,
          },
        },
        metadata: {
          queueSummary: summary,
          redrivenTaskIds,
        },
      }),
    );

    return {
      cycle: finalCycle,
      readModel: await loadAutomationCycleReadModel(databaseUrl, finalCycle.id),
    };
  } finally {
    await client.$disconnect();
  }
};
