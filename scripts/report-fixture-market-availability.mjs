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

const CANONICAL_MARKET_KEYS = new Set([
  "h2h",
  "totals-goals",
  "both-teams-score",
  "double-chance",
  "corners-total",
  "corners-h2h",
]);

const MARKET_LINE_REQUIRED_KEYS = new Set(["totals-goals", "corners-total"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const asProviderValue = (value) => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const readProviderBetDescriptor = (payload) => {
  if (!isRecord(payload) || !isRecord(payload.bet)) {
    return { id: null, name: null };
  }

  return {
    id: asProviderValue(payload.bet.id),
    name: asProviderValue(payload.bet.name),
  };
};

const extractContextualLine = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const patterns = [
    /\bover\b[\s:,-]*(?:\(?\s*)?(\d+(?:[.,]\d+)?)\b/i,
    /\bunder\b[\s:,-]*(?:\(?\s*)?(\d+(?:[.,]\d+)?)\b/i,
    /\bover\s*[/\\-]\s*under\b[\s:,-]*(?:\(?\s*)?(\d+(?:[.,]\d+)?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const line = Number(match[1].replace(",", "."));
    if (Number.isFinite(line)) {
      return Number(line.toFixed(4));
    }
  }

  return null;
};

const lineRangeForMarket = (marketKey) => {
  if (marketKey === "totals-goals") {
    return { min: 0.25, max: 12.5 };
  }

  if (marketKey === "corners-total") {
    return { min: 0.25, max: 30.5 };
  }

  return null;
};

const isValidLineIncrement = (line) => {
  const quarterUnits = line * 4;
  return Math.abs(quarterUnits - Math.round(quarterUnits)) < 0.0001;
};

const scoreabilityForMarket = (marketKey, snapshots) => {
  if (!MARKET_LINE_REQUIRED_KEYS.has(marketKey)) {
    return {
      reason: "Market does not require a market line.",
      scoreable: snapshots.length > 0,
    };
  }

  const range = lineRangeForMarket(marketKey);
  const linesByOutcome = new Map();

  for (const snapshot of snapshots) {
    for (const selection of snapshot.selections ?? []) {
      const outcome = selection.selectionKey;
      if (outcome !== "over" && outcome !== "under") {
        continue;
      }

      const line = extractContextualLine(selection.label) ?? extractContextualLine(selection.selectionKey);
      if (
        line === null ||
        !isValidLineIncrement(line) ||
        (range && (line < range.min || line > range.max))
      ) {
        continue;
      }

      const existing = linesByOutcome.get(outcome) ?? new Set();
      existing.add(line);
      linesByOutcome.set(outcome, existing);
    }
  }

  const overLines = linesByOutcome.get("over") ?? new Set();
  const underLines = linesByOutcome.get("under") ?? new Set();
  const sharedLines = [...overLines].filter((line) => underLines.has(line));

  if (sharedLines.length !== 1 || overLines.size !== 1 || underLines.size !== 1) {
    return {
      reason: "Market line is missing or ambiguous.",
      scoreable: false,
    };
  }

  return {
    line: sharedLines[0],
    reason: `Market line ${sharedLines[0]} is available for over and under selections.`,
    scoreable: true,
  };
};

const summarizeFixture = (input, fixture, expectedMarkets, snapshots) => {
  const marketGroups = new Map();
  const bookmakers = new Set();

  for (const snapshot of snapshots) {
    bookmakers.add(snapshot.bookmakerKey);
    const providerBet = readProviderBetDescriptor(snapshot.payload);
    const group = marketGroups.get(snapshot.marketKey) ?? {
      bookmakers: new Set(),
      capturedAt: [],
      marketKey: snapshot.marketKey,
      providerMarketIds: new Set(),
      providerMarketNames: new Set(),
      snapshots: [],
      selectionCount: 0,
      snapshotCount: 0,
    };
    group.bookmakers.add(snapshot.bookmakerKey);
    group.capturedAt.push(snapshot.capturedAt);
    if (providerBet.id) group.providerMarketIds.add(providerBet.id);
    if (providerBet.name) group.providerMarketNames.add(providerBet.name);
    group.snapshots.push(snapshot);
    group.selectionCount += snapshot.selections?.length ?? snapshot._count.selections;
    group.snapshotCount += 1;
    marketGroups.set(snapshot.marketKey, group);
  }

  const availableMarkets = [...marketGroups.keys()].sort();
  const marketSummaries = [...marketGroups.values()]
    .map((group) => ({
      marketKey: group.marketKey,
      snapshotCount: group.snapshotCount,
      bookmakers: [...group.bookmakers].sort(),
      selectionCount: group.selectionCount,
      capturedAtLatest: maxIso(group.capturedAt),
      scoreability: scoreabilityForMarket(group.marketKey, group.snapshots),
    }))
    .sort((left, right) => left.marketKey.localeCompare(right.marketKey));
  const providerSpecificMarkets = [...marketGroups.values()]
    .filter((group) => !CANONICAL_MARKET_KEYS.has(group.marketKey))
    .map((group) => ({
      marketKey: group.marketKey,
      providerMarketIds: [...group.providerMarketIds].sort(),
      providerMarketNames: [...group.providerMarketNames].sort(),
      snapshotCount: group.snapshotCount,
      bookmakers: [...group.bookmakers].sort(),
      selectionCount: group.selectionCount,
      capturedAtLatest: maxIso(group.capturedAt),
    }))
    .sort((left, right) => left.marketKey.localeCompare(right.marketKey));

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
    markets: marketSummaries,
    providerSpecificMarkets,
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
          payload: true,
          providerFixtureId: true,
          selections: {
            select: {
              label: true,
              selectionKey: true,
            },
          },
        },
      }),
    ]);

    snapshots.sort((left, right) => {
      const providerFixtureCompare = left.providerFixtureId.localeCompare(right.providerFixtureId);
      if (providerFixtureCompare !== 0) {
        return providerFixtureCompare;
      }

      const marketCompare = left.marketKey.localeCompare(right.marketKey);
      if (marketCompare !== 0) {
        return marketCompare;
      }

      return toIso(right.capturedAt).localeCompare(toIso(left.capturedAt));
    });

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
