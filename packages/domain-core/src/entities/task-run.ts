import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type TaskRunStatus = "running" | "succeeded" | "failed" | "cancelled";

export interface TaskRunEntity extends AuditableEntity {
  readonly taskId: string;
  readonly attemptNumber: number;
  readonly status: TaskRunStatus;
  readonly workerName?: string;
  readonly startedAt: ISODateString;
  readonly finishedAt?: ISODateString;
  readonly error?: string;
  readonly result?: Record<string, unknown>;
  readonly retryScheduledFor?: ISODateString;
}

export const createTaskRun = (
  input: Omit<TaskRunEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<TaskRunEntity, "createdAt" | "updatedAt">>,
): TaskRunEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
