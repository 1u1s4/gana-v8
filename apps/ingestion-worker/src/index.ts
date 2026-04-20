import { createHash } from "node:crypto";

import {
  CanonicalPipeline,
  type CanonicalMatchSnapshot,
} from "@gana-v8/canonical-pipeline";
import {
  createAuditEvent,
  createFixture,
  createTask,
  createTaskRun,
  type FixtureEntity,
  type TaskEntity,
} from "@gana-v8/domain-core";
import {
  loadRuntimeConfig,
  type RuntimeConfig,
} from "@gana-v8/config-runtime";
import {
  SimpleInMemoryQueue,
  createTaskEnvelope,
  createWorkflowRouter,
  type InMemoryQueueAdapter,
  type TaskEnvelope,
  type TaskExecutionResult,
  type WorkflowIntent,
  type WorkflowRouter,
} from "@gana-v8/orchestration-sdk";
import {
  ApiFootballHttpClient,
  ApiFootballProviderError,
  buildChecksum,
  FakeFootballApiClient,
  FootballApiFacade,
  ingestFixturesWindow,
  ingestOddsWindow,
  sampleFixtures,
  sampleOdds,
  type FetchFixturesWindowInput,
  type FetchOddsWindowInput,
  type FootballApiClient,
  type RawFixtureRecord,
  type RawOddsMarketRecord,
  type SourceCoverageWindow,
} from "@gana-v8/source-connectors";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  createPrismaClient,
  createPrismaUnitOfWork,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";

export const workspaceInfo = {
  packageName: "@gana-v8/ingestion-worker",
  workspaceName: "ingestion-worker",
  category: "app",
  description: "Runs connectors, landing jobs, and normalization checkpoints.",
  dependencies: [
    { name: "@gana-v8/canonical-pipeline", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/orchestration-sdk", category: "workspace" },
    { name: "@gana-v8/source-connectors", category: "workspace" },
  ],
} as const;

const computeOpaqueTaskRunId = (taskId: string, attemptNumber: number, startedAt: string): string =>
  `trn_${createHash("sha256").update(`${taskId}:${attemptNumber}:${startedAt}`).digest("hex").slice(0, 16)}`;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export type IngestionWorkerIntent = Extract<WorkflowIntent, "ingest-fixtures" | "ingest-odds">;

export interface IngestionWorkerRuntimeSummary {
  readonly appEnv: RuntimeConfig["app"]["env"];
  readonly profile: RuntimeConfig["app"]["profile"];
  readonly providerSource: RuntimeConfig["provider"]["source"];
  readonly providerBaseUrl: string;
  readonly logLevel: RuntimeConfig["logging"]["level"];
  readonly dryRun: boolean;
  readonly demoMode: boolean;
  readonly persistenceMode: "disabled" | "mysql";
}

export interface IngestionWorkerTaskOutput {
  readonly intent: IngestionWorkerIntent;
  readonly jobName: string;
  readonly batchId: string;
  readonly checksum: string;
  readonly observedRecords: number;
  readonly rawRefs: readonly string[];
  readonly warnings: readonly string[];
  readonly snapshotId: string;
  readonly canonicalMatches: number;
  readonly canonicalMarkets: number;
  readonly insertedCompetitions: number;
  readonly insertedTeams: number;
  readonly upsertedMatches: number;
  readonly upsertedMarkets: number;
}

export interface IngestionExecutionManifest {
  readonly taskId: string;
  readonly intent: IngestionWorkerIntent;
  readonly workflowId: string;
  readonly traceId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly status: TaskExecutionResult["status"];
  readonly provider: {
    readonly providerSource: RuntimeConfig["provider"]["source"];
    readonly providerBaseUrl: string;
    readonly endpointFamily: "fixtures" | "odds";
    readonly requestKind: "live-runner" | "runtime";
  };
  readonly request?: {
    readonly window: SourceCoverageWindow;
    readonly league?: string;
    readonly season?: number;
    readonly fixtureIds?: readonly string[];
    readonly marketKeys?: readonly string[];
    readonly quirksApplied: readonly string[];
  };
  readonly batch?: {
    readonly batchId: string;
    readonly checksum: string;
    readonly observedRecords: number;
    readonly rawRefs: readonly string[];
    readonly warnings: readonly string[];
    readonly snapshotId: string;
  };
  readonly providerError?: {
    readonly category: string;
    readonly provider: string;
    readonly endpoint: string;
    readonly url: string;
    readonly retriable: boolean;
    readonly httpStatus?: number;
    readonly providerErrors?: Record<string, unknown> | readonly unknown[];
    readonly message: string;
  };
}

export interface LiveIngestionProviderOverrides {
  readonly source?: RuntimeConfig["provider"]["source"];
  readonly baseUrl?: string;
  readonly host?: string;
  readonly timeoutMs?: number;
}

export interface LiveIngestionRunResult {
  readonly mode: "fixtures" | "odds";
  readonly status: "succeeded" | "failed" | "cancelled" | "skipped";
  readonly manifest: IngestionExecutionManifest;
  readonly output?: IngestionWorkerTaskOutput;
  readonly error?: string;
  readonly fixtureCount?: number;
  readonly reason?: string;
}

export interface LiveIngestionRunSummary {
  readonly mode: "fixtures" | "odds" | "both";
  readonly ranAt: string;
  readonly runtime: IngestionWorkerRuntimeSummary;
  readonly results: readonly LiveIngestionRunResult[];
}

export interface IngestionWorkerDrainItem {
  readonly envelope: TaskEnvelope;
  readonly execution: TaskExecutionResult<IngestionWorkerTaskOutput>;
}

export interface IngestionWorkerRuntime {
  readonly config: RuntimeConfig;
  readonly pipeline: CanonicalPipeline;
  readonly persistenceMode: "disabled" | "mysql";
  readonly queue: InMemoryQueueAdapter;
  readonly router: WorkflowRouter;
  dispatch(envelope: TaskEnvelope): Promise<TaskExecutionResult<IngestionWorkerTaskOutput>>;
  drainQueue(now?: Date): Promise<readonly IngestionWorkerDrainItem[]>;
  close(): Promise<void>;
}

export interface IngestionWorkerRuntimeOptions {
  readonly apiFootballFetch?: typeof fetch;
  readonly client?: FootballApiClient;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fixtures?: readonly RawFixtureRecord[];
  readonly now?: () => Date;
  readonly odds?: readonly RawOddsMarketRecord[];
  readonly pipeline?: CanonicalPipeline;
  readonly prismaClient?: PrismaClient;
  readonly queue?: InMemoryQueueAdapter;
  readonly unitOfWork?: StorageUnitOfWork;
}

export interface RunLiveIngestionOptions extends IngestionWorkerRuntimeOptions {
  readonly mode?: "fixtures" | "odds" | "both";
  readonly league?: string;
  readonly season?: number;
  readonly fixturesWindow?: SourceCoverageWindow;
  readonly oddsWindow?: SourceCoverageWindow;
  readonly provider?: LiveIngestionProviderOverrides;
  readonly oddsFixtureIds?: readonly string[];
  readonly marketKeys?: readonly string[];
}

interface IngestionWorkerPersistenceContext {
  readonly mode: "disabled" | "mysql";
  readonly prismaClient?: PrismaClient;
  readonly unitOfWork?: StorageUnitOfWork;
  close(): Promise<void>;
}

export interface DemoIngestionWorkerResult {
  readonly taskId: string;
  readonly intent: IngestionWorkerIntent;
  readonly status: TaskExecutionResult["status"];
  readonly observedRecords: number;
  readonly batchId?: string;
  readonly checksum?: string;
  readonly snapshotId?: string;
  readonly canonicalMatches?: number;
  readonly canonicalMarkets?: number;
  readonly warnings: readonly string[];
}

export interface DemoIngestionWorkerSummary {
  readonly triggeredAt: string;
  readonly workspace: string;
  readonly runtime: IngestionWorkerRuntimeSummary;
  readonly registeredIntents: readonly IngestionWorkerIntent[];
  readonly queuedBeforeRun: number;
  readonly completedCount: number;
  readonly snapshotCount: number;
  readonly finalSnapshotId?: string;
  readonly results: readonly DemoIngestionWorkerResult[];
}

export const loadIngestionWorkerRuntimeConfig = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeConfig =>
  loadRuntimeConfig({
    appName: workspaceInfo.workspaceName,
    env,
  });

const toRuntimeSummary = (
  runtimeConfig: RuntimeConfig,
  persistenceMode: IngestionWorkerRuntimeSummary["persistenceMode"],
): IngestionWorkerRuntimeSummary => ({
  appEnv: runtimeConfig.app.env,
  demoMode: runtimeConfig.flags.demoMode,
  dryRun: runtimeConfig.flags.dryRun,
  logLevel: runtimeConfig.logging.level,
  persistenceMode,
  profile: runtimeConfig.app.profile,
  providerBaseUrl: runtimeConfig.provider.baseUrl,
  providerSource: runtimeConfig.provider.source,
});

const toEndpointFamily = (intent: IngestionWorkerIntent): "fixtures" | "odds" =>
  intent === "ingest-odds" ? "odds" : "fixtures";

const toProviderErrorManifest = (
  execution: TaskExecutionResult<IngestionWorkerTaskOutput>,
): IngestionExecutionManifest["providerError"] | undefined => {
  const details = execution.errorDetails;
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
    message: execution.error ?? "provider_error",
    provider,
    ...(typeof details.httpStatus === "number" ? { httpStatus: details.httpStatus } : {}),
    ...(details.providerErrors !== undefined
      ? { providerErrors: details.providerErrors as Record<string, unknown> | readonly unknown[] }
      : {}),
    retriable,
    url,
  };
};

const createExecutionManifest = (
  envelope: TaskEnvelope<Record<string, unknown>>,
  execution: TaskExecutionResult<IngestionWorkerTaskOutput>,
  runtimeConfig: RuntimeConfig,
  startedAt: string,
  requestKind: IngestionExecutionManifest["provider"]["requestKind"] = "runtime",
  request?: IngestionExecutionManifest["request"],
): IngestionExecutionManifest => {
  const providerError = toProviderErrorManifest(execution);

  return {
    finishedAt: execution.finishedAt,
    intent: envelope.intent as IngestionWorkerIntent,
    provider: {
      endpointFamily: toEndpointFamily(envelope.intent as IngestionWorkerIntent),
      providerBaseUrl: runtimeConfig.provider.baseUrl,
      providerSource: runtimeConfig.provider.source,
      requestKind,
    },
    ...(providerError ? { providerError } : {}),
    ...(request ? { request } : {}),
    ...(execution.output
      ? {
          batch: {
            batchId: execution.output.batchId,
            checksum: execution.output.checksum,
            observedRecords: execution.output.observedRecords,
            rawRefs: execution.output.rawRefs,
            snapshotId: execution.output.snapshotId,
            warnings: execution.output.warnings,
          },
        }
      : {}),
    startedAt,
    status: execution.status,
    taskId: envelope.id,
    traceId: envelope.traceId,
    workflowId: envelope.workflowId,
  };
};

const toSourceName = (runtimeConfig: RuntimeConfig): string =>
  `${runtimeConfig.provider.source}:${runtimeConfig.provider.baseUrl}`;

const firstDefined = (...values: readonly (string | undefined)[]): string | undefined =>
  values.find((value) => value !== undefined && value.trim().length > 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveApiFootballConfig = (
  runtimeConfig: RuntimeConfig,
  env: Readonly<Record<string, string | undefined>>,
):
  | {
      readonly apiKey: string;
      readonly baseUrl: string;
      readonly host: string;
      readonly timeoutMs?: number;
    }
  | undefined => {
  const apiKey = firstDefined(
    env.GANA_API_FOOTBALL_KEY,
    env.API_FOOTBALL_KEY,
    env.APIFOOTBALL_API_KEY,
    env.RAPIDAPI_KEY,
  );
  const shouldUseLiveClient = runtimeConfig.provider.source === "live-readonly" || apiKey !== undefined;

  if (!shouldUseLiveClient) {
    return undefined;
  }

  if (!apiKey) {
    throw new Error(
      "API-Football live mode requires GANA_API_FOOTBALL_KEY (or API_FOOTBALL_KEY/APIFOOTBALL_API_KEY/RAPIDAPI_KEY)",
    );
  }

  const rawTimeout = firstDefined(env.GANA_API_FOOTBALL_TIMEOUT_MS, env.API_FOOTBALL_TIMEOUT_MS);
  const timeoutMs = rawTimeout === undefined ? undefined : Number(rawTimeout);
  if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`Invalid API-Football timeout: ${rawTimeout}`);
  }

  return {
    apiKey,
    baseUrl: runtimeConfig.provider.baseUrl,
    host: firstDefined(env.GANA_API_FOOTBALL_HOST, env.API_FOOTBALL_HOST) ?? "api-football-v1.p.rapidapi.com",
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
};

const countMarkets = (snapshot: CanonicalMatchSnapshot): number =>
  snapshot.matches.reduce((total, match) => total + match.odds.length, 0);

const toFixtureStatus = (status: RawFixtureRecord["status"]): FixtureEntity["status"] => {
  switch (status) {
    case "scheduled":
    case "live":
    case "cancelled":
      return status;
    case "finished":
      return "completed";
    case "postponed":
      return "scheduled";
  }
};

const toFixtureId = (record: RawFixtureRecord): string =>
  `fixture:${record.providerCode}:${record.providerFixtureId}`;

const toPersistedFixture = (
  record: RawFixtureRecord,
  batch: {
    readonly batchId: string;
    readonly checksum: string;
    readonly sourceEndpoint: string;
    readonly sourceName: string;
    readonly extractionStatus: string;
  },
): FixtureEntity =>
  createFixture({
    id: toFixtureId(record),
    sport: "football",
    competition: record.competition.name,
    homeTeam: record.homeTeam.name,
    awayTeam: record.awayTeam.name,
    scheduledAt: record.scheduledAt,
    status: toFixtureStatus(record.status),
    ...(record.score?.home !== null &&
    record.score?.home !== undefined &&
    record.score?.away !== null &&
    record.score?.away !== undefined
      ? { score: { home: record.score.home, away: record.score.away } }
      : {}),
    metadata: {
      batchId: batch.batchId,
      checksum: batch.checksum,
      extractionStatus: batch.extractionStatus,
      providerCode: record.providerCode,
      providerCompetitionId: record.competition.providerCompetitionId,
      providerFixtureId: record.providerFixtureId,
      sourceEndpoint: batch.sourceEndpoint,
      sourceName: batch.sourceName,
      ...(record.sourceUpdatedAt ? { sourceUpdatedAt: record.sourceUpdatedAt } : {}),
    },
  });

const createPersistenceContext = (
  config: RuntimeConfig,
  options: IngestionWorkerRuntimeOptions,
): IngestionWorkerPersistenceContext => {
  if (options.unitOfWork) {
    return {
      close: async () => {},
      mode: "mysql",
      ...(options.prismaClient ? { prismaClient: options.prismaClient } : {}),
      unitOfWork: options.unitOfWork,
    };
  }

  if (config.flags.demoMode || config.flags.dryRun) {
    return {
      close: async () => {},
      mode: "disabled",
    };
  }

  const env = options.env ?? process.env;
  const databaseUrl = env.GANA_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      close: async () => {},
      mode: "disabled",
    };
  }

  const client = options.prismaClient ?? createPrismaClient(databaseUrl);

  return {
    close: async () => {
      if (!options.prismaClient) {
        await client.$disconnect();
      }
    },
    mode: "mysql",
    prismaClient: client,
    unitOfWork: createPrismaUnitOfWork(client),
  };
};

const persistRawBatch = async (
  prismaClient: PrismaClient | undefined,
  batch: {
    readonly batchId: string;
    readonly checksum: string;
    readonly coverageWindow: {
      readonly start: string;
      readonly end: string;
      readonly granularity: "daily" | "intraday";
    };
    readonly extractionStatus: string;
    readonly extractionTime: string;
    readonly lineage: {
      readonly endpointFamily: string;
      readonly fetchedAt: string;
      readonly providerCode: string;
      readonly runId: string;
      readonly schemaVersion: string;
    };
    readonly rawObjectRefs: readonly string[];
    readonly records: readonly unknown[];
    readonly sourceEndpoint: string;
    readonly sourceName: string;
    readonly sourceQualityScore: number;
    readonly warnings: readonly string[];
  },
): Promise<void> => {
  if (!prismaClient) {
    return;
  }

  await prismaClient.rawIngestionBatch.upsert({
    where: { id: batch.batchId },
    create: {
      id: batch.batchId,
      checksum: batch.checksum,
      coverageGranularity: batch.coverageWindow.granularity,
      coverageWindowEnd: new Date(batch.coverageWindow.end),
      coverageWindowStart: new Date(batch.coverageWindow.start),
      endpointFamily: batch.lineage.endpointFamily,
      extractionStatus: batch.extractionStatus,
      extractionTime: new Date(batch.extractionTime),
      fetchedAt: new Date(batch.lineage.fetchedAt),
      providerCode: batch.lineage.providerCode,
      rawObjectRefs: [...batch.rawObjectRefs],
      recordCount: batch.records.length,
      runId: batch.lineage.runId,
      schemaVersion: batch.lineage.schemaVersion,
      sourceEndpoint: batch.sourceEndpoint,
      sourceName: batch.sourceName,
      sourceQualityScore: batch.sourceQualityScore,
      warnings: [...batch.warnings],
    },
    update: {
      checksum: batch.checksum,
      coverageGranularity: batch.coverageWindow.granularity,
      coverageWindowEnd: new Date(batch.coverageWindow.end),
      coverageWindowStart: new Date(batch.coverageWindow.start),
      endpointFamily: batch.lineage.endpointFamily,
      extractionStatus: batch.extractionStatus,
      extractionTime: new Date(batch.extractionTime),
      fetchedAt: new Date(batch.lineage.fetchedAt),
      providerCode: batch.lineage.providerCode,
      rawObjectRefs: [...batch.rawObjectRefs],
      recordCount: batch.records.length,
      runId: batch.lineage.runId,
      schemaVersion: batch.lineage.schemaVersion,
      sourceEndpoint: batch.sourceEndpoint,
      sourceName: batch.sourceName,
      sourceQualityScore: batch.sourceQualityScore,
      warnings: [...batch.warnings],
    },
  });
};

const persistOddsSnapshots = async (
  prismaClient: PrismaClient | undefined,
  batch: {
    readonly batchId: string;
    readonly checksum: string;
    readonly coverageWindow: {
      readonly start: string;
      readonly end: string;
      readonly granularity: "daily" | "intraday";
    };
    readonly extractionStatus: string;
    readonly extractionTime: string;
    readonly lineage: {
      readonly endpointFamily: string;
      readonly fetchedAt: string;
      readonly providerCode: string;
      readonly runId: string;
      readonly schemaVersion: string;
    };
    readonly rawObjectRefs: readonly string[];
    readonly records: readonly RawOddsMarketRecord[];
    readonly sourceEndpoint: string;
    readonly sourceName: string;
    readonly sourceQualityScore: number;
    readonly warnings: readonly string[];
  },
): Promise<void> => {
  if (!prismaClient) {
    return;
  }

  await persistRawBatch(prismaClient, batch);

  for (const record of batch.records) {
    const snapshotId = buildChecksum({
      batchId: batch.batchId,
      bookmakerKey: record.bookmakerKey,
      marketKey: record.marketKey,
      providerFixtureId: record.providerFixtureId,
      providerCode: record.providerCode,
    });

    await prismaClient.oddsSnapshot.upsert({
      where: { id: snapshotId },
      create: {
        id: snapshotId,
        batchId: batch.batchId,
        bookmakerKey: record.bookmakerKey,
        capturedAt: new Date(record.sourceUpdatedAt ?? batch.extractionTime),
        fixtureId: `fixture:${record.providerCode}:${record.providerFixtureId}`,
        marketKey: record.marketKey,
        payload: record.payload as Prisma.InputJsonValue,
        providerCode: record.providerCode,
        providerFixtureId: record.providerFixtureId,
        selections: {
          create: record.selections.map((selection, index) => ({
            id: buildChecksum({ index, selection, snapshotId }),
            index,
            label: selection.label,
            priceDecimal: selection.priceDecimal,
            selectionKey: selection.key,
          })),
        },
      },
      update: {
        batchId: batch.batchId,
        bookmakerKey: record.bookmakerKey,
        capturedAt: new Date(record.sourceUpdatedAt ?? batch.extractionTime),
        fixtureId: `fixture:${record.providerCode}:${record.providerFixtureId}`,
        marketKey: record.marketKey,
        payload: record.payload as Prisma.InputJsonValue,
        providerCode: record.providerCode,
        providerFixtureId: record.providerFixtureId,
        selections: {
          deleteMany: {},
          create: record.selections.map((selection, index) => ({
            id: buildChecksum({ index, selection, snapshotId }),
            index,
            label: selection.label,
            priceDecimal: selection.priceDecimal,
            selectionKey: selection.key,
          })),
        },
      },
    });
  }
};

const persistFixtures = async (
  prismaClient: PrismaClient | undefined,
  unitOfWork: StorageUnitOfWork | undefined,
  batch: {
    readonly batchId: string;
    readonly checksum: string;
    readonly coverageWindow: {
      readonly start: string;
      readonly end: string;
      readonly granularity: "daily" | "intraday";
    };
    readonly extractionStatus: string;
    readonly extractionTime: string;
    readonly lineage: {
      readonly endpointFamily: string;
      readonly fetchedAt: string;
      readonly providerCode: string;
      readonly runId: string;
      readonly schemaVersion: string;
    };
    readonly rawObjectRefs: readonly string[];
    readonly sourceEndpoint: string;
    readonly sourceName: string;
    readonly sourceQualityScore: number;
    readonly warnings: readonly string[];
    readonly records: readonly RawFixtureRecord[];
  },
): Promise<void> => {
  if (!unitOfWork) {
    return;
  }

  await persistRawBatch(prismaClient, batch);

  for (const record of batch.records) {
    await unitOfWork.fixtures.save(toPersistedFixture(record, batch));
  }
};

const persistTaskExecution = async (
  unitOfWork: StorageUnitOfWork | undefined,
  runtimeConfig: RuntimeConfig,
  envelope: TaskEnvelope<Record<string, unknown>>,
  execution: TaskExecutionResult<IngestionWorkerTaskOutput>,
  startedAt: string,
): Promise<void> => {
  if (!unitOfWork) {
    return;
  }

  const finishedAt = execution.finishedAt;
  const task = createTask({
    id: envelope.id,
    kind: envelope.taskKind,
    status: execution.status as TaskEntity["status"],
    priority: envelope.priority,
    payload: {
      ...envelope.payload,
      dedupeKey: envelope.dedupeKey,
      metadata: envelope.metadata,
      traceId: envelope.traceId,
      workflowId: envelope.workflowId,
    },
    attempts: [
      {
        startedAt,
        finishedAt,
        ...(execution.error ? { error: execution.error } : {}),
      },
    ],
    scheduledFor: envelope.scheduledFor,
    createdAt: envelope.createdAt,
    updatedAt: finishedAt,
  });

  const computedTaskRunId = computeOpaqueTaskRunId(envelope.id, 1, startedAt);

  await unitOfWork.tasks.save(task);

  const existingTaskRun = (await unitOfWork.taskRuns.findByTaskId(envelope.id))
    .find((taskRun) => taskRun.attemptNumber === 1);
  const persistedTaskRun = existingTaskRun ?? await unitOfWork.taskRuns.save(
    createTaskRun({
      id: computedTaskRunId,
      taskId: envelope.id,
      attemptNumber: 1,
      status: execution.status,
      startedAt,
      finishedAt,
      ...(execution.error ? { error: execution.error } : {}),
      createdAt: startedAt,
      updatedAt: finishedAt,
    }),
  );
  const taskRunId = persistedTaskRun.id;

  const output = execution.output;
  const payloadWindow = isRecord(envelope.payload.window) ? envelope.payload.window : undefined;
  const request = payloadWindow &&
    typeof payloadWindow.start === "string" &&
    typeof payloadWindow.end === "string" &&
    (payloadWindow.granularity === "daily" || payloadWindow.granularity === "intraday")
    ? {
        window: {
          start: payloadWindow.start,
          end: payloadWindow.end,
          granularity: payloadWindow.granularity,
        },
        ...(typeof envelope.payload.league === "string" ? { league: envelope.payload.league } : {}),
        ...(typeof envelope.payload.season === "number" ? { season: envelope.payload.season } : {}),
        ...(Array.isArray(envelope.payload.fixtureIds)
          ? { fixtureIds: envelope.payload.fixtureIds.filter((value): value is string => typeof value === "string") }
          : {}),
        ...(Array.isArray(envelope.payload.marketKeys)
          ? { marketKeys: envelope.payload.marketKeys.filter((value): value is string => typeof value === "string") }
          : {}),
        ...(Array.isArray(envelope.payload.quirksApplied)
          ? { quirksApplied: envelope.payload.quirksApplied.filter((value): value is string => typeof value === "string") }
          : { quirksApplied: [] }),
      }
    : undefined;
  await unitOfWork.auditEvents.save(
    createAuditEvent({
      id: `${envelope.id}:audit:${finishedAt}`,
      aggregateType: "task",
      aggregateId: envelope.id,
      eventType:
        execution.status === "succeeded" ? `${envelope.intent}.succeeded` : `${envelope.intent}.failed`,
      actor: "ingestion-worker",
      payload: {
        batchId: output?.batchId ?? null,
        canonicalMarkets: output?.canonicalMarkets ?? null,
        canonicalMatches: output?.canonicalMatches ?? null,
        checksum: output?.checksum ?? null,
        error: execution.error ?? null,
        errorDetails: execution.errorDetails ?? null,
        intent: envelope.intent,
        observedRecords: output?.observedRecords ?? null,
        ...(request ? { request } : {}),
        rawRefs: output?.rawRefs ?? [],
        snapshotId: output?.snapshotId ?? null,
        status: execution.status,
        taskRunId,
        warnings: output?.warnings ?? [],
        workflowId: envelope.workflowId,
        provider: {
          endpointFamily: envelope.intent === "ingest-odds" ? "odds" : "fixtures",
          providerBaseUrl: runtimeConfig.provider.baseUrl,
          providerSource: runtimeConfig.provider.source,
          requestKind: envelope.metadata.source === "ingestion-worker/live-runner" ? "live-runner" : "runtime",
        },
      },
      occurredAt: finishedAt,
      createdAt: finishedAt,
      updatedAt: finishedAt,
    }),
  );
};

const toTaskOutput = (
  intent: IngestionWorkerIntent,
  jobName: string,
  observedRecords: number,
  batch: {
    readonly batchId: string;
    readonly checksum: string;
    readonly rawObjectRefs: readonly string[];
    readonly warnings: readonly string[];
  },
  canonical: {
    readonly snapshot: CanonicalMatchSnapshot;
    readonly insertedCompetitions: number;
    readonly insertedTeams: number;
    readonly upsertedMatches: number;
    readonly upsertedMarkets: number;
  },
): IngestionWorkerTaskOutput => ({
  batchId: batch.batchId,
  canonicalMarkets: countMarkets(canonical.snapshot),
  canonicalMatches: canonical.snapshot.matches.length,
  checksum: batch.checksum,
  insertedCompetitions: canonical.insertedCompetitions,
  insertedTeams: canonical.insertedTeams,
  intent,
  jobName,
  observedRecords,
  rawRefs: batch.rawObjectRefs,
  snapshotId: canonical.snapshot.snapshotId,
  upsertedMarkets: canonical.upsertedMarkets,
  upsertedMatches: canonical.upsertedMatches,
  warnings: batch.warnings,
});

const toFixturesPayload = (payload: Record<string, unknown>): FetchFixturesWindowInput => {
  const input = payload as Partial<FetchFixturesWindowInput>;
  if (!input.window) {
    throw new Error("ingest-fixtures payload requires window");
  }

  return {
    ...(input.league ? { league: input.league } : {}),
    ...(input.season !== undefined ? { season: input.season } : {}),
    window: input.window,
  };
};

const toOddsPayload = (
  payload: Record<string, unknown>,
  fallbackFixtureIds: readonly string[],
): FetchOddsWindowInput => {
  const input = payload as Partial<FetchOddsWindowInput>;
  if (!input.window) {
    throw new Error("ingest-odds payload requires window");
  }

  return {
    ...(input.fixtureIds ? { fixtureIds: input.fixtureIds } : { fixtureIds: fallbackFixtureIds }),
    ...(input.marketKeys ? { marketKeys: input.marketKeys } : {}),
    window: input.window,
  };
};

const createClient = (
  runtimeConfig: RuntimeConfig,
  options: IngestionWorkerRuntimeOptions,
): FootballApiClient => {
  if (options.client) {
    return options.client;
  }

  const liveConfig = resolveApiFootballConfig(runtimeConfig, options.env ?? process.env);
  if (liveConfig) {
    return new ApiFootballHttpClient({
      apiKey: liveConfig.apiKey,
      baseUrl: liveConfig.baseUrl,
      host: liveConfig.host,
      ...(options.apiFootballFetch ? { fetchImpl: options.apiFootballFetch } : {}),
      ...(liveConfig.timeoutMs !== undefined ? { timeoutMs: liveConfig.timeoutMs } : {}),
    });
  }

  return new FakeFootballApiClient(
    options.fixtures ?? sampleFixtures(),
    options.odds ?? sampleOdds(),
  );
};

const createFacade = (
  client: FootballApiClient,
  runtimeConfig: RuntimeConfig,
  now: () => Date,
  runId: string,
): FootballApiFacade =>
  new FootballApiFacade(client, {
    now,
    providerCode: "api-football",
    runIdFactory: () => runId,
    sourceName: toSourceName(runtimeConfig),
  });

export const createIngestionWorkerRuntime = (
  options: IngestionWorkerRuntimeOptions = {},
): IngestionWorkerRuntime => {
  const config = loadIngestionWorkerRuntimeConfig(options.env);
  const now = options.now ?? (() => new Date());
  const client = createClient(config, options);
  const persistence = createPersistenceContext(config, options);
  const fallbackFixtures =
    options.fixtures ??
    (client instanceof FakeFootballApiClient ? sampleFixtures() : []);
  const fallbackFixtureIds = fallbackFixtures.map(
    (fixture) => fixture.providerFixtureId,
  );
  const pipeline =
    options.pipeline ??
    new CanonicalPipeline({
      now,
    });
  const queue = options.queue ?? new SimpleInMemoryQueue();

  const executeAndPersist = async (
    envelope: TaskEnvelope<Record<string, unknown>>,
    startedAt: string,
  ): Promise<TaskExecutionResult<IngestionWorkerTaskOutput>> => {
    const execution = await router.dispatch(envelope) as TaskExecutionResult<IngestionWorkerTaskOutput>;
    await persistTaskExecution(persistence.unitOfWork, config, envelope, execution, startedAt);
    return execution;
  };

  const router = createWorkflowRouter([
    {
      intent: "ingest-fixtures",
      async handle(envelope: TaskEnvelope<Record<string, unknown>>) {
        const facade = createFacade(client, config, now, `${workspaceInfo.workspaceName}:${envelope.id}`);
        const result = await ingestFixturesWindow(facade, toFixturesPayload(envelope.payload));
        const canonical = pipeline.ingestFixturesBatch(result.batch);
        await persistFixtures(persistence.prismaClient, persistence.unitOfWork, result.batch);
        return toTaskOutput(
          "ingest-fixtures",
          result.jobName,
          result.observedRecords,
          result.batch,
          canonical,
        );
      },
    },
    {
      intent: "ingest-odds",
      async handle(envelope: TaskEnvelope<Record<string, unknown>>) {
        const facade = createFacade(client, config, now, `${workspaceInfo.workspaceName}:${envelope.id}`);
        const result = await ingestOddsWindow(
          facade,
          toOddsPayload(envelope.payload, fallbackFixtureIds),
        );
        const canonical = pipeline.ingestOddsBatch(result.batch);
        await persistOddsSnapshots(persistence.prismaClient, result.batch);
        return toTaskOutput(
          "ingest-odds",
          result.jobName,
          result.observedRecords,
          result.batch,
          canonical,
        );
      },
    },
  ]);

  return {
    close: persistence.close,
    config,
    async dispatch(envelope: TaskEnvelope) {
      return executeAndPersist(envelope as TaskEnvelope<Record<string, unknown>>, now().toISOString());
    },
    async drainQueue(nowDate: Date = now()) {
      const drained: IngestionWorkerDrainItem[] = [];

      while (true) {
        const reservation = queue.dequeue(nowDate);
        if (!reservation) {
          break;
        }

        const execution = await executeAndPersist(
          reservation.envelope as TaskEnvelope<Record<string, unknown>>,
          nowDate.toISOString(),
        );
        queue.complete(reservation.envelope.id, execution);
        drained.push({
          envelope: reservation.envelope,
          execution,
        });
      }

      return drained;
    },
    persistenceMode: persistence.mode,
    pipeline,
    queue,
    router,
  };
};

export const createIngestionWorkerRouter = (
  options: IngestionWorkerRuntimeOptions = {},
): WorkflowRouter => createIngestionWorkerRuntime(options).router;

const buildDemoTaskEnvelopes = (
  scheduledAt: Date,
  fixtures: readonly RawFixtureRecord[],
): readonly TaskEnvelope[] => {
  const scheduledFor = scheduledAt.toISOString();

  return [
    createTaskEnvelope({
      createdAt: scheduledFor,
      intent: "ingest-fixtures",
      metadata: {
        labels: ["demo", "fixtures"],
        source: "ingestion-worker/demo",
      },
      payload: {
        league: "PL",
        window: {
          end: "2026-04-16T00:00:00.000Z",
          granularity: "daily",
          start: "2026-04-15T00:00:00.000Z",
        },
      },
      priority: 80,
      scheduledFor,
      taskKind: "fixture-ingestion",
      traceId: `demo:fixtures:${scheduledFor}`,
      workflowId: "ingestion-worker-demo-fixtures",
    }),
    createTaskEnvelope({
      createdAt: scheduledFor,
      intent: "ingest-odds",
      metadata: {
        labels: ["demo", "odds"],
        source: "ingestion-worker/demo",
      },
      payload: {
        fixtureIds: fixtures.map((fixture) => fixture.providerFixtureId),
        marketKeys: ["h2h"],
        window: {
          end: "2026-04-15T13:00:00.000Z",
          granularity: "intraday",
          start: "2026-04-15T12:00:00.000Z",
        },
      },
      priority: 40,
      scheduledFor,
      taskKind: "odds-ingestion",
      traceId: `demo:odds:${scheduledFor}`,
      workflowId: "ingestion-worker-demo-odds",
    }),
  ];
};

const inferLiveSeason = (nowDate: Date): number =>
  nowDate.getUTCMonth() >= 6 ? nowDate.getUTCFullYear() : nowDate.getUTCFullYear() - 1;

const toDefaultFixturesWindow = (nowDate: Date): SourceCoverageWindow => ({
  end: new Date(nowDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  granularity: "daily",
  start: nowDate.toISOString(),
});

const toDefaultOddsWindow = (nowDate: Date): SourceCoverageWindow => ({
  end: new Date(nowDate.getTime() + 60 * 60 * 1000).toISOString(),
  granularity: "intraday",
  start: new Date(nowDate.getTime() - 15 * 60 * 1000).toISOString(),
});

const buildLiveRuntimeEnv = (
  env: Readonly<Record<string, string | undefined>> = process.env,
  provider: LiveIngestionProviderOverrides | undefined = undefined,
): Readonly<Record<string, string | undefined>> => ({
  ...env,
  ...(provider?.source ? { GANA_PROVIDER_SOURCE: provider.source } : {}),
  ...(provider?.baseUrl ? { GANA_PROVIDER_BASE_URL: provider.baseUrl } : {}),
  ...(provider?.host ? { GANA_API_FOOTBALL_HOST: provider.host } : {}),
  ...(provider?.timeoutMs !== undefined ? { GANA_API_FOOTBALL_TIMEOUT_MS: String(provider.timeoutMs) } : {}),
});

const buildLiveFixturesEnvelope = (
  nowDate: Date,
  options: RunLiveIngestionOptions,
): {
  readonly envelope: TaskEnvelope<Record<string, unknown>>;
  readonly request: NonNullable<IngestionExecutionManifest["request"]>;
} => {
  const nowIso = nowDate.toISOString();
  const inferredSeason = options.season === undefined;
  const request = {
    league: options.league ?? "39",
    quirksApplied: inferredSeason ? ["api-football-season-inferred"] : [],
    season: options.season ?? inferLiveSeason(nowDate),
    window: options.fixturesWindow ?? toDefaultFixturesWindow(nowDate),
  } as const;

  return {
    envelope: createTaskEnvelope({
      createdAt: nowIso,
      intent: "ingest-fixtures",
      metadata: {
        labels: ["official", "live", "fixtures"],
        source: "ingestion-worker/live-runner",
      },
      payload: {
        league: request.league,
        quirksApplied: request.quirksApplied,
        season: request.season,
        window: request.window,
      },
      priority: 80,
      scheduledFor: nowIso,
      taskKind: "fixture-ingestion",
      traceId: `live:fixtures:${nowIso}`,
      workflowId: "ingestion-worker-live-fixtures",
    }),
    request,
  };
};

const listProviderFixtureIdsForUpcomingScheduledFixtures = async (
  prismaClient: PrismaClient,
  nowDate: Date,
): Promise<readonly string[]> => {
  const fixtures = await prismaClient.fixture.findMany({
    where: {
      status: "scheduled",
      scheduledAt: {
        gte: new Date(nowDate.getTime() - 2 * 60 * 60 * 1000),
        lte: new Date(nowDate.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
    take: 200,
  });

  return fixtures
    .map((fixture) => fixture.id.match(/^fixture:[^:]+:(.+)$/)?.[1] ?? null)
    .filter((fixtureId): fixtureId is string => fixtureId !== null);
};

const buildLiveOddsEnvelope = (
  nowDate: Date,
  fixtureIds: readonly string[],
  options: RunLiveIngestionOptions,
): {
  readonly envelope: TaskEnvelope<Record<string, unknown>>;
  readonly request: NonNullable<IngestionExecutionManifest["request"]>;
} => {
  const nowIso = nowDate.toISOString();
  const request = {
    fixtureIds,
    marketKeys: options.marketKeys ?? ["h2h"],
    quirksApplied: [
      ...(options.oddsFixtureIds === undefined ? ["odds-fixture-ids-loaded-from-db"] : []),
      ...(options.marketKeys === undefined ? ["default-market-keys-h2h"] : []),
      ...(options.oddsWindow === undefined ? ["default-odds-window-intraday"] : []),
    ],
    window: options.oddsWindow ?? toDefaultOddsWindow(nowDate),
  } as const;

  return {
    envelope: createTaskEnvelope({
      createdAt: nowIso,
      intent: "ingest-odds",
      metadata: {
        labels: ["official", "live", "odds"],
        source: "ingestion-worker/live-runner",
      },
      payload: {
        fixtureIds: request.fixtureIds,
        marketKeys: request.marketKeys,
        quirksApplied: request.quirksApplied,
        window: request.window,
      },
      priority: 90,
      scheduledFor: nowIso,
      taskKind: "odds-ingestion",
      traceId: `live:odds:${nowIso}`,
      workflowId: "ingestion-worker-live-odds",
    }),
    request,
  };
};

export const runLiveIngestion = async (
  options: RunLiveIngestionOptions = {},
): Promise<LiveIngestionRunSummary> => {
  const mode = options.mode ?? "both";
  const nowDate = options.now ? options.now() : new Date();
  const runtimeEnv = buildLiveRuntimeEnv(options.env ?? process.env, options.provider);
  const runtime = createIngestionWorkerRuntime({
    ...options,
    env: runtimeEnv,
  });
  const results: LiveIngestionRunResult[] = [];

  try {
    if (mode === "fixtures" || mode === "both") {
      const { envelope, request } = buildLiveFixturesEnvelope(nowDate, options);
      const execution = await runtime.dispatch(envelope);
      results.push({
        ...(execution.error ? { error: execution.error } : {}),
        manifest: createExecutionManifest(
          envelope,
          execution,
          runtime.config,
          nowDate.toISOString(),
          "live-runner",
          request,
        ),
        mode: "fixtures",
        ...(execution.output ? { output: execution.output } : {}),
        status: execution.status,
      });
    }

    if (mode === "odds" || mode === "both") {
      const fixtureIds = options.oddsFixtureIds ??
        (options.prismaClient ? await listProviderFixtureIdsForUpcomingScheduledFixtures(options.prismaClient, nowDate) : []);

      if (fixtureIds.length === 0) {
        const { envelope, request } = buildLiveOddsEnvelope(nowDate, [], options);
        results.push({
          manifest: createExecutionManifest(
            envelope,
            { finishedAt: nowDate.toISOString(), status: "cancelled" },
            runtime.config,
            nowDate.toISOString(),
            "live-runner",
            request,
          ),
          mode: "odds",
          reason: "No scheduled fixtures found for live odds window",
          status: "skipped",
        });
      } else {
        const { envelope, request } = buildLiveOddsEnvelope(nowDate, fixtureIds, options);
        const execution = await runtime.dispatch(envelope);
        results.push({
          ...(execution.error ? { error: execution.error } : {}),
          fixtureCount: fixtureIds.length,
          manifest: createExecutionManifest(
            envelope,
            execution,
            runtime.config,
            nowDate.toISOString(),
            "live-runner",
            request,
          ),
          mode: "odds",
          ...(execution.output ? { output: execution.output } : {}),
          status: execution.status,
        });
      }
    }

    return {
      mode,
      ranAt: nowDate.toISOString(),
      results,
      runtime: toRuntimeSummary(runtime.config, runtime.persistenceMode),
    };
  } finally {
    await runtime.close();
  }
};

export const runDemoIngestionWorker = async (
  nowDate: Date = new Date("2026-04-15T12:00:00.000Z"),
  options: IngestionWorkerRuntimeOptions = {},
): Promise<DemoIngestionWorkerSummary> => {
  const fixtures = options.fixtures ?? sampleFixtures();
  const runtime = createIngestionWorkerRuntime({
    ...options,
    fixtures,
  });

  for (const envelope of buildDemoTaskEnvelopes(nowDate, fixtures)) {
    runtime.queue.enqueue(envelope);
  }

  const queuedBeforeRun = runtime.queue.stats().queued;
  const drained = await runtime.drainQueue(nowDate);
  const snapshots = runtime.pipeline.repository.listSnapshots();
  const finalSnapshot = snapshots.at(-1);

  try {
    return {
      completedCount: runtime.queue.stats().completed,
      queuedBeforeRun,
      registeredIntents: [...runtime.router.intents()].sort() as readonly IngestionWorkerIntent[],
      ...(finalSnapshot?.snapshotId ? { finalSnapshotId: finalSnapshot.snapshotId } : {}),
      results: drained.map(({ envelope, execution }) => {
        const output = execution.output;

        return {
          intent: envelope.intent as IngestionWorkerIntent,
          observedRecords: output?.observedRecords ?? 0,
          status: execution.status,
          taskId: envelope.id,
          warnings: output?.warnings ?? [],
          ...(output?.batchId ? { batchId: output.batchId } : {}),
          ...(output?.canonicalMarkets !== undefined
            ? { canonicalMarkets: output.canonicalMarkets }
            : {}),
          ...(output?.canonicalMatches !== undefined
            ? { canonicalMatches: output.canonicalMatches }
            : {}),
          ...(output?.checksum ? { checksum: output.checksum } : {}),
          ...(output?.snapshotId ? { snapshotId: output.snapshotId } : {}),
        };
      }),
      runtime: toRuntimeSummary(runtime.config, runtime.persistenceMode),
      snapshotCount: snapshots.length,
      triggeredAt: nowDate.toISOString(),
      workspace: describeWorkspace(),
    };
  } finally {
    await runtime.close();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await runDemoIngestionWorker();
  console.log(JSON.stringify(summary, null, 2));
}
