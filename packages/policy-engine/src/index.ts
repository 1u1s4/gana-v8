export const workspaceInfo = {
  packageName: "@gana-v8/policy-engine",
  workspaceName: "policy-engine",
  category: "package",
  description: "Operational readiness and publication safety policy evaluation.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface PolicyHealthCheckInput {
  readonly name: string;
  readonly status: "pass" | "warn";
  readonly detail: string;
}

export interface PolicyHealthInput {
  readonly status: "ok" | "degraded";
  readonly checks: readonly PolicyHealthCheckInput[];
}

export interface PolicyRetrySummaryInput {
  readonly retrying: number;
  readonly failed: number;
  readonly quarantined: number;
  readonly exhausted: number;
}

export interface PolicyBackfillNeedInput {
  readonly area: string;
  readonly status: "ok" | "needed";
  readonly detail: string;
}

export interface PolicyTraceabilityInput {
  readonly taskTraceCoverageRate: number;
  readonly aiRunRequestCoverageRate: number;
}

export interface OperationalPolicyInput {
  readonly health: PolicyHealthInput;
  readonly retries: PolicyRetrySummaryInput;
  readonly backfills: readonly PolicyBackfillNeedInput[];
  readonly traceability: PolicyTraceabilityInput;
}

export interface OperationalPolicyGate {
  readonly name:
    | "health"
    | "retries"
    | "backfills"
    | "traceability"
    | "publication-readiness";
  readonly status: "pass" | "warn" | "block";
  readonly detail: string;
}

export interface OperationalPolicyReport {
  readonly status: "ready" | "degraded" | "blocked";
  readonly publishAllowed: boolean;
  readonly retryRecommended: boolean;
  readonly backfillRequired: boolean;
  readonly gates: readonly OperationalPolicyGate[];
  readonly summary: string;
}

export interface CoverageDecisionReason {
  readonly code:
    | "force-include"
    | "force-exclude"
    | "manual-selected"
    | "manual-rejected"
    | "league-watch"
    | "team-watch"
    | "not-tracked-by-policy"
    | "fixture-not-scheduled"
    | "odds-below-min-threshold";
  readonly message: string;
  readonly source: "league-policy" | "team-policy" | "daily-policy" | "manual-override" | "fixture-workflow";
  readonly blocking: boolean;
}

export interface FixtureCoverageScopeDecision {
  readonly fixtureId: string;
  readonly included: boolean;
  readonly eligibleForScoring: boolean;
  readonly eligibleForParlay: boolean;
  readonly visibleInOps: boolean;
  readonly includedBy: readonly CoverageDecisionReason[];
  readonly excludedBy: readonly CoverageDecisionReason[];
  readonly minDetectedOdd?: number;
  readonly appliedMinAllowedOdd: number;
  readonly matchedLeaguePolicyId?: string;
  readonly matchedTeamPolicyIds: readonly string[];
  readonly priorityScore: number;
}

export interface CoverageScopeFixtureLike {
  readonly id: string;
  readonly competition: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly status: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CoverageScopeWorkflowLike {
  readonly selectionOverride?: "none" | "force-include" | "force-exclude";
  readonly manualSelectionStatus?: "none" | "selected" | "rejected";
  readonly minDetectedOdd?: number;
}

export interface CoverageScopeLeaguePolicyLike {
  readonly id: string;
  readonly leagueKey: string;
  readonly leagueName: string;
  readonly enabled: boolean;
  readonly alwaysOn: boolean;
  readonly priority: number;
}

export interface CoverageScopeTeamPolicyLike {
  readonly id: string;
  readonly teamKey: string;
  readonly teamName: string;
  readonly enabled: boolean;
  readonly alwaysTrack: boolean;
  readonly priority: number;
  readonly followHome: boolean;
  readonly followAway: boolean;
}

export interface CoverageScopeDailyPolicyLike {
  readonly minAllowedOdd: number;
  readonly requireTrackedLeagueOrTeam: boolean;
}

export interface EvaluateFixtureCoverageScopeInput {
  readonly fixture: CoverageScopeFixtureLike;
  readonly workflow?: CoverageScopeWorkflowLike;
  readonly leaguePolicies: readonly CoverageScopeLeaguePolicyLike[];
  readonly teamPolicies: readonly CoverageScopeTeamPolicyLike[];
  readonly dailyPolicy: CoverageScopeDailyPolicyLike;
  readonly minDetectedOdd?: number;
  readonly now?: string;
}

const toPercent = (value: number): string => `${Math.round(value * 100)}%`;

const fixtureMetadataValue = (fixture: CoverageScopeFixtureLike, key: string): string | undefined => {
  const value = fixture.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const fixtureMatchesLeaguePolicy = (
  fixture: CoverageScopeFixtureLike,
  policy: CoverageScopeLeaguePolicyLike,
): boolean => {
  const providerLeagueId = fixtureMetadataValue(fixture, "providerLeagueId") ?? fixtureMetadataValue(fixture, "leagueKey");
  return (
    fixture.competition === policy.leagueName ||
    providerLeagueId === policy.leagueKey
  );
};

const fixtureMatchesTeamPolicy = (
  fixture: CoverageScopeFixtureLike,
  policy: CoverageScopeTeamPolicyLike,
): boolean => {
  const homeTeamId = fixtureMetadataValue(fixture, "providerHomeTeamId");
  const awayTeamId = fixtureMetadataValue(fixture, "providerAwayTeamId");
  const homeMatches = policy.followHome && (fixture.homeTeam === policy.teamName || homeTeamId === policy.teamKey);
  const awayMatches = policy.followAway && (fixture.awayTeam === policy.teamName || awayTeamId === policy.teamKey);
  return homeMatches || awayMatches;
};

export const evaluateFixtureCoverageScope = (
  input: EvaluateFixtureCoverageScopeInput,
): FixtureCoverageScopeDecision => {
  const includedBy: CoverageDecisionReason[] = [];
  const excludedBy: CoverageDecisionReason[] = [];
  const matchedLeaguePolicy = input.leaguePolicies.find(
    (policy) => policy.enabled && policy.alwaysOn && fixtureMatchesLeaguePolicy(input.fixture, policy),
  );
  const matchedTeamPolicies = input.teamPolicies.filter(
    (policy) => policy.enabled && policy.alwaysTrack && fixtureMatchesTeamPolicy(input.fixture, policy),
  );

  const workflow = input.workflow;
  const forceInclude = workflow?.selectionOverride === "force-include";
  const forceExclude = workflow?.selectionOverride === "force-exclude";
  const manuallySelected = workflow?.manualSelectionStatus === "selected";
  const manuallyRejected = workflow?.manualSelectionStatus === "rejected";

  if (forceInclude) {
    includedBy.push({
      code: "force-include",
      message: "Fixture was force-included by workflow override.",
      source: "manual-override",
      blocking: false,
    });
  }

  if (manuallySelected) {
    includedBy.push({
      code: "manual-selected",
      message: "Fixture was manually selected for review.",
      source: "fixture-workflow",
      blocking: false,
    });
  }

  if (matchedLeaguePolicy) {
    includedBy.push({
      code: "league-watch",
      message: `Fixture matched watched league ${matchedLeaguePolicy.leagueName}.`,
      source: "league-policy",
      blocking: false,
    });
  }

  for (const policy of matchedTeamPolicies) {
    includedBy.push({
      code: "team-watch",
      message: `Fixture matched watched team ${policy.teamName}.`,
      source: "team-policy",
      blocking: false,
    });
  }

  if (input.fixture.status !== "scheduled") {
    excludedBy.push({
      code: "fixture-not-scheduled",
      message: `Fixture status ${input.fixture.status} is not eligible for automated scoring.`,
      source: "daily-policy",
      blocking: true,
    });
  }

  if (forceExclude) {
    excludedBy.push({
      code: "force-exclude",
      message: "Fixture was force-excluded by workflow override.",
      source: "manual-override",
      blocking: true,
    });
  }

  if (manuallyRejected) {
    excludedBy.push({
      code: "manual-rejected",
      message: "Fixture was manually rejected by operator workflow.",
      source: "fixture-workflow",
      blocking: true,
    });
  }

  const tracked = forceInclude || manuallySelected || Boolean(matchedLeaguePolicy) || matchedTeamPolicies.length > 0;
  if (input.dailyPolicy.requireTrackedLeagueOrTeam && !tracked) {
    excludedBy.push({
      code: "not-tracked-by-policy",
      message: "Fixture does not belong to a tracked league or watched team.",
      source: "daily-policy",
      blocking: true,
    });
  }

  const minDetectedOdd = input.minDetectedOdd ?? workflow?.minDetectedOdd;
  if (minDetectedOdd !== undefined && minDetectedOdd < input.dailyPolicy.minAllowedOdd) {
    excludedBy.push({
      code: "odds-below-min-threshold",
      message: `Fixture min detected odd ${minDetectedOdd.toFixed(2)} is below allowed threshold ${input.dailyPolicy.minAllowedOdd.toFixed(2)}.`,
      source: "daily-policy",
      blocking: true,
    });
  }

  const included = tracked && !excludedBy.some((reason) => reason.code === "force-exclude" || reason.code === "manual-rejected" || reason.code === "fixture-not-scheduled" || reason.code === "not-tracked-by-policy");
  const eligibleForScoring = included && !excludedBy.some((reason) => reason.blocking && reason.code !== "not-tracked-by-policy" ? true : false);
  const eligibleForParlay = eligibleForScoring;
  const priorityScore = Math.max(
    matchedLeaguePolicy?.priority ?? 0,
    ...matchedTeamPolicies.map((policy) => policy.priority),
    forceInclude ? 1000 : 0,
  );

  return {
    fixtureId: input.fixture.id,
    included,
    eligibleForScoring,
    eligibleForParlay,
    visibleInOps: true,
    includedBy,
    excludedBy,
    ...(minDetectedOdd !== undefined ? { minDetectedOdd } : {}),
    appliedMinAllowedOdd: input.dailyPolicy.minAllowedOdd,
    ...(matchedLeaguePolicy ? { matchedLeaguePolicyId: matchedLeaguePolicy.id } : {}),
    matchedTeamPolicyIds: matchedTeamPolicies.map((policy) => policy.id),
    priorityScore,
  };
};

export const evaluateOperationalPolicy = (
  input: OperationalPolicyInput,
): OperationalPolicyReport => {
  const backfillNeeded = input.backfills.filter((entry) => entry.status === "needed");
  const retryPressure = input.retries.retrying + input.retries.failed;
  const traceabilityWeak =
    input.traceability.taskTraceCoverageRate < 0.8 || input.traceability.aiRunRequestCoverageRate < 0.5;

  const gates: OperationalPolicyGate[] = [
    {
      name: "health",
      status: input.health.status === "ok" ? "pass" : "warn",
      detail:
        input.health.status === "ok"
          ? "Health checks are green"
          : `${input.health.checks.filter((check) => check.status === "warn").length} health check(s) degraded`,
    },
    {
      name: "retries",
      status: input.retries.exhausted > 0 || input.retries.quarantined > 0 ? "block" : retryPressure > 0 ? "warn" : "pass",
      detail:
        input.retries.exhausted > 0 || input.retries.quarantined > 0
          ? `${input.retries.exhausted} exhausted and ${input.retries.quarantined} quarantined task(s)`
          : retryPressure > 0
            ? `${input.retries.retrying} retrying and ${input.retries.failed} failed task(s) waiting for attention`
            : "Retry queue is healthy",
    },
    {
      name: "backfills",
      status: backfillNeeded.length > 0 ? "block" : "pass",
      detail:
        backfillNeeded.length > 0
          ? backfillNeeded.map((entry) => `${entry.area}: ${entry.detail}`).join("; ")
          : "No backfill required",
    },
    {
      name: "traceability",
      status: traceabilityWeak ? "warn" : "pass",
      detail:
        `task traces ${toPercent(input.traceability.taskTraceCoverageRate)} | ` +
        `provider requests ${toPercent(input.traceability.aiRunRequestCoverageRate)}`,
    },
  ];

  const publishAllowed = gates.every((gate) => gate.status !== "block");
  gates.push({
    name: "publication-readiness",
    status: publishAllowed ? (gates.some((gate) => gate.status === "warn") ? "warn" : "pass") : "block",
    detail: publishAllowed
      ? gates.some((gate) => gate.status === "warn")
        ? "Publish allowed with degraded operator posture"
        : "Publish allowed"
      : "Publish blocked until retries/backfills are cleared",
  });

  const overallStatus = publishAllowed
    ? gates.some((gate) => gate.status === "warn")
      ? "degraded"
      : "ready"
    : "blocked";

  return {
    status: overallStatus,
    publishAllowed,
    retryRecommended: retryPressure > 0,
    backfillRequired: backfillNeeded.length > 0,
    gates,
    summary:
      overallStatus === "ready"
        ? "Operator policy ready"
        : overallStatus === "degraded"
          ? "Operator policy degraded but still serviceable"
          : "Operator policy blocked: clear backfills/quarantines before publishing",
  };
}
