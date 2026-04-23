import {
  createAutomationCycle,
  type AutomationCycleStageEntity,
} from "@gana-v8/domain-core";
import {
  createObservabilityKit,
  createPrismaDurableObservabilitySink,
} from "@gana-v8/observability";
import type { PrismaClient } from "@prisma/client";
import {
  createIngestionTaskEnvelope,
  createIngestionWorkerRuntime,
} from "@gana-v8/ingestion-worker";
import { type QueueTaskClaim, type QueueTaskEntity } from "@gana-v8/queue-adapters";
import { runPublisherWorker } from "@gana-v8/publisher-worker";
import type { PublisherWorkerPrismaClientLike } from "@gana-v8/publisher-worker";
import {
  resolveResearchAiConfig,
  runResearchTask,
} from "@gana-v8/research-worker";
import { materializeSandboxRun } from "@gana-v8/sandbox-runner";
import {
  scoreFixturePrediction,
  type ScoringWorkerPrismaClientLike,
} from "@gana-v8/scoring-worker";
import {
  createPrismaUnitOfWork,
  createConnectedVerifiedPrismaClient,
} from "@gana-v8/storage-adapters";
import { runValidationWorker } from "@gana-v8/validation-worker";

import {
  createRuntimeQueue,
  cycleId,
  defaultLeaseOwner,
  loadAutomationCycleReadModelSafely,
  toIso,
  type DispatcherCycleOptions,
  type RuntimeCycleResult,
  updateCycle,
} from "./shared.js";

interface DispatcherTaskExecution {
  readonly claim: QueueTaskClaim;
  readonly status: "succeeded" | "failed";
  readonly output?: Record<string, unknown>;
  readonly error?: string;
}

const DEFAULT_WORKER_ENV = {
  NODE_ENV: "test",
  GANA_RUNTIME_PROFILE: "ci-smoke",
} as const;

const DEFAULT_DISPATCHER_RENEW_LEASE_MS = 2 * 60 * 1000;

const dedupeStrings = (values: readonly string[]): readonly string[] =>
  values.filter((value, index, current) => current.indexOf(value) === index);

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const isTaskReady = (task: QueueTaskEntity, nowIso: string): boolean =>
  !task.scheduledFor || task.scheduledFor <= nowIso;

const taskReadyAt = (task: QueueTaskEntity): string =>
  task.scheduledFor ?? task.createdAt;

const compareQueuedReadyTasks = (left: QueueTaskEntity, right: QueueTaskEntity): number => {
  const leftReadyAt = taskReadyAt(left);
  const rightReadyAt = taskReadyAt(right);
  if (leftReadyAt !== rightReadyAt) {
    return leftReadyAt.localeCompare(rightReadyAt);
  }

  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return left.createdAt.localeCompare(right.createdAt);
};

const fixtureIdFromTask = (task: QueueTaskEntity): string | undefined =>
  asOptionalString(task.payload.fixtureId);

const manifestIdFromTask = (task: QueueTaskEntity): string | undefined =>
  task.manifestId ?? asOptionalString(task.payload.manifestId);

const workflowIdFromTask = (task: QueueTaskEntity): string | undefined =>
  task.workflowId ?? asOptionalString(task.payload.workflowId);

const traceIdFromTask = (task: QueueTaskEntity): string | undefined =>
  task.traceId ?? asOptionalString(task.payload.traceId);

const correlationIdFromTask = (task: QueueTaskEntity): string | undefined =>
  task.correlationId ?? asOptionalString(task.payload.correlationId);

const sourceFromTask = (task: QueueTaskEntity): string =>
  task.source ?? asOptionalString(task.payload.source) ?? "hermes-dispatcher";

const predictionTaskIdForManifest = (manifestId: string, fixtureId: string): string =>
  `dispatcher:${manifestId}:prediction:${fixtureId}`;

const validationTaskIdForManifest = (manifestId: string): string =>
  `dispatcher:${manifestId}:validation`;

const createRuntimeTaskPayload = (
  payload: Record<string, unknown>,
  input: {
    readonly manifestId: string;
    readonly workflowId: string;
    readonly traceId: string;
    readonly correlationId: string;
    readonly source: string;
  },
): Record<string, unknown> => ({
  ...payload,
  manifestId: input.manifestId,
  workflowId: input.workflowId,
  traceId: input.traceId,
  correlationId: input.correlationId,
  source: input.source,
});

const buildStageStatus = (
  tasks: readonly QueueTaskEntity[],
  executions: readonly DispatcherTaskExecution[],
): AutomationCycleStageEntity["status"] => {
  if (tasks.length === 0) {
    return "blocked";
  }

  if (executions.some((execution) => execution.status === "failed")) {
    return "failed";
  }

  if (tasks.some((task) => task.status === "failed" || task.status === "quarantined")) {
    return "failed";
  }

  if (tasks.some((task) => task.status === "running")) {
    return "running";
  }

  if (tasks.every((task) => task.status === "succeeded")) {
    return "succeeded";
  }

  if (tasks.some((task) => task.status === "queued")) {
    return "pending";
  }

  return "blocked";
};

const createStageSnapshot = (
  stage: AutomationCycleStageEntity["stage"],
  tasks: readonly QueueTaskEntity[],
  executions: readonly DispatcherTaskExecution[],
): AutomationCycleStageEntity => {
  const stageExecutions = executions.filter((execution) => {
    switch (stage) {
      case "research":
        return execution.claim.task.kind === "research";
      case "prediction":
        return execution.claim.task.kind === "prediction";
      case "validation":
        return execution.claim.task.kind === "validation";
      case "parlay":
        return false;
    }
  });

  const startedAt = stageExecutions[0]?.claim.taskRun.startedAt;
  const completedAt = [...stageExecutions]
    .reverse()
    .map((execution) => execution.claim.taskRun.finishedAt)
    .find((value): value is string => typeof value === "string");
  const error = stageExecutions.find((execution) => execution.error)?.error;

  return {
    stage,
    status: buildStageStatus(tasks, stageExecutions),
    taskIds: tasks.map((task) => task.id),
    taskRunIds: stageExecutions.map((execution) => execution.claim.taskRun.id),
    retryCount: tasks.filter((task) => task.attempts.length > 1).length,
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    ...(error ? { error } : {}),
  };
};

const buildParlayStage = (
  input: {
    readonly status: AutomationCycleStageEntity["status"];
    readonly generatedAt?: string;
    readonly error?: string;
  },
): AutomationCycleStageEntity => ({
  stage: "parlay",
  status: input.status,
  taskIds: [],
  taskRunIds: [],
  retryCount: 0,
  ...(input.generatedAt ? { completedAt: input.generatedAt } : {}),
  ...(input.error ? { error: input.error } : {}),
});

const claimTaskById = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  taskId: string,
  now: Date,
): Promise<QueueTaskClaim | null> =>
  queue.claim(taskId, now);

const executeWithLeaseHeartbeat = async <T>(
  queue: ReturnType<typeof createRuntimeQueue>,
  claim: QueueTaskClaim,
  callback: () => Promise<T>,
  leaseMs: number = DEFAULT_DISPATCHER_RENEW_LEASE_MS,
): Promise<T> => {
  const intervalMs = Math.max(30_000, Math.floor(leaseMs / 2));
  const interval = setInterval(() => {
    void queue
      .renewLease(claim.task.id, claim.taskRun.id, new Date(), leaseMs)
      .catch(() => {
        // best-effort heartbeat; queue CAS will enforce ownership on closeout
      });
  }, intervalMs);

  try {
    return await callback();
  } finally {
    clearInterval(interval);
  }
};

const completeClaim = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  claim: QueueTaskClaim,
  when: Date,
): Promise<void> => {
  await queue.complete(claim.task.id, claim.taskRun.id, when);
};

const failClaim = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  claim: QueueTaskClaim,
  error: string,
  when: Date,
): Promise<void> => {
  await queue.fail(claim.task.id, claim.taskRun.id, error, when);
};

const executeClaim = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  client: PrismaClient,
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
  claim: QueueTaskClaim,
  now: Date,
  ingestionRuntime: ReturnType<typeof createIngestionWorkerRuntime>,
): Promise<DispatcherTaskExecution> => {
  try {
    const output = await executeWithLeaseHeartbeat(queue, claim, async () => {
      const fixtureId = fixtureIdFromTask(claim.task);

      if (claim.task.kind === "fixture-ingestion" || claim.task.kind === "odds-ingestion") {
        const intent =
          claim.task.kind === "fixture-ingestion" ? "ingest-fixtures" : "ingest-odds";
        const correlationId = correlationIdFromTask(claim.task);
        const envelope = createIngestionTaskEnvelope({
          workflowId: workflowIdFromTask(claim.task) ?? `${claim.task.id}:workflow`,
          traceId: traceIdFromTask(claim.task) ?? `${claim.task.id}:trace`,
          intent,
          taskKind: claim.task.kind,
          payload: { ...claim.task.payload },
          scheduledFor: claim.task.scheduledFor ?? claim.task.createdAt,
          priority: claim.task.priority,
          createdAt: claim.task.createdAt,
          metadata: {
            source: sourceFromTask(claim.task),
            labels: [],
            ...(correlationId ? { correlationId } : {}),
          },
        });
        const execution = await ingestionRuntime.dispatch(envelope);
        if (execution.status !== "succeeded") {
          throw new Error(
            execution.error ?? `Ingestion task ${claim.task.id} finished with status ${execution.status}`,
          );
        }
        return (execution.output ?? {}) as unknown as Record<string, unknown>;
      }

      if (claim.task.kind === "research" && fixtureId) {
        const fixture = await unitOfWork.fixtures.getById(fixtureId);
        if (!fixture) {
          throw new Error(`Fixture not found for research task: ${fixtureId}`);
        }

        const result = await runResearchTask({
          fixture,
          generatedAt: toIso(now),
          persistence: {
            fixtures: unitOfWork.fixtures,
            fixtureWorkflows: unitOfWork.fixtureWorkflows,
            tasks: unitOfWork.tasks,
            aiRuns: unitOfWork.aiRuns,
            researchBundles: unitOfWork.researchBundles,
            researchClaims: unitOfWork.researchClaims,
            researchSources: unitOfWork.researchSources,
            researchClaimSources: unitOfWork.researchClaimSources,
            researchConflicts: unitOfWork.researchConflicts,
            featureSnapshots: unitOfWork.featureSnapshots,
            availabilitySnapshots: unitOfWork.availabilitySnapshots,
            lineupSnapshots: unitOfWork.lineupSnapshots,
            lineupParticipants: unitOfWork.lineupParticipants,
            researchAssignments: unitOfWork.researchAssignments,
            auditEvents: unitOfWork.auditEvents,
          },
          ai: resolveResearchAiConfig(DEFAULT_WORKER_ENV),
        });

        return {
          fixtureId,
          bundleId: result.persistableResearchBundle.id,
          bundleStatus: result.persistableResearchBundle.gateResult.status,
          recommendedLean: result.persistableResearchBundle.recommendedLean,
          ...(result.aiRun ? { aiRunId: result.aiRun.id } : {}),
        };
      }

      if (claim.task.kind === "prediction" && fixtureId) {
        return await scoreFixturePrediction(
          undefined,
          fixtureId,
          claim.task.id,
          {
            client: client as unknown as ScoringWorkerPrismaClientLike,
            unitOfWork,
            generatedAt: toIso(now),
            env: DEFAULT_WORKER_ENV,
          },
        ) as unknown as Record<string, unknown>;
      }

      if (claim.task.kind === "validation") {
        return await runValidationWorker(undefined, {
          unitOfWork,
          executedAt: toIso(now),
        }) as unknown as Record<string, unknown>;
      }

      if (claim.task.kind === "sandbox-replay") {
        const profileName = asOptionalString(claim.task.payload.profileName);
        const packId = asOptionalString(claim.task.payload.packId);
        const gitSha = asOptionalString(claim.task.payload.gitSha);
        if (!profileName || !packId || !gitSha) {
          throw new Error("sandbox-replay payload requires profileName, packId, and gitSha");
        }

        const materialized = await materializeSandboxRun(
          {
            mode: "replay",
            profileName: profileName as Parameters<typeof materializeSandboxRun>[0]["profileName"],
            packId,
            gitSha,
            now,
          },
          unitOfWork as unknown as Parameters<typeof materializeSandboxRun>[1],
        );

        return {
          mode: "replay",
          packId,
          profileName,
          gitSha,
          ...materialized,
        };
      }

      throw new Error(`Unsupported dispatcher task kind: ${claim.task.kind}`);
    });

    await completeClaim(queue, claim, now);
    return {
      claim,
      status: "succeeded",
      output,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dispatcher error";
    await failClaim(queue, claim, message, now);
    return {
      claim,
      status: "failed",
      error: message,
    };
  }
};

const listQueuedManifestTasks = async (
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
  manifestId: string,
  kind: QueueTaskEntity["kind"],
  nowIso: string,
): Promise<readonly QueueTaskEntity[]> =>
  (await unitOfWork.tasks.list())
    .filter((task) =>
      manifestIdFromTask(task) === manifestId &&
      task.kind === kind &&
      task.status === "queued" &&
      isTaskReady(task, nowIso),
    )
    .sort(compareQueuedReadyTasks);

const listManifestTasks = async (
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
  manifestId: string,
): Promise<readonly QueueTaskEntity[]> =>
  (await unitOfWork.tasks.list()).filter(
    (task) => manifestIdFromTask(task) === manifestId,
  );

const findManifestToDispatch = async (
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
  nowIso: string,
): Promise<string | null> => {
  const candidate = (await unitOfWork.tasks.list())
    .filter((task) => task.status === "queued" && isTaskReady(task, nowIso))
    .sort(compareQueuedReadyTasks)
    .find((task) => manifestIdFromTask(task));

  return candidate ? manifestIdFromTask(candidate) ?? null : null;
};

const enqueueManifestPredictionTask = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  manifestId: string,
  fixtureId: string,
  now: Date,
): Promise<string> => {
  const workflowId = `${manifestId}:prediction`;
  const traceId = `${workflowId}:${fixtureId}`;
  const source = "hermes-dispatcher";
  return (
    await queue.enqueue({
      id: predictionTaskIdForManifest(manifestId, fixtureId),
      kind: "prediction",
      manifestId,
      workflowId,
      traceId,
      correlationId: manifestId,
      source,
      payload: createRuntimeTaskPayload(
        {
          fixtureId,
          step: "automation-prediction",
        },
        {
          manifestId,
          workflowId,
          traceId,
          correlationId: manifestId,
          source,
        },
      ),
      priority: 50,
      scheduledFor: now,
      now,
    })
  ).id;
};

const ensureManifestPredictionTasks = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
  manifestId: string,
  fixtureIds: readonly string[],
  now: Date,
): Promise<readonly string[]> => {
  const existingTasks = await listManifestTasks(unitOfWork, manifestId);
  const createdTaskIds: string[] = [];

  for (const fixtureId of dedupeStrings(fixtureIds)) {
    const existingPrediction = existingTasks.find(
      (task) =>
        task.kind === "prediction" &&
        fixtureIdFromTask(task) === fixtureId,
    );

    if (existingPrediction) {
      continue;
    }

    createdTaskIds.push(
      await enqueueManifestPredictionTask(queue, manifestId, fixtureId, now),
    );
  }

  return createdTaskIds;
};

const ensureManifestValidationTask = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
  manifestId: string,
  now: Date,
  predictionTaskIds: readonly string[],
): Promise<string> => {
  const existing = (await listManifestTasks(unitOfWork, manifestId)).find(
    (task) => task.kind === "validation",
  );
  if (existing) {
    return existing.id;
  }

  const workflowId = `${manifestId}:validation`;
  const traceId = `${workflowId}:${toIso(now)}`;
  const source = "hermes-dispatcher";
  return (
    await queue.enqueue({
      id: validationTaskIdForManifest(manifestId),
      kind: "validation",
      manifestId,
      workflowId,
      traceId,
      correlationId: manifestId,
      source,
      payload: createRuntimeTaskPayload(
        {
          executedAt: toIso(now),
          predictionTaskIds: [...predictionTaskIds],
        },
        {
          manifestId,
          workflowId,
          traceId,
          correlationId: manifestId,
          source,
        },
      ),
      priority: 10,
      scheduledFor: now,
      now,
    })
  ).id;
};

const processQueuedTasks = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  client: PrismaClient,
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
  manifestId: string,
  kind: QueueTaskEntity["kind"],
  now: Date,
  maxClaims: number,
  executions: DispatcherTaskExecution[],
  ingestionRuntime: ReturnType<typeof createIngestionWorkerRuntime>,
): Promise<void> => {
  const readyTasks = await listQueuedManifestTasks(unitOfWork, manifestId, kind, toIso(now));

  for (const task of readyTasks) {
    if (executions.length >= maxClaims) {
      return;
    }

    const claim = await claimTaskById(queue, task.id, now);
    if (!claim) {
      continue;
    }

    executions.push(
      await executeClaim(
        queue,
        client,
        unitOfWork,
        claim,
        now,
        ingestionRuntime,
      ),
    );
  }
};

export const runDispatcherCycle = async (
  databaseUrl: string,
  options: DispatcherCycleOptions = {},
): Promise<RuntimeCycleResult> => {
  const now = options.now ?? new Date();
  const leaseOwner = options.leaseOwner ?? defaultLeaseOwner("dispatcher");
  const maxClaims = Math.max(1, options.maxClaims ?? 5);
  const client = await createConnectedVerifiedPrismaClient({ databaseUrl });
  let observability: ReturnType<typeof createObservabilityKit> | null = null;

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const queue = createRuntimeQueue(client, unitOfWork);
    const ingestionRuntime = createIngestionWorkerRuntime({
      env: DEFAULT_WORKER_ENV,
      prismaClient: client,
      unitOfWork,
    });
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
    observability = createObservabilityKit({
      context: {
        correlationId: cycle.id,
        traceId: `${cycle.id}:dispatcher`,
        workspace: "hermes-dispatcher",
        labels: {
          cycleKind: "dispatcher",
          leaseOwner,
        },
      },
      refs: {
        automationCycleId: cycle.id,
      },
      sink: createPrismaDurableObservabilitySink(client),
    });
    observability.log("dispatcher cycle started", {
      data: {
        maxClaims,
      },
      refs: {
        automationCycleId: cycle.id,
      },
      timestamp: toIso(now),
    });
    observability.setGauge("runtime.dispatcher.max_claims", maxClaims, {
      refs: {
        automationCycleId: cycle.id,
      },
      recordedAt: toIso(now),
    });

    try {
      const manifestId =
        options.manifestId ??
        (await findManifestToDispatch(unitOfWork, toIso(now)));
      if (!manifestId) {
        observability.log("dispatcher cycle completed without work", {
          data: {
            reason: "No ready manifest-owned tasks were available.",
          },
          refs: {
            automationCycleId: cycle.id,
          },
          timestamp: toIso(now),
        });
        const finishedCycle = await unitOfWork.automationCycles.save(
          updateCycle(cycle, {
            status: "succeeded",
            finishedAt: toIso(now),
            summary: {
              source: "hermes-dispatcher",
              fixtureIds: [],
              taskIds: [],
              stages: [
                buildParlayStage({ status: "blocked" }),
              ],
              counts: {
                researchTaskCount: 0,
                predictionTaskCount: 0,
                parlayCount: 0,
                validationTaskCount: 0,
              },
            },
            metadata: {
              reason: "No ready manifest-owned tasks were available.",
              observability: {
                durableEvents: observability.sinkCapabilities.eventsDurable,
                durableMetrics: observability.sinkCapabilities.metricsDurable,
              },
            },
          }),
        );
        await observability.flush();

        return {
          cycle: finishedCycle,
          readModel: await loadAutomationCycleReadModelSafely(databaseUrl, finishedCycle.id),
        };
      }

      const executions: DispatcherTaskExecution[] = [];

      await processQueuedTasks(
        queue,
        client,
        unitOfWork,
        manifestId,
        "fixture-ingestion",
        now,
        maxClaims,
        executions,
        ingestionRuntime,
      );
      await processQueuedTasks(
        queue,
        client,
        unitOfWork,
        manifestId,
        "odds-ingestion",
        now,
        maxClaims,
        executions,
        ingestionRuntime,
      );
      await processQueuedTasks(
        queue,
        client,
        unitOfWork,
        manifestId,
        "sandbox-replay",
        now,
        maxClaims,
        executions,
        ingestionRuntime,
      );
      await processQueuedTasks(
        queue,
        client,
        unitOfWork,
        manifestId,
        "research",
        now,
        maxClaims,
        executions,
        ingestionRuntime,
      );

      const successfulResearchFixtureIds = executions
        .filter(
          (execution) =>
            execution.claim.task.kind === "research" &&
            execution.status === "succeeded" &&
            typeof execution.output?.fixtureId === "string",
        )
        .map((execution) => String(execution.output?.fixtureId));

      await ensureManifestPredictionTasks(
        queue,
        unitOfWork,
        manifestId,
        successfulResearchFixtureIds,
        now,
      );
      await processQueuedTasks(
        queue,
        client,
        unitOfWork,
        manifestId,
        "prediction",
        now,
        maxClaims,
        executions,
        ingestionRuntime,
      );

      const manifestTasksAfterPrediction = await listManifestTasks(unitOfWork, manifestId);
      const successfulPredictionTaskIds = manifestTasksAfterPrediction
        .filter((task) => task.kind === "prediction" && task.status === "succeeded")
        .map((task) => task.id);

      let parlayStatus: AutomationCycleStageEntity["status"] = "blocked";
      let parlayMetadata: Record<string, unknown> = {};
      if (successfulPredictionTaskIds.length > 0) {
        try {
          const parlayResult = await runPublisherWorker(undefined, {
            client: client as unknown as PublisherWorkerPrismaClientLike,
            unitOfWork,
            generatedAt: toIso(now),
            predictionTaskIds: successfulPredictionTaskIds,
            env: DEFAULT_WORKER_ENV,
          });
          parlayStatus = parlayResult.status === "persisted" ? "succeeded" : "blocked";
          parlayMetadata = {
            generatedAt: parlayResult.generatedAt,
            status: parlayResult.status,
            candidateCount: parlayResult.candidateCount,
            loadedPredictionCount: parlayResult.loadedPredictionCount,
            selectedPredictionIds: parlayResult.selectedCandidates.map((candidate) => candidate.predictionId),
          };
        } catch (error) {
          parlayStatus = "failed";
          parlayMetadata = {
            error: error instanceof Error ? error.message : "Unexpected publisher error",
          };
        }
      }

      if (successfulPredictionTaskIds.length > 0) {
        await ensureManifestValidationTask(
          queue,
          unitOfWork,
          manifestId,
          now,
          successfulPredictionTaskIds,
        );
      }

      await processQueuedTasks(
        queue,
        client,
        unitOfWork,
        manifestId,
        "validation",
        now,
        maxClaims,
        executions,
        ingestionRuntime,
      );

      const manifestTasks = await listManifestTasks(unitOfWork, manifestId);
      const fixtureIds = dedupeStrings(
        manifestTasks
          .map(fixtureIdFromTask)
          .filter((fixtureId): fixtureId is string => typeof fixtureId === "string"),
      );
      const researchTasks = manifestTasks.filter((task) => task.kind === "research");
      const predictionTasks = manifestTasks.filter((task) => task.kind === "prediction");
      const validationTasks = manifestTasks.filter((task) => task.kind === "validation");
      const sandboxReplayTasks = manifestTasks.filter((task) => task.kind === "sandbox-replay");
      const firstClaimError = executions.find((execution) => execution.error)?.error;
      const cycleStatus =
        firstClaimError || parlayStatus === "failed" ? "failed" : "succeeded";
      const parlayGeneratedAt = asOptionalString(parlayMetadata.generatedAt);
      const parlayError = asOptionalString(parlayMetadata.error);
      const succeededExecutionCount = executions.filter((execution) => execution.status === "succeeded").length;
      const failedExecutionCount = executions.filter((execution) => execution.status === "failed").length;
      observability.setGauge("runtime.dispatcher.executions.succeeded", succeededExecutionCount, {
        refs: {
          automationCycleId: cycle.id,
        },
        recordedAt: toIso(now),
      });
      observability.setGauge("runtime.dispatcher.executions.failed", failedExecutionCount, {
        refs: {
          automationCycleId: cycle.id,
        },
        recordedAt: toIso(now),
      });
      observability.setGauge("runtime.dispatcher.manifest_tasks", manifestTasks.length, {
        refs: {
          automationCycleId: cycle.id,
        },
        recordedAt: toIso(now),
      });
      const finalCycle = await unitOfWork.automationCycles.save(
        updateCycle(cycle, {
          status: cycleStatus,
          finishedAt: toIso(now),
          ...(firstClaimError ? { error: firstClaimError } : {}),
          summary: {
            source: "hermes-dispatcher",
            fixtureIds,
            taskIds: manifestTasks.map((task) => task.id),
            ...(validationTasks[0] ? { validationTaskId: validationTasks[0].id } : {}),
            stages: [
              createStageSnapshot("research", researchTasks, executions),
              createStageSnapshot("prediction", predictionTasks, executions),
              buildParlayStage({
                status: parlayStatus,
                ...(parlayGeneratedAt ? { generatedAt: parlayGeneratedAt } : {}),
                ...(parlayError ? { error: parlayError } : {}),
              }),
              createStageSnapshot("validation", validationTasks, executions),
            ],
            counts: {
              researchTaskCount: researchTasks.length,
              predictionTaskCount: predictionTasks.length,
              parlayCount: parlayStatus === "succeeded" ? 1 : 0,
              validationTaskCount: validationTasks.length,
              sandboxReplayTaskCount: sandboxReplayTasks.length,
            },
          },
          metadata: {
            manifestId,
            parlayMetadata,
            sandboxReplayTaskIds: sandboxReplayTasks.map((task) => task.id),
            successfulPredictionTaskIds,
            observability: {
              durableEvents: observability.sinkCapabilities.eventsDurable,
              durableMetrics: observability.sinkCapabilities.metricsDurable,
            },
          },
        }),
      );
      observability.log("dispatcher cycle completed", {
        data: {
          manifestId,
          cycleStatus,
          parlayStatus,
          succeededExecutionCount,
          failedExecutionCount,
          taskCount: manifestTasks.length,
        },
        refs: {
          automationCycleId: finalCycle.id,
        },
        timestamp: toIso(now),
      });
      await observability.flush();

      return {
        cycle: finalCycle,
        readModel: await loadAutomationCycleReadModelSafely(databaseUrl, finalCycle.id),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected dispatcher cycle error";
      if (observability) {
        observability.log("dispatcher cycle failed", {
          severity: "error",
          data: {
            error: message,
          },
          refs: {
            automationCycleId: cycle.id,
          },
          timestamp: toIso(now),
        });
      }
      const failedCycle = await unitOfWork.automationCycles.save(
        updateCycle(cycle, {
          status: "failed",
          finishedAt: toIso(now),
          error: message,
          metadata: {
            failure: message,
          },
          summary: {
            source: "hermes-dispatcher",
            fixtureIds: [],
            taskIds: [],
            stages: [],
            counts: {
              researchTaskCount: 0,
              predictionTaskCount: 0,
              parlayCount: 0,
              validationTaskCount: 0,
            },
          },
        }),
      );
      if (observability) {
        await observability.flush();
      }

      return {
        cycle: failedCycle,
        readModel: await loadAutomationCycleReadModelSafely(databaseUrl, failedCycle.id),
      };
    } finally {
      await ingestionRuntime.close();
    }
  } finally {
    await client.$disconnect();
  }
};
