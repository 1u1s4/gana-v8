import process from "node:process";
import { readFile } from "node:fs/promises";

import { createPrismaClient, assertSchemaReadiness } from "../packages/storage-adapters/dist/src/index.js";
import { TOP_FOOTBALL_LEAGUES, resolveTopFootballMarketKeys } from "./top-football-leagues.mjs";

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

const main = async () => {
  const dotenv = await readDotenv(new URL("../.env", import.meta.url).pathname);
  const databaseUrl = dotenv.GANA_DATABASE_URL ?? dotenv.DATABASE_URL ?? process.env.GANA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL or GANA_DATABASE_URL is required");

  const env = {
    ...dotenv,
    ...process.env,
    DATABASE_URL: databaseUrl,
    GANA_RUNTIME_PROFILE: process.env.GANA_RUNTIME_PROFILE ?? dotenv.GANA_RUNTIME_PROFILE ?? "production",
    GANA_DEMO_MODE: process.env.GANA_DEMO_MODE ?? dotenv.GANA_DEMO_MODE ?? "false",
    GANA_DRY_RUN: process.env.GANA_DRY_RUN ?? dotenv.GANA_DRY_RUN ?? "false",
  };

  assertSchemaReadiness({ env });
  const prisma = createPrismaClient(databaseUrl);
  const now = new Date();
  const enableCorners = ["1", "true", "yes"].includes(
    String(env.GANA_ENABLE_CORNERS_MARKETS ?? "").trim().toLowerCase(),
  );
  const marketsAllowed = resolveTopFootballMarketKeys({ enableCorners });

  try {
    const results = [];
    for (const league of TOP_FOOTBALL_LEAGUES) {
      const row = await prisma.leagueCoveragePolicy.upsert({
        where: {
          provider_leagueKey_season: {
            provider: league.provider,
            leagueKey: league.leagueKey,
            season: league.season,
          },
        },
        create: {
          id: `league-policy:${league.provider}:${league.leagueKey}:${league.season}`,
          provider: league.provider,
          leagueKey: league.leagueKey,
          leagueName: league.leagueName,
          season: league.season,
          enabled: true,
          alwaysOn: true,
          priority: league.priority,
          marketsAllowed,
          notes: enableCorners
            ? "Top European league tracked for live multi-market analysis, including experimental corners."
            : "Top European league tracked for live multi-market analysis.",
          createdAt: now,
          updatedAt: now,
        },
        update: {
          leagueName: league.leagueName,
          enabled: true,
          alwaysOn: true,
          priority: league.priority,
          marketsAllowed,
          notes: enableCorners
            ? "Top European league tracked for live multi-market analysis, including experimental corners."
            : "Top European league tracked for live multi-market analysis.",
          updatedAt: now,
        },
      });
      results.push({
        id: row.id,
        provider: row.provider,
        leagueKey: row.leagueKey,
        leagueName: row.leagueName,
        season: row.season,
        enabled: row.enabled,
        alwaysOn: row.alwaysOn,
        priority: row.priority,
        marketsAllowed: row.marketsAllowed,
      });
    }

    console.log(JSON.stringify({ seeded: results.length, leagues: results }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

await main();
