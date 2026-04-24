import process from "node:process";
import { readFile } from "node:fs/promises";

import { createPrismaClient, assertSchemaReadiness } from "../packages/storage-adapters/dist/src/index.js";
import {
  TOP_FOOTBALL_BASE_MARKETS,
  TOP_FOOTBALL_EXPERIMENTAL_MARKETS,
  isExperimentalCornersMarketsEnabled,
} from "./top-football-leagues.mjs";

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

const EXPERIMENTAL_CORNERS_MARKET_KEYS = new Set([
  ...TOP_FOOTBALL_EXPERIMENTAL_MARKETS,
  "corners-h2h",
]);

const MARKET_LINE_REQUIRED_KEYS = new Set(["totals-goals", "corners-total"]);

const isExperimentalCornersMarket = (marketKey) =>
  EXPERIMENTAL_CORNERS_MARKET_KEYS.has(marketKey) || marketKey.startsWith("corners-");

const partitionExpectedMarkets = (marketKeys) => ({
  baseMarkets: marketKeys.filter((marketKey) => !isExperimentalCornersMarket(marketKey)),
  experimentalMarkets: marketKeys.filter((marketKey) => isExperimentalCornersMarket(marketKey)),
});

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

const readStatisticNumber = (snapshot) =>
  typeof snapshot?.valueNumeric === "number" && Number.isFinite(snapshot.valueNumeric)
    ? snapshot.valueNumeric
    : null;

const latestStatisticByScope = (statistics, scope) => {
  const sorted = statistics
    .filter((snapshot) => snapshot.scope === scope)
    .sort((left, right) => toIso(right.capturedAt).localeCompare(toIso(left.capturedAt)));
  return sorted[0] ?? null;
};

const summarizeCornerStatistics = (statistics) => {
  const cornersStatistics = statistics.filter((snapshot) => snapshot.statKey === "corners");
  const home = latestStatisticByScope(cornersStatistics, "home");
  const away = latestStatisticByScope(cornersStatistics, "away");
  const match = latestStatisticByScope(cornersStatistics, "match");
  const homeCorners = readStatisticNumber(home);
  const awayCorners = readStatisticNumber(away);
  const matchCorners = readStatisticNumber(match);
  const statsAvailable = homeCorners !== null && awayCorners !== null;

  return {
    status: statsAvailable ? "available" : "missing",
    homeCorners,
    awayCorners,
    totalCorners: statsAvailable ? matchCorners ?? homeCorners + awayCorners : matchCorners,
    scopes: [...new Set(cornersStatistics.map((snapshot) => snapshot.scope))].sort(),
    snapshotCount: cornersStatistics.length,
    capturedAtLatest: maxIso(cornersStatistics.map((snapshot) => snapshot.capturedAt)),
  };
};

const summarizeExperimentalMarket = ({
  cornersEnabled,
  group,
  marketKey,
  statisticsSummary,
}) => {
  const snapshots = group?.snapshots ?? [];
  const scoreability = scoreabilityForMarket(marketKey, snapshots);
  const guardrailStatuses = [cornersEnabled ? "experimental-enabled" : "experimental-disabled"];

  if (marketKey === "corners-total") {
    if (!scoreability.scoreable) {
      guardrailStatuses.push("line-missing");
    }
    if (statisticsSummary.status !== "available") {
      guardrailStatuses.push("stats-missing");
    }
    if (cornersEnabled && scoreability.scoreable && statisticsSummary.status === "available") {
      guardrailStatuses.push("settlement-ready");
    }
  }

  return {
    marketKey,
    available: Boolean(group),
    snapshotCount: group?.snapshotCount ?? 0,
    bookmakers: group ? [...group.bookmakers].sort() : [],
    selectionCount: group?.selectionCount ?? 0,
    capturedAtLatest: group ? maxIso(group.capturedAt) : null,
    scoreability,
    guardrailStatus: cornersEnabled
      ? guardrailStatuses.find((status) => status !== "experimental-enabled") ?? "experimental-enabled"
      : "experimental-disabled",
    guardrailStatuses,
  };
};

const summarizeFixture = (input, fixture, expectedMarkets, snapshots, statisticSnapshots, { cornersEnabled }) => {
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

  const { baseMarkets: expectedBaseMarkets, experimentalMarkets: expectedExperimentalMarkets } =
    partitionExpectedMarkets(expectedMarkets);
  const availableBaseMarkets = [...marketGroups.keys()]
    .filter((marketKey) => !isExperimentalCornersMarket(marketKey))
    .sort();
  const availableExperimentalMarkets = [...marketGroups.keys()]
    .filter((marketKey) => isExperimentalCornersMarket(marketKey))
    .sort();
  const baseMarketSummaries = [...marketGroups.values()]
    .filter((group) => !isExperimentalCornersMarket(group.marketKey))
    .map((group) => ({
      marketKey: group.marketKey,
      snapshotCount: group.snapshotCount,
      bookmakers: [...group.bookmakers].sort(),
      selectionCount: group.selectionCount,
      capturedAtLatest: maxIso(group.capturedAt),
      scoreability: scoreabilityForMarket(group.marketKey, group.snapshots),
    }))
    .sort((left, right) => left.marketKey.localeCompare(right.marketKey));
  const statisticsSummary = summarizeCornerStatistics(statisticSnapshots);
  const experimentalMarketKeys = [...new Set([
    ...expectedExperimentalMarkets,
    ...availableExperimentalMarkets,
  ])].sort();
  const experimentalMarketSummaries = experimentalMarketKeys.map((marketKey) =>
    summarizeExperimentalMarket({
      cornersEnabled,
      group: marketGroups.get(marketKey),
      marketKey,
      statisticsSummary,
    }),
  );
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
    requestedExpectedMarkets: expectedMarkets,
    expectedMarkets: expectedBaseMarkets,
    availableMarkets: availableBaseMarkets,
    missingMarkets: expectedBaseMarkets.filter((marketKey) => !marketGroups.has(marketKey)),
    snapshotCount: snapshots.length,
    bookmakers: [...bookmakers].sort(),
    capturedAtLatest: maxIso(snapshots.map((snapshot) => snapshot.capturedAt)),
    markets: baseMarketSummaries,
    experimentalMarkets: {
      enabled: cornersEnabled,
      expectedMarkets: expectedExperimentalMarkets,
      availableMarkets: availableExperimentalMarkets,
      missingMarkets: expectedExperimentalMarkets.filter((marketKey) => !marketGroups.has(marketKey)),
      statistics: statisticsSummary,
      markets: experimentalMarketSummaries,
    },
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
  const requestedExpectedMarkets = parseCsv(
    readArgValue(args, "--expected-markets") ?? env.GANA_FOOTBALL_MARKET_KEYS,
  ) ?? TOP_FOOTBALL_BASE_MARKETS;
  const { baseMarkets: expectedBaseMarkets, experimentalMarkets: expectedExperimentalMarkets } =
    partitionExpectedMarkets(requestedExpectedMarkets);
  const cornersEnabled = isExperimentalCornersMarketsEnabled(env.GANA_ENABLE_CORNERS_MARKETS);

  if (!fixtureRefs || fixtureRefs.length === 0) {
    throw new Error("Provide fixture ids with --fixture-ids 1388584,1378200 or GANA_LIVE_ODDS_FIXTURE_IDS");
  }

  assertSchemaReadiness({ env });
  const prisma = createPrismaClient(databaseUrl);
  const inputs = fixtureRefs.map((fixtureRef) => parseFixtureRef(fixtureRef, provider));

  try {
    const providerFixtureIds = [...new Set(inputs.map((input) => input.providerFixtureId))];
    const fixtureIds = [...new Set(inputs.map((input) => input.fixtureId))];
    const [fixtures, snapshots, statisticSnapshots] = await Promise.all([
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
      prisma.fixtureStatisticSnapshot.findMany({
        where: {
          statKey: "corners",
          OR: [
            { providerFixtureId: { in: providerFixtureIds } },
            { fixtureId: { in: fixtureIds } },
          ],
        },
        select: {
          capturedAt: true,
          fixtureId: true,
          providerFixtureId: true,
          scope: true,
          statKey: true,
          valueNumeric: true,
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
    const statisticSnapshotsByInput = new Map(inputs.map((input) => [input.input, []]));
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

    for (const snapshot of statisticSnapshots) {
      const input = requestedByProviderId.get(snapshot.providerFixtureId) ??
        (snapshot.fixtureId ? requestedByFixtureId.get(snapshot.fixtureId) : undefined);
      if (!input) {
        continue;
      }
      statisticSnapshotsByInput.get(input.input)?.push(snapshot);
    }

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      provider,
      requestedExpectedMarkets,
      expectedMarkets: expectedBaseMarkets,
      experimentalExpectedMarkets: expectedExperimentalMarkets,
      experimentalCornersEnabled: cornersEnabled,
      fixtures: inputs.map((input) =>
        summarizeFixture(
          input,
          fixtureByInput.get(input.input),
          requestedExpectedMarkets,
          snapshotsByInput.get(input.input) ?? [],
          statisticSnapshotsByInput.get(input.input) ?? [],
          { cornersEnabled },
        ),
      ),
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

await main();
