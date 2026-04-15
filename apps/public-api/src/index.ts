import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  createFixture,
  createParlay,
  createPrediction,
  createValidation,
  type FixtureEntity,
  type ParlayEntity,
  type PredictionEntity,
  type ValidationEntity,
} from "@gana-v8/domain-core";

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

export interface OperationSnapshot {
  readonly generatedAt: string;
  readonly fixtures: readonly FixtureEntity[];
  readonly predictions: readonly PredictionEntity[];
  readonly parlays: readonly ParlayEntity[];
  readonly validations: readonly ValidationEntity[];
  readonly validationSummary: ValidationSummary;
  readonly health: PublicApiHealth;
}

export interface PublicApiHandlers {
  readonly fixtures: () => readonly FixtureEntity[];
  readonly predictions: () => readonly PredictionEntity[];
  readonly parlays: () => readonly ParlayEntity[];
  readonly validationSummary: () => ValidationSummary;
  readonly health: () => PublicApiHealth;
  readonly snapshot: () => OperationSnapshot;
}

export interface PublicApiHttpOptions {
  readonly snapshot?: OperationSnapshot;
}

export interface PublicApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export const publicApiEndpointPaths = {
  fixtures: "/fixtures",
  predictions: "/predictions",
  parlays: "/parlays",
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
    { name: "@gana-v8/observability", category: "workspace" }
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
  readonly predictions: readonly PredictionEntity[];
  readonly parlays: readonly ParlayEntity[];
  readonly validationSummary: ValidationSummary;
}): PublicApiHealth {
  const checks = [
    {
      name: "fixtures",
      status: input.fixtures.length > 0 ? "pass" : "warn",
      detail: `${input.fixtures.length} fixture(s) in snapshot`,
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
      status: input.validationSummary.failed === 0 ? "pass" : "warn",
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
  readonly predictions?: readonly PredictionEntity[];
  readonly parlays?: readonly ParlayEntity[];
  readonly validations?: readonly ValidationEntity[];
} = {}): OperationSnapshot {
  const generatedAt = input.generatedAt ?? "2026-04-15T01:00:00.000Z";
  const fixtures = [...(input.fixtures ?? createDemoFixtures())];
  const predictions = [...(input.predictions ?? createDemoPredictions(fixtures))];
  const parlays = [...(input.parlays ?? createDemoParlays(predictions))];
  const validations = [...(input.validations ?? createDemoValidations(parlays, predictions))];
  const validationSummary = summarizeValidations(validations);

  return {
    generatedAt,
    fixtures,
    predictions,
    parlays,
    validations,
    validationSummary,
    health: createHealthReport({
      generatedAt,
      fixtures,
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
    predictions: () => listPredictions(snapshot),
    parlays: () => listParlays(snapshot),
    validationSummary: () => getValidationSummary(snapshot),
    health: () => getHealth(snapshot),
    snapshot: () => snapshot,
  };
}

export function routePublicApiRequest(
  handlers: PublicApiHandlers,
  requestPath: string,
): PublicApiResponse {
  switch (normalizeRequestPath(requestPath)) {
    case publicApiEndpointPaths.fixtures:
      return { status: 200, body: handlers.fixtures() };
    case publicApiEndpointPaths.predictions:
      return { status: 200, body: handlers.predictions() };
    case publicApiEndpointPaths.parlays:
      return { status: 200, body: handlers.parlays() };
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

export function createPublicApiServer(
  options: PublicApiHttpOptions = {},
): Server {
  const handlers = createPublicApiHandlers(options.snapshot ?? createOperationSnapshot());
  return createServer((request, response) => {
    handlePublicApiRequest(request, response, handlers);
  });
}

export function handlePublicApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  handlers: PublicApiHandlers = createPublicApiHandlers(),
): void {
  const method = request.method ?? "GET";

  if (method !== "GET") {
    writeJsonResponse(response, 405, {
      error: "method_not_allowed",
      message: `Unsupported method: ${method}`,
      allowedMethods: ["GET"],
    });
    return;
  }

  const requestPath = request.url ?? "/";
  const routedResponse = routePublicApiRequest(handlers, requestPath);
  writeJsonResponse(response, routedResponse.status, routedResponse.body);
}

export function listFixtures(snapshot: OperationSnapshot): readonly FixtureEntity[] {
  return snapshot.fixtures;
}

export function listPredictions(
  snapshot: OperationSnapshot,
): readonly PredictionEntity[] {
  return snapshot.predictions;
}

export function listParlays(snapshot: OperationSnapshot): readonly ParlayEntity[] {
  return snapshot.parlays;
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

export function createDemoPredictions(
  fixtures: readonly FixtureEntity[] = createDemoFixtures(),
): readonly PredictionEntity[] {
  return [
    createPrediction({
      id: "pred-boca-home",
      fixtureId: fixtures[0]?.id ?? "fx-boca-river",
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

function writeJsonResponse(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(payload);
}
