import { createHash } from "node:crypto";

import {
  SimpleCronScheduler,
  SimpleInMemoryQueue,
  buildExampleCronSpecs,
  createWorkflowRouter,
  describeWorkspace as describeOrchestrationSdk,
  type CronWorkflowSpec,
  type TaskEnvelope,
  type TaskExecutionResult,
  type WorkflowIntent,
  workspaceInfo as orchestrationWorkspaceInfo,
} from "../../../packages/orchestration-sdk/src/index.js";
import {
  loadRuntimeConfig,
  type RuntimeConfig,
} from "../../../packages/config-runtime/src/index.js";
import {
  FakeFootballApiClient,
  FootballApiFacade,
  ingestFixturesWindow,
  ingestOddsWindow,
  sampleFixtures,
  sampleOdds,
  type FetchFixturesWindowInput,
  type FetchOddsWindowInput,
} from "../../../packages/source-connectors/src/index.js";

export const workspaceInfo = {
  packageName: "@gana-v8/hermes-control-plane",
  workspaceName: "hermes-control-plane",
  category: "app",
  description: "Coordinates workflows, tasks, policies, and approvals for gana-v8.",
  dependencies: [
    { name: "@gana-v8/audit-lineage", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/orchestration-sdk", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/source-connectors", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category}) -> ${describeOrchestrationSdk()}`;
}

export interface DemoRunRuntime {
  readonly appEnv: RuntimeConfig["app"]["env"];
  readonly profile: RuntimeConfig["app"]["profile"];
  readonly providerSource: RuntimeConfig["provider"]["source"];
  readonly providerBaseUrl: string;
  readonly logLevel: RuntimeConfig["logging"]["level"];
  readonly dryRun: boolean;
  readonly demoMode: boolean;
}

export interface DemoRunSummary {
  readonly triggeredAt: string;
  readonly workspace: string;
  readonly runtime: DemoRunRuntime;
  readonly registeredIntents: readonly WorkflowIntent[];
  readonly queuedBeforeRun: number;
  readonly completedCount: number;
  readonly cronJobs: readonly Pick<CronWorkflowSpec, "id" | "cron" | "intent" | "description">[];
  readonly results: readonly DemoRunResult[];
}

export interface DemoRunResult {
  readonly taskId: string;
  readonly intent: WorkflowIntent;
  readonly status: TaskExecutionResult["status"];
  readonly observedRecords: number;
  readonly batchId?: string;
  readonly checksum?: string;
  readonly warnings: readonly string[];
}

export interface DemoRunOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const toProviderSourceName = (runtimeConfig: RuntimeConfig): string =>
  `${runtimeConfig.provider.source}:${runtimeConfig.provider.baseUrl}`;

const createDemoRunRuntime = (runtimeConfig: RuntimeConfig): DemoRunRuntime => ({
  appEnv: runtimeConfig.app.env,
  profile: runtimeConfig.app.profile,
  providerSource: runtimeConfig.provider.source,
  providerBaseUrl: runtimeConfig.provider.baseUrl,
  logLevel: runtimeConfig.logging.level,
  dryRun: runtimeConfig.flags.dryRun,
  demoMode: runtimeConfig.flags.demoMode,
});

export const loadHermesRuntimeConfig = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeConfig =>
  loadRuntimeConfig({
    appName: workspaceInfo.workspaceName,
    env,
  });

const createFixtureFacade = (runtimeConfig: RuntimeConfig) =>
  new FootballApiFacade(new FakeFootballApiClient(sampleFixtures(), sampleOdds()), {
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    providerCode: "api-football",
    runIdFactory: () => "demo-run-fixtures",
    sourceName: toProviderSourceName(runtimeConfig),
  });

const createOddsFacade = (runtimeConfig: RuntimeConfig) =>
  new FootballApiFacade(new FakeFootballApiClient(sampleFixtures(), sampleOdds()), {
    now: () => new Date("2026-04-15T12:15:00.000Z"),
    providerCode: "api-football",
    runIdFactory: () => "demo-run-odds",
    sourceName: toProviderSourceName(runtimeConfig),
  });

const stableId = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 12);

export const createHermesJobRouter = (
  runtimeConfig: RuntimeConfig = loadHermesRuntimeConfig(),
) =>
  createWorkflowRouter([
    {
      intent: "ingest-fixtures",
      async handle(envelope: TaskEnvelope<Record<string, unknown>>) {
        const payload = envelope.payload as unknown as FetchFixturesWindowInput & { league?: string };
        const result = await ingestFixturesWindow(createFixtureFacade(runtimeConfig), {
          ...(payload.league ? { league: payload.league } : {}),
          window: payload.window,
        });

        return {
          batchId: result.batch.batchId,
          checksum: result.batch.checksum,
          observedRecords: result.observedRecords,
          rawRefs: result.batch.rawObjectRefs,
          warnings: result.batch.warnings,
        };
      },
    },
    {
      intent: "ingest-odds",
      async handle(envelope: TaskEnvelope<Record<string, unknown>>) {
        const payload = envelope.payload as unknown as FetchOddsWindowInput;
        const fixtureIds = sampleFixtures().map((fixture) => fixture.providerFixtureId);
        const result = await ingestOddsWindow(createOddsFacade(runtimeConfig), {
          fixtureIds: payload.fixtureIds ?? fixtureIds,
          ...(payload.marketKeys ? { marketKeys: payload.marketKeys } : {}),
          window: payload.window,
        });

        return {
          batchId: result.batch.batchId,
          checksum: result.batch.checksum,
          observedRecords: result.observedRecords,
          rawRefs: result.batch.rawObjectRefs,
          warnings: result.batch.warnings,
        };
      },
    },
  ]);

export const buildHermesCronSpecs = (): readonly CronWorkflowSpec[] =>
  buildExampleCronSpecs().map((spec) => ({
    ...spec,
    description: `${spec.description} [hermes-native]`,
    id: `hermes:${spec.id}:${stableId(spec.intent)}`,
    labels: [...(spec.labels ?? []), "hermes-native"],
    source: `${spec.source}/${orchestrationWorkspaceInfo.workspaceName}`,
  }));

export const runDemoControlPlane = async (
  now: Date = new Date("2026-04-15T12:00:00.000Z"),
  options: DemoRunOptions = {},
): Promise<DemoRunSummary> => {
  const runtimeConfig = loadHermesRuntimeConfig(options.env);
  const queue = new SimpleInMemoryQueue();
  const specs = buildHermesCronSpecs();
  const scheduler = new SimpleCronScheduler(specs, queue);
  const router = createHermesJobRouter(runtimeConfig);

  scheduler.tick(now);
  const queuedBeforeRun = queue.stats().queued;
  const results: DemoRunResult[] = [];

  while (true) {
    const reservation = queue.dequeue(now);
    if (!reservation) {
      break;
    }

    const execution = await router.dispatch(reservation.envelope);
    queue.complete(reservation.envelope.id, execution);

    const output = execution.output as
      | {
          readonly batchId?: string;
          readonly checksum?: string;
          readonly observedRecords?: number;
          readonly warnings?: readonly string[];
        }
      | undefined;

    results.push({
      intent: reservation.envelope.intent,
      observedRecords: output?.observedRecords ?? 0,
      status: execution.status,
      taskId: reservation.envelope.id,
      warnings: output?.warnings ?? [],
      ...(output?.batchId ? { batchId: output.batchId } : {}),
      ...(output?.checksum ? { checksum: output.checksum } : {}),
    });
  }

  return {
    completedCount: queue.stats().completed,
    cronJobs: specs.map(({ cron, description, id, intent }) => ({ cron, description, id, intent })),
    queuedBeforeRun,
    registeredIntents: router.intents(),
    results,
    runtime: createDemoRunRuntime(runtimeConfig),
    triggeredAt: now.toISOString(),
    workspace: describeWorkspace(),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await runDemoControlPlane();
  console.log(JSON.stringify(summary, null, 2));
}
