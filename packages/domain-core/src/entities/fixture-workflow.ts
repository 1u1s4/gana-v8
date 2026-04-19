import type { AuditableEntity, ISODateString } from "../common.js";
import { DomainError, nowIso } from "../common.js";

export type WorkflowStageStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "blocked";

export type FixtureWorkflowStage =
  | "ingestion"
  | "odds"
  | "enrichment"
  | "candidate"
  | "prediction"
  | "parlay"
  | "validation";

export type FixtureManualSelectionStatus = "none" | "selected" | "rejected";

export type FixtureSelectionOverride = "none" | "force-include" | "force-exclude";

export interface FixtureWorkflowEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly ingestionStatus: WorkflowStageStatus;
  readonly oddsStatus: WorkflowStageStatus;
  readonly enrichmentStatus: WorkflowStageStatus;
  readonly candidateStatus: WorkflowStageStatus;
  readonly predictionStatus: WorkflowStageStatus;
  readonly parlayStatus: WorkflowStageStatus;
  readonly validationStatus: WorkflowStageStatus;
  readonly isCandidate: boolean;
  readonly minDetectedOdd?: number;
  readonly qualityScore?: number;
  readonly selectionScore?: number;
  readonly lastIngestedAt?: ISODateString;
  readonly lastEnrichedAt?: ISODateString;
  readonly lastPredictedAt?: ISODateString;
  readonly lastParlayAt?: ISODateString;
  readonly lastValidatedAt?: ISODateString;
  readonly manualSelectionStatus: FixtureManualSelectionStatus;
  readonly manualSelectionBy?: string;
  readonly manualSelectionReason?: string;
  readonly manuallySelectedAt?: ISODateString;
  readonly selectionOverride: FixtureSelectionOverride;
  readonly overrideReason?: string;
  readonly overriddenAt?: ISODateString;
  readonly errorCount: number;
  readonly lastErrorMessage?: string;
  readonly diagnostics?: Record<string, unknown>;
}

export interface FixtureWorkflowManualSelectionInput {
  readonly status: Exclude<FixtureManualSelectionStatus, "none">;
  readonly selectedBy: string;
  readonly reason?: string;
  readonly occurredAt?: ISODateString;
}

export interface FixtureWorkflowSelectionOverrideInput {
  readonly mode: Exclude<FixtureSelectionOverride, "none">;
  readonly reason?: string;
  readonly occurredAt?: ISODateString;
}

export interface FixtureWorkflowStageTransitionInput {
  readonly status: WorkflowStageStatus;
  readonly occurredAt?: ISODateString;
  readonly errorMessage?: string;
  readonly isCandidate?: boolean;
  readonly minDetectedOdd?: number;
  readonly qualityScore?: number;
  readonly selectionScore?: number;
  readonly diagnostics?: Record<string, unknown>;
}

export const createFixtureWorkflow = (
  input: Omit<
    FixtureWorkflowEntity,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "errorCount"
    | "manualSelectionStatus"
    | "selectionOverride"
  > &
    Partial<
      Pick<
        FixtureWorkflowEntity,
        | "id"
        | "createdAt"
        | "updatedAt"
        | "errorCount"
        | "manualSelectionStatus"
        | "selectionOverride"
      >
    >,
): FixtureWorkflowEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    id: input.id ?? input.fixtureId,
    manualSelectionStatus: input.manualSelectionStatus ?? "none",
    selectionOverride: input.selectionOverride ?? "none",
    errorCount: input.errorCount ?? 0,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

const stageStatusKeyByStage: Record<FixtureWorkflowStage, keyof FixtureWorkflowEntity> = {
  ingestion: "ingestionStatus",
  odds: "oddsStatus",
  enrichment: "enrichmentStatus",
  candidate: "candidateStatus",
  prediction: "predictionStatus",
  parlay: "parlayStatus",
  validation: "validationStatus",
};

const stageTimestampKeyByStage: Record<FixtureWorkflowStage, keyof FixtureWorkflowEntity> = {
  ingestion: "lastIngestedAt",
  odds: "lastIngestedAt",
  enrichment: "lastEnrichedAt",
  candidate: "lastEnrichedAt",
  prediction: "lastPredictedAt",
  parlay: "lastParlayAt",
  validation: "lastValidatedAt",
};

export const transitionFixtureWorkflowStage = (
  workflow: FixtureWorkflowEntity,
  stage: FixtureWorkflowStage,
  input: FixtureWorkflowStageTransitionInput,
): FixtureWorkflowEntity => {
  if (input.minDetectedOdd !== undefined && input.minDetectedOdd <= 0) {
    throw new DomainError("minDetectedOdd must be greater than 0", "WORKFLOW_INVALID_MIN_ODD");
  }

  const occurredAt = input.occurredAt ?? nowIso();
  const stageStatusKey = stageStatusKeyByStage[stage];
  const stageTimestampKey = stageTimestampKeyByStage[stage];

  return {
    ...workflow,
    [stageStatusKey]: input.status,
    [stageTimestampKey]: occurredAt,
    ...(input.isCandidate !== undefined ? { isCandidate: input.isCandidate } : {}),
    ...(input.minDetectedOdd !== undefined ? { minDetectedOdd: input.minDetectedOdd } : {}),
    ...(input.qualityScore !== undefined ? { qualityScore: input.qualityScore } : {}),
    ...(input.selectionScore !== undefined ? { selectionScore: input.selectionScore } : {}),
    ...(input.diagnostics !== undefined ? { diagnostics: input.diagnostics } : {}),
    ...(input.errorMessage !== undefined
      ? {
          errorCount: workflow.errorCount + 1,
          lastErrorMessage: input.errorMessage,
        }
      : {}),
    updatedAt: occurredAt,
  } as FixtureWorkflowEntity;
};

export const applyFixtureWorkflowManualSelection = (
  workflow: FixtureWorkflowEntity,
  input: FixtureWorkflowManualSelectionInput,
): FixtureWorkflowEntity => {
  const occurredAt = input.occurredAt ?? nowIso();
  return {
    ...workflow,
    manualSelectionStatus: input.status,
    manualSelectionBy: input.selectedBy,
    ...(input.reason !== undefined ? { manualSelectionReason: input.reason } : {}),
    manuallySelectedAt: occurredAt,
    updatedAt: occurredAt,
  };
};

export const applyFixtureWorkflowSelectionOverride = (
  workflow: FixtureWorkflowEntity,
  input: FixtureWorkflowSelectionOverrideInput,
): FixtureWorkflowEntity => {
  const occurredAt = input.occurredAt ?? nowIso();
  return {
    ...workflow,
    selectionOverride: input.mode,
    ...(input.reason !== undefined ? { overrideReason: input.reason } : {}),
    overriddenAt: occurredAt,
    updatedAt: occurredAt,
  };
};
