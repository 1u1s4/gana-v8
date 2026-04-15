import type { FootballApiFacade } from "../clients/football-api.js";
import type { FetchFixturesWindowInput, RawFixtureRecord, SourceIngestionBatch } from "../models/raw.js";

export const INGEST_FIXTURES_JOB_NAME = "ingest.fixtures.window";

export interface FixturesWindowJobResult {
  readonly jobName: typeof INGEST_FIXTURES_JOB_NAME;
  readonly batch: SourceIngestionBatch<RawFixtureRecord>;
  readonly observedRecords: number;
}

export const ingestFixturesWindow = async (
  facade: FootballApiFacade,
  input: FetchFixturesWindowInput,
): Promise<FixturesWindowJobResult> => {
  const batch = await facade.fetchFixturesBatch(input);

  return {
    batch,
    jobName: INGEST_FIXTURES_JOB_NAME,
    observedRecords: batch.records.length,
  };
};
