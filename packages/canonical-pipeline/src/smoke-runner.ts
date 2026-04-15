import {
  FootballApiFacade,
  ingestFixturesWindow,
  ingestOddsWindow,
  type FetchFixturesWindowInput,
  type FetchOddsWindowInput,
} from "@gana-v8/source-connectors";

import { CanonicalPipeline } from "./canonicalize.js";

export interface IngestionSmokeRunnerInput {
  readonly facade: FootballApiFacade;
  readonly fixtures: FetchFixturesWindowInput;
  readonly odds: FetchOddsWindowInput;
}

export interface IngestionSmokeRunnerResult {
  readonly fixtureBatchId: string;
  readonly oddsBatchId: string;
  readonly snapshotId: string;
  readonly canonicalMatches: number;
  readonly canonicalMarkets: number;
}

export class IngestionSmokeRunner {
  constructor(private readonly pipeline: CanonicalPipeline = new CanonicalPipeline()) {}

  async run(input: IngestionSmokeRunnerInput): Promise<IngestionSmokeRunnerResult> {
    const fixtureJob = await ingestFixturesWindow(input.facade, input.fixtures);
    const fixtureCanonical = this.pipeline.ingestFixturesBatch(fixtureJob.batch);

    const oddsJob = await ingestOddsWindow(input.facade, input.odds);
    const oddsCanonical = this.pipeline.ingestOddsBatch(oddsJob.batch);

    return {
      canonicalMarkets: oddsCanonical.upsertedMarkets,
      canonicalMatches: fixtureCanonical.snapshot.matches.length,
      fixtureBatchId: fixtureJob.batch.batchId,
      oddsBatchId: oddsJob.batch.batchId,
      snapshotId: oddsCanonical.snapshot.snapshotId,
    };
  }
}
