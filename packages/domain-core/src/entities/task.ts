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
  | "quarantined"
  | "cancelled";

export type TaskTriggerKind = "cron" | "manual" | "retry" | "system";

export interface TaskAttempt {
  readonly startedAt: ISODateString;
  readonly finishedAt?: ISODateString;
  readonly error?: string;
}

export interface TaskEntity extends AuditableEntity {
  readonly kind: TaskKind;
  readonly status: TaskStatus;
  readonly triggerKind: TaskTriggerKind;
  readonly priority: number;
  readonly dedupeKey?: string;
  readonly manifestId?: string;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly payload: Record<string, unknown>;
  readonly attempts: readonly TaskAttempt[];
  readonly scheduledFor?: ISODateString;
  readonly maxAttempts: number;
  readonly lastErrorMessage?: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: ISODateString;
  readonly claimedAt?: ISODateString;
  readonly lastHeartbeatAt?: ISODateString;
  readonly activeTaskRunId?: string;
}

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export const createTask = (
  input: Omit<TaskEntity, "createdAt" | "updatedAt" | "attempts" | "triggerKind" | "maxAttempts"> &
    Partial<Pick<TaskEntity, "createdAt" | "updatedAt" | "attempts" | "triggerKind" | "maxAttempts" | "dedupeKey" | "lastErrorMessage">>,
): TaskEntity => {
  const timestamp = input.createdAt ?? nowIso();
  const payload = { ...input.payload };
  const manifestId = input.manifestId ?? asOptionalString(payload.manifestId);
  const workflowId = input.workflowId ?? asOptionalString(payload.workflowId);
  const traceId = input.traceId ?? asOptionalString(payload.traceId);
  const correlationId = input.correlationId ?? asOptionalString(payload.correlationId);
  const source = input.source ?? asOptionalString(payload.source);
  return {
    id: input.id,
    kind: input.kind,
    status: input.status,
    priority: input.priority,
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(manifestId ? { manifestId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(source ? { source } : {}),
    payload,
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
    triggerKind: input.triggerKind ?? "system",
    attempts: input.attempts?.map((attempt) => ({ ...attempt })) ?? [],
    maxAttempts: input.maxAttempts ?? 3,
    ...(input.lastErrorMessage ? { lastErrorMessage: input.lastErrorMessage } : {}),
    ...(input.leaseOwner ? { leaseOwner: input.leaseOwner } : {}),
    ...(input.leaseExpiresAt ? { leaseExpiresAt: input.leaseExpiresAt } : {}),
    ...(input.claimedAt ? { claimedAt: input.claimedAt } : {}),
    ...(input.lastHeartbeatAt ? { lastHeartbeatAt: input.lastHeartbeatAt } : {}),
    ...(input.activeTaskRunId ? { activeTaskRunId: input.activeTaskRunId } : {}),
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
    ...(error !== undefined ? { lastErrorMessage: error } : {}),
    updatedAt: finishedAt,
  };
};
