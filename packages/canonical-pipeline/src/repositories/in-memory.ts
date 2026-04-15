import { buildChecksum } from "@gana-v8/source-connectors";

import type {
  CanonicalCompetition,
  CanonicalMatch,
  CanonicalMatchSnapshot,
  CanonicalOddsMarket,
  CanonicalTeam,
} from "../models/canonical.js";

export class InMemoryCanonicalRepository {
  private readonly competitions = new Map<string, CanonicalCompetition>();
  private readonly teams = new Map<string, CanonicalTeam>();
  private readonly matches = new Map<string, CanonicalMatch>();
  private readonly snapshots = new Map<string, CanonicalMatchSnapshot>();
  private readonly processedBatchIds = new Set<string>();

  upsertCompetition(competition: CanonicalCompetition): boolean {
    const isNew = !this.competitions.has(competition.competitionId);
    this.competitions.set(competition.competitionId, competition);
    return isNew;
  }

  upsertTeam(team: CanonicalTeam): boolean {
    const isNew = !this.teams.has(team.teamId);
    this.teams.set(team.teamId, team);
    return isNew;
  }

  upsertMatch(match: CanonicalMatch): void {
    this.matches.set(match.matchId, match);
  }

  appendMarkets(matchId: string, markets: readonly CanonicalOddsMarket[]): number {
    const current = this.matches.get(matchId);
    if (!current) {
      return 0;
    }

    const existingByKey = new Map(current.odds.map((market) => [`${market.bookmakerKey}:${market.marketKey}`, market]));
    let upserted = 0;

    for (const market of markets) {
      const key = `${market.bookmakerKey}:${market.marketKey}`;
      const previous = existingByKey.get(key);
      if (!previous || buildChecksum(previous) !== buildChecksum(market)) {
        existingByKey.set(key, market);
        upserted += 1;
      }
    }

    this.matches.set(matchId, {
      ...current,
      odds: [...existingByKey.values()].sort((left, right) =>
        `${left.bookmakerKey}:${left.marketKey}`.localeCompare(`${right.bookmakerKey}:${right.marketKey}`),
      ),
    });

    return upserted;
  }

  hasProcessedBatch(batchId: string): boolean {
    return this.processedBatchIds.has(batchId);
  }

  markBatchProcessed(batchId: string): void {
    this.processedBatchIds.add(batchId);
  }

  createSnapshot(generatedAt: string, sourceBatchIds: readonly string[]): CanonicalMatchSnapshot {
    const matches = [...this.matches.values()].sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
    const snapshotId = buildChecksum({ generatedAt, matches, sourceBatchIds });
    const snapshot = {
      generatedAt,
      matches,
      snapshotId,
      sourceBatchIds,
    } satisfies CanonicalMatchSnapshot;

    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  listMatches(): readonly CanonicalMatch[] {
    return [...this.matches.values()];
  }

  listSnapshots(): readonly CanonicalMatchSnapshot[] {
    return [...this.snapshots.values()];
  }
}
