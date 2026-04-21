export const workspaceInfo = {
  packageName: "@gana-v8/research-contracts",
  workspaceName: "research-contracts",
  category: "package",
  description: "Explicit types for research prompts, evidence bundles, and synthesis outputs.",
  dependencies: [{ name: "@gana-v8/domain-core", category: "workspace" }],
} as const;

export type ResearchQuestion = string;
export type EvidenceDirection = "home" | "away" | "draw" | "neutral";
export type EvidenceKind =
  | "form"
  | "schedule"
  | "availability"
  | "lineups"
  | "motivation"
  | "market"
  | "tactical"
  | "model-hook";

export type ResearchBundleStatus = "publishable" | "degraded" | "hold";
export type ResearchSourceAdmissibility = "official" | "trusted" | "unverified" | "blocked";
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

export interface ResearchBrief {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly headline: string;
  readonly context: string;
  readonly questions: readonly ResearchQuestion[];
  readonly assumptions: readonly string[];
}

export interface EvidenceSourceRef {
  readonly provider: string;
  readonly reference: string;
}

export interface EvidenceItem {
  readonly id: string;
  readonly fixtureId: string;
  readonly kind: EvidenceKind;
  readonly title: string;
  readonly summary: string;
  readonly direction: EvidenceDirection;
  readonly confidence: number;
  readonly impact: number;
  readonly source: EvidenceSourceRef;
  readonly tags: readonly string[];
  readonly extractedAt: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface DirectionalResearchScore {
  readonly home: number;
  readonly away: number;
  readonly draw: number;
}

export interface SourceRecord {
  readonly id: string;
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly provider: string;
  readonly reference: string;
  readonly sourceType: string;
  readonly title?: string;
  readonly url?: string;
  readonly admissibility: ResearchSourceAdmissibility;
  readonly independenceKey: string;
  readonly capturedAt: string;
  readonly publishedAt?: string;
  readonly freshnessExpiresAt?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ClaimCorroboration {
  readonly status: ResearchCorroborationStatus;
  readonly requiredSourceCount: number;
  readonly matchedSourceIds: readonly string[];
}

export interface Claim {
  readonly id: string;
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly assignmentId?: string;
  readonly kind: EvidenceKind;
  readonly title: string;
  readonly summary: string;
  readonly direction: EvidenceDirection;
  readonly confidence: number;
  readonly impact: number;
  readonly significance: ResearchClaimSignificance;
  readonly status: ResearchClaimStatus;
  readonly corroboration: ClaimCorroboration;
  readonly freshnessWindowHours: number;
  readonly extractedAt: string;
  readonly freshnessExpiresAt?: string;
  readonly sourceIds: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface ClaimConflict {
  readonly id: string;
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly claimIds: readonly string[];
  readonly summary: string;
  readonly severity: ResearchConflictSeverity;
  readonly status: ResearchConflictStatus;
  readonly resolutionNote?: string;
}

export interface ResearchGateReason {
  readonly code:
    | "fixture-resolution"
    | "source-admissibility"
    | "freshness"
    | "corroboration"
    | "contradiction"
    | "coverage";
  readonly severity: ResearchGateSeverity;
  readonly message: string;
}

export interface ResearchGateResult {
  readonly status: ResearchBundleStatus;
  readonly reasons: readonly ResearchGateReason[];
  readonly gatedAt: string;
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

export interface FeatureReadiness {
  readonly status: "ready" | "needs-review";
  readonly reasons: readonly string[];
}

export interface TopEvidenceFeature {
  readonly id: string;
  readonly title: string;
  readonly direction: EvidenceDirection;
  readonly weightedScore: number;
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

export interface FeatureSnapshot {
  readonly id: string;
  readonly fixtureId: string;
  readonly bundleId: string;
  readonly generatedAt: string;
  readonly bundleStatus: ResearchBundleStatus;
  readonly gateReasons: readonly ResearchGateReason[];
  readonly recommendedLean: Exclude<EvidenceDirection, "neutral">;
  readonly evidenceCount: number;
  readonly topEvidence: readonly TopEvidenceFeature[];
  readonly risks: readonly string[];
  readonly features: FeatureVectorValues;
  readonly readiness: FeatureReadiness;
  readonly researchTrace?: ResearchTraceMetadata;
}

export interface ResearchAssignment {
  readonly id: string;
  readonly fixtureId: string;
  readonly bundleId?: string;
  readonly dimension: ResearchAssignmentDimension;
  readonly status: ResearchAssignmentStatus;
  readonly attemptNumber: number;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly error?: string;
  readonly summary?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ResearchBundle {
  readonly id: string;
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly brief: ResearchBrief;
  readonly claims: readonly Claim[];
  readonly sources: readonly SourceRecord[];
  readonly conflicts: readonly ClaimConflict[];
  readonly directionalScore: DirectionalResearchScore;
  readonly gateResult: ResearchGateResult;
  readonly summary: string;
  readonly recommendedLean: Exclude<EvidenceDirection, "neutral">;
  readonly risks: readonly string[];
  readonly assignments: readonly ResearchAssignment[];
  readonly trace?: ResearchTraceMetadata;
}

export interface ResearchDossier {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly brief: ResearchBrief;
  readonly evidence: readonly EvidenceItem[];
  readonly directionalScore: DirectionalResearchScore;
  readonly summary: string;
  readonly recommendedLean: Exclude<EvidenceDirection, "neutral">;
  readonly risks: readonly string[];
}

export interface ResearchSynthesisHookInput {
  readonly brief: ResearchBrief;
  readonly evidence: readonly EvidenceItem[];
  readonly directionalScore: DirectionalResearchScore;
}

export interface ResearchSynthesisHookOutput {
  readonly summary: string;
  readonly risks?: readonly string[];
}

export interface ResearchSynthesisHook {
  synthesize(input: ResearchSynthesisHookInput): ResearchSynthesisHookOutput;
}

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
