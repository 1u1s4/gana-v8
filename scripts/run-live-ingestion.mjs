import process from "node:process";
import { readFile } from "node:fs/promises";

import { runLiveIngestion } from "../apps/ingestion-worker/dist/src/index.js";
import { createPrismaClient, assertSchemaReadiness } from "../packages/storage-adapters/dist/src/index.js";

const readDotenv = async (path) => {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return acc;
      }
      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        return acc;
      }
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
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

const parseCsv = (value) =>
  value
    ? value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : undefined;

const parseWindow = (prefix, env) => {
  const start = firstDefined(env[`${prefix}_START`]);
  const end = firstDefined(env[`${prefix}_END`]);
  const granularity = firstDefined(env[`${prefix}_GRANULARITY`]);

  if (!start && !end && !granularity) {
    return undefined;
  }

  if (!start || !end) {
    throw new Error(`${prefix}_START and ${prefix}_END must be provided together`);
  }

  return {
    end,
    granularity: granularity ?? (prefix.includes("ODDS") ? "intraday" : "daily"),
    start,
  };
};

const main = async () => {
  const argvMode = process.argv[2] ?? "both";
  if (!["fixtures", "odds", "both"].includes(argvMode)) {
    throw new Error(`Unsupported mode ${process.argv[2] ?? ""}. Use fixtures|odds|both`);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const dotenv = await readDotenv(new URL("../.env", import.meta.url).pathname);
  const preferredDatabaseUrl =
    dotenv.GANA_DATABASE_URL ??
    dotenv.DATABASE_URL ??
    process.env.GANA_DATABASE_URL ??
    process.env.DATABASE_URL;

  const env = {
    ...dotenv,
    ...process.env,
    ...(preferredDatabaseUrl ? { DATABASE_URL: preferredDatabaseUrl } : {}),
    GANA_RUNTIME_PROFILE: process.env.GANA_RUNTIME_PROFILE ?? dotenv.GANA_RUNTIME_PROFILE ?? "production",
    GANA_PROVIDER_SOURCE: process.env.GANA_PROVIDER_SOURCE ?? dotenv.GANA_PROVIDER_SOURCE ?? "live-readonly",
    GANA_PROVIDER_BASE_URL:
      process.env.GANA_PROVIDER_BASE_URL ??
      dotenv.GANA_PROVIDER_BASE_URL ??
      "https://v3.football.api-sports.io",
    GANA_API_FOOTBALL_HOST:
      process.env.GANA_API_FOOTBALL_HOST ??
      dotenv.GANA_API_FOOTBALL_HOST ??
      dotenv.API_FOOTBALL_HOST ??
      "v3.football.api-sports.io",
    GANA_DRY_RUN: process.env.GANA_DRY_RUN ?? dotenv.GANA_DRY_RUN ?? "false",
    GANA_DEMO_MODE: process.env.GANA_DEMO_MODE ?? dotenv.GANA_DEMO_MODE ?? "false",
  };

  const databaseUrl = env.DATABASE_URL ?? env.GANA_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or GANA_DATABASE_URL is required");
  }

  const apiKey = env.GANA_API_FOOTBALL_KEY ?? env.API_FOOTBALL_KEY ?? env.APIFOOTBALL_API_KEY ?? env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error("Missing API-Football key for live ingestion");
  }

  assertSchemaReadiness({ env });

  const prisma = createPrismaClient(databaseUrl);

  try {
    const rawSeason = process.env.GANA_FOOTBALL_SEASON ?? dotenv.GANA_FOOTBALL_SEASON;
    const rawMarketKeys = process.env.GANA_FOOTBALL_MARKET_KEYS ?? dotenv.GANA_FOOTBALL_MARKET_KEYS;
    const summary = await runLiveIngestion({
      env,
      fixturesWindow: parseWindow("GANA_FOOTBALL_FIXTURES_WINDOW", env),
      league: process.env.GANA_FOOTBALL_LEAGUE ?? dotenv.GANA_FOOTBALL_LEAGUE,
      ...(rawSeason ? { season: Number(rawSeason) } : {}),
      ...(parseCsv(process.env.GANA_LIVE_ODDS_FIXTURE_IDS ?? dotenv.GANA_LIVE_ODDS_FIXTURE_IDS)
        ? { oddsFixtureIds: parseCsv(process.env.GANA_LIVE_ODDS_FIXTURE_IDS ?? dotenv.GANA_LIVE_ODDS_FIXTURE_IDS) }
        : {}),
      ...(parseCsv(rawMarketKeys)
        ? { marketKeys: parseCsv(rawMarketKeys) }
        : {}),
      mode: argvMode,
      now: () => now,
      oddsWindow: parseWindow("GANA_FOOTBALL_ODDS_WINDOW", env),
      prismaClient: prisma,
      provider: {
        ...(env.GANA_PROVIDER_SOURCE ? { source: env.GANA_PROVIDER_SOURCE } : {}),
        ...(env.GANA_PROVIDER_BASE_URL ? { baseUrl: env.GANA_PROVIDER_BASE_URL } : {}),
        ...(env.GANA_API_FOOTBALL_HOST ? { host: env.GANA_API_FOOTBALL_HOST } : {}),
        ...(env.GANA_API_FOOTBALL_TIMEOUT_MS ? { timeoutMs: Number(env.GANA_API_FOOTBALL_TIMEOUT_MS) } : {}),
      },
    });

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

await main();
