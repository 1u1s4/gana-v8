import assert from "node:assert/strict";
import test from "node:test";

import { FootballApiFacade } from "../src/clients/football-api.js";
import { ingestFixturesWindow } from "../src/jobs/ingest-fixtures-window.js";
import { ingestOddsWindow } from "../src/jobs/ingest-odds-window.js";
import { FakeFootballApiClient, sampleFixtures, sampleOdds } from "../src/testing/fakes.js";

const createFacade = () =>
  new FootballApiFacade(new FakeFootballApiClient(sampleFixtures(), sampleOdds()), {
    now: () => new Date("2026-04-14T21:00:00.000Z"),
    providerCode: "api-football",
    runIdFactory: () => "run-001",
    sourceName: "api-football",
  });

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
