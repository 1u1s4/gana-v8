import assert from "node:assert/strict";
import test from "node:test";

import { ApiFootballHttpClient, ApiFootballProviderError } from "../src/clients/api-football.js";

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
  });

test("ApiFootballHttpClient maps fixtures window responses into raw fixture records", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async (url, init) => {
      requests.push({ init, url });

      return createJsonResponse({
        response: [
          {
            fixture: {
              date: "2026-04-15T19:00:00.000Z",
              id: 123,
              status: {
                short: "NS",
              },
            },
            league: {
              country: "England",
              id: 39,
              name: "Premier League",
              season: 2026,
            },
            teams: {
              away: {
                code: "ARS",
                id: 42,
                name: "Arsenal",
              },
              home: {
                code: "CHE",
                id: 41,
                name: "Chelsea",
              },
            },
            update: "2026-04-15T18:00:00.000Z",
          },
        ],
      });
    },
  });

  const records = await client.fetchFixturesWindow({
    league: "39",
    season: 2026,
    window: {
      end: "2026-04-16T00:00:00.000Z",
      granularity: "daily",
      start: "2026-04-15T00:00:00.000Z",
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerFixtureId, "123");
  assert.equal(records[0]?.competition.providerCompetitionId, "39");
  assert.equal(records[0]?.homeTeam.shortName, "CHE");
  assert.equal(records[0]?.status, "scheduled");
  assert.equal(requests.length, 1);
  assert.match(requests[0]!.url, /fixtures\?from=2026-04-15/);
  assert.match(requests[0]!.url, /to=2026-04-16/);
  assert.match(requests[0]!.url, /league=39/);
  assert.match(requests[0]!.url, /season=2026/);
  assert.equal((requests[0]!.init?.headers as Record<string, string>)["x-apisports-key"], "test-key");
});

test("ApiFootballHttpClient falls back to date-based fixture polling when league is not provided", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async (url, init) => {
      requests.push({ init, url });
      return createJsonResponse({ response: [] });
    },
  });

  const records = await client.fetchFixturesWindow({
    window: {
      end: "2026-04-16T23:59:59.000Z",
      granularity: "daily",
      start: "2026-04-15T00:00:00.000Z",
    },
  });

  assert.equal(records.length, 0);
  assert.equal(requests.length, 2);
  assert.match(requests[0]!.url, /fixtures\?date=2026-04-15/);
  assert.match(requests[1]!.url, /fixtures\?date=2026-04-16/);
});

test("ApiFootballHttpClient maps finished fixture scores from provider goals", async () => {
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async () =>
      createJsonResponse({
        response: [
          {
            fixture: {
              date: "2026-04-15T19:00:00.000Z",
              id: 456,
              status: {
                short: "FT",
              },
            },
            goals: {
              away: 1,
              home: 2,
            },
            league: {
              id: 39,
              name: "Premier League",
            },
            teams: {
              away: {
                id: 42,
                name: "Arsenal",
              },
              home: {
                id: 41,
                name: "Chelsea",
              },
            },
          },
        ],
      }),
  });

  const records = await client.fetchFixturesWindow({
    league: "39",
    window: {
      end: "2026-04-16T00:00:00.000Z",
      granularity: "daily",
      start: "2026-04-15T00:00:00.000Z",
    },
  });

  assert.equal(records[0]?.status, "finished");
  assert.deepEqual(records[0]?.score, { home: 2, away: 1 });
});

test("ApiFootballHttpClient maps and filters odds window responses", async () => {
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async (url) => {
      assert.match(url, /odds\?fixture=123/);

      return createJsonResponse({
        response: [
          {
            bookmakers: [
              {
                bets: [
                  {
                    id: 1,
                    name: "Match Winner",
                    values: [
                      { odd: "2.10", value: "Home" },
                      { odd: "3.40", value: "Draw" },
                      { odd: "3.20", value: "Away" },
                    ],
                  },
                  {
                    id: 5,
                    name: "Goals Over/Under",
                    values: [{ odd: "1.90", value: "Over 2.5" }],
                  },
                ],
                id: 8,
                name: "Bet365",
              },
            ],
            fixture: {
              id: 123,
            },
            teams: {
              away: { name: "Arsenal" },
              home: { name: "Chelsea" },
            },
            update: "2026-04-15T18:05:00.000Z",
          },
        ],
      });
    },
  });

  const records = await client.fetchOddsWindow({
    fixtureIds: ["123"],
    marketKeys: ["h2h"],
    window: {
      end: "2026-04-15T13:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T12:00:00.000Z",
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.bookmakerKey, "bet365");
  assert.equal(records[0]?.marketKey, "h2h");
  assert.deepEqual(records[0]?.selections.map((selection) => selection.key), ["home", "draw", "away"]);
  assert.deepEqual(records[0]?.selections.map((selection) => selection.priceDecimal), [2.1, 3.4, 3.2]);
});

test("ApiFootballHttpClient maps canonical market keys and market-aware selections", async () => {
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async () =>
      createJsonResponse({
        response: [
          {
            bookmakers: [
              {
                bets: [
                  {
                    id: 5,
                    name: "Goals Over/Under",
                    values: [
                      { odd: "1.90", value: "Over 2.5" },
                      { odd: "1.95", value: "Under 2.5" },
                    ],
                  },
                  {
                    id: 8,
                    name: "Both Teams Score",
                    values: [
                      { odd: "1.75", value: "Yes" },
                      { odd: "2.05", value: "No" },
                    ],
                  },
                  {
                    id: 12,
                    name: "Double Chance",
                    values: [
                      { odd: "1.30", value: "1X" },
                      { odd: "1.25", value: "12" },
                      { odd: "1.60", value: "X2" },
                    ],
                  },
                  {
                    id: 45,
                    name: "Corners Over Under",
                    values: [
                      { odd: "1.88", value: "Over 8.5" },
                      { odd: "1.92", value: "Under 8.5" },
                    ],
                  },
                ],
                id: 8,
                name: "Bet365",
              },
            ],
            fixture: {
              id: 123,
            },
            teams: {
              away: { name: "Arsenal" },
              home: { name: "Chelsea" },
            },
            update: "2026-04-15T18:05:00.000Z",
          },
        ],
      }),
  });

  const records = await client.fetchOddsWindow({
    fixtureIds: ["123"],
    marketKeys: ["totals-goals", "both-teams-score", "double-chance", "corners-total"],
    window: {
      end: "2026-04-15T13:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T12:00:00.000Z",
    },
  });

  const recordsByMarket = new Map(records.map((record) => [record.marketKey, record]));

  assert.deepEqual(
    records.map((record) => record.marketKey),
    ["totals-goals", "both-teams-score", "double-chance", "corners-total"],
  );
  assert.deepEqual(recordsByMarket.get("totals-goals")?.selections.map((selection) => selection.key), [
    "over",
    "under",
  ]);
  assert.deepEqual(recordsByMarket.get("both-teams-score")?.selections.map((selection) => selection.key), [
    "yes",
    "no",
  ]);
  assert.deepEqual(recordsByMarket.get("double-chance")?.selections.map((selection) => selection.key), [
    "home-draw",
    "home-away",
    "draw-away",
  ]);
  assert.deepEqual(recordsByMarket.get("corners-total")?.selections.map((selection) => selection.key), [
    "over",
    "under",
  ]);
});

test("ApiFootballHttpClient still accepts legacy provider market filters", async () => {
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async () =>
      createJsonResponse({
        response: [
          {
            bookmakers: [
              {
                bets: [
                  {
                    id: 5,
                    name: "Goals Over/Under",
                    values: [{ odd: "1.90", value: "Over 2.5" }],
                  },
                ],
                id: 8,
                name: "Bet365",
              },
            ],
            fixture: {
              id: 123,
            },
            teams: {
              away: { name: "Arsenal" },
              home: { name: "Chelsea" },
            },
          },
        ],
      }),
  });

  const records = await client.fetchOddsWindow({
    fixtureIds: ["123"],
    marketKeys: ["5-goals-over-under"],
    window: {
      end: "2026-04-15T13:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T12:00:00.000Z",
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.marketKey, "totals-goals");
});

test("ApiFootballHttpClient maps availability window responses into raw availability records", async () => {
  const requests: string[] = [];
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async (url) => {
      requests.push(String(url));

      return createJsonResponse({
        response: [
          {
            fixture: {
              id: 123,
            },
            player: {
              id: 9001,
              name: "Reece James",
              number: 24,
              pos: "D",
            },
            reason: "Hamstring discomfort",
            team: {
              code: "CHE",
              id: 41,
              name: "Chelsea",
            },
            type: "Doubtful",
            update: "2026-04-15T17:55:00.000Z",
          },
          {
            fixture: {
              id: 999,
            },
            player: {
              id: 9002,
              name: "Other Player",
            },
            reason: "Suspended 1 match",
            team: {
              id: 55,
              name: "Other Team",
            },
            type: "Suspension",
          },
        ],
      });
    },
  });

  const records = await client.fetchAvailabilityWindow({
    fixtureIds: ["123"],
    teamIds: ["41"],
    window: {
      end: "2026-04-15T20:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerFixtureId, "123");
  assert.equal(records[0]?.team.providerTeamId, "41");
  assert.equal(records[0]?.player.providerPlayerId, "9001");
  assert.equal(records[0]?.status, "doubtful");
  assert.equal(records[0]?.reasonCode, "hamstring-discomfort");
  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /injuries\?fixture=123/);
});

test("ApiFootballHttpClient maps fixture lineups into raw lineup records", async () => {
  const requests: string[] = [];
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async (url) => {
      requests.push(String(url));

      return createJsonResponse({
        response: [
          {
            formation: "4-3-3",
            startXI: [
              {
                player: {
                  grid: "1:1",
                  id: 100,
                  name: "David Raya",
                  number: 22,
                  pos: "G",
                },
              },
            ],
            substitutes: [
              {
                player: {
                  id: 101,
                  name: "Leandro Trossard",
                  number: 19,
                  pos: "F",
                },
              },
            ],
            team: {
              code: "ARS",
              id: 42,
              name: "Arsenal",
            },
            update: "2026-04-15T18:25:00.000Z",
          },
        ],
      });
    },
  });

  const records = await client.fetchLineupsWindow({
    fixtureIds: ["123"],
    teamIds: ["42"],
    window: {
      end: "2026-04-15T19:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T18:00:00.000Z",
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.providerFixtureId, "123");
  assert.equal(records[0]?.team.providerTeamId, "42");
  assert.equal(records[0]?.status, "confirmed");
  assert.equal(records[0]?.formation, "4-3-3");
  assert.deepEqual(records[0]?.players.map((player) => player.role), ["starter", "bench"]);
  assert.equal(records[0]?.players[0]?.positionSlot, "1:1");
  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /fixtures\/lineups\?fixture=123/);
});

test("ApiFootballHttpClient maps fixture statistics Corner Kicks into corners scopes", async () => {
  const requests: string[] = [];
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async (url) => {
      requests.push(String(url));

      return createJsonResponse({
        response: [
          {
            statistics: [
              { type: "Shots on Goal", value: 4 },
              { type: "Corner Kicks", value: 6 },
            ],
            team: {
              code: "CHE",
              id: 41,
              name: "Chelsea",
            },
          },
          {
            statistics: [
              { type: "Shots on Goal", value: 3 },
              { type: "Corner Kicks", value: "3" },
            ],
            team: {
              code: "ARS",
              id: 42,
              name: "Arsenal",
            },
          },
        ],
      });
    },
  });

  const records = await client.fetchFixtureStatistics({
    fixtureIds: ["123"],
    window: {
      end: "2026-04-15T21:00:00.000Z",
      granularity: "intraday",
      start: "2026-04-15T19:00:00.000Z",
    },
  });
  const corners = records.filter((record) => record.statKey === "corners");

  assert.equal(requests.length, 1);
  assert.match(requests[0] ?? "", /fixtures\/statistics\?fixture=123/);
  assert.deepEqual(
    corners.map((record) => [record.scope, record.valueNumeric]),
    [
      ["home", 6],
      ["away", 3],
      ["match", 9],
    ],
  );
  assert.ok(corners.every((record) => record.recordType === "fixture-statistic"));
});

test("ApiFootballHttpClient rejects provider-level errors with structured metadata", async () => {
  const client = new ApiFootballHttpClient({
    apiKey: "test-key",
    baseUrl: "https://example.test/v3",
    fetchImpl: async () =>
      createJsonResponse({
        errors: {
          token: "invalid",
        },
        response: [],
      }),
  });

  await assert.rejects(
    () =>
      client.fetchFixturesWindow({
        window: {
          end: "2026-04-16T00:00:00.000Z",
          granularity: "daily",
          start: "2026-04-15T00:00:00.000Z",
        },
      }),
    (error) => {
      assert.ok(error instanceof ApiFootballProviderError);
      assert.equal(error.category, "provider-envelope");
      assert.equal(error.provider, "api-football");
      assert.equal(error.endpoint, "fixtures");
      assert.equal(error.retriable, false);
      assert.deepEqual(error.providerErrors, { token: "invalid" });
      assert.match(error.message, /API-Football returned errors/);
      return true;
    },
  );
});
