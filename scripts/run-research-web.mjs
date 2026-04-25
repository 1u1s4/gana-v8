import process from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  resolveResearchAiConfig,
  runResearchWorker,
} from "../apps/research-worker/dist/src/index.js";
import {
  assertSchemaReadiness,
  createPrismaClient,
  createPrismaUnitOfWork,
} from "../packages/storage-adapters/dist/src/index.js";

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

const parseArgs = (argv) => {
  const args = {
    apply: false,
    cleanupOnFail: false,
    maxFixtures: 3,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--cleanup-on-fail") {
      args.cleanupOnFail = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      if (key === "fixture-ids") {
        args.fixtureIds = value;
      } else if (key === "generated-at") {
        args.generatedAt = value;
      } else if (key === "db-scope") {
        args.dbScope = value;
      } else if (key === "artifact") {
        args.artifact = value;
      } else if (key === "max-fixtures") {
        args.maxFixtures = Number(value);
      } else {
        throw new Error(`Unsupported argument ${arg}`);
      }
    }
  }

  return args;
};

const parseCsv = (value) =>
  value
    ? value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : [];

const normalizeFixtureId = (value) =>
  value.startsWith("fixture:") ? value : `fixture:api-football:${value}`;

const defaultArtifactPath = (generatedAt) =>
  `.artifacts/research-web/${generatedAt.replace(/[:.]/g, "-")}/summary.json`;

const assertIso = (value, label) => {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }
};

const summarizeProcessedResult = (result) => {
  const bundle = result.persistableResearchBundle;
  const trace = bundle.trace ?? {};
  const gateMessages = bundle.gateResult.reasons.map((reason) => reason.message);

  return {
    fixtureId: result.fixture.id,
    match: `${result.fixture.homeTeam} vs ${result.fixture.awayTeam}`,
    scheduledAt: result.fixture.scheduledAt,
    aiRun: result.aiRun
      ? {
          id: result.aiRun.id,
          status: result.aiRun.status,
          provider: result.aiRun.provider,
          model: result.aiRun.model,
          providerRequestIdPresent: Boolean(result.aiRun.providerRequestId),
        }
      : null,
    bundle: {
      id: bundle.id,
      status: bundle.gateResult.status,
      evidenceCount: result.persistableFeatureSnapshot.evidenceCount,
      sourceCount: bundle.sources.length,
      claimCount: bundle.claims.length,
      webSearchMode: trace.webSearchMode ?? null,
      webResearchStatus: trace.webResearchStatus ?? null,
      gateReasons: gateMessages,
    },
    sources: bundle.sources.map((source) => ({
      id: source.id,
      provider: source.provider,
      sourceType: source.sourceType,
      admissibility: source.admissibility,
      independenceKey: source.independenceKey,
      title: source.title ?? null,
      url: source.url ?? null,
      reference: source.reference,
    })),
    claims: bundle.claims.map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      direction: claim.direction,
      status: claim.status,
      corroborationStatus: claim.corroboration.status,
      sourceIds: claim.sourceIds,
    })),
    scoringReadiness: {
      enabled: bundle.gateResult.status === "publishable",
      reason:
        bundle.gateResult.status === "publishable"
          ? "Research bundle is publishable"
          : gateMessages[0] ?? `Research bundle status ${bundle.gateResult.status} blocks scoring`,
    },
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const dotenv = await readDotenv(new URL("../.env", import.meta.url).pathname);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  assertIso(generatedAt, "--generated-at");

  const preferredDatabaseUrl =
    process.env.GANA_DATABASE_URL ??
    process.env.DATABASE_URL ??
    dotenv.GANA_DATABASE_URL ??
    dotenv.DATABASE_URL;

  const env = {
    ...dotenv,
    ...process.env,
    ...(preferredDatabaseUrl ? { DATABASE_URL: preferredDatabaseUrl } : {}),
    GANA_RESEARCH_SYNTHESIS_MODE:
      process.env.GANA_RESEARCH_SYNTHESIS_MODE ??
      dotenv.GANA_RESEARCH_SYNTHESIS_MODE ??
      "ai-assisted",
    GANA_RESEARCH_WEB_SEARCH_MODE:
      process.env.GANA_RESEARCH_WEB_SEARCH_MODE ??
      dotenv.GANA_RESEARCH_WEB_SEARCH_MODE ??
      "required",
  };

  const fixtureIds = parseCsv(args.fixtureIds ?? env.GANA_RESEARCH_FIXTURE_IDS)
    .map(normalizeFixtureId);

  if (fixtureIds.length === 0) {
    throw new Error("--fixture-ids or GANA_RESEARCH_FIXTURE_IDS is required");
  }
  if (!Number.isInteger(args.maxFixtures) || args.maxFixtures < 1) {
    throw new Error("--max-fixtures must be a positive integer");
  }
  if (fixtureIds.length > args.maxFixtures) {
    throw new Error(`Refusing to process ${fixtureIds.length} fixtures; max is ${args.maxFixtures}`);
  }
  if (!args.dbScope || !["isolated", "shared"].includes(args.dbScope)) {
    throw new Error("--db-scope isolated|shared is required");
  }
  if (!env.DATABASE_URL && !env.GANA_DATABASE_URL) {
    throw new Error("DATABASE_URL or GANA_DATABASE_URL is required");
  }

  const ai = resolveResearchAiConfig(env);
  if (!ai.enabled) {
    throw new Error("Research AI must be enabled with GANA_RESEARCH_SYNTHESIS_MODE=ai-assisted or GANA_ENABLE_RESEARCH_AI=1");
  }
  if (ai.webSearchMode !== "required") {
    throw new Error("GANA_RESEARCH_WEB_SEARCH_MODE=required is required");
  }
  if (!env.CODEX_API_KEY && !env.OPENAI_API_KEY) {
    throw new Error("CODEX_API_KEY or OPENAI_API_KEY is required");
  }

  assertSchemaReadiness({ env });

  const prisma = createPrismaClient(env.DATABASE_URL ?? env.GANA_DATABASE_URL);

  try {
    const unitOfWork = createPrismaUnitOfWork(prisma);
    const fixtures = [];
    for (const fixtureId of fixtureIds) {
      const fixture = await unitOfWork.fixtures.getById(fixtureId);
      if (!fixture) {
        throw new Error(`Fixture not found: ${fixtureId}`);
      }
      if (fixture.status !== "scheduled") {
        throw new Error(`Fixture ${fixtureId} must be scheduled, got ${fixture.status}`);
      }
      fixtures.push(fixture);
    }

    if (!args.apply) {
      const preflight = {
        schemaVersion: "research-web-runner-v1",
        mode: "preflight",
        generatedAt,
        dbScope: args.dbScope,
        webSearchMode: ai.webSearchMode,
        fixtureIds,
        applyRequired: true,
      };
      console.log(JSON.stringify(preflight, null, 2));
      return;
    }

    const summary = await runResearchWorker({
      fixtures,
      generatedAt,
      ai,
      persistence: unitOfWork,
    });

    const processed = summary.results.filter((result) => result.status === "processed");
    const processedSummaries = processed.map(summarizeProcessedResult);
    const artifact = {
      schemaVersion: "research-web-runner-v1",
      generatedAt,
      dbScope: args.dbScope,
      webSearchMode: ai.webSearchMode,
      fixtures: processedSummaries,
      skipped: summary.results
        .filter((result) => result.status === "skipped")
        .map((result) => ({
          fixtureId: result.fixture.id,
          reason: result.reason,
        })),
      createdIds: {
        aiRunIds: processed.flatMap((result) => result.aiRun ? [result.aiRun.id] : []),
        bundleIds: processed.map((result) => result.persistableResearchBundle.id),
        featureSnapshotIds: processed.map((result) => result.persistableFeatureSnapshot.id),
        auditEventIds: processed.map((result) =>
          `audit:research-bundle:${result.persistableResearchBundle.fixtureId}:${result.persistableResearchBundle.generatedAt}`,
        ),
      },
      cleanupOnFail: args.cleanupOnFail,
    };

    const artifactPath = resolve(args.artifact ?? defaultArtifactPath(generatedAt));
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({ ...artifact, artifactPath }, null, 2));

    const failedWebResearchFixtures = processedSummaries.filter((fixtureSummary) =>
      fixtureSummary.bundle.webResearchStatus !== "used",
    );
    if (failedWebResearchFixtures.length > 0) {
      throw new Error(
        `Required web research did not produce usable evidence for fixtures: ${
          failedWebResearchFixtures.map((fixtureSummary) => fixtureSummary.fixtureId).join(", ")
        }. Artifact written to ${artifactPath}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
};

await main();
