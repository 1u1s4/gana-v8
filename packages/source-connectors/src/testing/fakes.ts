import type {
  FetchAvailabilityWindowInput,
  FetchFixturesWindowInput,
  FetchLineupsWindowInput,
  FetchOddsWindowInput,
  FootballApiClient,
  RawAvailabilityRecord,
  RawFixtureRecord,
  RawLineupRecord,
  RawOddsMarketRecord,
} from "../models/raw.js";

export class FakeFootballApiClient implements FootballApiClient {
  constructor(
    private readonly fixtures: readonly RawFixtureRecord[],
    private readonly odds: readonly RawOddsMarketRecord[],
    private readonly availability: readonly RawAvailabilityRecord[] = sampleAvailability(),
    private readonly lineups: readonly RawLineupRecord[] = sampleLineups(),
  ) {}

  async fetchFixturesWindow(_input: FetchFixturesWindowInput): Promise<readonly RawFixtureRecord[]> {
    return this.fixtures;
  }

  async fetchOddsWindow(_input: FetchOddsWindowInput): Promise<readonly RawOddsMarketRecord[]> {
    return this.odds;
  }

  async fetchAvailabilityWindow(_input: FetchAvailabilityWindowInput): Promise<readonly RawAvailabilityRecord[]> {
    return this.availability;
  }

  async fetchLineupsWindow(_input: FetchLineupsWindowInput): Promise<readonly RawLineupRecord[]> {
    return this.lineups;
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

export const sampleAvailability = (): readonly RawAvailabilityRecord[] => [
  {
    confidenceScore: 0.92,
    payload: {
      reason: "Hamstring discomfort",
      type: "Injury",
    },
    player: {
      name: "Reece James",
      position: "D",
      providerPlayerId: "player-che-24",
      shirtNumber: 24,
      shortName: "R. James",
    },
    providerCode: "api-football",
    providerFixtureId: "fix-100",
    reasonCode: "hamstring_discomfort",
    recordType: "availability",
    sourceUpdatedAt: "2026-04-14T19:55:00.000Z",
    status: "doubtful",
    team: {
      country: "England",
      name: "Chelsea",
      providerTeamId: "che",
      shortName: "CHE",
    },
  },
  {
    confidenceScore: 0.97,
    payload: {
      reason: "Suspended 1 match",
      type: "Suspension",
    },
    player: {
      name: "Declan Rice",
      position: "M",
      providerPlayerId: "player-ars-41",
      shirtNumber: 41,
      shortName: "D. Rice",
    },
    providerCode: "api-football",
    providerFixtureId: "fix-100",
    reasonCode: "suspended_one_match",
    recordType: "availability",
    sourceUpdatedAt: "2026-04-14T19:58:00.000Z",
    status: "suspended",
    team: {
      country: "England",
      name: "Arsenal",
      providerTeamId: "ars",
      shortName: "ARS",
    },
  },
];

export const sampleLineups = (): readonly RawLineupRecord[] => [
  {
    formation: "4-2-3-1",
    payload: {
      coach: "Chelsea Coach",
    },
    players: [
      {
        player: {
          name: "Robert Sanchez",
          position: "G",
          providerPlayerId: "player-che-1",
          shirtNumber: 1,
        },
        position: "G",
        positionSlot: "1:1",
        role: "starter",
      },
      {
        player: {
          name: "Nicolas Jackson",
          position: "F",
          providerPlayerId: "player-che-15",
          shirtNumber: 15,
        },
        position: "F",
        positionSlot: "4:2",
        role: "starter",
      },
      {
        player: {
          name: "Mykhailo Mudryk",
          position: "F",
          providerPlayerId: "player-che-10",
          shirtNumber: 10,
        },
        position: "F",
        role: "bench",
      },
    ],
    providerCode: "api-football",
    providerFixtureId: "fix-100",
    recordType: "lineup",
    sourceConfidence: 1,
    sourceUpdatedAt: "2026-04-15T18:25:00.000Z",
    status: "confirmed",
    team: {
      country: "England",
      name: "Chelsea",
      providerTeamId: "che",
      shortName: "CHE",
    },
  },
  {
    formation: "4-3-3",
    payload: {
      coach: "Arsenal Coach",
    },
    players: [
      {
        player: {
          name: "David Raya",
          position: "G",
          providerPlayerId: "player-ars-22",
          shirtNumber: 22,
        },
        position: "G",
        positionSlot: "1:1",
        role: "starter",
      },
      {
        player: {
          name: "Bukayo Saka",
          position: "F",
          providerPlayerId: "player-ars-7",
          shirtNumber: 7,
        },
        position: "F",
        positionSlot: "3:3",
        role: "starter",
      },
      {
        player: {
          name: "Leandro Trossard",
          position: "F",
          providerPlayerId: "player-ars-19",
          shirtNumber: 19,
        },
        position: "F",
        role: "bench",
      },
    ],
    providerCode: "api-football",
    providerFixtureId: "fix-100",
    recordType: "lineup",
    sourceConfidence: 1,
    sourceUpdatedAt: "2026-04-15T18:25:00.000Z",
    status: "confirmed",
    team: {
      country: "England",
      name: "Arsenal",
      providerTeamId: "ars",
      shortName: "ARS",
    },
  },
];
