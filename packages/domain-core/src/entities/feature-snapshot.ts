import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";
import type {
  ResearchBundleStatus,
  ResearchClaimDirection,
  ResearchGateReason,
} from "./research.js";

export interface FeatureReadiness {
  readonly status: "ready" | "needs-review";
  readonly reasons: readonly string[];
}

export interface TopEvidenceFeature {
  readonly id: string;
  readonly title: string;
  readonly direction: ResearchClaimDirection;
  readonly weightedScore: number;
}

export interface ResearchTraceMetadata {
  readonly synthesisMode: "deterministic" | "ai-assisted" | "ai-fallback";
  readonly aiRunId?: string;
  readonly aiProvider?: string;
  readonly aiModel?: string;
  readonly aiPromptVersion?: string;
  readonly providerRequestId?: string;
  readonly fallbackSummary?: string;
  readonly plannerVersion?: string;
  readonly assignmentIds?: readonly string[];
}

export interface FeatureVectorValues {
  readonly researchScoreHome: number;
  readonly researchScoreDraw: number;
  readonly researchScoreAway: number;
  readonly formHome: number;
  readonly formAway: number;
  readonly restHomeDays: number;
  readonly restAwayDays: number;
  readonly injuriesHome: number;
  readonly injuriesAway: number;
  readonly derby: number;
  readonly hoursUntilKickoff: number;
}

export interface FeatureSnapshotEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly generatedAt: ISODateString;
  readonly bundleStatus: ResearchBundleStatus;
  readonly gateReasons: readonly ResearchGateReason[];
  readonly recommendedLean: Exclude<ResearchClaimDirection, "neutral">;
  readonly evidenceCount: number;
  readonly topEvidence: readonly TopEvidenceFeature[];
  readonly risks: readonly string[];
  readonly features: FeatureVectorValues;
  readonly readiness: FeatureReadiness;
  readonly researchTrace?: ResearchTraceMetadata;
}

export const createFeatureSnapshot = (
  input: Omit<FeatureSnapshotEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<FeatureSnapshotEntity, "createdAt" | "updatedAt">>,
): FeatureSnapshotEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
