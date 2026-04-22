import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type AutomationCycleKind = "scheduler" | "dispatcher" | "recovery";

export type AutomationCycleStatus = "running" | "succeeded" | "failed";

export type AutomationCycleStage = "research" | "prediction" | "parlay" | "validation";

export type AutomationCycleStageStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "degraded";

export interface AutomationCycleStageEntity {
  readonly stage: AutomationCycleStage;
  readonly status: AutomationCycleStageStatus;
  readonly taskIds: readonly string[];
  readonly taskRunIds: readonly string[];
  readonly retryCount: number;
  readonly startedAt?: ISODateString;
  readonly completedAt?: ISODateString;
  readonly error?: string;
}

export interface AutomationCycleSummary {
  readonly source?: string;
  readonly fixtureIds?: readonly string[];
  readonly taskIds?: readonly string[];
  readonly validationTaskId?: string;
  readonly stages?: readonly AutomationCycleStageEntity[];
  readonly counts?: Readonly<Record<string, number>>;
}

export interface AutomationCycleEntity extends AuditableEntity {
  readonly kind: AutomationCycleKind;
  readonly status: AutomationCycleStatus;
  readonly leaseOwner: string;
  readonly startedAt: ISODateString;
  readonly finishedAt?: ISODateString;
  readonly summary?: AutomationCycleSummary;
  readonly metadata?: Record<string, unknown>;
  readonly error?: string;
}

const cloneStage = (stage: AutomationCycleStageEntity): AutomationCycleStageEntity => ({
  ...stage,
  taskIds: [...stage.taskIds],
  taskRunIds: [...stage.taskRunIds],
});

const cloneSummary = (
  summary: AutomationCycleSummary,
): AutomationCycleSummary => ({
  ...(summary.source ? { source: summary.source } : {}),
  ...(summary.fixtureIds ? { fixtureIds: [...summary.fixtureIds] } : {}),
  ...(summary.taskIds ? { taskIds: [...summary.taskIds] } : {}),
  ...(summary.validationTaskId ? { validationTaskId: summary.validationTaskId } : {}),
  ...(summary.stages ? { stages: summary.stages.map(cloneStage) } : {}),
  ...(summary.counts ? { counts: { ...summary.counts } } : {}),
});

export const createAutomationCycle = (
  input: Omit<AutomationCycleEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<AutomationCycleEntity, "createdAt" | "updatedAt">>,
): AutomationCycleEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    id: input.id,
    kind: input.kind,
    status: input.status,
    leaseOwner: input.leaseOwner,
    startedAt: input.startedAt,
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    ...(input.summary ? { summary: cloneSummary(input.summary) } : {}),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    ...(input.error ? { error: input.error } : {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
