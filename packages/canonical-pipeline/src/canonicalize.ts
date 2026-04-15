import { buildChecksum, type RawFixtureRecord, type RawOddsMarketRecord, type SourceIngestionBatch } from "@gana-v8/source-connectors";

import type {
  CanonicalCompetition,
  CanonicalMatch,
  CanonicalOddsMarket,
  CanonicalTeam,
} from "./models/canonical.js";
import { InMemoryCanonicalRepository } from "./repositories/in-memory.js";

const canonicalId = (kind: string, providerCode: string, providerEntityId: string): string =>
  `${kind}_${buildChecksum({ providerCode, providerEntityId }).slice(0, 16)}`;

const toCompetition = (record: RawFixtureRecord): CanonicalCompetition => ({
  competitionId: canonicalId("competition", record.providerCode, record.competition.providerCompetitionId),
  ...(record.competition.country ? { country: record.competition.country } : {}),
  name: record.competition.name,
  providerCompetitionId: record.competition.providerCompetitionId,
  ...(record.competition.season ? { season: record.competition.season } : {}),
});

const toTeam = (record: RawFixtureRecord, side: "homeTeam" | "awayTeam"): CanonicalTeam => ({
  ...(record[side].country ? { country: record[side].country } : {}),
  name: record[side].name,
  providerTeamId: record[side].providerTeamId,
  ...(record[side].shortName ? { shortName: record[side].shortName } : {}),
  teamId: canonicalId("team", record.providerCode, record[side].providerTeamId),
});

const toMatch = (record: RawFixtureRecord): CanonicalMatch => ({
  awayTeamId: canonicalId("team", record.providerCode, record.awayTeam.providerTeamId),
  competitionId: canonicalId("competition", record.providerCode, record.competition.providerCompetitionId),
  homeTeamId: canonicalId("team", record.providerCode, record.homeTeam.providerTeamId),
  matchId: canonicalId("match", record.providerCode, record.providerFixtureId),
  odds: [],
  providerFixtureId: record.providerFixtureId,
  scheduledAt: record.scheduledAt,
  ...(record.sourceUpdatedAt ? { sourceUpdatedAt: record.sourceUpdatedAt } : {}),
  status: record.status,
});

const toMarket = (record: RawOddsMarketRecord): CanonicalOddsMarket => ({
  bookmakerKey: record.bookmakerKey,
  capturedAt: record.sourceUpdatedAt ?? new Date(0).toISOString(),
  marketKey: record.marketKey,
  selections: record.selections.map((selection) => ({
    key: selection.key,
    label: selection.label,
    priceDecimal: selection.priceDecimal,
  })),
});

export interface CanonicalPipelineOptions {
  readonly now?: () => Date;
  readonly repository?: InMemoryCanonicalRepository;
}

export class CanonicalPipeline {
  private readonly now: () => Date;
  readonly repository: InMemoryCanonicalRepository;

  constructor(options: CanonicalPipelineOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.repository = options.repository ?? new InMemoryCanonicalRepository();
  }

  ingestFixturesBatch(batch: SourceIngestionBatch<RawFixtureRecord>) {
    if (this.repository.hasProcessedBatch(batch.batchId)) {
      return {
        insertedCompetitions: 0,
        insertedTeams: 0,
        snapshot: this.repository.createSnapshot(this.now().toISOString(), [batch.batchId]),
        upsertedMarkets: 0,
        upsertedMatches: 0,
      };
    }

    let insertedCompetitions = 0;
    let insertedTeams = 0;

    for (const record of batch.records) {
      insertedCompetitions += Number(this.repository.upsertCompetition(toCompetition(record)));
      insertedTeams += Number(this.repository.upsertTeam(toTeam(record, "homeTeam")));
      insertedTeams += Number(this.repository.upsertTeam(toTeam(record, "awayTeam")));
      this.repository.upsertMatch(toMatch(record));
    }

    this.repository.markBatchProcessed(batch.batchId);

    return {
      insertedCompetitions,
      insertedTeams,
      snapshot: this.repository.createSnapshot(this.now().toISOString(), [batch.batchId]),
      upsertedMarkets: 0,
      upsertedMatches: batch.records.length,
    };
  }

  ingestOddsBatch(batch: SourceIngestionBatch<RawOddsMarketRecord>) {
    if (this.repository.hasProcessedBatch(batch.batchId)) {
      return {
        insertedCompetitions: 0,
        insertedTeams: 0,
        snapshot: this.repository.createSnapshot(this.now().toISOString(), [batch.batchId]),
        upsertedMarkets: 0,
        upsertedMatches: 0,
      };
    }

    let upsertedMarkets = 0;
    const touchedMatches = new Set<string>();

    for (const record of batch.records) {
      const matchId = canonicalId("match", record.providerCode, record.providerFixtureId);
      upsertedMarkets += this.repository.appendMarkets(matchId, [toMarket(record)]);
      touchedMatches.add(matchId);
    }

    this.repository.markBatchProcessed(batch.batchId);

    return {
      insertedCompetitions: 0,
      insertedTeams: 0,
      snapshot: this.repository.createSnapshot(this.now().toISOString(), [batch.batchId]),
      upsertedMarkets,
      upsertedMatches: touchedMatches.size,
    };
  }
}
