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
  type QueueTaskSummary,
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
  readonly leaseRecoveryLimit?: number;
  readonly renewLeaseMs?: number;
}

export type QueueHealthStatus = "healthy" | "degraded" | "blocked";

export interface QueueHealthAssessment {
  readonly status: QueueHealthStatus;
  readonly reasons: readonly string[];
  readonly expiredLeaseTaskIds: readonly string[];
  readonly nearExpiryTaskIds: readonly string[];
}

const defaultLeaseOwner = (kind: AutomationCycleKind): string =>
  `${kind}:${process.pid}`;

const toIso = (value: Date): string => value.toISOString();

const DEFAULT_TASK_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_RECOVERY_NEAR_EXPIRY_MS = 60 * 1000;
const DEFAULT_RECOVERY_RENEW_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_RECOVERY_LEASE_RECOVERY_LIMIT = 5;

const cycleId = (kind: AutomationCycleKind, now: Date): string =>
  `automation-cycle:${kind}:${now.toISOString().replace(/[^0-9]/g, "")}:${randomUUID().slice(0, 8)}`;

const cloneStage = (stage: AutomationCycleStageEntity): AutomationCycleStageEntity => ({
  ...stage,
  taskIds: [...stage.taskIds],
  taskRunIds: [...stage.taskRunIds],
});

const dedupeStrings = (values: readonly string[]): readonly string[] =>
  values.filter((value, index, current) => current.indexOf(value) === index);

const fixtureIdFromTask = (task: QueueTaskEntity): string | undefined =>
  typeof task.payload.fixtureId === "string" ? String(task.payload.fixtureId) : undefined;

const taskLeaseDeadline = (task: QueueTaskEntity): string | null => {
  if (task.status !== "running") {
    return null;
  }

  return task.leaseExpiresAt ??
    new Date(Date.parse(task.updatedAt) + DEFAULT_TASK_LEASE_MS).toISOString();
};

export const hasExpiredTaskLease = (
  task: QueueTaskEntity,
  now: Date,
): boolean => {
  const leaseDeadline = taskLeaseDeadline(task);
  return leaseDeadline !== null && leaseDeadline <= toIso(now);
};

const isTaskLeaseExpiringSoon = (
  task: QueueTaskEntity,
  now: Date,
  thresholdMs: number = DEFAULT_RECOVERY_NEAR_EXPIRY_MS,
): boolean => {
  const leaseDeadline = taskLeaseDeadline(task);
  if (!leaseDeadline) {
    return false;
  }

  const leaseDeadlineMs = Date.parse(leaseDeadline);
  const nowMs = now.getTime();
  return leaseDeadlineMs > nowMs && leaseDeadlineMs - nowMs <= thresholdMs;
};

export const assessQueueHealth = (
  summary: QueueTaskSummary,
  tasks: readonly QueueTaskEntity[],
  now: Date,
): QueueHealthAssessment => {
  const expiredLeaseTaskIds = dedupeStrings(
    tasks.filter((task) => hasExpiredTaskLease(task, now)).map((task) => task.id),
  );
  const nearExpiryTaskIds = dedupeStrings(
    tasks.filter((task) => isTaskLeaseExpiringSoon(task, now)).map((task) => task.id),
  );

  const reasons: string[] = [];
  if (summary.quarantined > 0) {
    reasons.push(`${summary.quarantined} quarantined task(s) require manual review`);
  }
  if (expiredLeaseTaskIds.length > 0) {
    reasons.push(`${expiredLeaseTaskIds.length} running task lease(s) expired and need recovery`);
  }
  if (summary.failed > 0) {
    reasons.push(`${summary.failed} failed task(s) waiting for redrive`);
  }
  if (nearExpiryTaskIds.length > 0) {
    reasons.push(`${nearExpiryTaskIds.length} running task(s) are near lease expiry`);
  }
  if (summary.queued > 25) {
    reasons.push(`${summary.queued} queued task(s) indicate backlog pressure`);
  }

  let status: QueueHealthStatus = "healthy";
  if (summary.quarantined > 0 || expiredLeaseTaskIds.length > 0) {
    status = "blocked";
  } else if (summary.failed > 0 || nearExpiryTaskIds.length > 0 || summary.queued > 25) {
    status = "degraded";
  }

  return {
    status,
    reasons,
    expiredLeaseTaskIds,
    nearExpiryTaskIds,
  };
};

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
  const leaseRecoveryLimit = Math.max(
    0,
    options.leaseRecoveryLimit ?? Math.max(redriveLimit, DEFAULT_RECOVERY_LEASE_RECOVERY_LIMIT),
  );
  const renewLeaseMs = Math.max(30_000, options.renewLeaseMs ?? DEFAULT_RECOVERY_RENEW_LEASE_MS);
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

    const tasksBefore = await unitOfWork.tasks.list();
    const queueSummaryBefore = await queue.summary();
    const queueHealthBefore = assessQueueHealth(queueSummaryBefore, tasksBefore, now);
    const expiredLeaseCandidates = tasksBefore
      .filter((task) => hasExpiredTaskLease(task, now))
      .sort((left, right) => {
        const leftDeadline = taskLeaseDeadline(left) ?? left.updatedAt;
        const rightDeadline = taskLeaseDeadline(right) ?? right.updatedAt;
        return leftDeadline.localeCompare(rightDeadline);
      })
      .slice(0, leaseRecoveryLimit);

    const recoveredLeaseTaskIds: string[] = [];
    const renewedLeaseTaskIds: string[] = [];
    const redrivenTaskIds: string[] = [];
    const quarantinedTaskIds: string[] = [];
    const manualReviewTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];
    const recoveryErrors: string[] = [];
    const recoveryActions: Array<Record<string, unknown>> = [];

    for (const expiredTask of expiredLeaseCandidates) {
      try {
        const claim = await queue.claim(expiredTask.id, now);
        if (!claim) {
          skippedTaskIds.push(expiredTask.id);
          recoveryActions.push({
            action: "skip-expired-lease",
            taskId: expiredTask.id,
            reason: "Task could not be reclaimed because its status changed during recovery.",
          });
          continue;
        }

        recoveredLeaseTaskIds.push(claim.task.id);
        const renewedClaim = await queue.renewLease(
          claim.task.id,
          claim.taskRun.id,
          now,
          renewLeaseMs,
        );
        renewedLeaseTaskIds.push(renewedClaim.task.id);

        if (renewedClaim.task.attempts.length >= renewedClaim.task.maxAttempts) {
          const reason = `Recovered expired lease after ${renewedClaim.task.attempts.length} attempts; manual review required.`;
          const quarantined = await queue.quarantine(
            renewedClaim.task.id,
            renewedClaim.taskRun.id,
            reason,
            now,
          );
          quarantinedTaskIds.push(quarantined.task.id);
          manualReviewTaskIds.push(quarantined.task.id);
          recoveryActions.push({
            action: "quarantine-expired-lease",
            taskId: quarantined.task.id,
            taskRunId: quarantined.taskRun.id,
            reason,
          });
          continue;
        }

        const redriven = await queue.fail(
          renewedClaim.task.id,
          renewedClaim.taskRun.id,
          "Recovered expired lease; scheduling redrive.",
          now,
        );
        if (redriven.task.status === "quarantined") {
          quarantinedTaskIds.push(redriven.task.id);
          manualReviewTaskIds.push(redriven.task.id);
          recoveryActions.push({
            action: "quarantine-expired-lease",
            taskId: redriven.task.id,
            taskRunId: redriven.taskRun.id,
            reason: redriven.task.lastErrorMessage ?? "Recovered expired lease exhausted retries.",
          });
        } else {
          redrivenTaskIds.push(redriven.task.id);
          recoveryActions.push({
            action: "redrive-expired-lease",
            taskId: redriven.task.id,
            taskRunId: redriven.taskRun.id,
            retryScheduledFor: redriven.task.scheduledFor ?? null,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Unexpected lease recovery error for task ${expiredTask.id}`;
        recoveryErrors.push(message);
        recoveryActions.push({
          action: "error-expired-lease",
          taskId: expiredTask.id,
          error: message,
        });
      }
    }

    if (redriveLimit > 0) {
      const terminalTasks = (await unitOfWork.tasks.list())
        .filter((task) => {
          if (redrivenTaskIds.includes(task.id) || quarantinedTaskIds.includes(task.id)) {
            return false;
          }

          if (task.status === "failed" || task.status === "cancelled") {
            return true;
          }

          return (
            task.status === "quarantined" &&
            task.attempts.length < task.maxAttempts &&
            typeof task.lastErrorMessage === "string" &&
            task.lastErrorMessage.includes("expired lease")
          );
        })
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
        .slice(0, redriveLimit);

      for (const task of terminalTasks) {
        try {
          const requeued = await queue.requeue(task.id, now);
          redrivenTaskIds.push(requeued.id);
          recoveryActions.push({
            action: "requeue-terminal-task",
            taskId: requeued.id,
            previousStatus: task.status,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `Unexpected requeue error for task ${task.id}`;
          recoveryErrors.push(message);
          recoveryActions.push({
            action: "error-requeue-terminal-task",
            taskId: task.id,
            error: message,
          });
        }
      }
    }

    const tasksAfter = await unitOfWork.tasks.list();
    const queueSummaryAfter = await queue.summary();
    const queueHealthAfter = assessQueueHealth(queueSummaryAfter, tasksAfter, now);
    const affectedTaskIds = dedupeStrings([
      ...expiredLeaseCandidates.map((task) => task.id),
      ...redrivenTaskIds,
      ...quarantinedTaskIds,
      ...skippedTaskIds,
    ]);
    const affectedFixtureIds = dedupeStrings(
      tasksAfter
        .filter((task) => affectedTaskIds.includes(task.id))
        .flatMap((task) => {
          const fixtureId = fixtureIdFromTask(task);
          return fixtureId ? [fixtureId] : [];
        }),
    );
    const finalError = recoveryErrors[0];

    const finalCycle = await unitOfWork.automationCycles.save(
      updateCycle(cycle, {
        status: recoveryErrors.length > 0 ? "failed" : "succeeded",
        finishedAt: toIso(now),
        ...(finalError ? { error: finalError } : {}),
        summary: {
          source: "hermes-recovery",
          fixtureIds: affectedFixtureIds,
          taskIds: affectedTaskIds,
          stages: [],
          counts: {
            researchTaskCount: 0,
            predictionTaskCount: 0,
            parlayCount: 0,
            validationTaskCount: 0,
            expiredLeaseCount: expiredLeaseCandidates.length,
            recoveredLeaseCount: dedupeStrings(recoveredLeaseTaskIds).length,
            renewedLeaseCount: dedupeStrings(renewedLeaseTaskIds).length,
            redrivenTaskCount: dedupeStrings(redrivenTaskIds).length,
            quarantinedTaskCount: dedupeStrings(quarantinedTaskIds).length,
            manualReviewTaskCount: dedupeStrings(manualReviewTaskIds).length,
          },
        },
        metadata: {
          queueSummaryBefore,
          queueSummaryAfter,
          queueHealthBefore,
          queueHealthAfter,
          expiredLeaseTaskIds: expiredLeaseCandidates.map((task) => task.id),
          nearExpiryTaskIds: queueHealthBefore.nearExpiryTaskIds,
          recoveredLeaseTaskIds: dedupeStrings(recoveredLeaseTaskIds),
          renewedLeaseTaskIds: dedupeStrings(renewedLeaseTaskIds),
          redrivenTaskIds: dedupeStrings(redrivenTaskIds),
          quarantinedTaskIds: dedupeStrings(quarantinedTaskIds),
          manualReviewTaskIds: dedupeStrings(manualReviewTaskIds),
          skippedTaskIds: dedupeStrings(skippedTaskIds),
          recoveryActions,
          ...(recoveryErrors.length > 0 ? { recoveryErrors } : {}),
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
