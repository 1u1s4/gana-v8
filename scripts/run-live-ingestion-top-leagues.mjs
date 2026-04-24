import process from "node:process";
import { readFile } from "node:fs/promises";

import { runLiveIngestion } from "../apps/ingestion-worker/dist/src/index.js";
import { createPrismaClient, assertSchemaReadiness } from "../packages/storage-adapters/dist/src/index.js";
import { TOP_FOOTBALL_LEAGUES } from "./top-football-leagues.mjs";

const readDotenv = async (path) => {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const separator = trimmed.indexOf("=");
      if (separator === -1) return acc;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      acc[key] = value;
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const firstDefined = (...values) => values.find((value) => typeof value === "string" && value.trim().length > 0);

const parseWindow = (prefix, env) => {
  const start = firstDefined(env[`${prefix}_START`]);
  const end = firstDefined(env[`${prefix}_END`]);
  const granularity = firstDefined(env[`${prefix}_GRANULARITY`]);
  if (!start && !end && !granularity) return undefined;
  if (!start || !end) throw new Error(`${prefix}_START and ${prefix}_END must be provided together`);
  return {
    end,
    granularity: granularity ?? (prefix.includes("ODDS") ? "intraday" : "daily"),
    start,
  };
};

const parseCsv = (value) =>
  value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : undefined;

const parseMarketKeys = (env) => parseCsv(env.GANA_FOOTBALL_MARKET_KEYS) ?? ["h2h"];

const selectLeagues = (env) => {
  const requested = parseCsv(env.GANA_FOOTBALL_LEAGUES);
  if (!requested || requested.length === 0) return TOP_FOOTBALL_LEAGUES;
  const requestedSet = new Set(requested);
  return TOP_FOOTBALL_LEAGUES.filter((league) => requestedSet.has(league.leagueKey));
};

const main = async () => {
  const mode = process.argv[2] ?? "fixtures";
  if (!["fixtures", "odds", "both"].includes(mode)) {
    throw new Error(`Unsupported mode ${mode}. Use fixtures|odds|both`);
  }

  const dotenv = await readDotenv(new URL("../.env", import.meta.url).pathname);
  const preferredDatabaseUrl = dotenv.GANA_DATABASE_URL ?? dotenv.DATABASE_URL ?? process.env.GANA_DATABASE_URL ?? process.env.DATABASE_URL;
  const env = {
    ...dotenv,
    ...process.env,
    ...(preferredDatabaseUrl ? { DATABASE_URL: preferredDatabaseUrl, GANA_DATABASE_URL: preferredDatabaseUrl } : {}),
    GANA_RUNTIME_PROFILE: process.env.GANA_RUNTIME_PROFILE ?? dotenv.GANA_RUNTIME_PROFILE ?? "production",
    GANA_PROVIDER_SOURCE: process.env.GANA_PROVIDER_SOURCE ?? dotenv.GANA_PROVIDER_SOURCE ?? "live-readonly",
    GANA_PROVIDER_BASE_URL: process.env.GANA_PROVIDER_BASE_URL ?? dotenv.GANA_PROVIDER_BASE_URL ?? "https://v3.football.api-sports.io",
    GANA_API_FOOTBALL_HOST: process.env.GANA_API_FOOTBALL_HOST ?? dotenv.GANA_API_FOOTBALL_HOST ?? dotenv.API_FOOTBALL_HOST ?? "v3.football.api-sports.io",
    GANA_DRY_RUN: process.env.GANA_DRY_RUN ?? dotenv.GANA_DRY_RUN ?? "false",
    GANA_DEMO_MODE: process.env.GANA_DEMO_MODE ?? dotenv.GANA_DEMO_MODE ?? "false",
  };

  const databaseUrl = env.GANA_DATABASE_URL ?? env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL or GANA_DATABASE_URL is required");

  const apiKey = env.GANA_API_FOOTBALL_KEY ?? env.API_FOOTBALL_KEY ?? env.APIFOOTBALL_API_KEY ?? env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error("Missing API-Football key for live ingestion");

  assertSchemaReadiness({ env });
  const prisma = createPrismaClient(databaseUrl);
  const now = new Date();
  const leagues = selectLeagues(env);
  const marketKeys = parseMarketKeys(env);

  try {
    const results = [];

    if (mode === "fixtures" || mode === "both") {
      for (const league of leagues) {
        const summary = await runLiveIngestion({
          env,
          fixturesWindow: parseWindow("GANA_FOOTBALL_FIXTURES_WINDOW", env),
          league: league.leagueKey,
          season: league.season,
          marketKeys,
          mode: "fixtures",
          now: () => now,
          prismaClient: prisma,
          provider: {
            source: env.GANA_PROVIDER_SOURCE,
            baseUrl: env.GANA_PROVIDER_BASE_URL,
            host: env.GANA_API_FOOTBALL_HOST,
            ...(env.GANA_API_FOOTBALL_TIMEOUT_MS ? { timeoutMs: Number(env.GANA_API_FOOTBALL_TIMEOUT_MS) } : {}),
          },
        });
        results.push({ league, mode: "fixtures", summary });
      }
    }

    if (mode === "odds" || mode === "both") {
      const summary = await runLiveIngestion({
        env,
        marketKeys,
        mode: "odds",
        now: () => now,
        oddsWindow: parseWindow("GANA_FOOTBALL_ODDS_WINDOW", env),
        prismaClient: prisma,
        provider: {
          source: env.GANA_PROVIDER_SOURCE,
          baseUrl: env.GANA_PROVIDER_BASE_URL,
          host: env.GANA_API_FOOTBALL_HOST,
          ...(env.GANA_API_FOOTBALL_TIMEOUT_MS ? { timeoutMs: Number(env.GANA_API_FOOTBALL_TIMEOUT_MS) } : {}),
        },
      });
      results.push({ mode: "odds", summary });
    }

    console.log(JSON.stringify({
      mode,
      marketKeys,
      ranAt: now.toISOString(),
      leagues: leagues.map((league) => ({ key: league.leagueKey, name: league.leagueName, season: league.season })),
      results,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

await main();
