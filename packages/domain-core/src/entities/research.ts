import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type ResearchBundleStatus = "publishable" | "degraded" | "hold";
export type ResearchSourceAdmissibility = "official" | "trusted" | "unverified" | "blocked";
export type ResearchClaimKind =
  | "form"
  | "schedule"
  | "availability"
  | "lineups"
  | "motivation"
  | "market"
  | "tactical"
  | "model-hook";
export type ResearchClaimDirection = "home" | "away" | "draw" | "neutral";
export type ResearchClaimSignificance = "critical" | "supporting";
export type ResearchCorroborationStatus = "none" | "single-source" | "corroborated" | "official";
export type ResearchClaimStatus = "draft" | "corroborated" | "conflicted" | "stale";
export type ResearchConflictSeverity = "low" | "medium" | "high";
export type ResearchConflictStatus = "open" | "resolved";
export type ResearchGateSeverity = "info" | "warn" | "block";
export type ResearchAssignmentDimension =
  | "availability"
  | "lineups"
  | "form"
  | "schedule"
  | "market"
  | "tactical";
export type ResearchAssignmentStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export interface ResearchBriefSnapshot {
  readonly headline: string;
  readonly context: string;
  readonly questions: readonly string[];
  readonly assumptions: readonly string[];
}

export interface DirectionalResearchScore {
  readonly home: number;
  readonly away: number;
  readonly draw: number;
}

export interface ResearchGateReason {
  readonly code:
    | "fixture-resolution"
    | "source-admissibility"
    | "freshness"
    | "corroboration"
    | "contradiction"
    | "coverage"
    | "web-research";
  readonly severity: ResearchGateSeverity;
  readonly message: string;
}

export interface ResearchGateResult {
  readonly status: ResearchBundleStatus;
  readonly reasons: readonly ResearchGateReason[];
  readonly gatedAt: ISODateString;
}

export interface ResearchSourceEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly provider: string;
  readonly reference: string;
  readonly sourceType: string;
  readonly title?: string;
  readonly url?: string;
  readonly admissibility: ResearchSourceAdmissibility;
  readonly independenceKey: string;
  readonly capturedAt: ISODateString;
  readonly publishedAt?: ISODateString;
  readonly freshnessExpiresAt?: ISODateString;
  readonly metadata: Record<string, unknown>;
}

export interface ResearchClaimEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly assignmentId?: string;
  readonly kind: ResearchClaimKind;
  readonly title: string;
  readonly summary: string;
  readonly direction: ResearchClaimDirection;
  readonly confidence: number;
  readonly impact: number;
  readonly significance: ResearchClaimSignificance;
  readonly status: ResearchClaimStatus;
  readonly corroborationStatus: ResearchCorroborationStatus;
  readonly requiredSourceCount: number;
  readonly matchedSourceIds: readonly string[];
  readonly freshnessWindowHours: number;
  readonly extractedAt: ISODateString;
  readonly freshnessExpiresAt?: ISODateString;
  readonly metadata: Record<string, string>;
}

export interface ResearchClaimSourceEntity extends AuditableEntity {
  readonly claimId: string;
  readonly sourceId: string;
  readonly orderIndex: number;
}

export interface ResearchConflictEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly claimIds: readonly string[];
  readonly summary: string;
  readonly severity: ResearchConflictSeverity;
  readonly status: ResearchConflictStatus;
  readonly resolutionNote?: string;
}

export interface ResearchBundleEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly generatedAt: ISODateString;
  readonly brief: ResearchBriefSnapshot;
  readonly summary: string;
  readonly recommendedLean: Exclude<ResearchClaimDirection, "neutral">;
  readonly directionalScore: DirectionalResearchScore;
  readonly risks: readonly string[];
  readonly gateResult: ResearchGateResult;
  readonly trace?: Record<string, unknown>;
  readonly aiRunId?: string;
}

export interface ResearchAssignmentEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly bundleId?: string;
  readonly dimension: ResearchAssignmentDimension;
  readonly status: ResearchAssignmentStatus;
  readonly attemptNumber: number;
  readonly startedAt?: ISODateString;
  readonly finishedAt?: ISODateString;
  readonly error?: string;
  readonly summary?: string;
  readonly metadata: Record<string, unknown>;
}

const withAudit = <T extends object>(
  input: T & Partial<Pick<AuditableEntity, "createdAt" | "updatedAt">>,
): T & AuditableEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  } as T & AuditableEntity;
};

export const createResearchSource = (
  input: Omit<ResearchSourceEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ResearchSourceEntity, "createdAt" | "updatedAt">>,
): ResearchSourceEntity => withAudit(input);

export const createResearchClaim = (
  input: Omit<ResearchClaimEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ResearchClaimEntity, "createdAt" | "updatedAt">>,
): ResearchClaimEntity => withAudit(input);

export const createResearchClaimSource = (
  input: Omit<ResearchClaimSourceEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ResearchClaimSourceEntity, "createdAt" | "updatedAt">>,
): ResearchClaimSourceEntity => withAudit(input);

export const createResearchConflict = (
  input: Omit<ResearchConflictEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ResearchConflictEntity, "createdAt" | "updatedAt">>,
): ResearchConflictEntity => withAudit(input);

export const createResearchBundle = (
  input: Omit<ResearchBundleEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ResearchBundleEntity, "createdAt" | "updatedAt">>,
): ResearchBundleEntity => withAudit(input);

export const createResearchAssignment = (
  input: Omit<ResearchAssignmentEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ResearchAssignmentEntity, "createdAt" | "updatedAt">>,
): ResearchAssignmentEntity => withAudit(input);
