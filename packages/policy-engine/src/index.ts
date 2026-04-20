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

const toPercent = (value: number): string => `${Math.round(value * 100)}%`;

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
