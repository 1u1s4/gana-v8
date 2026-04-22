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
  readonly manifestId?: string;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly payload: Record<string, unknown>;
  readonly attempts: readonly QueueTaskAttempt[];
  readonly scheduledFor?: string;
  readonly maxAttempts: number;
  readonly lastErrorMessage?: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly claimedAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly activeTaskRunId?: string;
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
  readonly manifestId?: string;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly source?: string;
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
    where: {
      id: string;
      status?: QueueTaskStatus;
      activeTaskRunId?: string | null;
      leaseExpiresAt?: {
        gt?: Date;
        lte?: Date;
      };
    };
    data: {
      status?: QueueTaskStatus;
      updatedAt: Date;
      triggerKind?: QueueTaskEntity["triggerKind"];
      scheduledFor?: Date | null;
      lastErrorMessage?: string | null;
      leaseOwner?: string | null;
      leaseExpiresAt?: Date | null;
      claimedAt?: Date | null;
      lastHeartbeatAt?: Date | null;
      activeTaskRunId?: string | null;
    };
  }): Promise<{ count: number }>;
  update(args: {
    where: { id: string };
    data: {
      status?: QueueTaskStatus;
      updatedAt: Date;
      triggerKind?: QueueTaskEntity["triggerKind"];
      scheduledFor?: Date | null;
      lastErrorMessage?: string | null;
      leaseOwner?: string | null;
      leaseExpiresAt?: Date | null;
      claimedAt?: Date | null;
      lastHeartbeatAt?: Date | null;
      activeTaskRunId?: string | null;
    };
  }): Promise<unknown>;
}

export interface PrismaQueueClientLike {
  readonly task: PrismaTaskClientLike;
  $transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T>;
}

export interface TaskQueueAdapter {
  enqueue(input: EnqueueQueueTaskInput): Promise<QueueTaskEntity>;
  claim(taskId: string, now?: Date): Promise<QueueTaskClaim | null>;
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
  nowIso: string,
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

  if (task.activeTaskRunId !== taskRun.id) {
    throw new Error(`Task run ${taskRun.id} is not the active task run for task ${expectedTaskId}`);
  }

  if (!task.leaseOwner) {
    throw new Error(`Task ${task.id} has no active lease owner`);
  }

  if (!task.leaseExpiresAt) {
    throw new Error(`Task ${task.id} has no active lease expiry`);
  }

  if (task.leaseExpiresAt <= nowIso) {
    throw new Error(`Task ${task.id} lease expired at ${task.leaseExpiresAt}`);
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

const isTaskReady = (task: QueueTaskEntity, nowIso: string): boolean =>
  !task.scheduledFor || task.scheduledFor <= nowIso;

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
  readonly manifestId?: string;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly payload: Record<string, unknown>;
  readonly attempts?: readonly QueueTaskAttempt[];
  readonly scheduledFor?: string;
  readonly maxAttempts?: number;
  readonly lastErrorMessage?: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly claimedAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly activeTaskRunId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}): QueueTaskEntity => ({
  id: input.id,
  kind: input.kind,
  status: input.status,
  triggerKind: input.triggerKind ?? "system",
  priority: input.priority,
  ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  ...(input.manifestId ? { manifestId: input.manifestId } : {}),
  ...(input.workflowId ? { workflowId: input.workflowId } : {}),
  ...(input.traceId ? { traceId: input.traceId } : {}),
  ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  ...(input.source ? { source: input.source } : {}),
  payload: { ...input.payload },
  attempts: input.attempts?.map((attempt) => ({ ...attempt })) ?? [],
  ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
  maxAttempts: input.maxAttempts ?? 3,
  ...(input.lastErrorMessage ? { lastErrorMessage: input.lastErrorMessage } : {}),
  ...(input.leaseOwner ? { leaseOwner: input.leaseOwner } : {}),
  ...(input.leaseExpiresAt ? { leaseExpiresAt: input.leaseExpiresAt } : {}),
  ...(input.claimedAt ? { claimedAt: input.claimedAt } : {}),
  ...(input.lastHeartbeatAt ? { lastHeartbeatAt: input.lastHeartbeatAt } : {}),
  ...(input.activeTaskRunId ? { activeTaskRunId: input.activeTaskRunId } : {}),
  createdAt: input.createdAt,
  updatedAt: input.updatedAt,
});

const createTaskRun = (input: QueueTaskRunEntity): QueueTaskRunEntity => input;

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_LEASE_OWNER = "in-memory-queue";
const DEFAULT_RETRY_BACKOFF_MS = 60 * 1000;
const DEFAULT_LEASE_EXPIRY_ERROR = "Task lease expired before completion.";

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const stripActiveTaskFields = (
  task: QueueTaskEntity,
): Omit<
  QueueTaskEntity,
  "leaseOwner" | "leaseExpiresAt" | "claimedAt" | "lastHeartbeatAt" | "activeTaskRunId"
> => {
  const {
    leaseOwner: _leaseOwner,
    leaseExpiresAt: _leaseExpiresAt,
    claimedAt: _claimedAt,
    lastHeartbeatAt: _lastHeartbeatAt,
    activeTaskRunId: _activeTaskRunId,
    ...rest
  } = task;

  return rest;
};

const startTask = (
  task: QueueTaskEntity,
  startedAt: string,
  leaseOwner: string = DEFAULT_LEASE_OWNER,
  leaseMs: number = DEFAULT_LEASE_MS,
  activeTaskRunId?: string,
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
    claimedAt: startedAt,
    lastHeartbeatAt: startedAt,
    ...(activeTaskRunId ? { activeTaskRunId } : {}),
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

  const {
    activeTaskRunId: _activeTaskRunId,
    leaseOwner: _leaseOwner,
    leaseExpiresAt: _leaseExpiresAt,
    lastErrorMessage: _lastErrorMessage,
    ...rest
  } = task;

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
    lastHeartbeatAt: finishedAt,
    ...(error ? { lastErrorMessage: error } : {}),
    updatedAt: finishedAt,
  };
};

const shouldRetryTask = (task: QueueTaskEntity): boolean => task.attempts.length < task.maxAttempts;

const hasExpiredLease = (task: QueueTaskEntity, nowIso: string): boolean => {
  if (task.status !== "running") {
    return false;
  }

  return !task.leaseExpiresAt || task.leaseExpiresAt <= nowIso;
};

const recycleExpiredLeaseTask = (task: QueueTaskEntity, nowIso: string): QueueTaskEntity => {
  const rest = stripActiveTaskFields(task);
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
    lastHeartbeatAt: renewedAt,
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

const createExpiredTaskRun = (
  taskRun: QueueTaskRunEntity,
  expiredAt: string,
  error: string = DEFAULT_LEASE_EXPIRY_ERROR,
): QueueTaskRunEntity => ({
  ...taskRun,
  status: "failed",
  error,
  result: { status: "lease-expired", error },
  finishedAt: expiredAt,
  updatedAt: expiredAt,
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

      return isTaskReady(candidate, nowIso);
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
      const payload = { ...input.payload };
      const manifestId = input.manifestId ?? asOptionalString(payload.manifestId);
      const workflowId = input.workflowId ?? asOptionalString(payload.workflowId);
      const traceId = input.traceId ?? asOptionalString(payload.traceId);
      const correlationId = input.correlationId ?? asOptionalString(payload.correlationId);
      const source = input.source ?? asOptionalString(payload.source);
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
          ...(manifestId ? { manifestId } : {}),
          ...(workflowId ? { workflowId } : {}),
          ...(traceId ? { traceId } : {}),
          ...(correlationId ? { correlationId } : {}),
          ...(source ? { source } : {}),
          payload,
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
          if (runningTask.activeTaskRunId) {
            const expiredTaskRun = await unitOfWork.taskRuns.getById(runningTask.activeTaskRunId);
            if (expiredTaskRun?.status === "running") {
              await unitOfWork.taskRuns.save(createExpiredTaskRun(expiredTaskRun, nowIso));
            }
          }
          await unitOfWork.tasks.save(recycleExpiredLeaseTask(runningTask, nowIso));
        }
      }

      const task = nextReadyTask(await unitOfWork.tasks.findByStatus("queued"), kind, nowIso);
      if (!task) {
        return null;
      }

      const attemptNumber = task.attempts.length + 1;
      const taskRunId = computeOpaqueId("trn", `${task.id}:${attemptNumber}:${nowIso}`);
      const claimedTask = await unitOfWork.tasks.save(
        startTask(task, nowIso, DEFAULT_LEASE_OWNER, inputLeaseMs(kind), taskRunId),
      );
      const taskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          id: taskRunId,
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

  async claim(taskId, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const nowIso = now.toISOString();
      const runningTasks = await unitOfWork.tasks.findByStatus("running");
      for (const runningTask of runningTasks) {
        if (hasExpiredLease(runningTask, nowIso)) {
          if (runningTask.activeTaskRunId) {
            const expiredTaskRun = await unitOfWork.taskRuns.getById(runningTask.activeTaskRunId);
            if (expiredTaskRun?.status === "running") {
              await unitOfWork.taskRuns.save(createExpiredTaskRun(expiredTaskRun, nowIso));
            }
          }
          await unitOfWork.tasks.save(recycleExpiredLeaseTask(runningTask, nowIso));
        }
      }

      const task = await unitOfWork.tasks.getById(taskId);
      if (!task || task.status !== "queued" || !isTaskReady(task, nowIso)) {
        return null;
      }

      const attemptNumber = task.attempts.length + 1;
      const taskRunId = computeOpaqueId("trn", `${task.id}:${attemptNumber}:${nowIso}`);
      const claimedTask = await unitOfWork.tasks.save(
        startTask(task, nowIso, DEFAULT_LEASE_OWNER, inputLeaseMs(task.kind), taskRunId),
      );
      const taskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          id: taskRunId,
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
      const nowIso = now.toISOString();
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId, nowIso);
      const renewedTask = await unitOfWork.tasks.save(renewTaskLease(task, nowIso, leaseMs));
      const renewedTaskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          updatedAt: nowIso,
        }),
      );

      return { task: renewedTask, taskRun: renewedTaskRun };
    });
  },

  async complete(taskId, taskRunId, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const nowIso = now.toISOString();
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId, nowIso);
      const savedTask = await unitOfWork.tasks.save(finishTask(task, "succeeded", nowIso));
      const savedTaskRun = await unitOfWork.taskRuns.save(
        createTaskRun({
          ...taskRun,
          status: "succeeded",
          result: { status: "succeeded" },
          finishedAt: nowIso,
          updatedAt: nowIso,
        }),
      );

      return { task: savedTask, taskRun: savedTaskRun };
    });
  },

  async fail(taskId, taskRunId, error, now = new Date()) {
    return runInMemoryQueueMutation(unitOfWork, async () => {
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      const failureTime = now.toISOString();
      ensureTaskLifecycleMatch(task, taskRun, taskId, failureTime);
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
      const quarantinedAt = now.toISOString();
      const task = ensureTask(await unitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await unitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId, quarantinedAt);
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

      const rest = stripActiveTaskFields(task);

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
      const payload = { ...input.payload };
      const manifestId = input.manifestId ?? asOptionalString(payload.manifestId);
      const workflowId = input.workflowId ?? asOptionalString(payload.workflowId);
      const traceId = input.traceId ?? asOptionalString(payload.traceId);
      const correlationId = input.correlationId ?? asOptionalString(payload.correlationId);
      const source = input.source ?? asOptionalString(payload.source);
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
          ...(manifestId ? { manifestId } : {}),
          ...(workflowId ? { workflowId } : {}),
          ...(traceId ? { traceId } : {}),
          ...(correlationId ? { correlationId } : {}),
          ...(source ? { source } : {}),
          payload,
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
          where: {
            id: runningTask.id,
            status: "running",
            activeTaskRunId: runningTask.activeTaskRunId ?? null,
            leaseExpiresAt: { lte: new Date(nowIso) },
          },
          data: {
            status: "queued",
            updatedAt: new Date(nowIso),
            triggerKind: recycledTask.triggerKind,
            scheduledFor: recycledTask.scheduledFor ? new Date(recycledTask.scheduledFor) : null,
            lastErrorMessage: recycledTask.lastErrorMessage ?? null,
            leaseOwner: null,
            leaseExpiresAt: null,
            claimedAt: null,
            lastHeartbeatAt: null,
            activeTaskRunId: null,
          },
        });
        if (recycleResult.count > 0) {
          if (runningTask.activeTaskRunId) {
            const expiredTaskRun = await transactionalUnitOfWork.taskRuns.getById(runningTask.activeTaskRunId);
            if (expiredTaskRun?.status === "running") {
              await transactionalUnitOfWork.taskRuns.save(createExpiredTaskRun(expiredTaskRun, nowIso));
            }
          }
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
        const existingTaskRuns = await transactionalUnitOfWork.taskRuns.findByTaskId(task.id);
        const attemptNumber =
          existingTaskRuns.reduce(
            (maxAttemptNumber, existingTaskRun) =>
              Math.max(maxAttemptNumber, existingTaskRun.attemptNumber),
            0,
          ) + 1;
        const taskRunId = computeOpaqueId("trn", `${task.id}:${attemptNumber}:${nowIso}`);
        const claimResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
          where: { id: task.id, status: "queued", activeTaskRunId: null },
          data: {
            status: "running",
            updatedAt: new Date(nowIso),
            leaseOwner: DEFAULT_LEASE_OWNER,
            leaseExpiresAt: new Date(Date.parse(nowIso) + inputLeaseMs(kind)),
            claimedAt: new Date(nowIso),
            lastHeartbeatAt: new Date(nowIso),
            activeTaskRunId: taskRunId,
          },
        });
        if (claimResult.count === 0) {
          continue;
        }

        await transactionalUnitOfWork.tasks.save(
          startTask(task, nowIso, DEFAULT_LEASE_OWNER, inputLeaseMs(kind), taskRunId),
        );
        const taskRun = await transactionalUnitOfWork.taskRuns.save(
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
          taskRun: ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRun.id), taskRun.id),
        };
      }

      return null;
    });
  },

  async claim(taskId, now = new Date()) {
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
          where: {
            id: runningTask.id,
            status: "running",
            activeTaskRunId: runningTask.activeTaskRunId ?? null,
            leaseExpiresAt: { lte: new Date(nowIso) },
          },
          data: {
            status: "queued",
            updatedAt: new Date(nowIso),
            triggerKind: recycledTask.triggerKind,
            scheduledFor: recycledTask.scheduledFor ? new Date(recycledTask.scheduledFor) : null,
            lastErrorMessage: recycledTask.lastErrorMessage ?? null,
            leaseOwner: null,
            leaseExpiresAt: null,
            claimedAt: null,
            lastHeartbeatAt: null,
            activeTaskRunId: null,
          },
        });
        if (recycleResult.count > 0) {
          if (runningTask.activeTaskRunId) {
            const expiredTaskRun = await transactionalUnitOfWork.taskRuns.getById(runningTask.activeTaskRunId);
            if (expiredTaskRun?.status === "running") {
              await transactionalUnitOfWork.taskRuns.save(createExpiredTaskRun(expiredTaskRun, nowIso));
            }
          }
          await transactionalUnitOfWork.tasks.save(recycledTask);
        }
      }

      const task = await transactionalUnitOfWork.tasks.getById(taskId);
      if (!task || task.status !== "queued" || !isTaskReady(task, nowIso)) {
        return null;
      }

      const existingTaskRuns = await transactionalUnitOfWork.taskRuns.findByTaskId(task.id);
      const attemptNumber =
        existingTaskRuns.reduce(
          (maxAttemptNumber, existingTaskRun) =>
            Math.max(maxAttemptNumber, existingTaskRun.attemptNumber),
          0,
        ) + 1;
      const taskRunId = computeOpaqueId("trn", `${task.id}:${attemptNumber}:${nowIso}`);
      const claimResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: task.id, status: "queued", activeTaskRunId: null },
        data: {
          status: "running",
          updatedAt: new Date(nowIso),
          leaseOwner: DEFAULT_LEASE_OWNER,
          leaseExpiresAt: new Date(Date.parse(nowIso) + inputLeaseMs(task.kind)),
          claimedAt: new Date(nowIso),
          lastHeartbeatAt: new Date(nowIso),
          activeTaskRunId: taskRunId,
        },
      });
      if (claimResult.count === 0) {
        return null;
      }

      await transactionalUnitOfWork.tasks.save(
        startTask(task, nowIso, DEFAULT_LEASE_OWNER, inputLeaseMs(task.kind), taskRunId),
      );
      const taskRun = await transactionalUnitOfWork.taskRuns.save(
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
        taskRun: ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRun.id), taskRun.id),
      };
    });
  },

  async renewLease(taskId, taskRunId, now = new Date(), leaseMs = DEFAULT_LEASE_MS) {
    return client.$transaction(async (transactionClient) => {
      const transactionalUnitOfWork = options.createTransactionalUnitOfWork(transactionClient);
      const nowIso = now.toISOString();
      const task = ensureTask(await transactionalUnitOfWork.tasks.getById(taskId), taskId);
      const taskRun = ensureTaskRun(await transactionalUnitOfWork.taskRuns.getById(taskRunId), taskRunId);
      ensureTaskLifecycleMatch(task, taskRun, taskId, nowIso);
      const renewedTask = renewTaskLease(task, nowIso, leaseMs);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: {
          id: taskId,
          status: "running",
          activeTaskRunId: taskRunId,
          leaseExpiresAt: { gt: new Date(nowIso) },
        },
        data: {
          status: "running",
          updatedAt: new Date(nowIso),
          leaseOwner: renewedTask.leaseOwner ?? null,
          leaseExpiresAt: renewedTask.leaseExpiresAt ? new Date(renewedTask.leaseExpiresAt) : null,
          claimedAt: renewedTask.claimedAt ? new Date(renewedTask.claimedAt) : null,
          lastHeartbeatAt: renewedTask.lastHeartbeatAt ? new Date(renewedTask.lastHeartbeatAt) : null,
          activeTaskRunId: renewedTask.activeTaskRunId ?? null,
        },
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
      ensureTaskLifecycleMatch(task, taskRun, taskId, nowIso);
      const finishedTask = finishTask(task, "succeeded", nowIso);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: {
          id: taskId,
          status: "running",
          activeTaskRunId: taskRunId,
          leaseExpiresAt: { gt: new Date(nowIso) },
        },
        data: {
          status: "succeeded",
          updatedAt: new Date(nowIso),
          lastErrorMessage: finishedTask.lastErrorMessage ?? null,
          leaseOwner: null,
          leaseExpiresAt: null,
          claimedAt: null,
          lastHeartbeatAt: null,
          activeTaskRunId: null,
        },
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
      ensureTaskLifecycleMatch(task, taskRun, taskId, nowIso);
      const retryPlan = shouldRetryTask(task) ? scheduleTaskRetry(task, nowIso, error) : null;
      const finishedTask = retryPlan ? retryPlan.task : quarantineTask(task, error, nowIso);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: {
          id: taskId,
          status: "running",
          activeTaskRunId: taskRunId,
          leaseExpiresAt: { gt: new Date(nowIso) },
        },
        data: {
          status: finishedTask.status,
          updatedAt: new Date(nowIso),
          triggerKind: finishedTask.triggerKind,
          scheduledFor: finishedTask.scheduledFor ? new Date(finishedTask.scheduledFor) : null,
          lastErrorMessage: finishedTask.lastErrorMessage ?? null,
          leaseOwner: finishedTask.leaseOwner ?? null,
          leaseExpiresAt: finishedTask.leaseExpiresAt ? new Date(finishedTask.leaseExpiresAt) : null,
          claimedAt: finishedTask.claimedAt ? new Date(finishedTask.claimedAt) : null,
          lastHeartbeatAt: finishedTask.lastHeartbeatAt ? new Date(finishedTask.lastHeartbeatAt) : null,
          activeTaskRunId: finishedTask.activeTaskRunId ?? null,
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
      ensureTaskLifecycleMatch(task, taskRun, taskId, nowIso);
      const quarantinedTask = quarantineTask(task, reason, nowIso);
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: {
          id: taskId,
          status: "running",
          activeTaskRunId: taskRunId,
          leaseExpiresAt: { gt: new Date(nowIso) },
        },
        data: {
          status: quarantinedTask.status,
          updatedAt: new Date(nowIso),
          triggerKind: quarantinedTask.triggerKind,
          scheduledFor: quarantinedTask.scheduledFor ? new Date(quarantinedTask.scheduledFor) : null,
          lastErrorMessage: quarantinedTask.lastErrorMessage ?? null,
          leaseOwner: quarantinedTask.leaseOwner ?? null,
          leaseExpiresAt: quarantinedTask.leaseExpiresAt ? new Date(quarantinedTask.leaseExpiresAt) : null,
          claimedAt: quarantinedTask.claimedAt ? new Date(quarantinedTask.claimedAt) : null,
          lastHeartbeatAt: quarantinedTask.lastHeartbeatAt ? new Date(quarantinedTask.lastHeartbeatAt) : null,
          activeTaskRunId: quarantinedTask.activeTaskRunId ?? null,
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

      const rest = stripActiveTaskFields(task);
      const requeuedTask = {
        ...rest,
        status: "queued" as const,
        updatedAt: now.toISOString(),
      };
      const updateTaskResult = await (transactionClient as { task: PrismaTaskClientLike }).task.updateMany({
        where: { id: taskId, status: task.status, activeTaskRunId: null },
        data: {
          status: "queued",
          updatedAt: new Date(now.toISOString()),
          leaseOwner: null,
          leaseExpiresAt: null,
          claimedAt: null,
          lastHeartbeatAt: null,
          activeTaskRunId: null,
        },
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
