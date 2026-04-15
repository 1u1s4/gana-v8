import type { AuditableEntity, ISODateString } from "../common.js";
import { DomainError, nowIso } from "../common.js";

export type AiRunStatus = "pending" | "running" | "completed" | "failed";

export interface AiRunUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface AiRunEntity extends AuditableEntity {
  readonly taskId: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly status: AiRunStatus;
  readonly usage?: AiRunUsage;
  readonly outputRef?: string;
  readonly error?: string;
}

export const createAiRun = (
  input: Omit<AiRunEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<AiRunEntity, "createdAt" | "updatedAt">>,
): AiRunEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const settleAiRun = (
  run: AiRunEntity,
  status: Extract<AiRunStatus, "completed" | "failed">,
  details: Pick<AiRunEntity, "usage" | "outputRef" | "error">,
  updatedAt: ISODateString = nowIso(),
): AiRunEntity => {
  if (run.status !== "pending" && run.status !== "running") {
    throw new DomainError(
      `AI run ${run.id} already settled`,
      "AI_RUN_ALREADY_SETTLED",
    );
  }

  return {
    ...run,
    ...details,
    status,
    updatedAt,
  };
};
