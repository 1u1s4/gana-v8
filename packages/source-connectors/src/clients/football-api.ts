import {
  type FetchFixturesWindowInput,
  type FetchOddsWindowInput,
  type FootballApiClient,
  type RawFixtureRecord,
  type RawOddsMarketRecord,
  type SourceCoverageWindow,
  type SourceIngestionBatch,
} from "../models/raw.js";
import { buildChecksum, buildIdempotencyKey } from "../idempotency.js";

export interface FootballApiFacadeOptions {
  readonly providerCode: string;
  readonly sourceName: string;
  readonly schemaVersion?: string;
  readonly now?: () => Date;
  readonly runIdFactory?: () => string;
}

const toQualityScore = (recordCount: number, warnings: readonly string[]): number => {
  const completeness = recordCount === 0 ? 0.2 : Math.min(1, 0.6 + recordCount * 0.05);
  const penalty = warnings.length * 0.1;

  return Number(Math.max(0, Math.min(1, completeness - penalty)).toFixed(2));
};

export class FootballApiFacade {
  private readonly now: () => Date;
  private readonly runIdFactory: () => string;
  private readonly schemaVersion: string;

  constructor(
    private readonly client: FootballApiClient,
    private readonly options: FootballApiFacadeOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.runIdFactory =
      options.runIdFactory ??
      (() => `${options.providerCode}-${this.now().toISOString().replace(/[:.]/g, "-")}`);
    this.schemaVersion = options.schemaVersion ?? "v1";
  }

  async fetchFixturesBatch(
    input: FetchFixturesWindowInput,
  ): Promise<SourceIngestionBatch<RawFixtureRecord>> {
    const runId = this.runIdFactory();
    const extractionTime = this.now().toISOString();
    const records = await this.client.fetchFixturesWindow(input);

    return this.createBatch({
      coverageWindow: input.window,
      endpointFamily: "fixtures",
      extractionTime,
      records,
      runId,
      sourceEndpoint: "football.fixtures.window",
      warningHint: input.league ? [] : ["league_scope_unspecified"],
    });
  }

  async fetchOddsBatch(input: FetchOddsWindowInput): Promise<SourceIngestionBatch<RawOddsMarketRecord>> {
    const runId = this.runIdFactory();
    const extractionTime = this.now().toISOString();
    const records = await this.client.fetchOddsWindow(input);

    return this.createBatch({
      coverageWindow: input.window,
      endpointFamily: "odds",
      extractionTime,
      records,
      runId,
      sourceEndpoint: "football.odds.window",
      warningHint: records.length === 0 ? ["odds_window_empty"] : [],
    });
  }

  private createBatch<TRecord extends RawFixtureRecord | RawOddsMarketRecord>(input: {
    readonly runId: string;
    readonly extractionTime: string;
    readonly coverageWindow: SourceCoverageWindow;
    readonly endpointFamily: "fixtures" | "odds";
    readonly sourceEndpoint: string;
    readonly records: readonly TRecord[];
    readonly warningHint: readonly string[];
  }): SourceIngestionBatch<TRecord> {
    const batchId = buildIdempotencyKey({
      endpointFamily: input.endpointFamily,
      params: {
        providerCode: this.options.providerCode,
        recordCount: input.records.length,
        records: input.records,
      },
      providerCode: this.options.providerCode,
      windowEnd: input.coverageWindow.end,
      windowStart: input.coverageWindow.start,
    });

    const checksum = buildChecksum(input.records);
    const extractionStatus =
      input.records.length === 0 ? "empty" : input.warningHint.length > 0 ? "partial" : "success";

    return {
      batchId,
      checksum,
      coverageWindow: input.coverageWindow,
      extractionStatus,
      extractionTime: input.extractionTime,
      lineage: {
        endpointFamily: input.endpointFamily,
        fetchedAt: input.extractionTime,
        providerCode: this.options.providerCode,
        runId: input.runId,
        schemaVersion: this.schemaVersion,
      },
      rawObjectRefs: input.records.map((record, index) =>
        `/raw/provider=${this.options.providerCode}/entity=${input.endpointFamily}/date=${input.extractionTime.slice(0, 10)}/run=${input.runId}/part-${index}.json`,
      ),
      records: input.records,
      sourceEndpoint: input.sourceEndpoint,
      sourceName: this.options.sourceName,
      sourceQualityScore: toQualityScore(input.records.length, input.warningHint),
      warnings: input.warningHint,
    };
  }
}

export interface FootballApiProviderFactory<TClient extends FootballApiClient = FootballApiClient> {
  createClient(): TClient;
}
