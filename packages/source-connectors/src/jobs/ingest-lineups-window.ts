import type { FootballApiFacade } from "../clients/football-api.js";
import type { FetchLineupsWindowInput, RawLineupRecord, SourceIngestionBatch } from "../models/raw.js";

export const INGEST_LINEUPS_JOB_NAME = "ingest.lineups.window";

export interface LineupsWindowJobResult {
  readonly jobName: typeof INGEST_LINEUPS_JOB_NAME;
  readonly batch: SourceIngestionBatch<RawLineupRecord>;
  readonly observedRecords: number;
}

export const ingestLineupsWindow = async (
  facade: FootballApiFacade,
  input: FetchLineupsWindowInput,
): Promise<LineupsWindowJobResult> => {
  const batch = await facade.fetchLineupsBatch(input);

  return {
    batch,
    jobName: INGEST_LINEUPS_JOB_NAME,
    observedRecords: batch.records.length,
  };
};
