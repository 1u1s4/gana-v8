import assert from "node:assert/strict";
import test from "node:test";

import {
  FootballApiFacade,
  FakeFootballApiClient,
  sampleAvailability,
  sampleFixtures,
  sampleLineups,
  sampleOdds,
} from "@gana-v8/source-connectors";

import { CanonicalPipeline } from "../src/canonicalize.js";
import { IngestionSmokeRunner } from "../src/smoke-runner.js";

const createFacade = () =>
  new FootballApiFacade(
    new FakeFootballApiClient(
      sampleFixtures(),
      sampleOdds(),
      sampleAvailability(),
      sampleLineups(),
    ),
    {
      now: () => new Date("2026-04-14T21:00:00.000Z"),
      providerCode: "api-football",
      runIdFactory: () => "run-100",
      sourceName: "api-football",
    },
  );

test("canonical pipeline materializes matches, availability, lineups, and odds snapshots idempotently", async () => {
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

  const availabilityBatch = await facade.fetchAvailabilityBatch({
    fixtureIds: ["fix-100"],
    window: {
      end: "2026-04-15T20:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });

  const availabilityResult = pipeline.ingestAvailabilityBatch(availabilityBatch);
  assert.equal(availabilityResult.insertedPlayers, 2);
  assert.equal(availabilityResult.upsertedAvailabilityEntries, 2);
  assert.equal(availabilityResult.snapshot.matches[0]?.availability.length, 2);

  const lineupsBatch = await facade.fetchLineupsBatch({
    fixtureIds: ["fix-100"],
    window: {
      end: "2026-04-15T19:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });

  const lineupsResult = pipeline.ingestLineupsBatch(lineupsBatch);
  assert.equal(lineupsResult.upsertedLineups, 2);
  assert.equal(lineupsResult.snapshot.matches[0]?.lineups.length, 2);

  const duplicate = pipeline.ingestOddsBatch(oddsBatch);
  assert.equal(duplicate.upsertedMarkets, 0);
});

test("smoke runner chains raw ingestion and canonical snapshotting", async () => {
  const runner = new IngestionSmokeRunner(new CanonicalPipeline({ now: () => new Date("2026-04-14T21:15:00.000Z") }));
  const result = await runner.run({
    availability: {
      fixtureIds: ["fix-100"],
      window: {
        end: "2026-04-15T20:00:00.000Z",
        granularity: "intraday",
        start: "2026-04-15T18:00:00.000Z",
      },
    },
    facade: createFacade(),
    fixtures: {
      league: "PL",
      window: {
        end: "2026-04-16T00:00:00.000Z",
        granularity: "daily",
        start: "2026-04-15T00:00:00.000Z",
      },
    },
    lineups: {
      fixtureIds: ["fix-100"],
      window: {
        end: "2026-04-15T19:00:00.000Z",
        granularity: "intraday",
        start: "2026-04-15T18:00:00.000Z",
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
  assert.equal(result.canonicalAvailabilityEntries, 2);
  assert.equal(result.canonicalLineups, 2);
  assert.ok(result.snapshotId.length > 0);
});

test("canonical pipeline hydrates deferred supplements once the fixture arrives", async () => {
  const facade = createFacade();
  const pipeline = new CanonicalPipeline({ now: () => new Date("2026-04-14T21:20:00.000Z") });

  const availabilityBatch = await facade.fetchAvailabilityBatch({
    fixtureIds: ["fix-100"],
    window: {
      end: "2026-04-15T20:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });
  const lineupsBatch = await facade.fetchLineupsBatch({
    fixtureIds: ["fix-100"],
    window: {
      end: "2026-04-15T19:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });
  const oddsBatch = await facade.fetchOddsBatch({
    fixtureIds: ["fix-100"],
    marketKeys: ["h2h"],
    window: {
      end: "2026-04-14T22:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-14T21:00:00.000Z",
    },
  });

  pipeline.ingestAvailabilityBatch(availabilityBatch);
  pipeline.ingestLineupsBatch(lineupsBatch);
  pipeline.ingestOddsBatch(oddsBatch);

  const fixturesBatch = await facade.fetchFixturesBatch({
    league: "PL",
    window: {
      end: "2026-04-16T00:00:00.000Z",
      granularity: "daily",
      start: "2026-04-15T00:00:00.000Z",
    },
  });
  const result = pipeline.ingestFixturesBatch(fixturesBatch);

  assert.equal(result.snapshot.matches.length, 1);
  assert.equal(result.snapshot.matches[0]?.availability.length, 2);
  assert.equal(result.snapshot.matches[0]?.lineups.length, 2);
  assert.equal(result.snapshot.matches[0]?.odds.length, 1);
});

test("canonical pipeline ignores stale availability and lineup replays and keeps cumulative lineage", async () => {
  const facade = createFacade();
  const pipeline = new CanonicalPipeline({ now: () => new Date("2026-04-14T21:25:00.000Z") });

  const fixturesBatch = await facade.fetchFixturesBatch({
    league: "PL",
    window: {
      end: "2026-04-16T00:00:00.000Z",
      granularity: "daily",
      start: "2026-04-15T00:00:00.000Z",
    },
  });
  const fixturesResult = pipeline.ingestFixturesBatch(fixturesBatch);

  const [availabilityRecord] = sampleAvailability();
  const newerAvailabilityBatch = {
    ...fixturesBatch,
    batchId: "availability-newer",
    checksum: "availability-newer",
    extractionTime: "2026-04-15T19:00:00.000Z",
    lineage: {
      ...fixturesBatch.lineage,
      endpointFamily: "availability" as const,
      fetchedAt: "2026-04-15T19:00:00.000Z",
      runId: "run-availability-newer",
    },
    records: [
      {
        ...availabilityRecord,
        sourceUpdatedAt: "2026-04-15T19:00:00.000Z",
        status: "confirmed_out" as const,
      },
    ],
    sourceEndpoint: "/injuries",
    sourceName: "api-football",
    rawObjectRefs: ["memory://availability/newer.json"],
    warnings: [],
    sourceQualityScore: 1,
  };
  const olderAvailabilityBatch = {
    ...newerAvailabilityBatch,
    batchId: "availability-older",
    checksum: "availability-older",
    extractionTime: "2026-04-15T18:00:00.000Z",
    lineage: {
      ...newerAvailabilityBatch.lineage,
      fetchedAt: "2026-04-15T18:00:00.000Z",
      runId: "run-availability-older",
    },
    records: [
      {
        ...newerAvailabilityBatch.records[0],
        sourceUpdatedAt: "2026-04-15T18:00:00.000Z",
        status: "available" as const,
      },
    ],
    rawObjectRefs: ["memory://availability/older.json"],
  };

  const [homeLineup] = sampleLineups();
  const newerLineupBatch = {
    ...fixturesBatch,
    batchId: "lineups-newer",
    checksum: "lineups-newer",
    extractionTime: "2026-04-15T19:10:00.000Z",
    lineage: {
      ...fixturesBatch.lineage,
      endpointFamily: "lineups" as const,
      fetchedAt: "2026-04-15T19:10:00.000Z",
      runId: "run-lineups-newer",
    },
    records: [
      {
        ...homeLineup,
        formation: "4-3-3",
        sourceUpdatedAt: "2026-04-15T19:10:00.000Z",
      },
    ],
    sourceEndpoint: "/fixtures/lineups",
    sourceName: "api-football",
    rawObjectRefs: ["memory://lineups/newer.json"],
    warnings: [],
    sourceQualityScore: 1,
  };
  const olderLineupBatch = {
    ...newerLineupBatch,
    batchId: "lineups-older",
    checksum: "lineups-older",
    extractionTime: "2026-04-15T18:10:00.000Z",
    lineage: {
      ...newerLineupBatch.lineage,
      fetchedAt: "2026-04-15T18:10:00.000Z",
      runId: "run-lineups-older",
    },
    records: [
      {
        ...newerLineupBatch.records[0],
        formation: "3-5-2",
        sourceUpdatedAt: "2026-04-15T18:10:00.000Z",
      },
    ],
    rawObjectRefs: ["memory://lineups/older.json"],
  };

  const newerAvailabilityResult = pipeline.ingestAvailabilityBatch(newerAvailabilityBatch);
  const staleAvailabilityResult = pipeline.ingestAvailabilityBatch(olderAvailabilityBatch);
  const newerLineupResult = pipeline.ingestLineupsBatch(newerLineupBatch);
  const staleLineupResult = pipeline.ingestLineupsBatch(olderLineupBatch);
  const [match] = pipeline.repository.listMatches();

  assert.equal(fixturesResult.snapshot.sourceBatchIds.includes(fixturesBatch.batchId), true);
  assert.equal(newerAvailabilityResult.snapshot.sourceBatchIds.includes(fixturesBatch.batchId), true);
  assert.equal(newerAvailabilityResult.snapshot.sourceBatchIds.includes(newerAvailabilityBatch.batchId), true);
  assert.equal(newerLineupResult.snapshot.sourceBatchIds.includes(newerAvailabilityBatch.batchId), true);
  assert.equal(newerLineupResult.snapshot.sourceBatchIds.includes(newerLineupBatch.batchId), true);
  assert.equal(staleAvailabilityResult.upsertedAvailabilityEntries, 0);
  assert.equal(staleLineupResult.upsertedLineups, 0);
  assert.equal(match?.availability[0]?.status, "confirmed_out");
  assert.equal(match?.availability[0]?.capturedAt, "2026-04-15T19:00:00.000Z");
  assert.equal(match?.lineups[0]?.formation, "4-3-3");
  assert.equal(match?.lineups[0]?.capturedAt, "2026-04-15T19:10:00.000Z");
});
