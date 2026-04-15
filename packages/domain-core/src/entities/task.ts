import type { AuditableEntity, ISODateString } from "../common.js";
import { DomainError, nowIso } from "../common.js";

export type TaskKind =
  | "fixture-ingestion"
  | "odds-ingestion"
  | "research"
  | "prediction"
  | "validation"
  | "sandbox-replay";

export type TaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface TaskAttempt {
  readonly startedAt: ISODateString;
  readonly finishedAt?: ISODateString;
  readonly error?: string;
}

export interface TaskEntity extends AuditableEntity {
  readonly kind: TaskKind;
  readonly status: TaskStatus;
  readonly priority: number;
  readonly payload: Record<string, unknown>;
  readonly attempts: readonly TaskAttempt[];
  readonly scheduledFor?: ISODateString;
}

export const createTask = (
  input: Omit<TaskEntity, "createdAt" | "updatedAt" | "attempts"> &
    Partial<Pick<TaskEntity, "createdAt" | "updatedAt" | "attempts">>,
): TaskEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    attempts: input.attempts ?? [],
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const startTask = (
  task: TaskEntity,
  startedAt: ISODateString = nowIso(),
): TaskEntity => {
  if (task.status !== "queued") {
    throw new DomainError(`Task ${task.id} is not queued`, "TASK_NOT_QUEUED");
  }

  return {
    ...task,
    status: "running",
    attempts: [...task.attempts, { startedAt }],
    updatedAt: startedAt,
  };
};

export const finishTask = (
  task: TaskEntity,
  outcome: Extract<TaskStatus, "succeeded" | "failed" | "cancelled">,
  error?: string,
  finishedAt: ISODateString = nowIso(),
): TaskEntity => {
  if (task.status !== "running") {
    throw new DomainError(`Task ${task.id} is not running`, "TASK_NOT_RUNNING");
  }

  const lastAttempt = task.attempts.at(-1);
  if (!lastAttempt) {
    throw new DomainError(
      `Task ${task.id} has no attempt to finish`,
      "TASK_MISSING_ATTEMPT",
    );
  }

  const finishedAttempt: TaskAttempt = {
    ...lastAttempt,
    finishedAt,
    ...(error !== undefined ? { error } : {}),
  };

  return {
    ...task,
    status: outcome,
    attempts: [...task.attempts.slice(0, -1), finishedAttempt],
    updatedAt: finishedAt,
  };
};
