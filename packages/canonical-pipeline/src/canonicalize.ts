import {
  buildChecksum,
  type RawAvailabilityRecord,
  type RawFixtureRecord,
  type RawLineupPlayer,
  type RawLineupRecord,
  type RawOddsMarketRecord,
  type SourceIngestionBatch,
} from "@gana-v8/source-connectors";

import type {
  CanonicalAvailabilityEntry,
  CanonicalCompetition,
  CanonicalLineup,
  CanonicalLineupPlayer,
  CanonicalMatch,
  CanonicalOddsMarket,
  CanonicalPlayer,
  CanonicalTeam,
  CanonicalizationResult,
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

const toTeam = (
  providerCode: string,
  team: RawFixtureRecord["homeTeam"] | RawAvailabilityRecord["team"] | RawLineupRecord["team"],
): CanonicalTeam => ({
  ...(team.country ? { country: team.country } : {}),
  name: team.name,
  providerTeamId: team.providerTeamId,
  ...(team.shortName ? { shortName: team.shortName } : {}),
  teamId: canonicalId("team", providerCode, team.providerTeamId),
});

const toPlayer = (
  providerCode: string,
  player: RawAvailabilityRecord["player"] | RawLineupPlayer["player"],
): CanonicalPlayer => ({
  ...(player.country ? { country: player.country } : {}),
  name: player.name,
  ...(player.position ? { position: player.position } : {}),
  playerId: canonicalId("player", providerCode, player.providerPlayerId),
  providerPlayerId: player.providerPlayerId,
  ...(player.shirtNumber !== undefined ? { shirtNumber: player.shirtNumber } : {}),
  ...(player.shortName ? { shortName: player.shortName } : {}),
});

const toMatch = (record: RawFixtureRecord): CanonicalMatch => ({
  availability: [],
  awayTeamId: canonicalId("team", record.providerCode, record.awayTeam.providerTeamId),
  competitionId: canonicalId("competition", record.providerCode, record.competition.providerCompetitionId),
  homeTeamId: canonicalId("team", record.providerCode, record.homeTeam.providerTeamId),
  lineups: [],
  matchId: canonicalId("match", record.providerCode, record.providerFixtureId),
  odds: [],
  providerFixtureId: record.providerFixtureId,
  scheduledAt: record.scheduledAt,
  ...(record.sourceUpdatedAt ? { sourceUpdatedAt: record.sourceUpdatedAt } : {}),
  status: record.status,
});

const toMarket = (record: RawOddsMarketRecord, capturedAt: string): CanonicalOddsMarket => ({
  bookmakerKey: record.bookmakerKey,
  capturedAt: record.sourceUpdatedAt ?? capturedAt,
  marketKey: record.marketKey,
  selections: record.selections.map((selection) => ({
    key: selection.key,
    label: selection.label,
    priceDecimal: selection.priceDecimal,
  })),
});

const toAvailability = (
  record: RawAvailabilityRecord,
  capturedAt: string,
): CanonicalAvailabilityEntry => ({
  ...(record.confidenceScore !== undefined ? { confidenceScore: record.confidenceScore } : {}),
  capturedAt: record.sourceUpdatedAt ?? capturedAt,
  ...(record.expectedReturnDate ? { expectedReturnDate: record.expectedReturnDate } : {}),
  playerId: canonicalId("player", record.providerCode, record.player.providerPlayerId),
  ...(record.reasonCode ? { reasonCode: record.reasonCode } : {}),
  status: record.status,
  teamId: canonicalId("team", record.providerCode, record.team.providerTeamId),
});

const compareLineupPlayers = (left: CanonicalLineupPlayer, right: CanonicalLineupPlayer): number => {
  const roleOrder = (role: CanonicalLineupPlayer["role"]): number => {
    switch (role) {
      case "starter":
        return 0;
      case "bench":
        return 1;
      case "unavailable":
        return 2;
    }
  };

  return (
    roleOrder(left.role) - roleOrder(right.role) ||
    (left.positionSlot ?? "").localeCompare(right.positionSlot ?? "") ||
    left.playerId.localeCompare(right.playerId)
  );
};

const toLineupPlayer = (
  providerCode: string,
  player: RawLineupPlayer,
): CanonicalLineupPlayer => ({
  playerId: canonicalId("player", providerCode, player.player.providerPlayerId),
  ...(player.player.shirtNumber !== undefined ? { shirtNumber: player.player.shirtNumber } : {}),
  ...(player.position ? { position: player.position } : {}),
  ...(player.positionSlot ? { positionSlot: player.positionSlot } : {}),
  role: player.role,
});

const toLineup = (
  record: RawLineupRecord,
  capturedAt: string,
): CanonicalLineup => ({
  capturedAt: record.sourceUpdatedAt ?? capturedAt,
  ...(record.formation ? { formation: record.formation } : {}),
  players: record.players
    .map((player) => toLineupPlayer(record.providerCode, player))
    .sort(compareLineupPlayers),
  ...(record.sourceConfidence !== undefined ? { sourceConfidence: record.sourceConfidence } : {}),
  status: record.status,
  teamId: canonicalId("team", record.providerCode, record.team.providerTeamId),
});

const emptyResult = (
  repository: InMemoryCanonicalRepository,
  generatedAt: string,
  sourceBatchIds: readonly string[],
): CanonicalizationResult => ({
  insertedCompetitions: 0,
  insertedPlayers: 0,
  insertedTeams: 0,
  snapshot: repository.createSnapshot(generatedAt, sourceBatchIds),
  upsertedAvailabilityEntries: 0,
  upsertedLineups: 0,
  upsertedMarkets: 0,
  upsertedMatches: 0,
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

  ingestFixturesBatch(batch: SourceIngestionBatch<RawFixtureRecord>): CanonicalizationResult {
    const generatedAt = this.now().toISOString();
    if (this.repository.hasProcessedBatch(batch.batchId)) {
      return emptyResult(this.repository, generatedAt, [batch.batchId]);
    }

    let insertedCompetitions = 0;
    let insertedTeams = 0;

    for (const record of batch.records) {
      insertedCompetitions += Number(this.repository.upsertCompetition(toCompetition(record)));
      insertedTeams += Number(this.repository.upsertTeam(toTeam(record.providerCode, record.homeTeam)));
      insertedTeams += Number(this.repository.upsertTeam(toTeam(record.providerCode, record.awayTeam)));
      this.repository.upsertMatch(toMatch(record));
    }

    this.repository.markBatchProcessed(batch.batchId);

    return {
      insertedCompetitions,
      insertedPlayers: 0,
      insertedTeams,
      snapshot: this.repository.createSnapshot(generatedAt, [batch.batchId]),
      upsertedAvailabilityEntries: 0,
      upsertedLineups: 0,
      upsertedMarkets: 0,
      upsertedMatches: batch.records.length,
    };
  }

  ingestOddsBatch(batch: SourceIngestionBatch<RawOddsMarketRecord>): CanonicalizationResult {
    const generatedAt = this.now().toISOString();
    if (this.repository.hasProcessedBatch(batch.batchId)) {
      return emptyResult(this.repository, generatedAt, [batch.batchId]);
    }

    let upsertedMarkets = 0;
    const touchedMatches = new Set<string>();

    for (const record of batch.records) {
      const matchId = canonicalId("match", record.providerCode, record.providerFixtureId);
      upsertedMarkets += this.repository.appendMarkets(matchId, [toMarket(record, batch.extractionTime)]);
      touchedMatches.add(matchId);
    }

    this.repository.markBatchProcessed(batch.batchId);

    return {
      insertedCompetitions: 0,
      insertedPlayers: 0,
      insertedTeams: 0,
      snapshot: this.repository.createSnapshot(generatedAt, [batch.batchId]),
      upsertedAvailabilityEntries: 0,
      upsertedLineups: 0,
      upsertedMarkets,
      upsertedMatches: touchedMatches.size,
    };
  }

  ingestAvailabilityBatch(batch: SourceIngestionBatch<RawAvailabilityRecord>): CanonicalizationResult {
    const generatedAt = this.now().toISOString();
    if (this.repository.hasProcessedBatch(batch.batchId)) {
      return emptyResult(this.repository, generatedAt, [batch.batchId]);
    }

    let insertedPlayers = 0;
    let insertedTeams = 0;
    let upsertedAvailabilityEntries = 0;
    const touchedMatches = new Set<string>();

    for (const record of batch.records) {
      insertedTeams += Number(this.repository.upsertTeam(toTeam(record.providerCode, record.team)));
      insertedPlayers += Number(this.repository.upsertPlayer(toPlayer(record.providerCode, record.player)));

      const matchId = canonicalId("match", record.providerCode, record.providerFixtureId);
      upsertedAvailabilityEntries += this.repository.appendAvailability(matchId, [
        toAvailability(record, batch.extractionTime),
      ]);
      touchedMatches.add(matchId);
    }

    this.repository.markBatchProcessed(batch.batchId);

    return {
      insertedCompetitions: 0,
      insertedPlayers,
      insertedTeams,
      snapshot: this.repository.createSnapshot(generatedAt, [batch.batchId]),
      upsertedAvailabilityEntries,
      upsertedLineups: 0,
      upsertedMarkets: 0,
      upsertedMatches: touchedMatches.size,
    };
  }

  ingestLineupsBatch(batch: SourceIngestionBatch<RawLineupRecord>): CanonicalizationResult {
    const generatedAt = this.now().toISOString();
    if (this.repository.hasProcessedBatch(batch.batchId)) {
      return emptyResult(this.repository, generatedAt, [batch.batchId]);
    }

    let insertedPlayers = 0;
    let insertedTeams = 0;
    let upsertedLineups = 0;
    const touchedMatches = new Set<string>();

    for (const record of batch.records) {
      insertedTeams += Number(this.repository.upsertTeam(toTeam(record.providerCode, record.team)));
      for (const player of record.players) {
        insertedPlayers += Number(this.repository.upsertPlayer(toPlayer(record.providerCode, player.player)));
      }

      const matchId = canonicalId("match", record.providerCode, record.providerFixtureId);
      upsertedLineups += this.repository.appendLineups(matchId, [toLineup(record, batch.extractionTime)]);
      touchedMatches.add(matchId);
    }

    this.repository.markBatchProcessed(batch.batchId);

    return {
      insertedCompetitions: 0,
      insertedPlayers,
      insertedTeams,
      snapshot: this.repository.createSnapshot(generatedAt, [batch.batchId]),
      upsertedAvailabilityEntries: 0,
      upsertedLineups,
      upsertedMarkets: 0,
      upsertedMatches: touchedMatches.size,
    };
  }
}
