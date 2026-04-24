import type { FootballApiFacade } from "../clients/football-api.js";
import type {
  FetchFixtureStatisticsInput,
  RawFixtureStatisticRecord,
  SourceIngestionBatch,
} from "../models/raw.js";

export const INGEST_STATISTICS_JOB_NAME = "ingest.statistics.window";

export interface StatisticsWindowJobResult {
  readonly jobName: typeof INGEST_STATISTICS_JOB_NAME;
  readonly batch: SourceIngestionBatch<RawFixtureStatisticRecord>;
  readonly observedRecords: number;
}

export const ingestStatisticsWindow = async (
  facade: FootballApiFacade,
  input: FetchFixtureStatisticsInput,
): Promise<StatisticsWindowJobResult> => {
  const batch = await facade.fetchStatisticsBatch(input);

  return {
    batch,
    jobName: INGEST_STATISTICS_JOB_NAME,
    observedRecords: batch.records.length,
  };
};
