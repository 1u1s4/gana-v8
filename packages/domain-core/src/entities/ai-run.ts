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
  readonly providerRequestId?: string;
  readonly usage?: AiRunUsage;
  readonly outputRef?: string;
  readonly error?: string;
  readonly fallbackReason?: string;
  readonly degraded?: boolean;
}

export const createAiRun = (
  input: Omit<AiRunEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<AiRunEntity, "createdAt" | "updatedAt">>,
): AiRunEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    ...(input.degraded !== undefined ? { degraded: input.degraded } : {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const settleAiRun = (
  run: AiRunEntity,
  status: Extract<AiRunStatus, "completed" | "failed">,
  details: Pick<AiRunEntity, "providerRequestId" | "usage" | "outputRef" | "error" | "fallbackReason" | "degraded">,
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
