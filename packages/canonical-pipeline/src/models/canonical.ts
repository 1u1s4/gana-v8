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
  readonly upsertedMatches: number;
  readonly upsertedMarkets: number;
  readonly snapshot: CanonicalMatchSnapshot;
}
