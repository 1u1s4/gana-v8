import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { join, resolve } from "node:path";

import {
  createOperationalObservabilitySummary,
  type BackfillNeedReadModel,
  type OperationalObservabilitySummary,
  type ProviderMetricReadModel,
  type RetryPressureSummary,
  type TraceabilityCoverageSummary,
  type WorkerMetricReadModel,
} from "@gana-v8/observability";
import {
  evaluateFixtureCoverageScope,
  evaluateOperationalPolicy,
  type FixtureCoverageScopeDecision,
  type OperationalPolicyReport,
} from "@gana-v8/policy-engine";
import {
  type AutomationCycleEntity,
  applyFixtureWorkflowManualSelection as applyFixtureWorkflowManualSelectionTransition,
  applyFixtureWorkflowSelectionOverride as applyFixtureWorkflowSelectionOverrideTransition,
  createAiRun,
  createAuditEvent,
  createFixture,
  createFixtureWorkflow,
  createOperationalMetricSample,
  createOperationalTelemetryEvent,
  createParlay,
  createPrediction,
  createTask,
  createTaskRun,
  createValidation,
  type AiRunEntity,
  type AuditEventEntity,
  type DailyAutomationPolicyEntity,
  type FeatureSnapshotEntity,
  type FixtureEntity,
  type FixtureSelectionOverride,
  type FixtureWorkflowManualSelectionInput,
  type FixtureWorkflowSelectionOverrideInput,
  type FixtureWorkflowEntity,
  type LeagueCoveragePolicyEntity,
  type OperationalMetricType,
  type OperationalMetricSampleQuery,
  type OperationalTelemetrySeverity,
  type OperationalTelemetryEventQuery,
  type ParlayEntity,
  type PredictionEntity,
  type ResearchBundleEntity,
  type SandboxCertificationRunQuery,
  type TaskEntity,
  type TaskRunEntity,
  type TaskStatus,
  type TeamCoveragePolicyEntity,
  type ValidationEntity,
  type WorkflowStageStatus,
} from "@gana-v8/domain-core";
import {
  createAuthorizationActor,
  hasCapability,
  type AuthorizationCapability,
  type AuthorizationActor,
} from "@gana-v8/authz";
import {
  createInMemoryTaskQueueAdapter,
  createPrismaTaskQueueAdapter,
  type PrismaQueueClientLike,
  type TaskQueueAdapter,
} from "@gana-v8/queue-adapters";
import {
  createPrismaClient,
  createPrismaUnitOfWork,
  createConnectedVerifiedPrismaClient,
  createVerifiedPrismaClient,
  retryPrismaReadOperation,
  type PrismaClientLike,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";

export interface ValidationSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly partial: number;
  readonly pending: number;
  readonly completionRate: number;
}

export type PublicApiHealthStatus = "ok" | "degraded";

export interface PublicApiHealth {
  readonly status: PublicApiHealthStatus;
  readonly generatedAt: string;
  readonly checks: readonly {
    readonly name: string;
    readonly status: "pass" | "warn";
    readonly detail: string;
  }[];
}

export interface RawIngestionBatchReadModel {
  readonly id: string;
  readonly endpointFamily: string;
  readonly providerCode: string;
  readonly extractionStatus: string;
  readonly extractionTime: string;
  readonly recordCount: number;
}

export interface OddsSnapshotReadModel {
  readonly id: string;
  readonly fixtureId?: string;
  readonly providerFixtureId: string;
  readonly bookmakerKey: string;
  readonly marketKey: string;
  readonly capturedAt: string;
  readonly selectionCount: number;
}

export interface FixtureStatisticSnapshotReadModel {
  readonly id?: string;
  readonly fixtureId: string;
  readonly statKey: string;
  readonly scope: "home" | "away";
  readonly valueNumeric: number | null;
  readonly capturedAt: string;
}

export interface FixtureCornersStatisticsReadModel {
  readonly status: "available" | "missing" | "pending";
  readonly homeCorners: number | null;
  readonly awayCorners: number | null;
  readonly totalCorners: number | null;
  readonly capturedAt: string | null;
}

export interface FixtureOpsStatisticsReadModel {
  readonly corners: FixtureCornersStatisticsReadModel;
}

export type FixtureResearchBundleStatus = "publishable" | "degraded" | "hold";

export interface FixtureResearchGateReasonReadModel {
  readonly code?: string | null;
  readonly severity?: string | null;
  readonly message: string;
}

export interface FixtureResearchTraceReadModel {
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

export interface FixtureResearchSnapshotReadModel {
  readonly bundleId?: string | null;
  readonly generatedAt: string;
  readonly bundleStatus: FixtureResearchBundleStatus;
  readonly gateReasons: readonly FixtureResearchGateReasonReadModel[];
  readonly recommendedLean?: string | null;
  readonly evidenceCount?: number | null;
  readonly topEvidenceTitles: readonly string[];
  readonly risks: readonly string[];
  readonly featureReadinessStatus?: string | null;
  readonly featureReadinessReasons: readonly string[];
  readonly researchTrace: FixtureResearchTraceReadModel | null;
}

export interface FixtureResearchReadModel {
  readonly fixtureId: string;
  readonly status: FixtureResearchBundleStatus;
  readonly publishable: boolean;
  readonly gateReasons: readonly FixtureResearchGateReasonReadModel[];
  readonly latestBundle: {
    readonly id?: string | null;
    readonly generatedAt: string;
    readonly summary?: string | null;
    readonly recommendedLean?: string | null;
    readonly aiRunId?: string | null;
  };
  readonly latestSnapshot: FixtureResearchSnapshotReadModel | null;
  readonly researchTrace: FixtureResearchTraceReadModel | null;
}

export interface OperationalSummary {
  readonly generatedAt: string;
  readonly taskCounts: {
    readonly total: number;
    readonly queued: number;
    readonly running: number;
    readonly failed: number;
    readonly quarantined: number;
    readonly succeeded: number;
    readonly cancelled: number;
  };
  readonly taskRunCounts: {
    readonly total: number;
    readonly running: number;
    readonly failed: number;
    readonly succeeded: number;
    readonly cancelled: number;
  };
  readonly etl: {
    readonly rawBatchCount: number;
    readonly oddsSnapshotCount: number;
    readonly endpointCounts: Readonly<Record<string, number>>;
    readonly latestBatch: RawIngestionBatchReadModel | null;
    readonly latestOddsSnapshot: OddsSnapshotReadModel | null;
  };
  readonly observability: {
    readonly workers: readonly WorkerMetricReadModel[];
    readonly providers: readonly ProviderMetricReadModel[];
    readonly retries: RetryPressureSummary;
    readonly backfills: readonly BackfillNeedReadModel[];
    readonly traceability: TraceabilityCoverageSummary;
    readonly alerts: readonly string[];
  };
  readonly policy: OperationalPolicyReport;
  readonly validation: ValidationSummary;
}

export interface OperationalLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly level: "INFO" | "ERROR";
  readonly taskId: string;
  readonly taskRunId?: string;
  readonly taskKind: string;
  readonly taskStatus: string;
  readonly message: string;
}

export interface AiRunReadModel {
  readonly id: string;
  readonly taskId: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly latestPromptVersion?: string;
  readonly status: AiRunEntity["status"];
  readonly providerRequestId?: string;
  readonly usage?: AiRunEntity["usage"];
  readonly outputRef?: string;
  readonly error?: string;
  readonly fallbackReason?: string;
  readonly degraded?: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderStateReadModel {
  readonly provider: string;
  readonly latestModel?: string;
  readonly latestPromptVersion?: string;
  readonly aiRunCount: number;
  readonly failedAiRunCount: number;
  readonly latestAiRunAt?: string;
  readonly latestError?: string;
  readonly rawBatchCount: number;
  readonly latestRawBatchAt?: string;
  readonly latestRawBatchStatus?: string;
  readonly quota?: {
    readonly limit?: number;
    readonly used?: number;
    readonly remaining?: number;
    readonly updatedAt?: string;
  };
}

export interface PredictionReadModel extends PredictionEntity {
  readonly marketLabel: string;
}

export type ParlayLegReadModel = ParlayEntity["legs"][number] & {
  readonly marketLabel: string;
};

export interface ParlayReadModel extends Omit<ParlayEntity, "legs"> {
  readonly legs: readonly ParlayLegReadModel[];
}

export interface AiRunLinkedPredictionReadModel
  extends Pick<PredictionReadModel, "id" | "fixtureId" | "market" | "outcome" | "marketLabel" | "status" | "confidence"> {}

export interface AiRunLinkedParlayReadModel
  extends Pick<ParlayEntity, "id" | "status" | "expectedPayout"> {
  readonly legCount: number;
}

export interface AiRunDetailReadModel extends AiRunReadModel {
  readonly task?: Pick<TaskEntity, "id" | "kind" | "status">;
  readonly linkedPredictionIds: readonly string[];
  readonly linkedParlayIds: readonly string[];
  readonly linkedPredictions: readonly AiRunLinkedPredictionReadModel[];
  readonly linkedParlays: readonly AiRunLinkedParlayReadModel[];
}

export interface PredictionDetailReadModel extends PredictionReadModel {
  readonly fixture?: FixtureEntity;
  readonly aiRun?: AiRunReadModel;
  readonly linkedParlayIds: readonly string[];
  readonly linkedParlays: readonly AiRunLinkedParlayReadModel[];
  readonly validation?: ValidationEntity;
}

export type ParlayLegDetailReadModel = ParlayLegReadModel & {
  readonly prediction?: PredictionReadModel;
  readonly fixture?: FixtureEntity;
};

export interface ParlayDetailReadModel extends Omit<ParlayReadModel, "legs"> {
  readonly aiRun?: AiRunReadModel;
  readonly linkedAiRunIds: readonly string[];
  readonly legs: readonly ParlayLegDetailReadModel[];
  readonly validation?: ValidationEntity;
}

export interface FixtureOpsStageNarrativeReadModel {
  readonly stage: "ingestion" | "odds" | "enrichment" | "candidate" | "prediction" | "parlay" | "validation";
  readonly status: WorkflowStageStatus;
  readonly blockingReason?: string;
  readonly degradationReason?: string;
  readonly retryCount: number;
  readonly lastTaskRunId?: string;
  readonly manualReviewRequired: boolean;
  readonly dependsOn: readonly string[];
}

export interface AutomationCycleStageReadModel {
  readonly stage: "research" | "prediction" | "parlay" | "validation";
  readonly status: "pending" | "running" | "succeeded" | "failed" | "blocked" | "degraded";
  readonly taskIds: readonly string[];
  readonly taskRunIds: readonly string[];
  readonly retryCount: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly error?: string;
}

export interface AutomationCycleReadModel {
  readonly id: string;
  readonly leaseOwner: string;
  readonly source: string;
  readonly status: "running" | "succeeded" | "failed" | "degraded";
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly fixtureIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly validationTaskId?: string;
  readonly stages: readonly AutomationCycleStageReadModel[];
  readonly summary: {
    readonly researchTaskCount: number;
    readonly predictionTaskCount: number;
    readonly parlayCount: number;
    readonly validationTaskCount: number;
    readonly expiredLeaseCount?: number;
    readonly recoveredLeaseCount?: number;
    readonly renewedLeaseCount?: number;
    readonly redrivenTaskCount?: number;
    readonly quarantinedTaskCount?: number;
    readonly manualReviewTaskCount?: number;
  };
  readonly metadata: Record<string, unknown>;
}

export type PublicApiReadinessStatus = "blocked" | "review" | "ready";

export interface PublicApiReadinessCheckReadModel {
  readonly name: string;
  readonly status: PublicApiReadinessStatus;
  readonly detail: string;
}

export interface PublicApiReadinessReadModel {
  readonly generatedAt: string;
  readonly status: PublicApiReadinessStatus;
  readonly checks: readonly PublicApiReadinessCheckReadModel[];
  readonly sandboxCertification: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly missing: number;
    readonly profiles: readonly {
      readonly id: string;
      readonly status: PublicApiReadinessStatus;
      readonly sourceStatus: SandboxCertificationReadModel["status"];
      readonly generatedAt?: string;
    }[];
  };
  readonly promotionGates: {
    readonly total: number;
    readonly blocked: number;
    readonly reviewRequired: number;
    readonly promotable: number;
    readonly profiles: readonly {
      readonly id: string;
      readonly status: PublicApiReadinessStatus;
      readonly sourceStatus: SandboxPromotionReportReadModel["status"];
      readonly generatedAt?: string;
    }[];
  };
}

export interface FixtureOpsDetailReadModel {
  readonly fixture: FixtureEntity;
  readonly workflow?: FixtureWorkflowEntity;
  readonly research: FixtureResearchReadModel | null;
  readonly latestOddsSnapshot: OddsSnapshotReadModel | null;
  readonly statistics: FixtureOpsStatisticsReadModel;
  readonly scoringEligibility: {
    readonly eligible: boolean;
    readonly reason?: string;
  };
  readonly recentAuditEvents: readonly AuditEventEntity[];
  readonly predictions: readonly PredictionEntity[];
  readonly parlays: readonly ParlayEntity[];
  readonly validations: readonly ValidationEntity[];
  readonly recentTaskRuns: readonly TaskRunEntity[];
  readonly stages: readonly FixtureOpsStageNarrativeReadModel[];
}

export interface CoverageDailyScopeReadModel extends FixtureCoverageScopeDecision {}

export interface OperationSnapshot {
  readonly generatedAt: string;
  readonly automationCycles: readonly AutomationCycleReadModel[];
  readonly fixtures: readonly FixtureEntity[];
  readonly fixtureResearch: readonly FixtureResearchReadModel[];
  readonly fixtureWorkflows: readonly FixtureWorkflowEntity[];
  readonly leagueCoveragePolicies: readonly LeagueCoveragePolicyEntity[];
  readonly teamCoveragePolicies: readonly TeamCoveragePolicyEntity[];
  readonly dailyAutomationPolicies: readonly DailyAutomationPolicyEntity[];
  readonly auditEvents: readonly AuditEventEntity[];
  readonly tasks: readonly TaskReadModel[];
  readonly taskRuns: readonly TaskRunEntity[];
  readonly aiRuns: readonly AiRunReadModel[];
  readonly providerStates: readonly ProviderStateReadModel[];
  readonly rawBatches: readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots: readonly OddsSnapshotReadModel[];
  readonly fixtureStatisticSnapshots: readonly FixtureStatisticSnapshotReadModel[];
  readonly manualReviews: readonly ManualReviewReadModel[];
  readonly quarantines: readonly QuarantineReadModel[];
  readonly recovery: readonly RecoveryReadModel[];
  readonly telemetryEvents: readonly TelemetryEventReadModel[];
  readonly telemetryMetrics: readonly TelemetryMetricReadModel[];
  readonly predictions: readonly PredictionEntity[];
  readonly parlays: readonly ParlayEntity[];
  readonly validations: readonly ValidationEntity[];
  readonly validationSummary: ValidationSummary;
  readonly health: PublicApiHealth;
  readonly readiness: PublicApiReadinessReadModel;
}

export interface PublicApiHandlers {
  readonly automationCycles: () => readonly AutomationCycleReadModel[];
  readonly automationCycleById: (cycleId: string) => AutomationCycleReadModel | null;
  readonly fixtures: () => readonly FixtureEntity[];
  readonly fixtureById: (fixtureId: string) => FixtureEntity | null;
  readonly fixtureOpsById: (fixtureId: string) => FixtureOpsDetailReadModel | null;
  readonly fixtureAuditEventsById: (fixtureId: string) => readonly AuditEventEntity[] | null;
  readonly leagueCoveragePolicies: () => readonly LeagueCoveragePolicyEntity[];
  readonly teamCoveragePolicies: () => readonly TeamCoveragePolicyEntity[];
  readonly dailyAutomationPolicy: () => DailyAutomationPolicyEntity | null;
  readonly coverageDailyScope: () => readonly CoverageDailyScopeReadModel[];
  readonly tasks: () => readonly TaskReadModel[];
  readonly taskById: (taskId: string) => TaskReadModel | null;
  readonly taskRuns: () => readonly TaskRunEntity[];
  readonly taskRunById: (taskRunId: string) => TaskRunEntity | null;
  readonly taskRunsByTaskId: (taskId: string) => readonly TaskRunEntity[];
  readonly manualReviews: () => readonly ManualReviewReadModel[];
  readonly quarantines: () => readonly QuarantineReadModel[];
  readonly recovery: () => readonly RecoveryReadModel[];
  readonly liveIngestionRuns: () => readonly LiveIngestionRunReadModel[];
  readonly liveIngestionRunByTaskId: (taskId: string) => LiveIngestionRunReadModel | null;
  readonly aiRuns: () => readonly AiRunReadModel[];
  readonly aiRunById: (aiRunId: string) => AiRunDetailReadModel | null;
  readonly providerStates: () => readonly ProviderStateReadModel[];
  readonly providerStateByProvider: (provider: string) => ProviderStateReadModel | null;
  readonly rawBatches: () => readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots: () => readonly OddsSnapshotReadModel[];
  readonly telemetryEvents: () => readonly TelemetryEventReadModel[];
  readonly telemetryMetrics: () => readonly TelemetryMetricReadModel[];
  readonly operationalSummary: () => OperationalSummary;
  readonly operationalLogs: () => readonly OperationalLogEntry[];
  readonly predictions: () => readonly PredictionReadModel[];
  readonly predictionById: (predictionId: string) => PredictionDetailReadModel | null;
  readonly parlays: () => readonly ParlayReadModel[];
  readonly parlayById: (parlayId: string) => ParlayDetailReadModel | null;
  readonly validations: () => readonly ValidationEntity[];
  readonly validationById: (validationId: string) => ValidationEntity | null;
  readonly validationSummary: () => ValidationSummary;
  readonly health: () => PublicApiHealth;
  readonly readiness: () => PublicApiReadinessReadModel;
  readonly snapshot: () => OperationSnapshot;
}

export interface PublicApiHttpOptions {
  readonly snapshot?: OperationSnapshot;
  readonly handlers?: PublicApiHandlers;
  readonly unitOfWork?: StorageUnitOfWork;
  readonly queueAdapter?: TaskQueueAdapter;
  readonly sandboxCertification?: PublicApiSandboxCertificationSourceOptions;
  readonly auth?: PublicApiAuthenticationOptions;
}

export interface PublicApiTokenCredential {
  readonly token: string;
  readonly actor: AuthorizationActor;
}

export interface PublicApiAuthenticationOptions {
  readonly credentials: readonly PublicApiTokenCredential[];
  readonly realm?: string;
}

export interface FixtureManualSelectionActionInput extends FixtureWorkflowManualSelectionInput {}

export interface FixtureSelectionOverrideActionInput
  extends Omit<FixtureWorkflowSelectionOverrideInput, "mode"> {
  readonly mode: FixtureSelectionOverride;
}

export interface FixtureWorkflowResetActionInput {
  readonly reason?: string;
  readonly occurredAt?: string;
}

export interface QueueTaskRequeueActionInput {
  readonly occurredAt?: string;
}

export interface QueueTaskQuarantineActionInput {
  readonly taskRunId?: string;
  readonly reason: string;
  readonly occurredAt?: string;
}

export type SandboxCertificationPromotionDecision = "approved" | "rejected";

export interface SandboxCertificationPromotionDecisionInput {
  readonly decision: SandboxCertificationPromotionDecision;
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
  readonly occurredAt?: string;
}

export interface PublicApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface PublicApiSandboxCertificationSourceOptions {
  readonly goldensRoot?: string;
  readonly artifactsRoot?: string;
  readonly persistedRuns?: readonly SandboxCertificationRunReadModel[];
  readonly persistedRuntimeReleaseSnapshots?: readonly RuntimeReleaseSnapshotReadModel[];
}

export interface SandboxCertificationDiffEntryReadModel {
  readonly path: string;
  readonly kind: "added" | "removed" | "changed";
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface SandboxCertificationReadModel {
  readonly id: string;
  readonly profileName: string;
  readonly packId: string;
  readonly mode: string;
  readonly status: "passed" | "failed" | "missing";
  readonly generatedAt?: string;
  readonly fixtureCount: number;
  readonly replayEventCount: number;
  readonly diffEntryCount: number;
  readonly goldenFingerprint: string;
  readonly evidenceFingerprint?: string;
  readonly goldenPath: string;
  readonly artifactPath?: string;
  readonly promotion?: SandboxPromotionReportReadModel;
  readonly latestSyntheticIntegrity: SandboxCertificationRunSummaryReadModel | null;
  readonly latestRuntimeRelease: SandboxCertificationRunSummaryReadModel | null;
}

export interface SandboxCertificationDetailReadModel extends SandboxCertificationReadModel {
  readonly assertions: readonly string[];
  readonly allowedHosts: readonly string[];
  readonly diffEntries: readonly SandboxCertificationDiffEntryReadModel[];
  readonly policyTrace?: SandboxPolicyTraceReadModel;
}

export type SandboxCertificationVerificationKind = "synthetic-integrity" | "runtime-release";

export type SandboxCertificationRunStatus = "passed" | "failed";

export type SandboxCertificationPromotionStatus = "blocked" | "review-required" | "promotable";

export interface SandboxCertificationRunSummaryReadModel {
  readonly id: string;
  readonly verificationKind: SandboxCertificationVerificationKind;
  readonly status: SandboxCertificationRunStatus;
  readonly generatedAt?: string;
  readonly promotionStatus?: SandboxCertificationPromotionStatus;
  readonly gitSha?: string;
  readonly baselineRef?: string;
  readonly candidateRef?: string;
  readonly goldenFingerprint?: string;
  readonly evidenceFingerprint?: string;
  readonly artifactRef?: string;
  readonly runtimeSignals: Readonly<Record<string, unknown>>;
  readonly diffEntryCount: number;
  readonly summary: Readonly<Record<string, unknown>>;
}

export interface SandboxCertificationRunReadModel extends SandboxCertificationRunSummaryReadModel {
  readonly profileName: string;
  readonly packId: string;
  readonly mode: string;
  readonly gitSha: string;
  readonly diffEntries: readonly SandboxCertificationDiffEntryReadModel[];
}

export type RuntimeReleaseSnapshotRole = "baseline" | "candidate";

export type RuntimeReleaseSnapshotSource = "persisted" | "summary" | "runtimeSignals" | "derived";

export interface RuntimeReleaseSnapshotReadModel {
  readonly id: string;
  readonly role: RuntimeReleaseSnapshotRole;
  readonly ref: string;
  readonly source: RuntimeReleaseSnapshotSource;
  readonly runId?: string;
  readonly profileName?: string;
  readonly fingerprint?: string;
  readonly generatedAt?: string;
  readonly artifactRef?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type RuntimeReleaseCoverageStatus = "complete" | "partial" | "truncated" | "unknown";

export interface RuntimeReleaseCoverageSectionReadModel {
  readonly name: string;
  readonly observedCount?: number;
  readonly limit?: number;
  readonly truncated?: boolean;
}

export interface RuntimeReleaseCoverageSummaryReadModel {
  readonly status: RuntimeReleaseCoverageStatus;
  readonly truncated: boolean | null;
  readonly sections: readonly RuntimeReleaseCoverageSectionReadModel[];
  readonly notes: readonly string[];
}

export interface SandboxCertificationPromotionDecisionReadModel {
  readonly decision: SandboxCertificationPromotionDecision;
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
  readonly actor?: string;
  readonly actorType?: AuditEventEntity["actorType"];
  readonly occurredAt: string;
}

export interface SandboxCertificationRunDetailReadModel extends SandboxCertificationRunReadModel {
  readonly baselineSnapshot: RuntimeReleaseSnapshotReadModel | null;
  readonly candidateSnapshot: RuntimeReleaseSnapshotReadModel | null;
  readonly coverageSummary: RuntimeReleaseCoverageSummaryReadModel | null;
  readonly snapshotDiffFingerprint: string | null;
  readonly latestPromotionDecision: SandboxCertificationPromotionDecisionReadModel | null;
  readonly promotionDecisionHistory: readonly SandboxCertificationPromotionDecisionReadModel[];
}

export interface SandboxPromotionGateReadModel {
  readonly name:
    | "sandbox-certification"
    | "contract-coverage"
    | "cron-workflows"
    | "publication-safety"
    | "capability-isolation"
    | "manual-qa";
  readonly status: "pass" | "warn" | "block";
  readonly detail: string;
}

export interface SandboxPromotionReportReadModel {
  readonly status: "blocked" | "review-required" | "promotable";
  readonly summary: string;
  readonly gates: readonly SandboxPromotionGateReadModel[];
}

export interface SandboxPolicyTraceReadModel {
  readonly providerModes: Readonly<Record<string, string>>;
  readonly sideEffects: readonly string[];
  readonly capabilityAllowlist: readonly string[];
  readonly memoryIsolation: {
    readonly strategy: string;
    readonly namespaceRoot: string;
    readonly allowProductionMemory: boolean;
  };
  readonly sessionIsolation: {
    readonly strategy: string;
    readonly namespaceRoot: string;
    readonly allowSharedSessions: boolean;
  };
  readonly skillPolicy: {
    readonly mode: string;
    readonly defaultDeny: boolean;
    readonly enabledSkills: readonly string[];
  };
  readonly secretsPolicy: {
    readonly mode: string;
    readonly allowedSecretRefs: readonly string[];
    readonly allowProductionCredentials: boolean;
  };
  readonly requiresManualQa: boolean;
  readonly publishEnabled: boolean;
  readonly allowedHosts: readonly string[];
}

export interface LiveIngestionRunReadModel {
  readonly taskId: string;
  readonly taskRunId?: string;
  readonly taskKind: Extract<TaskEntity["kind"], "fixture-ingestion" | "odds-ingestion">;
  readonly intent: "ingest-fixtures" | "ingest-odds";
  readonly status: TaskEntity["status"] | TaskRunEntity["status"];
  readonly scheduledFor?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly manifestId?: string;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly activeTaskRunId?: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly claimedAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly provider: {
    readonly endpointFamily: "fixtures" | "odds";
    readonly providerSource?: string;
    readonly providerBaseUrl?: string;
    readonly requestKind?: "live-runner" | "runtime";
  };
  readonly request?: {
    readonly window: {
      readonly start: string;
      readonly end: string;
      readonly granularity: "daily" | "intraday";
    };
    readonly league?: string;
    readonly season?: number;
    readonly fixtureIds?: readonly string[];
    readonly marketKeys?: readonly string[];
    readonly quirksApplied: readonly string[];
  };
  readonly batch?: {
    readonly batchId: string;
    readonly checksum?: string;
    readonly observedRecords?: number;
    readonly rawRefs: readonly string[];
    readonly snapshotId?: string;
    readonly warnings: readonly string[];
  };
  readonly providerError?: {
    readonly category: string;
    readonly provider: string;
    readonly endpoint: string;
    readonly url: string;
    readonly retriable: boolean;
    readonly httpStatus?: number;
    readonly providerErrors?: Record<string, unknown> | readonly unknown[];
    readonly message?: string;
  };
}

export interface TelemetryEventReadModel {
  readonly id: string;
  readonly kind: "log" | "span";
  readonly name: string;
  readonly severity: "debug" | "info" | "warn" | "error";
  readonly source: string;
  readonly occurredAt: string;
  readonly finishedAt?: string;
  readonly durationMs?: number;
  readonly message?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly sandboxCertificationRunId?: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface TelemetryMetricReadModel {
  readonly id: string;
  readonly name: string;
  readonly type: "counter" | "gauge" | "histogram";
  readonly value: number;
  readonly labels: Readonly<Record<string, string>>;
  readonly source: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly sandboxCertificationRunId?: string;
  readonly recordedAt: string;
}

export type QueueIssueSource = "operator" | "recovery" | "runtime" | "unknown";

export interface ManualReviewReadModel {
  readonly id: string;
  readonly taskId: string;
  readonly taskKind: string;
  readonly taskStatus: TaskEntity["status"];
  readonly taskRunId?: string;
  readonly fixtureId?: string;
  readonly reason: string;
  readonly source: QueueIssueSource;
  readonly requiredAt: string;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly recoveryCycleId?: string;
}

export interface QuarantineReadModel {
  readonly taskId: string;
  readonly taskKind: string;
  readonly taskStatus: TaskEntity["status"];
  readonly taskRunId?: string;
  readonly fixtureId?: string;
  readonly reason: string;
  readonly source: QueueIssueSource;
  readonly quarantinedAt: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly canRequeue: boolean;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly recoveryCycleId?: string;
  readonly manualReviewRequired: boolean;
}

export interface RecoveryActionReadModel {
  readonly action: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly reason?: string;
  readonly error?: string;
  readonly retryScheduledFor?: string | null;
  readonly previousStatus?: string;
}

export interface RecoveryReadModel {
  readonly cycleId: string;
  readonly source: string;
  readonly status: AutomationCycleReadModel["status"];
  readonly leaseOwner: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly expiredLeaseCount: number;
  readonly recoveredLeaseCount: number;
  readonly renewedLeaseCount: number;
  readonly redrivenTaskCount: number;
  readonly quarantinedTaskCount: number;
  readonly manualReviewTaskCount: number;
  readonly affectedTaskIds: readonly string[];
  readonly affectedFixtureIds: readonly string[];
  readonly actions: readonly RecoveryActionReadModel[];
  readonly errors: readonly string[];
}

export interface TaskReadModel extends TaskEntity {
  readonly manifestId?: string;
  readonly workflowId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly activeTaskRunId?: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly claimedAt?: string;
  readonly lastHeartbeatAt?: string;
}

const allowedTaskStatuses = [
  "queued",
  "running",
  "failed",
  "quarantined",
  "succeeded",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export const publicApiEndpointPaths = {
  automationCycles: "/automation-cycles",
  fixtures: "/fixtures",
  tasks: "/tasks",
  taskRuns: "/task-runs",
  manualReview: "/manual-review",
  quarantines: "/quarantines",
  recovery: "/recovery",
  liveIngestionRuns: "/live-ingestion-runs",
  sandboxCertification: "/sandbox-certification",
  sandboxCertificationRuns: "/sandbox-certification/runs",
  aiRuns: "/ai-runs",
  providerStates: "/provider-states",
  rawBatches: "/raw-batches",
  oddsSnapshots: "/odds-snapshots",
  telemetryEvents: "/telemetry/events",
  telemetryMetrics: "/telemetry/metrics",
  operationalSummary: "/operational-summary",
  operationalLogs: "/operational-logs",
  coverageLeagues: "/coverage/leagues",
  coverageTeams: "/coverage/teams",
  coverageDailyPolicy: "/coverage/daily-policy",
  coverageDailyScope: "/coverage/daily-scope",
  predictions: "/predictions",
  parlays: "/parlays",
  validations: "/validations",
  validationSummary: "/validation-summary",
  health: "/health",
  readiness: "/readiness",
  snapshot: "/snapshot",
} as const;

export const workspaceInfo = {
  packageName: "@gana-v8/public-api",
  workspaceName: "public-api",
  category: "app",
  description: "Stable API boundary for fixtures, predictions, parlays, validation summary, and health.",
  dependencies: [
    { name: "@gana-v8/authz", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/queue-adapters", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

interface FixtureResearchRepositoryCollectionLike {
  readonly researchBundles?: {
    list(): Promise<ResearchBundleEntity[]>;
    findLatestByFixtureId?(fixtureId: string): Promise<ResearchBundleEntity | null>;
  };
  readonly featureSnapshots?: {
    list(): Promise<FeatureSnapshotEntity[]>;
    findLatestByFixtureId?(fixtureId: string): Promise<FeatureSnapshotEntity | null>;
  };
}

interface FixtureStatisticSnapshotRepositoryCollectionLike {
  readonly fixtureStatisticSnapshots?: {
    list(): Promise<readonly unknown[]>;
  };
}

interface PersistedCertificationHistoryRepositoryCollectionLike {
  readonly sandboxCertificationRuns?: {
    listByQuery(query?: Record<string, unknown>): Promise<readonly unknown[]>;
    findLatestByProfilePack?(
      profileName: string,
      packId: string,
      verificationKind?: SandboxCertificationVerificationKind,
    ): Promise<unknown | null>;
  };
  readonly runtimeReleaseSnapshots?: {
    listByRunId?(runId: string): Promise<readonly unknown[]>;
    listByQuery?(query?: Record<string, unknown>): Promise<readonly unknown[]>;
  };
}

interface PersistedTelemetryRepositoryCollectionLike {
  readonly telemetryEvents?: {
    listByQuery(query?: Record<string, unknown>): Promise<readonly unknown[]>;
  };
  readonly metricSamples?: {
    listByQuery(query?: Record<string, unknown>): Promise<readonly unknown[]>;
  };
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" && item.trim().length > 0 ? [item] : []));
  }

  if (typeof value === "string") {
    return value
      .split("|")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
};

const SANDBOX_CERTIFICATION_PROMOTION_DECISION_EVENT_TYPE =
  "sandbox-certification-run.promotion-decision.recorded";

const PUBLIC_API_DEFAULT_QUERY_LIMIT = 100;
const PUBLIC_API_MAX_QUERY_LIMIT = 500;

const parseQueryLimit = (rawValue: string | null | undefined): number => {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return PUBLIC_API_DEFAULT_QUERY_LIMIT;
  }

  return Math.min(parsed, PUBLIC_API_MAX_QUERY_LIMIT);
};

const toAuditActorType = (
  actor: AuthorizationActor | undefined,
): AuditEventEntity["actorType"] | undefined => {
  switch (actor?.role) {
    case "operator":
      return "operator";
    case "system":
      return "system";
    case "automation":
      return "service";
    default:
      return undefined;
  }
};

const asBundleStatus = (value: unknown): FixtureResearchBundleStatus | null => {
  const normalized = asString(value)?.trim().toLowerCase();
  return normalized === "publishable" || normalized === "degraded" || normalized === "hold"
    ? normalized
    : null;
};

const defaultGateSeverity = (
  status: FixtureResearchBundleStatus,
): string | null =>
  status === "hold" ? "block" : status === "degraded" ? "warn" : "info";

const normalizeGateReasons = (
  value: unknown,
  fallbackStatus: FixtureResearchBundleStatus,
  fallbackMessages: readonly string[] = [],
): FixtureResearchGateReasonReadModel[] => {
  const normalizedFromArray: FixtureResearchGateReasonReadModel[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        normalizedFromArray.push({
          message: entry,
          severity: defaultGateSeverity(fallbackStatus),
        });
        continue;
      }

      const record = asRecord(entry);
      const message = asString(record?.message);
      if (!message) {
        continue;
      }

      const code = asString(record?.code);
      const severity = asString(record?.severity);
      normalizedFromArray.push({
        message,
        ...(code ? { code } : {}),
        ...(severity ? { severity } : {}),
      });
    }
  }

  if (normalizedFromArray.length > 0) {
    return normalizedFromArray;
  }

  return fallbackMessages.map<FixtureResearchGateReasonReadModel>((message) => ({
    message,
    severity: defaultGateSeverity(fallbackStatus),
  }));
};

const normalizeResearchTrace = (
  value: unknown,
  aiRun?: {
    readonly id: string;
    readonly provider: string;
    readonly model: string;
    readonly promptVersion: string;
    readonly providerRequestId?: string;
    readonly status: string;
    readonly error?: string;
  } | null,
): FixtureResearchTraceReadModel | null => {
  const record = asRecord(value);
  const synthesisMode = asString(record?.synthesisMode);
  const inferredMode =
    synthesisMode === "deterministic" || synthesisMode === "ai-assisted" || synthesisMode === "ai-fallback"
      ? synthesisMode
      : aiRun?.status === "failed"
        ? "ai-fallback"
        : aiRun
          ? "ai-assisted"
          : null;

  if (!inferredMode) {
    return null;
  }

  const aiRunId = asString(record?.aiRunId) ?? aiRun?.id;
  const aiProvider = asString(record?.aiProvider) ?? aiRun?.provider;
  const aiModel = asString(record?.aiModel) ?? aiRun?.model;
  const aiPromptVersion =
    asString(record?.aiPromptVersion) ?? aiRun?.promptVersion;
  const providerRequestId =
    asString(record?.providerRequestId) ?? aiRun?.providerRequestId;
  const fallbackSummary = asString(record?.fallbackSummary) ?? aiRun?.error;
  const plannerVersion = asString(record?.plannerVersion);
  const assignmentIds = asStringArray(record?.assignmentIds);

  return {
    synthesisMode: inferredMode,
    ...(aiRunId ? { aiRunId } : {}),
    ...(aiProvider ? { aiProvider } : {}),
    ...(aiModel ? { aiModel } : {}),
    ...(aiPromptVersion ? { aiPromptVersion } : {}),
    ...(providerRequestId ? { providerRequestId } : {}),
    ...(fallbackSummary ? { fallbackSummary } : {}),
    ...(plannerVersion ? { plannerVersion } : {}),
    ...(assignmentIds.length > 0 ? { assignmentIds } : {}),
  };
};

const createFixtureResearchSnapshotReadModel = (input: {
  readonly bundleId?: string | null;
  readonly generatedAt: string;
  readonly bundleStatus: FixtureResearchBundleStatus;
  readonly gateReasons: readonly FixtureResearchGateReasonReadModel[];
  readonly recommendedLean?: string | null;
  readonly evidenceCount?: number | null;
  readonly topEvidenceTitles?: readonly string[];
  readonly risks?: readonly string[];
  readonly featureReadinessStatus?: string | null;
  readonly featureReadinessReasons?: readonly string[];
  readonly researchTrace?: FixtureResearchTraceReadModel | null;
}): FixtureResearchSnapshotReadModel => ({
  ...(input.bundleId ? { bundleId: input.bundleId } : {}),
  generatedAt: input.generatedAt,
  bundleStatus: input.bundleStatus,
  gateReasons: input.gateReasons,
  ...(input.recommendedLean ? { recommendedLean: input.recommendedLean } : {}),
  ...(input.evidenceCount !== undefined && input.evidenceCount !== null ? { evidenceCount: input.evidenceCount } : {}),
  topEvidenceTitles: [...(input.topEvidenceTitles ?? [])],
  risks: [...(input.risks ?? [])],
  ...(input.featureReadinessStatus ? { featureReadinessStatus: input.featureReadinessStatus } : {}),
  featureReadinessReasons: [...(input.featureReadinessReasons ?? [])],
  researchTrace: input.researchTrace ?? null,
});

const createFixtureResearchReadModelFromDedicatedRecords = (
  fixtureId: string,
  latestBundle: ResearchBundleEntity | null,
  latestSnapshot: FeatureSnapshotEntity | null,
  aiRunsById: ReadonlyMap<string, AiRunEntity>,
): FixtureResearchReadModel | null => {
  if (!latestBundle && !latestSnapshot) {
    return null;
  }

  const resolvedStatus = latestSnapshot?.bundleStatus ?? latestBundle?.gateResult.status ?? "hold";
  const resolvedSnapshotTrace =
    latestSnapshot
      ? normalizeResearchTrace(
          latestSnapshot.researchTrace,
          latestSnapshot.researchTrace?.aiRunId ? aiRunsById.get(latestSnapshot.researchTrace.aiRunId) : null,
        )
      : null;
  const resolvedBundleAiRun =
    latestBundle?.aiRunId ? aiRunsById.get(latestBundle.aiRunId) ?? null : null;
  const resolvedBundleTrace = latestBundle
    ? normalizeResearchTrace(latestBundle.trace, resolvedBundleAiRun)
    : null;
  const resolvedSnapshot = latestSnapshot
    ? createFixtureResearchSnapshotReadModel({
        bundleId: latestSnapshot.bundleId,
        generatedAt: latestSnapshot.generatedAt,
        bundleStatus: latestSnapshot.bundleStatus,
        gateReasons: normalizeGateReasons(latestSnapshot.gateReasons, latestSnapshot.bundleStatus),
        recommendedLean: latestSnapshot.recommendedLean,
        evidenceCount: latestSnapshot.evidenceCount,
        topEvidenceTitles: latestSnapshot.topEvidence.map((item) => item.title),
        risks: latestSnapshot.risks,
        featureReadinessStatus: latestSnapshot.readiness.status,
        featureReadinessReasons: latestSnapshot.readiness.reasons,
        researchTrace: resolvedSnapshotTrace,
      })
    : null;
  const gateReasons = resolvedSnapshot?.gateReasons ??
    normalizeGateReasons(
      latestBundle?.gateResult.reasons,
      resolvedStatus,
      latestSnapshot?.readiness.reasons ?? [],
    );
  const generatedAt =
    resolvedSnapshot?.generatedAt ??
    latestBundle?.generatedAt ??
    latestBundle?.updatedAt;

  if (!generatedAt) {
    return null;
  }

  const latestRecommendedLean =
    latestSnapshot?.recommendedLean ?? latestBundle?.recommendedLean;
  const latestBundleAiRunId = latestBundle?.aiRunId;

  return {
    fixtureId,
    status: resolvedStatus,
    publishable: resolvedStatus === "publishable",
    gateReasons,
    latestBundle: {
      id: latestBundle?.id ?? resolvedSnapshot?.bundleId ?? null,
      generatedAt,
      ...(latestBundle?.summary ? { summary: latestBundle.summary } : {}),
      ...(latestRecommendedLean ? { recommendedLean: latestRecommendedLean } : {}),
      ...(latestBundleAiRunId ? { aiRunId: latestBundleAiRunId } : {}),
    },
    latestSnapshot: resolvedSnapshot,
    researchTrace: resolvedSnapshot?.researchTrace ?? resolvedBundleTrace,
  };
};

const findLatestByGeneratedAt = <T extends { readonly fixtureId: string; readonly generatedAt: string }>(
  records: readonly T[],
  fixtureId: string,
): T | null =>
  sortByIsoDescending(
    records.filter((record) => record.fixtureId === fixtureId),
    (record) => record.generatedAt,
  )[0] ?? null;

const isMissingDatabaseRelationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : "";
  return message.includes("does not exist in the current database");
};

const loadOptionalRepositoryEntities = async <T>(
  list?: () => Promise<readonly T[]>,
): Promise<readonly T[]> => {
  if (!list) {
    return [];
  }

  try {
    return await list();
  } catch (error) {
    if (isMissingDatabaseRelationError(error)) {
      return [];
    }

    throw error;
  }
};

const loadFixtureResearchFromRepositories = async (
  fixtures: readonly FixtureEntity[],
  repositories: FixtureResearchRepositoryCollectionLike,
  aiRuns: readonly AiRunEntity[],
): Promise<FixtureResearchReadModel[]> => {
  if (!repositories.researchBundles && !repositories.featureSnapshots) {
    return [];
  }

  const [bundles, snapshots] = await Promise.all([
    loadOptionalRepositoryEntities(
      repositories.researchBundles
        ? () => repositories.researchBundles!.list()
        : undefined,
    ),
    loadOptionalRepositoryEntities(
      repositories.featureSnapshots
        ? () => repositories.featureSnapshots!.list()
        : undefined,
    ),
  ]);
  const aiRunsById = new Map(aiRuns.map((aiRun) => [aiRun.id, aiRun]));

  return fixtures.flatMap((fixture) => {
    const latestBundle = findLatestByGeneratedAt(bundles, fixture.id);
    const latestSnapshot = findLatestByGeneratedAt(snapshots, fixture.id);
    const research = createFixtureResearchReadModelFromDedicatedRecords(
      fixture.id,
      latestBundle,
      latestSnapshot,
      aiRunsById,
    );
    return research ? [research] : [];
  });
};

const loadFixtureResearchReadModels = async (input: {
  readonly fixtures: readonly FixtureEntity[];
  readonly aiRuns: readonly AiRunEntity[];
  readonly repositories?: FixtureResearchRepositoryCollectionLike;
  readonly researchBundles?: readonly ResearchBundleEntity[];
  readonly featureSnapshots?: readonly FeatureSnapshotEntity[];
}): Promise<FixtureResearchReadModel[]> => {
  const repositoryReadModels =
    input.researchBundles || input.featureSnapshots
      ? input.fixtures.flatMap((fixture) => {
          const latestBundle = input.researchBundles
            ? findLatestByGeneratedAt(input.researchBundles, fixture.id)
            : null;
          const latestSnapshot = input.featureSnapshots
            ? findLatestByGeneratedAt(input.featureSnapshots, fixture.id)
            : null;
          const readModel = createFixtureResearchReadModelFromDedicatedRecords(
            fixture.id,
            latestBundle,
            latestSnapshot,
            new Map(input.aiRuns.map((aiRun) => [aiRun.id, aiRun])),
          );
          return readModel ? [readModel] : [];
        })
      : await loadFixtureResearchFromRepositories(
          input.fixtures,
          input.repositories ?? {},
          input.aiRuns,
        );

  return repositoryReadModels;
};

const toFixtureStatisticSnapshotReadModel = (
  value: unknown,
): FixtureStatisticSnapshotReadModel | null => {
  const snapshot = asRecord(value);
  const fixtureId = asString(snapshot?.fixtureId);
  const statKey = asString(snapshot?.statKey);
  const capturedAt = asString(snapshot?.capturedAt);
  const scope = asString(snapshot?.scope);
  const id = asString(snapshot?.id);
  const valueNumeric = asNumber(snapshot?.valueNumeric);
  if (!fixtureId || !statKey || !capturedAt || (scope !== "home" && scope !== "away")) {
    return null;
  }
  const normalizedScope: FixtureStatisticSnapshotReadModel["scope"] = scope;

  return {
    ...(id ? { id } : {}),
    fixtureId,
    statKey,
    scope: normalizedScope,
    valueNumeric,
    capturedAt,
  };
};

const summarizeResearchGateReasons = (
  research: FixtureResearchReadModel | null,
): string | null => {
  if (!research || research.gateReasons.length === 0) {
    return null;
  }

  return research.gateReasons.map((reason) => reason.message).join("; ");
};

export function summarizeValidations(
  validations: readonly ValidationEntity[],
): ValidationSummary {
  const summary = validations.reduce(
    (accumulator, validation) => {
      accumulator.total += 1;
      accumulator[validation.status] += 1;
      return accumulator;
    },
    {
      total: 0,
      passed: 0,
      failed: 0,
      partial: 0,
      pending: 0,
    },
  );

  const completed = summary.passed + summary.failed + summary.partial;
  return {
    ...summary,
    completionRate:
      summary.total === 0 ? 1 : Number((completed / summary.total).toFixed(4)),
  };
}

export function createHealthReport(input: {
  readonly generatedAt: string;
  readonly fixtures: readonly FixtureEntity[];
  readonly tasks: readonly TaskEntity[];
  readonly rawBatches: readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots: readonly OddsSnapshotReadModel[];
  readonly predictions: readonly PredictionEntity[];
  readonly parlays: readonly ParlayEntity[];
  readonly validationSummary: ValidationSummary;
}): PublicApiHealth {
  const generatedAtMs = Date.parse(input.generatedAt);
  const latestFixturesBatch = sortByIsoDescending(
    input.rawBatches.filter((batch) => batch.endpointFamily === "fixtures"),
    (batch) => batch.extractionTime,
  )[0] ?? null;
  const latestOddsSnapshot = sortByIsoDescending(input.oddsSnapshots, (snapshot) => snapshot.capturedAt)[0] ?? null;
  const recentLiveIngestionFailures = input.tasks.filter(
    (task) =>
      (task.kind === "fixture-ingestion" || task.kind === "odds-ingestion") &&
      (task.status === "failed" || task.status === "quarantined") &&
      Number.isFinite(generatedAtMs) &&
      Date.parse(task.updatedAt) >= generatedAtMs - 24 * 60 * 60 * 1000,
  );

  const formatAgeHours = (timestamp: string): string => {
    const ageHours = (generatedAtMs - Date.parse(timestamp)) / (60 * 60 * 1000);
    return `${Math.max(ageHours, 0).toFixed(2)}h old`;
  };

  const checks = [
    {
      name: "fixtures",
      status: input.fixtures.length > 0 ? "pass" : "warn",
      detail: `${input.fixtures.length} fixture(s) in snapshot`,
    },
    {
      name: "tasks",
      status: input.tasks.length > 0 ? "pass" : "warn",
      detail: `${input.tasks.length} task(s) in snapshot`,
    },
    {
      name: "live-fixtures-freshness",
      status:
        latestFixturesBatch &&
        Number.isFinite(generatedAtMs) &&
        Date.parse(latestFixturesBatch.extractionTime) >= generatedAtMs - 24 * 60 * 60 * 1000
          ? "pass"
          : "warn",
      detail: latestFixturesBatch
        ? `Latest fixtures batch ${latestFixturesBatch.id} is ${formatAgeHours(latestFixturesBatch.extractionTime)}`
        : "No live fixtures batch found",
    },
    {
      name: "live-odds-freshness",
      status:
        latestOddsSnapshot &&
        Number.isFinite(generatedAtMs) &&
        Date.parse(latestOddsSnapshot.capturedAt) >= generatedAtMs - 2 * 60 * 60 * 1000
          ? "pass"
          : "warn",
      detail: latestOddsSnapshot
        ? `Latest odds snapshot ${latestOddsSnapshot.id} is ${formatAgeHours(latestOddsSnapshot.capturedAt)}`
        : "No live odds snapshot found",
    },
    {
      name: "live-ingestion-recent-failures",
      status: recentLiveIngestionFailures.length === 0 ? "pass" : "warn",
      detail: `${recentLiveIngestionFailures.length} recent failed/quarantined live ingestion task(s) in last 24h`,
    },
    {
      name: "predictions",
      status: input.predictions.length > 0 ? "pass" : "warn",
      detail: `${input.predictions.length} prediction(s) in snapshot`,
    },
    {
      name: "parlays",
      status: input.parlays.length > 0 ? "pass" : "warn",
      detail: `${input.parlays.length} parlay(s) in snapshot`,
    },
    {
      name: "validations",
      status:
        input.validationSummary.pending === 0 && input.validationSummary.partial === 0
          ? "pass"
          : "warn",
      detail:
        `${input.validationSummary.passed} passed / ` +
        `${input.validationSummary.failed} failed / ` +
        `${input.validationSummary.partial} partial / ` +
        `${input.validationSummary.pending} pending`,
    },
  ] as const;

  return {
    status: checks.some((check) => check.status === "warn") ? "degraded" : "ok",
    generatedAt: input.generatedAt,
    checks,
  };
}

export interface CreateOperationSnapshotInput {
  readonly generatedAt?: string;
  readonly automationCycles?: readonly AutomationCycleReadModel[];
  readonly fixtures?: readonly FixtureEntity[];
  readonly fixtureResearch?: readonly FixtureResearchReadModel[];
  readonly fixtureWorkflows?: readonly FixtureWorkflowEntity[];
  readonly leagueCoveragePolicies?: readonly LeagueCoveragePolicyEntity[];
  readonly teamCoveragePolicies?: readonly TeamCoveragePolicyEntity[];
  readonly dailyAutomationPolicies?: readonly DailyAutomationPolicyEntity[];
  readonly auditEvents?: readonly AuditEventEntity[];
  readonly tasks?: readonly TaskEntity[];
  readonly taskRuns?: readonly TaskRunEntity[];
  readonly aiRuns?: readonly AiRunReadModel[];
  readonly providerStates?: readonly ProviderStateReadModel[];
  readonly rawBatches?: readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots?: readonly OddsSnapshotReadModel[];
  readonly fixtureStatisticSnapshots?: readonly FixtureStatisticSnapshotReadModel[];
  readonly manualReviews?: readonly ManualReviewReadModel[];
  readonly quarantines?: readonly QuarantineReadModel[];
  readonly recovery?: readonly RecoveryReadModel[];
  readonly telemetryEvents?: readonly TelemetryEventReadModel[];
  readonly telemetryMetrics?: readonly TelemetryMetricReadModel[];
  readonly predictions?: readonly PredictionEntity[];
  readonly parlays?: readonly ParlayEntity[];
  readonly validations?: readonly ValidationEntity[];
  readonly readiness?: PublicApiReadinessReadModel;
}

export function createOperationSnapshot(
  input: CreateOperationSnapshotInput = {},
): OperationSnapshot {
  const generatedAt = input.generatedAt ?? "2026-04-15T01:00:00.000Z";
  const automationCycles = [...(input.automationCycles ?? [])];
  const fixtures = [...(input.fixtures ?? [])];
  const fixtureResearch = [...(input.fixtureResearch ?? [])];
  const fixtureWorkflows = [...(input.fixtureWorkflows ?? [])];
  const leagueCoveragePolicies = [...(input.leagueCoveragePolicies ?? [])];
  const teamCoveragePolicies = [...(input.teamCoveragePolicies ?? [])];
  const dailyAutomationPolicies = [...(input.dailyAutomationPolicies ?? [])];
  const auditEvents = [...(input.auditEvents ?? [])];
  const tasks = [...(input.tasks ?? [])].map(createTaskReadModel);
  const taskRuns = [...(input.taskRuns ?? [])];
  const rawBatches = [...(input.rawBatches ?? [])];
  const oddsSnapshots = [...(input.oddsSnapshots ?? [])];
  const fixtureStatisticSnapshots = [...(input.fixtureStatisticSnapshots ?? [])];
  const aiRuns = [...(input.aiRuns ?? [])];
  const providerStates = [...(input.providerStates ?? [])];
  const predictions = [...(input.predictions ?? [])];
  const parlays = [...(input.parlays ?? [])];
  const validations = [...(input.validations ?? [])];
  const manualReviews =
    input.manualReviews ??
    createManualReviewReadModels({
      automationCycles,
      tasks,
      taskRuns,
    });
  const quarantines =
    input.quarantines ??
    createQuarantineReadModels({
      automationCycles,
      tasks,
      taskRuns,
    });
  const recovery =
    input.recovery ??
    createRecoveryReadModels(automationCycles);
  const telemetryEvents = [...(input.telemetryEvents ?? [])];
  const telemetryMetrics = [...(input.telemetryMetrics ?? [])];
  const validationSummary = summarizeValidations(validations);

  return {
    generatedAt,
    automationCycles,
    fixtures,
    fixtureResearch,
    fixtureWorkflows,
    leagueCoveragePolicies,
    teamCoveragePolicies,
    dailyAutomationPolicies,
    auditEvents,
    tasks,
    taskRuns,
    aiRuns,
    providerStates,
    rawBatches,
    oddsSnapshots,
    fixtureStatisticSnapshots,
    manualReviews,
    quarantines,
    recovery,
    telemetryEvents,
    telemetryMetrics,
    predictions,
    parlays,
    validations,
    validationSummary,
    health: createHealthReport({
      generatedAt,
      fixtures,
      tasks,
      rawBatches,
      oddsSnapshots,
      predictions,
      parlays,
      validationSummary,
    }),
    readiness:
      input.readiness ??
      {
        generatedAt,
        status: "review",
        checks: [
          {
            name: "operational-policy",
            status: "review",
            detail: "Operational readiness has not been evaluated against live evidence yet.",
          },
        ],
        sandboxCertification: {
          total: 0,
          passed: 0,
          failed: 0,
          missing: 0,
          profiles: [],
        },
        promotionGates: {
          total: 0,
          blocked: 0,
          reviewRequired: 0,
          promotable: 0,
          profiles: [],
        },
      },
  };
}

export function createEmptyOperationSnapshot(
  input: {
    readonly generatedAt?: string;
    readonly readiness?: PublicApiReadinessReadModel;
  } = {},
): OperationSnapshot {
  return createOperationSnapshot({
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
    automationCycles: [],
    fixtures: [],
    fixtureResearch: [],
    fixtureWorkflows: [],
    leagueCoveragePolicies: [],
    teamCoveragePolicies: [],
    dailyAutomationPolicies: [],
    auditEvents: [],
    tasks: [],
    taskRuns: [],
    aiRuns: [],
    providerStates: [],
    rawBatches: [],
    oddsSnapshots: [],
    manualReviews: [],
    quarantines: [],
    recovery: [],
    telemetryEvents: [],
    telemetryMetrics: [],
    predictions: [],
    parlays: [],
    validations: [],
    ...(input.readiness ? { readiness: input.readiness } : {}),
  });
}

const stageDependencies: Readonly<Record<FixtureOpsStageNarrativeReadModel["stage"], readonly string[]>> = {
  ingestion: [],
  odds: ["ingestion"],
  enrichment: ["ingestion", "odds"],
  candidate: ["enrichment"],
  prediction: ["candidate"],
  parlay: ["prediction"],
  validation: ["prediction", "parlay"],
};

const stageTaskKinds: Readonly<
  Partial<Record<FixtureOpsStageNarrativeReadModel["stage"], readonly TaskEntity["kind"][]>>
> = {
  ingestion: ["fixture-ingestion"],
  odds: ["odds-ingestion"],
  prediction: ["prediction"],
  validation: ["validation"],
};

const operationalReadinessOrder: Readonly<Record<PublicApiReadinessStatus, number>> = {
  blocked: 0,
  review: 1,
  ready: 2,
};

const mergeReadinessStatus = (
  current: PublicApiReadinessStatus,
  next: PublicApiReadinessStatus,
): PublicApiReadinessStatus =>
  operationalReadinessOrder[next] < operationalReadinessOrder[current] ? next : current;

const toReadinessStatusFromPolicy = (
  policy: OperationalPolicyReport["status"],
): PublicApiReadinessStatus => {
  switch (policy) {
    case "blocked":
      return "blocked";
    case "degraded":
      return "review";
    default:
      return "ready";
  }
};

const toReadinessStatusFromHealth = (
  status: PublicApiHealthStatus,
): PublicApiReadinessStatus => (status === "ok" ? "ready" : "review");

const toReadinessStatusFromCertification = (
  status: SandboxCertificationReadModel["status"],
): PublicApiReadinessStatus => {
  switch (status) {
    case "passed":
      return "ready";
    case "missing":
      return "review";
    default:
      return "blocked";
  }
};

const toReadinessStatusFromPromotion = (
  status: SandboxPromotionReportReadModel["status"],
): PublicApiReadinessStatus => {
  switch (status) {
    case "blocked":
      return "blocked";
    case "review-required":
      return "review";
    default:
      return "ready";
  }
};

const buildFixtureOpsStageNarratives = (
  snapshot: OperationSnapshot,
  fixture: FixtureEntity,
  workflow: FixtureWorkflowEntity | undefined,
): readonly FixtureOpsStageNarrativeReadModel[] => {
  const taskRunsByTaskId = new Map<string, readonly TaskRunEntity[]>(
    snapshot.tasks.map((task) => [task.id, listTaskRunsByTaskId(snapshot, task.id)]),
  );

  return ([
    ["ingestion", workflow?.ingestionStatus ?? "pending"],
    ["odds", workflow?.oddsStatus ?? "pending"],
    ["enrichment", workflow?.enrichmentStatus ?? "pending"],
    ["candidate", workflow?.candidateStatus ?? "pending"],
    ["prediction", workflow?.predictionStatus ?? "pending"],
    ["parlay", workflow?.parlayStatus ?? "pending"],
    ["validation", workflow?.validationStatus ?? "pending"],
  ] as const).map(([stage, status]) => {
    const stageTasks = snapshot.tasks.filter((task) => {
      if (task.payload.fixtureId !== fixture.id) {
        return false;
      }

      const kinds = stageTaskKinds[stage];
      return kinds ? kinds.includes(task.kind) : false;
    });
    const stageTaskRuns = stageTasks.flatMap((task) => taskRunsByTaskId.get(task.id) ?? []);
    const failedTaskRun = sortByIsoDescending(
      stageTaskRuns.filter((taskRun) => taskRun.status === "failed"),
      (taskRun) => taskRun.finishedAt ?? taskRun.updatedAt,
    )[0];
    const latestTaskRun = sortByIsoDescending(
      stageTaskRuns,
      (taskRun) => taskRun.finishedAt ?? taskRun.updatedAt,
    )[0];
    const manualReviewRequired =
      stage === "candidate"
        ? workflow?.manualSelectionStatus === "selected"
        : stage === "prediction" || stage === "parlay"
          ? workflow?.selectionOverride === "force-include" ||
            workflow?.selectionOverride === "force-exclude"
          : false;

    return {
      stage,
      status,
      ...(status === "blocked" || status === "failed"
        ? { blockingReason: failedTaskRun?.error ?? workflow?.lastErrorMessage ?? "Stage is blocked by upstream failure." }
        : {}),
      ...(status === "skipped"
        ? { degradationReason: workflow?.lastErrorMessage ?? "Stage was skipped by operational policy." }
        : {}),
      retryCount: stageTaskRuns.filter((taskRun) => taskRun.status === "failed").length,
      ...(latestTaskRun ? { lastTaskRunId: latestTaskRun.id } : {}),
      manualReviewRequired,
      dependsOn: stageDependencies[stage],
    };
  });
};

const asAutomationCycleSummary = (
  value: unknown,
): AutomationCycleEntity["summary"] | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AutomationCycleEntity["summary"])
    : null;

const createTaskReadModel = (
  task: TaskEntity,
): TaskReadModel => {
  const optionalString = (value: unknown): string | undefined => asString(value) ?? undefined;
  const payload = asRecord(task.payload);
  const payloadMetadata = asRecord(payload?.metadata);
  const manifestId = optionalString(task.manifestId) ?? optionalString(payload?.manifestId);
  const workflowId = optionalString(task.workflowId) ?? optionalString(payload?.workflowId);
  const traceId = optionalString(task.traceId) ?? optionalString(payload?.traceId);
  const correlationId =
    optionalString(task.correlationId) ??
    optionalString(payload?.correlationId) ??
    optionalString(payloadMetadata?.correlationId);
  const source =
    optionalString(task.source) ??
    optionalString(payload?.source) ??
    optionalString(payloadMetadata?.source);

  return {
    ...task,
    ...(manifestId ? { manifestId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(source ? { source } : {}),
    ...(task.activeTaskRunId ? { activeTaskRunId: task.activeTaskRunId } : {}),
    ...(task.leaseOwner ? { leaseOwner: task.leaseOwner } : {}),
    ...(task.leaseExpiresAt ? { leaseExpiresAt: task.leaseExpiresAt } : {}),
    ...(task.claimedAt ? { claimedAt: task.claimedAt } : {}),
    ...(task.lastHeartbeatAt ? { lastHeartbeatAt: task.lastHeartbeatAt } : {}),
  };
};

const isRecoveryAutomationCycle = (cycle: AutomationCycleReadModel): boolean =>
  cycle.source === "hermes-recovery" || cycle.source === "recovery";

const getTaskFixtureId = (task: Pick<TaskEntity, "payload">): string | undefined =>
  typeof task.payload.fixtureId === "string" ? task.payload.fixtureId : undefined;

const listRecoveryCyclesNewestFirst = (
  cycles: readonly AutomationCycleReadModel[],
): AutomationCycleReadModel[] =>
  sortByIsoDescending(
    cycles.filter(isRecoveryAutomationCycle),
    (cycle) => cycle.completedAt ?? cycle.startedAt,
  );

const getRecoveryMetadataTaskIds = (
  metadata: Record<string, unknown>,
  key: string,
): readonly string[] => {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
};

const getLatestTaskRunForTask = (
  taskRuns: readonly TaskRunEntity[],
  taskId: string,
): TaskRunEntity | null =>
  sortByIsoDescending(
    taskRuns.filter((taskRun) => taskRun.taskId === taskId),
    (taskRun) => taskRun.finishedAt ?? taskRun.updatedAt,
  )[0] ?? null;

const getTaskIssueReason = (
  task: Pick<TaskEntity, "lastErrorMessage" | "attempts">,
  taskRun: TaskRunEntity | null,
): string =>
  task.lastErrorMessage ??
  taskRun?.error ??
  [...task.attempts].reverse().find((attempt) => typeof attempt.error === "string")?.error ??
  "Manual review required.";

const inferQueueIssueSource = (
  task: Pick<TaskEntity, "attempts" | "maxAttempts">,
  reason: string,
  recoveryCycleId: string | undefined,
): QueueIssueSource => {
  if (recoveryCycleId) {
    return "recovery";
  }

  if (/operator/i.test(reason)) {
    return "operator";
  }

  if (task.attempts.length >= task.maxAttempts) {
    return "runtime";
  }

  return "unknown";
};

const getLatestRecoveryCycleForTask = (
  cycles: readonly AutomationCycleReadModel[],
  taskId: string,
): AutomationCycleReadModel | null =>
  listRecoveryCyclesNewestFirst(cycles).find((cycle) => {
    if (cycle.taskIds.includes(taskId)) {
      return true;
    }

    return getRecoveryMetadataTaskIds(cycle.metadata, "manualReviewTaskIds").includes(taskId) ||
      getRecoveryMetadataTaskIds(cycle.metadata, "quarantinedTaskIds").includes(taskId) ||
      getRecoveryMetadataTaskIds(cycle.metadata, "redrivenTaskIds").includes(taskId) ||
      getRecoveryMetadataTaskIds(cycle.metadata, "expiredLeaseTaskIds").includes(taskId);
  }) ?? null;

const createManualReviewReadModels = (input: {
  readonly automationCycles: readonly AutomationCycleReadModel[];
  readonly tasks: readonly TaskReadModel[];
  readonly taskRuns: readonly TaskRunEntity[];
}): readonly ManualReviewReadModel[] => {
  const recoveryCycles = listRecoveryCyclesNewestFirst(input.automationCycles);

  return input.tasks
    .flatMap((task) => {
      const recoveryCycle =
        recoveryCycles.find((cycle) => getRecoveryMetadataTaskIds(cycle.metadata, "manualReviewTaskIds").includes(task.id)) ??
        null;
      const taskRun = getLatestTaskRunForTask(input.taskRuns, task.id);
      const fixtureId = getTaskFixtureId(task);
      const reason = getTaskIssueReason(task, taskRun);
      const source = inferQueueIssueSource(task, reason, recoveryCycle?.id);
      const required =
        recoveryCycle !== null ||
        (task.status === "quarantined" && (task.attempts.length >= task.maxAttempts || /manual review/i.test(reason)));
      if (!required) {
        return [];
      }

      return [
        {
          id: `manual-review:${task.id}`,
          taskId: task.id,
          taskKind: task.kind,
          taskStatus: task.status,
          ...(taskRun?.id ? { taskRunId: taskRun.id } : {}),
          ...(fixtureId ? { fixtureId } : {}),
          reason,
          source,
          requiredAt: taskRun?.finishedAt ?? task.updatedAt,
          ...(task.workflowId ? { workflowId: task.workflowId } : {}),
          ...(task.traceId ? { traceId: task.traceId } : {}),
          ...(task.correlationId ? { correlationId: task.correlationId } : {}),
          ...(recoveryCycle?.id ? { recoveryCycleId: recoveryCycle.id } : {}),
        } satisfies ManualReviewReadModel,
      ];
    })
    .sort((left, right) => right.requiredAt.localeCompare(left.requiredAt));
};

const createQuarantineReadModels = (input: {
  readonly automationCycles: readonly AutomationCycleReadModel[];
  readonly tasks: readonly TaskReadModel[];
  readonly taskRuns: readonly TaskRunEntity[];
}): readonly QuarantineReadModel[] => {
  return input.tasks
    .flatMap((task) => {
      if (task.status !== "quarantined") {
        return [];
      }

      const taskRun = getLatestTaskRunForTask(input.taskRuns, task.id);
      const recoveryCycle = getLatestRecoveryCycleForTask(input.automationCycles, task.id);
      const fixtureId = getTaskFixtureId(task);
      const reason = getTaskIssueReason(task, taskRun);
      const source = inferQueueIssueSource(task, reason, recoveryCycle?.id);

      return [
        {
          taskId: task.id,
          taskKind: task.kind,
          taskStatus: task.status,
          ...(taskRun?.id ? { taskRunId: taskRun.id } : {}),
          ...(fixtureId ? { fixtureId } : {}),
          reason,
          source,
          quarantinedAt: taskRun?.finishedAt ?? task.updatedAt,
          attempts: task.attempts.length,
          maxAttempts: task.maxAttempts,
          canRequeue: true,
          ...(task.workflowId ? { workflowId: task.workflowId } : {}),
          ...(task.traceId ? { traceId: task.traceId } : {}),
          ...(task.correlationId ? { correlationId: task.correlationId } : {}),
          ...(recoveryCycle?.id ? { recoveryCycleId: recoveryCycle.id } : {}),
          manualReviewRequired:
            Boolean(recoveryCycle && getRecoveryMetadataTaskIds(recoveryCycle.metadata, "manualReviewTaskIds").includes(task.id)) ||
            task.attempts.length >= task.maxAttempts,
        } satisfies QuarantineReadModel,
      ];
    })
    .sort((left, right) => right.quarantinedAt.localeCompare(left.quarantinedAt));
};

const normalizeRecoveryActions = (value: unknown): readonly RecoveryActionReadModel[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    const record = asRecord(candidate);
    const action = asString(record?.action);
    if (!record || !action) {
      return [];
    }

    const taskId = asString(record.taskId);
    const taskRunId = asString(record.taskRunId);
    const reason = asString(record.reason);
    const error = asString(record.error);
    const retryScheduledFor = asString(record.retryScheduledFor);
    const previousStatus = asString(record.previousStatus);

    return [
      {
        action,
        ...(taskId ? { taskId } : {}),
        ...(taskRunId ? { taskRunId } : {}),
        ...(reason ? { reason } : {}),
        ...(error ? { error } : {}),
        ...(retryScheduledFor ? { retryScheduledFor } : {}),
        ...(previousStatus ? { previousStatus } : {}),
      } satisfies RecoveryActionReadModel,
    ];
  });
};

const createRecoveryReadModels = (
  cycles: readonly AutomationCycleReadModel[],
): readonly RecoveryReadModel[] =>
  listRecoveryCyclesNewestFirst(cycles).map((cycle) => {
    const errors =
      Array.isArray(cycle.metadata.recoveryErrors)
        ? cycle.metadata.recoveryErrors.filter((candidate): candidate is string => typeof candidate === "string")
        : cycle.metadata.error && typeof cycle.metadata.error === "string"
          ? [cycle.metadata.error]
          : [];

    return {
      cycleId: cycle.id,
      source: cycle.source,
      status: cycle.status,
      leaseOwner: cycle.leaseOwner,
      startedAt: cycle.startedAt,
      ...(cycle.completedAt ? { completedAt: cycle.completedAt } : {}),
      expiredLeaseCount: cycle.summary.expiredLeaseCount ?? 0,
      recoveredLeaseCount: cycle.summary.recoveredLeaseCount ?? 0,
      renewedLeaseCount: cycle.summary.renewedLeaseCount ?? 0,
      redrivenTaskCount: cycle.summary.redrivenTaskCount ?? 0,
      quarantinedTaskCount: cycle.summary.quarantinedTaskCount ?? 0,
      manualReviewTaskCount: cycle.summary.manualReviewTaskCount ?? 0,
      affectedTaskIds: [...cycle.taskIds],
      affectedFixtureIds: [...cycle.fixtureIds],
      actions: normalizeRecoveryActions(cycle.metadata.recoveryActions),
      errors,
    } satisfies RecoveryReadModel;
  });

const createAutomationCycleReadModel = (
  cycle: AutomationCycleEntity,
): AutomationCycleReadModel => {
  const summary = asAutomationCycleSummary(cycle.summary);
  const stages = [...(summary?.stages ?? [])].map((stage) => ({
    stage: stage.stage,
    status: stage.status,
    taskIds: [...stage.taskIds],
    taskRunIds: [...stage.taskRunIds],
    retryCount: stage.retryCount,
    ...(stage.startedAt ? { startedAt: stage.startedAt } : {}),
    ...(stage.completedAt ? { completedAt: stage.completedAt } : {}),
    ...(stage.error ? { error: stage.error } : {}),
  }));
  const readModelStatus =
    cycle.status === "failed"
      ? "failed"
      : stages.some((stage) => stage.status === "blocked" || stage.status === "degraded")
        ? "degraded"
        : cycle.status;
  const counts = summary?.counts ?? {};

  return {
    id: cycle.id,
    leaseOwner: cycle.leaseOwner,
    source: summary?.source ?? cycle.kind,
    status: readModelStatus,
    startedAt: cycle.startedAt,
    ...(cycle.finishedAt ? { completedAt: cycle.finishedAt } : {}),
    fixtureIds: [...(summary?.fixtureIds ?? [])],
    taskIds: [...(summary?.taskIds ?? [])],
    ...(summary?.validationTaskId ? { validationTaskId: summary.validationTaskId } : {}),
    stages,
    summary: {
      researchTaskCount: typeof counts.researchTaskCount === "number" ? counts.researchTaskCount : 0,
      predictionTaskCount: typeof counts.predictionTaskCount === "number" ? counts.predictionTaskCount : 0,
      parlayCount: typeof counts.parlayCount === "number" ? counts.parlayCount : 0,
      validationTaskCount: typeof counts.validationTaskCount === "number" ? counts.validationTaskCount : 0,
      ...(typeof counts.expiredLeaseCount === "number" ? { expiredLeaseCount: counts.expiredLeaseCount } : {}),
      ...(typeof counts.recoveredLeaseCount === "number" ? { recoveredLeaseCount: counts.recoveredLeaseCount } : {}),
      ...(typeof counts.renewedLeaseCount === "number" ? { renewedLeaseCount: counts.renewedLeaseCount } : {}),
      ...(typeof counts.redrivenTaskCount === "number" ? { redrivenTaskCount: counts.redrivenTaskCount } : {}),
      ...(typeof counts.quarantinedTaskCount === "number"
        ? { quarantinedTaskCount: counts.quarantinedTaskCount }
        : {}),
      ...(typeof counts.manualReviewTaskCount === "number"
        ? { manualReviewTaskCount: counts.manualReviewTaskCount }
        : {}),
    },
    metadata: { ...(cycle.metadata ?? {}) },
  };
};

const createReadinessReadModel = (
  snapshot: Pick<OperationSnapshot, "generatedAt" | "health"> & {
    readonly operationalSummary?: OperationalSummary;
  },
  certifications: readonly SandboxCertificationReadModel[] = [],
): PublicApiReadinessReadModel => {
  const operationalSummary =
    snapshot.operationalSummary ??
    ("tasks" in snapshot
      ? createOperationalSummary(snapshot as OperationSnapshot)
      : undefined);
  const policyStatus = operationalSummary?.policy.status ?? "degraded";
  const checks: PublicApiReadinessCheckReadModel[] = [
    {
      name: "health",
      status: toReadinessStatusFromHealth(snapshot.health.status),
      detail: snapshot.health.checks.map((check) => `${check.name}:${check.status}`).join(" | ") || "No health checks reported.",
    },
    {
      name: "operational-policy",
      status: toReadinessStatusFromPolicy(policyStatus),
      detail: operationalSummary?.policy.summary ?? "No operational policy summary available.",
    },
  ];

  const certificationProfiles = certifications.map((certification) => ({
    id: certification.id,
    status: toReadinessStatusFromCertification(certification.status),
    sourceStatus: certification.status,
    ...(certification.generatedAt ? { generatedAt: certification.generatedAt } : {}),
  }));
  const certificationCheckStatus =
    certificationProfiles.length === 0
      ? "review"
      : certificationProfiles.some((profile) => profile.status === "blocked")
        ? "blocked"
        : certificationProfiles.some((profile) => profile.status === "review")
          ? "review"
          : "ready";

  checks.push({
    name: "sandbox-certification",
    status: certificationCheckStatus,
    detail:
      certificationProfiles.length === 0
        ? "No sandbox certification evidence loaded."
        : certificationProfiles
            .map((profile) => `${profile.id}:${profile.sourceStatus}`)
            .join(" | "),
  });

  const promotionProfiles = certifications.flatMap((certification) => {
    if (!certification.promotion) {
      return [];
    }

    return [
      {
        id: certification.id,
        status: toReadinessStatusFromPromotion(certification.promotion.status),
        sourceStatus: certification.promotion.status,
        ...(certification.generatedAt ? { generatedAt: certification.generatedAt } : {}),
      },
    ];
  });
  const promotionCheckStatus =
    promotionProfiles.length === 0
      ? "review"
      : promotionProfiles.some((profile) => profile.status === "blocked")
        ? "blocked"
        : promotionProfiles.some((profile) => profile.status === "review")
          ? "review"
          : "ready";

  checks.push({
    name: "promotion-gates",
    status: promotionCheckStatus,
    detail:
      promotionProfiles.length === 0
        ? "No sandbox promotion gate evidence loaded."
        : promotionProfiles
            .map((profile) => `${profile.id}:${profile.sourceStatus}`)
            .join(" | "),
  });

  const overallStatus = checks.reduce<PublicApiReadinessStatus>(
    (status, check) => mergeReadinessStatus(status, check.status),
    "ready",
  );

  return {
    generatedAt: snapshot.generatedAt,
    status: overallStatus,
    checks,
    sandboxCertification: {
      total: certificationProfiles.length,
      passed: certifications.filter((certification) => certification.status === "passed").length,
      failed: certifications.filter((certification) => certification.status === "failed").length,
      missing: certifications.filter((certification) => certification.status === "missing").length,
      profiles: certificationProfiles,
    },
    promotionGates: {
      total: promotionProfiles.length,
      blocked: promotionProfiles.filter((profile) => profile.sourceStatus === "blocked").length,
      reviewRequired: promotionProfiles.filter((profile) => profile.sourceStatus === "review-required").length,
      promotable: promotionProfiles.filter((profile) => profile.sourceStatus === "promotable").length,
      profiles: promotionProfiles,
    },
  };
};

const withReadiness = (
  snapshot: OperationSnapshot,
  certifications: readonly SandboxCertificationReadModel[] = [],
): OperationSnapshot => ({
  ...snapshot,
  readiness: createReadinessReadModel(snapshot, certifications),
});

export function createPublicApiHandlers(
  snapshot: OperationSnapshot = createEmptyOperationSnapshot(),
): PublicApiHandlers {
  return {
    automationCycles: () => listAutomationCycles(snapshot),
    automationCycleById: (cycleId: string) => findAutomationCycleById(snapshot, cycleId),
    fixtures: () => listFixtures(snapshot),
    fixtureById: (fixtureId: string) => findFixtureById(snapshot, fixtureId),
    fixtureOpsById: (fixtureId: string) => findFixtureOpsById(snapshot, fixtureId),
    fixtureAuditEventsById: (fixtureId: string) => findFixtureAuditEventsById(snapshot, fixtureId),
    leagueCoveragePolicies: () => listLeagueCoveragePolicies(snapshot),
    teamCoveragePolicies: () => listTeamCoveragePolicies(snapshot),
    dailyAutomationPolicy: () => getDailyAutomationPolicy(snapshot),
    coverageDailyScope: () => listCoverageDailyScope(snapshot),
    tasks: () => listTasks(snapshot),
    taskById: (taskId: string) => findTaskById(snapshot, taskId),
    taskRuns: () => listTaskRuns(snapshot),
    taskRunById: (taskRunId: string) => findTaskRunById(snapshot, taskRunId),
    taskRunsByTaskId: (taskId: string) => listTaskRunsByTaskId(snapshot, taskId),
    manualReviews: () => listManualReviews(snapshot),
    quarantines: () => listQuarantines(snapshot),
    recovery: () => listRecovery(snapshot),
    liveIngestionRuns: () => listLiveIngestionRuns(snapshot),
    liveIngestionRunByTaskId: (taskId: string) => findLiveIngestionRunByTaskId(snapshot, taskId),
    aiRuns: () => listAiRuns(snapshot),
    aiRunById: (aiRunId: string) => findAiRunById(snapshot, aiRunId),
    providerStates: () => listProviderStates(snapshot),
    providerStateByProvider: (provider: string) => findProviderStateByProvider(snapshot, provider),
    rawBatches: () => listRawBatches(snapshot),
    oddsSnapshots: () => listOddsSnapshots(snapshot),
    telemetryEvents: () => listTelemetryEvents(snapshot),
    telemetryMetrics: () => listTelemetryMetrics(snapshot),
    operationalSummary: () => createOperationalSummary(snapshot),
    operationalLogs: () => listOperationalLogs(snapshot),
    predictions: () => listPredictions(snapshot),
    predictionById: (predictionId: string) => findPredictionById(snapshot, predictionId),
    parlays: () => listParlays(snapshot),
    parlayById: (parlayId: string) => findParlayById(snapshot, parlayId),
    validations: () => listValidations(snapshot),
    validationById: (validationId: string) => findValidationById(snapshot, validationId),
    validationSummary: () => getValidationSummary(snapshot),
    health: () => getHealth(snapshot),
    readiness: () => snapshot.readiness,
    snapshot: () => snapshot,
  };
}

export function routePublicApiRequest(
  handlers: PublicApiHandlers,
  requestPath: string,
): PublicApiResponse {
  const normalizedPath = normalizeRequestPath(requestPath);
  const searchParams = getRequestSearchParams(requestPath);
  const automationCycleDetail = matchAutomationCycleDetailPath(normalizedPath);
  if (automationCycleDetail) {
    const automationCycle = handlers.automationCycleById(automationCycleDetail.cycleId);
    if (!automationCycle) {
      return createResourceNotFoundResponse("automation-cycle", automationCycleDetail.cycleId);
    }

    return { status: 200, body: automationCycle };
  }

  const fixtureDetail = matchFixtureDetailPath(normalizedPath);
  const fixtureOpsDetail = matchFixtureOpsDetailPath(normalizedPath);
  const fixtureAuditEventsDetail = matchFixtureAuditEventsPath(normalizedPath);
  if (fixtureAuditEventsDetail) {
    const fixtureAuditEvents = handlers.fixtureAuditEventsById(fixtureAuditEventsDetail.fixtureId);
    if (!fixtureAuditEvents) {
      return createResourceNotFoundResponse("fixture", fixtureAuditEventsDetail.fixtureId);
    }

    return { status: 200, body: fixtureAuditEvents };
  }
  if (fixtureOpsDetail) {
    const fixtureOps = handlers.fixtureOpsById(fixtureOpsDetail.fixtureId);
    if (!fixtureOps) {
      return createResourceNotFoundResponse("fixture", fixtureOpsDetail.fixtureId);
    }

    return { status: 200, body: fixtureOps };
  }

  if (fixtureDetail) {
    const fixture = handlers.fixtureById(fixtureDetail.fixtureId);
    if (!fixture) {
      return createResourceNotFoundResponse("fixture", fixtureDetail.fixtureId);
    }

    return { status: 200, body: fixture };
  }

  const taskDetail = matchTaskDetailPath(normalizedPath);
  if (taskDetail) {
    const task = handlers.taskById(taskDetail.taskId);
    if (!task) {
      return createResourceNotFoundResponse("task", taskDetail.taskId);
    }

    return { status: 200, body: task };
  }

  const taskRunDetail = matchTaskRunDetailPath(normalizedPath);
  if (taskRunDetail) {
    const taskRun = handlers.taskRunById(taskRunDetail.taskRunId);
    if (!taskRun) {
      return createResourceNotFoundResponse("task-run", taskRunDetail.taskRunId);
    }

    return { status: 200, body: taskRun };
  }

  const liveIngestionRunDetail = matchLiveIngestionRunDetailPath(normalizedPath);
  if (liveIngestionRunDetail) {
    const liveIngestionRun = handlers.liveIngestionRunByTaskId(liveIngestionRunDetail.taskId);
    if (!liveIngestionRun) {
      return createResourceNotFoundResponse("live-ingestion-run", liveIngestionRunDetail.taskId);
    }

    return { status: 200, body: liveIngestionRun };
  }

  const aiRunDetail = matchAiRunDetailPath(normalizedPath);
  if (aiRunDetail) {
    const aiRun = handlers.aiRunById(aiRunDetail.aiRunId);
    if (!aiRun) {
      return createResourceNotFoundResponse("ai-run", aiRunDetail.aiRunId);
    }

    return { status: 200, body: aiRun };
  }

  const providerStateDetail = matchProviderStateDetailPath(normalizedPath);
  if (providerStateDetail) {
    const providerState = handlers.providerStateByProvider(providerStateDetail.provider);
    if (!providerState) {
      return createResourceNotFoundResponse("provider-state", providerStateDetail.provider);
    }

    return { status: 200, body: providerState };
  }

  const taskRunsByTask = matchTaskRunsByTaskPath(normalizedPath);
  if (taskRunsByTask) {
    return { status: 200, body: handlers.taskRunsByTaskId(taskRunsByTask.taskId) };
  }

  const predictionDetail = matchPredictionDetailPath(normalizedPath);
  if (predictionDetail) {
    const prediction = handlers.predictionById(predictionDetail.predictionId);
    if (!prediction) {
      return createResourceNotFoundResponse("prediction", predictionDetail.predictionId);
    }

    return { status: 200, body: prediction };
  }

  const parlayDetail = matchParlayDetailPath(normalizedPath);
  if (parlayDetail) {
    const parlay = handlers.parlayById(parlayDetail.parlayId);
    if (!parlay) {
      return createResourceNotFoundResponse("parlay", parlayDetail.parlayId);
    }

    return { status: 200, body: parlay };
  }

  const validationDetail = matchValidationDetailPath(normalizedPath);
  if (validationDetail) {
    const validation = handlers.validationById(validationDetail.validationId);
    if (!validation) {
      return createResourceNotFoundResponse("validation", validationDetail.validationId);
    }

    return { status: 200, body: validation };
  }

  switch (normalizedPath) {
    case publicApiEndpointPaths.automationCycles:
      return { status: 200, body: handlers.automationCycles() };
    case publicApiEndpointPaths.fixtures:
      return { status: 200, body: handlers.fixtures() };
    case publicApiEndpointPaths.tasks: {
      const taskStatus = searchParams.get("status");
      if (taskStatus === null) {
        return { status: 200, body: handlers.tasks() };
      }

      if (!isTaskStatus(taskStatus)) {
        return {
          status: 400,
          body: {
            error: "invalid_query_parameter",
            parameter: "status",
            allowedValues: allowedTaskStatuses,
          },
        };
      }

      return {
        status: 200,
        body: handlers.tasks().filter((task) => task.status === taskStatus),
      };
    }
    case publicApiEndpointPaths.taskRuns:
      return { status: 200, body: handlers.taskRuns() };
    case publicApiEndpointPaths.manualReview:
      return { status: 200, body: handlers.manualReviews() };
    case publicApiEndpointPaths.quarantines:
      return { status: 200, body: handlers.quarantines() };
    case publicApiEndpointPaths.recovery:
      return { status: 200, body: handlers.recovery() };
    case publicApiEndpointPaths.liveIngestionRuns:
      return { status: 200, body: handlers.liveIngestionRuns() };
    case publicApiEndpointPaths.aiRuns:
      return { status: 200, body: handlers.aiRuns() };
    case publicApiEndpointPaths.providerStates:
      return { status: 200, body: handlers.providerStates() };
    case publicApiEndpointPaths.rawBatches:
      return { status: 200, body: handlers.rawBatches() };
    case publicApiEndpointPaths.oddsSnapshots:
      return { status: 200, body: handlers.oddsSnapshots() };
    case publicApiEndpointPaths.telemetryEvents:
      return { status: 200, body: handlers.telemetryEvents() };
    case publicApiEndpointPaths.telemetryMetrics:
      return { status: 200, body: handlers.telemetryMetrics() };
    case publicApiEndpointPaths.operationalSummary:
      return { status: 200, body: handlers.operationalSummary() };
    case publicApiEndpointPaths.operationalLogs:
      return { status: 200, body: handlers.operationalLogs() };
    case publicApiEndpointPaths.coverageLeagues:
      return { status: 200, body: handlers.leagueCoveragePolicies() };
    case publicApiEndpointPaths.coverageTeams:
      return { status: 200, body: handlers.teamCoveragePolicies() };
    case publicApiEndpointPaths.coverageDailyPolicy: {
      const dailyPolicy = handlers.dailyAutomationPolicy();
      return dailyPolicy
        ? { status: 200, body: dailyPolicy }
        : createResourceNotFoundResponse("daily-automation-policy", "default");
    }
    case publicApiEndpointPaths.coverageDailyScope:
      return { status: 200, body: handlers.coverageDailyScope() };
    case publicApiEndpointPaths.predictions:
      return { status: 200, body: handlers.predictions() };
    case publicApiEndpointPaths.parlays:
      return { status: 200, body: handlers.parlays() };
    case publicApiEndpointPaths.validations:
      return { status: 200, body: handlers.validations() };
    case publicApiEndpointPaths.validationSummary:
      return { status: 200, body: handlers.validationSummary() };
    case publicApiEndpointPaths.health:
      return { status: 200, body: handlers.health() };
    case publicApiEndpointPaths.readiness:
      return { status: 200, body: handlers.readiness() };
    case publicApiEndpointPaths.snapshot:
      return { status: 200, body: handlers.snapshot() };
    default:
      return {
        status: 404,
        body: {
          error: "not_found",
          message: `Unknown public API path: ${requestPath}`,
          availablePaths: Object.values(publicApiEndpointPaths),
        },
      };
  }
}

const PUBLIC_API_DEFAULT_GOLDENS_ROOT = "fixtures/replays/goldens";
const PUBLIC_API_DEFAULT_SANDBOX_ARTIFACTS_ROOT = ".artifacts/sandbox-certification";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const resolveSandboxCertificationSources = (
  options: PublicApiSandboxCertificationSourceOptions | undefined,
): {
  readonly goldensRoot: string;
  readonly artifactsRoot: string;
} => ({
  goldensRoot: resolve(options?.goldensRoot ?? PUBLIC_API_DEFAULT_GOLDENS_ROOT),
  artifactsRoot: resolve(options?.artifactsRoot ?? PUBLIC_API_DEFAULT_SANDBOX_ARTIFACTS_ROOT),
});

const listJsonFilesRecursive = async (directory: string): Promise<readonly string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listJsonFilesRecursive(absolutePath)));
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(absolutePath);
      }
    }

    return files.sort();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
};

const normalizeSandboxCertificationVerificationKind = (
  value: string | null | undefined,
): SandboxCertificationVerificationKind | null => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "synthetic-integrity" || normalized === "synthetic_integrity") {
    return "synthetic-integrity";
  }

  if (normalized === "runtime-release" || normalized === "runtime_release") {
    return "runtime-release";
  }

  return null;
};

const normalizeSandboxCertificationRunStatus = (
  value: string | null | undefined,
): SandboxCertificationRunStatus | null => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "passed" || normalized === "failed" ? normalized : null;
};

const normalizeSandboxCertificationPromotionStatus = (
  value: string | null | undefined,
): SandboxCertificationPromotionStatus | null => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "blocked" || normalized === "review-required" || normalized === "promotable") {
    return normalized;
  }

  if (normalized === "review_required") {
    return "review-required";
  }

  return null;
};

const normalizeOperationalTelemetrySeverity = (
  value: string | null | undefined,
): OperationalTelemetrySeverity | null => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error"
    ? normalized
    : null;
};

const normalizeOperationalMetricType = (
  value: string | null | undefined,
): OperationalMetricType | null => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "counter" || normalized === "gauge" || normalized === "histogram"
    ? normalized
    : null;
};

const isWithinIsoWindow = (
  value: string | undefined,
  searchParams: URLSearchParams,
  bounds: {
    readonly fromParam?: string;
    readonly toParam?: string;
  } = {},
): boolean => {
  if (!value) {
    return true;
  }

  const from = searchParams.get(bounds.fromParam ?? "from");
  if (from && value < from) {
    return false;
  }

  const to = searchParams.get(bounds.toParam ?? "to");
  if (to && value > to) {
    return false;
  }

  return true;
};

const filterSandboxCertificationRuns = (
  runs: readonly SandboxCertificationRunReadModel[],
  searchParams: URLSearchParams,
): readonly SandboxCertificationRunReadModel[] => {
  const profileName = searchParams.get("profileName");
  const packId = searchParams.get("packId");
  const verificationKind = normalizeSandboxCertificationVerificationKind(
    searchParams.get("verificationKind"),
  );
  const status = normalizeSandboxCertificationRunStatus(searchParams.get("status"));
  const limit = parseQueryLimit(searchParams.get("limit"));

  return runs.filter((run) => {
    if (profileName && run.profileName !== profileName) {
      return false;
    }

    if (packId && run.packId !== packId) {
      return false;
    }

    if (verificationKind && run.verificationKind !== verificationKind) {
      return false;
    }

    if (status && run.status !== status) {
      return false;
    }

    return isWithinIsoWindow(run.generatedAt, searchParams, {
      fromParam: "generatedFrom",
      toParam: "generatedTo",
    });
  }).slice(0, limit);
};

const findSandboxCertificationRunById = (
  runs: readonly SandboxCertificationRunReadModel[],
  runId: string,
): SandboxCertificationRunReadModel | null =>
  runs.find((run) => run.id === runId) ?? null;

const toSandboxCertificationPromotionDecisionReadModel = (
  auditEvent: AuditEventEntity,
): SandboxCertificationPromotionDecisionReadModel | null => {
  if (
    auditEvent.aggregateType !== "sandbox-certification-run" ||
    auditEvent.eventType !== SANDBOX_CERTIFICATION_PROMOTION_DECISION_EVENT_TYPE
  ) {
    return null;
  }

  const decision = asString(auditEvent.payload.decision);
  if (decision !== "approved" && decision !== "rejected") {
    return null;
  }

  const reason = asString(auditEvent.payload.reason);
  if (!reason) {
    return null;
  }

  return {
    decision,
    reason,
    evidenceRefs: asStringArray(auditEvent.payload.evidenceRefs),
    ...(auditEvent.actor ? { actor: auditEvent.actor } : {}),
    ...(auditEvent.actorType ? { actorType: auditEvent.actorType } : {}),
    occurredAt: auditEvent.occurredAt,
  };
};

const listSandboxCertificationPromotionDecisions = (
  auditEvents: readonly AuditEventEntity[],
  runId: string,
): readonly SandboxCertificationPromotionDecisionReadModel[] =>
  sortByIsoDescending(
    auditEvents.flatMap((auditEvent) => {
      if (
        auditEvent.aggregateType !== "sandbox-certification-run" ||
        auditEvent.aggregateId !== runId
      ) {
        return [];
      }

      const decision = toSandboxCertificationPromotionDecisionReadModel(auditEvent);
      return decision ? [decision] : [];
    }),
    (decision) => decision.occurredAt,
  );

const createStableFingerprint = (value: unknown): string =>
  `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;

const runtimeReleaseSnapshotObjectKeys = (
  role: RuntimeReleaseSnapshotRole,
): readonly string[] =>
  role === "baseline"
    ? ["baselineSnapshot", "baselineRuntimeSnapshot"]
    : ["candidateSnapshot", "candidateRuntimeSnapshot"];

const readNestedRecord = (
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): Record<string, unknown> | null => {
  let current: unknown = record;
  for (const key of keys) {
    const currentRecord = asRecord(current);
    if (!currentRecord) {
      return null;
    }
    current = currentRecord[key];
  }

  return asRecord(current);
};

const mapRuntimeReleaseSnapshotRecord = (
  record: Record<string, unknown>,
  fallback: {
    readonly role: RuntimeReleaseSnapshotRole;
    readonly run: SandboxCertificationRunReadModel;
    readonly source: RuntimeReleaseSnapshotSource;
  },
): RuntimeReleaseSnapshotReadModel => {
  const roleValue = readRecordString(record, "role", "snapshotRole", "kind", "type")?.trim().toLowerCase();
  const role =
    roleValue === "baseline" || roleValue === "candidate"
      ? roleValue
      : fallback.role;
  const runId = readRecordString(record, "runId", "sandboxCertificationRunId", "certificationRunId") ?? fallback.run.id;
  const metadata = readRecordObject(record, "metadata", "summary", "payload") ?? {};
  const ref =
    readRecordString(record, "ref", "gitRef", "sourceRef", "runtimeRef") ??
    (role === "baseline" ? fallback.run.baselineRef : fallback.run.candidateRef) ??
    fallback.run.gitSha;
  const fingerprint = readRecordString(record, "fingerprint", "snapshotFingerprint", "hash", "checksum");
  const generatedAt = readRecordIsoString(record, "generatedAt", "createdAt", "capturedAt");
  const artifactRef = readRecordString(record, "artifactRef", "artifactPath", "uri", "url");

  return {
    id: readRecordString(record, "id", "snapshotId") ?? `${runId}:${role}`,
    role,
    ref,
    source: fallback.source,
    runId,
    profileName:
      readRecordString(record, "profileName", "profile", "evidenceProfile") ??
      fallback.run.profileName,
    ...(fingerprint ? { fingerprint } : {}),
    ...(generatedAt ? { generatedAt } : {}),
    ...(artifactRef ? { artifactRef } : {}),
    metadata,
  };
};

const findRuntimeReleaseSnapshotRecord = (
  run: SandboxCertificationRunReadModel,
  role: RuntimeReleaseSnapshotRole,
): { readonly record: Record<string, unknown>; readonly source: RuntimeReleaseSnapshotSource } | null => {
  for (const key of runtimeReleaseSnapshotObjectKeys(role)) {
    const summaryRecord = asRecord(run.summary[key]);
    if (summaryRecord) {
      return { record: summaryRecord, source: "summary" };
    }

    const signalRecord = asRecord(run.runtimeSignals[key]);
    if (signalRecord) {
      return { record: signalRecord, source: "runtimeSignals" };
    }
  }

  const summarySnapshot =
    readNestedRecord(run.summary, "runtimeReleaseSnapshots", role) ??
    readNestedRecord(run.summary, "snapshots", role);
  if (summarySnapshot) {
    return { record: summarySnapshot, source: "summary" };
  }

  const runtimeSignalSnapshot =
    readNestedRecord(run.runtimeSignals, "runtimeReleaseSnapshots", role) ??
    readNestedRecord(run.runtimeSignals, "snapshots", role);
  if (runtimeSignalSnapshot) {
    return { record: runtimeSignalSnapshot, source: "runtimeSignals" };
  }

  return null;
};

const deriveRuntimeReleaseSnapshot = (
  run: SandboxCertificationRunReadModel,
  role: RuntimeReleaseSnapshotRole,
): RuntimeReleaseSnapshotReadModel | null => {
  if (run.verificationKind !== "runtime-release") {
    return null;
  }

  const snapshotRecord = findRuntimeReleaseSnapshotRecord(run, role);
  if (snapshotRecord) {
    return mapRuntimeReleaseSnapshotRecord(snapshotRecord.record, {
      role,
      run,
      source: snapshotRecord.source,
    });
  }

  const ref = role === "baseline" ? run.baselineRef : run.candidateRef;
  if (!ref) {
    return null;
  }

  return {
    id: `${run.id}:${role}`,
    role,
    ref,
    source: "derived",
    runId: run.id,
    profileName: run.profileName,
    metadata: {},
  };
};

const normalizeRuntimeReleaseCoverageStatus = (
  value: unknown,
  truncated: boolean | null,
): RuntimeReleaseCoverageStatus => {
  const normalized = asString(value)?.trim().toLowerCase();
  if (
    normalized === "complete" ||
    normalized === "partial" ||
    normalized === "truncated" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  if (truncated === true) {
    return "truncated";
  }

  return "unknown";
};

const normalizeRuntimeReleaseCoverageSections = (
  value: unknown,
): readonly RuntimeReleaseCoverageSectionReadModel[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const record = asRecord(entry);
      const name = asString(record?.name);
      if (!record || !name) {
        return [];
      }

      const observedCount = asNumber(record.observedCount ?? record.count ?? record.total);
      const limit = asNumber(record.limit ?? record.take);
      const truncated = asBoolean(record.truncated);
      return [
        {
          name,
          ...(observedCount !== null ? { observedCount } : {}),
          ...(limit !== null ? { limit } : {}),
          ...(truncated !== null ? { truncated } : {}),
        } satisfies RuntimeReleaseCoverageSectionReadModel,
      ];
    });
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record).flatMap(([name, entry]) => {
    const entryRecord = asRecord(entry);
    if (!entryRecord) {
      return [];
    }

    const observedCount = asNumber(entryRecord.observedCount ?? entryRecord.count ?? entryRecord.total);
    const limit = asNumber(entryRecord.limit ?? entryRecord.take);
    const truncated = asBoolean(entryRecord.truncated);
    return [
      {
        name,
        ...(observedCount !== null ? { observedCount } : {}),
        ...(limit !== null ? { limit } : {}),
        ...(truncated !== null ? { truncated } : {}),
      } satisfies RuntimeReleaseCoverageSectionReadModel,
    ];
  });
};

const normalizeRuntimeReleaseCoverageSummary = (
  run: SandboxCertificationRunReadModel,
): RuntimeReleaseCoverageSummaryReadModel | null => {
  if (run.verificationKind !== "runtime-release") {
    return null;
  }

  const coverageRecord =
    readRecordObject(run.summary, "coverageSummary", "coverage") ??
    readRecordObject(run.runtimeSignals, "coverageSummary", "coverage");
  if (coverageRecord) {
    const truncated = asBoolean(coverageRecord.truncated);
    const sections = normalizeRuntimeReleaseCoverageSections(coverageRecord.sections);
    return {
      status: normalizeRuntimeReleaseCoverageStatus(coverageRecord.status, truncated),
      truncated,
      sections,
      notes: asStringArray(coverageRecord.notes),
    };
  }

  const sections = ["automationCycles", "tasks", "taskRuns", "auditEvents"].flatMap((name) => {
    const signal = asRecord(run.runtimeSignals[name]);
    const observedCount = asNumber(signal?.total);
    return observedCount === null
      ? []
      : [
          {
            name,
            observedCount,
          } satisfies RuntimeReleaseCoverageSectionReadModel,
        ];
  });

  return {
    status: "unknown",
    truncated: null,
    sections,
    notes: ["Coverage and truncation were not reported by this runtime-release run."],
  };
};

const resolveRuntimeReleaseSnapshotDiffFingerprint = (
  run: SandboxCertificationRunReadModel,
  baselineSnapshot: RuntimeReleaseSnapshotReadModel | null,
  candidateSnapshot: RuntimeReleaseSnapshotReadModel | null,
): string | null => {
  if (run.verificationKind !== "runtime-release") {
    return null;
  }

  const explicit =
    asString(run.summary.snapshotDiffFingerprint) ??
    asString(run.summary.diffFingerprint) ??
    asString(run.runtimeSignals.snapshotDiffFingerprint) ??
    asString(run.runtimeSignals.diffFingerprint);
  if (explicit) {
    return explicit;
  }

  if (!baselineSnapshot && !candidateSnapshot && run.diffEntries.length === 0) {
    return null;
  }

  return createStableFingerprint({
    baselineFingerprint: baselineSnapshot?.fingerprint ?? null,
    baselineRef: baselineSnapshot?.ref ?? run.baselineRef ?? null,
    candidateFingerprint: candidateSnapshot?.fingerprint ?? null,
    candidateRef: candidateSnapshot?.ref ?? run.candidateRef ?? null,
    diffEntries: run.diffEntries,
  });
};

const selectRuntimeReleaseSnapshotsForRun = (
  snapshots: readonly RuntimeReleaseSnapshotReadModel[],
  run: SandboxCertificationRunReadModel,
): {
  readonly baselineSnapshot: RuntimeReleaseSnapshotReadModel | null;
  readonly candidateSnapshot: RuntimeReleaseSnapshotReadModel | null;
} => {
  const matchingSnapshots = snapshots.filter((snapshot) => !snapshot.runId || snapshot.runId === run.id);
  return {
    baselineSnapshot:
      matchingSnapshots.find((snapshot) => snapshot.role === "baseline") ??
      deriveRuntimeReleaseSnapshot(run, "baseline"),
    candidateSnapshot:
      matchingSnapshots.find((snapshot) => snapshot.role === "candidate") ??
      deriveRuntimeReleaseSnapshot(run, "candidate"),
  };
};

const createSandboxCertificationRunDetail = (
  run: SandboxCertificationRunReadModel,
  auditEvents: readonly AuditEventEntity[] = [],
  runtimeReleaseSnapshots: readonly RuntimeReleaseSnapshotReadModel[] = [],
): SandboxCertificationRunDetailReadModel => {
  const promotionDecisionHistory = listSandboxCertificationPromotionDecisions(auditEvents, run.id);
  const { baselineSnapshot, candidateSnapshot } = selectRuntimeReleaseSnapshotsForRun(
    runtimeReleaseSnapshots,
    run,
  );
  return {
    ...run,
    baselineSnapshot,
    candidateSnapshot,
    coverageSummary: normalizeRuntimeReleaseCoverageSummary(run),
    snapshotDiffFingerprint: resolveRuntimeReleaseSnapshotDiffFingerprint(
      run,
      baselineSnapshot,
      candidateSnapshot,
    ),
    latestPromotionDecision: promotionDecisionHistory[0] ?? null,
    promotionDecisionHistory,
  };
};

const filterTelemetryEvents = (
  events: readonly TelemetryEventReadModel[],
  searchParams: URLSearchParams,
): readonly TelemetryEventReadModel[] => {
  const traceId = searchParams.get("traceId");
  const taskId = searchParams.get("taskId");
  const automationCycleId = searchParams.get("automationCycleId");
  const severity = searchParams.get("severity");
  const name = searchParams.get("name");
  const limit = parseQueryLimit(searchParams.get("limit"));

  return events.filter((event) => {
    if (traceId && event.traceId !== traceId) {
      return false;
    }

    if (taskId && event.taskId !== taskId) {
      return false;
    }

    if (automationCycleId && event.automationCycleId !== automationCycleId) {
      return false;
    }

    if (severity && event.severity !== severity) {
      return false;
    }

    if (name && event.name !== name) {
      return false;
    }

    return isWithinIsoWindow(event.occurredAt, searchParams);
  }).slice(0, limit);
};

const filterTelemetryMetrics = (
  metrics: readonly TelemetryMetricReadModel[],
  searchParams: URLSearchParams,
): readonly TelemetryMetricReadModel[] => {
  const traceId = searchParams.get("traceId");
  const taskId = searchParams.get("taskId");
  const automationCycleId = searchParams.get("automationCycleId");
  const name = searchParams.get("name");
  const limit = parseQueryLimit(searchParams.get("limit"));

  return metrics.filter((metric) => {
    if (traceId && metric.traceId !== traceId) {
      return false;
    }

    if (taskId && metric.taskId !== taskId) {
      return false;
    }

    if (automationCycleId && metric.automationCycleId !== automationCycleId) {
      return false;
    }

    if (name && metric.name !== name) {
      return false;
    }

    return isWithinIsoWindow(metric.recordedAt, searchParams);
  }).slice(0, limit);
};

const toSandboxCertificationRunSummary = (
  run: SandboxCertificationRunReadModel,
): SandboxCertificationRunSummaryReadModel => ({
  id: run.id,
  verificationKind: run.verificationKind,
  status: run.status,
  ...(run.generatedAt ? { generatedAt: run.generatedAt } : {}),
  ...(run.promotionStatus ? { promotionStatus: run.promotionStatus } : {}),
  ...(run.gitSha ? { gitSha: run.gitSha } : {}),
  ...(run.baselineRef ? { baselineRef: run.baselineRef } : {}),
  ...(run.candidateRef ? { candidateRef: run.candidateRef } : {}),
  ...(run.goldenFingerprint ? { goldenFingerprint: run.goldenFingerprint } : {}),
  ...(run.evidenceFingerprint ? { evidenceFingerprint: run.evidenceFingerprint } : {}),
  ...(run.artifactRef ? { artifactRef: run.artifactRef } : {}),
  runtimeSignals: run.runtimeSignals,
  diffEntryCount: run.diffEntryCount,
  summary: run.summary,
});

const createSyntheticIntegrityRunSummary = (
  certification: Pick<
    SandboxCertificationReadModel,
    "id" | "status" | "generatedAt" | "diffEntryCount"
  >,
): SandboxCertificationRunSummaryReadModel => ({
  id: `${certification.id}:synthetic-integrity`,
  verificationKind: "synthetic-integrity",
  status: certification.status === "failed" ? "failed" : "passed",
  ...(certification.generatedAt ? { generatedAt: certification.generatedAt } : {}),
  diffEntryCount: certification.diffEntryCount,
  runtimeSignals: {},
  summary: {
    syntheticIntegrity:
      certification.status === "passed"
        ? "passed"
        : certification.status === "failed"
          ? "failed"
          : "missing",
  },
});

const indexSandboxCertificationRuns = (
  runs: readonly SandboxCertificationRunReadModel[],
): ReadonlyMap<string, {
  readonly latestSyntheticIntegrity: SandboxCertificationRunSummaryReadModel | null;
  readonly latestRuntimeRelease: SandboxCertificationRunSummaryReadModel | null;
}> => {
  const sortedRuns = sortByIsoDescending(
    runs,
    (run) => run.generatedAt ?? run.id,
  );
  const index = new Map<string, {
    latestSyntheticIntegrity: SandboxCertificationRunSummaryReadModel | null;
    latestRuntimeRelease: SandboxCertificationRunSummaryReadModel | null;
  }>();

  for (const run of sortedRuns) {
    const key = `${run.profileName}:${run.packId}`;
    const existing = index.get(key) ?? {
      latestSyntheticIntegrity: null,
      latestRuntimeRelease: null,
    };

    if (run.verificationKind === "synthetic-integrity" && existing.latestSyntheticIntegrity === null) {
      existing.latestSyntheticIntegrity = toSandboxCertificationRunSummary(run);
    }

    if (run.verificationKind === "runtime-release" && existing.latestRuntimeRelease === null) {
      existing.latestRuntimeRelease = toSandboxCertificationRunSummary(run);
    }

    index.set(key, existing);
  }

  return index;
};

const diffSandboxCertificationValues = (
  expected: unknown,
  actual: unknown,
  path: string,
): SandboxCertificationDiffEntryReadModel[] => {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const entries: SandboxCertificationDiffEntryReadModel[] = [];
    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index += 1) {
      const childPath = `${path}[${index}]`;
      if (index >= expected.length) {
        entries.push({ path: childPath, kind: "added", actual: actual[index] });
        continue;
      }
      if (index >= actual.length) {
        entries.push({ path: childPath, kind: "removed", expected: expected[index] });
        continue;
      }
      entries.push(...diffSandboxCertificationValues(expected[index], actual[index], childPath));
    }
    return entries;
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const entries: SandboxCertificationDiffEntryReadModel[] = [];
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      if (!(key in actual)) {
        entries.push({ path: childPath, kind: "removed", expected: expected[key] });
        continue;
      }
      if (!(key in expected)) {
        entries.push({ path: childPath, kind: "added", actual: actual[key] });
        continue;
      }
      entries.push(...diffSandboxCertificationValues(expected[key], actual[key], childPath));
    }
    return entries;
  }

  if (stableStringify(expected) !== stableStringify(actual)) {
    return [{ path, kind: "changed", expected, actual }];
  }

  return [];
};

const loadSandboxCertificationBundle = async (
  sources: {
    readonly goldensRoot: string;
    readonly artifactsRoot: string;
  },
  goldenPath: string,
  latestRuns: {
    readonly latestSyntheticIntegrity: SandboxCertificationRunSummaryReadModel | null;
    readonly latestRuntimeRelease: SandboxCertificationRunSummaryReadModel | null;
  } | null = null,
): Promise<SandboxCertificationDetailReadModel> => {
  const golden = JSON.parse(await readFile(goldenPath, "utf8")) as {
    readonly mode: string;
    readonly profileName: string;
    readonly fixturePackId: string;
    readonly assertions?: readonly string[];
    readonly stats?: {
      readonly fixtureCount?: number;
      readonly replayEventCount?: number;
    };
    readonly golden?: {
      readonly fingerprint?: string;
    };
    readonly safety?: {
      readonly allowedHosts?: readonly string[];
    };
    readonly providerModes?: Readonly<Record<string, string>>;
    readonly policy?: SandboxPolicyTraceReadModel;
    readonly promotion?: SandboxPromotionReportReadModel;
  };
  const profileName = golden.profileName;
  const packId = golden.fixturePackId;
  const artifactPath = join(sources.artifactsRoot, profileName, `${packId}.evidence.json`);

  let generatedAt: string | undefined;
  let evidenceFingerprint: string | undefined;
  let diffEntries: readonly SandboxCertificationDiffEntryReadModel[] = [];
  let status: SandboxCertificationReadModel["status"] = "missing";
  let evidenceSummaryPromotion: SandboxPromotionReportReadModel | undefined;
  let evidencePolicyTrace: SandboxPolicyTraceReadModel | undefined;

  try {
    const evidence = JSON.parse(await readFile(artifactPath, "utf8")) as {
      readonly generatedAt?: string;
      readonly goldenSnapshot?: unknown;
      readonly summary?: {
        readonly promotion?: SandboxPromotionReportReadModel;
        readonly providerModes?: Readonly<Record<string, string>>;
        readonly safety?: {
          readonly publishEnabled?: boolean;
          readonly allowedHosts?: readonly string[];
        };
        readonly policy?: SandboxPolicyTraceReadModel;
      };
    };
    generatedAt = evidence.generatedAt;
    evidenceFingerprint = stableStringify(evidence.goldenSnapshot);
    diffEntries = diffSandboxCertificationValues(golden, evidence.goldenSnapshot, "$");
    status = diffEntries.length === 0 ? "passed" : "failed";
    evidenceSummaryPromotion = evidence.summary?.promotion;
    evidencePolicyTrace = evidence.summary?.policy;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      status = "missing";
      diffEntries = [];
    } else {
      throw error;
    }
  }

  const goldenPolicyTrace =
    golden.policy ??
    (golden.providerModes
      ? {
          providerModes: golden.providerModes,
          sideEffects: [],
          capabilityAllowlist: [],
          memoryIsolation: {
            strategy: "unknown",
            namespaceRoot: "unknown",
            allowProductionMemory: false,
          },
          sessionIsolation: {
            strategy: "unknown",
            namespaceRoot: "unknown",
            allowSharedSessions: false,
          },
          skillPolicy: {
            mode: "allowlist",
            defaultDeny: true,
            enabledSkills: [],
          },
          secretsPolicy: {
            mode: "unknown",
            allowedSecretRefs: [],
            allowProductionCredentials: false,
          },
          requiresManualQa: false,
          publishEnabled: false,
          allowedHosts: golden.safety?.allowedHosts ?? [],
        }
      : undefined);
  const fallbackPromotion = golden.promotion;
  const promotion = (() => {
    const base = evidenceSummaryPromotion ?? fallbackPromotion;
    if (!base) {
      return undefined;
    }

    const gates: SandboxPromotionGateReadModel[] = base.gates.map((gate) => {
      if (gate.name !== "sandbox-certification") {
        return gate;
      }

      const gateStatus: SandboxPromotionGateReadModel["status"] =
        status === "passed" ? "pass" : status === "missing" ? "warn" : "block";

      return {
        ...gate,
        status: gateStatus,
        detail:
          status === "passed"
            ? "Certification evidence matches the tracked golden snapshot."
            : status === "missing"
              ? "Certification evidence is missing for this profile."
              : "Certification drift was detected against the tracked golden snapshot.",
      };
    });
    const sourceStatus: SandboxPromotionReportReadModel["status"] =
      status === "failed"
        ? "blocked"
        : status === "missing"
          ? "review-required"
          : gates.some((gate) => gate.status === "block")
            ? "blocked"
            : gates.some((gate) => gate.status === "warn")
              ? "review-required"
              : base.status;

    return {
      status: sourceStatus,
      summary:
        sourceStatus === "promotable"
          ? "Sandbox promotion evidence is promotable."
          : sourceStatus === "review-required"
            ? "Sandbox promotion evidence requires review before promotion."
            : "Sandbox promotion evidence is blocked until failing gates are cleared.",
      gates,
    } satisfies SandboxPromotionReportReadModel;
  })();
  const policyTrace = evidencePolicyTrace ?? goldenPolicyTrace;

  return {
    id: `${profileName}:${packId}`,
    profileName,
    packId,
    mode: golden.mode,
    status,
    ...(generatedAt ? { generatedAt } : {}),
    fixtureCount: golden.stats?.fixtureCount ?? 0,
    replayEventCount: golden.stats?.replayEventCount ?? 0,
    diffEntryCount: diffEntries.length,
    goldenFingerprint: golden.golden?.fingerprint ?? stableStringify(golden),
    ...(evidenceFingerprint ? { evidenceFingerprint } : {}),
    goldenPath,
    ...(status !== "missing" ? { artifactPath } : {}),
    latestSyntheticIntegrity:
      latestRuns?.latestSyntheticIntegrity ??
      (status === "missing"
        ? null
        : createSyntheticIntegrityRunSummary({
            id: `${profileName}:${packId}`,
            status,
            ...(generatedAt ? { generatedAt } : {}),
            diffEntryCount: diffEntries.length,
          })),
    latestRuntimeRelease: latestRuns?.latestRuntimeRelease ?? null,
    assertions: golden.assertions ?? [],
    allowedHosts: golden.safety?.allowedHosts ?? [],
    diffEntries,
    ...(promotion ? { promotion } : {}),
    ...(policyTrace ? { policyTrace } : {}),
  };
};

export const loadSandboxCertificationReadModels = async (
  options: PublicApiSandboxCertificationSourceOptions = {},
): Promise<readonly SandboxCertificationReadModel[]> => {
  const sources = resolveSandboxCertificationSources(options);
  const goldenPaths = await listJsonFilesRecursive(sources.goldensRoot);
  const latestRunsByCertification = indexSandboxCertificationRuns(options.persistedRuns ?? []);
  const certifications = await Promise.all(
    goldenPaths.map(async (goldenPath) => {
      const golden = JSON.parse(await readFile(goldenPath, "utf8")) as {
        readonly profileName: string;
        readonly fixturePackId: string;
      };
      return loadSandboxCertificationBundle(
        sources,
        goldenPath,
        latestRunsByCertification.get(`${golden.profileName}:${golden.fixturePackId}`) ?? null,
      );
    }),
  );

  return certifications.map((certification) => ({
    id: certification.id,
    profileName: certification.profileName,
    packId: certification.packId,
    mode: certification.mode,
    status: certification.status,
    ...(certification.generatedAt ? { generatedAt: certification.generatedAt } : {}),
    fixtureCount: certification.fixtureCount,
    replayEventCount: certification.replayEventCount,
    diffEntryCount: certification.diffEntryCount,
    goldenFingerprint: certification.goldenFingerprint,
    ...(certification.evidenceFingerprint ? { evidenceFingerprint: certification.evidenceFingerprint } : {}),
    goldenPath: certification.goldenPath,
    ...(certification.artifactPath ? { artifactPath: certification.artifactPath } : {}),
    ...(certification.promotion ? { promotion: certification.promotion } : {}),
    latestSyntheticIntegrity: certification.latestSyntheticIntegrity,
    latestRuntimeRelease: certification.latestRuntimeRelease,
  }));
};

export const loadSandboxCertificationRuns = async (
  options: PublicApiSandboxCertificationSourceOptions = {},
): Promise<readonly SandboxCertificationRunReadModel[]> =>
  sortByIsoDescending(
    [...(options.persistedRuns ?? [])],
    (run) => run.generatedAt ?? run.id,
  );

const loadSandboxCertificationRunsFromUnitOfWork = async (
  unitOfWork: Pick<StorageUnitOfWork, "sandboxCertificationRuns">,
  searchParams: URLSearchParams,
): Promise<readonly SandboxCertificationRunReadModel[]> => {
  const requestedLimit = parseQueryLimit(searchParams.get("limit"));
  const generatedFrom = searchParams.get("generatedFrom");
  const generatedTo = searchParams.get("generatedTo");
  const verificationKind = normalizeSandboxCertificationVerificationKind(
    searchParams.get("verificationKind"),
  );
  const status = normalizeSandboxCertificationRunStatus(searchParams.get("status"));
  const profileName = searchParams.get("profileName");
  const packId = searchParams.get("packId");
  const query = {
    ...(profileName ? { profileName } : {}),
    ...(packId ? { packId } : {}),
    ...(verificationKind ? { verificationKind } : {}),
    ...(status ? { status } : {}),
    limit:
      generatedFrom || generatedTo
        ? PUBLIC_API_MAX_QUERY_LIMIT
        : requestedLimit,
  } satisfies SandboxCertificationRunQuery;
  const rows = await unitOfWork.sandboxCertificationRuns.listByQuery(query);

  const filtered = filterSandboxCertificationRuns(
    sortByIsoDescending(
      rows.flatMap((row) => {
        const mapped = mapSandboxCertificationRunRecord(asRecord(row) ?? {});
        return mapped ? [mapped] : [];
      }),
      (run) => run.generatedAt ?? run.id,
    ),
    searchParams,
  );

  return filtered.slice(0, requestedLimit);
};

const loadTelemetryEventsFromUnitOfWork = async (
  unitOfWork: Pick<StorageUnitOfWork, "telemetryEvents">,
  searchParams: URLSearchParams,
): Promise<readonly TelemetryEventReadModel[]> => {
  const severity = normalizeOperationalTelemetrySeverity(searchParams.get("severity"));
  const traceId = searchParams.get("traceId");
  const taskId = searchParams.get("taskId");
  const taskRunId = searchParams.get("taskRunId");
  const automationCycleId = searchParams.get("automationCycleId");
  const name = searchParams.get("name");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const query = {
    ...(traceId ? { traceId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(taskRunId ? { taskRunId } : {}),
    ...(automationCycleId ? { automationCycleId } : {}),
    ...(severity ? { severity } : {}),
    ...(name ? { name } : {}),
    ...(from ? { occurredAfter: from } : {}),
    ...(to ? { occurredBefore: to } : {}),
    limit: parseQueryLimit(searchParams.get("limit")),
  } satisfies OperationalTelemetryEventQuery;
  const rows = await unitOfWork.telemetryEvents.listByQuery(query);

  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapTelemetryEventRecord(asRecord(row) ?? {});
      return mapped ? [mapped] : [];
    }),
    (event) => event.occurredAt,
  );
};

const loadTelemetryMetricsFromUnitOfWork = async (
  unitOfWork: Pick<StorageUnitOfWork, "metricSamples">,
  searchParams: URLSearchParams,
): Promise<readonly TelemetryMetricReadModel[]> => {
  const type = normalizeOperationalMetricType(searchParams.get("type"));
  const traceId = searchParams.get("traceId");
  const taskId = searchParams.get("taskId");
  const taskRunId = searchParams.get("taskRunId");
  const automationCycleId = searchParams.get("automationCycleId");
  const name = searchParams.get("name");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const query = {
    ...(traceId ? { traceId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(taskRunId ? { taskRunId } : {}),
    ...(automationCycleId ? { automationCycleId } : {}),
    ...(name ? { name } : {}),
    ...(type ? { type } : {}),
    ...(from ? { recordedAfter: from } : {}),
    ...(to ? { recordedBefore: to } : {}),
    limit: parseQueryLimit(searchParams.get("limit")),
  } satisfies OperationalMetricSampleQuery;
  const rows = await unitOfWork.metricSamples.listByQuery(query);

  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapTelemetryMetricRecord(asRecord(row) ?? {});
      return mapped ? [mapped] : [];
    }),
    (metric) => metric.recordedAt,
  );
};

export const loadSandboxCertificationDetail = async (
  profileName: string,
  packId: string,
  options: PublicApiSandboxCertificationSourceOptions = {},
): Promise<SandboxCertificationDetailReadModel | null> => {
  const sources = resolveSandboxCertificationSources(options);
  const goldenPath = join(sources.goldensRoot, profileName, `${packId}.json`);
  const latestRunsByCertification = indexSandboxCertificationRuns(options.persistedRuns ?? []);
  try {
    return await loadSandboxCertificationBundle(
      sources,
      goldenPath,
      latestRunsByCertification.get(`${profileName}:${packId}`) ?? null,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
};

const PUBLIC_API_DEFAULT_REALM = "gana-v8-public-api";

interface PublicApiAuthorizationOutcome {
  readonly actor?: AuthorizationActor;
  readonly denied?: PublicApiResponse;
  readonly headers?: Readonly<Record<string, string>>;
}

const firstDefinedValue = (...values: readonly (string | undefined)[]): string | undefined =>
  values.find((value) => value !== undefined && value.trim().length > 0);

const getSingleHeaderValue = (value: string | readonly string[] | undefined): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return undefined;
};

const readPublicApiAccessToken = (request: IncomingMessage): string | undefined => {
  const authorizationHeader = getSingleHeaderValue(request.headers.authorization);
  if (authorizationHeader) {
    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return firstDefinedValue(
    getSingleHeaderValue(request.headers["x-gana-api-token"]),
    getSingleHeaderValue(request.headers["x-operator-token"]),
  );
};

const createPublicApiUnauthorizedResponse = (
  realm: string,
  detail: string,
): Pick<PublicApiAuthorizationOutcome, "denied" | "headers"> => ({
  denied: {
    status: 401,
    body: {
      error: "unauthorized",
      message: detail,
    },
  },
  headers: {
    "www-authenticate": `Bearer realm="${realm}"`,
  },
});

export const createPublicApiTokenAuthentication = (input: {
  readonly viewerToken?: string;
  readonly operatorToken?: string;
  readonly automationToken?: string;
  readonly systemToken?: string;
  readonly realm?: string;
}): PublicApiAuthenticationOptions | undefined => {
  const credentials: PublicApiTokenCredential[] = [];

  if (input.viewerToken?.trim()) {
    credentials.push({
      token: input.viewerToken.trim(),
      actor: createAuthorizationActor({
        id: "public-api:viewer",
        role: "viewer",
        displayName: "Public API Viewer",
      }),
    });
  }

  if (input.operatorToken?.trim()) {
    credentials.push({
      token: input.operatorToken.trim(),
      actor: createAuthorizationActor({
        id: "public-api:operator",
        role: "operator",
        displayName: "Public API Operator",
      }),
    });
  }

  if (input.automationToken?.trim()) {
    credentials.push({
      token: input.automationToken.trim(),
      actor: createAuthorizationActor({
        id: "public-api:automation",
        role: "automation",
        displayName: "Public API Automation",
      }),
    });
  }

  if (input.systemToken?.trim()) {
    credentials.push({
      token: input.systemToken.trim(),
      actor: createAuthorizationActor({
        id: "public-api:system",
        role: "system",
        displayName: "Public API System",
      }),
    });
  }

  if (credentials.length === 0) {
    return undefined;
  }

  return {
    credentials,
    realm: input.realm ?? PUBLIC_API_DEFAULT_REALM,
  };
};

export const loadPublicApiTokenAuthenticationFromEnv = (
  options: { readonly env?: Readonly<Record<string, string | undefined>> } = {},
): PublicApiAuthenticationOptions | undefined => {
  const env = options.env ?? process.env;
  return createPublicApiTokenAuthentication({
    ...(env.GANA_PUBLIC_API_VIEWER_TOKEN ? { viewerToken: env.GANA_PUBLIC_API_VIEWER_TOKEN } : {}),
    ...(env.GANA_PUBLIC_API_OPERATOR_TOKEN ? { operatorToken: env.GANA_PUBLIC_API_OPERATOR_TOKEN } : {}),
    ...(env.GANA_PUBLIC_API_AUTOMATION_TOKEN ? { automationToken: env.GANA_PUBLIC_API_AUTOMATION_TOKEN } : {}),
    ...(env.GANA_PUBLIC_API_SYSTEM_TOKEN ? { systemToken: env.GANA_PUBLIC_API_SYSTEM_TOKEN } : {}),
    ...(env.GANA_PUBLIC_API_AUTH_REALM ? { realm: env.GANA_PUBLIC_API_AUTH_REALM } : {}),
  });
};

const getPublicApiWriteCapability = (requestPath: string): AuthorizationCapability => {
  const normalizedPath = normalizeRequestPath(requestPath);
  if (matchSandboxCertificationPromotionDecisionPath(normalizedPath)) {
    return "release:approve";
  }

  if (matchTaskRequeuePath(normalizedPath) || matchTaskQuarantinePath(normalizedPath)) {
    return "queue:operate";
  }

  return "workflow:override";
};

const createPublicApiForbiddenResponse = (
  actor: AuthorizationActor,
  capability: AuthorizationCapability,
): PublicApiAuthorizationOutcome => ({
  denied: {
    status: 403,
    body: {
      error: "forbidden",
      message: `Actor ${actor.id} lacks capability ${capability}`,
    },
  },
});

const isPrismaUnitOfWorkLike = (
  unitOfWork: StorageUnitOfWork,
): unitOfWork is StorageUnitOfWork & { readonly client: PrismaClientLike & PrismaQueueClientLike } => {
  const candidate = unitOfWork as StorageUnitOfWork & { readonly client?: PrismaClientLike & PrismaQueueClientLike };
  return typeof candidate.client?.$transaction === "function";
};

const resolvePublicApiQueueAdapter = (
  options: Pick<PublicApiHttpOptions, "queueAdapter" | "unitOfWork">,
): TaskQueueAdapter | undefined => {
  if (options.queueAdapter) {
    return options.queueAdapter;
  }

  if (!options.unitOfWork) {
    return undefined;
  }

  if (isPrismaUnitOfWorkLike(options.unitOfWork)) {
    return createPrismaTaskQueueAdapter(options.unitOfWork.client, options.unitOfWork, {
      createTransactionalUnitOfWork: (client) => createPrismaUnitOfWork(client as PrismaClientLike),
    });
  }

  return createInMemoryTaskQueueAdapter(options.unitOfWork);
};

const loadPublicApiSandboxCertificationSourcesFromEnv = (
  env: Readonly<Record<string, string | undefined>>,
): PublicApiSandboxCertificationSourceOptions => ({
  ...(env.GANA_SANDBOX_GOLDENS_ROOT ? { goldensRoot: env.GANA_SANDBOX_GOLDENS_ROOT } : {}),
  ...(env.GANA_SANDBOX_CERT_ARTIFACTS_ROOT ? { artifactsRoot: env.GANA_SANDBOX_CERT_ARTIFACTS_ROOT } : {}),
});

const withPersistedSandboxCertificationRuns = async (
  options: PublicApiSandboxCertificationSourceOptions | undefined,
  unitOfWork?: StorageUnitOfWork,
): Promise<PublicApiSandboxCertificationSourceOptions | undefined> => {
  if (options?.persistedRuns || !unitOfWork) {
    return options;
  }

  const repositoryRuns = await loadPersistedSandboxCertificationRunsFromRepositories(
    unitOfWork as StorageUnitOfWork & PersistedCertificationHistoryRepositoryCollectionLike,
  );
  const persistedRuns =
    repositoryRuns.length > 0
      ? repositoryRuns
      : isPrismaSnapshotUnitOfWorkLike(unitOfWork)
        ? await loadPersistedSandboxCertificationRunsFromPrisma(unitOfWork.client)
        : [];
  return {
    ...(options ?? {}),
    persistedRuns,
  };
};

const loadRuntimeReleaseSnapshotsForRun = async (
  run: SandboxCertificationRunReadModel,
  options: PublicApiSandboxCertificationSourceOptions | undefined,
  unitOfWork?: StorageUnitOfWork,
): Promise<readonly RuntimeReleaseSnapshotReadModel[]> => {
  if (run.verificationKind !== "runtime-release") {
    return [];
  }

  const optionSnapshots =
    options?.persistedRuntimeReleaseSnapshots?.filter((snapshot) => !snapshot.runId || snapshot.runId === run.id) ?? [];
  if (optionSnapshots.length > 0) {
    return optionSnapshots;
  }

  if (!unitOfWork) {
    return [];
  }

  const repositorySnapshots = await loadPersistedRuntimeReleaseSnapshotsFromRepositories(
    unitOfWork as StorageUnitOfWork & PersistedCertificationHistoryRepositoryCollectionLike,
    run,
  );
  if (repositorySnapshots.length > 0) {
    return repositorySnapshots;
  }

  return isPrismaSnapshotUnitOfWorkLike(unitOfWork)
    ? loadPersistedRuntimeReleaseSnapshotsFromPrisma(unitOfWork.client, run)
    : [];
};

export const authorizePublicApiRequest = (
  request: IncomingMessage,
  method: string,
  requestPath: string,
  authentication?: PublicApiAuthenticationOptions,
): PublicApiAuthorizationOutcome => {
  if (!authentication || authentication.credentials.length === 0) {
    return {};
  }

  const token = readPublicApiAccessToken(request);
  const realm = authentication.realm ?? PUBLIC_API_DEFAULT_REALM;
  if (!token) {
    return createPublicApiUnauthorizedResponse(realm, "A bearer token is required for this public API.");
  }

  const credential = authentication.credentials.find((candidate) => candidate.token === token);
  if (!credential) {
    return createPublicApiUnauthorizedResponse(realm, "The provided token is not authorized for this public API.");
  }

  if (method !== "GET" && method !== "HEAD") {
    const requiredCapability = getPublicApiWriteCapability(requestPath);
    if (!hasCapability(credential.actor, requiredCapability)) {
      return createPublicApiForbiddenResponse(credential.actor, requiredCapability);
    }
  }

  return { actor: credential.actor };
};

export function createPublicApiServer(
  options: PublicApiHttpOptions = {},
): Server {
  const queueAdapter = resolvePublicApiQueueAdapter(options);

  return createServer((request, response) => {
      void handlePublicApiRequest(request, response, {
        ...(options.handlers ? { handlers: options.handlers } : {}),
        ...(options.snapshot ? { snapshot: options.snapshot } : {}),
        ...(options.unitOfWork ? { unitOfWork: options.unitOfWork } : {}),
        ...(queueAdapter ? { queueAdapter } : {}),
        ...(options.sandboxCertification ? { sandboxCertification: options.sandboxCertification } : {}),
        ...(options.auth ? { auth: options.auth } : {}),
      }).catch((error: unknown) => {
        writeJsonResponse(response, 500, {
          error: "internal_error",
        message: error instanceof Error ? error.message : "Unexpected public API error",
      });
    });
  });
}

export async function handlePublicApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    readonly snapshot?: OperationSnapshot;
    readonly handlers?: PublicApiHandlers;
    readonly unitOfWork?: StorageUnitOfWork;
    readonly queueAdapter?: TaskQueueAdapter;
    readonly sandboxCertification?: PublicApiSandboxCertificationSourceOptions;
    readonly auth?: PublicApiAuthenticationOptions;
  } = {},
): Promise<void> {
  const method = request.method ?? "GET";
  const requestPath = request.url ?? "/";
  const normalizedRequestPath = normalizeRequestPath(requestPath);
  const searchParams = getRequestSearchParams(requestPath);
  const authorization = authorizePublicApiRequest(request, method, normalizedRequestPath, options.auth);

  if (authorization.denied) {
    writeJsonResponse(response, authorization.denied.status, authorization.denied.body, authorization.headers);
    return;
  }

  if (method === "GET") {
    const sandboxCertificationOptions = await withPersistedSandboxCertificationRuns(
      options.sandboxCertification,
      options.unitOfWork,
    );

    if (normalizedRequestPath === publicApiEndpointPaths.sandboxCertification) {
      writeJsonResponse(
        response,
        200,
        await loadSandboxCertificationReadModels(sandboxCertificationOptions),
      );
      return;
    }

    if (normalizedRequestPath === publicApiEndpointPaths.sandboxCertificationRuns) {
      const certificationRuns = options.unitOfWork
        ? await loadSandboxCertificationRunsFromUnitOfWork(options.unitOfWork, searchParams)
        : filterSandboxCertificationRuns(
            await loadSandboxCertificationRuns(sandboxCertificationOptions),
            searchParams,
          );
      writeJsonResponse(
        response,
        200,
        certificationRuns,
      );
      return;
    }

    const sandboxCertificationRunDetail = matchSandboxCertificationRunDetailPath(normalizedRequestPath);
    if (sandboxCertificationRunDetail) {
      const repositoryRun = options.unitOfWork
        ? mapSandboxCertificationRunRecord(
            asRecord(
              await options.unitOfWork.sandboxCertificationRuns.getById(
                sandboxCertificationRunDetail.runId,
              ),
            ) ?? {},
          )
        : null;
      const certificationRun =
        repositoryRun ??
        findSandboxCertificationRunById(
          await loadSandboxCertificationRuns(sandboxCertificationOptions),
          sandboxCertificationRunDetail.runId,
        );
      if (!certificationRun) {
        writeJsonResponse(response, 404, {
          error: "resource_not_found",
          resource: "sandbox-certification-run",
          resourceId: sandboxCertificationRunDetail.runId,
        });
        return;
      }

      const promotionDecisionAuditEvents = options.unitOfWork
        ? await options.unitOfWork.auditEvents.findByAggregate(
            "sandbox-certification-run",
            sandboxCertificationRunDetail.runId,
          )
        : (options.snapshot?.auditEvents ?? []).filter(
            (auditEvent) =>
              auditEvent.aggregateType === "sandbox-certification-run" &&
              auditEvent.aggregateId === sandboxCertificationRunDetail.runId,
          );
      const runtimeReleaseSnapshots = await loadRuntimeReleaseSnapshotsForRun(
        certificationRun,
        sandboxCertificationOptions,
        options.unitOfWork,
      );
      writeJsonResponse(
        response,
        200,
        createSandboxCertificationRunDetail(
          certificationRun,
          promotionDecisionAuditEvents,
          runtimeReleaseSnapshots,
        ),
      );
      return;
    }

    const sandboxCertificationDetail = matchSandboxCertificationDetailPath(normalizedRequestPath);
    if (sandboxCertificationDetail) {
      const certification = await loadSandboxCertificationDetail(
        sandboxCertificationDetail.profileName,
        sandboxCertificationDetail.packId,
        sandboxCertificationOptions,
      );
      if (!certification) {
        writeJsonResponse(response, 404, {
          error: "resource_not_found",
          resource: "sandbox-certification",
          resourceId: `${sandboxCertificationDetail.profileName}:${sandboxCertificationDetail.packId}`,
        });
        return;
      }

      writeJsonResponse(response, 200, certification);
      return;
    }

    const certifications = sandboxCertificationOptions
      ? await loadSandboxCertificationReadModels(sandboxCertificationOptions)
      : [];
    const handlers = options.unitOfWork
      ? createPublicApiHandlers(
          withReadiness(
            await loadOperationSnapshotFromUnitOfWork(options.unitOfWork),
            certifications,
          ),
        )
      : options.snapshot
        ? createPublicApiHandlers(withReadiness(options.snapshot, certifications))
        : options.handlers ?? createPublicApiHandlers(createEmptyOperationSnapshot());

    if (normalizedRequestPath === publicApiEndpointPaths.telemetryEvents) {
      const telemetryEvents = options.unitOfWork
        ? await loadTelemetryEventsFromUnitOfWork(options.unitOfWork, searchParams)
        : filterTelemetryEvents(handlers.telemetryEvents(), searchParams);
      writeJsonResponse(response, 200, telemetryEvents);
      return;
    }

    if (normalizedRequestPath === publicApiEndpointPaths.telemetryMetrics) {
      const telemetryMetrics = options.unitOfWork
        ? await loadTelemetryMetricsFromUnitOfWork(options.unitOfWork, searchParams)
        : filterTelemetryMetrics(handlers.telemetryMetrics(), searchParams);
      writeJsonResponse(response, 200, telemetryMetrics);
      return;
    }

    const routedResponse = routePublicApiRequest(handlers, requestPath);
    writeJsonResponse(response, routedResponse.status, routedResponse.body);
    return;
  }

  if (method === "POST" && options.unitOfWork) {
    const sandboxCertificationPromotionDecisionPath = matchSandboxCertificationPromotionDecisionPath(
      normalizedRequestPath,
    );
    if (sandboxCertificationPromotionDecisionPath) {
      const body = await readJsonRequestBody<SandboxCertificationPromotionDecisionInput>(request);
      if (body.decision !== "approved" && body.decision !== "rejected") {
        writeJsonResponse(response, 400, {
          error: "invalid_request_body",
          message: "Promotion decisions require decision=approved or decision=rejected.",
        });
        return;
      }
      if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
        writeJsonResponse(response, 400, {
          error: "invalid_request_body",
          message: "Promotion decisions require a non-empty reason.",
        });
        return;
      }
      if (!Array.isArray(body.evidenceRefs) || body.evidenceRefs.some((value) => typeof value !== "string")) {
        writeJsonResponse(response, 400, {
          error: "invalid_request_body",
          message: "Promotion decisions require evidenceRefs to be an array of strings.",
        });
        return;
      }

      const occurredAt = parseQueueActionOccurredAt(body.occurredAt);
      if (occurredAt === null) {
        writeJsonResponse(response, 400, {
          error: "invalid_request_body",
          message: "Promotion decisions require a valid ISO timestamp when occurredAt is provided.",
        });
        return;
      }

      const evidenceRefs = body.evidenceRefs
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      const certificationRun = mapSandboxCertificationRunRecord(
        asRecord(
          await options.unitOfWork.sandboxCertificationRuns.getById(
            sandboxCertificationPromotionDecisionPath.runId,
          ),
        ) ?? {},
      );
      if (!certificationRun) {
        writeJsonResponse(response, 404, {
          error: "resource_not_found",
          resource: "sandbox-certification-run",
          resourceId: sandboxCertificationPromotionDecisionPath.runId,
        });
        return;
      }

      if (certificationRun.verificationKind !== "runtime-release") {
        writeJsonResponse(response, 409, {
          error: "invalid_promotion_target",
          message: "Promotion decisions only apply to runtime-release certification runs.",
        });
        return;
      }

      if (certificationRun.profileName === "ci-ephemeral") {
        writeJsonResponse(response, 409, {
          error: "promotion_decision_forbidden",
          message: "ci-ephemeral runtime-release runs are not overrideable.",
        });
        return;
      }

      const decisionOccurredAt = occurredAt?.toISOString() ?? new Date().toISOString();
      const auditActorType = toAuditActorType(authorization.actor);
      const auditActorFields = {
        ...(authorization.actor?.id ? { actor: authorization.actor.id } : {}),
        ...(auditActorType ? { actorType: auditActorType } : {}),
      } satisfies Partial<Pick<AuditEventEntity, "actor" | "actorType">>;
      await options.unitOfWork.auditEvents.save(
        createAuditEvent({
          id: `audit:sandbox-certification-run:${certificationRun.id}:promotion-decision:${decisionOccurredAt}:${randomUUID()}`,
          aggregateType: "sandbox-certification-run",
          aggregateId: certificationRun.id,
          eventType: SANDBOX_CERTIFICATION_PROMOTION_DECISION_EVENT_TYPE,
          ...auditActorFields,
          subjectType: "sandbox-certification-run",
          subjectId: certificationRun.id,
          action: "promotion-decision",
          payload: {
            decision: body.decision,
            reason: body.reason.trim(),
            evidenceRefs,
            verificationKind: certificationRun.verificationKind,
            profileName: certificationRun.profileName,
            packId: certificationRun.packId,
            gitSha: certificationRun.gitSha,
            promotionStatus: certificationRun.promotionStatus ?? null,
          },
          occurredAt: decisionOccurredAt,
        }),
      );
      await recordPublicApiActionTelemetry(options.unitOfWork, {
        action: "promotion-decision",
        occurredAt: decisionOccurredAt,
        actorId: authorization.actor?.id,
        message: `Runtime release ${certificationRun.id} was marked ${body.decision} through public-api.`,
        attributes: {
          runId: certificationRun.id,
          decision: body.decision,
          profileName: certificationRun.profileName,
          packId: certificationRun.packId,
          promotionStatus: certificationRun.promotionStatus ?? null,
          reason: body.reason.trim(),
          evidenceRefs,
        },
        labels: {
          verificationKind: certificationRun.verificationKind,
          decision: body.decision,
          evidenceProfile: certificationRun.profileName,
        },
      });

      const promotionDecisionAuditEvents = await options.unitOfWork.auditEvents.findByAggregate(
        "sandbox-certification-run",
        certificationRun.id,
      );
      const runtimeReleaseSnapshots = await loadRuntimeReleaseSnapshotsForRun(
        certificationRun,
        options.sandboxCertification,
        options.unitOfWork,
      );
      writeJsonResponse(
        response,
        200,
        createSandboxCertificationRunDetail(
          certificationRun,
          promotionDecisionAuditEvents,
          runtimeReleaseSnapshots,
        ),
      );
      return;
    }

    const taskRequeuePath = matchTaskRequeuePath(normalizedRequestPath);
    if (taskRequeuePath) {
      if (!options.queueAdapter) {
        writeJsonResponse(response, 501, {
          error: "queue_unavailable",
          message: "Task queue operations require a configured queue adapter.",
        });
        return;
      }

      const body = await readJsonRequestBody<QueueTaskRequeueActionInput>(request);
      const occurredAt = parseQueueActionOccurredAt(body.occurredAt);
      if (occurredAt === null) {
        writeJsonResponse(response, 400, {
          error: "invalid_request_body",
          message: "Queue task actions require a valid ISO timestamp when occurredAt is provided.",
        });
        return;
      }
      const task = await options.unitOfWork.tasks.getById(taskRequeuePath.taskId);
      if (!task) {
        writeJsonResponse(response, 404, {
          error: "resource_not_found",
          resource: "task",
          resourceId: taskRequeuePath.taskId,
        });
        return;
      }

      try {
        const requeuedTask = await options.queueAdapter.requeue(taskRequeuePath.taskId, occurredAt);
        await recordPublicApiActionTelemetry(options.unitOfWork, {
          action: "task-requeue",
          occurredAt: occurredAt?.toISOString() ?? new Date().toISOString(),
          actorId: authorization.actor?.id,
          taskId: requeuedTask.id,
          message: `Task ${requeuedTask.id} was requeued through public-api.`,
          attributes: {
            taskStatus: requeuedTask.status,
          },
          labels: {
            taskKind: requeuedTask.kind,
          },
        });
        writeJsonResponse(response, 200, requeuedTask);
      } catch (error) {
        writeQueueActionError(response, error);
      }
      return;
    }

    const taskQuarantinePath = matchTaskQuarantinePath(normalizedRequestPath);
    if (taskQuarantinePath) {
      if (!options.queueAdapter) {
        writeJsonResponse(response, 501, {
          error: "queue_unavailable",
          message: "Task queue operations require a configured queue adapter.",
        });
        return;
      }

      const body = await readJsonRequestBody<QueueTaskQuarantineActionInput>(request);
      if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
        writeJsonResponse(response, 400, {
          error: "invalid_request_body",
          message: "Task quarantine requires a non-empty reason.",
        });
        return;
      }

      const occurredAt = parseQueueActionOccurredAt(body.occurredAt);
      if (occurredAt === null) {
        writeJsonResponse(response, 400, {
          error: "invalid_request_body",
          message: "Queue task actions require a valid ISO timestamp when occurredAt is provided.",
        });
        return;
      }
      const task = await options.unitOfWork.tasks.getById(taskQuarantinePath.taskId);
      if (!task) {
        writeJsonResponse(response, 404, {
          error: "resource_not_found",
          resource: "task",
          resourceId: taskQuarantinePath.taskId,
        });
        return;
      }

      const taskRunId = await resolveQueueActionTaskRunId(
        options.unitOfWork,
        taskQuarantinePath.taskId,
        body.taskRunId,
      );
      if (!taskRunId) {
        writeJsonResponse(response, 409, {
          error: "task_run_not_available",
          message: `Task ${taskQuarantinePath.taskId} has no running task run to quarantine.`,
        });
        return;
      }

      try {
        const quarantinedClaim = await options.queueAdapter.quarantine(
          taskQuarantinePath.taskId,
          taskRunId,
          body.reason.trim(),
          occurredAt,
        );
        await recordPublicApiActionTelemetry(options.unitOfWork, {
          action: "task-quarantine",
          occurredAt: occurredAt?.toISOString() ?? new Date().toISOString(),
          actorId: authorization.actor?.id,
          taskId: quarantinedClaim.task.id,
          taskRunId: quarantinedClaim.taskRun.id,
          severity: "warn",
          message: `Task ${quarantinedClaim.task.id} was quarantined through public-api.`,
          attributes: {
            reason: body.reason.trim(),
            taskStatus: quarantinedClaim.task.status,
          },
          labels: {
            taskKind: quarantinedClaim.task.kind,
          },
        });
        writeJsonResponse(response, 200, quarantinedClaim);
      } catch (error) {
        writeQueueActionError(response, error);
      }
      return;
    }

    const manualSelectionResetPath = matchFixtureManualSelectionResetPath(normalizedRequestPath);
    if (manualSelectionResetPath) {
      const body = await readJsonRequestBody<FixtureWorkflowResetActionInput>(request);
      const workflow = await applyFixtureManualSelection(options.unitOfWork, manualSelectionResetPath.fixtureId, {
        status: "rejected",
        selectedBy: "public-api",
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        ...(body.occurredAt !== undefined ? { occurredAt: body.occurredAt } : {}),
      });
      const clearedWorkflow = await options.unitOfWork.fixtureWorkflows.save({
        ...workflow,
        manualSelectionStatus: "none",
        ...(body.reason !== undefined ? { manualSelectionReason: body.reason } : {}),
        manuallySelectedAt: body.occurredAt ?? workflow.updatedAt,
        updatedAt: body.occurredAt ?? workflow.updatedAt,
      });
      await recordPublicApiActionTelemetry(options.unitOfWork, {
        action: "manual-selection-reset",
        occurredAt: clearedWorkflow.updatedAt,
        actorId: authorization.actor?.id,
        message: `Fixture ${manualSelectionResetPath.fixtureId} manual selection state was reset.`,
        attributes: {
          fixtureId: manualSelectionResetPath.fixtureId,
          status: clearedWorkflow.manualSelectionStatus,
          ...(body.reason !== undefined ? { reason: body.reason } : {}),
        },
      });
      writeJsonResponse(response, 200, clearedWorkflow);
      return;
    }

    const manualSelectionPath = matchFixtureManualSelectionPath(normalizedRequestPath);
    if (manualSelectionPath) {
      const body = await readJsonRequestBody<FixtureManualSelectionActionInput>(request);
      const workflow = await applyFixtureManualSelection(options.unitOfWork, manualSelectionPath.fixtureId, body);
      await recordPublicApiActionTelemetry(options.unitOfWork, {
        action: "manual-selection",
        occurredAt: workflow.updatedAt,
        actorId: authorization.actor?.id ?? body.selectedBy,
        message: `Fixture ${manualSelectionPath.fixtureId} manual selection was updated through public-api.`,
        attributes: {
          fixtureId: manualSelectionPath.fixtureId,
          status: workflow.manualSelectionStatus,
          ...(workflow.manualSelectionReason ? { reason: workflow.manualSelectionReason } : {}),
        },
      });
      writeJsonResponse(response, 200, workflow);
      return;
    }

    const selectionOverrideResetPath = matchFixtureSelectionOverrideResetPath(normalizedRequestPath);
    if (selectionOverrideResetPath) {
      const body = await readJsonRequestBody<FixtureWorkflowResetActionInput>(request);
      const workflow = await applyFixtureSelectionOverride(options.unitOfWork, selectionOverrideResetPath.fixtureId, {
        mode: "none",
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        ...(body.occurredAt !== undefined ? { occurredAt: body.occurredAt } : {}),
      });
      await recordPublicApiActionTelemetry(options.unitOfWork, {
        action: "selection-override-reset",
        occurredAt: workflow.updatedAt,
        actorId: authorization.actor?.id,
        message: `Fixture ${selectionOverrideResetPath.fixtureId} selection override was reset.`,
        attributes: {
          fixtureId: selectionOverrideResetPath.fixtureId,
          mode: workflow.selectionOverride,
          ...(workflow.overrideReason ? { reason: workflow.overrideReason } : {}),
        },
      });
      writeJsonResponse(response, 200, workflow);
      return;
    }

    const selectionOverridePath = matchFixtureSelectionOverridePath(normalizedRequestPath);
    if (selectionOverridePath) {
      const body = await readJsonRequestBody<FixtureSelectionOverrideActionInput>(request);
      const workflow = await applyFixtureSelectionOverride(options.unitOfWork, selectionOverridePath.fixtureId, body);
      await recordPublicApiActionTelemetry(options.unitOfWork, {
        action: "selection-override",
        occurredAt: workflow.updatedAt,
        actorId: authorization.actor?.id,
        message: `Fixture ${selectionOverridePath.fixtureId} selection override was updated through public-api.`,
        attributes: {
          fixtureId: selectionOverridePath.fixtureId,
          mode: workflow.selectionOverride,
          ...(workflow.overrideReason ? { reason: workflow.overrideReason } : {}),
        },
      });
      writeJsonResponse(response, 200, workflow);
      return;
    }
  }

  writeJsonResponse(response, 405, {
    error: "method_not_allowed",
    message: `Unsupported method: ${method}`,
    allowedMethods: options.unitOfWork ? ["GET", "POST"] : ["GET"],
  });
}

const parseQueueActionOccurredAt = (occurredAt?: string): Date | null | undefined => {
  if (occurredAt === undefined) {
    return undefined;
  }

  const parsedAt = new Date(occurredAt);
  return Number.isNaN(parsedAt.valueOf()) ? null : parsedAt;
};

const resolveQueueActionTaskRunId = async (
  unitOfWork: StorageUnitOfWork,
  taskId: string,
  explicitTaskRunId?: string,
): Promise<string | null> => {
  if (explicitTaskRunId) {
    const taskRun = await unitOfWork.taskRuns.getById(explicitTaskRunId);
    return taskRun && taskRun.taskId === taskId && taskRun.status === "running" ? taskRun.id : null;
  }

  return (
    sortByIsoDescending(
      await unitOfWork.taskRuns.findByTaskId(taskId),
      (taskRun) => taskRun.finishedAt ?? taskRun.updatedAt,
    ).find((taskRun) => taskRun.status === "running")?.id ?? null
  );
};

const writeQueueActionError = (
  response: ServerResponse,
  error: unknown,
): void => {
  const message = error instanceof Error ? error.message : "Unexpected queue action error";
  const normalizedMessage = message.toLowerCase();
  const status =
    normalizedMessage.includes("was not found")
      ? 404
      : normalizedMessage.includes("cannot be requeued") ||
          normalizedMessage.includes("is not running") ||
          normalizedMessage.includes("does not belong to task")
        ? 409
        : 500;

  writeJsonResponse(response, status, {
    error: status === 500 ? "internal_error" : "queue_action_failed",
    message,
  });
};

export interface StartPublicApiServerOptions extends PublicApiHttpOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly host?: string;
  readonly port?: number;
}

const parseServerPort = (rawValue: string | undefined, fallback: number): number => {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const startPublicApiServer = async (
  options: StartPublicApiServerOptions = {},
): Promise<Server> => {
  const env = options.env ?? process.env;
  const host = options.host ?? env.GANA_PUBLIC_API_HOST ?? "127.0.0.1";
  const port = options.port ?? parseServerPort(env.GANA_PUBLIC_API_PORT, 3100);
  const authentication = options.auth ?? loadPublicApiTokenAuthenticationFromEnv({ env });
  const sandboxCertification = {
    ...loadPublicApiSandboxCertificationSourcesFromEnv(env),
    ...(options.sandboxCertification ?? {}),
  };
  const databaseUrl = firstDefinedValue(env.GANA_DATABASE_URL, env.DATABASE_URL);
  const prismaClient =
    !options.snapshot && !options.unitOfWork && databaseUrl
      ? createVerifiedPrismaClient({ databaseUrl })
      : null;
  const server = createPublicApiServer({
    ...(options.snapshot ? { snapshot: options.snapshot } : {}),
    ...(options.unitOfWork
      ? { unitOfWork: options.unitOfWork }
      : prismaClient
        ? { unitOfWork: createPrismaUnitOfWork(prismaClient) }
        : {}),
    ...(options.queueAdapter ? { queueAdapter: options.queueAdapter } : {}),
    ...(Object.keys(sandboxCertification).length > 0 ? { sandboxCertification } : {}),
    ...(authentication ? { auth: authentication } : {}),
  });

  if (prismaClient) {
    server.on("close", () => {
      void prismaClient.$disconnect();
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
};

export function listFixtures(snapshot: OperationSnapshot): readonly FixtureEntity[] {
  return snapshot.fixtures;
}

export function listLeagueCoveragePolicies(
  snapshot: OperationSnapshot,
): readonly LeagueCoveragePolicyEntity[] {
  return snapshot.leagueCoveragePolicies ?? [];
}

export function listTeamCoveragePolicies(
  snapshot: OperationSnapshot,
): readonly TeamCoveragePolicyEntity[] {
  return snapshot.teamCoveragePolicies ?? [];
}

export function getDailyAutomationPolicy(
  snapshot: OperationSnapshot,
): DailyAutomationPolicyEntity | null {
  return (snapshot.dailyAutomationPolicies ?? [])[0] ?? null;
}

export function listCoverageDailyScope(
  snapshot: OperationSnapshot,
): readonly CoverageDailyScopeReadModel[] {
  const dailyPolicy = getDailyAutomationPolicy(snapshot);
  if (!dailyPolicy) {
    return snapshot.fixtures.map((fixture) => ({
      fixtureId: fixture.id,
      included: true,
      eligibleForScoring: true,
      eligibleForParlay: true,
      visibleInOps: true,
      includedBy: [],
      excludedBy: [],
      appliedMinAllowedOdd: 1.2,
      matchedTeamPolicyIds: [],
      priorityScore: 0,
    }));
  }

  return snapshot.fixtures.map((fixture) => {
    const workflow = snapshot.fixtureWorkflows.find((candidate) => candidate.fixtureId === fixture.id);
    return evaluateFixtureCoverageScope({
      fixture,
      ...(workflow ? { workflow } : {}),
      leaguePolicies: snapshot.leagueCoveragePolicies,
      teamPolicies: snapshot.teamCoveragePolicies,
      dailyPolicy,
      ...(workflow?.minDetectedOdd !== undefined ? { minDetectedOdd: workflow.minDetectedOdd } : {}),
      now: snapshot.generatedAt,
    });
  });
}

export function findFixtureById(
  snapshot: OperationSnapshot,
  fixtureId: string,
): FixtureEntity | null {
  return snapshot.fixtures.find((fixture) => fixture.id === fixtureId) ?? null;
}

export function findFixtureResearchById(
  snapshot: OperationSnapshot,
  fixtureId: string,
): FixtureResearchReadModel | null {
  return snapshot.fixtureResearch.find((research) => research.fixtureId === fixtureId) ?? null;
}

const latestCornersStatisticForScope = (
  snapshot: OperationSnapshot,
  fixtureId: string,
  scope: FixtureStatisticSnapshotReadModel["scope"],
): FixtureStatisticSnapshotReadModel | null =>
  sortByIsoDescending(
    (snapshot.fixtureStatisticSnapshots ?? []).filter(
      (statistic) =>
        statistic.fixtureId === fixtureId &&
        statistic.statKey === "corners" &&
        statistic.scope === scope,
    ),
    (statistic) => statistic.capturedAt,
  )[0] ?? null;

const buildFixtureOpsStatistics = (
  snapshot: OperationSnapshot,
  fixtureId: string,
): FixtureOpsStatisticsReadModel => {
  const homeStatistic = latestCornersStatisticForScope(snapshot, fixtureId, "home");
  const awayStatistic = latestCornersStatisticForScope(snapshot, fixtureId, "away");
  const homeCorners =
    typeof homeStatistic?.valueNumeric === "number" && Number.isFinite(homeStatistic.valueNumeric)
      ? homeStatistic.valueNumeric
      : null;
  const awayCorners =
    typeof awayStatistic?.valueNumeric === "number" && Number.isFinite(awayStatistic.valueNumeric)
      ? awayStatistic.valueNumeric
      : null;
  const capturedAt =
    sortByIsoDescending(
      [homeStatistic, awayStatistic].filter((statistic): statistic is FixtureStatisticSnapshotReadModel => Boolean(statistic)),
      (statistic) => statistic.capturedAt,
    )[0]?.capturedAt ?? null;
  const hasAnyCornersStatistic = homeStatistic !== null || awayStatistic !== null;
  const status =
    homeCorners !== null && awayCorners !== null
      ? "available"
      : hasAnyCornersStatistic
        ? "pending"
        : "missing";

  return {
    corners: {
      status,
      homeCorners,
      awayCorners,
      totalCorners: homeCorners !== null && awayCorners !== null ? homeCorners + awayCorners : null,
      capturedAt,
    },
  };
};

export function findFixtureOpsById(
  snapshot: OperationSnapshot,
  fixtureId: string,
): FixtureOpsDetailReadModel | null {
  const fixture = findFixtureById(snapshot, fixtureId);
  if (!fixture) {
    return null;
  }

  const workflow = snapshot.fixtureWorkflows.find((candidate) => candidate.fixtureId === fixtureId);
  const research = findFixtureResearchById(snapshot, fixtureId);
  const latestOddsSnapshot =
    sortByIsoDescending(
      snapshot.oddsSnapshots.filter((oddsSnapshot) => oddsSnapshot.fixtureId === fixtureId),
      (oddsSnapshot) => oddsSnapshot.capturedAt,
    )[0] ?? null;
  const predictions = snapshot.predictions.filter((prediction) => prediction.fixtureId === fixtureId);
  const predictionIds = new Set(predictions.map((prediction) => prediction.id));
  const parlays = snapshot.parlays.filter((parlay) =>
    parlay.legs.some((leg) => leg.fixtureId === fixtureId || predictionIds.has(leg.predictionId)),
  );
  const validations = snapshot.validations.filter(
    (validation) => validation.targetId === fixtureId || predictionIds.has(validation.targetId) || parlays.some((parlay) => parlay.id === validation.targetId),
  );
  const recentTaskRuns = sortByIsoDescending(
    snapshot.taskRuns.filter((taskRun) => {
      const task = snapshot.tasks.find((candidate) => candidate.id === taskRun.taskId);
      return task ? task.payload.fixtureId === fixtureId : false;
    }),
    (taskRun) => taskRun.finishedAt ?? taskRun.updatedAt,
  ).slice(0, 5);
  const recentAuditEvents = findFixtureAuditEventsById(snapshot, fixtureId) ?? [];
  const researchBlockReason = summarizeResearchGateReasons(research);

  const scoringEligibility =
    workflow?.selectionOverride === "force-exclude" || workflow?.manualSelectionStatus === "rejected"
      ? {
          eligible: false,
          reason: "Fixture is force-excluded by workflow ops.",
        }
      : !research
        ? {
            eligible: false,
            reason: "No persisted research bundle found for fixture.",
          }
        : !research.publishable
          ? {
              eligible: false,
              reason:
                `Research bundle status ${research.status} is not publishable.` +
                (researchBlockReason ? ` ${researchBlockReason}` : ""),
            }
        : workflow?.selectionOverride === "force-include"
          ? {
              eligible: true,
              reason: "Fixture is force-included by workflow ops.",
            }
        : workflow?.manualSelectionStatus === "selected"
          ? {
              eligible: true,
              reason: "Fixture is manually selected in workflow ops.",
            }
          : fixture.status !== "scheduled"
            ? {
                eligible: false,
                reason: `Fixture status ${fixture.status} is not eligible for scoring.`,
              }
            : latestOddsSnapshot === null
              ? {
                  eligible: false,
                  reason: "No latest h2h odds snapshot found for fixture.",
                }
              : {
                  eligible: true,
                  reason: "Fixture is eligible for scoring.",
                };

  return {
    fixture,
    research,
    ...(workflow ? { workflow } : {}),
    latestOddsSnapshot,
    statistics: buildFixtureOpsStatistics(snapshot, fixtureId),
    scoringEligibility,
    recentAuditEvents,
    predictions,
    parlays,
    validations,
    recentTaskRuns,
    stages: buildFixtureOpsStageNarratives(snapshot, fixture, workflow),
  };
}

export function listAutomationCycles(
  snapshot: OperationSnapshot,
): readonly AutomationCycleReadModel[] {
  return sortByIsoDescending(
    snapshot.automationCycles,
    (cycle) => cycle.completedAt ?? cycle.startedAt,
  );
}

export function findAutomationCycleById(
  snapshot: OperationSnapshot,
  cycleId: string,
): AutomationCycleReadModel | null {
  return snapshot.automationCycles.find((cycle) => cycle.id === cycleId) ?? null;
}

export function findFixtureAuditEventsById(
  snapshot: OperationSnapshot,
  fixtureId: string,
): readonly AuditEventEntity[] | null {
  if (!findFixtureById(snapshot, fixtureId)) {
    return null;
  }

  return sortByIsoDescending(
    snapshot.auditEvents.filter(
      (auditEvent) =>
        auditEvent.aggregateType === "fixture-workflow" && auditEvent.aggregateId === fixtureId,
    ),
    (auditEvent) => auditEvent.occurredAt,
  ).slice(0, 5);
}

export function listTasks(snapshot: OperationSnapshot): readonly TaskReadModel[] {
  return snapshot.tasks;
}

export function findTaskById(
  snapshot: OperationSnapshot,
  taskId: string,
): TaskReadModel | null {
  return snapshot.tasks.find((task) => task.id === taskId) ?? null;
}

export function listTaskRuns(snapshot: OperationSnapshot): readonly TaskRunEntity[] {
  return snapshot.taskRuns;
}

export function listManualReviews(snapshot: OperationSnapshot): readonly ManualReviewReadModel[] {
  return snapshot.manualReviews ?? [];
}

export function listQuarantines(snapshot: OperationSnapshot): readonly QuarantineReadModel[] {
  return snapshot.quarantines ?? [];
}

export function listRecovery(snapshot: OperationSnapshot): readonly RecoveryReadModel[] {
  return snapshot.recovery ?? [];
}

export function listAiRuns(snapshot: OperationSnapshot): readonly AiRunReadModel[] {
  return snapshot.aiRuns;
}

const findTaskSummaryForAiRun = (
  snapshot: OperationSnapshot,
  aiRun: AiRunReadModel,
): Pick<TaskEntity, "id" | "kind" | "status"> | undefined => {
  const task = snapshot.tasks.find((candidate) => candidate.id === aiRun.taskId);
  return task
    ? {
        id: task.id,
        kind: task.kind,
        status: task.status,
      }
    : undefined;
};

const toAiRunLinkedPrediction = (
  prediction: PredictionEntity,
): AiRunLinkedPredictionReadModel => ({
  id: prediction.id,
  fixtureId: prediction.fixtureId,
  market: prediction.market,
  outcome: prediction.outcome,
  marketLabel: formatPredictionMarketLabel(prediction),
  status: prediction.status,
  confidence: prediction.confidence,
});

const toAiRunLinkedParlay = (parlay: ParlayEntity): AiRunLinkedParlayReadModel => ({
  id: parlay.id,
  status: parlay.status,
  expectedPayout: parlay.expectedPayout,
  legCount: parlay.legs.length,
});

export function findAiRunById(
  snapshot: OperationSnapshot,
  aiRunId: string,
): AiRunDetailReadModel | null {
  const aiRun = snapshot.aiRuns.find((candidate) => candidate.id === aiRunId);
  if (!aiRun) {
    return null;
  }

  const linkedPredictions = snapshot.predictions
    .filter((prediction) => prediction.aiRunId === aiRun.id)
    .map(toAiRunLinkedPrediction);
  const linkedPredictionIds = linkedPredictions.map((prediction) => prediction.id);
  const linkedPredictionIdSet = new Set(linkedPredictionIds);
  const linkedParlays = snapshot.parlays
    .filter((parlay) => parlay.legs.some((leg) => linkedPredictionIdSet.has(leg.predictionId)))
    .map(toAiRunLinkedParlay);
  const linkedParlayIds = linkedParlays.map((parlay) => parlay.id);
  const task = findTaskSummaryForAiRun(snapshot, aiRun);

  return {
    ...aiRun,
    ...(task ? { task } : {}),
    linkedPredictionIds,
    linkedParlayIds,
    linkedPredictions,
    linkedParlays,
  };
}

export function listProviderStates(snapshot: OperationSnapshot): readonly ProviderStateReadModel[] {
  return snapshot.providerStates;
}

export function findProviderStateByProvider(
  snapshot: OperationSnapshot,
  provider: string,
): ProviderStateReadModel | null {
  return snapshot.providerStates.find((providerState) => providerState.provider === provider) ?? null;
}

export function findTaskRunById(
  snapshot: OperationSnapshot,
  taskRunId: string,
): TaskRunEntity | null {
  return snapshot.taskRuns.find((taskRun) => taskRun.id === taskRunId) ?? null;
}

const liveIngestionTaskKinds = new Set<LiveIngestionRunReadModel["taskKind"]>([
  "fixture-ingestion",
  "odds-ingestion",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toLiveIngestionIntent = (taskKind: LiveIngestionRunReadModel["taskKind"]): LiveIngestionRunReadModel["intent"] =>
  taskKind === "odds-ingestion" ? "ingest-odds" : "ingest-fixtures";

const toLiveIngestionEndpointFamily = (
  taskKind: LiveIngestionRunReadModel["taskKind"],
): LiveIngestionRunReadModel["provider"]["endpointFamily"] =>
  taskKind === "odds-ingestion" ? "odds" : "fixtures";

const isLiveIngestionTask = (task: TaskEntity): task is TaskEntity & { kind: LiveIngestionRunReadModel["taskKind"] } =>
  liveIngestionTaskKinds.has(task.kind as LiveIngestionRunReadModel["taskKind"]);

const findLatestTaskAuditEvent = (
  snapshot: OperationSnapshot,
  task: TaskEntity & { kind: LiveIngestionRunReadModel["taskKind"] },
): AuditEventEntity | null => {
  const expectedPrefix = toLiveIngestionIntent(task.kind);
  return sortByIsoDescending(
    snapshot.auditEvents.filter(
      (auditEvent) =>
        auditEvent.aggregateType === "task" &&
        auditEvent.aggregateId === task.id &&
        auditEvent.eventType.startsWith(expectedPrefix),
    ),
    (auditEvent) => auditEvent.occurredAt,
  )[0] ?? null;
};

const toLiveIngestionRequest = (
  task: TaskEntity & { kind: LiveIngestionRunReadModel["taskKind"] },
  auditPayload: Record<string, unknown> | undefined,
): LiveIngestionRunReadModel["request"] | undefined => {
  const request = isRecord(auditPayload?.request) ? auditPayload?.request : undefined;
  const payloadWindow = isRecord(task.payload.window)
    ? task.payload.window
    : request && isRecord(request.window)
      ? request.window
      : undefined;

  if (!payloadWindow) {
    return undefined;
  }

  const start = typeof payloadWindow.start === "string" ? payloadWindow.start : undefined;
  const end = typeof payloadWindow.end === "string" ? payloadWindow.end : undefined;
  const granularity = payloadWindow.granularity === "daily" || payloadWindow.granularity === "intraday"
    ? payloadWindow.granularity
    : undefined;

  if (!start || !end || !granularity) {
    return undefined;
  }

  const rawLeague = request?.league ?? task.payload.league;
  const rawSeason = request?.season ?? task.payload.season;
  const rawFixtureIds = request?.fixtureIds ?? task.payload.fixtureIds;
  const rawMarketKeys = request?.marketKeys ?? task.payload.marketKeys;
  const rawQuirksApplied = request?.quirksApplied;

  return {
    ...(typeof rawFixtureIds !== "undefined" && Array.isArray(rawFixtureIds)
      ? { fixtureIds: rawFixtureIds.filter((value): value is string => typeof value === "string") }
      : {}),
    ...(typeof rawLeague === "string" ? { league: rawLeague } : {}),
    ...(typeof rawMarketKeys !== "undefined" && Array.isArray(rawMarketKeys)
      ? { marketKeys: rawMarketKeys.filter((value): value is string => typeof value === "string") }
      : {}),
    ...(typeof rawSeason === "number" ? { season: rawSeason } : {}),
    quirksApplied: Array.isArray(rawQuirksApplied)
      ? rawQuirksApplied.filter((value): value is string => typeof value === "string")
      : [],
    window: { start, end, granularity },
  };
};

const toLiveIngestionProviderError = (
  auditPayload: Record<string, unknown> | undefined,
): LiveIngestionRunReadModel["providerError"] | undefined => {
  const details = isRecord(auditPayload?.errorDetails) ? auditPayload.errorDetails : undefined;
  if (!details) {
    return undefined;
  }

  const category = typeof details.category === "string" ? details.category : undefined;
  const provider = typeof details.provider === "string" ? details.provider : undefined;
  const endpoint = typeof details.endpoint === "string" ? details.endpoint : undefined;
  const url = typeof details.url === "string" ? details.url : undefined;
  const retriable = typeof details.retriable === "boolean" ? details.retriable : undefined;
  if (!category || !provider || !endpoint || !url || retriable === undefined) {
    return undefined;
  }

  return {
    category,
    endpoint,
    ...(typeof details.httpStatus === "number" ? { httpStatus: details.httpStatus } : {}),
    ...(details.providerErrors !== undefined
      ? { providerErrors: details.providerErrors as Record<string, unknown> | readonly unknown[] }
      : {}),
    provider,
    retriable,
    url,
    ...(typeof auditPayload?.error === "string" ? { message: auditPayload.error } : {}),
  };
};

const toLiveIngestionRun = (
  snapshot: OperationSnapshot,
  task: TaskEntity & { kind: LiveIngestionRunReadModel["taskKind"] },
): LiveIngestionRunReadModel => {
  const taskReadModel = createTaskReadModel(task);
  const auditEvent = findLatestTaskAuditEvent(snapshot, task);
  const auditPayload = isRecord(auditEvent?.payload) ? auditEvent.payload : undefined;
  const taskRunId = typeof auditPayload?.taskRunId === "string" ? auditPayload.taskRunId : undefined;
  const taskRun = taskRunId
    ? findTaskRunById(snapshot, taskRunId)
    : sortByIsoDescending(listTaskRunsByTaskId(snapshot, task.id), (candidate) => candidate.startedAt)[0] ?? null;
  const provider = isRecord(auditPayload?.provider) ? auditPayload.provider : undefined;
  const batchId = typeof auditPayload?.batchId === "string" ? auditPayload.batchId : undefined;
  const request = toLiveIngestionRequest(task, auditPayload);
  const providerError = toLiveIngestionProviderError(auditPayload);

  return {
    ...(batchId
      ? {
          batch: {
            batchId,
            ...(typeof auditPayload?.checksum === "string" ? { checksum: auditPayload.checksum } : {}),
            ...(typeof auditPayload?.observedRecords === "number" ? { observedRecords: auditPayload.observedRecords } : {}),
            rawRefs: Array.isArray(auditPayload?.rawRefs)
              ? auditPayload.rawRefs.filter((value): value is string => typeof value === "string")
              : [],
            ...(typeof auditPayload?.snapshotId === "string" ? { snapshotId: auditPayload.snapshotId } : {}),
            warnings: Array.isArray(auditPayload?.warnings)
              ? auditPayload.warnings.filter((value): value is string => typeof value === "string")
              : [],
          },
        }
      : {}),
    ...(taskRun?.finishedAt ? { finishedAt: taskRun.finishedAt } : {}),
    intent:
      typeof auditPayload?.intent === "string" && (auditPayload.intent === "ingest-fixtures" || auditPayload.intent === "ingest-odds")
        ? auditPayload.intent
        : toLiveIngestionIntent(task.kind),
    provider: {
      endpointFamily:
        provider?.endpointFamily === "fixtures" || provider?.endpointFamily === "odds"
          ? provider.endpointFamily
          : toLiveIngestionEndpointFamily(task.kind),
      ...(typeof provider?.providerBaseUrl === "string" ? { providerBaseUrl: provider.providerBaseUrl } : {}),
      ...(typeof provider?.providerSource === "string" ? { providerSource: provider.providerSource } : {}),
      ...(provider?.requestKind === "live-runner" || provider?.requestKind === "runtime"
        ? { requestKind: provider.requestKind }
        : {}),
    },
    ...(providerError ? { providerError } : {}),
    ...(request ? { request } : {}),
    ...(task.scheduledFor ? { scheduledFor: task.scheduledFor } : {}),
    ...(taskRun?.startedAt ? { startedAt: taskRun.startedAt } : {}),
    status: taskRun?.status ?? task.status,
    taskId: task.id,
    ...(taskRun?.id ? { taskRunId: taskRun.id } : {}),
    taskKind: task.kind,
    ...(taskReadModel.manifestId ? { manifestId: taskReadModel.manifestId } : {}),
    ...(taskReadModel.workflowId
      ? { workflowId: taskReadModel.workflowId }
      : typeof auditPayload?.workflowId === "string"
        ? { workflowId: auditPayload.workflowId }
        : {}),
    ...(taskReadModel.traceId ? { traceId: taskReadModel.traceId } : {}),
    ...(taskReadModel.correlationId ? { correlationId: taskReadModel.correlationId } : {}),
    ...(taskReadModel.source ? { source: taskReadModel.source } : {}),
    ...(taskReadModel.activeTaskRunId ? { activeTaskRunId: taskReadModel.activeTaskRunId } : {}),
    ...(taskReadModel.leaseOwner ? { leaseOwner: taskReadModel.leaseOwner } : {}),
    ...(taskReadModel.leaseExpiresAt ? { leaseExpiresAt: taskReadModel.leaseExpiresAt } : {}),
    ...(taskReadModel.claimedAt ? { claimedAt: taskReadModel.claimedAt } : {}),
    ...(taskReadModel.lastHeartbeatAt ? { lastHeartbeatAt: taskReadModel.lastHeartbeatAt } : {}),
  };
};

export function listLiveIngestionRuns(snapshot: OperationSnapshot): readonly LiveIngestionRunReadModel[] {
  return sortByIsoDescending(
    snapshot.tasks.filter(isLiveIngestionTask).map((task) => toLiveIngestionRun(snapshot, task)),
    (run) => run.finishedAt ?? run.startedAt ?? run.scheduledFor ?? run.taskId,
  );
}

export function findLiveIngestionRunByTaskId(
  snapshot: OperationSnapshot,
  taskId: string,
): LiveIngestionRunReadModel | null {
  return listLiveIngestionRuns(snapshot).find((run) => run.taskId === taskId) ?? null;
}

export function listTaskRunsByTaskId(
  snapshot: OperationSnapshot,
  taskId: string,
): readonly TaskRunEntity[] {
  return snapshot.taskRuns.filter((taskRun) => taskRun.taskId === taskId);
}

export function listRawBatches(snapshot: OperationSnapshot): readonly RawIngestionBatchReadModel[] {
  return snapshot.rawBatches;
}

export function listOddsSnapshots(snapshot: OperationSnapshot): readonly OddsSnapshotReadModel[] {
  return snapshot.oddsSnapshots;
}

export function listTelemetryEvents(snapshot: OperationSnapshot): readonly TelemetryEventReadModel[] {
  return snapshot.telemetryEvents ?? [];
}

export function listTelemetryMetrics(snapshot: OperationSnapshot): readonly TelemetryMetricReadModel[] {
  return snapshot.telemetryMetrics ?? [];
}

const countTasksByStatus = (tasks: readonly TaskEntity[]): OperationalSummary["taskCounts"] => ({
  total: tasks.length,
  queued: tasks.filter((task) => task.status === "queued").length,
  running: tasks.filter((task) => task.status === "running").length,
  failed: tasks.filter((task) => task.status === "failed").length,
  quarantined: tasks.filter((task) => task.status === "quarantined").length,
  succeeded: tasks.filter((task) => task.status === "succeeded").length,
  cancelled: tasks.filter((task) => task.status === "cancelled").length,
});

const countTaskRunsByStatus = (taskRuns: readonly TaskRunEntity[]): OperationalSummary["taskRunCounts"] => ({
  total: taskRuns.length,
  running: taskRuns.filter((taskRun) => taskRun.status === "running").length,
  failed: taskRuns.filter((taskRun) => taskRun.status === "failed").length,
  succeeded: taskRuns.filter((taskRun) => taskRun.status === "succeeded").length,
  cancelled: taskRuns.filter((taskRun) => taskRun.status === "cancelled").length,
});

const countEndpointFamilies = (
  rawBatches: readonly RawIngestionBatchReadModel[],
): Readonly<Record<string, number>> => {
  return rawBatches.reduce<Record<string, number>>((counts, batch) => {
    counts[batch.endpointFamily] = (counts[batch.endpointFamily] ?? 0) + 1;
    return counts;
  }, {});
};

const sortByIsoDescending = <T>(items: readonly T[], selector: (item: T) => string): T[] => {
  return [...items].sort((left, right) => selector(right).localeCompare(selector(left)));
};

export function createOperationalSummary(snapshot: OperationSnapshot): OperationalSummary {
  const observability = createOperationalObservabilitySummary({
    generatedAt: snapshot.generatedAt,
    tasks: snapshot.tasks,
    taskRuns: snapshot.taskRuns,
    aiRuns: snapshot.aiRuns,
    rawBatches: snapshot.rawBatches,
    oddsSnapshots: snapshot.oddsSnapshots,
    health: snapshot.health,
  });
  const policy = evaluateOperationalPolicy({
    health: snapshot.health,
    retries: {
      retrying: observability.retries.retryingNow,
      failed: observability.retries.failed,
      quarantined: observability.retries.quarantined,
      exhausted: observability.retries.exhausted,
    },
    backfills: observability.backfills,
    traceability: observability.traceability,
  });

  return {
    generatedAt: snapshot.generatedAt,
    taskCounts: countTasksByStatus(snapshot.tasks),
    taskRunCounts: countTaskRunsByStatus(snapshot.taskRuns),
    etl: {
      rawBatchCount: snapshot.rawBatches.length,
      oddsSnapshotCount: snapshot.oddsSnapshots.length,
      endpointCounts: countEndpointFamilies(snapshot.rawBatches),
      latestBatch: sortByIsoDescending(snapshot.rawBatches, (batch) => batch.extractionTime)[0] ?? null,
      latestOddsSnapshot:
        sortByIsoDescending(snapshot.oddsSnapshots, (oddsSnapshot) => oddsSnapshot.capturedAt)[0] ?? null,
    },
    observability,
    policy,
    validation: snapshot.validationSummary,
  };
}

export function createTaskLogEntries(snapshot: OperationSnapshot): readonly OperationalLogEntry[] {
  const tasksById = new Map(snapshot.tasks.map((task) => [task.id, task]));

  const taskEntries: OperationalLogEntry[] = snapshot.tasks.map((task) => ({
    id: `${task.id}:task`,
    timestamp: task.updatedAt,
    level: task.status === "failed" ? "ERROR" : "INFO",
    taskId: task.id,
    taskKind: task.kind,
    taskStatus: task.status,
    message: `${task.kind} ${task.status}`,
  }));

  const taskRunEntries: OperationalLogEntry[] = snapshot.taskRuns.map((taskRun) => {
    const task = tasksById.get(taskRun.taskId);
    const timestamp = taskRun.finishedAt ?? taskRun.updatedAt;
    return {
      id: `${taskRun.id}:task-run`,
      timestamp,
      level: taskRun.status === "failed" ? "ERROR" : "INFO",
      taskId: taskRun.taskId,
      taskRunId: taskRun.id,
      taskKind: task?.kind ?? "unknown",
      taskStatus: taskRun.status,
      message:
        taskRun.error ??
        `${task?.kind ?? "task"} attempt ${taskRun.attemptNumber} ${taskRun.status}`,
    };
  });

  return [...taskEntries, ...taskRunEntries].sort((left, right) => {
    if (left.level !== right.level) {
      return left.level === "ERROR" ? -1 : 1;
    }
    if (left.taskRunId !== right.taskRunId) {
      return left.taskRunId ? -1 : 1;
    }

    return right.timestamp.localeCompare(left.timestamp);
  });
}

export function listOperationalLogs(snapshot: OperationSnapshot): readonly OperationalLogEntry[] {
  return createTaskLogEntries(snapshot);
}

const formatFallbackLabelPart = (value: string): string =>
  value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const formatPredictionLine = (line: number | undefined): string =>
  typeof line === "number" && Number.isFinite(line) ? ` ${line}` : "";

export function formatPredictionMarketLabel(
  prediction: {
    readonly market: string;
    readonly outcome: string;
    readonly probabilities?: { readonly line?: number } | null;
  },
): string {
  const line = formatPredictionLine(prediction.probabilities?.line);

  if (prediction.market === "moneyline") {
    return `Moneyline: ${formatFallbackLabelPart(prediction.outcome)}`;
  }

  if (prediction.market === "totals") {
    return `Total Goals: ${formatFallbackLabelPart(prediction.outcome)}${line}`;
  }

  if (prediction.market === "both-teams-score") {
    return `BTTS: ${formatFallbackLabelPart(prediction.outcome)}`;
  }

  if (prediction.market === "double-chance") {
    const outcomes: Readonly<Record<string, string>> = {
      "home-draw": "Home or Draw",
      "home-away": "Home or Away",
      "draw-away": "Draw or Away",
    };
    return `Double Chance: ${outcomes[prediction.outcome] ?? formatFallbackLabelPart(prediction.outcome)}`;
  }

  if (prediction.market === "corners-total") {
    return `Total Corners: ${formatFallbackLabelPart(prediction.outcome)}${line}`;
  }

  if (prediction.market === "corners-h2h") {
    return `Corners H2H: ${formatFallbackLabelPart(prediction.outcome)}`;
  }

  return `${formatFallbackLabelPart(prediction.market)}: ${formatFallbackLabelPart(prediction.outcome)}`;
}

const toPredictionReadModel = (prediction: PredictionEntity): PredictionReadModel => ({
  ...prediction,
  marketLabel: formatPredictionMarketLabel(prediction),
});

const toParlayLegReadModel = (
  leg: ParlayEntity["legs"][number],
  prediction?: PredictionEntity,
): ParlayLegReadModel => ({
  ...leg,
  marketLabel: formatPredictionMarketLabel({
    market: leg.market,
    outcome: leg.outcome,
    probabilities: prediction?.probabilities ?? null,
  }),
});

const toParlayReadModel = (
  parlay: ParlayEntity,
  predictionsById: ReadonlyMap<string, PredictionEntity> = new Map(),
): ParlayReadModel => ({
  ...parlay,
  legs: parlay.legs.map((leg) => toParlayLegReadModel(leg, predictionsById.get(leg.predictionId))),
});

export function listPredictions(
  snapshot: OperationSnapshot,
): readonly PredictionReadModel[] {
  return snapshot.predictions.map(toPredictionReadModel);
}

export function findPredictionById(
  snapshot: OperationSnapshot,
  predictionId: string,
): PredictionDetailReadModel | null {
  const prediction = snapshot.predictions.find((candidate) => candidate.id === predictionId);
  if (!prediction) {
    return null;
  }

  const fixture = snapshot.fixtures.find((candidate) => candidate.id === prediction.fixtureId);
  const aiRun = prediction.aiRunId
    ? snapshot.aiRuns.find((candidate) => candidate.id === prediction.aiRunId)
    : undefined;
  const linkedParlayIds = snapshot.parlays
    .filter((parlay) => parlay.legs.some((leg) => leg.predictionId === prediction.id))
    .map((parlay) => parlay.id);
  const linkedParlays = snapshot.parlays
    .filter((parlay) => linkedParlayIds.includes(parlay.id))
    .map(toAiRunLinkedParlay);
  const validation = snapshot.validations.find(
    (candidate) => candidate.targetType === "prediction" && candidate.targetId === prediction.id,
  );

  return {
    ...toPredictionReadModel(prediction),
    ...(fixture ? { fixture } : {}),
    ...(aiRun ? { aiRun } : {}),
    linkedParlayIds,
    linkedParlays,
    ...(validation ? { validation } : {}),
  };
}

export function listParlays(snapshot: OperationSnapshot): readonly ParlayReadModel[] {
  const predictionsById = new Map(snapshot.predictions.map((prediction) => [prediction.id, prediction]));
  return snapshot.parlays.map((parlay) => toParlayReadModel(parlay, predictionsById));
}

export function findParlayById(
  snapshot: OperationSnapshot,
  parlayId: string,
): ParlayDetailReadModel | null {
  const parlay = snapshot.parlays.find((candidate) => candidate.id === parlayId);
  if (!parlay) {
    return null;
  }

  const predictionsById = new Map(snapshot.predictions.map((prediction) => [prediction.id, prediction]));
  const fixturesById = new Map(snapshot.fixtures.map((fixture) => [fixture.id, fixture]));
  const linkedAiRunIdSet = new Set(
    parlay.legs
      .map((leg) => predictionsById.get(leg.predictionId)?.aiRunId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const linkedAiRunIds = [...linkedAiRunIdSet];
  const aiRun =
    linkedAiRunIdSet.size === 1
      ? snapshot.aiRuns.find((candidate) => candidate.id === linkedAiRunIds[0])
      : undefined;
  const validation = snapshot.validations.find(
    (candidate) => candidate.targetType === "parlay" && candidate.targetId === parlay.id,
  );

  return {
    ...toParlayReadModel(parlay, predictionsById),
    ...(aiRun ? { aiRun } : {}),
    linkedAiRunIds,
    legs: parlay.legs.map((leg) => {
      const prediction = predictionsById.get(leg.predictionId);
      const fixture = fixturesById.get(leg.fixtureId);
      return {
        ...toParlayLegReadModel(leg, prediction),
        ...(prediction ? { prediction: toPredictionReadModel(prediction) } : {}),
        ...(fixture ? { fixture } : {}),
      };
    }),
    ...(validation ? { validation } : {}),
  };
}

export function listValidations(snapshot: OperationSnapshot): readonly ValidationEntity[] {
  return snapshot.validations;
}

export function findValidationById(
  snapshot: OperationSnapshot,
  validationId: string,
): ValidationEntity | null {
  return snapshot.validations.find((validation) => validation.id === validationId) ?? null;
}

export function getValidationSummary(
  snapshot: OperationSnapshot,
): ValidationSummary {
  return snapshot.validationSummary;
}

export function getHealth(snapshot: OperationSnapshot): PublicApiHealth {
  return snapshot.health;
}

const createDerivedProviderStates = (
  aiRuns: readonly AiRunReadModel[],
  rawBatches: readonly RawIngestionBatchReadModel[],
  options: {
    readonly fallbackProvider?: string;
    readonly quota?: {
      readonly limit: number;
      readonly used: number;
      readonly remaining: number;
    };
  } = {},
): readonly ProviderStateReadModel[] => {
  const latestAiRun = aiRuns[0];
  const latestRawBatch = rawBatches[0];
  const provider = latestAiRun?.provider ?? options.fallbackProvider;
  if (!provider) {
    return [];
  }

  const latestQuotaUpdatedAt = latestRawBatch?.extractionTime ?? latestAiRun?.updatedAt;
  const latestError = aiRuns.find((aiRun) => aiRun.error)?.error;

  return [
    {
      provider,
      ...(latestAiRun?.model ? { latestModel: latestAiRun.model } : {}),
      ...(latestAiRun?.promptVersion ? { latestPromptVersion: latestAiRun.promptVersion } : {}),
      aiRunCount: aiRuns.length,
      failedAiRunCount: aiRuns.filter((aiRun) => aiRun.status === "failed").length,
      ...(latestAiRun?.updatedAt ? { latestAiRunAt: latestAiRun.updatedAt } : {}),
      ...(latestError ? { latestError } : {}),
      rawBatchCount: rawBatches.length,
      ...(latestRawBatch?.extractionTime ? { latestRawBatchAt: latestRawBatch.extractionTime } : {}),
      ...(latestRawBatch?.extractionStatus
        ? { latestRawBatchStatus: latestRawBatch.extractionStatus }
        : {}),
      ...(options.quota
        ? {
            quota: {
              limit: options.quota.limit,
              used: options.quota.used,
              remaining: options.quota.remaining,
              ...(latestQuotaUpdatedAt ? { updatedAt: latestQuotaUpdatedAt } : {}),
            },
          }
        : {}),
    },
  ];
};

const isPrismaSnapshotUnitOfWorkLike = (
  unitOfWork: unknown,
): unitOfWork is { readonly client: PrismaClientLike & PrismaQueueClientLike } => {
  const candidate = unitOfWork as { readonly client?: PrismaClientLike & PrismaQueueClientLike };
  return typeof candidate.client?.$queryRawUnsafe === "function";
};

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
  }

  return null;
};

const toNumericValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const readRecordString = (record: Record<string, unknown>, ...keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
};

const readRecordIsoString = (record: Record<string, unknown>, ...keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = toIsoString(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
};

const readRecordNumber = (record: Record<string, unknown>, ...keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = toNumericValue(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
};

const readRecordObject = (
  record: Record<string, unknown>,
  ...keys: readonly string[]
): Record<string, unknown> | null => {
  for (const key of keys) {
    const value = record[key];
    const objectValue = asRecord(value);
    if (objectValue) {
      return objectValue;
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        const parsedRecord = asRecord(parsed);
        if (parsedRecord) {
          return parsedRecord;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
};

const readRecordStringArray = (
  record: Record<string, unknown>,
  ...keys: readonly string[]
): readonly string[] => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const items = value.filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
      if (items.length > 0) {
        return items;
      }
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          const items = parsed.filter(
            (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
          );
          if (items.length > 0) {
            return items;
          }
        }
      } catch {
        const items = asStringArray(value);
        if (items.length > 0) {
          return items;
        }
      }
    }
  }

  return [];
};

const prismaTableExists = async (
  client: PrismaClientLike,
  tableName: string,
): Promise<boolean> => {
  try {
    const rows = await client.$queryRawUnsafe<Array<{ readonly present?: number }>>(
      "SELECT 1 AS present FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
      tableName,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
};

const toTelemetrySeverity = (
  value: string | null | undefined,
): TelemetryEventReadModel["severity"] => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }

  return "info";
};

const toTelemetryMetricType = (
  value: string | null | undefined,
): TelemetryMetricReadModel["type"] => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "counter" || normalized === "gauge" || normalized === "histogram") {
    return normalized;
  }

  return "gauge";
};

const mapSandboxCertificationRunRecord = (
  record: Record<string, unknown>,
): SandboxCertificationRunReadModel | null => {
  const id = readRecordString(record, "id", "runId");
  const profileName = readRecordString(record, "profileName", "profile", "profileId");
  const packId = readRecordString(record, "packId", "fixturePackId", "pack");
  const verificationKind = normalizeSandboxCertificationVerificationKind(
    readRecordString(record, "verificationKind", "runType", "kind", "type"),
  );
  const status = normalizeSandboxCertificationRunStatus(readRecordString(record, "status", "result"));
  const mode = readRecordString(record, "mode");
  const gitSha = readRecordString(record, "gitSha", "gitSHA");
  const generatedAt = readRecordIsoString(record, "generatedAt", "createdAt", "occurredAt");
  if (!id || !profileName || !packId || !verificationKind || !status || !mode || !gitSha || !generatedAt) {
    return null;
  }

  const runtimeSignals = readRecordObject(record, "runtimeSignals") ?? {};
  const summary = readRecordObject(record, "summary") ?? {};
  const promotionStatus = normalizeSandboxCertificationPromotionStatus(readRecordString(record, "promotionStatus"));
  const baselineRef = readRecordString(record, "baselineRef");
  const candidateRef = readRecordString(record, "candidateRef");
  const goldenFingerprint = readRecordString(record, "goldenFingerprint");
  const evidenceFingerprint = readRecordString(record, "evidenceFingerprint");
  const artifactRef = readRecordString(record, "artifactRef", "artifactPath");
  const rawDiffEntries = (() => {
    if (Array.isArray(record.diffEntries)) {
      return record.diffEntries;
    }

    if (typeof record.diffEntries === "string") {
      try {
        const parsed = JSON.parse(record.diffEntries) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  })();
  const diffEntries = rawDiffEntries.flatMap((entry) => {
    const item = asRecord(entry);
    const path = asString(item?.path);
    const kind = asString(item?.kind);
    if (!item || !path || (kind !== "added" && kind !== "removed" && kind !== "changed")) {
      return [];
    }

    return [
      {
        path,
        kind,
        ...(item.expected !== undefined ? { expected: item.expected } : {}),
        ...(item.actual !== undefined ? { actual: item.actual } : {}),
      } satisfies SandboxCertificationDiffEntryReadModel,
    ];
  });

  return {
    id,
    profileName,
    packId,
    mode,
    verificationKind,
    status,
    ...(promotionStatus ? { promotionStatus } : {}),
    gitSha,
    ...(baselineRef ? { baselineRef } : {}),
    ...(candidateRef ? { candidateRef } : {}),
    ...(goldenFingerprint ? { goldenFingerprint } : {}),
    ...(evidenceFingerprint ? { evidenceFingerprint } : {}),
    ...(artifactRef ? { artifactRef } : {}),
    runtimeSignals,
    diffEntryCount: diffEntries.length,
    diffEntries,
    summary,
    generatedAt,
  };
};

const inferRuntimeReleaseSnapshotRole = (
  record: Record<string, unknown>,
  run: SandboxCertificationRunReadModel,
): RuntimeReleaseSnapshotRole | null => {
  const roleValue = readRecordString(record, "role", "snapshotRole", "kind", "type")?.trim().toLowerCase();
  if (roleValue === "baseline" || roleValue === "candidate") {
    return roleValue;
  }

  const id = readRecordString(record, "id", "snapshotId")?.toLowerCase() ?? "";
  const ref = readRecordString(record, "ref", "gitRef", "sourceRef", "runtimeRef");
  if (id.includes("baseline") || (ref && run.baselineRef && ref === run.baselineRef)) {
    return "baseline";
  }

  if (id.includes("candidate") || (ref && run.candidateRef && ref === run.candidateRef)) {
    return "candidate";
  }

  return null;
};

const mapTelemetryEventRecord = (
  record: Record<string, unknown>,
): TelemetryEventReadModel | null => {
  const id = readRecordString(record, "id", "eventId");
  const name = readRecordString(record, "name", "eventName", "kind", "type");
  const occurredAt = readRecordIsoString(record, "occurredAt", "capturedAt", "createdAt");
  const kind = readRecordString(record, "kind");
  if (!id || !name || !occurredAt || (kind !== "log" && kind !== "span")) {
    return null;
  }

  const finishedAt = readRecordIsoString(record, "finishedAt");
  const durationMs = readRecordNumber(record, "durationMs");
  const message = readRecordString(record, "message", "summary", "detail");
  const traceId = readRecordString(record, "traceId");
  const correlationId = readRecordString(record, "correlationId");
  const taskId = readRecordString(record, "taskId");
  const taskRunId = readRecordString(record, "taskRunId");
  const automationCycleId = readRecordString(record, "automationCycleId");
  const sandboxCertificationRunId = readRecordString(record, "sandboxCertificationRunId");
  const attributes = readRecordObject(record, "attributes", "metadata", "payload") ?? {};
  const source =
    readRecordString(record, "source", "worker", "emitter") ??
    asString(attributes.source) ??
    "runtime";

  return {
    id,
    kind,
    name,
    source,
    severity: toTelemetrySeverity(readRecordString(record, "severity", "level", "status")),
    occurredAt,
    ...(finishedAt ? { finishedAt } : {}),
    ...(durationMs !== null ? { durationMs } : {}),
    ...(message ? { message } : {}),
    ...(traceId ? { traceId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(taskRunId ? { taskRunId } : {}),
    ...(automationCycleId ? { automationCycleId } : {}),
    ...(sandboxCertificationRunId ? { sandboxCertificationRunId } : {}),
    attributes,
  };
};

const mapTelemetryMetricRecord = (
  record: Record<string, unknown>,
): TelemetryMetricReadModel | null => {
  const name = readRecordString(record, "name", "metricName", "metric");
  const recordedAt = readRecordIsoString(record, "recordedAt", "capturedAt", "observedAt", "createdAt");
  const value = readRecordNumber(record, "value", "metricValue");
  if (!name || !recordedAt || value === null) {
    return null;
  }

  const traceId = readRecordString(record, "traceId");
  const correlationId = readRecordString(record, "correlationId");
  const taskId = readRecordString(record, "taskId");
  const taskRunId = readRecordString(record, "taskRunId");
  const automationCycleId = readRecordString(record, "automationCycleId");
  const sandboxCertificationRunId = readRecordString(record, "sandboxCertificationRunId");
  const labels = Object.fromEntries(
    Object.entries(readRecordObject(record, "labels", "dimensions") ?? {}).flatMap(([key, entry]) => {
      const value = asString(entry);
      return value ? [[key, value]] : [];
    }),
  );
  const source =
    readRecordString(record, "source", "worker", "emitter") ??
    labels.source ??
    "runtime";

  return {
    id: readRecordString(record, "id") ?? `${name}:${recordedAt}`,
    name,
    type: toTelemetryMetricType(readRecordString(record, "type", "kind", "metricType")),
    value,
    labels,
    source,
    ...(traceId ? { traceId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(taskRunId ? { taskRunId } : {}),
    ...(automationCycleId ? { automationCycleId } : {}),
    ...(sandboxCertificationRunId ? { sandboxCertificationRunId } : {}),
    recordedAt,
  };
};

const loadPersistedSandboxCertificationRunsFromRepositories = async (
  unitOfWork: PersistedCertificationHistoryRepositoryCollectionLike,
): Promise<readonly SandboxCertificationRunReadModel[]> => {
  if (!unitOfWork.sandboxCertificationRuns) {
    return [];
  }

  const rows = await unitOfWork.sandboxCertificationRuns.listByQuery({
    limit: PUBLIC_API_DEFAULT_QUERY_LIMIT,
  });
  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapSandboxCertificationRunRecord(asRecord(row) ?? {});
      return mapped ? [mapped] : [];
    }),
    (run) => run.generatedAt ?? run.id,
  );
};

const loadPersistedRuntimeReleaseSnapshotsFromRepositories = async (
  unitOfWork: PersistedCertificationHistoryRepositoryCollectionLike,
  run: SandboxCertificationRunReadModel,
): Promise<readonly RuntimeReleaseSnapshotReadModel[]> => {
  const repository = unitOfWork.runtimeReleaseSnapshots;
  if (!repository) {
    return [];
  }

  const rows = repository.listByRunId
    ? await repository.listByRunId(run.id)
    : repository.listByQuery
      ? await repository.listByQuery({
          runId: run.id,
          sandboxCertificationRunId: run.id,
          limit: 10,
        })
      : [];

  return rows.flatMap((row) => {
    const record = asRecord(row);
    const role = record ? inferRuntimeReleaseSnapshotRole(record, run) : null;
    return record && role
      ? [
          mapRuntimeReleaseSnapshotRecord(record, {
            role,
            run,
            source: "persisted",
          }),
        ]
      : [];
  });
};

const loadPersistedTelemetryEventsFromRepositories = async (
  unitOfWork: PersistedTelemetryRepositoryCollectionLike,
): Promise<readonly TelemetryEventReadModel[]> => {
  if (!unitOfWork.telemetryEvents) {
    return [];
  }

  const rows = await unitOfWork.telemetryEvents.listByQuery({
    limit: PUBLIC_API_DEFAULT_QUERY_LIMIT,
  });
  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapTelemetryEventRecord(asRecord(row) ?? {});
      return mapped ? [mapped] : [];
    }),
    (event) => event.occurredAt,
  );
};

const loadPersistedMetricSamplesFromRepositories = async (
  unitOfWork: PersistedTelemetryRepositoryCollectionLike,
): Promise<readonly TelemetryMetricReadModel[]> => {
  if (!unitOfWork.metricSamples) {
    return [];
  }

  const rows = await unitOfWork.metricSamples.listByQuery({
    limit: PUBLIC_API_DEFAULT_QUERY_LIMIT,
  });
  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapTelemetryMetricRecord(asRecord(row) ?? {});
      return mapped ? [mapped] : [];
    }),
    (metric) => metric.recordedAt,
  );
};

const loadPersistedSandboxCertificationRunsFromPrisma = async (
  client: PrismaClientLike,
): Promise<readonly SandboxCertificationRunReadModel[]> => {
  if (!(await prismaTableExists(client, "SandboxCertificationRun"))) {
    return [];
  }

  const rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM SandboxCertificationRun
      ORDER BY generatedAt DESC, id DESC
      LIMIT ${PUBLIC_API_DEFAULT_QUERY_LIMIT}`,
  );

  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapSandboxCertificationRunRecord(row);
      return mapped ? [mapped] : [];
    }),
    (run) => run.generatedAt ?? run.id,
  );
};

const loadPersistedRuntimeReleaseSnapshotsFromPrisma = async (
  client: PrismaClientLike,
  run: SandboxCertificationRunReadModel,
): Promise<readonly RuntimeReleaseSnapshotReadModel[]> => {
  if (!(await prismaTableExists(client, "RuntimeReleaseSnapshot"))) {
    return [];
  }

  let rows: Record<string, unknown>[];
  try {
    rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM RuntimeReleaseSnapshot WHERE sandboxCertificationRunId = ? OR runId = ? LIMIT 20",
      run.id,
      run.id,
    );
  } catch {
    rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM RuntimeReleaseSnapshot LIMIT 100",
    );
  }

  return rows.flatMap((row) => {
    const role = inferRuntimeReleaseSnapshotRole(row, run);
    const rowRunId = readRecordString(row, "runId", "sandboxCertificationRunId", "certificationRunId");
    if (!role || (rowRunId && rowRunId !== run.id)) {
      return [];
    }

    return [
      mapRuntimeReleaseSnapshotRecord(row, {
        role,
        run,
        source: "persisted",
      }),
    ];
  });
};

const loadPersistedTelemetryEventsFromPrisma = async (
  client: PrismaClientLike,
): Promise<readonly TelemetryEventReadModel[]> => {
  if (!(await prismaTableExists(client, "OperationalTelemetryEvent"))) {
    return [];
  }

  const rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM OperationalTelemetryEvent
      ORDER BY occurredAt DESC, id DESC
      LIMIT ${PUBLIC_API_DEFAULT_QUERY_LIMIT}`,
  );

  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapTelemetryEventRecord(row);
      return mapped ? [mapped] : [];
    }),
    (event) => event.occurredAt,
  );
};

const loadPersistedTelemetryMetricsFromPrisma = async (
  client: PrismaClientLike,
): Promise<readonly TelemetryMetricReadModel[]> => {
  if (!(await prismaTableExists(client, "OperationalMetricSample"))) {
    return [];
  }

  const rows = await client.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM OperationalMetricSample
      ORDER BY recordedAt DESC, id DESC
      LIMIT ${PUBLIC_API_DEFAULT_QUERY_LIMIT}`,
  );

  return sortByIsoDescending(
    rows.flatMap((row) => {
      const mapped = mapTelemetryMetricRecord(row);
      return mapped ? [mapped] : [];
    }),
    (metric) => metric.recordedAt,
  );
};

const loadPersistedOperationSnapshotSourcesFromPrisma = async (
  client: PrismaClientLike,
): Promise<{
  readonly rawBatches: readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots: readonly OddsSnapshotReadModel[];
  readonly sandboxCertificationRuns: readonly SandboxCertificationRunReadModel[];
  readonly telemetryEvents: readonly TelemetryEventReadModel[];
  readonly telemetryMetrics: readonly TelemetryMetricReadModel[];
}> => {
  const [rawBatches, oddsSnapshots, sandboxCertificationRuns, telemetryEvents, telemetryMetrics] = await Promise.all([
    client.rawIngestionBatch.findMany({
      orderBy: { extractionTime: "desc" },
      take: 100,
    }),
    client.$queryRawUnsafe<Array<{
      id: string;
      fixtureId: string | null;
      providerFixtureId: string;
      bookmakerKey: string;
      marketKey: string;
      capturedAt: Date;
      selectionCount: bigint | number;
    }>>(`
      SELECT
        os.id,
        os.fixtureId,
        os.providerFixtureId,
        os.bookmakerKey,
        os.marketKey,
        os.capturedAt,
        COUNT(oss.id) AS selectionCount
      FROM OddsSnapshot os
      LEFT JOIN OddsSelectionSnapshot oss ON oss.oddsSnapshotId = os.id
      GROUP BY os.id, os.fixtureId, os.providerFixtureId, os.bookmakerKey, os.marketKey, os.capturedAt
      ORDER BY os.capturedAt DESC
      LIMIT 100
    `),
    loadPersistedSandboxCertificationRunsFromPrisma(client),
    loadPersistedTelemetryEventsFromPrisma(client),
    loadPersistedTelemetryMetricsFromPrisma(client),
  ]);

  return {
    rawBatches: rawBatches.map((batch) => ({
      endpointFamily: batch.endpointFamily,
      extractionStatus: batch.extractionStatus,
      extractionTime: batch.extractionTime.toISOString(),
      id: batch.id,
      providerCode: batch.providerCode,
      recordCount: batch.recordCount,
    })),
    oddsSnapshots: oddsSnapshots.map((snapshot) => ({
      bookmakerKey: snapshot.bookmakerKey,
      capturedAt: snapshot.capturedAt.toISOString(),
      ...(snapshot.fixtureId ? { fixtureId: snapshot.fixtureId } : {}),
      id: snapshot.id,
      marketKey: snapshot.marketKey,
      providerFixtureId: snapshot.providerFixtureId,
      selectionCount: Number(snapshot.selectionCount),
    })),
    sandboxCertificationRuns,
    telemetryEvents,
    telemetryMetrics,
  };
};

export async function loadOperationSnapshotFromDatabase(databaseUrl?: string): Promise<OperationSnapshot> {
  return retryPrismaReadOperation(async () => {
    const client = await createConnectedVerifiedPrismaClient({ databaseUrl });

    try {
      const unitOfWork = createPrismaUnitOfWork(client);
      const persistedSources = await loadPersistedOperationSnapshotSourcesFromPrisma(client);
      const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork, {
        generatedAt: new Date().toISOString(),
        rawBatches: persistedSources.rawBatches,
        oddsSnapshots: persistedSources.oddsSnapshots,
        telemetryEvents: persistedSources.telemetryEvents,
        telemetryMetrics: persistedSources.telemetryMetrics,
      });

      return snapshot;
    } finally {
      await client.$disconnect();
    }
  });
}

export async function loadOperationSnapshotFromUnitOfWork(
  unitOfWork: Pick<
    StorageUnitOfWork,
    | "automationCycles"
    | "fixtures"
    | "fixtureWorkflows"
    | "leagueCoveragePolicies"
    | "teamCoveragePolicies"
    | "dailyAutomationPolicies"
    | "auditEvents"
    | "tasks"
    | "taskRuns"
    | "aiRuns"
    | "predictions"
    | "parlays"
    | "validations"
  > &
    FixtureResearchRepositoryCollectionLike &
    FixtureStatisticSnapshotRepositoryCollectionLike &
    PersistedTelemetryRepositoryCollectionLike,
  input: {
    readonly generatedAt?: string;
    readonly rawBatches?: readonly RawIngestionBatchReadModel[];
    readonly oddsSnapshots?: readonly OddsSnapshotReadModel[];
    readonly fixtureStatisticSnapshots?: readonly FixtureStatisticSnapshotReadModel[];
    readonly telemetryEvents?: readonly TelemetryEventReadModel[];
    readonly telemetryMetrics?: readonly TelemetryMetricReadModel[];
    readonly researchBundles?: readonly ResearchBundleEntity[];
    readonly featureSnapshots?: readonly FeatureSnapshotEntity[];
  } = {},
): Promise<OperationSnapshot> {
  const [
    automationCycles,
    fixtures,
    fixtureWorkflows,
    leagueCoveragePolicies,
    teamCoveragePolicies,
    dailyAutomationPolicies,
    auditEvents,
    tasks,
    taskRuns,
    aiRuns,
    predictions,
    parlays,
    validations,
  ] = await Promise.all([
    unitOfWork.automationCycles.list(),
    unitOfWork.fixtures.list(),
    unitOfWork.fixtureWorkflows.list(),
    unitOfWork.leagueCoveragePolicies.list(),
    unitOfWork.teamCoveragePolicies.list(),
    unitOfWork.dailyAutomationPolicies.list(),
    unitOfWork.auditEvents.list(),
    unitOfWork.tasks.list(),
    unitOfWork.taskRuns.list(),
    unitOfWork.aiRuns.list(),
    unitOfWork.predictions.list(),
    unitOfWork.parlays.list(),
    unitOfWork.validations.list(),
  ]);

  const repositoryTelemetryEvents =
    !input.telemetryEvents
      ? await loadPersistedTelemetryEventsFromRepositories(unitOfWork)
      : [];
  const repositoryMetricSamples =
    !input.telemetryMetrics
      ? await loadPersistedMetricSamplesFromRepositories(unitOfWork)
      : [];
  const persistedSources =
    isPrismaSnapshotUnitOfWorkLike(unitOfWork) &&
    (
      !input.rawBatches ||
      !input.oddsSnapshots ||
      (!input.telemetryEvents && repositoryTelemetryEvents.length === 0) ||
      (!input.telemetryMetrics && repositoryMetricSamples.length === 0)
    )
      ? await loadPersistedOperationSnapshotSourcesFromPrisma(unitOfWork.client)
      : null;
  const rawBatches = [...(input.rawBatches ?? persistedSources?.rawBatches ?? [])];
  const oddsSnapshots = [...(input.oddsSnapshots ?? persistedSources?.oddsSnapshots ?? [])];
  const fixtureStatisticSnapshots = [
    ...(input.fixtureStatisticSnapshots ??
      (await loadOptionalRepositoryEntities(
        unitOfWork.fixtureStatisticSnapshots
          ? () => unitOfWork.fixtureStatisticSnapshots!.list()
          : undefined,
      )).flatMap((snapshot) => {
        const readModel = toFixtureStatisticSnapshotReadModel(snapshot);
        return readModel ? [readModel] : [];
      })),
  ];
  const telemetryEvents = [
    ...(input.telemetryEvents ??
      (repositoryTelemetryEvents.length > 0 ? repositoryTelemetryEvents : persistedSources?.telemetryEvents ?? [])),
  ];
  const telemetryMetrics = [
    ...(input.telemetryMetrics ??
      (repositoryMetricSamples.length > 0 ? repositoryMetricSamples : persistedSources?.telemetryMetrics ?? [])),
  ];
  const fixtureResearch = await loadFixtureResearchReadModels({
    fixtures,
    aiRuns,
    repositories: unitOfWork,
    ...(input.researchBundles ? { researchBundles: input.researchBundles } : {}),
    ...(input.featureSnapshots ? { featureSnapshots: input.featureSnapshots } : {}),
  });
  const mappedAiRuns = aiRuns.map((aiRun) => ({
    id: aiRun.id,
    taskId: aiRun.taskId,
    provider: aiRun.provider,
    model: aiRun.model,
    promptVersion: aiRun.promptVersion,
    latestPromptVersion: aiRun.promptVersion,
    status: aiRun.status,
    ...(aiRun.providerRequestId ? { providerRequestId: aiRun.providerRequestId } : {}),
    ...(aiRun.usage ? { usage: aiRun.usage } : {}),
    ...(aiRun.outputRef ? { outputRef: aiRun.outputRef } : {}),
    ...(aiRun.error ? { error: aiRun.error, fallbackReason: aiRun.error, degraded: true } : {}),
    createdAt: aiRun.createdAt,
    updatedAt: aiRun.updatedAt,
  }));

  return createOperationSnapshot({
    automationCycles: automationCycles.map(createAutomationCycleReadModel),
    fixtures,
    fixtureResearch,
    fixtureWorkflows,
    leagueCoveragePolicies,
    teamCoveragePolicies,
    dailyAutomationPolicies,
    auditEvents,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    aiRuns: mappedAiRuns,
    providerStates: createDerivedProviderStates(mappedAiRuns, rawBatches),
    oddsSnapshots,
    fixtureStatisticSnapshots,
    telemetryEvents,
    telemetryMetrics,
    parlays,
    predictions,
    rawBatches,
    tasks,
    taskRuns,
    validations,
  });
}

const createDefaultFixtureWorkflowState = (fixtureId: string): FixtureWorkflowEntity =>
  createFixtureWorkflow({
    fixtureId,
    ingestionStatus: "pending",
    oddsStatus: "pending",
    enrichmentStatus: "pending",
    candidateStatus: "pending",
    predictionStatus: "pending",
    parlayStatus: "pending",
    validationStatus: "pending",
    isCandidate: false,
  });

interface PublicApiActionTelemetryInput {
  readonly action: string;
  readonly occurredAt: string;
  readonly message: string;
  readonly severity?: "debug" | "info" | "warn" | "error";
  readonly actorId?: string | undefined;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly labels?: Readonly<Record<string, string>>;
}

const recordPublicApiActionTelemetry = async (
  unitOfWork: Pick<StorageUnitOfWork, "telemetryEvents" | "metricSamples">,
  input: PublicApiActionTelemetryInput,
): Promise<void> => {
  const traceId = input.traceId ?? `public-api:${input.action}:${randomUUID()}`;
  const correlationId = input.correlationId ?? traceId;
  const source = "public-api";
  const metricLabels = {
    action: input.action,
    source,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.labels ?? {}),
  };

  await Promise.allSettled([
    unitOfWork.telemetryEvents.save(
      createOperationalTelemetryEvent({
        id: `telemetry-event:public-api:${input.action}:${randomUUID()}`,
        kind: "log",
        name: `public_api.${input.action}`,
        severity: input.severity ?? "info",
        traceId,
        correlationId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}),
        ...(input.automationCycleId ? { automationCycleId: input.automationCycleId } : {}),
        occurredAt: input.occurredAt,
        message: input.message,
        attributes: {
          source,
          action: input.action,
          ...(input.actorId ? { actorId: input.actorId } : {}),
          ...(input.attributes ?? {}),
        },
      }),
    ),
    unitOfWork.metricSamples.save(
      createOperationalMetricSample({
        id: `metric-sample:public-api:${input.action}:${randomUUID()}`,
        name: `public_api.${input.action}.count`,
        type: "counter",
        value: 1,
        labels: metricLabels,
        traceId,
        correlationId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}),
        ...(input.automationCycleId ? { automationCycleId: input.automationCycleId } : {}),
        recordedAt: input.occurredAt,
      }),
    ),
  ]);
};

const loadExistingFixtureWorkflow = async (
  unitOfWork: Pick<StorageUnitOfWork, "fixtures" | "fixtureWorkflows">,
  fixtureId: string,
): Promise<FixtureWorkflowEntity> => {
  const fixture = await unitOfWork.fixtures.getById(fixtureId);
  if (!fixture) {
    throw new Error(`Fixture not found: ${fixtureId}`);
  }

  return (
    (await unitOfWork.fixtureWorkflows.findByFixtureId(fixtureId)) ??
    createDefaultFixtureWorkflowState(fixtureId)
  );
};

export async function applyFixtureManualSelection(
  unitOfWork: Pick<StorageUnitOfWork, "fixtures" | "fixtureWorkflows" | "auditEvents">,
  fixtureId: string,
  input: FixtureManualSelectionActionInput,
): Promise<FixtureWorkflowEntity> {
  const workflow = await loadExistingFixtureWorkflow(unitOfWork, fixtureId);
  const updatedWorkflow = await unitOfWork.fixtureWorkflows.save(
    applyFixtureWorkflowManualSelectionTransition(workflow, input),
  );
  await unitOfWork.auditEvents.save(
    createAuditEvent({
      id: `audit:fixture-workflow:${fixtureId}:manual-selection:${updatedWorkflow.updatedAt}`,
      aggregateType: "fixture-workflow",
      aggregateId: fixtureId,
      eventType: "fixture-workflow.manual-selection.updated",
      actor: input.selectedBy,
      actorType: "operator",
      subjectType: "fixture-workflow",
      subjectId: fixtureId,
      action: "manual-selection",
      payload: {
        status: updatedWorkflow.manualSelectionStatus,
        reason: updatedWorkflow.manualSelectionReason ?? null,
      },
      occurredAt: updatedWorkflow.updatedAt,
    }),
  );
  return updatedWorkflow;
}

export async function applyFixtureSelectionOverride(
  unitOfWork: Pick<StorageUnitOfWork, "fixtures" | "fixtureWorkflows" | "auditEvents">,
  fixtureId: string,
  input: FixtureSelectionOverrideActionInput,
): Promise<FixtureWorkflowEntity> {
  const workflow = await loadExistingFixtureWorkflow(unitOfWork, fixtureId);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const updatedWorkflow: FixtureWorkflowEntity =
    input.mode === "none"
      ? {
          ...workflow,
          selectionOverride: "none",
          ...(input.reason !== undefined ? { overrideReason: input.reason } : {}),
          overriddenAt: occurredAt,
          updatedAt: occurredAt,
        }
      : applyFixtureWorkflowSelectionOverrideTransition(workflow, {
          mode: input.mode,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          occurredAt,
        });

  const persistedWorkflow = await unitOfWork.fixtureWorkflows.save(updatedWorkflow);
  await unitOfWork.auditEvents.save(
    createAuditEvent({
      id: `audit:fixture-workflow:${fixtureId}:selection-override:${persistedWorkflow.updatedAt}`,
      aggregateType: "fixture-workflow",
      aggregateId: fixtureId,
      eventType: "fixture-workflow.selection-override.updated",
      actor: "public-api",
      actorType: "operator",
      subjectType: "fixture-workflow",
      subjectId: fixtureId,
      action: "selection-override",
      payload: {
        mode: persistedWorkflow.selectionOverride,
        reason: persistedWorkflow.overrideReason ?? null,
      },
      occurredAt: persistedWorkflow.updatedAt,
    }),
  );
  return persistedWorkflow;
}

function normalizeRequestPath(requestPath: string): string {
  const [pathname] = requestPath.split("?", 1);
  if (!pathname) {
    return "/";
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function getRequestSearchParams(requestPath: string): URLSearchParams {
  const [, search = ""] = requestPath.split("?", 2);
  return new URLSearchParams(search);
}

function isTaskStatus(value: string): value is TaskStatus {
  return allowedTaskStatuses.includes(value as TaskStatus);
}

function matchFixtureOpsDetailPath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)\/ops$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
}

function matchAutomationCycleDetailPath(requestPath: string): { cycleId: string } | null {
  const match = requestPath.match(/^\/automation-cycles\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { cycleId: decodeURIComponent(match[1]) };
}

function matchFixtureAuditEventsPath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)\/audit-events$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
}

function matchFixtureManualSelectionPath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)\/manual-selection$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
}

function matchFixtureManualSelectionResetPath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)\/manual-selection\/reset$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
}

function matchFixtureSelectionOverridePath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)\/selection-override$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
}

function matchFixtureSelectionOverrideResetPath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)\/selection-override\/reset$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
}

function matchFixtureDetailPath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
}

function matchTaskRunsByTaskPath(requestPath: string): { taskId: string } | null {
  const match = requestPath.match(/^\/tasks\/([^/]+)\/runs$/);
  if (!match?.[1]) {
    return null;
  }

  return { taskId: decodeURIComponent(match[1]) };
}

function matchTaskRequeuePath(requestPath: string): { taskId: string } | null {
  const match = requestPath.match(/^\/tasks\/([^/]+)\/requeue$/);
  if (!match?.[1]) {
    return null;
  }

  return { taskId: decodeURIComponent(match[1]) };
}

function matchTaskQuarantinePath(requestPath: string): { taskId: string } | null {
  const match = requestPath.match(/^\/tasks\/([^/]+)\/quarantine$/);
  if (!match?.[1]) {
    return null;
  }

  return { taskId: decodeURIComponent(match[1]) };
}

function matchSandboxCertificationDetailPath(
  requestPath: string,
): { profileName: string; packId: string } | null {
  const match = requestPath.match(/^\/sandbox-certification\/([^/]+)\/([^/]+)$/);
  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  return {
    profileName: decodeURIComponent(match[1]),
    packId: decodeURIComponent(match[2]),
  };
}

function matchSandboxCertificationRunDetailPath(requestPath: string): { runId: string } | null {
  const match = requestPath.match(/^\/sandbox-certification\/runs\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { runId: decodeURIComponent(match[1]) };
}

function matchSandboxCertificationPromotionDecisionPath(
  requestPath: string,
): { runId: string } | null {
  const match = requestPath.match(/^\/sandbox-certification\/runs\/([^/]+)\/promotion-decision$/);
  if (!match?.[1]) {
    return null;
  }

  return { runId: decodeURIComponent(match[1]) };
}

function matchTaskRunDetailPath(requestPath: string): { taskRunId: string } | null {
  const match = requestPath.match(/^\/task-runs\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { taskRunId: decodeURIComponent(match[1]) };
}

function matchLiveIngestionRunDetailPath(requestPath: string): { taskId: string } | null {
  const match = requestPath.match(/^\/live-ingestion-runs\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { taskId: decodeURIComponent(match[1]) };
}

function matchAiRunDetailPath(requestPath: string): { aiRunId: string } | null {
  const match = requestPath.match(/^\/ai-runs\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { aiRunId: decodeURIComponent(match[1]) };
}

function matchProviderStateDetailPath(requestPath: string): { provider: string } | null {
  const match = requestPath.match(/^\/provider-states\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { provider: decodeURIComponent(match[1]) };
}

function matchTaskDetailPath(requestPath: string): { taskId: string } | null {
  const match = requestPath.match(/^\/tasks\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { taskId: decodeURIComponent(match[1]) };
}

function matchPredictionDetailPath(requestPath: string): { predictionId: string } | null {
  const match = requestPath.match(/^\/predictions\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { predictionId: decodeURIComponent(match[1]) };
}

function matchParlayDetailPath(requestPath: string): { parlayId: string } | null {
  const match = requestPath.match(/^\/parlays\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { parlayId: decodeURIComponent(match[1]) };
}

function matchValidationDetailPath(requestPath: string): { validationId: string } | null {
  const match = requestPath.match(/^\/validations\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { validationId: decodeURIComponent(match[1]) };
}

function createResourceNotFoundResponse(resource: string, resourceId: string): PublicApiResponse {
  return {
    status: 404,
    body: {
      error: "resource_not_found",
      resource,
      resourceId,
    },
  };
}

async function readJsonRequestBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function writeJsonResponse(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(payload);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startPublicApiServer();
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`public-api listening on http://${address.address}:${address.port}`);
  } else {
    console.log("public-api listening");
  }
}
