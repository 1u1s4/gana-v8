import { createHash } from "node:crypto";

import {
  SimpleCronScheduler,
  SimpleInMemoryQueue,
  buildExampleCronSpecs,
  createWorkflowRouter,
  describeWorkspace as describeOrchestrationSdk,
  type CronWorkflowSpec,
  type TaskEnvelope,
  type TaskExecutionResult,
  type WorkflowIntent,
  workspaceInfo as orchestrationWorkspaceInfo,
} from "@gana-v8/orchestration-sdk";
import {
  loadRuntimeConfig,
  type RuntimeConfig,
} from "@gana-v8/config-runtime";
import { runPublisherWorker, type PublishParlayMvpResult } from "@gana-v8/publisher-worker";
import {
  loadEligibleFixturesForScoring,
  scoreFixturePrediction,
  type FixtureScoreResult,
} from "@gana-v8/scoring-worker";
import { createPrismaClient, createPrismaUnitOfWork } from "@gana-v8/storage-adapters";
import { createTask, createTaskRun, type TaskEntity, type TaskKind, type TaskRunEntity } from "@gana-v8/domain-core";
import {
  FakeFootballApiClient,
  FootballApiFacade,
  ingestFixturesWindow,
  ingestOddsWindow,
  sampleFixtures,
  sampleOdds,
  type FetchFixturesWindowInput,
  type FetchOddsWindowInput,
} from "@gana-v8/source-connectors";
import { runValidationWorker, type ValidationWorkerRunResult } from "@gana-v8/validation-worker";

export const workspaceInfo = {
  packageName: "@gana-v8/hermes-control-plane",
  workspaceName: "hermes-control-plane",
  category: "app",
  description: "Coordinates workflows, tasks, policies, and approvals for gana-v8.",
  dependencies: [
    { name: "@gana-v8/audit-lineage", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/orchestration-sdk", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/source-connectors", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category}) -> ${describeOrchestrationSdk()}`;
}

export interface DemoRunRuntime {
  readonly appEnv: RuntimeConfig["app"]["env"];
  readonly profile: RuntimeConfig["app"]["profile"];
  readonly providerSource: RuntimeConfig["provider"]["source"];
  readonly providerBaseUrl: string;
  readonly logLevel: RuntimeConfig["logging"]["level"];
  readonly dryRun: boolean;
  readonly demoMode: boolean;
}

export interface DemoRunSummary {
  readonly triggeredAt: string;
  readonly workspace: string;
  readonly runtime: DemoRunRuntime;
  readonly registeredIntents: readonly WorkflowIntent[];
  readonly queuedBeforeRun: number;
  readonly completedCount: number;
  readonly cronJobs: readonly Pick<CronWorkflowSpec, "id" | "cron" | "intent" | "description">[];
  readonly results: readonly DemoRunResult[];
}

export interface DemoRunResult {
  readonly taskId: string;
  readonly intent: WorkflowIntent;
  readonly status: TaskExecutionResult["status"];
  readonly observedRecords: number;
  readonly batchId?: string;
  readonly checksum?: string;
  readonly warnings: readonly string[];
}

export interface DemoRunOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface PersistedTaskSummary {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly latestTasks: readonly TaskEntity[];
}

export type PersistedTaskIntent = Extract<TaskKind, "research" | "prediction" | "validation">;

export interface EnqueuePersistedTaskInput {
  readonly id?: string;
  readonly kind: PersistedTaskIntent;
  readonly payload: Record<string, unknown>;
  readonly priority?: number;
  readonly scheduledFor?: Date;
  readonly now?: Date;
}

export interface PersistedTaskClaim {
  readonly task: TaskEntity;
  readonly taskRun: TaskRunEntity;
}

export type PersistedTaskHandlerResult = Record<string, unknown>;

export type PersistedTaskHandler = (
  task: TaskEntity,
  taskRun: TaskRunEntity,
) => Promise<PersistedTaskHandlerResult> | PersistedTaskHandlerResult;

export interface PersistedTaskHandlers {
  readonly research: PersistedTaskHandler;
  readonly prediction: PersistedTaskHandler;
  readonly validation?: PersistedTaskHandler;
}

export interface RunNextPersistedTaskOptions {
  readonly kind?: PersistedTaskIntent;
  readonly now?: Date;
}

export interface PersistedTaskExecution {
  readonly task: TaskEntity;
  readonly taskRun: TaskRunEntity;
  readonly output: PersistedTaskHandlerResult;
  readonly error?: Error;
}

export interface EnqueuePredictionForEligibleFixturesOptions {
  readonly now?: Date;
  readonly fixtureIds?: readonly string[];
  readonly maxFixtures?: number;
  readonly priority?: number;
}

export interface EnqueuePredictionForEligibleFixturesResult {
  readonly queuedAt: string;
  readonly eligibleFixtureCount: number;
  readonly enqueuedCount: number;
  readonly skippedCount: number;
  readonly tasks: readonly TaskEntity[];
  readonly skippedFixtures: readonly {
    readonly fixtureId: string;
    readonly reason: string;
  }[];
}

export interface RunAutomationCycleOptions {
  readonly now?: Date;
  readonly fixtureIds?: readonly string[];
  readonly maxFixtures?: number;
  readonly predictionPriority?: number;
  readonly scoringGeneratedAt?: string;
  readonly parlayGeneratedAt?: string;
  readonly validationExecutedAt?: string;
  readonly validationTaskId?: string;
}

export interface AutomationCycleSummary {
  readonly startedAt: string;
  readonly enqueuedPredictions: EnqueuePredictionForEligibleFixturesResult;
  readonly processedPredictionCount: number;
  readonly predictionExecutions: readonly PersistedTaskExecution[];
  readonly parlayResult: PublishParlayMvpResult;
  readonly validationTask: TaskEntity;
  readonly validationExecution: PersistedTaskExecution;
  readonly validationResult: ValidationWorkerRunResult;
}

const toProviderSourceName = (runtimeConfig: RuntimeConfig): string =>
  `${runtimeConfig.provider.source}:${runtimeConfig.provider.baseUrl}`;

const createDemoRunRuntime = (runtimeConfig: RuntimeConfig): DemoRunRuntime => ({
  appEnv: runtimeConfig.app.env,
  profile: runtimeConfig.app.profile,
  providerSource: runtimeConfig.provider.source,
  providerBaseUrl: runtimeConfig.provider.baseUrl,
  logLevel: runtimeConfig.logging.level,
  dryRun: runtimeConfig.flags.dryRun,
  demoMode: runtimeConfig.flags.demoMode,
});

export const loadHermesRuntimeConfig = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeConfig =>
  loadRuntimeConfig({
    appName: workspaceInfo.workspaceName,
    env,
  });

const createFixtureFacade = (runtimeConfig: RuntimeConfig) =>
  new FootballApiFacade(new FakeFootballApiClient(sampleFixtures(), sampleOdds()), {
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    providerCode: "api-football",
    runIdFactory: () => "demo-run-fixtures",
    sourceName: toProviderSourceName(runtimeConfig),
  });

const createOddsFacade = (runtimeConfig: RuntimeConfig) =>
  new FootballApiFacade(new FakeFootballApiClient(sampleFixtures(), sampleOdds()), {
    now: () => new Date("2026-04-15T12:15:00.000Z"),
    providerCode: "api-football",
    runIdFactory: () => "demo-run-odds",
    sourceName: toProviderSourceName(runtimeConfig),
  });

const stableId = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 12);
const AUTOMATION_PREDICTION_STEP = "score";
const AUTOMATION_SOURCE = "hermes-control-plane";
const AUTOMATION_PREDICTION_TASK_PREFIX = "automation:prediction:score";
const AUTOMATION_VALIDATION_TASK_PREFIX = "automation:validation";

export const createHermesJobRouter = (
  runtimeConfig: RuntimeConfig = loadHermesRuntimeConfig(),
) =>
  createWorkflowRouter([
    {
      intent: "ingest-fixtures",
      async handle(envelope: TaskEnvelope<Record<string, unknown>>) {
        const payload = envelope.payload as unknown as FetchFixturesWindowInput & { league?: string };
        const result = await ingestFixturesWindow(createFixtureFacade(runtimeConfig), {
          ...(payload.league ? { league: payload.league } : {}),
          window: payload.window,
        });

        return {
          batchId: result.batch.batchId,
          checksum: result.batch.checksum,
          observedRecords: result.observedRecords,
          rawRefs: result.batch.rawObjectRefs,
          warnings: result.batch.warnings,
        };
      },
    },
    {
      intent: "ingest-odds",
      async handle(envelope: TaskEnvelope<Record<string, unknown>>) {
        const payload = envelope.payload as unknown as FetchOddsWindowInput;
        const fixtureIds = sampleFixtures().map((fixture) => fixture.providerFixtureId);
        const result = await ingestOddsWindow(createOddsFacade(runtimeConfig), {
          fixtureIds: payload.fixtureIds ?? fixtureIds,
          ...(payload.marketKeys ? { marketKeys: payload.marketKeys } : {}),
          window: payload.window,
        });

        return {
          batchId: result.batch.batchId,
          checksum: result.batch.checksum,
          observedRecords: result.observedRecords,
          rawRefs: result.batch.rawObjectRefs,
          warnings: result.batch.warnings,
        };
      },
    },
  ]);

export const buildHermesCronSpecs = (): readonly CronWorkflowSpec[] =>
  buildExampleCronSpecs().map((spec) => ({
    ...spec,
    description: `${spec.description} [hermes-native]`,
    id: `hermes:${spec.id}:${stableId(spec.intent)}`,
    labels: [...(spec.labels ?? []), "hermes-native"],
    source: `${spec.source}/${orchestrationWorkspaceInfo.workspaceName}`,
  }));

export const runDemoControlPlane = async (
  now: Date = new Date("2026-04-15T12:00:00.000Z"),
  options: DemoRunOptions = {},
): Promise<DemoRunSummary> => {
  const runtimeConfig = loadHermesRuntimeConfig(options.env);
  const queue = new SimpleInMemoryQueue();
  const specs = buildHermesCronSpecs();
  const scheduler = new SimpleCronScheduler(specs, queue);
  const router = createHermesJobRouter(runtimeConfig);

  scheduler.tick(now);
  const queuedBeforeRun = queue.stats().queued;
  const results: DemoRunResult[] = [];

  while (true) {
    const reservation = queue.dequeue(now);
    if (!reservation) {
      break;
    }

    const execution = await router.dispatch(reservation.envelope);
    queue.complete(reservation.envelope.id, execution);

    const output = execution.output as
      | {
          readonly batchId?: string;
          readonly checksum?: string;
          readonly observedRecords?: number;
          readonly warnings?: readonly string[];
        }
      | undefined;

    results.push({
      intent: reservation.envelope.intent,
      observedRecords: output?.observedRecords ?? 0,
      status: execution.status,
      taskId: reservation.envelope.id,
      warnings: output?.warnings ?? [],
      ...(output?.batchId ? { batchId: output.batchId } : {}),
      ...(output?.checksum ? { checksum: output.checksum } : {}),
    });
  }

  return {
    completedCount: queue.stats().completed,
    cronJobs: specs.map(({ cron, description, id, intent }) => ({ cron, description, id, intent })),
    queuedBeforeRun,
    registeredIntents: router.intents(),
    results,
    runtime: createDemoRunRuntime(runtimeConfig),
    triggeredAt: now.toISOString(),
    workspace: describeWorkspace(),
  };
};

const createPersistedTaskId = (kind: PersistedTaskIntent, payload: Record<string, unknown>, now: Date): string =>
  `persisted:${kind}:${stableId(JSON.stringify({ kind, now: now.toISOString(), payload }))}`;

const createAutomationPredictionTaskId = (fixtureId: string): string =>
  `${AUTOMATION_PREDICTION_TASK_PREFIX}:${fixtureId}`;

const createAutomationValidationTaskId = (executedAt: string): string =>
  `${AUTOMATION_VALIDATION_TASK_PREFIX}:${executedAt.replace(/[^a-zA-Z0-9]/g, "")}`;

const requirePayloadString = (task: TaskEntity, key: string): string => {
  const value = task.payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Persisted task ${task.id} is missing string payload.${key}`);
  }

  return value;
};

const loadPersistedTaskById = async (
  databaseUrl: string,
  taskId: string,
): Promise<TaskEntity | null> => {
  const client = createPrismaClient(databaseUrl);

  try {
    return createPrismaUnitOfWork(client).tasks.getById(taskId);
  } finally {
    await client.$disconnect();
  }
};

const ensurePersistedTask = (task: TaskEntity | null, taskId: string): TaskEntity => {
  if (!task) {
    throw new Error(`Persisted task ${taskId} was not found after write`);
  }

  return task;
};

export const enqueuePersistedTask = async (
  databaseUrl: string,
  input: EnqueuePersistedTaskInput,
): Promise<TaskEntity> => {
  const client = createPrismaClient(databaseUrl);

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const now = input.now ?? new Date();
    const task = createTask({
      id: input.id ?? createPersistedTaskId(input.kind, input.payload, now),
      kind: input.kind,
      status: "queued",
      priority: input.priority ?? 0,
      payload: input.payload,
      ...(input.scheduledFor ? { scheduledFor: input.scheduledFor.toISOString() } : {}),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    return unitOfWork.tasks.save(task);
  } finally {
    await client.$disconnect();
  }
};

export const maybeClaimNextPersistedTask = async (
  databaseUrl: string,
  kind?: PersistedTaskIntent,
  now: Date = new Date(),
): Promise<PersistedTaskClaim | null> => {
  const client = createPrismaClient(databaseUrl);

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const nextTask = (await unitOfWork.tasks.findByStatus("queued")).find((candidate) => {
      if (kind && candidate.kind !== kind) {
        return false;
      }

      if (candidate.scheduledFor) {
        return candidate.scheduledFor <= now.toISOString();
      }

      return true;
    });

    if (!nextTask) {
      return null;
    }

    const claimedAt = now.toISOString();
    const claimResult = await client.task.updateMany({
      where: { id: nextTask.id, status: "queued" },
      data: { status: "running", updatedAt: new Date(claimedAt) },
    });

    if (claimResult.count === 0) {
      return null;
    }

    const taskRun = await unitOfWork.taskRuns.save(
      createTaskRun({
        id: `${nextTask.id}:attempt:1`,
        taskId: nextTask.id,
        attemptNumber: 1,
        status: "running",
        startedAt: claimedAt,
        createdAt: claimedAt,
        updatedAt: claimedAt,
      }),
    );
    const task = ensurePersistedTask(await unitOfWork.tasks.getById(nextTask.id), nextTask.id);

    return { task, taskRun };
  } finally {
    await client.$disconnect();
  }
};

export const runNextPersistedTask = async (
  databaseUrl: string,
  handlers: PersistedTaskHandlers,
  options: RunNextPersistedTaskOptions = {},
): Promise<PersistedTaskExecution | null> => {
  const claim = await maybeClaimNextPersistedTask(databaseUrl, options.kind, options.now);

  if (!claim) {
    return null;
  }

  const client = createPrismaClient(databaseUrl);

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const finishedAt = (options.now ?? new Date()).toISOString();
    const handler = handlers[claim.task.kind as PersistedTaskIntent];

    if (!handler) {
      throw new Error(`No persisted task handler registered for kind ${claim.task.kind}`);
    }

    try {
      const output = await handler(claim.task, claim.taskRun);
      const taskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...claim.taskRun,
          status: "succeeded",
          finishedAt,
          updatedAt: finishedAt,
        }),
      );
      await client.task.update({
        where: { id: claim.task.id },
        data: { status: "succeeded", updatedAt: new Date(finishedAt) },
      });
      const task = ensurePersistedTask(await unitOfWork.tasks.getById(claim.task.id), claim.task.id);

      return { task, taskRun, output };
    } catch (error) {
      const taskError = error instanceof Error ? error : new Error(String(error));
      const taskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...claim.taskRun,
          status: "failed",
          finishedAt,
          error: taskError.message,
          updatedAt: finishedAt,
        }),
      );
      await client.task.update({
        where: { id: claim.task.id },
        data: { status: "failed", updatedAt: new Date(finishedAt) },
      });
      const task = ensurePersistedTask(await unitOfWork.tasks.getById(claim.task.id), claim.task.id);

      return { task, taskRun, output: {}, error: taskError };
    }
  } finally {
    await client.$disconnect();
  }
};

export const loadPersistedTaskSummary = async (
  databaseUrl: string,
): Promise<PersistedTaskSummary> => {
  const client = createPrismaClient(databaseUrl);

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const tasks = await unitOfWork.tasks.list();
    const latestTasks = [...tasks]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 10);

    return {
      cancelled: tasks.filter((task) => task.status === "cancelled").length,
      failed: tasks.filter((task) => task.status === "failed").length,
      latestTasks,
      queued: tasks.filter((task) => task.status === "queued").length,
      running: tasks.filter((task) => task.status === "running").length,
      succeeded: tasks.filter((task) => task.status === "succeeded").length,
      total: tasks.length,
    };
  } finally {
    await client.$disconnect();
  }
};

export const enqueuePredictionForEligibleFixtures = async (
  databaseUrl: string,
  options: EnqueuePredictionForEligibleFixturesOptions = {},
): Promise<EnqueuePredictionForEligibleFixturesResult> => {
  const now = options.now ?? new Date();
  const eligibleFixtures = await loadEligibleFixturesForScoring(databaseUrl);
  const filteredFixtures = options.fixtureIds
    ? eligibleFixtures.filter((candidate) => options.fixtureIds?.includes(candidate.fixture.id))
    : eligibleFixtures;
  const selectedFixtures =
    options.maxFixtures !== undefined
      ? filteredFixtures.filter((candidate) => candidate.eligible).slice(0, options.maxFixtures)
      : filteredFixtures;

  const tasks: TaskEntity[] = [];
  const skippedFixtures: Array<{ fixtureId: string; reason: string }> = [];

  for (const candidate of selectedFixtures) {
    if (!candidate.eligible) {
      skippedFixtures.push({
        fixtureId: candidate.fixture.id,
        reason: candidate.reason ?? "Fixture is not eligible for scoring.",
      });
      continue;
    }

    const taskId = createAutomationPredictionTaskId(candidate.fixture.id);
    const existingTask = await loadPersistedTaskById(databaseUrl, taskId);
    if (existingTask) {
      skippedFixtures.push({
        fixtureId: candidate.fixture.id,
        reason: `Prediction task ${taskId} already exists with status ${existingTask.status}.`,
      });
      continue;
    }

    tasks.push(
      await enqueuePersistedTask(databaseUrl, {
        id: taskId,
        kind: "prediction",
        priority: options.priority ?? 50,
        payload: {
          fixtureId: candidate.fixture.id,
          source: AUTOMATION_SOURCE,
          step: AUTOMATION_PREDICTION_STEP,
        },
        scheduledFor: now,
        now,
      }),
    );
  }

  return {
    queuedAt: now.toISOString(),
    eligibleFixtureCount: selectedFixtures.filter((candidate) => candidate.eligible).length,
    enqueuedCount: tasks.length,
    skippedCount: skippedFixtures.length,
    tasks,
    skippedFixtures,
  };
};

export const runAutomationCycle = async (
  databaseUrl: string,
  options: RunAutomationCycleOptions = {},
): Promise<AutomationCycleSummary> => {
  const now = options.now ?? new Date();
  const scoringGeneratedAt = options.scoringGeneratedAt ?? now.toISOString();
  const parlayGeneratedAt = options.parlayGeneratedAt ?? now.toISOString();
  const validationExecutedAt = options.validationExecutedAt ?? now.toISOString();
  const validationTaskId =
    options.validationTaskId ?? createAutomationValidationTaskId(validationExecutedAt);
  const enqueuedPredictions = await enqueuePredictionForEligibleFixtures(databaseUrl, {
    now,
    ...(options.fixtureIds ? { fixtureIds: options.fixtureIds } : {}),
    ...(options.maxFixtures !== undefined ? { maxFixtures: options.maxFixtures } : {}),
    ...(options.predictionPriority !== undefined ? { priority: options.predictionPriority } : {}),
  });

  const handlers: PersistedTaskHandlers = {
    research: async () => {
      throw new Error("Research automation is not part of the minimal scoring pipeline.");
    },
    prediction: async (task) => {
      const step = requirePayloadString(task, "step");
      if (step !== AUTOMATION_PREDICTION_STEP) {
        throw new Error(`Unsupported prediction automation step ${step}`);
      }

      const result = await scoreFixturePrediction(
        databaseUrl,
        requirePayloadString(task, "fixtureId"),
        task.id,
        {
          generatedAt: scoringGeneratedAt,
        },
      );

      return {
        ...result,
      };
    },
    validation: async () => {
      const result = await runValidationWorker(databaseUrl, {
        executedAt: validationExecutedAt,
      });

      return {
        ...result,
      };
    },
  };

  const predictionExecutions: PersistedTaskExecution[] = [];
  while (true) {
    const execution = await runNextPersistedTask(databaseUrl, handlers, {
      kind: "prediction",
      now,
    });
    if (!execution) {
      break;
    }

    predictionExecutions.push(execution);
  }

  const parlayResult = await runPublisherWorker(databaseUrl, { generatedAt: parlayGeneratedAt });
  const validationTask =
    (await loadPersistedTaskById(databaseUrl, validationTaskId)) ??
    (await enqueuePersistedTask(databaseUrl, {
      id: validationTaskId,
      kind: "validation",
      priority: 10,
      payload: {
        executedAt: validationExecutedAt,
        source: AUTOMATION_SOURCE,
      },
      scheduledFor: now,
      now,
    }));
  const validationExecution = await runNextPersistedTask(databaseUrl, handlers, {
    kind: "validation",
    now,
  });

  if (!validationExecution) {
    throw new Error(`Validation task ${validationTask.id} could not be executed`);
  }

  return {
    startedAt: now.toISOString(),
    enqueuedPredictions,
    processedPredictionCount: predictionExecutions.length,
    predictionExecutions,
    parlayResult,
    validationTask,
    validationExecution,
    validationResult: validationExecution.output as unknown as ValidationWorkerRunResult,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await runDemoControlPlane();
  console.log(JSON.stringify(summary, null, 2));
}
