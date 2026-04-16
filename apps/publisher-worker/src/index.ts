import type {
  FixtureEntity,
  ParlayEntity,
  PredictionEntity,
} from "@gana-v8/domain-core";
import {
  buildParlayFromCandidates,
  type AtomicCandidate,
  type ParlayScorecard,
} from "@gana-v8/parlay-engine";
import {
  createPrismaClient,
  createPrismaUnitOfWork,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";

export const workspaceInfo = {
  packageName: "@gana-v8/publisher-worker",
  workspaceName: "publisher-worker",
  category: "app",
  description: "Builds and persists a minimal MVP parlay from published predictions stored in MySQL.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/parlay-engine", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/publication-engine", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface PublishedPredictionRecord extends PredictionEntity {
  readonly fixture: FixtureEntity | null;
}

export interface PublisherWorkerPrismaClientLike {
  readonly prediction: {
    findMany(args?: {
      where?: {
        status?: PredictionEntity["status"];
        market?: PredictionEntity["market"];
      };
      include?: {
        fixture?: boolean;
      };
      orderBy?: Array<{
        publishedAt?: "desc" | "asc";
        updatedAt?: "desc" | "asc";
        confidence?: "desc" | "asc";
      }>;
      take?: number;
    }): Promise<PublishedPredictionRecord[]>;
  };
  readonly $disconnect?: () => Promise<void>;
}

export interface PublisherWorkerSkipReason {
  readonly predictionId?: string;
  readonly fixtureId?: string;
  readonly reason:
    | "duplicate-fixture"
    | "invalid-implied-probability"
    | "missing-fixture"
    | "unsupported-market"
    | "not-published"
    | "not-enough-candidates";
  readonly detail: string;
}

export interface PublishParlayMvpOptions {
  readonly client?: PublisherWorkerPrismaClientLike;
  readonly unitOfWork?: StorageUnitOfWork;
  readonly generatedAt?: string;
  readonly maxPredictions?: number;
  readonly minLegs?: number;
  readonly maxLegs?: number;
  readonly source?: ParlayEntity["source"];
  readonly stake?: number;
}

export interface PublishParlayMvpResult {
  readonly generatedAt: string;
  readonly status: "persisted" | "skipped";
  readonly parlay?: ParlayEntity;
  readonly scorecard: ParlayScorecard;
  readonly loadedPredictionCount: number;
  readonly candidateCount: number;
  readonly selectedCandidates: readonly AtomicCandidate[];
  readonly skipReasons: readonly PublisherWorkerSkipReason[];
}

const DEFAULT_GENERATED_AT = "2026-04-16T12:00:00.000Z";
const DEFAULT_STAKE = 10;
const DEFAULT_MIN_LEGS = 2;
const DEFAULT_MAX_LEGS = 2;

const round = (value: number): number => Number(value.toFixed(4));

const createManagedRuntime = (
  databaseUrl?: string,
  options: Pick<PublishParlayMvpOptions, "client" | "unitOfWork"> = {},
): {
  client: PublisherWorkerPrismaClientLike;
  unitOfWork: StorageUnitOfWork;
  disconnect: () => Promise<void>;
} => {
  if (options.client && options.unitOfWork) {
    return {
      client: options.client,
      unitOfWork: options.unitOfWork,
      disconnect: async () => {},
    };
  }

  const client = (options.client ?? createPrismaClient(databaseUrl)) as PublisherWorkerPrismaClientLike;
  const unitOfWork = options.unitOfWork ?? createPrismaUnitOfWork(client as never);

  return {
    client,
    unitOfWork,
    disconnect: options.client
      ? async () => {}
      : async () => {
          await client.$disconnect?.();
        },
  };
};

const normalizeTeamKey = (team: string): string =>
  team
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createParlayId = (generatedAt: string, legs: readonly AtomicCandidate[]): string =>
  `parlay:auto:${generatedAt.replace(/[^0-9]/g, "")}:${legs.map((leg) => leg.predictionId).join(":")}`;

const createEmptyScorecard = (reasons: readonly string[]): ParlayScorecard => ({
  legCount: 0,
  averageLegScore: 0,
  combinedProbability: 0,
  combinedPrice: 0,
  expectedValuePerUnit: 0,
  parlayScore: 0,
  riskScore: 1,
  correlationScore: 0,
  ready: false,
  reasons,
});

export const toAtomicCandidateFromPrediction = (
  prediction: PublishedPredictionRecord,
): AtomicCandidate => {
  if (prediction.status !== "published") {
    throw new Error(`Prediction ${prediction.id} is not published`);
  }

  if (prediction.market !== "moneyline") {
    throw new Error(`Prediction ${prediction.id} market ${prediction.market} is not supported`);
  }

  if (!prediction.fixture) {
    throw new Error(`Prediction ${prediction.id} is missing fixture context`);
  }

  const impliedProbability = prediction.probabilities.implied;
  if (!Number.isFinite(impliedProbability) || impliedProbability <= 0 || impliedProbability >= 1) {
    throw new Error(`Prediction ${prediction.id} has invalid implied probability ${String(impliedProbability)}`);
  }

  return {
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    market: prediction.market,
    outcome: prediction.outcome,
    price: round(1 / impliedProbability),
    confidence: prediction.confidence,
    modelProbability: prediction.probabilities.model,
    impliedProbability,
    edge: prediction.probabilities.edge,
    competition: prediction.fixture.competition,
    teamKeys: [
      normalizeTeamKey(prediction.fixture.homeTeam),
      normalizeTeamKey(prediction.fixture.awayTeam),
    ],
    metadata: {
      publishedAt: prediction.publishedAt ?? prediction.updatedAt,
      homeTeam: prediction.fixture.homeTeam,
      awayTeam: prediction.fixture.awayTeam,
    },
  };
};

export const loadPublishedPredictionCandidates = async (
  databaseUrl?: string,
  options: Pick<PublishParlayMvpOptions, "client" | "maxPredictions"> = {},
): Promise<{
  readonly predictions: readonly PublishedPredictionRecord[];
  readonly candidates: readonly AtomicCandidate[];
  readonly skipReasons: readonly PublisherWorkerSkipReason[];
}> => {
  const client = (options.client ?? createPrismaClient(databaseUrl)) as PublisherWorkerPrismaClientLike;
  const ownsClient = options.client === undefined;

  try {
    const predictions = await client.prediction.findMany({
      where: { status: "published" },
      include: { fixture: true },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { confidence: "desc" }],
      ...(options.maxPredictions !== undefined ? { take: options.maxPredictions } : {}),
    });

    const candidates: AtomicCandidate[] = [];
    const skipReasons: PublisherWorkerSkipReason[] = [];

    for (const prediction of predictions) {
      if (prediction.status !== "published") {
        skipReasons.push({
          predictionId: prediction.id,
          fixtureId: prediction.fixtureId,
          reason: "not-published",
          detail: `Prediction ${prediction.id} has status ${prediction.status}`,
        });
        continue;
      }

      if (prediction.market !== "moneyline") {
        skipReasons.push({
          predictionId: prediction.id,
          fixtureId: prediction.fixtureId,
          reason: "unsupported-market",
          detail: `Prediction ${prediction.id} market ${prediction.market} is outside MVP moneyline scope`,
        });
        continue;
      }

      if (!prediction.fixture) {
        skipReasons.push({
          predictionId: prediction.id,
          fixtureId: prediction.fixtureId,
          reason: "missing-fixture",
          detail: `Prediction ${prediction.id} could not load fixture ${prediction.fixtureId}`,
        });
        continue;
      }

      const implied = prediction.probabilities.implied;
      if (!Number.isFinite(implied) || implied <= 0 || implied >= 1) {
        skipReasons.push({
          predictionId: prediction.id,
          fixtureId: prediction.fixtureId,
          reason: "invalid-implied-probability",
          detail: `Prediction ${prediction.id} implied probability must be between 0 and 1`,
        });
        continue;
      }

      candidates.push(toAtomicCandidateFromPrediction(prediction));
    }

    return {
      predictions,
      candidates,
      skipReasons,
    };
  } finally {
    if (ownsClient) {
      await client.$disconnect?.();
    }
  }
};

const dedupeCandidatesByFixture = (
  candidates: readonly AtomicCandidate[],
): {
  readonly candidates: readonly AtomicCandidate[];
  readonly skipReasons: readonly PublisherWorkerSkipReason[];
} => {
  const selected: AtomicCandidate[] = [];
  const skipReasons: PublisherWorkerSkipReason[] = [];
  const fixtureIds = new Set<string>();

  for (const candidate of candidates) {
    if (fixtureIds.has(candidate.fixtureId)) {
      skipReasons.push({
        predictionId: candidate.predictionId,
        fixtureId: candidate.fixtureId,
        reason: "duplicate-fixture",
        detail: `Prediction ${candidate.predictionId} skipped because fixture ${candidate.fixtureId} already has a leg candidate`,
      });
      continue;
    }

    fixtureIds.add(candidate.fixtureId);
    selected.push(candidate);
  }

  return {
    candidates: selected,
    skipReasons,
  };
};

export const publishParlayMvp = async (
  databaseUrl?: string,
  options: PublishParlayMvpOptions = {},
): Promise<PublishParlayMvpResult> => {
  const runtime = createManagedRuntime(databaseUrl, options);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const stake = options.stake ?? DEFAULT_STAKE;
  const minLegs = options.minLegs ?? DEFAULT_MIN_LEGS;
  const maxLegs = options.maxLegs ?? DEFAULT_MAX_LEGS;

  try {
    const loaded = await runtime.client.prediction.findMany({
      where: { status: "published" },
      include: { fixture: true },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { confidence: "desc" }],
      ...(options.maxPredictions !== undefined ? { take: options.maxPredictions } : {}),
    });

    const candidates: AtomicCandidate[] = [];
    const skipReasons: PublisherWorkerSkipReason[] = [];

    for (const prediction of loaded) {
      if (prediction.market !== "moneyline") {
        skipReasons.push({
          predictionId: prediction.id,
          fixtureId: prediction.fixtureId,
          reason: "unsupported-market",
          detail: `Prediction ${prediction.id} market ${prediction.market} is outside MVP moneyline scope`,
        });
        continue;
      }

      if (!prediction.fixture) {
        skipReasons.push({
          predictionId: prediction.id,
          fixtureId: prediction.fixtureId,
          reason: "missing-fixture",
          detail: `Prediction ${prediction.id} could not load fixture ${prediction.fixtureId}`,
        });
        continue;
      }

      const implied = prediction.probabilities.implied;
      if (!Number.isFinite(implied) || implied <= 0 || implied >= 1) {
        skipReasons.push({
          predictionId: prediction.id,
          fixtureId: prediction.fixtureId,
          reason: "invalid-implied-probability",
          detail: `Prediction ${prediction.id} implied probability must be between 0 and 1`,
        });
        continue;
      }

      candidates.push(toAtomicCandidateFromPrediction(prediction));
    }

    const deduped = dedupeCandidatesByFixture(candidates);
    const selectedCandidates = deduped.candidates;
    const mergedSkips = [...skipReasons, ...deduped.skipReasons];

    if (selectedCandidates.length === 0) {
      return {
        generatedAt,
        status: "skipped",
        scorecard: createEmptyScorecard([`requires at least ${minLegs} legs`]),
        loadedPredictionCount: loaded.length,
        candidateCount: 0,
        selectedCandidates,
        skipReasons: [
          ...mergedSkips,
          {
            reason: "not-enough-candidates",
            detail: `Publisher worker requires at least ${minLegs} valid moneyline predictions`,
          },
        ],
      };
    }

    const built = buildParlayFromCandidates({
      id: createParlayId(generatedAt, selectedCandidates.slice(0, maxLegs)),
      createdAt: generatedAt,
      stake,
      source: options.source ?? "automatic",
      candidates: selectedCandidates,
      minLegs,
      maxLegs,
    });

    if (!built.scorecard.ready) {
      return {
        generatedAt,
        status: "skipped",
        scorecard: built.scorecard,
        loadedPredictionCount: loaded.length,
        candidateCount: candidates.length,
        selectedCandidates: built.selectedCandidates,
        skipReasons: [
          ...mergedSkips,
          {
            reason: "not-enough-candidates",
            detail: built.scorecard.reasons.join("; ") || `requires at least ${minLegs} legs`,
          },
        ],
      };
    }

    const parlay = await runtime.unitOfWork.parlays.save(built.parlay);
    return {
      generatedAt,
      status: "persisted",
      parlay,
      scorecard: built.scorecard,
      loadedPredictionCount: loaded.length,
      candidateCount: candidates.length,
      selectedCandidates: built.selectedCandidates,
      skipReasons: mergedSkips,
    };
  } finally {
    await runtime.disconnect();
  }
};

export const runPublisherWorker = publishParlayMvp;

export const createDemoPublisherWorkerResult = async (): Promise<PublishParlayMvpResult> =>
  publishParlayMvp(undefined, { generatedAt: DEFAULT_GENERATED_AT, stake: DEFAULT_STAKE });
