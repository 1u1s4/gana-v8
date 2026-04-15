import type { FootballApiFacade } from "../clients/football-api.js";
import type { FetchOddsWindowInput, RawOddsMarketRecord, SourceIngestionBatch } from "../models/raw.js";

export const INGEST_ODDS_JOB_NAME = "ingest.odds.window";

export interface OddsWindowJobResult {
  readonly jobName: typeof INGEST_ODDS_JOB_NAME;
  readonly batch: SourceIngestionBatch<RawOddsMarketRecord>;
  readonly observedRecords: number;
}

export const ingestOddsWindow = async (
  facade: FootballApiFacade,
  input: FetchOddsWindowInput,
): Promise<OddsWindowJobResult> => {
  const batch = await facade.fetchOddsBatch(input);

  return {
    batch,
    jobName: INGEST_ODDS_JOB_NAME,
    observedRecords: batch.records.length,
  };
};
