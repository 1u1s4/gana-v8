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
  type ParlayEntity,
  type PredictionEntity,
  type ResearchBundleEntity,
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
  createVerifiedPrismaClient,
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

export interface AiRunLinkedPredictionReadModel
  extends Pick<PredictionEntity, "id" | "fixtureId" | "market" | "outcome" | "status" | "confidence"> {}

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

export interface PredictionDetailReadModel extends PredictionEntity {
  readonly fixture?: FixtureEntity;
  readonly aiRun?: AiRunReadModel;
  readonly linkedParlayIds: readonly string[];
  readonly linkedParlays: readonly AiRunLinkedParlayReadModel[];
  readonly validation?: ValidationEntity;
}

export type ParlayLegDetailReadModel = ParlayEntity["legs"][number] & {
  readonly prediction?: PredictionEntity;
  readonly fixture?: FixtureEntity;
};

export interface ParlayDetailReadModel extends Omit<ParlayEntity, "legs"> {
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
}

export interface FixtureOpsDetailReadModel {
  readonly fixture: FixtureEntity;
  readonly workflow?: FixtureWorkflowEntity;
  readonly research: FixtureResearchReadModel | null;
  readonly latestOddsSnapshot: OddsSnapshotReadModel | null;
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
  readonly tasks: readonly TaskEntity[];
  readonly taskRuns: readonly TaskRunEntity[];
  readonly aiRuns: readonly AiRunReadModel[];
  readonly providerStates: readonly ProviderStateReadModel[];
  readonly rawBatches: readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots: readonly OddsSnapshotReadModel[];
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
  readonly tasks: () => readonly TaskEntity[];
  readonly taskById: (taskId: string) => TaskEntity | null;
  readonly taskRuns: () => readonly TaskRunEntity[];
  readonly taskRunById: (taskRunId: string) => TaskRunEntity | null;
  readonly taskRunsByTaskId: (taskId: string) => readonly TaskRunEntity[];
  readonly liveIngestionRuns: () => readonly LiveIngestionRunReadModel[];
  readonly liveIngestionRunByTaskId: (taskId: string) => LiveIngestionRunReadModel | null;
  readonly aiRuns: () => readonly AiRunReadModel[];
  readonly aiRunById: (aiRunId: string) => AiRunDetailReadModel | null;
  readonly providerStates: () => readonly ProviderStateReadModel[];
  readonly providerStateByProvider: (provider: string) => ProviderStateReadModel | null;
  readonly rawBatches: () => readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots: () => readonly OddsSnapshotReadModel[];
  readonly operationalSummary: () => OperationalSummary;
  readonly operationalLogs: () => readonly OperationalLogEntry[];
  readonly predictions: () => readonly PredictionEntity[];
  readonly predictionById: (predictionId: string) => PredictionDetailReadModel | null;
  readonly parlays: () => readonly ParlayEntity[];
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

export interface PublicApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface PublicApiSandboxCertificationSourceOptions {
  readonly goldensRoot?: string;
  readonly artifactsRoot?: string;
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
}

export interface SandboxCertificationDetailReadModel extends SandboxCertificationReadModel {
  readonly assertions: readonly string[];
  readonly allowedHosts: readonly string[];
  readonly diffEntries: readonly SandboxCertificationDiffEntryReadModel[];
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
  readonly workflowId?: string;
  readonly traceId?: string;
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
  liveIngestionRuns: "/live-ingestion-runs",
  sandboxCertification: "/sandbox-certification",
  aiRuns: "/ai-runs",
  providerStates: "/provider-states",
  rawBatches: "/raw-batches",
  oddsSnapshots: "/odds-snapshots",
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

const loadFixtureResearchFromRepositories = async (
  fixtures: readonly FixtureEntity[],
  repositories: FixtureResearchRepositoryCollectionLike,
  aiRuns: readonly AiRunEntity[],
): Promise<FixtureResearchReadModel[]> => {
  if (!repositories.researchBundles && !repositories.featureSnapshots) {
    return [];
  }

  const [bundles, snapshots] = await Promise.all([
    repositories.researchBundles?.list() ?? Promise.resolve([]),
    repositories.featureSnapshots?.list() ?? Promise.resolve([]),
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

const loadOptionalClientReadModels = async (
  client: Record<string, unknown>,
  modelName: string,
): Promise<unknown[]> => {
  const model = asRecord(Reflect.get(client, modelName));
  const findMany = model?.findMany;
  if (typeof findMany !== "function") {
    return [];
  }

  const result = await (findMany as (args: Record<string, unknown>) => Promise<unknown[]> )({
    orderBy: { generatedAt: "desc" },
    take: 200,
  });
  return Array.isArray(result) ? result : [];
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
  const tasks = [...(input.tasks ?? [])];
  const taskRuns = [...(input.taskRuns ?? [])];
  const rawBatches = [...(input.rawBatches ?? [])];
  const oddsSnapshots = [...(input.oddsSnapshots ?? [])];
  const aiRuns = [...(input.aiRuns ?? [])];
  const providerStates = [...(input.providerStates ?? [])];
  const predictions = [...(input.predictions ?? [])];
  const parlays = [...(input.parlays ?? [])];
  const validations = [...(input.validations ?? [])];
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
    liveIngestionRuns: () => listLiveIngestionRuns(snapshot),
    liveIngestionRunByTaskId: (taskId: string) => findLiveIngestionRunByTaskId(snapshot, taskId),
    aiRuns: () => listAiRuns(snapshot),
    aiRunById: (aiRunId: string) => findAiRunById(snapshot, aiRunId),
    providerStates: () => listProviderStates(snapshot),
    providerStateByProvider: (provider: string) => findProviderStateByProvider(snapshot, provider),
    rawBatches: () => listRawBatches(snapshot),
    oddsSnapshots: () => listOddsSnapshots(snapshot),
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
): Required<PublicApiSandboxCertificationSourceOptions> => ({
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
  sources: Required<PublicApiSandboxCertificationSourceOptions>,
  goldenPath: string,
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
  };
  const profileName = golden.profileName;
  const packId = golden.fixturePackId;
  const artifactPath = join(sources.artifactsRoot, profileName, `${packId}.evidence.json`);

  let generatedAt: string | undefined;
  let evidenceFingerprint: string | undefined;
  let diffEntries: readonly SandboxCertificationDiffEntryReadModel[] = [];
  let status: SandboxCertificationReadModel["status"] = "missing";

  try {
    const evidence = JSON.parse(await readFile(artifactPath, "utf8")) as {
      readonly generatedAt?: string;
      readonly goldenSnapshot?: unknown;
    };
    generatedAt = evidence.generatedAt;
    evidenceFingerprint = stableStringify(evidence.goldenSnapshot);
    diffEntries = diffSandboxCertificationValues(golden, evidence.goldenSnapshot, "$");
    status = diffEntries.length === 0 ? "passed" : "failed";
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
    assertions: golden.assertions ?? [],
    allowedHosts: golden.safety?.allowedHosts ?? [],
    diffEntries,
  };
};

export const loadSandboxCertificationReadModels = async (
  options: PublicApiSandboxCertificationSourceOptions = {},
): Promise<readonly SandboxCertificationReadModel[]> => {
  const sources = resolveSandboxCertificationSources(options);
  const goldenPaths = await listJsonFilesRecursive(sources.goldensRoot);
  const certifications = await Promise.all(
    goldenPaths.map((goldenPath) => loadSandboxCertificationBundle(sources, goldenPath)),
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
  }));
};

export const loadSandboxCertificationDetail = async (
  profileName: string,
  packId: string,
  options: PublicApiSandboxCertificationSourceOptions = {},
): Promise<SandboxCertificationDetailReadModel | null> => {
  const sources = resolveSandboxCertificationSources(options);
  const goldenPath = join(sources.goldensRoot, profileName, `${packId}.json`);
  try {
    return await loadSandboxCertificationBundle(sources, goldenPath);
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
  const authorization = authorizePublicApiRequest(request, method, normalizedRequestPath, options.auth);

  if (authorization.denied) {
    writeJsonResponse(response, authorization.denied.status, authorization.denied.body, authorization.headers);
    return;
  }

  if (method === "GET") {
    if (normalizedRequestPath === publicApiEndpointPaths.sandboxCertification) {
      writeJsonResponse(
        response,
        200,
        await loadSandboxCertificationReadModels(options.sandboxCertification),
      );
      return;
    }

    const sandboxCertificationDetail = matchSandboxCertificationDetailPath(normalizedRequestPath);
    if (sandboxCertificationDetail) {
      const certification = await loadSandboxCertificationDetail(
        sandboxCertificationDetail.profileName,
        sandboxCertificationDetail.packId,
        options.sandboxCertification,
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

    const certifications = options.sandboxCertification
      ? await loadSandboxCertificationReadModels(options.sandboxCertification)
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
    const routedResponse = routePublicApiRequest(handlers, requestPath);
    writeJsonResponse(response, routedResponse.status, routedResponse.body);
    return;
  }

  if (method === "POST" && options.unitOfWork) {
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
      writeJsonResponse(response, 200, clearedWorkflow);
      return;
    }

    const manualSelectionPath = matchFixtureManualSelectionPath(normalizedRequestPath);
    if (manualSelectionPath) {
      const body = await readJsonRequestBody<FixtureManualSelectionActionInput>(request);
      const workflow = await applyFixtureManualSelection(options.unitOfWork, manualSelectionPath.fixtureId, body);
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
      writeJsonResponse(response, 200, workflow);
      return;
    }

    const selectionOverridePath = matchFixtureSelectionOverridePath(normalizedRequestPath);
    if (selectionOverridePath) {
      const body = await readJsonRequestBody<FixtureSelectionOverrideActionInput>(request);
      const workflow = await applyFixtureSelectionOverride(options.unitOfWork, selectionOverridePath.fixtureId, body);
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

export function listTasks(snapshot: OperationSnapshot): readonly TaskEntity[] {
  return snapshot.tasks;
}

export function findTaskById(
  snapshot: OperationSnapshot,
  taskId: string,
): TaskEntity | null {
  return snapshot.tasks.find((task) => task.id === taskId) ?? null;
}

export function listTaskRuns(snapshot: OperationSnapshot): readonly TaskRunEntity[] {
  return snapshot.taskRuns;
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
    ...(typeof (auditPayload?.workflowId ?? task.payload.workflowId) === "string"
      ? { workflowId: String(auditPayload?.workflowId ?? task.payload.workflowId) }
      : {}),
    ...(typeof task.payload.traceId === "string" ? { traceId: task.payload.traceId } : {}),
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

const countTasksByStatus = (tasks: readonly TaskEntity[]): OperationalSummary["taskCounts"] => ({
  total: tasks.length,
  queued: tasks.filter((task) => task.status === "queued").length,
  running: tasks.filter((task) => task.status === "running").length,
  failed: tasks.filter((task) => task.status === "failed").length,
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

export function listPredictions(
  snapshot: OperationSnapshot,
): readonly PredictionEntity[] {
  return snapshot.predictions;
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
    ...prediction,
    ...(fixture ? { fixture } : {}),
    ...(aiRun ? { aiRun } : {}),
    linkedParlayIds,
    linkedParlays,
    ...(validation ? { validation } : {}),
  };
}

export function listParlays(snapshot: OperationSnapshot): readonly ParlayEntity[] {
  return snapshot.parlays;
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
    ...parlay,
    ...(aiRun ? { aiRun } : {}),
    linkedAiRunIds,
    legs: parlay.legs.map((leg) => {
      const prediction = predictionsById.get(leg.predictionId);
      const fixture = fixturesById.get(leg.fixtureId);
      return {
        ...leg,
        ...(prediction ? { prediction } : {}),
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

export async function loadOperationSnapshotFromDatabase(databaseUrl?: string): Promise<OperationSnapshot> {
  const client = createVerifiedPrismaClient({ databaseUrl });

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const rawBatches = await client.rawIngestionBatch.findMany({
      orderBy: { extractionTime: "desc" },
      take: 100,
    });
    const oddsSnapshots = await client.$queryRawUnsafe<Array<{
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
    `);
    const [researchBundles, featureSnapshots] = await Promise.all([
      loadOptionalClientReadModels(client as unknown as Record<string, unknown>, "researchBundle"),
      loadOptionalClientReadModels(client as unknown as Record<string, unknown>, "featureSnapshot"),
    ]);

    const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork, {
      generatedAt: new Date().toISOString(),
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
      researchBundles: researchBundles as ResearchBundleEntity[],
      featureSnapshots: featureSnapshots as FeatureSnapshotEntity[],
    });

    return snapshot;
  } finally {
    await client.$disconnect();
  }
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
  > & FixtureResearchRepositoryCollectionLike,
  input: {
    readonly generatedAt?: string;
    readonly rawBatches?: readonly RawIngestionBatchReadModel[];
    readonly oddsSnapshots?: readonly OddsSnapshotReadModel[];
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

  const rawBatches = [...(input.rawBatches ?? [])];
  const oddsSnapshots = [...(input.oddsSnapshots ?? [])];
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
