export interface CanonicalCompetition {
  readonly competitionId: string;
  readonly providerCompetitionId: string;
  readonly name: string;
  readonly country?: string;
  readonly season?: string;
}

export interface CanonicalTeam {
  readonly teamId: string;
  readonly providerTeamId: string;
  readonly name: string;
  readonly shortName?: string;
  readonly country?: string;
}

export interface CanonicalPlayer {
  readonly playerId: string;
  readonly providerPlayerId: string;
  readonly name: string;
  readonly shortName?: string;
  readonly country?: string;
  readonly position?: string;
  readonly shirtNumber?: number;
}

export interface CanonicalOddsSelection {
  readonly key: string;
  readonly label: string;
  readonly priceDecimal: number;
}

export interface CanonicalOddsMarket {
  readonly bookmakerKey: string;
  readonly marketKey: string;
  readonly selections: readonly CanonicalOddsSelection[];
  readonly capturedAt: string;
}

export type CanonicalAvailabilityStatus =
  | "available"
  | "doubtful"
  | "injured"
  | "suspended"
  | "probable"
  | "confirmed_out";

export interface CanonicalAvailabilityEntry {
  readonly teamId: string;
  readonly playerId: string;
  readonly status: CanonicalAvailabilityStatus;
  readonly capturedAt: string;
  readonly reasonCode?: string;
  readonly expectedReturnDate?: string;
  readonly confidenceScore?: number;
}

export type CanonicalLineupStatus = "projected" | "confirmed";
export type CanonicalLineupRole = "starter" | "bench" | "unavailable";

export interface CanonicalLineupPlayer {
  readonly playerId: string;
  readonly role: CanonicalLineupRole;
  readonly position?: string;
  readonly positionSlot?: string;
  readonly shirtNumber?: number;
}

export interface CanonicalLineup {
  readonly teamId: string;
  readonly status: CanonicalLineupStatus;
  readonly formation?: string;
  readonly sourceConfidence?: number;
  readonly capturedAt: string;
  readonly players: readonly CanonicalLineupPlayer[];
}

export interface CanonicalMatch {
  readonly matchId: string;
  readonly providerFixtureId: string;
  readonly competitionId: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly scheduledAt: string;
  readonly status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  readonly sourceUpdatedAt?: string;
  readonly odds: readonly CanonicalOddsMarket[];
  readonly availability: readonly CanonicalAvailabilityEntry[];
  readonly lineups: readonly CanonicalLineup[];
}

export interface CanonicalMatchSnapshot {
  readonly snapshotId: string;
  readonly generatedAt: string;
  readonly sourceBatchIds: readonly string[];
  readonly matches: readonly CanonicalMatch[];
}

export interface CanonicalizationResult {
  readonly insertedCompetitions: number;
  readonly insertedTeams: number;
  readonly insertedPlayers: number;
  readonly upsertedMatches: number;
  readonly upsertedMarkets: number;
  readonly upsertedAvailabilityEntries: number;
  readonly upsertedLineups: number;
  readonly snapshot: CanonicalMatchSnapshot;
}
