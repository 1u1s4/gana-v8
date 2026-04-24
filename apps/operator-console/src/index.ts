import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  createOperationalSummary,
  formatPredictionMarketLabel,
  type AiRunReadModel,
  type AutomationCycleReadModel,
  type CoverageDailyScopeReadModel,
  type FixtureOpsStatisticsReadModel,
  getDailyAutomationPolicy,
  listCoverageDailyScope,
  type ManualReviewReadModel,
  type OperationSnapshot,
  type OperationalLogEntry,
  type OperationalSummary,
  type ProviderStateReadModel,
  type PublicApiHealth,
  type PublicApiReadinessReadModel,
  type QuarantineReadModel,
  type RawIngestionBatchReadModel,
  type SandboxCertificationDetailReadModel,
  type SandboxCertificationReadModel,
  type RuntimeReleaseCoverageSummaryReadModel,
  type RuntimeReleaseSnapshotReadModel,
  type SandboxCertificationRunReadModel,
  type RecoveryReadModel,
  type TelemetryEventReadModel,
  type TelemetryMetricReadModel,
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
  readonly researchBundleStatus?: string | null;
  readonly researchRecommendedLean?: string | null;
  readonly researchSynthesisMode?: string | null;
  readonly researchCycle?: string | null;
  readonly researchNarrative?: string | null;
  readonly researchTopEvidenceTitles?: readonly string[];
  readonly researchRisks?: readonly string[];
  readonly featureReadinessStatus?: string | null;
  readonly featureReadinessReasons?: string | null;
  readonly researchGeneratedAt?: string | null;
  readonly manualSelectionStatus?: string | null;
  readonly manualSelectionBy?: string | null;
  readonly selectionOverride?: string | null;
  readonly scoringEligibilityReason?: string | null;
  readonly statistics?: FixtureOpsStatisticsReadModel;
  readonly recentAuditEvents?: readonly string[];
}

export interface OperatorConsolePrediction {
  readonly id: string;
  readonly fixtureId: string;
  readonly aiRunId?: string | null;
  readonly market: string;
  readonly outcome: string;
  readonly marketLabel: string;
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
    readonly market: string;
    readonly outcome: string;
    readonly marketLabel: string;
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
  readonly readiness: PublicApiReadinessReadModel;
  readonly automationCycles: readonly AutomationCycleReadModel[];
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
  readonly manualReviews: readonly ManualReviewReadModel[];
  readonly quarantines: readonly QuarantineReadModel[];
  readonly recovery: readonly RecoveryReadModel[];
  readonly telemetryEvents: readonly TelemetryEventReadModel[];
  readonly telemetryMetrics: readonly TelemetryMetricReadModel[];
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
  readonly certificationRuns: readonly SandboxCertificationRunReadModel[];
}

export interface OperatorConsolePanel {
  readonly title: string;
  readonly lines: readonly string[];
}

export interface OperatorConsoleModel {
  readonly generatedAt: string;
  readonly health: PublicApiHealth;
  readonly readiness: PublicApiReadinessReadModel;
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

const runtimeReleaseRunsEndpointPath =
  `${publicApiEndpointPaths.sandboxCertificationRuns}?verificationKind=runtime-release`;

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

const createFallbackReadiness = (
  generatedAt: string,
  health: PublicApiHealth,
  certification: readonly OperatorConsoleSandboxCertification[],
): PublicApiReadinessReadModel => {
  const passed = certification.filter((entry) => entry.status === "passed").length;
  const failed = certification.filter((entry) => entry.status === "failed").length;
  const missing = certification.filter((entry) => entry.status === "missing").length;
  const sandboxStatus =
    failed > 0 ? "blocked" : certification.length === 0 || missing > 0 ? "review" : "ready";
  const promotionProfiles = certification.flatMap((entry) => {
    if (!entry.promotion) {
      return [];
    }

    const profileStatus: PublicApiReadinessReadModel["status"] =
      entry.promotion.status === "blocked"
        ? "blocked"
        : entry.promotion.status === "review-required"
          ? "review"
          : "ready";

    return [
      {
        id: entry.id,
        status: profileStatus,
        sourceStatus: entry.promotion.status,
        ...(entry.generatedAt ? { generatedAt: entry.generatedAt } : {}),
      },
    ];
  });
  const promotionStatus =
    promotionProfiles.length === 0
      ? "review"
      : promotionProfiles.some((profile) => profile.status === "blocked")
        ? "blocked"
        : promotionProfiles.some((profile) => profile.status === "review")
          ? "review"
          : "ready";
  const healthStatus = health.status === "ok" ? "ready" : "review";
  const status =
    sandboxStatus === "blocked"
      ? "blocked"
      : promotionStatus === "blocked"
        ? "blocked"
        : healthStatus === "ready"
          ? (sandboxStatus === "review" || promotionStatus === "review" ? "review" : "ready")
        : "review";

  return {
    generatedAt,
    status,
    checks: [
      {
        name: "health",
        status: healthStatus,
        detail:
          health.status === "ok"
            ? "Operational health checks are passing."
            : "Operational health checks need review before promotion.",
      },
      {
        name: "sandbox-certification",
        status: sandboxStatus,
        detail:
          certification.length === 0
            ? "No sandbox certification evidence loaded."
            : `${passed} passed / ${failed} failed / ${missing} missing certification profile(s).`,
      },
      {
        name: "promotion-gates",
        status: promotionStatus,
        detail:
          promotionProfiles.length === 0
            ? "No sandbox promotion gate evidence loaded."
            : promotionProfiles.map((profile) => `${profile.id}:${profile.sourceStatus}`).join(" | "),
      },
    ],
    sandboxCertification: {
      total: certification.length,
      passed,
      failed,
      missing,
      profiles: certification.map((entry) => ({
        id: entry.id,
        status:
          entry.status === "failed"
            ? "blocked"
            : entry.status === "passed"
              ? "ready"
              : "review",
        sourceStatus: entry.status,
        ...(entry.generatedAt ? { generatedAt: entry.generatedAt } : {}),
      })),
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

const formatCornersStatistics = (
  statistics: FixtureOpsStatisticsReadModel | null | undefined,
): string => {
  const corners = statistics?.corners;
  if (!corners) {
    return "corners missing";
  }

  const values =
    `home ${corners.homeCorners ?? "n/a"} | ` +
    `away ${corners.awayCorners ?? "n/a"} | ` +
    `total ${corners.totalCorners ?? "n/a"}`;
  return `corners ${corners.status} | ${values}${corners.capturedAt ? ` | captured ${corners.capturedAt}` : ""}`;
};

const deriveFixtureCornersStatistics = (
  operationSnapshot: OperationSnapshot,
  fixtureId: string,
): FixtureOpsStatisticsReadModel => {
  const fixtureStatisticSnapshots =
    (operationSnapshot as OperationSnapshot & {
      readonly fixtureStatisticSnapshots?: readonly {
        readonly fixtureId?: string;
        readonly statKey?: string;
        readonly scope?: string;
        readonly valueNumeric?: number | null;
        readonly capturedAt?: string;
      }[];
    }).fixtureStatisticSnapshots ?? [];
  const sortStatisticSnapshots = <T extends { readonly capturedAt: string }>(snapshots: readonly T[]): T[] =>
    [...snapshots].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  const latestForScope = (scope: "home" | "away") =>
    sortStatisticSnapshots(
      fixtureStatisticSnapshots.filter(
        (snapshot) =>
          snapshot.fixtureId === fixtureId &&
          snapshot.statKey === "corners" &&
          snapshot.scope === scope &&
          typeof snapshot.capturedAt === "string",
      ) as readonly { readonly valueNumeric?: number | null; readonly capturedAt: string }[],
    )[0] ?? null;
  const homeStatistic = latestForScope("home");
  const awayStatistic = latestForScope("away");
  const homeCorners =
    typeof homeStatistic?.valueNumeric === "number" && Number.isFinite(homeStatistic.valueNumeric)
      ? homeStatistic.valueNumeric
      : null;
  const awayCorners =
    typeof awayStatistic?.valueNumeric === "number" && Number.isFinite(awayStatistic.valueNumeric)
      ? awayStatistic.valueNumeric
      : null;
  const capturedAt =
    sortStatisticSnapshots(
      [homeStatistic, awayStatistic].filter(
        (snapshot): snapshot is { readonly valueNumeric?: number | null; readonly capturedAt: string } =>
          Boolean(snapshot),
      ),
    )[0]?.capturedAt ?? null;
  const status =
    homeCorners !== null && awayCorners !== null
      ? "available"
      : homeStatistic || awayStatistic
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === "string" && entry.trim().length > 0 ? [entry.trim()] : []));
  }

  const single = asNonEmptyString(value);
  return single ? [single] : [];
};

const firstDefinedString = (...values: readonly (string | null | undefined)[]): string | null =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;

const readOptionalString = (record: Record<string, unknown> | null, ...keys: readonly string[]): string | null => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = asNonEmptyString(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
};

const readOptionalStringArray = (
  record: Record<string, unknown> | null,
  ...keys: readonly string[]
): string[] => {
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const values = asStringArray(record[key]);
    if (values.length > 0) {
      return values;
    }
  }

  return [];
};

const readRuntimeReleaseSnapshotFromRun = (
  run: SandboxCertificationRunReadModel,
  role: "baseline" | "candidate",
): RuntimeReleaseSnapshotReadModel | null => {
  const detailSnapshot = asRecord(
    (run as SandboxCertificationRunReadModel & {
      readonly baselineSnapshot?: unknown;
      readonly candidateSnapshot?: unknown;
    })[role === "baseline" ? "baselineSnapshot" : "candidateSnapshot"],
  );
  const summarySnapshot = asRecord(run.summary[role === "baseline" ? "baselineSnapshot" : "candidateSnapshot"]);
  const runtimeSignalSnapshot = asRecord(
    run.runtimeSignals[role === "baseline" ? "baselineSnapshot" : "candidateSnapshot"],
  );
  const record = detailSnapshot ?? summarySnapshot ?? runtimeSignalSnapshot;
  if (!record) {
    return null;
  }

  const ref =
    readOptionalString(record, "ref", "gitRef", "sourceRef", "runtimeRef") ??
    (role === "baseline" ? run.baselineRef : run.candidateRef) ??
    run.gitSha;
  const fingerprint = readOptionalString(record, "fingerprint", "snapshotFingerprint", "hash", "checksum");

  return {
    id: readOptionalString(record, "id", "snapshotId") ?? `${run.id}:${role}`,
    role,
    ref,
    source: "summary",
    runId: run.id,
    profileName: readOptionalString(record, "profileName", "profile", "evidenceProfile") ?? run.profileName,
    ...(fingerprint ? { fingerprint } : {}),
    metadata: {},
  };
};

const readRuntimeReleaseCoverageFromRun = (
  run: SandboxCertificationRunReadModel,
): RuntimeReleaseCoverageSummaryReadModel | null => {
  const detailCoverage = asRecord(
    (run as SandboxCertificationRunReadModel & { readonly coverageSummary?: unknown }).coverageSummary,
  );
  const coverage = detailCoverage ?? asRecord(run.summary.coverageSummary) ?? asRecord(run.runtimeSignals.coverageSummary);
  if (!coverage) {
    return null;
  }

  const status = readOptionalString(coverage, "status") ?? "unknown";
  const truncated = typeof coverage.truncated === "boolean" ? coverage.truncated : null;
  return {
    status:
      status === "complete" || status === "partial" || status === "truncated" || status === "unknown"
        ? status
        : "unknown",
    truncated,
    sections: [],
    notes: readOptionalStringArray(coverage, "notes"),
  };
};

const formatRuntimeReleaseSnapshotSummary = (
  run: SandboxCertificationRunReadModel,
): string => {
  const baseline = readRuntimeReleaseSnapshotFromRun(run, "baseline");
  const candidate = readRuntimeReleaseSnapshotFromRun(run, "candidate");
  return `snapshots baseline ${baseline?.fingerprint ?? baseline?.ref ?? run.baselineRef ?? "n/a"} -> candidate ${candidate?.fingerprint ?? candidate?.ref ?? run.candidateRef ?? run.gitSha}`;
};

const formatRuntimeReleaseCoverageSummary = (
  run: SandboxCertificationRunReadModel,
): string => {
  const coverage = readRuntimeReleaseCoverageFromRun(run);
  if (!coverage) {
    return "coverage unknown | truncation unknown";
  }

  return `coverage ${coverage.status} | truncation ${
    coverage.truncated === null ? "unknown" : coverage.truncated ? "yes" : "no"
  }`;
};

const summarizeFixtureResearchCycle = (
  research: OperationSnapshot["fixtureResearch"][number] | undefined,
): string | null => {
  if (!research) {
    return null;
  }

  const latestSnapshotRecord = asRecord(research.latestSnapshot);
  const traceRecord = asRecord(research.latestSnapshot?.researchTrace ?? research.researchTrace);
  const cycle = firstDefinedString(
    readOptionalString(latestSnapshotRecord, "cycle", "cycleLabel", "cyclePhase", "cycleId", "kickoffPhase"),
    readOptionalString(traceRecord, "cycle", "cycleLabel", "cyclePhase", "cycleId", "kickoffPhase"),
  );
  if (cycle) {
    return cycle;
  }

  const assignmentIds = readOptionalStringArray(traceRecord, "assignmentIds");
  return assignmentIds.length > 0 ? `${assignmentIds.length} assignment(s)` : null;
};

const summarizeFixtureResearchNarrative = (
  research: OperationSnapshot["fixtureResearch"][number] | undefined,
): string | null => {
  if (!research) {
    return null;
  }

  const latestSnapshotRecord = asRecord(research.latestSnapshot);
  const traceRecord = asRecord(research.latestSnapshot?.researchTrace ?? research.researchTrace);
  const narrative = firstDefinedString(
    readOptionalString(
      latestSnapshotRecord,
      "narrative",
      "narrativeSummary",
      "narrativeHeadline",
      "summary",
      "explanation",
    ),
    readOptionalString(traceRecord, "narrative", "narrativeSummary", "narrativeHeadline"),
    research.latestBundle.summary ?? null,
  );
  if (narrative) {
    return narrative;
  }

  const topEvidenceTitles = research.latestSnapshot?.topEvidenceTitles ?? [];
  const risks = research.latestSnapshot?.risks ?? [];
  return firstDefinedString(
    topEvidenceTitles[0] ? `Top signal: ${topEvidenceTitles[0]}` : null,
    risks[0] ? `Risk: ${risks[0]}` : null,
  );
};

const isOperationalDataEmpty = (snapshot: OperatorConsoleSnapshot): boolean =>
  snapshot.fixtures.length === 0 &&
  snapshot.tasks.length === 0 &&
  snapshot.taskRuns.length === 0 &&
  snapshot.aiRuns.length === 0 &&
  snapshot.predictions.length === 0 &&
  snapshot.parlays.length === 0 &&
  snapshot.sandboxCertification.length === 0 &&
  snapshot.certificationRuns.length === 0 &&
  snapshot.operationalLogs.length === 0 &&
  snapshot.operationalSummary.etl.rawBatchCount === 0 &&
  snapshot.operationalSummary.etl.oddsSnapshotCount === 0;

export function createOperatorConsoleSnapshotFromOperation(
  operationSnapshot: OperationSnapshot,
  input: {
    readonly certification?: readonly OperatorConsoleSandboxCertification[];
    readonly certificationRuns?: readonly SandboxCertificationRunReadModel[];
    readonly manualReviews?: readonly ManualReviewReadModel[];
    readonly quarantines?: readonly QuarantineReadModel[];
    readonly recovery?: readonly RecoveryReadModel[];
    readonly telemetryEvents?: readonly TelemetryEventReadModel[];
    readonly telemetryMetrics?: readonly TelemetryMetricReadModel[];
  } = {},
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
  const readiness =
    operationSnapshot.readiness ??
    createFallbackReadiness(operationSnapshot.generatedAt, operationSnapshot.health, input.certification ?? []);
  const automationCycles = operationSnapshot.automationCycles ?? [];
  const predictionsById = new Map(operationSnapshot.predictions.map((prediction) => [prediction.id, prediction]));

  return {
    generatedAt: operationSnapshot.generatedAt,
    readiness,
    automationCycles,
    fixtures: operationSnapshot.fixtures.map((fixture) => {
      const workflow = fixtureWorkflows.find((candidate) => candidate.fixtureId === fixture.id);
      const research = fixtureResearch.find((candidate) => candidate.fixtureId === fixture.id);
      const statistics = deriveFixtureCornersStatistics(operationSnapshot, fixture.id);
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
        researchBundleStatus:
          research?.latestSnapshot?.bundleStatus ??
          research?.status ??
          null,
        researchRecommendedLean:
          research?.latestSnapshot?.recommendedLean ??
          research?.latestBundle.recommendedLean ??
          null,
        researchSynthesisMode:
          research?.latestSnapshot?.researchTrace?.synthesisMode ??
          research?.researchTrace?.synthesisMode ??
          null,
        researchCycle: summarizeFixtureResearchCycle(research ?? undefined),
        researchNarrative: summarizeFixtureResearchNarrative(research ?? undefined),
        researchTopEvidenceTitles: research?.latestSnapshot?.topEvidenceTitles ?? [],
        researchRisks: research?.latestSnapshot?.risks ?? [],
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
        statistics,
        recentAuditEvents,
      };
    }),
    predictions: operationSnapshot.predictions.map((prediction) => ({
      id: prediction.id,
      fixtureId: prediction.fixtureId,
      aiRunId: prediction.aiRunId ?? null,
      market: prediction.market,
      outcome: prediction.outcome,
      marketLabel: formatPredictionMarketLabel(prediction),
      confidence: prediction.confidence,
      status: prediction.status,
    })),
    parlays: operationSnapshot.parlays.map((parlay) => ({
      id: parlay.id,
      status: parlay.status,
      expectedPayout: parlay.expectedPayout,
      legs: parlay.legs.map((leg) => {
        const prediction = predictionsById.get(leg.predictionId);
        return {
          predictionId: leg.predictionId,
          fixtureId: leg.fixtureId,
          market: leg.market,
          outcome: leg.outcome,
          marketLabel: formatPredictionMarketLabel({
            market: leg.market,
            outcome: leg.outcome,
            probabilities: prediction?.probabilities ?? null,
          }),
        };
      }),
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
    manualReviews: input.manualReviews ?? (operationSnapshot as OperationSnapshot & { readonly manualReviews?: readonly ManualReviewReadModel[] }).manualReviews ?? [],
    quarantines: input.quarantines ?? (operationSnapshot as OperationSnapshot & { readonly quarantines?: readonly QuarantineReadModel[] }).quarantines ?? [],
    recovery: input.recovery ?? (operationSnapshot as OperationSnapshot & { readonly recovery?: readonly RecoveryReadModel[] }).recovery ?? [],
    telemetryEvents:
      input.telemetryEvents ??
      (operationSnapshot as OperationSnapshot & { readonly telemetryEvents?: readonly TelemetryEventReadModel[] }).telemetryEvents ??
      [],
    telemetryMetrics:
      input.telemetryMetrics ??
      (operationSnapshot as OperationSnapshot & { readonly telemetryMetrics?: readonly TelemetryMetricReadModel[] }).telemetryMetrics ??
      [],
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
    sandboxCertification: [...(input.certification ?? [])],
    certificationRuns: [...(input.certificationRuns ?? [])],
  };
}

export function createOperatorConsoleSnapshot(
  input: Partial<OperatorConsoleSnapshot> = {},
): OperatorConsoleSnapshot {
  const generatedAt = input.generatedAt ?? "1970-01-01T00:00:00.000Z";
  const validationSummary =
    input.validationSummary ??
    {
      total: 0,
      passed: 0,
      failed: 0,
      partial: 0,
      pending: 0,
      completionRate: 0,
    };

  return {
    generatedAt,
    readiness:
      input.readiness ??
      {
        generatedAt,
        status: "review",
        checks: [
          {
            name: "sandbox-certification",
            status: "review",
            detail: "Awaiting sandbox certification evidence and operational history.",
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
    automationCycles: input.automationCycles ?? [],
    fixtures: input.fixtures ?? [],
    predictions: input.predictions ?? [],
    parlays: input.parlays ?? [],
    tasks: input.tasks ?? [],
    taskRuns: input.taskRuns ?? [],
    aiRuns: input.aiRuns ?? [],
    providerStates: input.providerStates ?? [],
    etl:
      input.etl ??
      {
        rawBatchCount: 0,
        oddsSnapshotCount: 0,
        latestBatch: null,
        latestOddsSnapshot: null,
        endpointCounts: {},
      },
    operationalSummary:
      input.operationalSummary ??
      {
        generatedAt,
        taskCounts: {
          total: 0,
          queued: 0,
          running: 0,
          failed: 0,
          quarantined: 0,
          succeeded: 0,
          cancelled: 0,
        },
        taskRunCounts: {
          total: 0,
          running: 0,
          failed: 0,
          succeeded: 0,
          cancelled: 0,
        },
        etl: {
          rawBatchCount: 0,
          oddsSnapshotCount: 0,
          endpointCounts: {},
          latestBatch: null,
          latestOddsSnapshot: null,
        },
        observability: {
          workers: [],
          providers: [],
          retries: {
            queuedWithRetryHistory: 0,
            retryingNow: 0,
            failed: 0,
            quarantined: 0,
            exhausted: 0,
          },
          backfills: [
            { area: "fixtures", status: "needed", detail: "No fixture ingestion batches loaded yet." },
            { area: "odds", status: "needed", detail: "No odds snapshots loaded yet." },
            { area: "validation", status: "needed", detail: "Validation evidence has not been produced yet." },
          ],
          traceability: {
            tasksWithTraceId: 0,
            tasksWithoutTraceId: 0,
            taskTraceCoverageRate: 0,
            aiRunsWithProviderRequestId: 0,
            aiRunsWithoutProviderRequestId: 0,
            aiRunRequestCoverageRate: 0,
          },
          alerts: [],
        },
        policy: {
          status: "blocked",
          publishAllowed: false,
          retryRecommended: false,
          backfillRequired: true,
          gates: [
            { name: "health", status: "warn", detail: "No operational data has been loaded from public-api yet." },
            { name: "retries", status: "pass", detail: "No retry pressure reported." },
            { name: "backfills", status: "warn", detail: "Fixtures, odds, and validation backfills are required." },
            { name: "traceability", status: "warn", detail: "No task or AI traceability has been recorded yet." },
            { name: "publication-readiness", status: "block", detail: "Publication is blocked until live operational data exists." },
          ],
          summary: "Awaiting fixture ingestion, research, and scoring inputs.",
        },
        validation: validationSummary,
      },
    operationalLogs: input.operationalLogs ?? [],
    manualReviews: input.manualReviews ?? [],
    quarantines: input.quarantines ?? [],
    recovery: input.recovery ?? [],
    telemetryEvents: input.telemetryEvents ?? [],
    telemetryMetrics: input.telemetryMetrics ?? [],
    validationSummary,
    health:
      input.health ??
      {
        status: "degraded",
        generatedAt,
        checks: [
          {
            name: "operational-data",
            status: "warn",
            detail: "public-api is reachable but has not returned fixtures, tasks, predictions, or ETL data yet.",
          },
          {
            name: "validations",
            status: "warn",
            detail: "No validation summary has been produced yet.",
          },
        ],
      },
    leagueCoveragePolicies: input.leagueCoveragePolicies ?? [],
    teamCoveragePolicies: input.teamCoveragePolicies ?? [],
    dailyAutomationPolicy: input.dailyAutomationPolicy ?? null,
    coverageDailyScope: input.coverageDailyScope ?? [],
    sandboxCertification: input.sandboxCertification ?? [],
    certificationRuns: input.certificationRuns ?? [],
  };
}

export function buildOperatorConsoleModel(
  snapshot: OperatorConsoleSnapshot = createOperatorConsoleSnapshot(),
): OperatorConsoleModel {
  snapshot = createOperatorConsoleSnapshot(snapshot);
  const operationalDataEmpty = isOperationalDataEmpty(snapshot);
  const alerts = [
    ...(operationalDataEmpty
      ? ["No operational data loaded from public-api yet."]
      : snapshot.health.checks
        .filter((check) => check.status === "warn")
        .map((check) => `${check.name}: ${check.detail}`)),
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
    ...(snapshot.readiness.status !== "ready"
      ? [`readiness: ${snapshot.readiness.status}`]
      : []),
    ...(snapshot.operationalSummary.policy.status !== "ready" && !operationalDataEmpty
      ? [`policy: ${snapshot.operationalSummary.policy.summary}`]
      : []),
    ...snapshot.sandboxCertification
      .filter((certification) => certification.status !== "passed")
      .map(
        (certification) =>
          `sandbox:${certification.profileName}/${certification.packId} ${certification.status} (${certification.diffEntryCount} diff)`,
      ),
    ...snapshot.sandboxCertification
      .filter((certification) => certification.promotion && certification.promotion.status !== "promotable")
      .map(
        (certification) =>
          `promotion:${certification.profileName}/${certification.packId} ${certification.promotion?.status ?? "unknown"}`,
      ),
    ...snapshot.manualReviews.map(
      (review) => `manual-review:${review.taskId} ${review.source} ${review.reason}`,
    ),
    ...snapshot.telemetryEvents
      .filter((event) => event.severity === "warn" || event.severity === "error")
      .slice(0, 3)
      .map((event) => `telemetry:${event.name} ${event.severity}${event.message ? ` ${event.message}` : ""}`),
  ];

  const panels: OperatorConsolePanel[] = [
    {
      title: "Overview",
      lines: [
        `Generated at: ${snapshot.generatedAt}`,
        `Health: ${snapshot.health.status}`,
        `Readiness: ${snapshot.readiness.status}`,
        `Operational data: ${operationalDataEmpty ? "awaiting first snapshot" : "loaded"}`,
        `Fixtures: ${snapshot.fixtures.length}`,
        `Tasks: ${snapshot.tasks.length}`,
        `Task runs: ${snapshot.taskRuns.length}`,
        `Predictions: ${snapshot.predictions.length}`,
        `Parlays: ${snapshot.parlays.length}`,
        `Automation cycles: ${snapshot.automationCycles.length}`,
        `Manual review: ${snapshot.manualReviews.length}`,
        `Quarantines: ${snapshot.quarantines.length}`,
        `Recovery cycles: ${snapshot.recovery.length}`,
        `Telemetry events: ${snapshot.telemetryEvents.length}`,
      ],
    },
    {
      title: "Readiness",
      lines: [
        `Status: ${snapshot.readiness.status}`,
        ...snapshot.readiness.checks.map(
          (check) => `${check.status.toUpperCase()} | ${check.name} | ${check.detail}`,
        ),
      ],
    },
    {
      title: "Automation cycles",
      lines:
        snapshot.automationCycles.length === 0
          ? ["No scheduler/dispatcher/recovery cycles recorded yet."]
          : snapshot.automationCycles.map(
              (cycle) =>
                `${cycle.id} | ${cycle.source} | ${cycle.status} | fixtures ${cycle.fixtureIds.length} | tasks ${cycle.taskIds.length} | started ${cycle.startedAt}`,
            ),
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
      title: "Research trace",
      lines: snapshot.fixtures
        .map((fixture) => {
          const traceParts = [
            fixture.researchSynthesisMode ? `mode ${fixture.researchSynthesisMode}` : null,
            fixture.researchBundleStatus ? `bundle ${fixture.researchBundleStatus}` : null,
            fixture.researchCycle ? `cycle ${fixture.researchCycle}` : null,
            fixture.researchNarrative ? `narrative ${fixture.researchNarrative}` : null,
            fixture.researchTopEvidenceTitles && fixture.researchTopEvidenceTitles.length > 0
              ? `evidence ${fixture.researchTopEvidenceTitles.slice(0, 2).join(" / ")}`
              : null,
            fixture.researchRisks && fixture.researchRisks.length > 0
              ? `risks ${fixture.researchRisks.slice(0, 2).join(" / ")}`
              : null,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" | ");
          return traceParts.length > 0
            ? `${fixture.id} | ${traceParts}`
            : null;
        })
        .filter((line): line is string => Boolean(line)),
    },
    {
      title: "Sandbox certification",
      lines:
        snapshot.sandboxCertification.length === 0
          ? ["No sandbox certification evidence loaded."]
          : snapshot.sandboxCertification.map(
              (certification) =>
                `${certification.profileName}/${certification.packId} | ${certification.status} | promotion ${certification.promotion?.status ?? "unknown"} | synthetic ${certification.latestSyntheticIntegrity?.status ?? "n/a"} | runtime ${certification.latestRuntimeRelease?.promotionStatus ?? certification.latestRuntimeRelease?.status ?? "n/a"} | diff ${certification.diffEntryCount} | replay ${certification.replayEventCount} | generated ${certification.generatedAt ?? "missing"}`,
            ),
    },
    {
      title: "Runtime release",
      lines:
        snapshot.certificationRuns.length === 0
          ? ["No runtime-release approval runs loaded."]
          : snapshot.certificationRuns.map(
              (run) =>
                `${run.profileName}/${run.packId} | ${run.status}${run.promotionStatus ? ` | ${run.promotionStatus}` : ""} | baseline ${run.baselineRef ?? "main"} -> candidate ${run.candidateRef ?? run.gitSha} | ${formatRuntimeReleaseSnapshotSummary(run)} | ${formatRuntimeReleaseCoverageSummary(run)} | generated ${run.generatedAt ?? "missing"}`,
            ),
    },
    {
      title: "Release ops",
      lines: [
        `Manual review queue: ${snapshot.manualReviews.length}`,
        ...snapshot.manualReviews.map(
          (review) =>
            `${review.taskId} | ${review.taskKind} | ${review.source} | ${review.reason}`,
        ),
        `Quarantines: ${snapshot.quarantines.length}`,
        ...snapshot.quarantines.map(
          (entry) =>
            `${entry.taskId} | ${entry.taskKind} | ${entry.source} | attempts ${entry.attempts}/${entry.maxAttempts} | ${entry.reason}`,
        ),
        `Recovery cycles: ${snapshot.recovery.length}`,
        ...snapshot.recovery.map(
          (entry) =>
            `${entry.cycleId} | ${entry.status} | expired ${entry.expiredLeaseCount} | quarantined ${entry.quarantinedTaskCount} | manual review ${entry.manualReviewTaskCount}`,
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
      title: "Telemetry",
      lines: [
        `Events: ${snapshot.telemetryEvents.length}`,
        ...snapshot.telemetryEvents.map(
          (event) =>
            `${event.occurredAt} | ${event.kind} | ${event.severity} | ${event.name}${event.message ? ` | ${event.message}` : ""}`,
        ),
        `Metric samples: ${snapshot.telemetryMetrics.length}`,
        ...snapshot.telemetryMetrics.map(
          (metric) =>
            `${metric.recordedAt} | ${metric.name} | ${metric.type} | ${metric.value}`,
        ),
        `Runtime release runs: ${snapshot.certificationRuns.length}`,
        ...snapshot.certificationRuns.map(
          (run) =>
            `${run.profileName}/${run.packId} | ${run.verificationKind} | ${run.status}${run.promotionStatus ? ` | ${run.promotionStatus}` : ""} | ${run.gitSha}`,
        ),
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
          ...linkedPredictions.map(
            (prediction) =>
              `prediction ${prediction.id} | ${prediction.marketLabel} (${prediction.market}:${prediction.outcome})`,
          ),
          ...linkedParlays.map((parlay) => {
            const legLabels = parlay.legs.map((leg) => `${leg.marketLabel} (${leg.market}:${leg.outcome})`).join(" ; ");
            return `parlay ${parlay.id} | ${parlay.legs.length} leg(s)${legLabels ? ` | ${legLabels}` : ""}`;
          }),
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
        const researchContext = [
          fixture.researchBundleStatus ? `bundle ${fixture.researchBundleStatus}` : null,
          fixture.researchCycle ? `cycle ${fixture.researchCycle}` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" | ");
        return `${fixture.id} | workflow ${fixture.featureReadinessStatus ?? "unknown"}${manualSelection}${selectionOverride}${eligibility}${researchContext ? ` | ${researchContext}` : ""} | ${formatCornersStatistics(fixture.statistics)} | predictions ${predictions.length} | parlays ${parlays.length} | validations ${snapshot.validationSummary.total}${recentOps}`;
      }),
    },
    {
      title: "Fixture pipeline",
      lines: snapshot.fixtures.map((fixture) => {
        const readiness = fixture.featureReadinessStatus ?? "unknown";
        const lean = fixture.researchRecommendedLean ?? "n/a";
        const generatedAt = fixture.researchGeneratedAt ?? "n/a";
        const reasons = fixture.featureReadinessReasons ?? "none";
        const bundleStatus = fixture.researchBundleStatus ?? "n/a";
        const cycle = fixture.researchCycle ?? "n/a";
        const narrative = fixture.researchNarrative ?? "none";
        return `${fixture.homeTeam} vs ${fixture.awayTeam} | lean ${lean} | readiness ${readiness} | bundle ${bundleStatus} | cycle ${cycle} | researchGeneratedAt ${generatedAt} | narrative ${narrative} | reasons ${reasons}`;
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
          `${prediction.id} | ${prediction.marketLabel} (${prediction.market}:${prediction.outcome}) | confidence ${prediction.confidence.toFixed(2)} | ${prediction.status}`,
      ),
    },
    {
      title: "Parlays",
      lines: snapshot.parlays.map(
        (parlay) => {
          const legLabels = parlay.legs.map((leg) => `${leg.marketLabel} (${leg.market}:${leg.outcome})`).join(" ; ");
          return `${parlay.id} | ${parlay.legs.length} leg(s) | ${legLabels || "no legs"} | payout ${parlay.expectedPayout.toFixed(2)} | ${parlay.status}`;
        },
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
    readiness: snapshot.readiness,
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
    `Readiness: ${model.readiness.status.toUpperCase()}`,
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
  const [
    snapshotResponse,
    certificationResponse,
    certificationRunsResponse,
    manualReviewResponse,
    quarantinesResponse,
    recoveryResponse,
    telemetryEventsResponse,
    telemetryMetricsResponse,
  ] = await Promise.all([
    requestPublicApi(options, publicApiEndpointPaths.snapshot),
    requestPublicApi(options, publicApiEndpointPaths.sandboxCertification),
    requestPublicApi(options, runtimeReleaseRunsEndpointPath),
    requestPublicApi(options, publicApiEndpointPaths.manualReview),
    requestPublicApi(options, publicApiEndpointPaths.quarantines),
    requestPublicApi(options, publicApiEndpointPaths.recovery),
    requestPublicApi(options, publicApiEndpointPaths.telemetryEvents),
    requestPublicApi(options, publicApiEndpointPaths.telemetryMetrics),
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
  const certificationRuns =
    certificationRunsResponse.ok
      ? await readJsonResponse<readonly SandboxCertificationRunReadModel[]>(certificationRunsResponse)
      : [];
  const manualReviews =
    manualReviewResponse.ok
      ? await readJsonResponse<readonly ManualReviewReadModel[]>(manualReviewResponse)
      : [];
  const quarantines =
    quarantinesResponse.ok
      ? await readJsonResponse<readonly QuarantineReadModel[]>(quarantinesResponse)
      : [];
  const recovery =
    recoveryResponse.ok
      ? await readJsonResponse<readonly RecoveryReadModel[]>(recoveryResponse)
      : [];
  const telemetryEvents =
    telemetryEventsResponse.ok
      ? await readJsonResponse<readonly TelemetryEventReadModel[]>(telemetryEventsResponse)
      : [];
  const telemetryMetrics =
    telemetryMetricsResponse.ok
      ? await readJsonResponse<readonly TelemetryMetricReadModel[]>(telemetryMetricsResponse)
      : [];
  const snapshot = createOperatorConsoleSnapshotFromOperation(operationSnapshot, {
    certification,
    certificationRuns,
    manualReviews,
    quarantines,
    recovery,
    telemetryEvents,
    telemetryMetrics,
  });

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
  selectedRuntimeReleaseRunId: null,
  taskDetail: null,
  taskRuns: [],
  aiRunDetail: null,
  certificationDetail: null,
  runtimeReleaseDetail: null,
  taskInspectorError: null,
  aiRunInspectorError: null,
  certificationInspectorError: null,
  runtimeReleaseInspectorError: null,
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

const formatRuntimeReleaseSnapshot = (snapshot, fallbackRef) => {
  if (!snapshot) {
    return 'ref ' + (fallbackRef || 'n/a') + ' | fingerprint n/a | profile n/a';
  }

  return 'ref ' + (snapshot.ref || fallbackRef || 'n/a') +
    ' | fingerprint ' + (snapshot.fingerprint || 'n/a') +
    ' | profile ' + (snapshot.profileName || 'n/a');
};

const formatRuntimeReleaseCoverage = (coverage) => {
  if (!coverage) {
    return 'coverage unknown | truncation unknown';
  }

  return 'coverage ' + (coverage.status || 'unknown') +
    ' | truncation ' + (coverage.truncated === null || coverage.truncated === undefined ? 'unknown' : coverage.truncated ? 'yes' : 'no');
};

const renderRuntimeReleaseCoverageSections = (coverage) => {
  const sections = coverage && Array.isArray(coverage.sections) ? coverage.sections : [];
  if (sections.length === 0) {
    return '<div class="panel-line">Sections: not reported</div>';
  }

  return sections.map((section) =>
    '<div class="panel-line">' + escapeHtml(section.name || 'unknown') +
      ' | observed ' + escapeHtml(section.observedCount ?? 'n/a') +
      ' | limit ' + escapeHtml(section.limit ?? 'n/a') +
      ' | truncated ' + escapeHtml(section.truncated === undefined ? 'unknown' : section.truncated ? 'yes' : 'no') +
    '</div>'
  ).join('');
};

const isSnapshotEmpty = (snapshot) =>
  Array.isArray(snapshot.fixtures) && snapshot.fixtures.length === 0 &&
  Array.isArray(snapshot.tasks) && snapshot.tasks.length === 0 &&
  Array.isArray(snapshot.taskRuns) && snapshot.taskRuns.length === 0 &&
  Array.isArray(snapshot.aiRuns) && snapshot.aiRuns.length === 0 &&
  Array.isArray(snapshot.predictions) && snapshot.predictions.length === 0 &&
  Array.isArray(snapshot.parlays) && snapshot.parlays.length === 0 &&
  Array.isArray(snapshot.sandboxCertification) && snapshot.sandboxCertification.length === 0 &&
  Array.isArray(snapshot.certificationRuns) && snapshot.certificationRuns.length === 0 &&
  Array.isArray(snapshot.operationalLogs) && snapshot.operationalLogs.length === 0 &&
  snapshot.operationalSummary &&
  snapshot.operationalSummary.etl &&
  snapshot.operationalSummary.etl.rawBatchCount === 0 &&
  snapshot.operationalSummary.etl.oddsSnapshotCount === 0;

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

const formatFixtureCorners = (statistics) => {
  const corners = statistics && statistics.corners;
  if (!corners) {
    return 'Corners: missing';
  }

  return 'Corners: ' + corners.status +
    ' | home ' + (corners.homeCorners ?? 'n/a') +
    ' | away ' + (corners.awayCorners ?? 'n/a') +
    ' | total ' + (corners.totalCorners ?? 'n/a') +
    (corners.capturedAt ? ' | captured ' + corners.capturedAt : '');
};

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
    return '<div class="empty-state">No fixtures available. Once ingestion lands, readiness, workflow, and narrative data will appear here.</div>';
  }

  return '<div class="table-wrap"><table><thead><tr>' +
    '<th>Fixture</th><th>Status</th><th>Research</th><th>Workflow</th><th>Scoring</th><th>Actions</th>' +
    '</tr></thead><tbody>' +
    snapshot.fixtures.map((fixture) =>
      '<tr>' +
        '<td><strong>' + escapeHtml(fixture.homeTeam) + ' vs ' + escapeHtml(fixture.awayTeam) + '</strong><span class="subtle">' + escapeHtml(fixture.competition) + '<br />' + escapeHtml(fixture.id) + '</span></td>' +
        '<td>' + formatBadge(fixture.status) + '</td>' +
        '<td><strong>' + escapeHtml(fixture.researchRecommendedLean || 'n/a') + '</strong><span class="subtle">Readiness: ' + escapeHtml(fixture.featureReadinessStatus || 'unknown') + ' | bundle ' + escapeHtml(fixture.researchBundleStatus || 'n/a') + '</span><br /><span class="subtle">Cycle: ' + escapeHtml(fixture.researchCycle || 'n/a') + ' | Generated: ' + escapeHtml(fixture.researchGeneratedAt || 'n/a') + '</span><br /><span class="subtle">' + escapeHtml(fixture.researchNarrative || 'No persisted narrative') + '</span></td>' +
        '<td><span class="subtle">Manual: ' + escapeHtml(fixture.manualSelectionStatus || 'none') + ' by ' + escapeHtml(fixture.manualSelectionBy || 'n/a') + '</span><br /><span class="subtle">Override: ' + escapeHtml(fixture.selectionOverride || 'none') + '</span></td>' +
        '<td><span class="subtle">' + escapeHtml(fixture.scoringEligibilityReason || 'n/a') + '</span><br /><span class="subtle">' + escapeHtml(formatFixtureCorners(fixture.statistics)) + '</span></td>' +
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
      '<div class="subtle">Generated ' + escapeHtml(formatDateTime(certification.generatedAt)) + ' | diff ' + escapeHtml(certification.diffEntryCount) + ' | synthetic ' + escapeHtml(certification.latestSyntheticIntegrity?.status || 'n/a') + ' | runtime ' + escapeHtml(certification.latestRuntimeRelease?.promotionStatus || certification.latestRuntimeRelease?.status || 'n/a') + ' | promotion ' + escapeHtml(certification.promotion?.status || 'unknown') + '</div>' +
      '<div class="list-actions">' +
        '<button class="fixture-action" type="button" data-console-action="inspect-certification" data-certification-profile="' + escapeHtml(certification.profileName) + '" data-certification-pack="' + escapeHtml(certification.packId) + '" data-tone="neutral">Inspect</button>' +
      '</div>' +
    '</article>'
  ).join('') + '</div>';
};

const renderRuntimeReleaseActions = (run) => {
  if (!run) {
    return '';
  }

  if (run.profileName === 'ci-ephemeral') {
    return '<div class="list-actions"><span class="subtle">ci-ephemeral evidence is locked and cannot be overridden.</span></div>';
  }

  return '<div class="list-actions">' +
    '<button class="fixture-action" type="button" data-runtime-release-action="approve" data-runtime-release-run-id="' + escapeHtml(run.id) + '" data-tone="include">Approve</button>' +
    '<button class="fixture-action" type="button" data-runtime-release-action="reject" data-runtime-release-run-id="' + escapeHtml(run.id) + '" data-tone="exclude">Reject</button>' +
  '</div>';
};

const renderRuntimeReleaseList = (snapshot) => {
  const runs = Array.isArray(snapshot.certificationRuns) ? snapshot.certificationRuns : [];
  if (runs.length === 0) {
    return '<div class="empty-state">No runtime-release runs available.</div>';
  }

  return '<div class="list">' + runs.map((run) =>
    '<article class="list-item' + (state.selectedRuntimeReleaseRunId === run.id ? ' is-selected' : '') + '">' +
      '<strong>' + escapeHtml(run.profileName) + '</strong>' +
      '<div>' + formatBadge(run.promotionStatus || run.status) + '</div>' +
      '<div class="subtle">' + escapeHtml(run.id) + '</div>' +
      '<div class="subtle">Pack ' + escapeHtml(run.packId) + ' | generated ' + escapeHtml(formatDateTime(run.generatedAt)) + '</div>' +
      '<div class="subtle">Baseline ' + escapeHtml(run.baselineRef || 'main') + ' | candidate ' + escapeHtml(run.candidateRef || run.gitSha) + '</div>' +
      '<div class="subtle">Git ' + escapeHtml(run.gitSha) + '</div>' +
      renderRuntimeReleaseActions(run) +
      '<div class="list-actions">' +
        '<button class="fixture-action" type="button" data-console-action="inspect-runtime-release" data-runtime-release-run-id="' + escapeHtml(run.id) + '" data-tone="neutral">Inspect</button>' +
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
            '<div class="panel-line">' + escapeHtml(prediction.id) + ' | fixture ' + escapeHtml(prediction.fixtureId) + ' | ' + escapeHtml(prediction.marketLabel || (prediction.market + ':' + prediction.outcome)) + ' (' + escapeHtml(prediction.market) + ':' + escapeHtml(prediction.outcome) + ') | ' + escapeHtml(prediction.status) + ' | confidence ' + escapeHtml(prediction.confidence) + '</div>'
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
  const promotionGates = Array.isArray(certification.promotion?.gates) ? certification.promotion.gates : [];
  const policyTrace = certification.policyTrace || null;

  return '<div class="list">' +
    '<article class="list-item is-selected">' +
      '<strong>' + escapeHtml(certification.profileName) + ' / ' + escapeHtml(certification.packId) + '</strong>' +
      '<div>' + formatBadge(certification.status) + '</div>' +
      '<div class="subtle">Mode ' + escapeHtml(certification.mode) + ' | generated ' + escapeHtml(formatDateTime(certification.generatedAt)) + '</div>' +
      '<div class="subtle">Golden ' + escapeHtml(certification.goldenPath) + '</div>' +
      '<div class="subtle">Artifact ' + escapeHtml(certification.artifactPath || 'missing') + '</div>' +
      '<div class="subtle">Replay ' + escapeHtml(certification.replayEventCount) + ' | fixtures ' + escapeHtml(certification.fixtureCount) + ' | diff entries ' + escapeHtml(certification.diffEntryCount) + ' | promotion ' + escapeHtml(certification.promotion?.status || 'unknown') + '</div>' +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Safety & assertions</strong>' +
      '<div class="panel-line">Allowed hosts: ' + escapeHtml(allowedHosts.join(', ') || 'none') + '</div>' +
      '<div class="panel-line">Assertions: ' + escapeHtml(assertions.join(', ') || 'none') + '</div>' +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Promotion gates</strong>' +
      (promotionGates.length === 0
        ? '<div class="empty-state">No promotion gate evidence available.</div>'
        : promotionGates.map((gate) =>
            '<div class="panel-line">' + escapeHtml(gate.status.toUpperCase()) + ' | ' + escapeHtml(gate.name) + ' | ' + escapeHtml(gate.detail) + '</div>'
          ).join('')) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Policy trace</strong>' +
      (policyTrace
        ? '<div class="panel-line">Capabilities: ' + escapeHtml((policyTrace.capabilityAllowlist || []).join(', ') || 'none') + '</div>' +
          '<div class="panel-line">Side effects: ' + escapeHtml((policyTrace.sideEffects || []).join(', ') || 'none') + '</div>' +
          '<div class="panel-line">Memory: ' + escapeHtml(policyTrace.memoryIsolation?.strategy || 'n/a') + ' | ' + escapeHtml(policyTrace.memoryIsolation?.namespaceRoot || 'n/a') + '</div>' +
          '<div class="panel-line">Sessions: ' + escapeHtml(policyTrace.sessionIsolation?.strategy || 'n/a') + ' | ' + escapeHtml(policyTrace.sessionIsolation?.namespaceRoot || 'n/a') + '</div>' +
          '<div class="panel-line">Skills: ' + escapeHtml((policyTrace.skillPolicy?.enabledSkills || []).join(', ') || 'none') + ' | default deny ' + escapeHtml(policyTrace.skillPolicy?.defaultDeny ? 'yes' : 'no') + '</div>' +
          '<div class="panel-line">Secrets: ' + escapeHtml(policyTrace.secretsPolicy?.mode || 'n/a') + ' | production creds ' + escapeHtml(policyTrace.secretsPolicy?.allowProductionCredentials ? 'yes' : 'no') + '</div>' +
          '<div class="panel-line">Manual QA: ' + escapeHtml(policyTrace.requiresManualQa ? 'yes' : 'no') + ' | publish enabled ' + escapeHtml(policyTrace.publishEnabled ? 'yes' : 'no') + '</div>'
        : '<div class="empty-state">No policy trace available.</div>') +
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

const renderRuntimeReleaseInspector = () => {
  if (state.runtimeReleaseInspectorError) {
    return '<div class="empty-state">' + escapeHtml(state.runtimeReleaseInspectorError) + '</div>';
  }

  if (!state.runtimeReleaseDetail) {
    return '<div class="empty-state">Select a runtime-release run to inspect approval history and record a promotion decision.</div>';
  }

  const run = state.runtimeReleaseDetail;
  const latestDecision = run.latestPromotionDecision || null;
  const decisionHistory = Array.isArray(run.promotionDecisionHistory) ? run.promotionDecisionHistory : [];
  const diffEntries = Array.isArray(run.diffEntries) ? run.diffEntries : [];
  const baselineSnapshot = run.baselineSnapshot || null;
  const candidateSnapshot = run.candidateSnapshot || null;
  const coverageSummary = run.coverageSummary || null;

  return '<div class="list">' +
    '<article class="list-item is-selected">' +
      '<strong>' + escapeHtml(run.profileName) + ' / ' + escapeHtml(run.packId) + '</strong>' +
      '<div>' + formatBadge(run.promotionStatus || run.status) + '</div>' +
      '<div class="subtle">' + escapeHtml(run.id) + '</div>' +
      '<div class="subtle">Generated ' + escapeHtml(formatDateTime(run.generatedAt)) + ' | git ' + escapeHtml(run.gitSha) + '</div>' +
      '<div class="subtle">Baseline ' + escapeHtml(run.baselineRef || 'main') + ' | candidate ' + escapeHtml(run.candidateRef || run.gitSha) + '</div>' +
      '<div class="subtle">Verification ' + escapeHtml(run.verificationKind) + ' | diff entries ' + escapeHtml(diffEntries.length) + '</div>' +
      '<div class="subtle">Snapshot diff ' + escapeHtml(run.snapshotDiffFingerprint || 'n/a') + '</div>' +
      renderRuntimeReleaseActions(run) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Runtime snapshots</strong>' +
      '<div class="panel-line">Baseline: ' + escapeHtml(formatRuntimeReleaseSnapshot(baselineSnapshot, run.baselineRef || 'main')) + '</div>' +
      '<div class="panel-line">Candidate: ' + escapeHtml(formatRuntimeReleaseSnapshot(candidateSnapshot, run.candidateRef || run.gitSha)) + '</div>' +
      '<div class="panel-line">' + escapeHtml(formatRuntimeReleaseCoverage(coverageSummary)) + '</div>' +
      renderRuntimeReleaseCoverageSections(coverageSummary) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Latest decision</strong>' +
      (latestDecision
        ? '<div class="panel-line">' + escapeHtml(latestDecision.decision.toUpperCase()) + ' @ ' + escapeHtml(formatDateTime(latestDecision.occurredAt)) + ' by ' + escapeHtml(latestDecision.actor || latestDecision.actorType || 'unknown') + '</div>' +
          '<div class="panel-line">Reason: ' + escapeHtml(latestDecision.reason) + '</div>' +
          '<div class="panel-line">Evidence refs: ' + escapeHtml((latestDecision.evidenceRefs || []).join(', ') || 'none') + '</div>'
        : '<div class="empty-state">No promotion decision recorded yet.</div>') +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Decision history</strong>' +
      (decisionHistory.length === 0
        ? '<div class="empty-state">No decision history available.</div>'
        : decisionHistory.map((decision) =>
            '<div class="panel-line">' + escapeHtml(decision.decision.toUpperCase()) + ' | ' + escapeHtml(formatDateTime(decision.occurredAt)) + ' | ' + escapeHtml(decision.actor || decision.actorType || 'unknown') + ' | ' + escapeHtml(decision.reason) + '</div>'
          ).join('')) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Runtime signals</strong>' +
      renderJsonBlock(run.runtimeSignals || {}) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Summary</strong>' +
      renderJsonBlock(run.summary || {}) +
    '</article>' +
    '<article class="list-item">' +
      '<strong>Diff entries</strong>' +
      (diffEntries.length === 0
        ? '<div class="empty-state">No runtime-release diff entries recorded.</div>'
        : diffEntries.map((entry) =>
            '<div class="panel-line">' + escapeHtml(entry.kind.toUpperCase()) + ' ' + escapeHtml(entry.path) + ' | expected ' + escapeHtml(JSON.stringify(entry.expected)) + ' | actual ' + escapeHtml(JSON.stringify(entry.actual)) + '</div>'
          ).join('')) +
    '</article>' +
  '</div>';
};

const renderDashboard = (payload) => {
  const snapshot = payload.snapshot;
  const model = payload.model;
  const emptySnapshot = isSnapshotEmpty(snapshot);
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
    (emptySnapshot
      ? '<section class="surface"><div class="surface-body"><div class="empty-state"><strong>No operational data yet.</strong><div class="subtle">The console is connected, but public-api returned empty fixtures, tasks, predictions, and ETL snapshots. Start ingestion or inspect upstream runtime/auth settings.</div></div></div></section>'
      : '') +
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
    '<section class="panel-grid">' +
      '<section class="surface"><div class="surface-header"><h2>Runtime Release</h2><span class="subtle">Approval-required release evidence by environment profile</span></div><div class="surface-body">' + renderRuntimeReleaseList(snapshot) + '</div></section>' +
      '<section class="surface"><div class="surface-header"><h2>Runtime Release Inspector</h2><span class="subtle">Approve or reject review-required runtime-release runs</span></div><div class="surface-body">' + renderRuntimeReleaseInspector() + '</div></section>' +
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

const loadRuntimeReleaseInspector = async (runId) => {
  state.selectedRuntimeReleaseRunId = runId;
  state.runtimeReleaseDetail = null;
  state.runtimeReleaseInspectorError = null;
  if (!runId) {
    return;
  }

  try {
    const encodedRunId = encodeURIComponent(runId);
    state.runtimeReleaseDetail = await requestJson(
      '/api/public/sandbox-certification/runs/' + encodedRunId,
    );
  } catch (error) {
    state.runtimeReleaseInspectorError = error.message || 'Unable to load runtime-release inspector';
  }
};

const syncInspectors = async (payload) => {
  const nextTaskId = resolveSelectedId(payload.snapshot.tasks || [], state.selectedTaskId);
  const nextAiRunId = resolveSelectedId(payload.snapshot.aiRuns || [], state.selectedAiRunId);
  const nextCertificationId = resolveSelectedId(payload.certification || [], state.selectedCertificationId);
  const nextRuntimeReleaseRunId = resolveSelectedId(
    payload.snapshot.certificationRuns || [],
    state.selectedRuntimeReleaseRunId,
  );
  const [nextCertificationProfile, nextCertificationPack] = nextCertificationId ? nextCertificationId.split(':', 2) : [null, null];
  await Promise.all([
    loadTaskInspector(nextTaskId),
    loadAiRunInspector(nextAiRunId),
    loadCertificationInspector(nextCertificationProfile, nextCertificationPack),
    loadRuntimeReleaseInspector(nextRuntimeReleaseRunId),
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
    setStatus(isSnapshotEmpty(payload.snapshot) ? 'Connected, waiting for data' : 'Live data connected', isSnapshotEmpty(payload.snapshot) ? 'badge-warn' : 'badge-ok');
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

const submitRuntimeReleaseDecision = async (runId, decision) => {
  const encodedRunId = encodeURIComponent(runId);
  const defaultReason = decision === 'approved'
    ? 'Approved from operator console'
    : 'Rejected from operator console';
  const reason = window.prompt(
    decision === 'approved'
      ? 'Reason to approve runtime release:'
      : 'Reason to reject runtime release:',
    defaultReason,
  );
  if (reason === null) {
    return false;
  }
  const evidenceRefsRaw = window.prompt(
    'Evidence refs (comma separated URLs or ids):',
    '',
  );
  if (evidenceRefsRaw === null) {
    return false;
  }

  const detail = await requestJson(
    '/api/public/sandbox-certification/runs/' + encodedRunId + '/promotion-decision',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision,
        reason,
        evidenceRefs: evidenceRefsRaw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    },
  );
  state.runtimeReleaseDetail = detail;
  state.selectedRuntimeReleaseRunId = runId;
  state.runtimeReleaseInspectorError = null;
  return true;
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

const selectRuntimeReleaseRun = async (runId) => {
  if (!state.payload) {
    return;
  }

  await loadRuntimeReleaseInspector(runId);
  renderDashboard(state.payload);
};

refreshButton.addEventListener('click', () => {
  void loadConsole();
});

document.addEventListener('click', async (event) => {
  const target = event.target instanceof HTMLElement
    ? event.target.closest('[data-fixture-action], [data-console-action], [data-task-action], [data-runtime-release-action]')
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

    if (consoleAction === 'inspect-runtime-release' && target.dataset.runtimeReleaseRunId) {
      await selectRuntimeReleaseRun(target.dataset.runtimeReleaseRunId);
      return;
    }

    const taskAction = target.dataset.taskAction;
    const taskId = target.dataset.taskId;
    if (taskAction && taskId) {
      const applied = await submitTaskAction(taskId, taskAction);
      if (applied) {
        await loadConsole();
      }
      return;
    }

    const runtimeReleaseAction = target.dataset.runtimeReleaseAction;
    const runtimeReleaseRunId = target.dataset.runtimeReleaseRunId;
    if (
      runtimeReleaseAction &&
      runtimeReleaseRunId &&
      (runtimeReleaseAction === 'approve' || runtimeReleaseAction === 'reject')
    ) {
      const applied = await submitRuntimeReleaseDecision(
        runtimeReleaseRunId,
        runtimeReleaseAction === 'approve' ? 'approved' : 'rejected',
      );
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
        const [
          snapshotResponse,
          certificationResponse,
          certificationRunsResponse,
          manualReviewResponse,
          quarantinesResponse,
          recoveryResponse,
          telemetryEventsResponse,
          telemetryMetricsResponse,
        ] = await Promise.all([
          requestPublicApi(options, publicApiEndpointPaths.snapshot),
          requestPublicApi(options, publicApiEndpointPaths.sandboxCertification),
          requestPublicApi(options, runtimeReleaseRunsEndpointPath),
          requestPublicApi(options, publicApiEndpointPaths.manualReview),
          requestPublicApi(options, publicApiEndpointPaths.quarantines),
          requestPublicApi(options, publicApiEndpointPaths.recovery),
          requestPublicApi(options, publicApiEndpointPaths.telemetryEvents),
          requestPublicApi(options, publicApiEndpointPaths.telemetryMetrics),
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
        const certificationRuns =
          certificationRunsResponse.ok
            ? await readJsonResponse<readonly SandboxCertificationRunReadModel[]>(certificationRunsResponse)
            : [];
        const manualReviews =
          manualReviewResponse.ok
            ? await readJsonResponse<readonly ManualReviewReadModel[]>(manualReviewResponse)
            : [];
        const quarantines =
          quarantinesResponse.ok
            ? await readJsonResponse<readonly QuarantineReadModel[]>(quarantinesResponse)
            : [];
        const recovery =
          recoveryResponse.ok
            ? await readJsonResponse<readonly RecoveryReadModel[]>(recoveryResponse)
            : [];
        const telemetryEvents =
          telemetryEventsResponse.ok
            ? await readJsonResponse<readonly TelemetryEventReadModel[]>(telemetryEventsResponse)
            : [];
        const telemetryMetrics =
          telemetryMetricsResponse.ok
            ? await readJsonResponse<readonly TelemetryMetricReadModel[]>(telemetryMetricsResponse)
            : [];
        const snapshot = createOperatorConsoleSnapshotFromOperation(operationSnapshot, {
          certification,
          certificationRuns,
          manualReviews,
          quarantines,
          recovery,
          telemetryEvents,
          telemetryMetrics,
        });
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
