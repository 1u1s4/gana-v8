import assert from "node:assert/strict";
import test from "node:test";

import { FootballApiFacade } from "../src/clients/football-api.js";
import { ingestAvailabilityWindow } from "../src/jobs/ingest-availability-window.js";
import { ingestFixturesWindow } from "../src/jobs/ingest-fixtures-window.js";
import { ingestLineupsWindow } from "../src/jobs/ingest-lineups-window.js";
import { ingestOddsWindow } from "../src/jobs/ingest-odds-window.js";
import { ingestStatisticsWindow } from "../src/jobs/ingest-statistics-window.js";
import {
  FakeFootballApiClient,
  sampleAvailability,
  sampleFixtures,
  sampleLineups,
  sampleOdds,
  sampleStatistics,
} from "../src/testing/fakes.js";

const createFacade = () =>
  new FootballApiFacade(
    new FakeFootballApiClient(
      sampleFixtures(),
      sampleOdds(),
      sampleAvailability(),
      sampleLineups(),
      sampleStatistics(),
    ),
    {
      now: () => new Date("2026-04-14T21:00:00.000Z"),
      providerCode: "api-football",
      runIdFactory: () => "run-001",
      sourceName: "api-football",
    },
  );

test("ingest.fixtures.window builds a raw batch with lineage and refs", async () => {
  const result = await ingestFixturesWindow(createFacade(), {
    league: "PL",
    window: {
      end: "2026-04-16T00:00:00.000Z",
      granularity: "daily",
      start: "2026-04-15T00:00:00.000Z",
    },
  });

  assert.equal(result.jobName, "ingest.fixtures.window");
  assert.equal(result.batch.lineage.runId, "run-001");
  assert.equal(result.batch.records.length, 1);
  assert.equal(result.batch.rawObjectRefs.length, 1);
  assert.equal(result.batch.extractionStatus, "success");
});

test("ingest.odds.window reuses the facade for intraday odds polling", async () => {
  const result = await ingestOddsWindow(createFacade(), {
    fixtureIds: ["fix-100"],
    marketKeys: ["h2h"],
    window: {
      end: "2026-04-14T22:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-14T21:00:00.000Z",
    },
  });

  assert.equal(result.jobName, "ingest.odds.window");
  assert.equal(result.batch.records[0]?.marketKey, "h2h");
  assert.equal(result.batch.extractionStatus, "success");
});

test("ingest.availability.window materializes match-level player availability", async () => {
  const result = await ingestAvailabilityWindow(createFacade(), {
    fixtureIds: ["fix-100"],
    window: {
      end: "2026-04-15T20:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });

  assert.equal(result.jobName, "ingest.availability.window");
  assert.equal(result.batch.records.length, 2);
  assert.equal(result.batch.records[0]?.recordType, "availability");
  assert.equal(result.batch.extractionStatus, "success");
});

test("ingest.lineups.window materializes team lineup snapshots", async () => {
  const result = await ingestLineupsWindow(createFacade(), {
    fixtureIds: ["fix-100"],
    window: {
      end: "2026-04-15T19:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });

  assert.equal(result.jobName, "ingest.lineups.window");
  assert.equal(result.batch.records.length, 2);
  assert.equal(result.batch.records[0]?.players.length, 3);
  assert.equal(result.batch.extractionStatus, "success");
});

test("ingest.statistics.window materializes fixture corners statistics", async () => {
  const result = await ingestStatisticsWindow(createFacade(), {
    fixtureIds: ["fix-100"],
    window: {
      end: "2026-04-15T21:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T19:00:00.000Z",
    },
  });

  assert.equal(result.jobName, "ingest.statistics.window");
  assert.equal(result.batch.lineage.endpointFamily, "statistics");
  assert.equal(result.batch.records.length, 3);
  assert.deepEqual(
    result.batch.records.map((record) => [record.scope, record.statKey, record.valueNumeric]),
    [
      ["home", "corners", 6],
      ["away", "corners", 3],
      ["match", "corners", 9],
    ],
  );
  assert.equal(result.batch.extractionStatus, "success");
});
