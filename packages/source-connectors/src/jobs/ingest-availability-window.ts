import type { FootballApiFacade } from "../clients/football-api.js";
import type { FetchAvailabilityWindowInput, RawAvailabilityRecord, SourceIngestionBatch } from "../models/raw.js";

export const INGEST_AVAILABILITY_JOB_NAME = "ingest.availability.window";

export interface AvailabilityWindowJobResult {
  readonly jobName: typeof INGEST_AVAILABILITY_JOB_NAME;
  readonly batch: SourceIngestionBatch<RawAvailabilityRecord>;
  readonly observedRecords: number;
}

export const ingestAvailabilityWindow = async (
  facade: FootballApiFacade,
  input: FetchAvailabilityWindowInput,
): Promise<AvailabilityWindowJobResult> => {
  const batch = await facade.fetchAvailabilityBatch(input);

  return {
    batch,
    jobName: INGEST_AVAILABILITY_JOB_NAME,
    observedRecords: batch.records.length,
  };
};
