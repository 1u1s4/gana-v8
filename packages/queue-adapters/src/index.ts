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

export type QueueTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
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
  updateMany(args: { where: { id: string; status: QueueTaskStatus }; data: { status: QueueTaskStatus; updatedAt: Date } }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: { status: QueueTaskStatus; updatedAt: Date } }): Promise<unknown>;
}

export interface PrismaQueueClientLike {
  readonly task: PrismaTaskClientLike;
  $transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T>;
}

export interface TaskQueueAdapter {
  enqueue(input: EnqueueQueueTaskInput): Promise<QueueTaskEntity>;
  claimNext(kind?: QueueTaskKind, now?: Date): Promise<QueueTaskClaim | null>;
  complete(taskId: string, taskRunId: string, now?: Date): Promise<QueueTaskClaim>;
  fail(taskId: string, taskRunId: string, error: string, now?: Date): Promise<QueueTaskClaim>;
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

const startTask = (task: QueueTaskEntity, startedAt: string): QueueTaskEntity => {
  if (task.status !== "queued") {
    throw new Error(`Task ${task.id} is not queued`);
  }

  return {
    ...task,
    status: "running",
    attempts: [...task.attempts, { startedAt }],
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

  return {
    ...task,
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

const buildTaskSummary = (tasks: readonly QueueTaskEntity[]): QueueTaskSummary => ({
  total: tasks.length,
  queued: tasks.filter((task) => task.status === "queued").length,
  running: tasks.filter((task) => task.status === "running").length,
  succeeded: tasks.filter((task) => task.status === "succeeded").length,
  failed: tasks.filter((task) => task.status === "failed").length,
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
          id: input.id ?? `task:${input.kind}:${now.toISOString()}`,
          kind: input.kind,
          status: "queued",
          priority: input.priority ?? 50,
          payload: input.payload,
          ...(input.scheduledFor ? { scheduledFor: input.scheduledFor.toISOString() } : {}),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      );
    });
  },

  async claimNext(kind, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = nextReadyTask(await unitOfWork.tasks.findByStatus("queued"), kind, now.toISOString());
      if (!task) {
        return null;
      }

      const claimedTask = await unitOfWork.tasks.save(startTask(task, now.toISOString()));
      const attemptNumber = claimedTask.attempts.length;
      const taskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          id: `${claimedTask.id}:attempt:${attemptNumber}`,
          taskId: claimedTask.id,
          attemptNumber,
          status: "running",
          workerName: "queue-adapter",
          startedAt: now.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      );

      return { task: claimedTask, taskRun };
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
      const savedTask = await unitOfWork.tasks.save(finishTask(task, "failed", now.toISOString(), error));
      const savedTaskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          status: "failed",
          error,
          result: { status: "failed", error },
          finishedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      );

      return { task: savedTask, taskRun: savedTaskRun };
    });
  },

  async requeue(taskId, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      if (task.status !== "failed" && task.status !== "cancelled") {
        throw new Error(`Task ${taskId} cannot be requeued from status ${task.status}`);
      }

      return unitOfWork.tasks.save({
        ...task,
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
          id: input.id ?? `task:${input.kind}:${now.toISOString()}`,
          kind: input.kind,
          status: "queued",
          priority: input.priority ?? 50,
          payload: input.payload,
          ...(input.scheduledFor ? { scheduledFor: input.scheduledFor.toISOString() } : {}),
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
        const taskRunId = `${task.id}:attempt:${attemptNumber}`;
        await transactionalUnitOfWork.taskRuns.save(
          createTaskRun({
            id: taskRunId,
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
          taskRun: ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId),
        };
      }

      return null;
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
      const finishedTask = finishTask(task, "failed", nowIso, error);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: taskId, status: "running" },
        data: { status: "failed", updatedAt: new Date(nowIso) },
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
          result: { status: "failed", error },
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
      if (task.status !== "failed" && task.status !== "cancelled") {
        throw new Error(`Task ${taskId} cannot be requeued from status ${task.status}`);
      }

      const requeuedTask = {
        ...task,
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
