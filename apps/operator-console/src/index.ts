export interface OperatorConsoleHealth {
  readonly status: "ok" | "degraded";
  readonly generatedAt: string;
  readonly checks: readonly {
    readonly name: string;
    readonly status: "pass" | "warn";
    readonly detail: string;
  }[];
}

export interface OperatorConsoleValidationSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly partial: number;
  readonly pending: number;
  readonly completionRate: number;
}

export interface OperatorConsoleFixture {
  readonly id: string;
  readonly competition: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly status: string;
}

export interface OperatorConsolePrediction {
  readonly id: string;
  readonly fixtureId: string;
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

export interface OperatorConsoleSnapshot {
  readonly generatedAt: string;
  readonly fixtures: readonly OperatorConsoleFixture[];
  readonly predictions: readonly OperatorConsolePrediction[];
  readonly parlays: readonly OperatorConsoleParlay[];
  readonly validationSummary: OperatorConsoleValidationSummary;
  readonly health: OperatorConsoleHealth;
}

export interface OperatorConsolePanel {
  readonly title: string;
  readonly lines: readonly string[];
}

export interface OperatorConsoleModel {
  readonly generatedAt: string;
  readonly health: OperatorConsoleHealth;
  readonly validationSummary: OperatorConsoleValidationSummary;
  readonly alerts: readonly string[];
  readonly panels: readonly OperatorConsolePanel[];
}

export const workspaceInfo = {
  packageName: "@gana-v8/operator-console",
  workspaceName: "operator-console",
  category: "app",
  description: "CLI-style operator console adapter for snapshot, health, fixtures, predictions, parlays, and validation panels.",
  dependencies: [
    { name: "@gana-v8/authz", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/public-api", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export function createOperatorConsoleSnapshot(
  input: Partial<OperatorConsoleSnapshot> = {},
): OperatorConsoleSnapshot {
  return {
    generatedAt: input.generatedAt ?? "2026-04-15T01:00:00.000Z",
    fixtures: input.fixtures ?? [
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
    predictions: input.predictions ?? [
      {
        id: "pred-boca-home",
        fixtureId: "fx-boca-river",
        market: "moneyline",
        outcome: "home",
        confidence: 0.64,
        status: "published",
      },
      {
        id: "pred-inter-over",
        fixtureId: "fx-inter-milan",
        market: "totals",
        outcome: "over",
        confidence: 0.58,
        status: "published",
      },
    ],
    parlays: input.parlays ?? [
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
    validationSummary: input.validationSummary ?? {
      total: 2,
      passed: 1,
      failed: 0,
      partial: 1,
      pending: 0,
      completionRate: 1,
    },
    health: input.health ?? {
      status: "ok",
      generatedAt: input.generatedAt ?? "2026-04-15T01:00:00.000Z",
      checks: [
        {
          name: "fixtures",
          status: "pass",
          detail: "2 fixture(s) in snapshot",
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
  const alerts = snapshot.health.checks
    .filter((check) => check.status === "warn")
    .map((check) => `${check.name}: ${check.detail}`);

  const panels: OperatorConsolePanel[] = [
    {
      title: "Overview",
      lines: [
        `Generated at: ${snapshot.generatedAt}`,
        `Health: ${snapshot.health.status}`,
        `Fixtures: ${snapshot.fixtures.length}`,
        `Predictions: ${snapshot.predictions.length}`,
        `Parlays: ${snapshot.parlays.length}`,
      ],
    },
    {
      title: "Fixtures",
      lines: snapshot.fixtures.map(
        (fixture) =>
          `${fixture.competition} | ${fixture.homeTeam} vs ${fixture.awayTeam} | ${fixture.status}`,
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
  };
}

export function renderOperatorConsole(
  model: OperatorConsoleModel,
): string {
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
