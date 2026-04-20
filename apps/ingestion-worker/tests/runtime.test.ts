import assert from "node:assert/strict";
import test from "node:test";

import { createTaskRun } from "@gana-v8/domain-core";
import {
  createTaskEnvelope,
  SimpleInMemoryQueue,
} from "@gana-v8/orchestration-sdk";
import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  createIngestionWorkerRouter,
  createIngestionWorkerRuntime,
  describeWorkspace,
  loadIngestionWorkerRuntimeConfig,
  runDemoIngestionWorker,
  runLiveIngestion,
} from "../src/index.js";

const TEST_RUNTIME_ENV = {
  NODE_ENV: "test",
} as const;

test("runtime config resolves ingestion-worker defaults", () => {
  const config = loadIngestionWorkerRuntimeConfig({});

  assert.equal(config.app.name, "ingestion-worker");
  assert.equal(config.app.env, "development");
  assert.equal(config.app.profile, "local-dev");
  assert.equal(config.provider.source, "mock");
  assert.equal(config.provider.baseUrl, "mock://api-football");
});

test("router registers the ingestion intents", () => {
  const router = createIngestionWorkerRouter({ env: TEST_RUNTIME_ENV });

  assert.deepEqual([...router.intents()].sort(), ["ingest-fixtures", "ingest-odds"]);
  assert.match(describeWorkspace(), /ingestion-worker/);
});

test("runtime switches to API-Football client when live-readonly credentials are present", async () => {
  const requests: string[] = [];
  const runtime = createIngestionWorkerRuntime({
    apiFootballFetch: async (url) => {
      requests.push(String(url));

      return new Response(
        JSON.stringify({
          response: [
            {
              fixture: {
                date: "2026-04-15T19:00:00.000Z",
                id: 777,
                status: {
                  short: "NS",
                },
              },
              league: {
                country: "England",
                id: 39,
                name: "Premier League",
                season: 2026,
              },
              teams: {
                away: {
                  id: 11,
                  name: "Arsenal",
                },
                home: {
                  id: 10,
                  name: "Chelsea",
                },
              },
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    env: {
      ...TEST_RUNTIME_ENV,
      GANA_API_FOOTBALL_KEY: "live-key",
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_PROVIDER_BASE_URL: "https://example.test/v3",
      GANA_PROVIDER_SOURCE: "live-readonly",
    },
    now: () => new Date("2026-04-15T12:00:00.000Z"),
  });

  const result = await runtime.dispatch(
    createTaskEnvelope({
      intent: "ingest-fixtures",
      metadata: {
        labels: ["test", "fixtures", "live"],
        source: "tests/runtime",
      },
      payload: {
        league: "39",
        season: 2026,
        window: {
          end: "2026-04-16T00:00:00.000Z",
          granularity: "daily",
          start: "2026-04-15T00:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "fixture-ingestion",
      traceId: "trace-fixtures-live",
      workflowId: "wf-fixtures-live",
    }),
  );

  assert.equal(runtime.config.provider.source, "live-readonly");
  assert.equal(result.status, "succeeded");
  assert.equal(result.output?.observedRecords, 1);
  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /https:\/\/example\.test\/v3\/fixtures\?/);
});

test("runtime fails fast when live-readonly is requested without API-Football credentials", () => {
  assert.throws(
    () =>
      createIngestionWorkerRuntime({
        env: {
          ...TEST_RUNTIME_ENV,
          GANA_PROVIDER_SOURCE: "live-readonly",
        },
      }),
    /API-Football live mode requires GANA_API_FOOTBALL_KEY/,
  );
});

test("runLiveIngestion returns execution manifests for the official live runner", async () => {
  const requests: string[] = [];
  const summary = await runLiveIngestion({
    env: {
      ...TEST_RUNTIME_ENV,
      GANA_API_FOOTBALL_KEY: "live-key",
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_PROVIDER_BASE_URL: "https://example.test/v3",
      GANA_PROVIDER_SOURCE: "live-readonly",
    },
    apiFootballFetch: async (url: string | URL | Request) => {
      requests.push(String(url));
      return new Response(
        JSON.stringify({
          response: [
            {
              fixture: {
                date: "2026-04-15T19:00:00.000Z",
                id: 777,
                status: { short: "NS" },
              },
              league: {
                country: "England",
                id: 39,
                name: "Premier League",
                season: 2026,
              },
              teams: {
                away: { id: 11, name: "Arsenal" },
                home: { id: 10, name: "Chelsea" },
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    },
    mode: "fixtures",
    now: () => new Date("2026-04-15T12:00:00.000Z"),
  });

  assert.equal(summary.mode, "fixtures");
  assert.equal(summary.results.length, 1);
  const [firstResult] = summary.results;
  assert.ok(firstResult);
  assert.equal(firstResult.status, "succeeded");
  assert.equal(firstResult.manifest.intent, "ingest-fixtures");
  assert.equal(firstResult.manifest.provider.providerSource, "live-readonly");
  assert.equal(firstResult.manifest.provider.endpointFamily, "fixtures");
  assert.equal(firstResult.manifest.provider.requestKind, "live-runner");
  assert.ok(firstResult.manifest.batch);
  assert.equal(firstResult.manifest.batch.batchId.length > 0, true);
  assert.equal(requests.length, 1);
});

test("runLiveIngestion preserves structured provider errors in failed manifests", async () => {
  const summary = await runLiveIngestion({
    env: {
      ...TEST_RUNTIME_ENV,
      GANA_API_FOOTBALL_KEY: "live-key",
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_PROVIDER_BASE_URL: "https://example.test/v3",
      GANA_PROVIDER_SOURCE: "live-readonly",
    },
    apiFootballFetch: async () =>
      new Response(
        JSON.stringify({
          errors: {
            token: "invalid",
          },
          response: [],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    mode: "fixtures",
    now: () => new Date("2026-04-15T12:00:00.000Z"),
  });

  const [firstResult] = summary.results;
  assert.ok(firstResult);
  assert.equal(firstResult.status, "failed");
  assert.ok(firstResult.manifest.providerError);
  assert.equal(firstResult.manifest.providerError.category, "provider-envelope");
  assert.equal(firstResult.manifest.providerError.endpoint, "fixtures");
  assert.equal(firstResult.manifest.providerError.provider, "api-football");
  assert.equal(firstResult.manifest.providerError.retriable, false);
  assert.deepEqual(firstResult.manifest.providerError.providerErrors, { token: "invalid" });
});

test("runLiveIngestion supports declarative provider and window overrides in manifests", async () => {
  const requests: string[] = [];
  const summary = await runLiveIngestion({
    env: {
      ...TEST_RUNTIME_ENV,
      GANA_API_FOOTBALL_KEY: "live-key",
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
    },
    apiFootballFetch: async (url: string | URL | Request) => {
      requests.push(String(url));
      return new Response(
        JSON.stringify({
          response: [
            {
              fixture: {
                date: "2026-04-20T19:00:00.000Z",
                id: 778,
                status: { short: "NS" },
              },
              league: {
                country: "England",
                id: 39,
                name: "Premier League",
                season: 2026,
              },
              teams: {
                away: { id: 12, name: "Liverpool" },
                home: { id: 10, name: "Chelsea" },
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    },
    fixturesWindow: {
      end: "2026-04-21T00:00:00.000Z",
      granularity: "daily",
      start: "2026-04-20T00:00:00.000Z",
    },
    league: "39",
    mode: "fixtures",
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    provider: {
      baseUrl: "https://provider.example/v3",
      host: "provider.example",
      source: "live-readonly",
      timeoutMs: 3210,
    },
  });

  const [firstResult] = summary.results;
  assert.ok(firstResult);
  assert.equal(firstResult.status, "succeeded");
  assert.equal(firstResult.manifest.provider.providerBaseUrl, "https://provider.example/v3");
  assert.equal(firstResult.manifest.provider.providerSource, "live-readonly");
  assert.ok(firstResult.manifest.request);
  assert.deepEqual(firstResult.manifest.request.window, {
    end: "2026-04-21T00:00:00.000Z",
    granularity: "daily",
    start: "2026-04-20T00:00:00.000Z",
  });
  assert.equal(firstResult.manifest.request.league, "39");
  assert.equal(firstResult.manifest.request.season, 2025);
  assert.deepEqual(firstResult.manifest.request.quirksApplied, ["api-football-season-inferred"]);
  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /https:\/\/provider\.example\/v3\/fixtures\?/);
  assert.match(requests[0] ?? "", /season=2025/);
});

test("runLiveIngestion supports declarative odds fixture and market overrides in manifests", async () => {
  const requests: string[] = [];
  const summary = await runLiveIngestion({
    env: {
      ...TEST_RUNTIME_ENV,
      GANA_API_FOOTBALL_KEY: "live-key",
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
    },
    apiFootballFetch: async (url: string | URL | Request) => {
      requests.push(String(url));
      return new Response(
        JSON.stringify({
          response: [
            {
              bookmakers: [
                {
                  bets: [
                    {
                      id: 1,
                      name: "Match Winner",
                      values: [
                        { odd: "1.80", value: "Home" },
                        { odd: "3.50", value: "Draw" },
                        { odd: "4.10", value: "Away" },
                      ],
                    },
                  ],
                  id: 8,
                  name: "Bet365",
                },
              ],
              fixture: { id: 999 },
              league: {
                country: "England",
                id: 39,
                name: "Premier League",
                season: 2026,
              },
              teams: {
                away: { id: 11, name: "Arsenal" },
                home: { id: 10, name: "Chelsea" },
              },
              update: "2026-04-15T12:05:00.000Z",
            },
          ],
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    },
    marketKeys: ["h2h", "1"],
    mode: "odds",
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    oddsFixtureIds: ["999", "1000"],
    oddsWindow: {
      end: "2026-04-15T13:30:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T11:45:00.000Z",
    },
    provider: {
      source: "live-readonly",
    },
  });

  const [firstResult] = summary.results;
  assert.ok(firstResult);
  assert.equal(firstResult.status, "succeeded");
  assert.ok(firstResult.manifest.request);
  assert.deepEqual(firstResult.manifest.request.fixtureIds, ["999", "1000"]);
  assert.deepEqual(firstResult.manifest.request.marketKeys, ["h2h", "1"]);
  assert.deepEqual(firstResult.manifest.request.window, {
    end: "2026-04-15T13:30:00.000Z",
    granularity: "intraday",
    start: "2026-04-15T11:45:00.000Z",
  });
  assert.deepEqual(firstResult.manifest.request.quirksApplied, []);
  assert.equal(firstResult.fixtureCount, 2);
  assert.equal(requests.length, 2);
  assert.match(requests[0] ?? "", /fixture=999/);
  assert.match(requests[1] ?? "", /fixture=1000/);
});

test("runtime drains queued fixture and odds tasks into canonical snapshots", async () => {
  const queue = new SimpleInMemoryQueue();
  const runtime = createIngestionWorkerRuntime({
    env: TEST_RUNTIME_ENV,
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    queue,
  });

  queue.enqueue(
    createTaskEnvelope({
      intent: "ingest-fixtures",
      metadata: {
        labels: ["test", "fixtures"],
        source: "tests/runtime",
      },
      payload: {
        league: "PL",
        window: {
          end: "2026-04-16T00:00:00.000Z",
          granularity: "daily",
          start: "2026-04-15T00:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "fixture-ingestion",
      traceId: "trace-fixtures",
      workflowId: "wf-fixtures",
    }),
  );

  queue.enqueue(
    createTaskEnvelope({
      intent: "ingest-odds",
      metadata: {
        labels: ["test", "odds"],
        source: "tests/runtime",
      },
      payload: {
        marketKeys: ["h2h"],
        window: {
          end: "2026-04-15T13:00:00.000Z",
          granularity: "intraday",
          start: "2026-04-15T12:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "odds-ingestion",
      traceId: "trace-odds",
      workflowId: "wf-odds",
    }),
  );

  const drained = await runtime.drainQueue(new Date("2026-04-15T12:00:00.000Z"));
  const snapshots = runtime.pipeline.repository.listSnapshots();
  const matches = runtime.pipeline.repository.listMatches();
  const fixtureResult = drained.find((item) => item.envelope.intent === "ingest-fixtures");
  const oddsResult = drained.find((item) => item.envelope.intent === "ingest-odds");

  assert.equal(drained.length, 2);
  assert.equal(queue.stats().completed, 2);
  assert.equal(snapshots.length, 2);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.odds.length, 1);
  assert.equal(fixtureResult?.execution.status, "succeeded");
  assert.equal(fixtureResult?.execution.output?.insertedCompetitions, 1);
  assert.equal(fixtureResult?.execution.output?.insertedTeams, 2);
  assert.equal(fixtureResult?.execution.output?.canonicalMatches, 1);
  assert.equal(oddsResult?.execution.status, "succeeded");
  assert.equal(oddsResult?.execution.output?.upsertedMarkets, 1);
  assert.equal(oddsResult?.execution.output?.canonicalMarkets, 1);
});

test("runtime persists fixtures, tasks, task runs, and audit events when a unit of work is wired", async () => {
  const queue = new SimpleInMemoryQueue();
  const unitOfWork = createInMemoryUnitOfWork();
  const runtime = createIngestionWorkerRuntime({
    env: TEST_RUNTIME_ENV,
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    queue,
    unitOfWork,
  });

  queue.enqueue(
    createTaskEnvelope({
      createdAt: "2026-04-15T12:00:00.000Z",
      intent: "ingest-fixtures",
      metadata: {
        labels: ["test", "fixtures", "persisted"],
        source: "tests/runtime",
      },
      payload: {
        league: "PL",
        window: {
          end: "2026-04-16T00:00:00.000Z",
          granularity: "daily",
          start: "2026-04-15T00:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "fixture-ingestion",
      traceId: "trace-fixtures-persisted",
      workflowId: "wf-fixtures-persisted",
    }),
  );

  queue.enqueue(
    createTaskEnvelope({
      createdAt: "2026-04-15T12:00:00.000Z",
      intent: "ingest-odds",
      metadata: {
        labels: ["test", "odds", "persisted"],
        source: "tests/runtime",
      },
      payload: {
        marketKeys: ["h2h"],
        window: {
          end: "2026-04-15T13:00:00.000Z",
          granularity: "intraday",
          start: "2026-04-15T12:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "odds-ingestion",
      traceId: "trace-odds-persisted",
      workflowId: "wf-odds-persisted",
    }),
  );

  const drained = await runtime.drainQueue(new Date("2026-04-15T12:00:00.000Z"));
  const persistedFixtures = await unitOfWork.fixtures.list();
  const persistedTasks = await unitOfWork.tasks.list();
  const persistedTaskRuns = await unitOfWork.taskRuns.list();
  const persistedAuditEvents = await unitOfWork.auditEvents.list();

  assert.equal(runtime.persistenceMode, "mysql");
  assert.equal(drained.length, 2);
  assert.equal(persistedFixtures.length, 1);
  assert.equal(persistedTasks.length, 2);
  assert.equal(persistedTaskRuns.length, 2);
  assert.equal(persistedAuditEvents.length, 2);
  assert.equal(persistedFixtures[0]?.metadata.providerFixtureId, "fix-100");
  assert.equal(persistedTasks.every((task) => task.attempts.length === 1), true);
  assert.equal(persistedTaskRuns.every((taskRun) => taskRun.status === "succeeded"), true);
  assert.equal(
    persistedAuditEvents.some((event) => event.eventType === "ingest-fixtures.succeeded"),
    true,
  );
  assert.equal(
    persistedAuditEvents.some((event) => event.eventType === "ingest-odds.succeeded"),
    true,
  );
  const persistedFixturesAuditEvent = persistedAuditEvents.find((event) => event.eventType === "ingest-fixtures.succeeded");
  const persistedOddsAuditEvent = persistedAuditEvents.find((event) => event.eventType === "ingest-odds.succeeded");
  assert.equal((persistedFixturesAuditEvent?.payload as Record<string, any> | undefined)?.provider?.endpointFamily, "fixtures");
  assert.equal((persistedFixturesAuditEvent?.payload as Record<string, any> | undefined)?.request?.league, "PL");
  assert.equal((persistedOddsAuditEvent?.payload as Record<string, any> | undefined)?.provider?.endpointFamily, "odds");
  assert.deepEqual((persistedOddsAuditEvent?.payload as Record<string, any> | undefined)?.request?.marketKeys, ["h2h"]);

  await runtime.close();
});

test("runtime persists fixture scores when provider fixtures include them", async () => {
  const queue = new SimpleInMemoryQueue();
  const unitOfWork = createInMemoryUnitOfWork();
  const runtime = createIngestionWorkerRuntime({
    env: TEST_RUNTIME_ENV,
    fixtures: [
      {
        awayTeam: {
          name: "Arsenal",
          providerTeamId: "ars",
        },
        competition: {
          name: "Premier League",
          providerCompetitionId: "pl-2026",
        },
        homeTeam: {
          name: "Chelsea",
          providerTeamId: "che",
        },
        payload: {
          fixtureId: "fix-score-1",
        },
        providerCode: "api-football",
        providerFixtureId: "fix-score-1",
        recordType: "fixture",
        scheduledAt: "2026-04-15T19:00:00.000Z",
        score: {
          away: 1,
          home: 2,
        },
        status: "finished",
      },
    ],
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    queue,
    unitOfWork,
  });

  queue.enqueue(
    createTaskEnvelope({
      createdAt: "2026-04-15T12:00:00.000Z",
      intent: "ingest-fixtures",
      metadata: {
        labels: ["test", "fixtures", "score"],
        source: "tests/runtime",
      },
      payload: {
        league: "PL",
        window: {
          end: "2026-04-16T00:00:00.000Z",
          granularity: "daily",
          start: "2026-04-15T00:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "fixture-ingestion",
      traceId: "trace-fixtures-score",
      workflowId: "wf-fixtures-score",
    }),
  );

  await runtime.drainQueue(new Date("2026-04-15T12:00:00.000Z"));

  const persistedFixtures = await unitOfWork.fixtures.list();

  assert.equal(persistedFixtures.length, 1);
  assert.deepEqual(persistedFixtures[0]?.score, { home: 2, away: 1 });

  await runtime.close();
});

test("runtime persists raw batches and odds snapshots when a prisma client is wired", async () => {
  const queue = new SimpleInMemoryQueue();
  const unitOfWork = createInMemoryUnitOfWork();
  const rawBatchUpserts: unknown[] = [];
  const oddsSnapshotUpserts: unknown[] = [];
  const prismaClient = {
    rawIngestionBatch: {
      async upsert(input: unknown) {
        rawBatchUpserts.push(input);
        return input;
      },
    },
    oddsSnapshot: {
      async upsert(input: unknown) {
        oddsSnapshotUpserts.push(input);
        return input;
      },
    },
  };

  const runtime = createIngestionWorkerRuntime({
    env: TEST_RUNTIME_ENV,
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    prismaClient: prismaClient as never,
    queue,
    unitOfWork,
  });

  queue.enqueue(
    createTaskEnvelope({
      createdAt: "2026-04-15T12:00:00.000Z",
      intent: "ingest-fixtures",
      metadata: {
        labels: ["test", "fixtures", "raw-batch"],
        source: "tests/runtime",
      },
      payload: {
        league: "PL",
        window: {
          end: "2026-04-16T00:00:00.000Z",
          granularity: "daily",
          start: "2026-04-15T00:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "fixture-ingestion",
      traceId: "trace-fixtures-raw-batch",
      workflowId: "wf-fixtures-raw-batch",
    }),
  );

  queue.enqueue(
    createTaskEnvelope({
      createdAt: "2026-04-15T12:00:00.000Z",
      intent: "ingest-odds",
      metadata: {
        labels: ["test", "odds", "raw-batch"],
        source: "tests/runtime",
      },
      payload: {
        marketKeys: ["h2h"],
        window: {
          end: "2026-04-15T13:00:00.000Z",
          granularity: "intraday",
          start: "2026-04-15T12:00:00.000Z",
        },
      },
      scheduledFor: "2026-04-15T12:00:00.000Z",
      taskKind: "odds-ingestion",
      traceId: "trace-odds-raw-batch",
      workflowId: "wf-odds-raw-batch",
    }),
  );

  await runtime.drainQueue(new Date("2026-04-15T12:00:00.000Z"));

  assert.equal(rawBatchUpserts.length, 2);
  assert.equal(oddsSnapshotUpserts.length, 1);
  const oddsUpsert = oddsSnapshotUpserts[0] as {
    create: {
      selections: {
        create: unknown[];
      };
    };
  };
  assert.equal(oddsUpsert.create.selections.create.length, 3);

  await runtime.close();
});

test("runtime reuses an existing persisted attempt-1 task run instead of duplicating it", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const envelope = createTaskEnvelope({
    createdAt: "2026-04-15T12:00:00.000Z",
    intent: "ingest-fixtures",
    metadata: {
      labels: ["test", "fixtures", "existing-taskrun"],
      source: "tests/runtime",
    },
    payload: {
      league: "39",
      window: {
        end: "2026-04-16T00:00:00.000Z",
        granularity: "daily",
        start: "2026-04-15T00:00:00.000Z",
      },
    },
    scheduledFor: "2026-04-15T12:00:00.000Z",
    taskKind: "fixture-ingestion",
    traceId: "trace-existing-taskrun",
    workflowId: "wf-existing-taskrun",
  });
  const existingTaskRun = createTaskRun({
    id: `${envelope.id}:attempt:1`,
    taskId: envelope.id,
    attemptNumber: 1,
    status: "succeeded",
    startedAt: "2026-04-15T12:00:00.000Z",
    finishedAt: "2026-04-15T12:00:01.000Z",
    createdAt: "2026-04-15T12:00:00.000Z",
    updatedAt: "2026-04-15T12:00:01.000Z",
  });

  let taskRunSaveCalls = 0;
  unitOfWork.taskRuns.findByTaskId = async (taskId) => (taskId === envelope.id ? [existingTaskRun] : []);
  unitOfWork.taskRuns.save = async () => {
    taskRunSaveCalls += 1;
    throw new Error("taskRuns.save should not be called when attempt 1 already exists");
  };

  const runtime = createIngestionWorkerRuntime({
    env: TEST_RUNTIME_ENV,
    now: () => new Date("2026-04-15T12:00:00.000Z"),
    unitOfWork,
  });

  try {
    const execution = await runtime.dispatch(envelope);
    const auditEvents = await unitOfWork.auditEvents.list();

    assert.equal(execution.status, "succeeded");
    assert.equal(taskRunSaveCalls, 0);
    assert.equal((auditEvents[0]?.payload as Record<string, any> | undefined)?.taskRunId, existingTaskRun.id);
  } finally {
    await runtime.close();
  }
});

test("demo run materializes snapshots and honors runtime overrides", async () => {
  const summary = await runDemoIngestionWorker(new Date("2026-04-15T12:00:00.000Z"), {
    env: {
      ...TEST_RUNTIME_ENV,
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_LOG_LEVEL: "warn",
      GANA_PROVIDER_BASE_URL: "https://replay.gana.test/v1",
      GANA_RUNTIME_PROFILE: "ci-regression",
    },
    now: () => new Date("2026-04-15T12:00:00.000Z"),
  });

  assert.equal(summary.queuedBeforeRun, 2);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.snapshotCount, 2);
  assert.equal(summary.runtime.appEnv, "test");
  assert.equal(summary.runtime.profile, "ci-regression");
  assert.equal(summary.runtime.providerSource, "replay");
  assert.equal(summary.runtime.providerBaseUrl, "https://replay.gana.test/v1");
  assert.equal(summary.runtime.logLevel, "warn");
  assert.equal(summary.runtime.dryRun, false);
  assert.equal(summary.runtime.demoMode, false);
  assert.equal(summary.runtime.persistenceMode, "disabled");
  assert.equal(summary.results.every((result) => result.status === "succeeded"), true);
  assert.equal(
    summary.results.some(
      (result) =>
        result.intent === "ingest-fixtures" &&
        result.canonicalMatches === 1 &&
        result.observedRecords > 0,
    ),
    true,
  );
  assert.equal(
    summary.results.some(
      (result) =>
        result.intent === "ingest-odds" &&
        result.canonicalMarkets === 1 &&
        result.observedRecords > 0,
    ),
    true,
  );
});
