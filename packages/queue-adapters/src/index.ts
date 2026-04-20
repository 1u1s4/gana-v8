import { createHash } from "node:crypto";

export const workspaceInfo = {
  packageName: "@gana-v8/queue-adapters",
  workspaceName: "queue-adapters",
  category: "package",
  description: "Queue adapters for persisted and in-memory background workflow dispatch.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" },
  ],
} as const;

export type QueueTaskStatus = "queued" | "running" | "succeeded" | "failed" | "quarantined" | "cancelled";
export type QueueTaskKind =
  | "fixture-ingestion"
  | "odds-ingestion"
  | "research"
  | "prediction"
  | "validation"
  | "sandbox-replay";

export interface QueueTaskAttempt {
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly error?: string;
}

export interface QueueTaskEntity {
  readonly id: string;
  readonly kind: QueueTaskKind;
  readonly status: QueueTaskStatus;
  readonly triggerKind: "cron" | "manual" | "retry" | "system";
  readonly priority: number;
  readonly dedupeKey?: string;
  readonly payload: Record<string, unknown>;
  readonly attempts: readonly QueueTaskAttempt[];
  readonly scheduledFor?: string;
  readonly maxAttempts: number;
  readonly lastErrorMessage?: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueTaskRunEntity {
  readonly id: string;
  readonly taskId: string;
  readonly attemptNumber: number;
  readonly status: "running" | "succeeded" | "failed" | "cancelled";
  readonly workerName?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly error?: string;
  readonly result?: Record<string, unknown>;
  readonly retryScheduledFor?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface QueueTaskSummary {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly quarantined: number;
  readonly cancelled: number;
  readonly latestTasks: readonly QueueTaskEntity[];
}

export interface QueueTaskClaim {
  readonly task: QueueTaskEntity;
  readonly taskRun: QueueTaskRunEntity;
}

export interface EnqueueQueueTaskInput {
  readonly id?: string;
  readonly kind: QueueTaskKind;
  readonly payload: Record<string, unknown>;
  readonly priority?: number;
  readonly scheduledFor?: Date;
  readonly maxAttempts?: number;
  readonly leaseMs?: number;
  readonly now?: Date;
}

export interface QueueTaskRepositoryLike {
  save(task: QueueTaskEntity): Promise<QueueTaskEntity>;
  getById(id: string): Promise<QueueTaskEntity | null>;
  list(): Promise<QueueTaskEntity[]>;
  findByStatus(status: QueueTaskStatus): Promise<QueueTaskEntity[]>;
}

export interface QueueTaskRunRepositoryLike {
  save(taskRun: QueueTaskRunEntity): Promise<QueueTaskRunEntity>;
  getById(id: string): Promise<QueueTaskRunEntity | null>;
  findByTaskId(taskId: string): Promise<QueueTaskRunEntity[]>;
}

export interface QueueUnitOfWorkLike {
  readonly tasks: QueueTaskRepositoryLike;
  readonly taskRuns: QueueTaskRunRepositoryLike;
}

export interface PrismaTaskClientLike {
  updateMany(args: {
    where: { id: string; status: QueueTaskStatus };
    data: {
      status: QueueTaskStatus;
      updatedAt: Date;
      triggerKind?: QueueTaskEntity["triggerKind"];
      scheduledFor?: Date | null;
      lastErrorMessage?: string | null;
    };
  }): Promise<{ count: number }>;
  update(args: {
    where: { id: string };
    data: {
      status: QueueTaskStatus;
      updatedAt: Date;
      triggerKind?: QueueTaskEntity["triggerKind"];
      scheduledFor?: Date | null;
      lastErrorMessage?: string | null;
    };
  }): Promise<unknown>;
}

export interface PrismaQueueClientLike {
  readonly task: PrismaTaskClientLike;
  $transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T>;
}

export interface TaskQueueAdapter {
  enqueue(input: EnqueueQueueTaskInput): Promise<QueueTaskEntity>;
  claimNext(kind?: QueueTaskKind, now?: Date): Promise<QueueTaskClaim | null>;
  renewLease(taskId: string, taskRunId: string, now?: Date, leaseMs?: number): Promise<QueueTaskClaim>;
  complete(taskId: string, taskRunId: string, now?: Date): Promise<QueueTaskClaim>;
  fail(taskId: string, taskRunId: string, error: string, now?: Date): Promise<QueueTaskClaim>;
  quarantine(taskId: string, taskRunId: string, reason: string, now?: Date): Promise<QueueTaskClaim>;
  requeue(taskId: string, now?: Date): Promise<QueueTaskEntity>;
  summary(): Promise<QueueTaskSummary>;
  getTaskById(taskId: string): Promise<QueueTaskEntity | null>;
}

const ensureTask = (task: QueueTaskEntity | null, taskId: string): QueueTaskEntity => {
  if (!task) {
    throw new Error(`Persisted task ${taskId} was not found`);
  }

  return task;
};

const ensureTaskRun = (taskRun: QueueTaskRunEntity | null, taskRunId: string): QueueTaskRunEntity => {
  if (!taskRun) {
    throw new Error(`Task run ${taskRunId} was not found`);
  }

  return taskRun;
};

const ensureTaskLifecycleMatch = (
  task: QueueTaskEntity,
  taskRun: QueueTaskRunEntity,
  expectedTaskId: string,
): void => {
  if (taskRun.taskId !== expectedTaskId) {
    throw new Error(`Task run ${taskRun.id} does not belong to task ${expectedTaskId}`);
  }

  if (task.status !== "running") {
    throw new Error(`Task ${task.id} is not running`);
  }

  if (taskRun.status !== "running") {
    throw new Error(`Task run ${taskRun.id} is not running`);
  }
};

const compareQueuedReadyTasks = (left: QueueTaskEntity, right: QueueTaskEntity): number => {
  const leftScheduledFor = left.scheduledFor ?? "";
  const rightScheduledFor = right.scheduledFor ?? "";
  if (leftScheduledFor !== rightScheduledFor) {
    return leftScheduledFor.localeCompare(rightScheduledFor);
  }

  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return left.createdAt.localeCompare(right.createdAt);
};

const computeOpaqueId = (prefix: string, seed: string): string => {
  const digest = createHash("sha256").update(seed).digest("hex");
  return `${prefix}_${digest.slice(0, 16)}`;
};

const createTask = (input: {
  readonly id: string;
  readonly kind: QueueTaskKind;
  readonly status: QueueTaskStatus;
  readonly triggerKind?: QueueTaskEntity["triggerKind"];
  readonly priority: number;
  readonly dedupeKey?: string;
  readonly payload: Record<string, unknown>;
  readonly attempts?: readonly QueueTaskAttempt[];
  readonly scheduledFor?: string;
  readonly maxAttempts?: number;
  readonly lastErrorMessage?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}): QueueTaskEntity => ({
  ...input,
  triggerKind: input.triggerKind ?? "system",
  attempts: input.attempts ?? [],
  maxAttempts: input.maxAttempts ?? 3,
});

const createTaskRun = (input: QueueTaskRunEntity): QueueTaskRunEntity => input;

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_LEASE_OWNER = "in-memory-queue";
const DEFAULT_RETRY_BACKOFF_MS = 60 * 1000;

const startTask = (
  task: QueueTaskEntity,
  startedAt: string,
  leaseOwner: string = DEFAULT_LEASE_OWNER,
  leaseMs: number = DEFAULT_LEASE_MS,
): QueueTaskEntity => {
  if (task.status !== "queued") {
    throw new Error(`Task ${task.id} is not queued`);
  }

  return {
    ...task,
    status: "running",
    attempts: [...task.attempts, { startedAt }],
    leaseOwner,
    leaseExpiresAt: new Date(Date.parse(startedAt) + leaseMs).toISOString(),
    updatedAt: startedAt,
  };
};

const finishTask = (
  task: QueueTaskEntity,
  outcome: Extract<QueueTaskStatus, "succeeded" | "failed" | "cancelled">,
  finishedAt: string,
  error?: string,
): QueueTaskEntity => {
  if (task.status !== "running") {
    throw new Error(`Task ${task.id} is not running`);
  }

  const lastAttempt = task.attempts.at(-1);
  if (!lastAttempt) {
    throw new Error(`Task ${task.id} has no attempt to finish`);
  }

  const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...rest } = task;

  return {
    ...rest,
    status: outcome,
    attempts: [
      ...task.attempts.slice(0, -1),
      {
        ...lastAttempt,
        finishedAt,
        ...(error ? { error } : {}),
      },
    ],
    ...(error ? { lastErrorMessage: error } : {}),
    updatedAt: finishedAt,
  };
};

const shouldRetryTask = (task: QueueTaskEntity): boolean => task.attempts.length < task.maxAttempts;

const hasExpiredLease = (task: QueueTaskEntity, nowIso: string): boolean => {
  if (task.status !== "running") {
    return false;
  }

  const leaseDeadline = task.leaseExpiresAt ?? new Date(Date.parse(task.updatedAt) + DEFAULT_LEASE_MS).toISOString();
  return leaseDeadline <= nowIso;
};

const recycleExpiredLeaseTask = (task: QueueTaskEntity, nowIso: string): QueueTaskEntity => {
  const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...rest } = task;
  return {
    ...rest,
    status: "queued",
    updatedAt: nowIso,
  };
};

const renewTaskLease = (
  task: QueueTaskEntity,
  renewedAt: string,
  leaseMs: number = DEFAULT_LEASE_MS,
  leaseOwner: string = DEFAULT_LEASE_OWNER,
): QueueTaskEntity => {
  if (task.status !== "running") {
    throw new Error(`Task ${task.id} is not running`);
  }

  return {
    ...task,
    leaseOwner,
    leaseExpiresAt: new Date(Date.parse(renewedAt) + leaseMs).toISOString(),
    updatedAt: renewedAt,
  };
};

const computeRetryScheduledFor = (task: QueueTaskEntity, failedAt: string): string =>
  new Date(Date.parse(failedAt) + DEFAULT_RETRY_BACKOFF_MS * Math.max(task.attempts.length, 1)).toISOString();

const quarantineTask = (
  task: QueueTaskEntity,
  reason: string,
  quarantinedAt: string,
): QueueTaskEntity => ({
  ...finishTask(task, "failed", quarantinedAt, reason),
  status: "quarantined",
  updatedAt: quarantinedAt,
});

const scheduleTaskRetry = (
  task: QueueTaskEntity,
  failedAt: string,
  error: string,
): { task: QueueTaskEntity; retryScheduledFor: string } => {
  const retryScheduledFor = computeRetryScheduledFor(task, failedAt);
  const failedTask = finishTask(task, "failed", failedAt, error);

  return {
    retryScheduledFor,
    task: {
      ...failedTask,
      status: "queued",
      triggerKind: "retry",
      scheduledFor: retryScheduledFor,
      updatedAt: failedAt,
    },
  };
};

const buildTaskSummary = (tasks: readonly QueueTaskEntity[]): QueueTaskSummary => ({
  total: tasks.length,
  queued: tasks.filter((task) => task.status === "queued").length,
  running: tasks.filter((task) => task.status === "running").length,
  succeeded: tasks.filter((task) => task.status === "succeeded").length,
  failed: tasks.filter((task) => task.status === "failed").length,
  quarantined: tasks.filter((task) => task.status === "quarantined").length,
  cancelled: tasks.filter((task) => task.status === "cancelled").length,
  latestTasks: [...tasks].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10),
});

const nextReadyTask = (
  tasks: readonly QueueTaskEntity[],
  kind: QueueTaskKind | undefined,
  nowIso: string,
): QueueTaskEntity | null =>
  tasks
    .filter((candidate) => {
      if (kind && candidate.kind !== kind) {
        return false;
      }

      return !candidate.scheduledFor || candidate.scheduledFor <= nowIso;
    })
    .sort(compareQueuedReadyTasks)[0] ?? null;

const inputLeaseMs = (_kind?: QueueTaskKind): number => DEFAULT_LEASE_MS;

const inMemoryQueueLocks = new WeakMap<QueueUnitOfWorkLike, Promise<void>>();

const runInMemoryQueueMutation = async <T>(
  unitOfWork: QueueUnitOfWorkLike,
  callback: () => Promise<T>,
): Promise<T> => {
  const previous = inMemoryQueueLocks.get(unitOfWork) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.then(() => current);
  inMemoryQueueLocks.set(unitOfWork, tail);

  await previous;
  try {
    return await callback();
  } finally {
    releaseCurrent();
    if (inMemoryQueueLocks.get(unitOfWork) === tail) {
      inMemoryQueueLocks.delete(unitOfWork);
    }
  }
};

export interface CreatePrismaTaskQueueAdapterOptions {
  readonly createTransactionalUnitOfWork: (client: unknown) => QueueUnitOfWorkLike;
}

export const createInMemoryTaskQueueAdapter = (unitOfWork: QueueUnitOfWorkLike): TaskQueueAdapter => ({
  async enqueue(input) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const now = input.now ?? new Date();
      return unitOfWork.tasks.save(
        createTask({
          id:
            input.id ??
            computeOpaqueId(
              "tsk",
              JSON.stringify({ kind: input.kind, payload: input.payload, now: now.toISOString(), priority: input.priority ?? 50 }),
            ),
          kind: input.kind,
          status: "queued",
          priority: input.priority ?? 50,
          payload: input.payload,
          ...(input.scheduledFor ? { scheduledFor: input.scheduledFor.toISOString() } : {}),
          ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      );
    });
  },

  async claimNext(kind, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const nowIso = now.toISOString();
      const runningTasks = await unitOfWork.tasks.findByStatus("running");
      for (const runningTask of runningTasks) {
        if (hasExpiredLease(runningTask, nowIso)) {
          await unitOfWork.tasks.save(recycleExpiredLeaseTask(runningTask, nowIso));
        }
      }

      const task = nextReadyTask(await unitOfWork.tasks.findByStatus("queued"), kind, nowIso);
      if (!task) {
        return null;
      }

      const claimedTask = await unitOfWork.tasks.save(
        startTask(task, nowIso, DEFAULT_LEASE_OWNER, inputLeaseMs(kind))
      );
      const attemptNumber = claimedTask.attempts.length;
      const taskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          id: computeOpaqueId("trn", `${claimedTask.id}:${attemptNumber}:${nowIso}`),
          taskId: claimedTask.id,
          attemptNumber,
          status: "running",
          startedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        }),
      );


      return { task: claimedTask, taskRun };
    });
  },

  async renewLease(taskId, taskRunId, now = new Date(), leaseMs = DEFAULT_LEASE_MS) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const renewedTask = await unitOfWork.tasks.save(renewTaskLease(task, now.toISOString(), leaseMs));
      const renewedTaskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          updatedAt: now.toISOString(),
        }),
      );

      return { task: renewedTask, taskRun: renewedTaskRun };
    });
  },

  async complete(taskId, taskRunId, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const savedTask = await unitOfWork.tasks.save(finishTask(task, "succeeded", now.toISOString()));
      const savedTaskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          status: "succeeded",
          result: { status: "succeeded" },
          finishedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      );

      return { task: savedTask, taskRun: savedTaskRun };
    });
  },

  async fail(taskId, taskRunId, error, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const failureTime = now.toISOString();
      const retryPlan = shouldRetryTask(task) ? scheduleTaskRetry(task, failureTime, error) : null;
      const terminalTask = retryPlan ? retryPlan.task : quarantineTask(task, error, failureTime);
      const savedTask = await unitOfWork.tasks.save(terminalTask);
      const savedTaskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          status: "failed",
          error,
          ...(retryPlan ? { retryScheduledFor: retryPlan.retryScheduledFor } : {}),
          result: { status: retryPlan ? "failed" : "quarantined", error },
          finishedAt: failureTime,
          updatedAt: failureTime,
        }),
      );

      return { task: savedTask, taskRun: savedTaskRun };
    });
  },

  async quarantine(taskId, taskRunId, reason, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const quarantinedAt = now.toISOString();
      const savedTask = await unitOfWork.tasks.save(quarantineTask(task, reason, quarantinedAt));
      const savedTaskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          status: "failed",
          error: reason,
          result: { status: "quarantined", error: reason },
          finishedAt: quarantinedAt,
          updatedAt: quarantinedAt,
        }),
      );

      return { task: savedTask, taskRun: savedTaskRun };
    });
  },

  async requeue(taskId, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      if (task.status !== "failed" && task.status !== "quarantined" && task.status !== "cancelled") {
        throw new Error(`Task ${taskId} cannot be requeued from status ${task.status}`);
      }

      const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...rest } = task;

      return unitOfWork.tasks.save({
        ...rest,
        status: "queued",
        updatedAt: now.toISOString(),
      });
    });
  },

  async summary() {
    return buildTaskSummary(await unitOfWork.tasks.list());
  },

  async getTaskById(taskId) {
    return unitOfWork.tasks.getById(taskId);
  },
});

export const createPrismaTaskQueueAdapter = (
  client: PrismaQueueClientLike,
  unitOfWork: QueueUnitOfWorkLike,
  options: CreatePrismaTaskQueueAdapterOptions,
): TaskQueueAdapter => ({
  async enqueue(input) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const now = input.now ?? new Date();
      return transactionalUnitOfWork.tasks.save(
        createTask({
          id:
            input.id ??
            computeOpaqueId(
              "tsk",
              JSON.stringify({ kind: input.kind, payload: input.payload, now: now.toISOString(), priority: input.priority ?? 50 }),
            ),
          kind: input.kind,
          status: "queued",
          priority: input.priority ?? 50,
          payload: input.payload,
          ...(input.scheduledFor ? { scheduledFor: input.scheduledFor.toISOString() } : {}),
          ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      );
    });
  },

  async claimNext(kind, now = new Date()) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const nowIso = now.toISOString();
      const runningTasks = await transactionalUnitOfWork.tasks.findByStatus("running");
      for (const runningTask of runningTasks) {
        if (!hasExpiredLease(runningTask, nowIso)) {
          continue;
        }

        const recycledTask = recycleExpiredLeaseTask(runningTask, nowIso);
        const recycleResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
          where: { id: runningTask.id, status: "running" },
          data: {
            status: "queued",
            updatedAt: new Date(nowIso),
            triggerKind: recycledTask.triggerKind,
            scheduledFor: recycledTask.scheduledFor ? new Date(recycledTask.scheduledFor) : null,
            lastErrorMessage: recycledTask.lastErrorMessage ?? null,
          },
        });
        if (recycleResult.count > 0) {
          await transactionalUnitOfWork.tasks.save(recycledTask);
        }
      }

      const queuedTasks = await transactionalUnitOfWork.tasks.findByStatus("queued");
      const readyTasks = queuedTasks
        .filter((candidate) => {
          if (kind && candidate.kind !== kind) {
            return false;
          }

          return !candidate.scheduledFor || candidate.scheduledFor <= nowIso;
        })
        .sort(compareQueuedReadyTasks);

      for (const task of readyTasks) {
        const claimResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
          where: { id: task.id, status: "queued" },
          data: { status: "running", updatedAt: new Date(nowIso) },
        });
        if (claimResult.count === 0) {
          continue;
        }

        const existingTaskRuns = await transactionalUnitOfWork.taskRuns.findByTaskId(task.id);
        const attemptNumber =
          existingTaskRuns.reduce(
            (maxAttemptNumber, existingTaskRun) =>
              Math.max(maxAttemptNumber, existingTaskRun.attemptNumber),
            0,
          ) + 1;
        await transactionalUnitOfWork.tasks.save(startTask(task, nowIso));
        const taskRun = await transactionalUnitOfWork.taskRuns.save(
          createTaskRun({
            id: computeOpaqueId("trn", `${task.id}:${attemptNumber}:${nowIso}`),
            taskId: task.id,
            attemptNumber,
            status: "running",
            workerName: "queue-adapter",
            startedAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          }),
        );

        return {
          task: ensureTask(await transactionalUnitOfWork.tasks.getById(task.id), task.id),
          taskRun: ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRun.id), taskRun.id),
        };
      }

      return null;
    });
  },

  async renewLease(taskId, taskRunId, now = new Date(), leaseMs = DEFAULT_LEASE_MS) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const nowIso = now.toISOString();
      const task = ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const renewedTask = renewTaskLease(task, nowIso, leaseMs);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: taskId, status: "running" },
        data: { status: "running", updatedAt: new Date(nowIso) },
      });
      if (updateTaskResult.count === 0) {
        throw new Error(`Task ${taskId} could not renew its lease because its persisted status changed`);
      }

      await transactionalUnitOfWork.tasks.save(renewedTask);
      const savedTaskRun = await transactionalUnitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          updatedAt: nowIso,
        }),
      );

      return {
        task: renewTaskLease(ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId), nowIso, leaseMs),
        taskRun: savedTaskRun,
      };
    });
  },

  async complete(taskId, taskRunId, now = new Date()) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const nowIso = now.toISOString();
      const task = ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const finishedTask = finishTask(task, "succeeded", nowIso);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: taskId, status: "running" },
        data: { status: "succeeded", updatedAt: new Date(nowIso) },
      });
      if (updateTaskResult.count === 0) {
        throw new Error(`Task ${taskId} could not be completed because its persisted status changed`);
      }

      await transactionalUnitOfWork.tasks.save(finishedTask);
      const savedTaskRun = await transactionalUnitOfWork.taskRuns.save(
        createTaskRun({
          ...ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId),
          status: "succeeded",
          workerName: "queue-adapter",
          result: { status: "succeeded" },
          finishedAt: nowIso,
          updatedAt: nowIso,
        }),
      );

      return {
        task: ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId),
        taskRun: savedTaskRun,
      };
    });
  },

  async fail(taskId, taskRunId, error, now = new Date()) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const nowIso = now.toISOString();
      const task = ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const retryPlan = shouldRetryTask(task) ? scheduleTaskRetry(task, nowIso, error) : null;
      const finishedTask = retryPlan ? retryPlan.task : quarantineTask(task, error, nowIso);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: taskId, status: "running" },
        data: {
          status: finishedTask.status,
          updatedAt: new Date(nowIso),
          triggerKind: finishedTask.triggerKind,
          scheduledFor: finishedTask.scheduledFor ? new Date(finishedTask.scheduledFor) : null,
          lastErrorMessage: finishedTask.lastErrorMessage ?? null,
        },
      });
      if (updateTaskResult.count === 0) {
        throw new Error(`Task ${taskId} could not be failed because its persisted status changed`);
      }

      await transactionalUnitOfWork.tasks.save(finishedTask);
      const savedTaskRun = await transactionalUnitOfWork.taskRuns.save(
        createTaskRun({
          ...ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId),
          status: "failed",
          workerName: "queue-adapter",
          error,
          ...(retryPlan ? { retryScheduledFor: retryPlan.retryScheduledFor } : {}),
          result: { status: retryPlan ? "failed" : "quarantined", error },
          finishedAt: nowIso,
          updatedAt: nowIso,
        }),
      );

      return {
        task: ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId),
        taskRun: savedTaskRun,
      };
    });
  },

  async quarantine(taskId, taskRunId, reason, now = new Date()) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const nowIso = now.toISOString();
      const task = ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId);
      const quarantinedTask = quarantineTask(task, reason, nowIso);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: taskId, status: "running" },
        data: {
          status: quarantinedTask.status,
          updatedAt: new Date(nowIso),
          triggerKind: quarantinedTask.triggerKind,
          scheduledFor: quarantinedTask.scheduledFor ? new Date(quarantinedTask.scheduledFor) : null,
          lastErrorMessage: quarantinedTask.lastErrorMessage ?? null,
        },
      });
      if (updateTaskResult.count === 0) {
        throw new Error(`Task ${taskId} could not be quarantined because its persisted status changed`);
      }

      await transactionalUnitOfWork.tasks.save(quarantinedTask);
      const savedTaskRun = await transactionalUnitOfWork.taskRuns.save(
        createTaskRun({
          ...ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId),
          status: "failed",
          workerName: "queue-adapter",
          error: reason,
          result: { status: "quarantined", error: reason },
          finishedAt: nowIso,
          updatedAt: nowIso,
        }),
      );

      return {
        task: ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId),
        taskRun: savedTaskRun,
      };
    });
  },

  async requeue(taskId, now = new Date()) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const task = ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId);
      if (task.status !== "failed" && task.status !== "quarantined" && task.status !== "cancelled") {
        throw new Error(`Task ${taskId} cannot be requeued from status ${task.status}`);
      }

      const { leaseOwner: _leaseOwner, leaseExpiresAt: _leaseExpiresAt, ...rest } = task;
      const requeuedTask = {
        ...rest,
        status: "queued" as const,
        updatedAt: now.toISOString(),
      };
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: taskId, status: task.status },
        data: { status: "queued", updatedAt: new Date(now.toISOString()) },
      });
      if (updateTaskResult.count === 0) {
        throw new Error(`Task ${taskId} could not be requeued because its persisted status changed`);
      }

      return await transactionalUnitOfWork.tasks.save(requeuedTask);
    });
  },

  async summary() {
    return unitOfWork.tasks.list().then(buildTaskSummary);
  },

  async getTaskById(taskId) {
    return unitOfWork.tasks.getById(taskId);
  },
});

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
