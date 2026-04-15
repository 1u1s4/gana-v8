import type {
  FetchFixturesWindowInput,
  FetchOddsWindowInput,
  FootballApiClient,
  RawFixtureRecord,
  RawOddsMarketRecord,
} from "../models/raw.js";

export class FakeFootballApiClient implements FootballApiClient {
  constructor(
    private readonly fixtures: readonly RawFixtureRecord[],
    private readonly odds: readonly RawOddsMarketRecord[],
  ) {}

  async fetchFixturesWindow(_input: FetchFixturesWindowInput): Promise<readonly RawFixtureRecord[]> {
    return this.fixtures;
  }

  async fetchOddsWindow(_input: FetchOddsWindowInput): Promise<readonly RawOddsMarketRecord[]> {
    return this.odds;
  }
}

export const sampleFixtures = (): readonly RawFixtureRecord[] => [
  {
    competition: {
      country: "England",
      name: "Premier League",
      providerCompetitionId: "pl-2026",
      season: "2026",
    },
    awayTeam: {
      country: "England",
      name: "Arsenal",
      providerTeamId: "ars",
      shortName: "ARS",
    },
    homeTeam: {
      country: "England",
      name: "Chelsea",
      providerTeamId: "che",
      shortName: "CHE",
    },
    payload: {
      fixtureId: "fix-100",
      round: "34",
    },
    providerCode: "api-football",
    providerFixtureId: "fix-100",
    recordType: "fixture",
    scheduledAt: "2026-04-15T19:00:00.000Z",
    sourceUpdatedAt: "2026-04-14T20:00:00.000Z",
    status: "scheduled",
  },
];

export const sampleOdds = (): readonly RawOddsMarketRecord[] => [
  {
    bookmakerKey: "bet365",
    marketKey: "h2h",
    payload: {
      bookmaker: "Bet365",
    },
    providerCode: "api-football",
    providerFixtureId: "fix-100",
    recordType: "odds",
    selections: [
      { key: "home", label: "Chelsea", priceDecimal: 2.1 },
      { key: "draw", label: "Draw", priceDecimal: 3.4 },
      { key: "away", label: "Arsenal", priceDecimal: 3.2 },
    ],
    sourceUpdatedAt: "2026-04-14T20:05:00.000Z",
  },
];
