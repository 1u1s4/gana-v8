import {
  FootballApiFacade,
  ingestAvailabilityWindow,
  ingestFixturesWindow,
  ingestLineupsWindow,
  ingestOddsWindow,
  type FetchAvailabilityWindowInput,
  type FetchFixturesWindowInput,
  type FetchLineupsWindowInput,
  type FetchOddsWindowInput,
} from "@gana-v8/source-connectors";

import { CanonicalPipeline } from "./canonicalize.js";

export interface IngestionSmokeRunnerInput {
  readonly facade: FootballApiFacade;
  readonly fixtures: FetchFixturesWindowInput;
  readonly odds: FetchOddsWindowInput;
  readonly availability?: FetchAvailabilityWindowInput;
  readonly lineups?: FetchLineupsWindowInput;
}

export interface IngestionSmokeRunnerResult {
  readonly fixtureBatchId: string;
  readonly oddsBatchId: string;
  readonly snapshotId: string;
  readonly canonicalMatches: number;
  readonly canonicalMarkets: number;
  readonly canonicalAvailabilityEntries: number;
  readonly canonicalLineups: number;
}

export class IngestionSmokeRunner {
  constructor(private readonly pipeline: CanonicalPipeline = new CanonicalPipeline()) {}

  async run(input: IngestionSmokeRunnerInput): Promise<IngestionSmokeRunnerResult> {
    const fixtureJob = await ingestFixturesWindow(input.facade, input.fixtures);
    const fixtureCanonical = this.pipeline.ingestFixturesBatch(fixtureJob.batch);

    const availabilityCanonical = input.availability
      ? this.pipeline.ingestAvailabilityBatch((await ingestAvailabilityWindow(input.facade, input.availability)).batch)
      : undefined;
    const lineupsCanonical = input.lineups
      ? this.pipeline.ingestLineupsBatch((await ingestLineupsWindow(input.facade, input.lineups)).batch)
      : undefined;

    const oddsJob = await ingestOddsWindow(input.facade, input.odds);
    const oddsCanonical = this.pipeline.ingestOddsBatch(oddsJob.batch);

    return {
      canonicalAvailabilityEntries: availabilityCanonical?.upsertedAvailabilityEntries ?? 0,
      canonicalLineups: lineupsCanonical?.upsertedLineups ?? 0,
      canonicalMarkets: oddsCanonical.upsertedMarkets,
      canonicalMatches: fixtureCanonical.snapshot.matches.length,
      fixtureBatchId: fixtureJob.batch.batchId,
      oddsBatchId: oddsJob.batch.batchId,
      snapshotId: oddsCanonical.snapshot.snapshotId,
    };
  }
}
