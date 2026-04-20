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
