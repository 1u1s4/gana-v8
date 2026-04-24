export const TOP_FOOTBALL_LEAGUES = [
  {
    provider: "api-football",
    leagueKey: "39",
    leagueName: "Premier League",
    season: 2025,
    priority: 100,
  },
  {
    provider: "api-football",
    leagueKey: "140",
    leagueName: "La Liga",
    season: 2025,
    priority: 90,
  },
  {
    provider: "api-football",
    leagueKey: "135",
    leagueName: "Serie A",
    season: 2025,
    priority: 80,
  },
  {
    provider: "api-football",
    leagueKey: "78",
    leagueName: "Bundesliga",
    season: 2025,
    priority: 70,
  },
  {
    provider: "api-football",
    leagueKey: "61",
    leagueName: "Ligue 1",
    season: 2025,
    priority: 60,
  },
];

export const TOP_FOOTBALL_LEAGUE_KEYS = TOP_FOOTBALL_LEAGUES.map((league) => league.leagueKey);

export const TOP_FOOTBALL_BASE_MARKETS = [
  "h2h",
  "totals-goals",
  "both-teams-score",
  "double-chance",
];

export const TOP_FOOTBALL_EXPERIMENTAL_MARKETS = ["corners-total"];

export const isExperimentalCornersMarketsEnabled = (value) => value === "1";

export const resolveTopFootballMarketKeys = ({ enableCorners = false } = {}) => [
  ...TOP_FOOTBALL_BASE_MARKETS,
  ...(enableCorners ? TOP_FOOTBALL_EXPERIMENTAL_MARKETS : []),
];
