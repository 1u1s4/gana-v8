import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  createFixture,
  createParlay,
  createPrediction,
  createTask,
  createValidation,
  type FixtureEntity,
  type ParlayEntity,
  type PredictionEntity,
  type TaskEntity,
  type ValidationEntity,
} from "@gana-v8/domain-core";
import { createPrismaClient, createPrismaUnitOfWork } from "@gana-v8/storage-adapters";

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

export interface OperationSnapshot {
  readonly generatedAt: string;
  readonly fixtures: readonly FixtureEntity[];
  readonly tasks: readonly TaskEntity[];
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
  readonly tasks: () => readonly TaskEntity[];
  readonly rawBatches: () => readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots: () => readonly OddsSnapshotReadModel[];
  readonly predictions: () => readonly PredictionEntity[];
  readonly predictionById: (predictionId: string) => PredictionEntity | null;
  readonly parlays: () => readonly ParlayEntity[];
  readonly parlayById: (parlayId: string) => ParlayEntity | null;
  readonly validations: () => readonly ValidationEntity[];
  readonly validationById: (validationId: string) => ValidationEntity | null;
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
  tasks: "/tasks",
  rawBatches: "/raw-batches",
  oddsSnapshots: "/odds-snapshots",
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
      name: "tasks",
      status: input.tasks.length > 0 ? "pass" : "warn",
      detail: `${input.tasks.length} task(s) in snapshot`,
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
  readonly tasks?: readonly TaskEntity[];
  readonly rawBatches?: readonly RawIngestionBatchReadModel[];
  readonly oddsSnapshots?: readonly OddsSnapshotReadModel[];
  readonly predictions?: readonly PredictionEntity[];
  readonly parlays?: readonly ParlayEntity[];
  readonly validations?: readonly ValidationEntity[];
} = {}): OperationSnapshot {
  const generatedAt = input.generatedAt ?? "2026-04-15T01:00:00.000Z";
  const fixtures = [...(input.fixtures ?? createDemoFixtures())];
  const tasks = [...(input.tasks ?? createDemoTasks())];
  const rawBatches = [...(input.rawBatches ?? [])];
  const oddsSnapshots = [...(input.oddsSnapshots ?? [])];
  const predictions = [...(input.predictions ?? createDemoPredictions(fixtures))];
  const parlays = [...(input.parlays ?? createDemoParlays(predictions))];
  const validations = [...(input.validations ?? createDemoValidations(parlays, predictions))];
  const validationSummary = summarizeValidations(validations);

  return {
    generatedAt,
    fixtures,
    tasks,
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
    tasks: () => listTasks(snapshot),
    rawBatches: () => listRawBatches(snapshot),
    oddsSnapshots: () => listOddsSnapshots(snapshot),
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
  const fixtureDetail = matchFixtureDetailPath(normalizedPath);
  if (fixtureDetail) {
    const fixture = handlers.fixtureById(fixtureDetail.fixtureId);
    if (!fixture) {
      return createResourceNotFoundResponse("fixture", fixtureDetail.fixtureId);
    }

    return { status: 200, body: fixture };
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
    case publicApiEndpointPaths.tasks:
      return { status: 200, body: handlers.tasks() };
    case publicApiEndpointPaths.rawBatches:
      return { status: 200, body: handlers.rawBatches() };
    case publicApiEndpointPaths.oddsSnapshots:
      return { status: 200, body: handlers.oddsSnapshots() };
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

export function findFixtureById(
  snapshot: OperationSnapshot,
  fixtureId: string,
): FixtureEntity | null {
  return snapshot.fixtures.find((fixture) => fixture.id === fixtureId) ?? null;
}

export function listTasks(snapshot: OperationSnapshot): readonly TaskEntity[] {
  return snapshot.tasks;
}

export function listRawBatches(snapshot: OperationSnapshot): readonly RawIngestionBatchReadModel[] {
  return snapshot.rawBatches;
}

export function listOddsSnapshots(snapshot: OperationSnapshot): readonly OddsSnapshotReadModel[] {
  return snapshot.oddsSnapshots;
}

export function listPredictions(
  snapshot: OperationSnapshot,
): readonly PredictionEntity[] {
  return snapshot.predictions;
}

export function findPredictionById(
  snapshot: OperationSnapshot,
  predictionId: string,
): PredictionEntity | null {
  return snapshot.predictions.find((prediction) => prediction.id === predictionId) ?? null;
}

export function listParlays(snapshot: OperationSnapshot): readonly ParlayEntity[] {
  return snapshot.parlays;
}

export function findParlayById(
  snapshot: OperationSnapshot,
  parlayId: string,
): ParlayEntity | null {
  return snapshot.parlays.find((parlay) => parlay.id === parlayId) ?? null;
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

export async function loadOperationSnapshotFromDatabase(databaseUrl?: string): Promise<OperationSnapshot> {
  const client = createPrismaClient(databaseUrl);

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const [fixtures, tasks, predictions, parlays, validations, rawBatches, oddsSnapshots] = await Promise.all([
      unitOfWork.fixtures.list(),
      unitOfWork.tasks.list(),
      unitOfWork.predictions.list(),
      unitOfWork.parlays.list(),
      unitOfWork.validations.list(),
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
    ]);

    return createOperationSnapshot({
      fixtures,
      generatedAt: new Date().toISOString(),
      oddsSnapshots: oddsSnapshots.map((snapshot) => ({
        bookmakerKey: snapshot.bookmakerKey,
        capturedAt: snapshot.capturedAt.toISOString(),
        ...(snapshot.fixtureId ? { fixtureId: snapshot.fixtureId } : {}),
        id: snapshot.id,
        marketKey: snapshot.marketKey,
        providerFixtureId: snapshot.providerFixtureId,
        selectionCount: Number(snapshot.selectionCount),
      })),
      parlays,
      predictions,
      rawBatches: rawBatches.map((batch) => ({
        endpointFamily: batch.endpointFamily,
        extractionStatus: batch.extractionStatus,
        extractionTime: batch.extractionTime.toISOString(),
        id: batch.id,
        providerCode: batch.providerCode,
        recordCount: batch.recordCount,
      })),
      tasks,
      validations,
    });
  } finally {
    await client.$disconnect();
  }
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

function matchFixtureDetailPath(requestPath: string): { fixtureId: string } | null {
  const match = requestPath.match(/^\/fixtures\/([^/]+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { fixtureId: decodeURIComponent(match[1]) };
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
