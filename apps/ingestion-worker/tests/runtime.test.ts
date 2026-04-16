import assert from "node:assert/strict";
import test from "node:test";

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
} from "../src/index.js";

test("runtime config resolves ingestion-worker defaults", () => {
  const config = loadIngestionWorkerRuntimeConfig({});

  assert.equal(config.app.name, "ingestion-worker");
  assert.equal(config.app.env, "development");
  assert.equal(config.app.profile, "local-dev");
  assert.equal(config.provider.source, "mock");
  assert.equal(config.provider.baseUrl, "mock://api-football");
});

test("router registers the ingestion intents", () => {
  const router = createIngestionWorkerRouter();

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
      GANA_API_FOOTBALL_KEY: "live-key",
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_PROVIDER_BASE_URL: "https://example.test/v3",
      GANA_PROVIDER_SOURCE: "live-readonly",
      NODE_ENV: "test",
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
          GANA_PROVIDER_SOURCE: "live-readonly",
          NODE_ENV: "test",
        },
      }),
    /API-Football live mode requires GANA_API_FOOTBALL_KEY/,
  );
});

test("runtime drains queued fixture and odds tasks into canonical snapshots", async () => {
  const queue = new SimpleInMemoryQueue();
  const runtime = createIngestionWorkerRuntime({
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

  await runtime.close();
});

test("runtime persists fixture scores when provider fixtures include them", async () => {
  const queue = new SimpleInMemoryQueue();
  const unitOfWork = createInMemoryUnitOfWork();
  const runtime = createIngestionWorkerRuntime({
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

test("demo run materializes snapshots and honors runtime overrides", async () => {
  const summary = await runDemoIngestionWorker(new Date("2026-04-15T12:00:00.000Z"), {
    env: {
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_LOG_LEVEL: "warn",
      GANA_PROVIDER_BASE_URL: "https://replay.gana.test/v1",
      GANA_RUNTIME_PROFILE: "ci-regression",
      NODE_ENV: "test",
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
