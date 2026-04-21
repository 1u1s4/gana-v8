import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { createOperationalSummary, type
  AiRunReadModel,
  type CoverageDailyScopeReadModel,
  getDailyAutomationPolicy,
  listCoverageDailyScope,
  type OperationSnapshot,
  type OperationalLogEntry,
  type OperationalSummary,
  type ProviderStateReadModel,
  type PublicApiHealth,
  type RawIngestionBatchReadModel,
  type SandboxCertificationDetailReadModel,
  type SandboxCertificationReadModel,
  type ValidationSummary,
  type OddsSnapshotReadModel,
  publicApiEndpointPaths,
} from "@gana-v8/public-api";

export interface OperatorConsoleFixture {
  readonly id: string;
  readonly competition: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly status: string;
  readonly researchRecommendedLean?: string | null;
  readonly featureReadinessStatus?: string | null;
  readonly featureReadinessReasons?: string | null;
  readonly researchGeneratedAt?: string | null;
  readonly manualSelectionStatus?: string | null;
  readonly manualSelectionBy?: string | null;
  readonly selectionOverride?: string | null;
  readonly scoringEligibilityReason?: string | null;
  readonly recentAuditEvents?: readonly string[];
}

export interface OperatorConsolePrediction {
  readonly id: string;
  readonly fixtureId: string;
  readonly aiRunId?: string | null;
  readonly market: string;
  readonly outcome: string;
  readonly confidence: number;
  readonly status: string;
}

export interface OperatorConsoleParlay {
  readonly id: string;
  readonly status: string;
  readonly expectedPayout: number;
  readonly legs: readonly {
    readonly predictionId: string;
    readonly fixtureId: string;
  }[];
}

export interface OperatorConsoleTask {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly priority: number;
  readonly scheduledFor: string | null;
  readonly attempts: number;
}

export interface OperatorConsoleTaskRun {
  readonly id: string;
  readonly taskId: string;
  readonly attemptNumber: number;
  readonly status: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly error: string | null;
}

export interface OperatorConsoleEtlSummary {
  readonly rawBatchCount: number;
  readonly oddsSnapshotCount: number;
  readonly latestBatch: RawIngestionBatchReadModel | null;
  readonly latestOddsSnapshot: OddsSnapshotReadModel | null;
  readonly endpointCounts: Readonly<Record<string, number>>;
}

export interface OperatorConsoleCoveragePolicy {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly priority: number;
}

export interface OperatorConsoleSandboxCertification extends SandboxCertificationReadModel {}

export interface OperatorConsoleSnapshot {
  readonly generatedAt: string;
  readonly fixtures: readonly OperatorConsoleFixture[];
  readonly predictions: readonly OperatorConsolePrediction[];
  readonly parlays: readonly OperatorConsoleParlay[];
  readonly tasks: readonly OperatorConsoleTask[];
  readonly taskRuns: readonly OperatorConsoleTaskRun[];
  readonly aiRuns: readonly AiRunReadModel[];
  readonly providerStates: readonly ProviderStateReadModel[];
  readonly etl: OperatorConsoleEtlSummary;
  readonly operationalSummary: OperationalSummary;
  readonly operationalLogs: readonly OperationalLogEntry[];
  readonly validationSummary: ValidationSummary;
  readonly health: PublicApiHealth;
  readonly leagueCoveragePolicies: readonly OperatorConsoleCoveragePolicy[];
  readonly teamCoveragePolicies: readonly OperatorConsoleCoveragePolicy[];
  readonly dailyAutomationPolicy: {
    readonly policyName: string;
    readonly timezone: string;
    readonly minAllowedOdd: number;
    readonly requireTrackedLeagueOrTeam: boolean;
  } | null;
  readonly coverageDailyScope: readonly CoverageDailyScopeReadModel[];
  readonly sandboxCertification: readonly OperatorConsoleSandboxCertification[];
}

export interface OperatorConsolePanel {
  readonly title: string;
  readonly lines: readonly string[];
}

export interface OperatorConsoleModel {
  readonly generatedAt: string;
  readonly health: PublicApiHealth;
  readonly validationSummary: ValidationSummary;
  readonly alerts: readonly string[];
  readonly panels: readonly OperatorConsolePanel[];
  readonly operationalLogs: readonly OperationalLogEntry[];
}

export interface OperatorConsoleRemoteOptions {
  readonly publicApiBaseUrl: string;
  readonly publicApiToken?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface OperatorConsoleWebPayload {
  readonly generatedAt: string;
  readonly snapshot: OperatorConsoleSnapshot;
  readonly certification: readonly OperatorConsoleSandboxCertification[];
  readonly model: OperatorConsoleModel;
}

export interface OperatorConsoleWebServerOptions extends OperatorConsoleRemoteOptions {
  readonly title?: string;
}

export const workspaceInfo = {
  packageName: "@gana-v8/operator-console",
  workspaceName: "operator-console",
  category: "app",
  description:
    "CLI-style operator console adapter for ops snapshots, ETL visibility, task queue state, and validation panels.",
  dependencies: [
    { name: "@gana-v8/authz", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/public-api", category: "workspace" },
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

const sortByNewest = <T extends { readonly id: string }>(
  items: readonly T[],
  selector: (item: T) => string | null | undefined,
): T[] => {
  return [...items].sort((left, right) => {
    const leftValue = Date.parse(selector(left) ?? "1970-01-01T00:00:00.000Z");
    const rightValue = Date.parse(selector(right) ?? "1970-01-01T00:00:00.000Z");
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }

    return left.id.localeCompare(right.id);
  });
};

const summarizeEndpointCounts = (
  rawBatches: readonly RawIngestionBatchReadModel[],
): Readonly<Record<string, number>> => {
  return rawBatches.reduce<Record<string, number>>((counts, batch) => {
    counts[batch.endpointFamily] = (counts[batch.endpointFamily] ?? 0) + 1;
    return counts;
  }, {});
};

const formatEndpointCounts = (endpointCounts: Readonly<Record<string, number>>): string => {
  const entries = Object.entries(endpointCounts).sort((left, right) => left[0].localeCompare(right[0]));
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, count]) => `${key}:${count}`).join(" | ");
};

const countTaskStatuses = (
  tasks: readonly OperatorConsoleTask[],
): Readonly<Record<string, number>> => {
  return tasks.reduce<Record<string, number>>((counts, task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    return counts;
  }, {});
};

const countTaskRunStatuses = (
  taskRuns: readonly OperatorConsoleTaskRun[],
): Readonly<Record<string, number>> => {
  return taskRuns.reduce<Record<string, number>>((counts, taskRun) => {
    counts[taskRun.status] = (counts[taskRun.status] ?? 0) + 1;
    return counts;
  }, {});
};

const formatStatusCounts = (counts: Readonly<Record<string, number>>): string => {
  const entries = Object.entries(counts).sort((left, right) => left[0].localeCompare(right[0]));
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([status, count]) => `${status}:${count}`).join(" | ");
};

const latestTaskRuns = (taskRuns: readonly OperatorConsoleTaskRun[], limit = 5): OperatorConsoleTaskRun[] =>
  sortByNewest(taskRuns, (taskRun) => taskRun.finishedAt ?? taskRun.startedAt).slice(0, limit);

const latestTasks = (tasks: readonly OperatorConsoleTask[], limit = 5): OperatorConsoleTask[] =>
  sortByNewest(tasks, (task) => task.scheduledFor).slice(0, limit);

const failedTaskRuns = (taskRuns: readonly OperatorConsoleTaskRun[]): OperatorConsoleTaskRun[] =>
  latestTaskRuns(taskRuns.filter((taskRun) => taskRun.status === "failed"), 3);

const summarizeFixtureResearchReasons = (
  research: OperationSnapshot["fixtureResearch"][number] | undefined,
): string | null => {
  if (!research) {
    return null;
  }

  const readinessReasons = research.latestSnapshot?.featureReadinessReasons ?? [];
  if (readinessReasons.length > 0) {
    return readinessReasons.join("; ");
  }

  if (research.gateReasons.length > 0) {
    return research.gateReasons.map((reason) => reason.message).join("; ");
  }

  return null;
};

export function createOperatorConsoleSnapshotFromOperation(
  operationSnapshot: OperationSnapshot,
  certification: readonly OperatorConsoleSandboxCertification[] = [],
): OperatorConsoleSnapshot {
  const tasks: OperatorConsoleTask[] = operationSnapshot.tasks.map((task) => ({
    id: task.id,
    kind: task.kind,
    status: task.status,
    priority: task.priority,
    scheduledFor: task.scheduledFor ?? null,
    attempts: task.attempts.length,
  }));

  const taskRuns: OperatorConsoleTaskRun[] = operationSnapshot.taskRuns.map((taskRun) => ({
    id: taskRun.id,
    taskId: taskRun.taskId,
    attemptNumber: taskRun.attemptNumber,
    status: taskRun.status,
    startedAt: taskRun.startedAt,
    finishedAt: taskRun.finishedAt ?? null,
    error: taskRun.error ?? null,
  }));

  const latestBatch = sortByNewest(operationSnapshot.rawBatches, (batch) => batch.extractionTime)[0] ?? null;
  const latestOddsSnapshot =
    sortByNewest(operationSnapshot.oddsSnapshots, (snapshot) => snapshot.capturedAt)[0] ?? null;
  const fixtureWorkflows = operationSnapshot.fixtureWorkflows ?? [];
  const fixtureResearch = operationSnapshot.fixtureResearch ?? [];
  const coverageDailyScope = listCoverageDailyScope(operationSnapshot);
  const dailyAutomationPolicy = getDailyAutomationPolicy(operationSnapshot);

  return {
    generatedAt: operationSnapshot.generatedAt,
    fixtures: operationSnapshot.fixtures.map((fixture) => {
      const workflow = fixtureWorkflows.find((candidate) => candidate.fixtureId === fixture.id);
      const research = fixtureResearch.find((candidate) => candidate.fixtureId === fixture.id);
      const latestFixtureOddsSnapshot =
        sortByNewest(
          operationSnapshot.oddsSnapshots.filter((snapshot) => snapshot.fixtureId === fixture.id),
          (snapshot) => snapshot.capturedAt,
        )[0] ?? null;
      const scoringEligibilityReason =
        workflow?.selectionOverride === "force-exclude" || workflow?.manualSelectionStatus === "rejected"
          ? "Fixture is force-excluded by workflow ops."
          : !research
            ? "No persisted research bundle found for fixture."
            : !research.publishable
              ? `Research bundle status ${research.status} is not publishable.` +
                (research.gateReasons.length > 0
                  ? ` ${research.gateReasons.map((reason) => reason.message).join("; ")}`
                  : "")
          : workflow?.selectionOverride === "force-include"
            ? "Fixture is force-included by workflow ops."
            : workflow?.manualSelectionStatus === "selected"
              ? "Fixture is manually selected in workflow ops."
              : fixture.status !== "scheduled"
                ? `Fixture status ${fixture.status} is not eligible for scoring.`
                : latestFixtureOddsSnapshot === null
                  ? "No latest h2h odds snapshot found for fixture."
                  : "Fixture is eligible for scoring.";
      const recentAuditEvents = sortByNewest(
        (operationSnapshot.auditEvents ?? []).filter(
          (auditEvent) =>
            auditEvent.aggregateType === "fixture-workflow" && auditEvent.aggregateId === fixture.id,
        ),
        (auditEvent) => auditEvent.occurredAt,
      )
        .slice(0, 5)
        .map((auditEvent) => {
          const payloadReason = typeof auditEvent.payload.reason === "string" ? auditEvent.payload.reason : null;
          return `${auditEvent.eventType} @ ${auditEvent.occurredAt}${payloadReason ? ` | ${payloadReason}` : ""}`;
        });
      return {
        id: fixture.id,
        competition: fixture.competition,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        status: fixture.status,
        researchRecommendedLean:
          research?.latestSnapshot?.recommendedLean ??
          research?.latestBundle.recommendedLean ??
          null,
        featureReadinessStatus:
          research?.latestSnapshot?.featureReadinessStatus ?? null,
        featureReadinessReasons: summarizeFixtureResearchReasons(research ?? undefined),
        researchGeneratedAt:
          research?.latestSnapshot?.generatedAt ??
          research?.latestBundle.generatedAt ??
          null,
        manualSelectionStatus: workflow?.manualSelectionStatus ?? null,
        manualSelectionBy: workflow?.manualSelectionBy ?? null,
        selectionOverride: workflow?.selectionOverride ?? null,
        scoringEligibilityReason,
        recentAuditEvents,
      };
    }),
    predictions: operationSnapshot.predictions.map((prediction) => ({
      id: prediction.id,
      fixtureId: prediction.fixtureId,
      aiRunId: prediction.aiRunId ?? null,
      market: prediction.market,
      outcome: prediction.outcome,
      confidence: prediction.confidence,
      status: prediction.status,
    })),
    parlays: operationSnapshot.parlays.map((parlay) => ({
      id: parlay.id,
      status: parlay.status,
      expectedPayout: parlay.expectedPayout,
      legs: parlay.legs.map((leg) => ({
        predictionId: leg.predictionId,
        fixtureId: leg.fixtureId,
      })),
    })),
    tasks,
    taskRuns,
    aiRuns: operationSnapshot.aiRuns,
    providerStates: operationSnapshot.providerStates,
    etl: {
      rawBatchCount: operationSnapshot.rawBatches.length,
      oddsSnapshotCount: operationSnapshot.oddsSnapshots.length,
      latestBatch,
      latestOddsSnapshot,
      endpointCounts: summarizeEndpointCounts(operationSnapshot.rawBatches),
    },
    operationalSummary: createOperationalSummary(operationSnapshot),
    operationalLogs: [
      ...operationSnapshot.taskRuns.map((taskRun) => ({
        id: `${taskRun.id}:task-run`,
        timestamp: taskRun.finishedAt ?? taskRun.updatedAt,
        level: taskRun.status === "failed" ? ("ERROR" as const) : ("INFO" as const),
        taskId: taskRun.taskId,
        taskRunId: taskRun.id,
        taskKind: operationSnapshot.tasks.find((task) => task.id === taskRun.taskId)?.kind ?? "unknown",
        taskStatus: taskRun.status,
        message:
          taskRun.error ??
          `${operationSnapshot.tasks.find((task) => task.id === taskRun.taskId)?.kind ?? "task"} attempt ${taskRun.attemptNumber} ${taskRun.status}`,
      })),
      ...operationSnapshot.tasks.map((task) => ({
        id: `${task.id}:task`,
        timestamp: task.updatedAt,
        level: task.status === "failed" ? ("ERROR" as const) : ("INFO" as const),
        taskId: task.id,
        taskKind: task.kind,
        taskStatus: task.status,
        message: `${task.kind} ${task.status}`,
      })),
    ].sort((left, right) => {
      if (left.level !== right.level) {
        return left.level === "ERROR" ? -1 : 1;
      }
      if (("taskRunId" in left) !== ("taskRunId" in right)) {
        return "taskRunId" in left ? -1 : 1;
      }

      return right.timestamp.localeCompare(left.timestamp);
    }),
    validationSummary: operationSnapshot.validationSummary,
    health: operationSnapshot.health,
    leagueCoveragePolicies: (operationSnapshot.leagueCoveragePolicies ?? []).map((policy) => ({
      id: policy.id,
      label: `${policy.leagueName} (${policy.leagueKey})`,
      enabled: policy.enabled,
      priority: policy.priority,
    })),
    teamCoveragePolicies: (operationSnapshot.teamCoveragePolicies ?? []).map((policy) => ({
      id: policy.id,
      label: `${policy.teamName} (${policy.teamKey})`,
      enabled: policy.enabled,
      priority: policy.priority,
    })),
    dailyAutomationPolicy: dailyAutomationPolicy
      ? {
          policyName: dailyAutomationPolicy.policyName,
          timezone: dailyAutomationPolicy.timezone,
          minAllowedOdd: dailyAutomationPolicy.minAllowedOdd,
          requireTrackedLeagueOrTeam: dailyAutomationPolicy.requireTrackedLeagueOrTeam,
        }
      : null,
    coverageDailyScope,
    sandboxCertification: [...certification],
  };
}

export function createOperatorConsoleSnapshot(
  input: Partial<OperatorConsoleSnapshot> = {},
): OperatorConsoleSnapshot {
  return {
    generatedAt: input.generatedAt ?? "2026-04-15T01:00:00.000Z",
    fixtures:
      input.fixtures ??
      [
        {
          id: "fx-boca-river",
          competition: "Liga Profesional",
          homeTeam: "Boca Juniors",
          awayTeam: "River Plate",
          status: "scheduled",
        },
        {
          id: "fx-inter-milan",
          competition: "Serie A",
          homeTeam: "Inter",
          awayTeam: "Milan",
          status: "scheduled",
        },
      ],
    predictions:
      input.predictions ??
      [
        {
          id: "pred-boca-home",
          fixtureId: "fx-boca-river",
          aiRunId: "airun-demo-scoring",
          market: "moneyline",
          outcome: "home",
          confidence: 0.64,
          status: "published",
        },
        {
          id: "pred-inter-over",
          fixtureId: "fx-inter-milan",
          aiRunId: "airun-demo-scoring",
          market: "totals",
          outcome: "over",
          confidence: 0.58,
          status: "published",
        },
      ],
    parlays:
      input.parlays ??
      [
        {
          id: "parlay-core-slate",
          status: "ready",
          expectedPayout: 91.65,
          legs: [
            { predictionId: "pred-boca-home", fixtureId: "fx-boca-river" },
            { predictionId: "pred-inter-over", fixtureId: "fx-inter-milan" },
          ],
        },
      ],
    tasks:
      input.tasks ??
      [
        {
          id: "task-demo-fixtures",
          kind: "fixture-ingestion",
          status: "succeeded",
          priority: 80,
          scheduledFor: "2026-04-15T00:00:00.000Z",
          attempts: 1,
        },
      ],
    taskRuns:
      input.taskRuns ??
      [
        {
          id: "task-demo-fixtures:attempt:1",
          taskId: "task-demo-fixtures",
          attemptNumber: 1,
          status: "succeeded",
          startedAt: "2026-04-15T00:00:00.000Z",
          finishedAt: "2026-04-15T00:01:00.000Z",
          error: null,
        },
      ],
    aiRuns:
      input.aiRuns ??
      [
        {
          id: "airun-demo-scoring",
          taskId: "task-demo-fixtures",
          provider: "internal",
          model: "deterministic-moneyline-v1",
          promptVersion: "scoring-worker-mvp-v1",
          latestPromptVersion: "scoring-worker-mvp-v1",
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
        },
      ],
    providerStates:
      input.providerStates ??
      [
        {
          provider: "internal",
          latestModel: "deterministic-moneyline-v1",
          latestPromptVersion: "scoring-worker-mvp-v1",
          aiRunCount: 1,
          failedAiRunCount: 0,
          latestAiRunAt: "2026-04-15T00:10:05.000Z",
          rawBatchCount: 1,
          latestRawBatchAt: "2026-04-15T00:01:00.000Z",
          latestRawBatchStatus: "succeeded",
          quota: {
            limit: 1000,
            used: 320,
            remaining: 680,
            updatedAt: "2026-04-15T00:10:05.000Z",
          },
        },
      ],
    etl:
      input.etl ??
      {
        rawBatchCount: 1,
        oddsSnapshotCount: 1,
        latestBatch: {
          id: "raw-batch-demo-fixtures",
          endpointFamily: "fixtures",
          providerCode: "api-football",
          extractionStatus: "succeeded",
          extractionTime: "2026-04-15T00:01:00.000Z",
          recordCount: 2,
        },
        latestOddsSnapshot: {
          id: "odds-demo-boca-river",
          fixtureId: "fx-boca-river",
          providerFixtureId: "fixture-123",
          bookmakerKey: "bet365",
          marketKey: "h2h",
          capturedAt: "2026-04-15T00:02:00.000Z",
          selectionCount: 3,
        },
        endpointCounts: {
          fixtures: 1,
        },
      },
    operationalSummary:
      input.operationalSummary ??
      {
        generatedAt: input.generatedAt ?? "2026-04-15T01:00:00.000Z",
        taskCounts: {
          total: 1,
          queued: 0,
          running: 0,
          failed: 0,
          succeeded: 1,
          cancelled: 0,
        },
        taskRunCounts: {
          total: 1,
          running: 0,
          failed: 0,
          succeeded: 1,
          cancelled: 0,
        },
        etl: {
          rawBatchCount: 1,
          oddsSnapshotCount: 1,
          endpointCounts: { fixtures: 1 },
          latestBatch: {
            id: "raw-batch-demo-fixtures",
            endpointFamily: "fixtures",
            providerCode: "api-football",
            extractionStatus: "succeeded",
            extractionTime: "2026-04-15T00:01:00.000Z",
            recordCount: 2,
          },
          latestOddsSnapshot: {
            id: "odds-demo-boca-river",
            fixtureId: "fx-boca-river",
            providerFixtureId: "fixture-123",
            bookmakerKey: "bet365",
            marketKey: "h2h",
            capturedAt: "2026-04-15T00:02:00.000Z",
            selectionCount: 3,
          },
        },
        observability: {
          workers: [
            {
              worker: "ingestion-worker",
              taskKinds: ["fixture-ingestion"],
              totalRuns: 1,
              runningRuns: 0,
              failedRuns: 0,
              succeededRuns: 1,
              cancelledRuns: 0,
              latestRunAt: "2026-04-15T00:01:00.000Z",
            },
          ],
          providers: [
            {
              provider: "internal",
              aiRunCount: 1,
              failedAiRunCount: 0,
              rawBatchCount: 1,
              latestActivityAt: "2026-04-15T00:03:00.000Z",
            },
          ],
          retries: {
            queuedWithRetryHistory: 0,
            retryingNow: 0,
            failed: 0,
            quarantined: 0,
            exhausted: 0,
          },
          backfills: [
            { area: "fixtures", status: "ok", detail: "Latest fixtures batch is fresh" },
            { area: "odds", status: "ok", detail: "Latest odds snapshot is fresh" },
            { area: "validation", status: "ok", detail: "Validation surface is current" },
          ],
          traceability: {
            tasksWithTraceId: 1,
            tasksWithoutTraceId: 0,
            taskTraceCoverageRate: 1,
            aiRunsWithProviderRequestId: 1,
            aiRunsWithoutProviderRequestId: 0,
            aiRunRequestCoverageRate: 1,
          },
          alerts: [],
        },
        policy: {
          status: "ready",
          publishAllowed: true,
          retryRecommended: false,
          backfillRequired: false,
          gates: [
            { name: "health", status: "pass", detail: "Health checks are green" },
            { name: "retries", status: "pass", detail: "Retry queue is healthy" },
            { name: "backfills", status: "pass", detail: "No backfill required" },
            { name: "traceability", status: "pass", detail: "task traces 100% | provider requests 100%" },
            { name: "publication-readiness", status: "pass", detail: "Publish allowed" },
          ],
          summary: "Operator policy ready",
        },
        validation: input.validationSummary ?? {
          total: 2,
          passed: 1,
          failed: 0,
          partial: 1,
          pending: 0,
          completionRate: 1,
        },
      },
    operationalLogs:
      input.operationalLogs ??
      [
        {
          id: "task-demo-fixtures:attempt:1:task-run",
          timestamp: "2026-04-15T00:01:00.000Z",
          level: "INFO",
          taskId: "task-demo-fixtures",
          taskRunId: "task-demo-fixtures:attempt:1",
          taskKind: "fixture-ingestion",
          taskStatus: "succeeded",
          message: "fixture-ingestion attempt 1 succeeded",
        },
        {
          id: "task-demo-fixtures:task",
          timestamp: "2026-04-15T00:01:00.000Z",
          level: "INFO",
          taskId: "task-demo-fixtures",
          taskKind: "fixture-ingestion",
          taskStatus: "succeeded",
          message: "fixture-ingestion succeeded",
        },
      ],
    validationSummary:
      input.validationSummary ??
      {
        total: 2,
        passed: 1,
        failed: 0,
        partial: 1,
        pending: 0,
        completionRate: 1,
      },
    health:
      input.health ??
      {
        status: "ok",
        generatedAt: input.generatedAt ?? "2026-04-15T01:00:00.000Z",
        checks: [
          {
            name: "fixtures",
            status: "pass",
            detail: "2 fixture(s) in snapshot",
          },
          {
            name: "tasks",
            status: "pass",
            detail: "1 task(s) in snapshot",
          },
          {
            name: "predictions",
            status: "pass",
            detail: "2 prediction(s) in snapshot",
          },
          {
            name: "validations",
            status: "pass",
            detail: "1 passed / 0 failed / 1 partial / 0 pending",
          },
        ],
      },
    leagueCoveragePolicies: input.leagueCoveragePolicies ?? [],
    teamCoveragePolicies: input.teamCoveragePolicies ?? [],
    dailyAutomationPolicy: input.dailyAutomationPolicy ?? null,
    coverageDailyScope: input.coverageDailyScope ?? [],
    sandboxCertification: input.sandboxCertification ?? [],
  };
}

export function buildOperatorConsoleModel(
  snapshot: OperatorConsoleSnapshot = createOperatorConsoleSnapshot(),
): OperatorConsoleModel {
  const alerts = [
    ...snapshot.health.checks
      .filter((check) => check.status === "warn")
      .map((check) => `${check.name}: ${check.detail}`),
    ...snapshot.operationalLogs
      .filter((log) => log.level === "ERROR")
      .slice(0, 3)
      .map((log) => `${log.taskId}: ${log.message}`),
    ...snapshot.providerStates
      .filter((providerState) => (providerState.quota?.remaining ?? 999999) <= 50)
      .map(
        (providerState) =>
          `${providerState.provider}: quota remaining ${providerState.quota?.remaining ?? "unknown"}`,
      ),
    ...snapshot.providerStates
      .filter((providerState) => providerState.failedAiRunCount > 0)
      .map(
        (providerState) =>
          `${providerState.provider}: ${providerState.failedAiRunCount} failed ai run(s)`,
      ),
    ...snapshot.operationalSummary.observability.alerts,
    ...(snapshot.operationalSummary.policy.status !== "ready"
      ? [`policy: ${snapshot.operationalSummary.policy.summary}`]
      : []),
    ...snapshot.sandboxCertification
      .filter((certification) => certification.status !== "passed")
      .map(
        (certification) =>
          `sandbox:${certification.profileName}/${certification.packId} ${certification.status} (${certification.diffEntryCount} diff)`,
      ),
  ];

  const panels: OperatorConsolePanel[] = [
    {
      title: "Overview",
      lines: [
        `Generated at: ${snapshot.generatedAt}`,
        `Health: ${snapshot.health.status}`,
        `Fixtures: ${snapshot.fixtures.length}`,
        `Tasks: ${snapshot.tasks.length}`,
        `Task runs: ${snapshot.taskRuns.length}`,
        `Predictions: ${snapshot.predictions.length}`,
        `Parlays: ${snapshot.parlays.length}`,
      ],
    },
    {
      title: "ETL",
      lines: [
        `Raw batches: ${snapshot.operationalSummary.etl.rawBatchCount}`,
        `Odds snapshots: ${snapshot.operationalSummary.etl.oddsSnapshotCount}`,
        `Endpoint families: ${formatEndpointCounts(snapshot.operationalSummary.etl.endpointCounts)}`,
        `Latest batch: ${
          snapshot.operationalSummary.etl.latestBatch
            ? `${snapshot.operationalSummary.etl.latestBatch.id} | ${snapshot.operationalSummary.etl.latestBatch.endpointFamily} | ${snapshot.operationalSummary.etl.latestBatch.extractionStatus} | ${snapshot.operationalSummary.etl.latestBatch.recordCount} record(s)`
            : "none"
        }`,
        `Latest odds snapshot: ${
          snapshot.operationalSummary.etl.latestOddsSnapshot
            ? `${snapshot.operationalSummary.etl.latestOddsSnapshot.id} | ${snapshot.operationalSummary.etl.latestOddsSnapshot.marketKey} | ${snapshot.operationalSummary.etl.latestOddsSnapshot.selectionCount} selection(s)`
            : "none"
        }`,
      ],
    },
    {
      title: "Task queue",
      lines: [
        `Task statuses: ${formatStatusCounts(snapshot.operationalSummary.taskCounts)}`,
        `Task run statuses: ${formatStatusCounts(snapshot.operationalSummary.taskRunCounts)}`,
        ...latestTasks(snapshot.tasks).map(
          (task) =>
            `${task.id} | ${task.kind} | ${task.status} | priority ${task.priority} | attempts ${task.attempts}`,
        ),
      ],
    },
    {
      title: "Operational log",
      lines: snapshot.operationalLogs.slice(0, 5).map(
        (log) => `${log.level} | ${log.taskKind} | ${log.message}`,
      ),
    },
    {
      title: "AI & providers",
      lines: [
        ...snapshot.aiRuns.slice(0, 3).map((aiRun) => {
          const requestId = aiRun.providerRequestId ? ` | request ${aiRun.providerRequestId}` : "";
          const usage = aiRun.usage?.totalTokens ? ` | tokens ${aiRun.usage.totalTokens}` : "";
          const fallback = aiRun.fallbackReason ? ` | fallback ${aiRun.fallbackReason}` : "";
          return `${aiRun.provider} | ${aiRun.model} | ${aiRun.status} | prompt ${aiRun.latestPromptVersion ?? aiRun.promptVersion}${requestId}${usage}${fallback}`;
        }),
        ...snapshot.providerStates.map(
          (providerState) =>
            `${providerState.provider} | aiRuns ${providerState.aiRunCount} | failed ${providerState.failedAiRunCount} | latestPrompt ${providerState.latestPromptVersion ?? "unknown"} | remaining ${providerState.quota?.remaining ?? "unknown"}`,
        ),
      ],
    },
    {
      title: "Sandbox certification",
      lines:
        snapshot.sandboxCertification.length === 0
          ? ["No sandbox certification evidence loaded."]
          : snapshot.sandboxCertification.map(
              (certification) =>
                `${certification.profileName}/${certification.packId} | ${certification.status} | diff ${certification.diffEntryCount} | replay ${certification.replayEventCount} | generated ${certification.generatedAt ?? "missing"}`,
            ),
    },
    {
      title: "Observability",
      lines: [
        `Workers: ${snapshot.operationalSummary.observability.workers.length}`,
        ...snapshot.operationalSummary.observability.workers.map(
          (worker) =>
            `${worker.worker} | runs ${worker.totalRuns} | failed ${worker.failedRuns} | running ${worker.runningRuns}`,
        ),
        `Providers: ${snapshot.operationalSummary.observability.providers.length}`,
        ...snapshot.operationalSummary.observability.providers.map(
          (provider) =>
            `${provider.provider} | ai ${provider.aiRunCount} | failed ${provider.failedAiRunCount} | raw ${provider.rawBatchCount}`,
        ),
        `Retries: retrying ${snapshot.operationalSummary.observability.retries.retryingNow} | quarantined ${snapshot.operationalSummary.observability.retries.quarantined} | exhausted ${snapshot.operationalSummary.observability.retries.exhausted}`,
        `Traceability: tasks ${Math.round(snapshot.operationalSummary.observability.traceability.taskTraceCoverageRate * 100)}% | providers ${Math.round(snapshot.operationalSummary.observability.traceability.aiRunRequestCoverageRate * 100)}%`,
      ],
    },
    {
      title: "Policy",
      lines: [
        `Status: ${snapshot.operationalSummary.policy.status}`,
        `Publish allowed: ${snapshot.operationalSummary.policy.publishAllowed ? "yes" : "no"}`,
        `Backfill required: ${snapshot.operationalSummary.policy.backfillRequired ? "yes" : "no"}`,
        `Retry recommended: ${snapshot.operationalSummary.policy.retryRecommended ? "yes" : "no"}`,
        snapshot.operationalSummary.policy.summary,
        ...snapshot.operationalSummary.policy.gates.map(
          (gate: { status: string; name: string; detail: string }) => `${gate.status.toUpperCase()} | ${gate.name} | ${gate.detail}`,
        ),
      ],
    },
    {
      title: "Traceability",
      lines: snapshot.aiRuns.flatMap((aiRun) => {
        const linkedPredictions = snapshot.predictions.filter((prediction) => prediction.aiRunId === aiRun.id);
        const linkedPredictionIds = new Set(linkedPredictions.map((prediction) => prediction.id));
        const linkedParlays = snapshot.parlays.filter((parlay) =>
          parlay.legs.some((leg) => linkedPredictionIds.has(leg.predictionId)),
        );
        const traceDetails = [
          aiRun.providerRequestId ? `request ${aiRun.providerRequestId}` : null,
          aiRun.outputRef ? `output ${aiRun.outputRef}` : null,
          aiRun.usage?.totalTokens ? `tokens ${aiRun.usage.totalTokens}` : null,
          aiRun.fallbackReason ? `fallback ${aiRun.fallbackReason}` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" | ");

        return [
          `${aiRun.id} | predictions ${linkedPredictions.length} | parlays ${linkedParlays.length}${traceDetails ? ` | ${traceDetails}` : ""}`,
          ...linkedPredictions.map((prediction) => `prediction ${prediction.id} | ${prediction.market}:${prediction.outcome}`),
          ...linkedParlays.map((parlay) => `parlay ${parlay.id} | ${parlay.legs.length} leg(s)`),
        ];
      }),
    },
    {
      title: "Fixture ops",
      lines: snapshot.fixtures.map((fixture) => {
        const predictions = snapshot.predictions.filter((prediction) => prediction.fixtureId === fixture.id);
        const predictionIds = new Set(predictions.map((prediction) => prediction.id));
        const parlays = snapshot.parlays.filter((parlay) =>
          parlay.legs.some((leg) => leg.fixtureId === fixture.id || predictionIds.has(leg.predictionId)),
        );
        const manualSelection = fixture.manualSelectionStatus && fixture.manualSelectionStatus !== "none"
          ? ` | manual ${fixture.manualSelectionStatus}${fixture.manualSelectionBy ? ` by ${fixture.manualSelectionBy}` : ""}`
          : "";
        const selectionOverride = fixture.selectionOverride && fixture.selectionOverride !== "none"
          ? ` | override ${fixture.selectionOverride}`
          : "";
        const eligibility = fixture.scoringEligibilityReason
          ? ` | eligibility ${fixture.scoringEligibilityReason}`
          : "";
        const recentOps = fixture.recentAuditEvents && fixture.recentAuditEvents.length > 0
          ? ` | recent ops ${fixture.recentAuditEvents.join(" ; ")}`
          : "";
        return `${fixture.id} | workflow ${fixture.featureReadinessStatus ?? "unknown"}${manualSelection}${selectionOverride}${eligibility} | predictions ${predictions.length} | parlays ${parlays.length} | validations ${snapshot.validationSummary.total}${recentOps}`;
      }),
    },
    {
      title: "Fixture pipeline",
      lines: snapshot.fixtures.map((fixture) => {
        const readiness = fixture.featureReadinessStatus ?? "unknown";
        const lean = fixture.researchRecommendedLean ?? "n/a";
        const generatedAt = fixture.researchGeneratedAt ?? "n/a";
        const reasons = fixture.featureReadinessReasons ?? "none";
        return `${fixture.homeTeam} vs ${fixture.awayTeam} | lean ${lean} | ${readiness} | researchGeneratedAt ${generatedAt} | reasons ${reasons}`;
      }),
    },
    {
      title: "Coverage registry",
      lines: [
        `Leagues: ${snapshot.leagueCoveragePolicies.length}`,
        `Teams: ${snapshot.teamCoveragePolicies.length}`,
        `Min allowed odd: ${snapshot.dailyAutomationPolicy ? snapshot.dailyAutomationPolicy.minAllowedOdd.toFixed(2) : "n/a"}`,
        `Timezone: ${snapshot.dailyAutomationPolicy?.timezone ?? "n/a"}`,
        `Tracked league/team required: ${snapshot.dailyAutomationPolicy?.requireTrackedLeagueOrTeam ? "yes" : "no"}`,
        ...snapshot.leagueCoveragePolicies.slice(0, 3).map((policy) => `league ${policy.label} | priority ${policy.priority} | ${policy.enabled ? "enabled" : "disabled"}`),
        ...snapshot.teamCoveragePolicies.slice(0, 3).map((policy) => `team ${policy.label} | priority ${policy.priority} | ${policy.enabled ? "enabled" : "disabled"}`),
      ],
    },
    {
      title: "Daily scope",
      lines: snapshot.coverageDailyScope.length > 0
        ? snapshot.coverageDailyScope.map((entry) => {
            const reasons = entry.excludedBy.length > 0
              ? entry.excludedBy.map((reason) => reason.code).join(",")
              : entry.includedBy.map((reason) => reason.code).join(",");
            return `${entry.fixtureId} | included ${entry.included ? "yes" : "no"} | scoring ${entry.eligibleForScoring ? "yes" : "no"} | parlay ${entry.eligibleForParlay ? "yes" : "no"} | reasons ${reasons || "none"}`;
          })
        : ["none"],
    },
    {
      title: "Fixtures",
      lines: snapshot.fixtures.map(
        (fixture) => `${fixture.competition} | ${fixture.homeTeam} vs ${fixture.awayTeam} | ${fixture.status}`,
      ),
    },
    {
      title: "Predictions",
      lines: snapshot.predictions.map(
        (prediction) =>
          `${prediction.id} | ${prediction.market}:${prediction.outcome} | confidence ${prediction.confidence.toFixed(2)} | ${prediction.status}`,
      ),
    },
    {
      title: "Parlays",
      lines: snapshot.parlays.map(
        (parlay) =>
          `${parlay.id} | ${parlay.legs.length} leg(s) | payout ${parlay.expectedPayout.toFixed(2)} | ${parlay.status}`,
      ),
    },
    {
      title: "Validation",
      lines: [
        `Total: ${snapshot.validationSummary.total}`,
        `0 passed? ${snapshot.validationSummary.passed === 0 ? "yes" : "no"}`,
        `Passed: ${snapshot.validationSummary.passed}`,
        `Failed: ${snapshot.validationSummary.failed}`,
        `Partial: ${snapshot.validationSummary.partial}`,
        `Pending: ${snapshot.validationSummary.pending}`,
        `Completion rate: ${(snapshot.validationSummary.completionRate * 100).toFixed(1)}%`,
      ],
    },
    {
      title: "Health checks",
      lines: snapshot.health.checks.map(
        (check) => `${check.status.toUpperCase()} | ${check.name} | ${check.detail}`,
      ),
    },
  ];

  return {
    generatedAt: snapshot.generatedAt,
    health: snapshot.health,
    validationSummary: snapshot.validationSummary,
    alerts,
    panels,
    operationalLogs: snapshot.operationalLogs,
  };
}

export function renderOperatorConsole(model: OperatorConsoleModel): string {
  const header = [
    "Gana V8 Operator Console",
    `Generated at: ${model.generatedAt}`,
    `Health: ${model.health.status.toUpperCase()}`,
    `Alerts: ${model.alerts.length === 0 ? "none" : model.alerts.join("; ")}`,
  ];

  const sections = model.panels.map((panel) => {
    const lines = panel.lines.length === 0 ? ["(no data)"] : panel.lines;
    return [`[${panel.title}]`, ...lines].join("\n");
  });

  return [...header, "", ...sections].join("\n");
}

export function renderSnapshotConsole(
  snapshot: OperatorConsoleSnapshot = createOperatorConsoleSnapshot(),
): string {
  return renderOperatorConsole(buildOperatorConsoleModel(snapshot));
}

const normalizePublicApiBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const getFetchImplementation = (fetchImpl?: typeof fetch): typeof fetch => {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch !== "function") {
    throw new Error("A fetch implementation is required to use the operator console web server.");
  }

  return fetch;
};

const readRequestBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : "";
};

const writeJsonResponse = (
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body, null, 2));
};

const writeTextResponse = (
  response: ServerResponse,
  status: number,
  body: string,
  contentType: string,
): void => {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": contentType.includes("javascript") || contentType.includes("css")
      ? "public, max-age=60"
      : "no-store",
  });
  response.end(body);
};

const buildPublicApiHeaders = (
  token: string | undefined,
  requestHeaders: Readonly<Record<string, string | undefined>> = {},
): Headers => {
  const headers = new Headers();
  headers.set("accept", "application/json");

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  for (const [key, value] of Object.entries(requestHeaders)) {
    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return headers;
};

const requestPublicApi = async (
  options: OperatorConsoleRemoteOptions,
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const fetchImpl = getFetchImplementation(options.fetchImpl);
  const url = `${normalizePublicApiBaseUrl(options.publicApiBaseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = buildPublicApiHeaders(options.publicApiToken, init.headers && !(init.headers instanceof Headers)
    ? Object.fromEntries(Object.entries(init.headers as Record<string, string>).map(([key, value]) => [key, value]))
    : {});

  if (init.headers instanceof Headers) {
    init.headers.forEach((value, key) => headers.set(key, value));
  }

  return fetchImpl(url, {
    ...init,
    headers,
  });
};

const readJsonResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  return (text.length > 0 ? JSON.parse(text) : null) as T;
};

export const loadOperatorConsoleWebPayload = async (
  options: OperatorConsoleRemoteOptions,
): Promise<OperatorConsoleWebPayload> => {
  const [snapshotResponse, certificationResponse] = await Promise.all([
    requestPublicApi(options, publicApiEndpointPaths.snapshot),
    requestPublicApi(options, publicApiEndpointPaths.sandboxCertification),
  ]);
  if (!snapshotResponse.ok) {
    const failure = await readJsonResponse<Record<string, unknown>>(snapshotResponse);
    throw new Error(
      `Unable to load operator console snapshot (${snapshotResponse.status}): ${JSON.stringify(failure)}`,
    );
  }

  const operationSnapshot = await readJsonResponse<OperationSnapshot>(snapshotResponse);
  const certification =
    certificationResponse.ok
      ? await readJsonResponse<readonly OperatorConsoleSandboxCertification[]>(certificationResponse)
      : [];
  const snapshot = createOperatorConsoleSnapshotFromOperation(operationSnapshot, certification);

  return {
    generatedAt: snapshot.generatedAt,
    snapshot,
    certification,
    model: buildOperatorConsoleModel(snapshot),
  };
};

const OPERATOR_CONSOLE_TITLE = "Gana V8 Operator Console";

const renderOperatorConsoleWebHtml = (title: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="app-shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Harness Control Surface</p>
          <h1>${title}</h1>
          <p class="lede">Fixtures, queue health, AI traceability, ETL pressure, and workflow overrides in one place.</p>
        </div>
        <div class="hero-actions">
          <span class="connection-pill" data-status>Connecting...</span>
          <button class="primary-button" type="button" data-refresh>Refresh</button>
        </div>
      </header>
      <main class="dashboard-root" data-app></main>
    </div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;

const OPERATOR_CONSOLE_WEB_STYLES = `
:root {
  --bg: #f4efe7;
  --bg-accent: #efe0cc;
  --surface: rgba(255, 252, 247, 0.86);
  --surface-strong: #fffdf8;
  --line: rgba(37, 50, 61, 0.12);
  --text: #23323d;
  --muted: #62727f;
  --success: #1f7a54;
  --warn: #b76b1c;
  --danger: #a73929;
  --accent: #bf4f2c;
  --accent-strong: #8b3217;
  --shadow: 0 18px 50px rgba(35, 50, 61, 0.08);
  --radius: 22px;
  --font-sans: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(191, 79, 44, 0.16), transparent 30%),
    radial-gradient(circle at top right, rgba(51, 120, 94, 0.12), transparent 34%),
    linear-gradient(180deg, #f7f1e8 0%, #f1e7d8 100%);
  font-family: var(--font-sans);
}

.app-shell {
  width: min(1400px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) + 4px);
  background: linear-gradient(135deg, rgba(255, 253, 248, 0.96), rgba(244, 231, 216, 0.92));
  box-shadow: var(--shadow);
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
}

.hero h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.6rem);
  line-height: 0.95;
}

.lede {
  margin: 12px 0 0;
  max-width: 720px;
  font-size: 1rem;
  color: var(--muted);
}

.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: end;
}

.connection-pill,
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.72);
  font-size: 0.9rem;
  font-weight: 600;
}

.badge-ok {
  color: var(--success);
}

.badge-warn {
  color: var(--warn);
}

.badge-error {
  color: var(--danger);
}

.primary-button,
.ghost-button,
.fixture-action {
  appearance: none;
  border: 0;
  cursor: pointer;
  font: inherit;
}

.primary-button {
  padding: 11px 18px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff8f3;
  box-shadow: 0 12px 26px rgba(191, 79, 44, 0.24);
}

.primary-button:hover {
  background: var(--accent-strong);
}

.dashboard-root {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}

.surface {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
}

.surface-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 0;
}

.surface-header h2,
.surface-header h3 {
  margin: 0;
}

.surface-body {
  padding: 18px 20px 20px;
}

.metric-grid,
.panel-grid {
  display: grid;
  gap: 16px;
}

.metric-grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.panel-grid {
  grid-template-columns: minmax(0, 1.8fr) minmax(320px, 1fr);
  align-items: start;
}

.card-stack {
  display: grid;
  gap: 16px;
}

.metric-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface-strong);
}

.metric-card .label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.metric-card .value {
  font-size: 1.9rem;
  font-weight: 700;
}

.alert-list {
  display: grid;
  gap: 10px;
}

.alert-item {
  padding: 12px 14px;
  border-left: 4px solid var(--warn);
  border-radius: 14px;
  background: rgba(255, 250, 244, 0.95);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  text-align: left;
}

th {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

td strong {
  display: block;
}

.subtle {
  color: var(--muted);
  font-size: 0.92rem;
}

.fixture-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fixture-action {
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.88);
  color: var(--text);
}

.fixture-action[data-tone="include"] {
  color: var(--success);
}

.fixture-action[data-tone="exclude"] {
  color: var(--danger);
}

.fixture-action[data-tone="neutral"] {
  color: var(--accent-strong);
}

.list {
  display: grid;
  gap: 12px;
}

.list-item {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-strong);
}

.list-item.is-selected {
  border-color: rgba(191, 79, 44, 0.45);
  box-shadow: 0 10px 24px rgba(191, 79, 44, 0.12);
}

.list-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.inspector-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.log-line,
.panel-line {
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.panel-card {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
}

.panel-card h3 {
  margin: 0 0 10px;
}

.empty-state {
  padding: 26px;
  text-align: center;
  color: var(--muted);
}

@media (max-width: 980px) {
  .hero,
  .surface-header {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions {
    align-items: stretch;
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }
}
`;

const OPERATOR_CONSOLE_WEB_APP = `
const root = document.querySelector('[data-app]');
const statusNode = document.querySelector('[data-status]');
const refreshButton = document.querySelector('[data-refresh]');
const pollIntervalMs = 30000;
const state = {
  payload: null,
  selectedTaskId: null,
  selectedAiRunId: null,
  selectedCertificationId: null,
  taskDetail: null,
  taskRuns: [],
  aiRunDetail: null,
  certificationDetail: null,
  taskInspectorError: null,
  aiRunInspectorError: null,
  certificationInspectorError: null,
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatBadge = (status) => {
  const normalized = String(status || '').toLowerCase();
  const tone = normalized === 'ok' || normalized === 'published' || normalized === 'succeeded' || normalized === 'completed'
    ? 'badge-ok'
    : normalized === 'warn' || normalized === 'partial' || normalized === 'pending' || normalized === 'queued' || normalized === 'running'
      ? 'badge-warn'
      : 'badge-error';
  return '<span class="badge ' + tone + '">' + escapeHtml(status) + '</span>';
};

const requestJson = async (path, init = {}) => {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error((payload && (payload.message || payload.error)) || 'Request failed');
  }

  return payload;
};

const formatMetricValue = (value) => value === null || value === undefined ? 'n/a' : String(value);

const formatDateTime = (value) => {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString();
};

const renderMetricCard = (label, value, detail) =>
  '<article class="metric-card">' +
    '<span class="label">' + escapeHtml(label) + '</span>' +
    '<div class="value">' + escapeHtml(formatMetricValue(value)) + '</div>' +
    (detail ? '<div class="subtle">' + escapeHtml(detail) + '</div>' : '') +
  '</article>';

const renderAlerts = (model) => {
  if (!model.alerts || model.alerts.length === 0) {
    return '<div class="empty-state">No active alerts.</div>';
  }

  return '<div class="alert-list">' + model.alerts.map((alert) =>
    '<div class="alert-item">' + escapeHtml(alert) + '</div>'
  ).join('') + '</div>';
};

const renderJsonBlock = (value) =>
  '<pre class="log-line">' + escapeHtml(JSON.stringify(value ?? {}, null, 2)) + '</pre>';

const renderFixtureActions = (fixtureId) => {
  const actions = [
    ['manual-select', 'Select', 'neutral'],
    ['manual-reject', 'Reject', 'exclude'],
    ['force-include', 'Force Include', 'include'],
    ['force-exclude', 'Force Exclude', 'exclude'],
    ['clear-manual', 'Clear Manual', 'neutral'],
    ['clear-override', 'Clear Override', 'neutral'],
  ];

  return '<div class="fixture-actions">' + actions.map(([action, label, tone]) =>
    '<button class="fixture-action" type="button" data-fixture-id="' + escapeHtml(fixtureId) + '" data-fixture-action="' + escapeHtml(action) + '" data-tone="' + escapeHtml(tone) + '">' +
      escapeHtml(label) +
    '</button>'
  ).join('') + '</div>';
};

const renderFixturesTable = (snapshot) => {
  if (!snapshot.fixtures || snapshot.fixtures.length === 0) {
    return '<div class="empty-state">No fixtures available.</div>';
  }

  return '<div class="table-wrap"><table><thead><tr>' +
    '<th>Fixture</th><th>Status</th><th>Research</th><th>Workflow</th><th>Scoring</th><th>Actions</th>' +
    '</tr></thead><tbody>' +
    snapshot.fixtures.map((fixture) =>
      '<tr>' +
        '<td><strong>' + escapeHtml(fixture.homeTeam) + ' vs ' + escapeHtml(fixture.awayTeam) + '</strong><span class="subtle">' + escapeHtml(fixture.competition) + '<br />' + escapeHtml(fixture.id) + '</span></td>' +
        '<td>' + formatBadge(fixture.status) + '</td>' +
        '<td><strong>' + escapeHtml(fixture.researchRecommendedLean || 'n/a') + '</strong><span class="subtle">Generated: ' + escapeHtml(fixture.researchGeneratedAt || 'n/a') + '</span></td>' +
        '<td><span class="subtle">Manual: ' + escapeHtml(fixture.manualSelectionStatus || 'none') + ' by ' + escapeHtml(fixture.manualSelectionBy || 'n/a') + '</span><br /><span class="subtle">Override: ' + escapeHtml(fixture.selectionOverride || 'none') + '</span></td>' +
        '<td><span class="subtle">' + escapeHtml(fixture.scoringEligibilityReason || 'n/a') + '</span></td>' +
        '<td>' + renderFixtureActions(fixture.id) + '</td>' +
      '</tr>'
    ).join('') +
    '</tbody></table></div>';
};

const renderTaskButtons = (task, includeInspect) => {
  const buttons = [];
  if (includeInspect) {
    buttons.push(
      '<button class="fixture-action" type="button" data-console-action="inspect-task" data-task-id="' + escapeHtml(task.id) + '" data-tone="neutral">Inspect</button>'
    );
  }
  if (task.status === 'running') {
    buttons.push(
      '<button class="fixture-action" type="button" data-task-action="quarantine" data-task-id="' + escapeHtml(task.id) + '" data-tone="exclude">Quarantine</button>'
    );
  }
  if (task.status === 'failed' || task.status === 'quarantined' || task.status === 'cancelled') {
    buttons.push(
      '<button class="fixture-action" type="button" data-task-action="requeue" data-task-id="' + escapeHtml(task.id) + '" data-tone="include">Requeue</button>'
    );
  }
  return buttons.join('');
};

const renderTaskList = (snapshot) => {
  if (!snapshot.tasks || snapshot.tasks.length === 0) {
    return '<div class="empty-state">No tasks available.</div>';
  }

  return '<div class="list">' + snapshot.tasks.slice(0, 8).map((task) =>
    '<article class="list-item' + (state.selectedTaskId === task.id ? ' is-selected' : '') + '">' +
      '<strong>' + escapeHtml(task.kind) + '</strong>' +
      '<div class="subtle">' + escapeHtml(task.id) + '</div>' +
      '<div>' + formatBadge(task.status) + '</div>' +
      '<div class="subtle">Priority ' + escapeHtml(task.priority) + ' | attempts ' + escapeHtml(task.attempts) + '</div>' +
      '<div class="subtle">Scheduled ' + escapeHtml(formatDateTime(task.scheduledFor)) + '</div>' +
      '<div class="list-actions">' + renderTaskButtons(task, true) + '</div>' +
    '</article>'
  ).join('') + '</div>';
};

const renderAiRuns = (snapshot) => {
  if (!snapshot.aiRuns || snapshot.aiRuns.length === 0) {
    return '<div class="empty-state">No AI runs available.</div>';
  }

  return '<div class="list">' + snapshot.aiRuns.slice(0, 6).map((aiRun) =>
    '<article class="list-item' + (state.selectedAiRunId === aiRun.id ? ' is-selected' : '') + '">' +
      '<strong>' + escapeHtml(aiRun.provider) + ' / ' + escapeHtml(aiRun.model) + '</strong>' +
      '<div>' + formatBadge(aiRun.status) + '</div>' +
      '<div class="subtle">' + escapeHtml(aiRun.id) + '</div>' +
      '<div class="subtle">Prompt ' + escapeHtml(aiRun.latestPromptVersion || aiRun.promptVersion) + '</div>' +
      '<div class="subtle">Request ' + escapeHtml(aiRun.providerRequestId || 'n/a') + '</div>' +
      '<div class="list-actions">' +
        '<button class="fixture-action" type="button" data-console-action="inspect-ai-run" data-ai-run-id="' + escapeHtml(aiRun.id) + '" data-tone="neutral">Inspect</button>' +
      '</div>' +
    '</article>'
  ).join('') + '</div>';
};

const renderCertificationList = (payload) => {
  const certifications = Array.isArray(payload.certification) ? payload.certification : [];
  if (certifications.length === 0) {
    return '<div class="empty-state">No sandbox certification evidence available.</div>';
  }

  return '<div class="list">' + certifications.map((certification) =>
    '<article class="list-item' + (state.selectedCertificationId === certification.id ? ' is-selected' : '') + '">' +
      '<strong>' + escapeHtml(certification.profileName) + ' / ' + escapeHtml(certification.packId) + '</strong>' +
      '<div>' + formatBadge(certification.status) + '</div>' +
      '<div class="subtle">Mode ' + escapeHtml(certification.mode) + ' | replay ' + escapeHtml(certification.replayEventCount) + ' | fixtures ' + escapeHtml(certification.fixtureCount) + '</div>' +
      '<div class="subtle">Generated ' + escapeHtml(formatDateTime(certification.generatedAt)) + ' | diff ' + escapeHtml(certification.diffEntryCount) + '</div>' +
      '<div class="list-actions">' +
        '<button class="fixture-action" type="button" data-console-action="inspect-certification" data-certification-profile="' + escapeHtml(certification.profileName) + '" data-certification-pack="' + escapeHtml(certification.packId) + '" data-tone="neutral">Inspect</button>' +
      '</div>' +
    '</article>'
  ).join('') + '</div>';
};

const renderLogs = (model) => {
  if (!model.operationalLogs || model.operationalLogs.length === 0) {
    return '<div class="empty-state">No operational logs available.</div>';
  }

  return '<div class="list">' + model.operationalLogs.slice(0, 10).map((log) =>
    '<article class="list-item">' +
      '<div><strong>' + escapeHtml(log.level) + '</strong> ' + escapeHtml(log.taskKind) + '</div>' +
      '<div class="subtle">' + escapeHtml(log.timestamp) + '</div>' +
      '<div class="log-line">' + escapeHtml(log.message) + '</div>' +
    '</article>'
  ).join('') + '</div>';
};

const renderPanels = (model) => {
  return '<div class="metric-grid">' + model.panels.map((panel) =>
    '<section class="panel-card">' +
      '<h3>' + escapeHtml(panel.title) + '</h3>' +
      (panel.lines && panel.lines.length > 0
        ? panel.lines.map((line) => '<div class="panel-line">' + escapeHtml(line) + '</div>').join('')
        : '<div class="empty-state">No data.</div>') +
    '</section>'
  ).join('') + '</div>';
};

const renderTaskInspector = () => {
  if (state.taskInspectorError) {
    return '<div class="empty-state">' + escapeHtml(state.taskInspectorError) + '</div>';
  }

  if (!state.taskDetail) {
    return '<div class="empty-state">Select a task to inspect queue state, payload, and runs.</div>';
  }

  const task = state.taskDetail;
  const attempts = Array.isArray(task.attempts) ? task.attempts : [];
  const taskRuns = Array.isArray(state.taskRuns) ? state.taskRuns : [];

  return '<div class="list">' +
    '<article class="list-item is-selected">' +
      '<strong>' + escapeHtml(task.kind) + '</strong>' +
      '<div>' + formatBadge(task.status) + '</div>' +
      '<div class="subtle">' + escapeHtml(task.id) + '</div>' +
      '<div class="subtle">Trigger ' + escapeHtml(task.triggerKind || 'n/a') + ' | priority ' + escapeHtml(task.priority) + ' | max attempts ' + escapeHtml(task.maxAttempts) + '</div>' +
      '<div class="subtle">Scheduled ' + escapeHtml(formatDateTime(task.scheduledFor)) + ' | updated ' + escapeHtml(formatDateTime(task.updatedAt)) + '</div>' +
      (task.lastErrorMessage ? '<div class="alert-item">' + escapeHtml(task.lastErrorMessage) + '</div>' : '') +
      '<div class="list-actions">' + renderTaskButtons(task, false) + '</div>' +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Payload</strong>' +
      renderJsonBlock(task.payload) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Attempts</strong>' +
      (attempts.length === 0
        ? '<div class="empty-state">No attempts recorded.</div>'
        : attempts.map((attempt, index) =>
            '<div class="panel-line">#' + escapeHtml(index + 1) + ' | started ' + escapeHtml(formatDateTime(attempt.startedAt)) + ' | finished ' + escapeHtml(formatDateTime(attempt.finishedAt)) + (attempt.error ? ' | error ' + escapeHtml(attempt.error) : '') + '</div>'
          ).join('')) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Task Runs</strong>' +
      (taskRuns.length === 0
        ? '<div class="empty-state">No task runs available.</div>'
        : taskRuns.map((taskRun) =>
            '<div class="panel-line">#' + escapeHtml(taskRun.attemptNumber) + ' | ' + escapeHtml(taskRun.status) + ' | started ' + escapeHtml(formatDateTime(taskRun.startedAt)) + ' | finished ' + escapeHtml(formatDateTime(taskRun.finishedAt)) + (taskRun.retryScheduledFor ? ' | retry ' + escapeHtml(formatDateTime(taskRun.retryScheduledFor)) : '') + (taskRun.error ? ' | error ' + escapeHtml(taskRun.error) : '') + '</div>'
          ).join('')) +
    '</article>' +
  '</div>';
};

const renderAiRunInspector = () => {
  if (state.aiRunInspectorError) {
    return '<div class="empty-state">' + escapeHtml(state.aiRunInspectorError) + '</div>';
  }

  if (!state.aiRunDetail) {
    return '<div class="empty-state">Select an AI run to inspect provider traceability and linked outputs.</div>';
  }

  const aiRun = state.aiRunDetail;
  const linkedPredictions = Array.isArray(aiRun.linkedPredictions) ? aiRun.linkedPredictions : [];
  const linkedParlays = Array.isArray(aiRun.linkedParlays) ? aiRun.linkedParlays : [];

  return '<div class="list">' +
    '<article class="list-item is-selected">' +
      '<strong>' + escapeHtml(aiRun.provider) + ' / ' + escapeHtml(aiRun.model) + '</strong>' +
      '<div>' + formatBadge(aiRun.status) + '</div>' +
      '<div class="subtle">' + escapeHtml(aiRun.id) + '</div>' +
      '<div class="subtle">Task ' + escapeHtml(aiRun.task ? aiRun.task.kind + ' / ' + aiRun.task.id : aiRun.taskId) + '</div>' +
      '<div class="subtle">Prompt ' + escapeHtml(aiRun.latestPromptVersion || aiRun.promptVersion) + ' | request ' + escapeHtml(aiRun.providerRequestId || 'n/a') + '</div>' +
      '<div class="subtle">Created ' + escapeHtml(formatDateTime(aiRun.createdAt)) + ' | updated ' + escapeHtml(formatDateTime(aiRun.updatedAt)) + '</div>' +
      (aiRun.error ? '<div class="alert-item">' + escapeHtml(aiRun.error) + '</div>' : '') +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Traceability</strong>' +
      '<div class="inspector-grid">' +
        '<section class="panel-card"><h3>Usage</h3>' + renderJsonBlock(aiRun.usage || { note: 'No usage reported' }) + '</section>' +
        '<section class="panel-card"><h3>Refs</h3>' + renderJsonBlock({ outputRef: aiRun.outputRef || null, fallbackReason: aiRun.fallbackReason || null, degraded: aiRun.degraded || false }) + '</section>' +
      '</div>' +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Linked Predictions</strong>' +
      (linkedPredictions.length === 0
        ? '<div class="empty-state">No linked predictions.</div>'
        : linkedPredictions.map((prediction) =>
            '<div class="panel-line">' + escapeHtml(prediction.id) + ' | fixture ' + escapeHtml(prediction.fixtureId) + ' | ' + escapeHtml(prediction.market) + ' ' + escapeHtml(prediction.outcome) + ' | ' + escapeHtml(prediction.status) + ' | confidence ' + escapeHtml(prediction.confidence) + '</div>'
          ).join('')) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Linked Parlays</strong>' +
      (linkedParlays.length === 0
        ? '<div class="empty-state">No linked parlays.</div>'
        : linkedParlays.map((parlay) =>
            '<div class="panel-line">' + escapeHtml(parlay.id) + ' | ' + escapeHtml(parlay.status) + ' | payout ' + escapeHtml(parlay.expectedPayout) + ' | legs ' + escapeHtml(parlay.legCount) + '</div>'
          ).join('')) +
    '</article>' +
  '</div>';
};

const renderCertificationInspector = () => {
  if (state.certificationInspectorError) {
    return '<div class="empty-state">' + escapeHtml(state.certificationInspectorError) + '</div>';
  }

  if (!state.certificationDetail) {
    return '<div class="empty-state">Select a sandbox certification to inspect drift, evidence generation time, and safety rails.</div>';
  }

  const certification = state.certificationDetail;
  const diffEntries = Array.isArray(certification.diffEntries) ? certification.diffEntries : [];
  const assertions = Array.isArray(certification.assertions) ? certification.assertions : [];
  const allowedHosts = Array.isArray(certification.allowedHosts) ? certification.allowedHosts : [];

  return '<div class="list">' +
    '<article class="list-item is-selected">' +
      '<strong>' + escapeHtml(certification.profileName) + ' / ' + escapeHtml(certification.packId) + '</strong>' +
      '<div>' + formatBadge(certification.status) + '</div>' +
      '<div class="subtle">Mode ' + escapeHtml(certification.mode) + ' | generated ' + escapeHtml(formatDateTime(certification.generatedAt)) + '</div>' +
      '<div class="subtle">Golden ' + escapeHtml(certification.goldenPath) + '</div>' +
      '<div class="subtle">Artifact ' + escapeHtml(certification.artifactPath || 'missing') + '</div>' +
      '<div class="subtle">Replay ' + escapeHtml(certification.replayEventCount) + ' | fixtures ' + escapeHtml(certification.fixtureCount) + ' | diff entries ' + escapeHtml(certification.diffEntryCount) + '</div>' +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Safety & assertions</strong>' +
      '<div class="panel-line">Allowed hosts: ' + escapeHtml(allowedHosts.join(', ') || 'none') + '</div>' +
      '<div class="panel-line">Assertions: ' + escapeHtml(assertions.join(', ') || 'none') + '</div>' +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Diff entries</strong>' +
      (diffEntries.length === 0
        ? '<div class="empty-state">No golden drift detected.</div>'
        : diffEntries.map((entry) =>
            '<div class="panel-line">' + escapeHtml(entry.kind.toUpperCase()) + ' ' + escapeHtml(entry.path) + ' | expected ' + escapeHtml(JSON.stringify(entry.expected)) + ' | actual ' + escapeHtml(JSON.stringify(entry.actual)) + '</div>'
          ).join('')) +
    '</article>' +
  '</div>';
};

const renderDashboard = (payload) => {
  const snapshot = payload.snapshot;
  const model = payload.model;
  const metrics = [
    renderMetricCard('Health', snapshot.health.status, 'Generated ' + snapshot.generatedAt),
    renderMetricCard('Fixtures', snapshot.fixtures.length, 'Tracked in console'),
    renderMetricCard('Tasks', snapshot.tasks.length, 'Queue + automation'),
    renderMetricCard('Predictions', snapshot.predictions.length, 'Published + pending'),
    renderMetricCard('Parlays', snapshot.parlays.length, 'Current publication set'),
    renderMetricCard('Validation', snapshot.validationSummary.total, 'Pending ' + snapshot.validationSummary.pending),
  ].join('');

  root.innerHTML =
    '<section class="surface"><div class="surface-body"><div class="metric-grid">' + metrics + '</div></div></section>' +
    '<section class="surface"><div class="surface-header"><h2>Alerts</h2><div>' + formatBadge(snapshot.health.status) + '</div></div><div class="surface-body">' + renderAlerts(model) + '</div></section>' +
    '<section class="panel-grid">' +
      '<section class="surface"><div class="surface-header"><h2>Fixture Workbench</h2><span class="subtle">Manual selection and scoring gates</span></div><div class="surface-body">' + renderFixturesTable(snapshot) + '</div></section>' +
      '<div class="card-stack">' +
        '<section class="surface"><div class="surface-header"><h3>Task Queue</h3></div><div class="surface-body">' + renderTaskList(snapshot) + '</div></section>' +
        '<section class="surface"><div class="surface-header"><h3>AI Runs</h3></div><div class="surface-body">' + renderAiRuns(snapshot) + '</div></section>' +
      '</div>' +
    '</section>' +
    '<section class="panel-grid">' +
      '<section class="surface"><div class="surface-header"><h2>Task Inspector</h2><span class="subtle">Queue state, payload, retry and quarantine controls</span></div><div class="surface-body">' + renderTaskInspector() + '</div></section>' +
      '<section class="surface"><div class="surface-header"><h2>AI Run Inspector</h2><span class="subtle">Provider request ids, prompt versions, linked predictions and parlays</span></div><div class="surface-body">' + renderAiRunInspector() + '</div></section>' +
    '</section>' +
    '<section class="panel-grid">' +
      '<section class="surface"><div class="surface-header"><h2>Sandbox Certification</h2><span class="subtle">Latest golden status by profile and fixture pack</span></div><div class="surface-body">' + renderCertificationList(payload) + '</div></section>' +
      '<section class="surface"><div class="surface-header"><h2>Certification Inspector</h2><span class="subtle">Golden diff, evidence timing, and safety rails</span></div><div class="surface-body">' + renderCertificationInspector() + '</div></section>' +
    '</section>' +
    '<section class="surface"><div class="surface-header"><h2>Operational Log</h2></div><div class="surface-body">' + renderLogs(model) + '</div></section>' +
    '<section class="surface"><div class="surface-header"><h2>Ops Panels</h2><span class="subtle">Derived from public-api snapshots</span></div><div class="surface-body">' + renderPanels(model) + '</div></section>';
};

const setStatus = (text, tone) => {
  statusNode.textContent = text;
  statusNode.className = 'connection-pill ' + (tone || '');
};

const resolveSelectedId = (items, selectedId) => {
  if (selectedId && items.some((item) => item.id === selectedId)) {
    return selectedId;
  }

  return items[0] ? items[0].id : null;
};

const loadTaskInspector = async (taskId) => {
  state.selectedTaskId = taskId;
  state.taskDetail = null;
  state.taskRuns = [];
  state.taskInspectorError = null;
  if (!taskId) {
    return;
  }

  try {
    const encodedTaskId = encodeURIComponent(taskId);
    const [taskDetail, taskRuns] = await Promise.all([
      requestJson('/api/public/tasks/' + encodedTaskId),
      requestJson('/api/public/tasks/' + encodedTaskId + '/runs'),
    ]);
    state.taskDetail = taskDetail;
    state.taskRuns = Array.isArray(taskRuns) ? taskRuns : [];
  } catch (error) {
    state.taskInspectorError = error.message || 'Unable to load task inspector';
  }
};

const loadAiRunInspector = async (aiRunId) => {
  state.selectedAiRunId = aiRunId;
  state.aiRunDetail = null;
  state.aiRunInspectorError = null;
  if (!aiRunId) {
    return;
  }

  try {
    const encodedAiRunId = encodeURIComponent(aiRunId);
    state.aiRunDetail = await requestJson('/api/public/ai-runs/' + encodedAiRunId);
  } catch (error) {
    state.aiRunInspectorError = error.message || 'Unable to load AI run inspector';
  }
};

const loadCertificationInspector = async (profileName, packId) => {
  state.selectedCertificationId = profileName && packId ? profileName + ':' + packId : null;
  state.certificationDetail = null;
  state.certificationInspectorError = null;
  if (!profileName || !packId) {
    return;
  }

  try {
    state.certificationDetail = await requestJson(
      '/api/public/sandbox-certification/' + encodeURIComponent(profileName) + '/' + encodeURIComponent(packId),
    );
  } catch (error) {
    state.certificationInspectorError = error.message || 'Unable to load certification inspector';
  }
};

const syncInspectors = async (payload) => {
  const nextTaskId = resolveSelectedId(payload.snapshot.tasks || [], state.selectedTaskId);
  const nextAiRunId = resolveSelectedId(payload.snapshot.aiRuns || [], state.selectedAiRunId);
  const nextCertificationId = resolveSelectedId(payload.certification || [], state.selectedCertificationId);
  const [nextCertificationProfile, nextCertificationPack] = nextCertificationId ? nextCertificationId.split(':', 2) : [null, null];
  await Promise.all([
    loadTaskInspector(nextTaskId),
    loadAiRunInspector(nextAiRunId),
    loadCertificationInspector(nextCertificationProfile, nextCertificationPack),
  ]);
};

const loadConsole = async () => {
  setStatus('Refreshing...', 'badge-warn');
  refreshButton.disabled = true;

  try {
    const payload = await requestJson('/api/console');
    state.payload = payload;
    await syncInspectors(payload);
    renderDashboard(payload);
    setStatus('Live data connected', 'badge-ok');
  } catch (error) {
    root.innerHTML = '<section class="surface"><div class="surface-body"><div class="empty-state">' + escapeHtml(error.message || 'Unexpected console error') + '</div></div></section>';
    setStatus('Connection degraded', 'badge-error');
  } finally {
    refreshButton.disabled = false;
  }
};

const submitFixtureAction = async (fixtureId, action) => {
  const encodedFixtureId = encodeURIComponent(fixtureId);
  let path = '';
  let body = {};

  if (action === 'manual-select') {
    path = '/api/public/fixtures/' + encodedFixtureId + '/manual-selection';
    body = { status: 'selected', selectedBy: 'operator-console', reason: window.prompt('Reason for manual selection:', 'Selected from operator console') || undefined };
  } else if (action === 'manual-reject') {
    path = '/api/public/fixtures/' + encodedFixtureId + '/manual-selection';
    body = { status: 'rejected', selectedBy: 'operator-console', reason: window.prompt('Reason for rejection:', 'Rejected from operator console') || undefined };
  } else if (action === 'force-include') {
    path = '/api/public/fixtures/' + encodedFixtureId + '/selection-override';
    body = { mode: 'force-include', reason: window.prompt('Reason for force include:', 'Force include from operator console') || undefined };
  } else if (action === 'force-exclude') {
    path = '/api/public/fixtures/' + encodedFixtureId + '/selection-override';
    body = { mode: 'force-exclude', reason: window.prompt('Reason for force exclude:', 'Force exclude from operator console') || undefined };
  } else if (action === 'clear-manual') {
    path = '/api/public/fixtures/' + encodedFixtureId + '/manual-selection/reset';
    body = { reason: window.prompt('Reason to clear manual state:', 'Clear manual selection') || undefined };
  } else if (action === 'clear-override') {
    path = '/api/public/fixtures/' + encodedFixtureId + '/selection-override/reset';
    body = { reason: window.prompt('Reason to clear override:', 'Clear selection override') || undefined };
  } else {
    return false;
  }

  await requestJson(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return true;
};

const submitTaskAction = async (taskId, action) => {
  const encodedTaskId = encodeURIComponent(taskId);
  if (action === 'requeue') {
    await requestJson('/api/public/tasks/' + encodedTaskId + '/requeue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    return true;
  }

  if (action === 'quarantine') {
    const reason = window.prompt('Reason to quarantine task:', 'Quarantined from operator console');
    if (reason === null) {
      return false;
    }
    await requestJson('/api/public/tasks/' + encodedTaskId + '/quarantine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return true;
  }

  return false;
};

const selectTask = async (taskId) => {
  if (!state.payload) {
    return;
  }

  await loadTaskInspector(taskId);
  renderDashboard(state.payload);
};

const selectAiRun = async (aiRunId) => {
  if (!state.payload) {
    return;
  }

  await loadAiRunInspector(aiRunId);
  renderDashboard(state.payload);
};

const selectCertification = async (profileName, packId) => {
  if (!state.payload) {
    return;
  }

  await loadCertificationInspector(profileName, packId);
  renderDashboard(state.payload);
};

refreshButton.addEventListener('click', () => {
  void loadConsole();
});

document.addEventListener('click', async (event) => {
  const target = event.target instanceof HTMLElement
    ? event.target.closest('[data-fixture-action], [data-console-action], [data-task-action]')
    : null;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.setAttribute('disabled', 'true');
  try {
    const fixtureId = target.dataset.fixtureId;
    const fixtureAction = target.dataset.fixtureAction;
    if (fixtureId && fixtureAction) {
      const applied = await submitFixtureAction(fixtureId, fixtureAction);
      if (applied) {
        await loadConsole();
      }
      return;
    }

    const consoleAction = target.dataset.consoleAction;
    if (consoleAction === 'inspect-task' && target.dataset.taskId) {
      await selectTask(target.dataset.taskId);
      return;
    }

    if (consoleAction === 'inspect-ai-run' && target.dataset.aiRunId) {
      await selectAiRun(target.dataset.aiRunId);
      return;
    }

    if (
      consoleAction === 'inspect-certification' &&
      target.dataset.certificationProfile &&
      target.dataset.certificationPack
    ) {
      await selectCertification(target.dataset.certificationProfile, target.dataset.certificationPack);
      return;
    }

    const taskAction = target.dataset.taskAction;
    const taskId = target.dataset.taskId;
    if (taskAction && taskId) {
      const applied = await submitTaskAction(taskId, taskAction);
      if (applied) {
        await loadConsole();
      }
    }
  } catch (error) {
    window.alert(error.message || 'Unable to apply operator action');
  } finally {
    target.removeAttribute('disabled');
  }
});

void loadConsole();
window.setInterval(() => {
  void loadConsole();
}, pollIntervalMs);
`;

const getOperatorConsoleProxyPath = (requestPath: string): string | null => {
  if (!requestPath.startsWith("/api/public")) {
    return null;
  }

  const stripped = requestPath.slice("/api/public".length);
  return stripped.length > 0 ? stripped : "/";
};

export const createOperatorConsoleWebServer = (
  options: OperatorConsoleWebServerOptions,
): Server =>
  createServer((request, response) => {
    void (async () => {
      const method = request.method ?? "GET";
      const requestPath = request.url ?? "/";
      const requestUrl = new URL(requestPath, "http://operator-console.local");

      if (method === "GET" && requestUrl.pathname === "/") {
        writeTextResponse(
          response,
          200,
          renderOperatorConsoleWebHtml(options.title ?? OPERATOR_CONSOLE_TITLE),
          "text/html; charset=utf-8",
        );
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/styles.css") {
        writeTextResponse(response, 200, OPERATOR_CONSOLE_WEB_STYLES, "text/css; charset=utf-8");
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/app.js") {
        writeTextResponse(response, 200, OPERATOR_CONSOLE_WEB_APP, "text/javascript; charset=utf-8");
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/api/console") {
        const [snapshotResponse, certificationResponse] = await Promise.all([
          requestPublicApi(options, publicApiEndpointPaths.snapshot),
          requestPublicApi(options, publicApiEndpointPaths.sandboxCertification),
        ]);
        if (!snapshotResponse.ok) {
          const failure = await readJsonResponse<Record<string, unknown>>(snapshotResponse);
          writeJsonResponse(response, snapshotResponse.status, failure);
          return;
        }

        const operationSnapshot = await readJsonResponse<OperationSnapshot>(snapshotResponse);
        const certification =
          certificationResponse.ok
            ? await readJsonResponse<readonly OperatorConsoleSandboxCertification[]>(certificationResponse)
            : [];
        const snapshot = createOperatorConsoleSnapshotFromOperation(operationSnapshot, certification);
        const payload: OperatorConsoleWebPayload = {
          generatedAt: snapshot.generatedAt,
          snapshot,
          certification,
          model: buildOperatorConsoleModel(snapshot),
        };
        writeJsonResponse(response, 200, payload);
        return;
      }

      const publicApiPath = getOperatorConsoleProxyPath(requestUrl.pathname);
      if (publicApiPath) {
        const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(request);
        const upstreamResponse = await requestPublicApi(
          options,
          `${publicApiPath}${requestUrl.search}`,
          {
            method,
            ...(body !== undefined ? { body } : {}),
            headers: {
              ...(request.headers["content-type"]
                ? { "content-type": Array.isArray(request.headers["content-type"]) ? request.headers["content-type"][0] : request.headers["content-type"] }
                : {}),
            },
          },
        );
        const contentType = upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8";
        const text = await upstreamResponse.text();
        writeTextResponse(response, upstreamResponse.status, text, contentType);
        return;
      }

      writeJsonResponse(response, 404, {
        error: "not_found",
        message: `Unknown operator console route: ${requestPath}`,
      });
    })().catch((error: unknown) => {
      writeJsonResponse(response, 500, {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Unexpected operator console error",
      });
    });
  });

export interface StartOperatorConsoleWebServerOptions extends OperatorConsoleWebServerOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly host?: string;
  readonly port?: number;
}

const parsePort = (rawValue: string | undefined, fallback: number): number => {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const startOperatorConsoleWebServer = async (
  options: StartOperatorConsoleWebServerOptions,
): Promise<Server> => {
  const env = options.env ?? process.env;
  const host = options.host ?? env.GANA_OPERATOR_CONSOLE_HOST ?? "127.0.0.1";
  const port = options.port ?? parsePort(env.GANA_OPERATOR_CONSOLE_PORT, 3200);
  const server = createOperatorConsoleWebServer({
    publicApiBaseUrl: options.publicApiBaseUrl,
    ...(options.publicApiToken ? { publicApiToken: options.publicApiToken } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.title ? { title: options.title } : {}),
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  const publicApiBaseUrl =
    env.GANA_OPERATOR_CONSOLE_PUBLIC_API_URL ??
    `http://127.0.0.1:${env.GANA_PUBLIC_API_PORT ?? "3100"}`;
  const publicApiToken =
    env.GANA_OPERATOR_CONSOLE_PUBLIC_API_TOKEN ??
    env.GANA_PUBLIC_API_OPERATOR_TOKEN ??
    env.GANA_PUBLIC_API_VIEWER_TOKEN;
  const server = await startOperatorConsoleWebServer({
    publicApiBaseUrl,
    ...(publicApiToken ? { publicApiToken } : {}),
    env,
  });
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`operator-console listening on http://${address.address}:${address.port}`);
  } else {
    console.log("operator-console listening");
  }
}
