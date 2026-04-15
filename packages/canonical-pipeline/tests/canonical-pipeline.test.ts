import assert from "node:assert/strict";
import test from "node:test";

import { FootballApiFacade, FakeFootballApiClient, sampleFixtures, sampleOdds } from "@gana-v8/source-connectors";

import { CanonicalPipeline } from "../src/canonicalize.js";
import { IngestionSmokeRunner } from "../src/smoke-runner.js";

const createFacade = () =>
  new FootballApiFacade(new FakeFootballApiClient(sampleFixtures(), sampleOdds()), {
    now: () => new Date("2026-04-14T21:00:00.000Z"),
    providerCode: "api-football",
    runIdFactory: () => "run-100",
    sourceName: "api-football",
  });

test("canonical pipeline materializes matches and odds snapshots idempotently", async () => {
  const facade = createFacade();
  const pipeline = new CanonicalPipeline({ now: () => new Date("2026-04-14T21:10:00.000Z") });

  const fixturesBatch = await facade.fetchFixturesBatch({
    league: "PL",
    window: {
      end: "2026-04-16T00:00:00.000Z",
      granularity: "daily",
      start: "2026-04-15T00:00:00.000Z",
    },
  });

  const fixturesResult = pipeline.ingestFixturesBatch(fixturesBatch);
  assert.equal(fixturesResult.insertedCompetitions, 1);
  assert.equal(fixturesResult.insertedTeams, 2);
  assert.equal(fixturesResult.snapshot.matches.length, 1);

  const oddsBatch = await facade.fetchOddsBatch({
    fixtureIds: ["fix-100"],
    marketKeys: ["h2h"],
    window: {
      end: "2026-04-14T22:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-14T21:00:00.000Z",
    },
  });

  const oddsResult = pipeline.ingestOddsBatch(oddsBatch);
  assert.equal(oddsResult.upsertedMarkets, 1);
  assert.equal(oddsResult.snapshot.matches[0]?.odds.length, 1);

  const duplicate = pipeline.ingestOddsBatch(oddsBatch);
  assert.equal(duplicate.upsertedMarkets, 0);
});

test("smoke runner chains raw ingestion and canonical snapshotting", async () => {
  const runner = new IngestionSmokeRunner(new CanonicalPipeline({ now: () => new Date("2026-04-14T21:15:00.000Z") }));
  const result = await runner.run({
    facade: createFacade(),
    fixtures: {
      league: "PL",
      window: {
        end: "2026-04-16T00:00:00.000Z",
        granularity: "daily",
        start: "2026-04-15T00:00:00.000Z",
      },
    },
    odds: {
      fixtureIds: ["fix-100"],
      marketKeys: ["h2h"],
      window: {
        end: "2026-04-14T22:00:00.000Z",
        granularity: "intraday",
        start: "2026-04-14T21:00:00.000Z",
      },
    },
  });

  assert.equal(result.canonicalMatches, 1);
  assert.equal(result.canonicalMarkets, 1);
  assert.ok(result.snapshotId.length > 0);
});
