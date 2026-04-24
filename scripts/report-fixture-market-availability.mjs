import process from "node:process";
import { readFile } from "node:fs/promises";

import { createPrismaClient, assertSchemaReadiness } from "../packages/storage-adapters/dist/src/index.js";
import { TOP_FOOTBALL_BASE_MARKETS } from "./top-football-leagues.mjs";

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

const parseCsv = (value) =>
  value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : undefined;

const readArgValue = (args, name) => {
  const prefixed = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefixed));
  if (inline) {
    return inline.slice(prefixed.length);
  }
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const toIso = (value) => value instanceof Date ? value.toISOString() : value;

const parseFixtureRef = (value, provider) => {
  const fullMatch = value.match(/^fixture:([^:]+):(.+)$/);
  if (fullMatch) {
    return {
      fixtureId: value,
      input: value,
      provider: fullMatch[1],
      providerFixtureId: fullMatch[2],
    };
  }

  return {
    fixtureId: `fixture:${provider}:${value}`,
    input: value,
    provider,
    providerFixtureId: value,
  };
};

const maxIso = (values) =>
  values.reduce((latest, value) => {
    const iso = toIso(value);
    if (!iso) return latest;
    return latest === null || iso > latest ? iso : latest;
  }, null);

const summarizeFixture = (input, fixture, expectedMarkets, snapshots) => {
  const marketGroups = new Map();
  const bookmakers = new Set();

  for (const snapshot of snapshots) {
    bookmakers.add(snapshot.bookmakerKey);
    const group = marketGroups.get(snapshot.marketKey) ?? {
      bookmakers: new Set(),
      capturedAt: [],
      marketKey: snapshot.marketKey,
      selectionCount: 0,
      snapshotCount: 0,
    };
    group.bookmakers.add(snapshot.bookmakerKey);
    group.capturedAt.push(snapshot.capturedAt);
    group.selectionCount += snapshot._count.selections;
    group.snapshotCount += 1;
    marketGroups.set(snapshot.marketKey, group);
  }

  const availableMarkets = [...marketGroups.keys()].sort();

  return {
    fixtureId: input.providerFixtureId,
    providerFixtureId: input.providerFixtureId,
    fixtureKey: input.fixtureId,
    match: fixture
      ? {
          awayTeam: fixture.awayTeam,
          competition: fixture.competition,
          homeTeam: fixture.homeTeam,
          scheduledAt: toIso(fixture.scheduledAt),
          status: fixture.status,
        }
      : null,
    expectedMarkets,
    availableMarkets,
    missingMarkets: expectedMarkets.filter((marketKey) => !marketGroups.has(marketKey)),
    snapshotCount: snapshots.length,
    bookmakers: [...bookmakers].sort(),
    capturedAtLatest: maxIso(snapshots.map((snapshot) => snapshot.capturedAt)),
    markets: [...marketGroups.values()]
      .map((group) => ({
        marketKey: group.marketKey,
        snapshotCount: group.snapshotCount,
        bookmakers: [...group.bookmakers].sort(),
        selectionCount: group.selectionCount,
        capturedAtLatest: maxIso(group.capturedAt),
      }))
      .sort((left, right) => left.marketKey.localeCompare(right.marketKey)),
  };
};

const main = async () => {
  const args = process.argv.slice(2);
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
  const provider = readArgValue(args, "--provider") ?? env.GANA_PROVIDER_CODE ?? "api-football";
  const fixtureRefs = parseCsv(
    readArgValue(args, "--fixture-ids") ?? env.GANA_LIVE_ODDS_FIXTURE_IDS,
  );
  const expectedMarkets = parseCsv(
    readArgValue(args, "--expected-markets") ?? env.GANA_FOOTBALL_MARKET_KEYS,
  ) ?? TOP_FOOTBALL_BASE_MARKETS;

  if (!fixtureRefs || fixtureRefs.length === 0) {
    throw new Error("Provide fixture ids with --fixture-ids 1388584,1378200 or GANA_LIVE_ODDS_FIXTURE_IDS");
  }

  assertSchemaReadiness({ env });
  const prisma = createPrismaClient(databaseUrl);
  const inputs = fixtureRefs.map((fixtureRef) => parseFixtureRef(fixtureRef, provider));

  try {
    const providerFixtureIds = [...new Set(inputs.map((input) => input.providerFixtureId))];
    const fixtureIds = [...new Set(inputs.map((input) => input.fixtureId))];
    const [fixtures, snapshots] = await Promise.all([
      prisma.fixture.findMany({
        where: {
          id: { in: fixtureIds },
        },
        select: {
          awayTeam: true,
          competition: true,
          homeTeam: true,
          id: true,
          scheduledAt: true,
          status: true,
        },
      }),
      prisma.oddsSnapshot.findMany({
        where: {
          OR: [
            { providerFixtureId: { in: providerFixtureIds } },
            { fixtureId: { in: fixtureIds } },
          ],
        },
        orderBy: [
          { providerFixtureId: "asc" },
          { marketKey: "asc" },
          { capturedAt: "desc" },
        ],
        select: {
          _count: {
            select: {
              selections: true,
            },
          },
          bookmakerKey: true,
          capturedAt: true,
          fixture: {
            select: {
              awayTeam: true,
              competition: true,
              homeTeam: true,
              id: true,
              scheduledAt: true,
              status: true,
            },
          },
          fixtureId: true,
          marketKey: true,
          providerFixtureId: true,
        },
      }),
    ]);

    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const requestedByProviderId = new Map(inputs.map((input) => [input.providerFixtureId, input]));
    const requestedByFixtureId = new Map(inputs.map((input) => [input.fixtureId, input]));
    const snapshotsByInput = new Map(inputs.map((input) => [input.input, []]));
    const fixtureByInput = new Map(inputs.map((input) => [input.input, fixtureById.get(input.fixtureId) ?? null]));

    for (const snapshot of snapshots) {
      const input = requestedByProviderId.get(snapshot.providerFixtureId) ??
        (snapshot.fixtureId ? requestedByFixtureId.get(snapshot.fixtureId) : undefined);
      if (!input) {
        continue;
      }
      snapshotsByInput.get(input.input)?.push(snapshot);
      if (snapshot.fixture && !fixtureByInput.get(input.input)) {
        fixtureByInput.set(input.input, snapshot.fixture);
      }
    }

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      provider,
      expectedMarkets,
      fixtures: inputs.map((input) =>
        summarizeFixture(
          input,
          fixtureByInput.get(input.input),
          expectedMarkets,
          snapshotsByInput.get(input.input) ?? [],
        ),
      ),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

await main();
