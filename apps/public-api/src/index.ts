import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

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
  type FixtureEntity,
  type FixtureSelectionOverride,
  type FixtureWorkflowManualSelectionInput,
  type FixtureWorkflowSelectionOverrideInput,
  type FixtureWorkflowEntity,
  type LeagueCoveragePolicyEntity,
  type ParlayEntity,
  type PredictionEntity,
  type TaskEntity,
  type TaskRunEntity,
  type TaskStatus,
  type TeamCoveragePolicyEntity,
  type ValidationEntity,
} from "@gana-v8/domain-core";
import {
  createAuthorizationActor,
  hasCapability,
  type AuthorizationActor,
} from "@gana-v8/authz";
import {
  createPrismaClient,
  createPrismaUnitOfWork,
  createVerifiedPrismaClient,
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

export interface FixtureOpsDetailReadModel {
  readonly fixture: FixtureEntity;
  readonly workflow?: FixtureWorkflowEntity;
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
}

export interface CoverageDailyScopeReadModel extends FixtureCoverageScopeDecision {}

export interface OperationSnapshot {
  readonly generatedAt: string;
  readonly fixtures: readonly FixtureEntity[];
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
}

export interface PublicApiHandlers {
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
  readonly snapshot: () => OperationSnapshot;
}

export interface PublicApiHttpOptions {
  readonly snapshot?: OperationSnapshot;
  readonly unitOfWork?: StorageUnitOfWork;
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

export interface PublicApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface FixtureOpsDetailReadModel {
  readonly fixture: FixtureEntity;
  readonly workflow?: FixtureWorkflowEntity;
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
  fixtures: "/fixtures",
  tasks: "/tasks",
  taskRuns: "/task-runs",
  liveIngestionRuns: "/live-ingestion-runs",
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
    { name: "@gana-v8/storage-adapters", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

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

export function createOperationSnapshot(input: {
  readonly generatedAt?: string;
  readonly fixtures?: readonly FixtureEntity[];
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
} = {}): OperationSnapshot {
  const generatedAt = input.generatedAt ?? "2026-04-15T01:00:00.000Z";
  const fixtures = [...(input.fixtures ?? createDemoFixtures())];
  const fixtureWorkflows = [...(input.fixtureWorkflows ?? createDemoFixtureWorkflows(fixtures))];
  const leagueCoveragePolicies = [...(input.leagueCoveragePolicies ?? [])];
  const teamCoveragePolicies = [...(input.teamCoveragePolicies ?? [])];
  const dailyAutomationPolicies = [...(input.dailyAutomationPolicies ?? [])];
  const auditEvents = [...(input.auditEvents ?? [])];
  const tasks = [...(input.tasks ?? createDemoTasks())];
  const taskRuns = [...(input.taskRuns ?? createDemoTaskRuns(tasks))];
  const rawBatches = [...(input.rawBatches ?? [])];
  const oddsSnapshots = [...(input.oddsSnapshots ?? [])];
  const aiRuns = [...(input.aiRuns ?? createDemoAiRuns(tasks))];
  const providerStates = [...(input.providerStates ?? createDemoProviderStates(aiRuns, rawBatches))];
  const predictions = [...(input.predictions ?? createDemoPredictions(fixtures, aiRuns))];
  const parlays = [...(input.parlays ?? createDemoParlays(predictions))];
  const validations = [...(input.validations ?? createDemoValidations(parlays, predictions))];
  const validationSummary = summarizeValidations(validations);

  return {
    generatedAt,
    fixtures,
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
  };
}

export function createPublicApiHandlers(
  snapshot: OperationSnapshot = createOperationSnapshot(),
): PublicApiHandlers {
  return {
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
    snapshot: () => snapshot,
  };
}

export function routePublicApiRequest(
  handlers: PublicApiHandlers,
  requestPath: string,
): PublicApiResponse {
  const normalizedPath = normalizeRequestPath(requestPath);
  const searchParams = getRequestSearchParams(requestPath);
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

export const authorizePublicApiRequest = (
  request: IncomingMessage,
  method: string,
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

  if (method !== "GET" && method !== "HEAD" && !hasCapability(credential.actor, "workflow:override")) {
    return {
      denied: {
        status: 403,
        body: {
          error: "forbidden",
          message: `Actor ${credential.actor.id} lacks capability workflow:override`,
        },
      },
    };
  }

  return { actor: credential.actor };
};

export function createPublicApiServer(
  options: PublicApiHttpOptions = {},
): Server {
  const staticHandlers = options.unitOfWork
    ? null
    : createPublicApiHandlers(options.snapshot ?? createOperationSnapshot());

  return createServer((request, response) => {
      void handlePublicApiRequest(request, response, {
        ...(staticHandlers ? { handlers: staticHandlers } : {}),
        ...(options.unitOfWork ? { unitOfWork: options.unitOfWork } : {}),
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
    readonly handlers?: PublicApiHandlers;
    readonly unitOfWork?: StorageUnitOfWork;
    readonly auth?: PublicApiAuthenticationOptions;
  } = {},
): Promise<void> {
  const method = request.method ?? "GET";
  const requestPath = request.url ?? "/";
  const authorization = authorizePublicApiRequest(request, method, options.auth);

  if (authorization.denied) {
    writeJsonResponse(response, authorization.denied.status, authorization.denied.body, authorization.headers);
    return;
  }

  if (method === "GET") {
    const handlers = options.unitOfWork
      ? createPublicApiHandlers(await loadOperationSnapshotFromUnitOfWork(options.unitOfWork))
      : (options.handlers ?? createPublicApiHandlers());
    const routedResponse = routePublicApiRequest(handlers, requestPath);
    writeJsonResponse(response, routedResponse.status, routedResponse.body);
    return;
  }

  if (method === "POST" && options.unitOfWork) {
    const manualSelectionResetPath = matchFixtureManualSelectionResetPath(normalizeRequestPath(requestPath));
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

    const manualSelectionPath = matchFixtureManualSelectionPath(normalizeRequestPath(requestPath));
    if (manualSelectionPath) {
      const body = await readJsonRequestBody<FixtureManualSelectionActionInput>(request);
      const workflow = await applyFixtureManualSelection(options.unitOfWork, manualSelectionPath.fixtureId, body);
      writeJsonResponse(response, 200, workflow);
      return;
    }

    const selectionOverrideResetPath = matchFixtureSelectionOverrideResetPath(normalizeRequestPath(requestPath));
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

    const selectionOverridePath = matchFixtureSelectionOverridePath(normalizeRequestPath(requestPath));
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

export function findFixtureOpsById(
  snapshot: OperationSnapshot,
  fixtureId: string,
): FixtureOpsDetailReadModel | null {
  const fixture = findFixtureById(snapshot, fixtureId);
  if (!fixture) {
    return null;
  }

  const workflow = snapshot.fixtureWorkflows.find((candidate) => candidate.fixtureId === fixtureId);
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

  const scoringEligibility =
    workflow?.selectionOverride === "force-exclude" || workflow?.manualSelectionStatus === "rejected"
      ? {
          eligible: false,
          reason: "Fixture is force-excluded by workflow ops.",
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
    ...(workflow ? { workflow } : {}),
    latestOddsSnapshot,
    scoringEligibility,
    recentAuditEvents,
    predictions,
    parlays,
    validations,
    recentTaskRuns,
  };
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

export function createDemoFixtures(): readonly FixtureEntity[] {
  return [
    createFixture({
      id: "fx-boca-river",
      sport: "football",
      competition: "Liga Profesional",
      homeTeam: "Boca Juniors",
      awayTeam: "River Plate",
      scheduledAt: "2026-04-16T00:30:00.000Z",
      status: "scheduled",
      metadata: { source: "seed", feed: "demo" },
    }),
    createFixture({
      id: "fx-inter-milan",
      sport: "football",
      competition: "Serie A",
      homeTeam: "Inter",
      awayTeam: "Milan",
      scheduledAt: "2026-04-16T18:45:00.000Z",
      status: "scheduled",
      metadata: { source: "seed", feed: "demo" },
    }),
  ];
}

export function createDemoTasks(): readonly TaskEntity[] {
  return [
    createTask({
      id: "task-demo-fixtures",
      kind: "fixture-ingestion",
      status: "succeeded",
      priority: 100,
      payload: { source: "demo" },
      attempts: [
        {
          startedAt: "2026-04-15T00:00:00.000Z",
          finishedAt: "2026-04-15T00:01:00.000Z",
        },
      ],
      scheduledFor: "2026-04-15T00:00:00.000Z",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:01:00.000Z",
    }),
  ];
}

export function createDemoTaskRuns(
  tasks: readonly TaskEntity[] = createDemoTasks(),
): readonly TaskRunEntity[] {
  return [
    createTaskRun({
      id: "task-demo-fixtures:attempt:1",
      taskId: tasks[0]?.id ?? "task-demo-fixtures",
      attemptNumber: 1,
      status: "succeeded",
      startedAt: "2026-04-15T00:00:00.000Z",
      finishedAt: "2026-04-15T00:01:00.000Z",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:01:00.000Z",
    }),
  ];
}

export function createDemoAiRuns(
  tasks: readonly TaskEntity[] = createDemoTasks(),
): readonly AiRunReadModel[] {
  return [
    createAiRun({
      id: "airun-demo-scoring",
      taskId: tasks[0]?.id ?? "task-demo-fixtures",
      provider: "internal",
      model: "deterministic-moneyline-v1",
      promptVersion: "scoring-worker-mvp-v1",
      providerRequestId: "req-demo-scoring",
      status: "completed",
      usage: {
        promptTokens: 120,
        completionTokens: 48,
        totalTokens: 168,
      },
      outputRef: "memory://demo/airuns/airun-demo-scoring.json",
      createdAt: "2026-04-15T00:10:00.000Z",
      updatedAt: "2026-04-15T00:10:05.000Z",
    }),
  ].map((aiRun) => ({
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
}

export function createDemoProviderStates(
  aiRuns: readonly AiRunReadModel[] = createDemoAiRuns(),
  rawBatches: readonly RawIngestionBatchReadModel[] = [],
): readonly ProviderStateReadModel[] {
  const latestAiRun = aiRuns[0];
  const latestRawBatch = rawBatches[0];

  const latestQuotaUpdatedAt = latestRawBatch?.extractionTime ?? latestAiRun?.updatedAt;
  const latestError = aiRuns.find((aiRun) => aiRun.error)?.error;

  return [
    {
      provider: latestAiRun?.provider ?? "internal",
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
      quota: {
        limit: 1000,
        used: 320,
        remaining: 680,
        ...(latestQuotaUpdatedAt ? { updatedAt: latestQuotaUpdatedAt } : {}),
      },
    },
  ];
}

export function createDemoPredictions(
  fixtures: readonly FixtureEntity[] = createDemoFixtures(),
  aiRuns: readonly AiRunReadModel[] = createDemoAiRuns(),
): readonly PredictionEntity[] {
  const linkedAiRunId = aiRuns[0]?.id;

  return [
    createPrediction({
      id: "pred-boca-home",
      fixtureId: fixtures[0]?.id ?? "fx-boca-river",
      ...(linkedAiRunId ? { aiRunId: linkedAiRunId } : {}),
      market: "moneyline",
      outcome: "home",
      status: "published",
      confidence: 0.64,
      probabilities: { implied: 0.54, model: 0.64, edge: 0.1 },
      rationale: ["Home pressure profile", "Set-piece edge"],
      publishedAt: "2026-04-15T00:15:00.000Z",
    }),
    createPrediction({
      id: "pred-inter-over",
      fixtureId: fixtures[1]?.id ?? "fx-inter-milan",
      market: "totals",
      outcome: "over",
      status: "published",
      confidence: 0.58,
      probabilities: { implied: 0.5, model: 0.58, edge: 0.08 },
      rationale: ["High tempo matchup"],
      publishedAt: "2026-04-15T00:20:00.000Z",
    }),
  ];
}

export function createDemoParlays(
  predictions: readonly PredictionEntity[] = createDemoPredictions(),
): readonly ParlayEntity[] {
  return [
    createParlay({
      id: "parlay-core-slate",
      status: "ready",
      stake: 25,
      source: "automatic",
      legs: predictions.map((prediction) => ({
        predictionId: prediction.id,
        fixtureId: prediction.fixtureId,
        market: prediction.market,
        outcome: prediction.outcome,
        price: prediction.market === "moneyline" ? 1.88 : 1.95,
        status: "pending",
      })),
      correlationScore: 0.12,
      expectedPayout: 91.65,
    }),
  ];
}

export function createDemoFixtureWorkflows(
  fixtures: readonly FixtureEntity[] = createDemoFixtures(),
): readonly FixtureWorkflowEntity[] {
  return [
    createFixtureWorkflow({
      fixtureId: fixtures[0]?.id ?? "fx-boca-river",
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "succeeded",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      minDetectedOdd: 1.88,
      qualityScore: 0.78,
      selectionScore: 0.66,
      lastIngestedAt: "2026-04-15T00:01:00.000Z",
      lastEnrichedAt: "2026-04-15T00:10:00.000Z",
      lastPredictedAt: "2026-04-15T00:20:00.000Z",
      manualSelectionStatus: "selected",
      manualSelectionBy: "ops-user",
      manualSelectionReason: "Premium slate fixture",
      manuallySelectedAt: "2026-04-15T00:11:00.000Z",
      selectionOverride: "force-include",
      overrideReason: "Pinned by operator",
      overriddenAt: "2026-04-15T00:12:00.000Z",
    }),
  ];
}

export function createDemoValidations(
  parlays: readonly ParlayEntity[] = createDemoParlays(),
  predictions: readonly PredictionEntity[] = createDemoPredictions(),
): readonly ValidationEntity[] {
  return [
    createValidation({
      id: "val-parlay-core",
      targetType: "parlay",
      targetId: parlays[0]?.id ?? "parlay-core-slate",
      kind: "parlay-settlement",
      status: "passed",
      checks: [
        {
          code: "legs-linked",
          message: "All parlay legs reference active predictions",
          passed: true,
        },
      ],
      summary: "Parlay dependencies linked correctly.",
      executedAt: "2026-04-15T00:40:00.000Z",
    }),
    createValidation({
      id: "val-predictions-market-shape",
      targetType: "prediction",
      targetId: predictions[0]?.id ?? "pred-boca-home",
      kind: "prediction-settlement",
      status: "partial",
      checks: [
        {
          code: "market-supported",
          message: "Markets mapped to supported publication schema",
          passed: true,
        },
        {
          code: "freshness-window",
          message: "One prediction is close to refresh threshold",
          passed: false,
        },
      ],
      summary: "Publication schema is valid, but one prediction is nearing freshness threshold.",
      executedAt: "2026-04-15T00:45:00.000Z",
    }),
  ];
}

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
    });

    return snapshot;
  } finally {
    await client.$disconnect();
  }
}

export async function loadOperationSnapshotFromUnitOfWork(
  unitOfWork: Pick<
    StorageUnitOfWork,
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
  >,
  input: {
    readonly generatedAt?: string;
    readonly rawBatches?: readonly RawIngestionBatchReadModel[];
    readonly oddsSnapshots?: readonly OddsSnapshotReadModel[];
  } = {},
): Promise<OperationSnapshot> {
  const [
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
  const aiRunMap = new Map(aiRuns.map((aiRun) => [aiRun.id, aiRun]));
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
    fixtures,
    fixtureWorkflows,
    leagueCoveragePolicies,
    teamCoveragePolicies,
    dailyAutomationPolicies,
    auditEvents,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    aiRuns: mappedAiRuns,
    providerStates: createDemoProviderStates(mappedAiRuns, rawBatches),
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
