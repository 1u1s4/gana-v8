import {
  createAiRun,
  createPrediction,
  createTask,
  type FixtureEntity,
  type PredictionEntity,
  type TaskEntity,
} from "@gana-v8/domain-core";
import {
  buildAtomicPrediction,
  type CandidateEligibilityPolicy,
  type ResearchDossierLike,
} from "@gana-v8/prediction-engine";
import {
  createPrismaClient,
  createPrismaUnitOfWork,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";

export const workspaceInfo = {
  packageName: "@gana-v8/scoring-worker",
  workspaceName: "scoring-worker",
  category: "app",
  description: "Builds deterministic MVP scoring runs from persisted fixtures and h2h odds.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" },
  ],
} as const;

export interface OddsSelectionLike {
  readonly selectionKey: string;
  readonly priceDecimal: number;
}

export interface OddsSnapshotLike {
  readonly id: string;
  readonly fixtureId?: string | null;
  readonly providerFixtureId: string;
  readonly marketKey: string;
  readonly bookmakerKey: string;
  readonly capturedAt: Date;
  readonly selections: readonly OddsSelectionLike[];
}

export interface ScoringWorkerPrismaClientLike {
  readonly fixture: {
    findMany(args?: { where?: { status?: FixtureEntity["status"] } }): Promise<
      Array<FixtureEntity & { scheduledAt: string | Date }>
    >;
    findUnique(args: { where: { id: string } }): Promise<(FixtureEntity & { scheduledAt: string | Date }) | null>;
  };
  readonly oddsSnapshot: {
    findFirst(args: {
      where: {
        marketKey: string;
        OR: Array<{ fixtureId?: string; providerFixtureId?: string }>;
      };
      include?: { selections: true };
      orderBy?: Array<{ capturedAt: "desc" }>;
    }): Promise<OddsSnapshotLike | null>;
  };
  readonly $disconnect?: () => Promise<void>;
}

type RuntimeInitOptions = {
  readonly client?: ScoringWorkerPrismaClientLike;
  readonly unitOfWork?: StorageUnitOfWork;
};

type OutcomeKey = keyof ImpliedProbabilities;

export interface ImpliedProbabilities {
  readonly home: number;
  readonly draw: number;
  readonly away: number;
}

export interface EligibleFixtureForScoring {
  readonly fixture: FixtureEntity;
  readonly latestOddsSnapshot: OddsSnapshotLike | null;
  readonly impliedProbabilities: ImpliedProbabilities | null;
  readonly eligible: boolean;
  readonly reason?: string;
}

export interface LoadEligibleFixturesOptions {
  readonly client?: ScoringWorkerPrismaClientLike;
  readonly maxFixtures?: number;
}

export interface BuildResearchDossierOptions {
  readonly generatedAt?: string;
}

export interface ScoreFixturePredictionOptions {
  readonly client?: ScoringWorkerPrismaClientLike;
  readonly unitOfWork?: StorageUnitOfWork;
  readonly generatedAt?: string;
  readonly policy?: Partial<CandidateEligibilityPolicy>;
}

export interface FixtureScoreResult {
  readonly fixtureId: string;
  readonly status: "scored" | "skipped";
  readonly reason?: string;
  readonly aiRunId?: string;
  readonly prediction?: PredictionEntity;
}

export interface RunScoringWorkerOptions extends ScoreFixturePredictionOptions {
  readonly maxFixtures?: number;
}

export interface RunScoringWorkerSummary {
  readonly generatedAt: string;
  readonly totalFixtures: number;
  readonly scoredCount: number;
  readonly skippedCount: number;
  readonly results: readonly FixtureScoreResult[];
}

const SCORING_TASK_PREFIX = "task:scoring-worker";
const AI_RUN_PROVIDER = "internal";
const AI_RUN_MODEL = "deterministic-moneyline-v1";
const AI_RUN_PROMPT_VERSION = "scoring-worker-mvp-v1";
const DEFAULT_SCORING_POLICY: Partial<CandidateEligibilityPolicy> = {
  minConfidence: 0.3,
  minEdge: 0,
  minEvidenceCount: 2,
  minMinutesBeforeKickoff: 30,
};

const round = (value: number): number => Number(value.toFixed(4));

const normalizeSelectionKey = (selectionKey: string): keyof ImpliedProbabilities | null => {
  const normalized = selectionKey.trim().toLowerCase();
  if (["1", "home", "local", "team1"].includes(normalized)) {
    return "home";
  }
  if (["x", "draw", "tie"].includes(normalized)) {
    return "draw";
  }
  if (["2", "away", "visitor", "team2"].includes(normalized)) {
    return "away";
  }
  return null;
};

const createManagedRuntime = (
  databaseUrl?: string,
  options: RuntimeInitOptions = {},
): { client: ScoringWorkerPrismaClientLike; unitOfWork: StorageUnitOfWork; disconnect: () => Promise<void> } => {
  if (options.client && options.unitOfWork) {
    return {
      client: options.client,
      unitOfWork: options.unitOfWork,
      disconnect: async () => {},
    };
  }

  const client = (options.client ?? createPrismaClient(databaseUrl)) as unknown as ScoringWorkerPrismaClientLike;
  const unitOfWork = options.unitOfWork ?? createPrismaUnitOfWork(client as never);
  const disconnect = options.client
    ? async () => {}
    : async () => {
        await client.$disconnect?.();
      };

  return {
    client,
    unitOfWork,
    disconnect,
  };
};

const createScoringTaskId = (fixtureId: string): string => `${SCORING_TASK_PREFIX}:${fixtureId}`;
const createAiRunId = (fixtureId: string, generatedAt: string): string => `airun:${fixtureId}:${generatedAt}`;
const createPredictionId = (fixtureId: string, outcome: string, generatedAt: string): string =>
  `prediction:${fixtureId}:moneyline:${outcome}:${generatedAt}`;

const enrichFixtureMetadata = (
  fixture: FixtureEntity,
  impliedProbabilities: ImpliedProbabilities,
): FixtureEntity["metadata"] => ({
  ...fixture.metadata,
  oddsHomeImplied: String(impliedProbabilities.home),
  oddsDrawImplied: String(impliedProbabilities.draw),
  oddsAwayImplied: String(impliedProbabilities.away),
  powerHome: String(round(Math.max(0, impliedProbabilities.home - 0.35))),
  powerAway: String(round(Math.max(0, impliedProbabilities.away - 0.3))),
  drawBias: String(round(Math.max(0, impliedProbabilities.draw - 0.24))),
});

export const deriveImpliedProbabilities = (
  snapshot: OddsSnapshotLike,
): ImpliedProbabilities | null => {
  const probabilities: Record<OutcomeKey, number | undefined> = {
    home: undefined,
    draw: undefined,
    away: undefined,
  };

  for (const selection of snapshot.selections) {
    const outcome = normalizeSelectionKey(selection.selectionKey);
    if (!outcome || !Number.isFinite(selection.priceDecimal) || selection.priceDecimal <= 0) {
      continue;
    }

    probabilities[outcome] = 1 / selection.priceDecimal;
  }

  if (
    probabilities.home === undefined ||
    probabilities.draw === undefined ||
    probabilities.away === undefined
  ) {
    return null;
  }

  const overround = probabilities.home + probabilities.draw + probabilities.away;
  return {
    home: round(probabilities.home / overround),
    draw: round(probabilities.draw / overround),
    away: round(probabilities.away / overround),
  };
};

const buildOutcomeScores = (impliedProbabilities: ImpliedProbabilities): ImpliedProbabilities => {
  const ranked: Array<[OutcomeKey, number]> = [
    ["home", impliedProbabilities.home],
    ["draw", impliedProbabilities.draw],
    ["away", impliedProbabilities.away],
  ];
  ranked.sort((left, right) => right[1] - left[1]);

  const winner: OutcomeKey = ranked[0]?.[0] ?? "draw";
  const scores: ImpliedProbabilities = {
    home: round(impliedProbabilities.home + (winner === "home" ? 0.2 : 0.02)),
    draw: round(impliedProbabilities.draw + (winner === "draw" ? 0.2 : 0.02)),
    away: round(impliedProbabilities.away + (winner === "away" ? 0.2 : 0.02)),
  };

  return scores;
};

export const buildResearchDossierFromFixture = (
  fixture: FixtureEntity,
  snapshot: OddsSnapshotLike,
  options: BuildResearchDossierOptions = {},
): ResearchDossierLike => {
  const impliedProbabilities = deriveImpliedProbabilities(snapshot);
  if (!impliedProbabilities) {
    throw new Error(`Snapshot ${snapshot.id} is missing home/draw/away selections`);
  }

  const ranked: Array<[ResearchDossierLike["recommendedLean"], number, string]> = [
    ["home", impliedProbabilities.home, fixture.homeTeam],
    ["draw", impliedProbabilities.draw, "draw"],
    ["away", impliedProbabilities.away, fixture.awayTeam],
  ];
  ranked.sort((left, right) => right[1] - left[1]);

  const recommendedLean = (ranked[0]?.[0] ?? "draw") as ResearchDossierLike["recommendedLean"];
  const directionalScore = buildOutcomeScores(impliedProbabilities);

  return {
    fixtureId: fixture.id,
    generatedAt: options.generatedAt ?? snapshot.capturedAt.toISOString(),
    summary:
      `${fixture.homeTeam} vs ${fixture.awayTeam} in ${fixture.competition}. ` +
      `Latest ${snapshot.bookmakerKey} h2h market captured ${snapshot.capturedAt.toISOString()} leans ${recommendedLean}.`,
    recommendedLean,
    evidence: [
      { id: `fixture:${fixture.id}` },
      { id: `odds:${snapshot.id}` },
      { id: `market:${snapshot.bookmakerKey}:${snapshot.marketKey}` },
    ],
    directionalScore,
  };
};

const findLatestH2hSnapshot = async (
  client: ScoringWorkerPrismaClientLike,
  fixture: FixtureEntity,
): Promise<OddsSnapshotLike | null> => {
  const byFixtureId = await client.oddsSnapshot.findFirst({
    where: {
      marketKey: "h2h",
      OR: [{ fixtureId: fixture.id }],
    },
    include: { selections: true },
    orderBy: [{ capturedAt: "desc" }],
  });

  if (byFixtureId) {
    return byFixtureId;
  }

  const providerFixtureId = fixture.metadata.providerFixtureId;
  if (!providerFixtureId) {
    return null;
  }

  return client.oddsSnapshot.findFirst({
    where: {
      marketKey: "h2h",
      OR: [{ providerFixtureId }],
    },
    include: { selections: true },
    orderBy: [{ capturedAt: "desc" }],
  });
};

export const loadEligibleFixturesForScoring = async (
  databaseUrl?: string,
  options: LoadEligibleFixturesOptions = {},
): Promise<EligibleFixtureForScoring[]> => {
  const runtime = createManagedRuntime(
    databaseUrl,
    options.client ? { client: options.client } : {},
  );

  try {
    const fixtures = await runtime.client.fixture.findMany({
      where: { status: "scheduled" },
    });

    const limitedFixtures = [...fixtures]
      .sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
      )
      .slice(0, options.maxFixtures ?? fixtures.length);

    const results = await Promise.all(
      limitedFixtures.map(async (fixture) => {
        const latestOddsSnapshot = await findLatestH2hSnapshot(runtime.client, fixture);
        if (!latestOddsSnapshot) {
          return {
            fixture,
            latestOddsSnapshot: null,
            impliedProbabilities: null,
            eligible: false,
            reason: "No latest h2h odds snapshot found for fixture.",
          } satisfies EligibleFixtureForScoring;
        }

        const impliedProbabilities = deriveImpliedProbabilities(latestOddsSnapshot);
        if (!impliedProbabilities) {
          return {
            fixture,
            latestOddsSnapshot,
            impliedProbabilities: null,
            eligible: false,
            reason: "Latest h2h odds snapshot is missing home/draw/away selections.",
          } satisfies EligibleFixtureForScoring;
        }

        return {
          fixture,
          latestOddsSnapshot,
          impliedProbabilities,
          eligible: true,
        } satisfies EligibleFixtureForScoring;
      }),
    );

    return results;
  } finally {
    await runtime.disconnect();
  }
};

const ensureTask = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
  taskId: string,
  generatedAt: string,
): Promise<TaskEntity> => {
  const existing = await unitOfWork.tasks.getById(taskId);
  if (existing) {
    return existing;
  }

  const task = createTask({
    id: taskId,
    kind: "prediction",
    status: "succeeded",
    priority: 50,
    payload: { fixtureId, source: "scoring-worker" },
    attempts: [{ startedAt: generatedAt, finishedAt: generatedAt }],
    scheduledFor: generatedAt,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });

  return unitOfWork.tasks.save(task);
};

export const scoreFixturePrediction = async (
  databaseUrl: string | undefined,
  fixtureId: string,
  taskId?: string,
  options: ScoreFixturePredictionOptions = {},
): Promise<FixtureScoreResult> => {
  const runtime = createManagedRuntime(databaseUrl, options);
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  try {
    const fixture = (await runtime.unitOfWork.fixtures.getById(fixtureId)) ??
      (await runtime.client.fixture.findUnique({ where: { id: fixtureId } }));

    if (!fixture) {
      return {
        fixtureId,
        status: "skipped",
        reason: "Fixture not found.",
      };
    }

    if (fixture.status !== "scheduled") {
      return {
        fixtureId: fixture.id,
        status: "skipped",
        reason: `Fixture status ${fixture.status} is not eligible for scoring.`,
      };
    }

    const latestOddsSnapshot = await findLatestH2hSnapshot(runtime.client, fixture);
    if (!latestOddsSnapshot) {
      return {
        fixtureId: fixture.id,
        status: "skipped",
        reason: "No latest h2h odds snapshot found for fixture.",
      };
    }

    const impliedProbabilities = deriveImpliedProbabilities(latestOddsSnapshot);
    if (!impliedProbabilities) {
      return {
        fixtureId: fixture.id,
        status: "skipped",
        reason: "Latest h2h odds snapshot is missing home/draw/away selections.",
      };
    }

    const enrichedFixture = {
      ...fixture,
      metadata: enrichFixtureMetadata(fixture, impliedProbabilities),
    };
    const dossier = buildResearchDossierFromFixture(enrichedFixture, latestOddsSnapshot, { generatedAt });
    const task = await ensureTask(
      runtime.unitOfWork,
      fixture.id,
      taskId ?? createScoringTaskId(fixture.id),
      generatedAt,
    );

    const aiRun = await runtime.unitOfWork.aiRuns.save(
      createAiRun({
        id: createAiRunId(fixture.id, generatedAt),
        taskId: task.id,
        provider: AI_RUN_PROVIDER,
        model: AI_RUN_MODEL,
        promptVersion: AI_RUN_PROMPT_VERSION,
        status: "completed",
        outputRef: `scoring-worker://${fixture.id}/${generatedAt}`,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      }),
    );

    const artifact = buildAtomicPrediction(enrichedFixture, dossier, {
      generatedAt,
      policy: { ...DEFAULT_SCORING_POLICY, ...options.policy },
      predictionIdFactory: (artifactFixture, candidate) =>
        createPredictionId(artifactFixture.id, candidate.outcome, generatedAt),
    });

    if (!artifact) {
      return {
        fixtureId: fixture.id,
        status: "skipped",
        reason: "No moneyline candidate satisfied scoring policy.",
        aiRunId: aiRun.id,
      };
    }

    const prediction = await runtime.unitOfWork.predictions.save(
      createPrediction({
        aiRunId: aiRun.id,
        confidence: artifact.prediction.confidence,
        createdAt: artifact.prediction.createdAt,
        fixtureId: artifact.prediction.fixtureId,
        id: artifact.prediction.id,
        market: artifact.prediction.market,
        outcome: artifact.prediction.outcome,
        probabilities: artifact.prediction.probabilities,
        ...(artifact.prediction.publishedAt ? { publishedAt: artifact.prediction.publishedAt } : {}),
        rationale: [...artifact.prediction.rationale],
        status: artifact.prediction.status,
        updatedAt: artifact.prediction.updatedAt,
      }),
    );

    return {
      fixtureId: fixture.id,
      status: "scored",
      aiRunId: aiRun.id,
      prediction,
    };
  } finally {
    await runtime.disconnect();
  }
};

export const runScoringWorker = async (
  databaseUrl?: string,
  options: RunScoringWorkerOptions = {},
): Promise<RunScoringWorkerSummary> => {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const fixtures = await loadEligibleFixturesForScoring(databaseUrl, {
    ...(options.client ? { client: options.client } : {}),
    ...(options.maxFixtures !== undefined ? { maxFixtures: options.maxFixtures } : {}),
  });

  const results: FixtureScoreResult[] = [];
  for (const candidate of fixtures) {
    if (!candidate.eligible) {
      results.push({
        fixtureId: candidate.fixture.id,
        status: "skipped",
        ...(candidate.reason ? { reason: candidate.reason } : {}),
      });
      continue;
    }

    results.push(
      await scoreFixturePrediction(databaseUrl, candidate.fixture.id, undefined, {
        generatedAt,
        ...(options.client ? { client: options.client } : {}),
        ...(options.policy ? { policy: options.policy } : {}),
        ...(options.unitOfWork ? { unitOfWork: options.unitOfWork } : {}),
      }),
    );
  }

  return {
    generatedAt,
    totalFixtures: fixtures.length,
    scoredCount: results.filter((result) => result.status === "scored").length,
    skippedCount: results.filter((result) => result.status === "skipped").length,
    results,
  };
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
