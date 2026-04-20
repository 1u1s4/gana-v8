import { createOperationalSummary, type
  AiRunReadModel,
  type OperationSnapshot,
  type OperationalLogEntry,
  type OperationalSummary,
  type ProviderStateReadModel,
  type PublicApiHealth,
  type RawIngestionBatchReadModel,
  type ValidationSummary,
  type OddsSnapshotReadModel,
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

export function createOperatorConsoleSnapshotFromOperation(
  operationSnapshot: OperationSnapshot,
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

  return {
    generatedAt: operationSnapshot.generatedAt,
    fixtures: operationSnapshot.fixtures.map((fixture) => {
      const workflow = fixtureWorkflows.find((candidate) => candidate.fixtureId === fixture.id);
      const latestFixtureOddsSnapshot =
        sortByNewest(
          operationSnapshot.oddsSnapshots.filter((snapshot) => snapshot.fixtureId === fixture.id),
          (snapshot) => snapshot.capturedAt,
        )[0] ?? null;
      const scoringEligibilityReason =
        workflow?.selectionOverride === "force-exclude" || workflow?.manualSelectionStatus === "rejected"
          ? "Fixture is force-excluded by workflow ops."
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
        researchRecommendedLean: fixture.metadata.researchRecommendedLean ?? null,
        featureReadinessStatus: fixture.metadata.featureReadinessStatus ?? null,
        featureReadinessReasons: fixture.metadata.featureReadinessReasons ?? null,
        researchGeneratedAt: fixture.metadata.researchGeneratedAt ?? null,
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
