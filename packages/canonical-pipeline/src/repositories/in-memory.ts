import { buildChecksum } from "@gana-v8/source-connectors";

import type {
  CanonicalAvailabilityEntry,
  CanonicalCompetition,
  CanonicalLineup,
  CanonicalMatch,
  CanonicalMatchSnapshot,
  CanonicalOddsMarket,
  CanonicalPlayer,
  CanonicalTeam,
} from "../models/canonical.js";

const compareMarketKeys = (left: CanonicalOddsMarket, right: CanonicalOddsMarket): number =>
  `${left.bookmakerKey}:${left.marketKey}`.localeCompare(`${right.bookmakerKey}:${right.marketKey}`);

const compareAvailabilityKeys = (left: CanonicalAvailabilityEntry, right: CanonicalAvailabilityEntry): number =>
  `${left.teamId}:${left.playerId}`.localeCompare(`${right.teamId}:${right.playerId}`);

const compareLineupKeys = (left: CanonicalLineup, right: CanonicalLineup): number =>
  left.teamId.localeCompare(right.teamId);

const compareLineupPlayerKeys = (
  left: CanonicalLineup["players"][number],
  right: CanonicalLineup["players"][number],
): number => {
  const roleWeight = (role: CanonicalLineup["players"][number]["role"]): number => {
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
    roleWeight(left.role) - roleWeight(right.role) ||
    (left.positionSlot ?? "").localeCompare(right.positionSlot ?? "") ||
    left.playerId.localeCompare(right.playerId)
  );
};

export class InMemoryCanonicalRepository {
  private readonly competitions = new Map<string, CanonicalCompetition>();
  private readonly teams = new Map<string, CanonicalTeam>();
  private readonly players = new Map<string, CanonicalPlayer>();
  private readonly matches = new Map<string, CanonicalMatch>();
  private readonly snapshots = new Map<string, CanonicalMatchSnapshot>();
  private readonly processedBatchIds = new Set<string>();
  private readonly marketsByMatchId = new Map<string, Map<string, CanonicalOddsMarket>>();
  private readonly availabilityByMatchId = new Map<string, Map<string, CanonicalAvailabilityEntry>>();
  private readonly lineupsByMatchId = new Map<string, Map<string, CanonicalLineup>>();

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

  upsertPlayer(player: CanonicalPlayer): boolean {
    const isNew = !this.players.has(player.playerId);
    this.players.set(player.playerId, player);
    return isNew;
  }

  upsertMatch(match: CanonicalMatch): void {
    this.matches.set(match.matchId, this.hydrateMatch(match));
  }

  appendMarkets(matchId: string, markets: readonly CanonicalOddsMarket[]): number {
    const upserted = this.upsertSupplement(
      this.marketsByMatchId,
      matchId,
      markets.map((market) => ({
        ...market,
        selections: [...market.selections],
      })),
      (market) => `${market.bookmakerKey}:${market.marketKey}`,
    );
    this.refreshMatch(matchId);
    return upserted;
  }

  appendAvailability(matchId: string, availability: readonly CanonicalAvailabilityEntry[]): number {
    const upserted = this.upsertSupplement(
      this.availabilityByMatchId,
      matchId,
      availability.map((entry) => ({ ...entry })),
      (entry) => `${entry.teamId}:${entry.playerId}`,
    );
    this.refreshMatch(matchId);
    return upserted;
  }

  appendLineups(matchId: string, lineups: readonly CanonicalLineup[]): number {
    const upserted = this.upsertSupplement(
      this.lineupsByMatchId,
      matchId,
      lineups.map((lineup) => ({
        ...lineup,
        players: [...lineup.players].sort(compareLineupPlayerKeys),
      })),
      (lineup) => lineup.teamId,
    );
    this.refreshMatch(matchId);
    return upserted;
  }

  hasProcessedBatch(batchId: string): boolean {
    return this.processedBatchIds.has(batchId);
  }

  markBatchProcessed(batchId: string): void {
    this.processedBatchIds.add(batchId);
  }

  createSnapshot(generatedAt: string, sourceBatchIds: readonly string[]): CanonicalMatchSnapshot {
    const matches = [...this.matches.values()]
      .map((match) => this.hydrateMatch(match))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
    const lineage = [...new Set([...this.processedBatchIds, ...sourceBatchIds])].sort();
    const snapshotId = buildChecksum({ generatedAt, matches, sourceBatchIds: lineage });
    const snapshot = {
      generatedAt,
      matches,
      snapshotId,
      sourceBatchIds: lineage,
    } satisfies CanonicalMatchSnapshot;

    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  listMatches(): readonly CanonicalMatch[] {
    return [...this.matches.values()].map((match) => this.hydrateMatch(match));
  }

  listSnapshots(): readonly CanonicalMatchSnapshot[] {
    return [...this.snapshots.values()];
  }

  private hydrateMatch(match: CanonicalMatch): CanonicalMatch {
    return {
      ...match,
      availability: this.listSupplements(this.availabilityByMatchId.get(match.matchId), compareAvailabilityKeys),
      lineups: this.listSupplements(this.lineupsByMatchId.get(match.matchId), compareLineupKeys),
      odds: this.listSupplements(this.marketsByMatchId.get(match.matchId), compareMarketKeys),
    };
  }

  private listSupplements<TValue>(
    items: ReadonlyMap<string, TValue> | undefined,
    compare: (left: TValue, right: TValue) => number,
  ): readonly TValue[] {
    return [...(items?.values() ?? [])].sort(compare);
  }

  private refreshMatch(matchId: string): void {
    const current = this.matches.get(matchId);
    if (!current) {
      return;
    }

    this.matches.set(matchId, this.hydrateMatch(current));
  }

  private upsertSupplement<TValue>(
    container: Map<string, Map<string, TValue>>,
    matchId: string,
    items: readonly TValue[],
    keyOf: (value: TValue) => string,
  ): number {
    const bucket = container.get(matchId) ?? new Map<string, TValue>();
    let upserted = 0;

    for (const item of items) {
      const key = keyOf(item);
      const previous = bucket.get(key);
      if (previous) {
        const previousCapturedAt = this.toCapturedAt(previous);
        const nextCapturedAt = this.toCapturedAt(item);
        if (
          previousCapturedAt !== null &&
          nextCapturedAt !== null &&
          Date.parse(nextCapturedAt) < Date.parse(previousCapturedAt)
        ) {
          continue;
        }
      }

      if (!previous || buildChecksum(previous) !== buildChecksum(item)) {
        bucket.set(key, item);
        upserted += 1;
      }
    }

    container.set(matchId, bucket);
    return upserted;
  }

  private toCapturedAt(value: unknown): string | null {
    if (typeof value !== "object" || value === null || !("capturedAt" in value)) {
      return null;
    }

    const capturedAt = (value as { capturedAt?: unknown }).capturedAt;
    return typeof capturedAt === "string" && capturedAt.length > 0 ? capturedAt : null;
  }
}
