export type SourceDomain = "fixtures" | "odds";

export interface SourceCoverageWindow {
  readonly start: string;
  readonly end: string;
  readonly granularity: "daily" | "intraday";
}

export interface SourceLineage {
  readonly providerCode: string;
  readonly endpointFamily: string;
  readonly runId: string;
  readonly fetchedAt: string;
  readonly schemaVersion: string;
}

export interface RawCompetition {
  readonly providerCompetitionId: string;
  readonly name: string;
  readonly country?: string;
  readonly season?: string;
}

export interface RawTeam {
  readonly providerTeamId: string;
  readonly name: string;
  readonly shortName?: string;
  readonly country?: string;
}

export interface RawFixtureScore {
  readonly home: number | null;
  readonly away: number | null;
}

export interface RawFixtureRecord {
  readonly recordType: "fixture";
  readonly providerFixtureId: string;
  readonly providerCode: string;
  readonly status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  readonly scheduledAt: string;
  readonly competition: RawCompetition;
  readonly homeTeam: RawTeam;
  readonly awayTeam: RawTeam;
  readonly score?: RawFixtureScore;
  readonly sourceUpdatedAt?: string;
  readonly payload: Record<string, unknown>;
}

export interface RawOddsSelection {
  readonly key: string;
  readonly label: string;
  readonly priceDecimal: number;
}

export interface RawOddsMarketRecord {
  readonly recordType: "odds";
  readonly providerFixtureId: string;
  readonly providerCode: string;
  readonly bookmakerKey: string;
  readonly marketKey: string;
  readonly selections: readonly RawOddsSelection[];
  readonly sourceUpdatedAt?: string;
  readonly payload: Record<string, unknown>;
}

export type RawSourceRecord = RawFixtureRecord | RawOddsMarketRecord;

export interface SourceIngestionBatch<TRecord extends RawSourceRecord = RawSourceRecord> {
  readonly batchId: string;
  readonly sourceName: string;
  readonly sourceEndpoint: string;
  readonly extractionTime: string;
  readonly coverageWindow: SourceCoverageWindow;
  readonly checksum: string;
  readonly extractionStatus: "success" | "partial" | "empty";
  readonly warnings: readonly string[];
  readonly sourceQualityScore: number;
  readonly lineage: SourceLineage;
  readonly records: readonly TRecord[];
  readonly rawObjectRefs: readonly string[];
}

export interface FetchFixturesWindowInput {
  readonly window: SourceCoverageWindow;
  readonly league?: string;
  readonly season?: number;
}

export interface FetchOddsWindowInput {
  readonly window: SourceCoverageWindow;
  readonly fixtureIds?: readonly string[];
  readonly marketKeys?: readonly string[];
}

export interface FootballApiClient {
  fetchFixturesWindow(input: FetchFixturesWindowInput): Promise<readonly RawFixtureRecord[]>;
  fetchOddsWindow(input: FetchOddsWindowInput): Promise<readonly RawOddsMarketRecord[]>;
}
