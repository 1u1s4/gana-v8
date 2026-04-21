import { loadRuntimeConfig, type RuntimeConfig } from "@gana-v8/config-runtime";
import {
  createAiRun,
  createAuditEvent,
  createFixtureWorkflow,
  createOpaqueTaskId,
  createPrediction,
  createTask,
  transitionFixtureWorkflowStage,
  type AiRunEntity,
  type AiRunUsage,
  type FixtureEntity,
  type FixtureWorkflowEntity,
  type PredictionEntity,
  type TaskEntity,
} from "@gana-v8/domain-core";
import {
  runStructuredOutput,
  type GetAiProviderAdapterOptions,
  type ReasoningLevel,
  type RunStructuredOutputResult,
} from "@gana-v8/ai-runtime";
import { summarizePersistedFeatureMetadata } from "@gana-v8/feature-store";
import { renderPrompt, type PromptRegistryKey } from "@gana-v8/model-registry";
import {
  buildAtomicPrediction,
  type AtomicPredictionArtifact,
  type CandidateEligibilityPolicy,
  type ResearchDossierLike,
} from "@gana-v8/prediction-engine";
import {
  createPrismaUnitOfWork,
  createVerifiedPrismaClient,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";
import { evaluateFixtureCoverageScope, type FixtureCoverageScopeDecision } from "@gana-v8/policy-engine";
import { z } from "zod";

export const workspaceInfo = {
  packageName: "@gana-v8/scoring-worker",
  workspaceName: "scoring-worker",
  category: "app",
  description: "Builds deterministic MVP scoring runs from persisted fixtures and h2h odds.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
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
    findMany(args?: { where?: { status?: FixtureEntity["status"]; id?: { in: readonly string[] } } }): Promise<
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
  readonly env?: Readonly<Record<string, string | undefined>>;
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
  readonly fixtureIds?: readonly string[];
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
  readonly ai?: ScoringSynthesisAiConfig;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface FixtureScoreResult {
  readonly fixtureId: string;
  readonly status: "scored" | "skipped";
  readonly reason?: string;
  readonly aiRunId?: string;
  readonly aiRunStatus?: AiRunEntity["status"];
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

interface ScoringCoveragePolicyContext {
  readonly leaguePolicies: Awaited<ReturnType<StorageUnitOfWork["leagueCoveragePolicies"]["findEnabled"]>>;
  readonly teamPolicies: Awaited<ReturnType<StorageUnitOfWork["teamCoveragePolicies"]["findEnabled"]>>;
  readonly dailyPolicy: {
    readonly minAllowedOdd: number;
    readonly requireTrackedLeagueOrTeam: boolean;
  };
  readonly hasPersistedPolicy: boolean;
}

const AI_RUN_PROVIDER = "internal";
const AI_RUN_MODEL = "deterministic-moneyline-v1";
const AI_RUN_PROMPT_VERSION = "scoring-worker-mvp-v1";
const DEFAULT_SCORING_AI_PROVIDER = "codex";
const DEFAULT_SCORING_AI_MODEL = "gpt-5.4";
const DEFAULT_SCORING_AI_REASONING: ReasoningLevel = "low";
const DEFAULT_SCORING_AI_PROMPT_KEY: PromptRegistryKey = "scoring.fixture-synthesis";
const SCORING_AI_OUTPUT_CONTRACT = '{"summary":"string","advisorySignals":["string"]}';
const scoringStructuredOutputSchema = z.object({
  summary: z.string().min(1),
  advisorySignals: z.array(z.string().min(1)).max(4).optional(),
});
type ScoringStructuredOutput = z.infer<typeof scoringStructuredOutputSchema>;

const deriveTaskLineage = (runtimeConfig: RuntimeConfig): Record<string, unknown> => ({
  environment: runtimeConfig.app.env,
  profile: runtimeConfig.app.profile,
  providerSource: runtimeConfig.provider.source,
  demoMode: runtimeConfig.flags.demoMode,
  cohort: runtimeConfig.flags.demoMode ? `demo:${runtimeConfig.app.profile}` : `live:${runtimeConfig.app.profile}`,
  source: "scoring-worker",
});

const buildTaskPayload = (fixtureId: string, runtimeConfig: RuntimeConfig): Record<string, unknown> => ({
  fixtureId,
  source: "scoring-worker",
  lineage: deriveTaskLineage(runtimeConfig),
});

export interface ScoringSynthesisAiConfig extends GetAiProviderAdapterOptions {
  readonly enabled?: boolean;
  readonly provider?: "codex";
  readonly requestedModel?: string;
  readonly requestedReasoning?: ReasoningLevel;
  readonly promptKey?: PromptRegistryKey;
  readonly promptVersion?: string;
  readonly webSearchMode?: "disabled" | "auto" | "required";
}

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

  const client = (options.client ?? createVerifiedPrismaClient({ databaseUrl })) as unknown as ScoringWorkerPrismaClientLike;
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

const createScoringTaskId = (fixtureId: string): string =>
  createOpaqueTaskId(`scoring-worker:${fixtureId}`);
const createAiRunId = (fixtureId: string, generatedAt: string): string => `airun:${fixtureId}:${generatedAt}`;
const createPredictionId = (fixtureId: string, outcome: string, generatedAt: string): string =>
  `prediction:${fixtureId}:moneyline:${outcome}:${generatedAt}`;

const defaultCoverageDailyPolicy = {
  minAllowedOdd: 1.2,
  requireTrackedLeagueOrTeam: false,
} as const;

const detectMinDetectedOdd = (snapshot: OddsSnapshotLike): number | undefined => {
  const prices = snapshot.selections
    .map((selection) => selection.priceDecimal)
    .filter((price): price is number => Number.isFinite(price) && price > 0);
  if (prices.length === 0) {
    return undefined;
  }

  return Math.min(...prices);
};

const loadScoringCoveragePolicyContext = async (
  unitOfWork: StorageUnitOfWork,
): Promise<ScoringCoveragePolicyContext> => {
  const [leaguePolicies, teamPolicies, dailyPolicies] = await Promise.all([
    unitOfWork.leagueCoveragePolicies.findEnabled(),
    unitOfWork.teamCoveragePolicies.findEnabled(),
    unitOfWork.dailyAutomationPolicies.findEnabled(),
  ]);

  return {
    leaguePolicies,
    teamPolicies,
    dailyPolicy: dailyPolicies[0] ?? defaultCoverageDailyPolicy,
    hasPersistedPolicy: leaguePolicies.length > 0 || teamPolicies.length > 0 || dailyPolicies.length > 0,
  };
};

const summarizeCoverageBlock = (excludedBy: readonly { message: string }[]): string =>
  excludedBy.map((reason) => reason.message).join("; ") || "Fixture was blocked by coverage policy.";

const persistCoverageBlockedWorkflow = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
  stage: "prediction" | "parlay",
  generatedAt: string,
  scopeDecision: FixtureCoverageScopeDecision,
  actor: string,
): Promise<void> => {
  const current =
    (await unitOfWork.fixtureWorkflows.findByFixtureId(fixtureId)) ??
    createFixtureWorkflow({
      fixtureId,
      ingestionStatus: "pending",
      oddsStatus: "pending",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
    });

  const persistedWorkflow = await unitOfWork.fixtureWorkflows.save(
    transitionFixtureWorkflowStage(current, stage, {
      status: "blocked",
      occurredAt: generatedAt,
      isCandidate: false,
      ...(scopeDecision.minDetectedOdd !== undefined ? { minDetectedOdd: scopeDecision.minDetectedOdd } : {}),
      diagnostics: {
        ...(current.diagnostics ?? {}),
        coverageDecision: scopeDecision,
      },
    }),
  );

  await unitOfWork.auditEvents.save(
    createAuditEvent({
      id: `audit:fixture-workflow:${fixtureId}:coverage-policy-blocked:${stage}:${persistedWorkflow.updatedAt}`,
      aggregateType: "fixture-workflow",
      aggregateId: fixtureId,
      eventType: "fixture-workflow.coverage-policy.blocked",
      actor,
      payload: {
        stage,
        included: scopeDecision.included,
        eligibleForScoring: scopeDecision.eligibleForScoring,
        eligibleForParlay: scopeDecision.eligibleForParlay,
        appliedMinAllowedOdd: scopeDecision.appliedMinAllowedOdd,
        minDetectedOdd: scopeDecision.minDetectedOdd ?? null,
        excludedBy: scopeDecision.excludedBy,
      },
      occurredAt: persistedWorkflow.updatedAt,
    }),
  );
};

const persistScoringWorkflow = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
  generatedAt: string,
  status: "succeeded" | "failed",
  errorMessage?: string,
): Promise<FixtureWorkflowEntity> => {
  const current =
    (await unitOfWork.fixtureWorkflows.findByFixtureId(fixtureId)) ??
    createFixtureWorkflow({
      fixtureId,
      ingestionStatus: "pending",
      oddsStatus: "pending",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
    });

  return unitOfWork.fixtureWorkflows.save(
    transitionFixtureWorkflowStage(current, "prediction", {
      status,
      occurredAt: generatedAt,
      isCandidate: status === "succeeded",
      ...(errorMessage ? { errorMessage } : {}),
    }),
  );
};

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

const blendResearchLean = (
  baseLean: ResearchDossierLike["recommendedLean"],
  fixture: FixtureEntity,
  directionalScore: ImpliedProbabilities,
): {
  readonly recommendedLean: ResearchDossierLike["recommendedLean"];
  readonly directionalScore: ImpliedProbabilities;
  readonly researchMetadataUsed: boolean;
  readonly summarySuffix: string;
  readonly researchEvidence: Array<{ readonly id: string }>;
} => {
  const persistedResearch = summarizePersistedFeatureMetadata(fixture);
  if (
    persistedResearch.featureReadinessStatus !== "ready" ||
    !persistedResearch.researchRecommendedLean ||
    persistedResearch.researchGeneratedAt === undefined
  ) {
    return {
      recommendedLean: baseLean,
      directionalScore,
      researchMetadataUsed: false,
      summarySuffix: "",
      researchEvidence: [],
    };
  }

  const boostedScores: { home: number; draw: number; away: number } = { ...directionalScore };
  const researchLean = persistedResearch.researchRecommendedLean;
  boostedScores[researchLean] = round(Math.max(boostedScores[researchLean], 0) + 0.7);
  const reranked = (["home", "draw", "away"] as Array<ResearchDossierLike["recommendedLean"]>).sort(
    (left, right) => boostedScores[right] - boostedScores[left],
  );
  const recommendedLean = reranked[0] ?? baseLean;

  return {
    recommendedLean,
    directionalScore: boostedScores,
    researchMetadataUsed: true,
    summarySuffix:
      ` Research snapshot leans ${researchLean} from ${persistedResearch.researchGeneratedAt}` +
      (persistedResearch.researchTopEvidenceTitles[0]
        ? ` with top signal ${persistedResearch.researchTopEvidenceTitles[0]}.`
        : "."),
    researchEvidence: [{ id: `research:${fixture.id}` }],
  };
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

  const baseLean = (ranked[0]?.[0] ?? "draw") as ResearchDossierLike["recommendedLean"];
  const blended = blendResearchLean(baseLean, fixture, buildOutcomeScores(impliedProbabilities));

  return {
    fixtureId: fixture.id,
    generatedAt: options.generatedAt ?? snapshot.capturedAt.toISOString(),
    summary:
      `${fixture.homeTeam} vs ${fixture.awayTeam} in ${fixture.competition}. ` +
      `Latest ${snapshot.bookmakerKey} h2h market captured ${snapshot.capturedAt.toISOString()} leans ${blended.recommendedLean}.` +
      blended.summarySuffix,
    recommendedLean: blended.recommendedLean,
    evidence: [
      { id: `fixture:${fixture.id}` },
      { id: `odds:${snapshot.id}` },
      { id: `market:${snapshot.bookmakerKey}:${snapshot.marketKey}` },
      ...blended.researchEvidence,
    ],
    directionalScore: blended.directionalScore,
  };
};

const isScoringAiEnabled = (config?: ScoringSynthesisAiConfig): boolean => config?.enabled === true;

const toUsage = (
  result: Pick<RunStructuredOutputResult<typeof scoringStructuredOutputSchema>, "usageJson">,
): AiRunUsage | undefined => {
  const inputTokens = result.usageJson?.inputTokens;
  const outputTokens = result.usageJson?.outputTokens;
  const totalTokens = result.usageJson?.totalTokens;

  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
  };
};

const createScoringAiContext = (
  fixture: FixtureEntity,
  dossier: ResearchDossierLike,
  artifact: AtomicPredictionArtifact,
): string => {
  const rationale = artifact.prediction.rationale.map((line, index) => `${index + 1}. ${line}`).join("\n");

  return [
    `FixtureId: ${fixture.id}`,
    `Competition: ${fixture.competition}`,
    `Match: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
    `ScheduledAt: ${fixture.scheduledAt}`,
    `Deterministic outcome: ${artifact.prediction.market}:${artifact.prediction.outcome}`,
    `Confidence: ${artifact.prediction.confidence}`,
    `ModelProbability: ${artifact.prediction.probabilities.model}`,
    `ImpliedProbability: ${artifact.prediction.probabilities.implied}`,
    `Edge: ${artifact.prediction.probabilities.edge}`,
    `RecommendedLean: ${dossier.recommendedLean}`,
    `DossierSummary: ${dossier.summary}`,
    `EvidenceCount: ${dossier.evidence.length}`,
    "Deterministic rationale:",
    rationale,
  ].join("\n");
};

const renderScoringAiPrompt = (
  fixture: FixtureEntity,
  dossier: ResearchDossierLike,
  artifact: AtomicPredictionArtifact,
  config?: ScoringSynthesisAiConfig,
): { systemPrompt: string; userPrompt: string; version: string } =>
  renderPrompt(
    config?.promptKey ?? DEFAULT_SCORING_AI_PROMPT_KEY,
    {
      context: createScoringAiContext(fixture, dossier, artifact),
      outputContract: SCORING_AI_OUTPUT_CONTRACT,
    },
    config?.promptVersion,
  );

const createDeterministicAiRun = (
  fixtureId: string,
  taskId: string,
  generatedAt: string,
  outputSuffix = "deterministic-baseline.json",
): AiRunEntity =>
  createAiRun({
    id: createAiRunId(fixtureId, generatedAt),
    taskId,
    provider: AI_RUN_PROVIDER,
    model: AI_RUN_MODEL,
    promptVersion: AI_RUN_PROMPT_VERSION,
    status: "completed",
    outputRef: `scoring-worker://${fixtureId}/${generatedAt}/${outputSuffix}`,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });

const createScoringFallbackAiRun = (
  fixtureId: string,
  taskId: string,
  generatedAt: string,
  config: ScoringSynthesisAiConfig | undefined,
  promptVersion: string,
  error: unknown,
): AiRunEntity => {
  const message = error instanceof Error ? error.message : "Unknown scoring AI synthesis failure.";
  return createAiRun({
    id: createAiRunId(fixtureId, generatedAt),
    taskId,
    provider: config?.provider ?? DEFAULT_SCORING_AI_PROVIDER,
    model: config?.requestedModel ?? DEFAULT_SCORING_AI_MODEL,
    promptVersion,
    status: "failed",
    outputRef: `scoring-worker://${fixtureId}/${generatedAt}/deterministic-fallback.json`,
    error: `AI-assisted scoring fallback to deterministic baseline: ${message}`,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });
};

export const resolveScoringAiConfig = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): ScoringSynthesisAiConfig => {
  const mode = env.GANA_SCORING_SYNTHESIS_MODE?.trim().toLowerCase();
  const enabled = mode === "ai-assisted" || env.GANA_ENABLE_SCORING_AI?.trim() === "1";
  const reasoning = env.GANA_SCORING_AI_REASONING?.trim().toLowerCase();

  return {
    enabled,
    provider: DEFAULT_SCORING_AI_PROVIDER,
    requestedModel: env.GANA_SCORING_AI_MODEL?.trim() || DEFAULT_SCORING_AI_MODEL,
    requestedReasoning:
      reasoning === "low" || reasoning === "medium" || reasoning === "high"
        ? reasoning
        : DEFAULT_SCORING_AI_REASONING,
    promptKey: DEFAULT_SCORING_AI_PROMPT_KEY,
    ...(env.GANA_SCORING_AI_PROMPT_VERSION?.trim()
      ? { promptVersion: env.GANA_SCORING_AI_PROMPT_VERSION.trim() }
      : {}),
    webSearchMode: "disabled",
  };
};

export const runScoringSynthesisAi = async (input: {
  readonly fixture: FixtureEntity;
  readonly dossier: ResearchDossierLike;
  readonly artifact: AtomicPredictionArtifact;
  readonly taskId: string;
  readonly generatedAt: string;
  readonly config?: ScoringSynthesisAiConfig;
}): Promise<{ readonly aiRun: AiRunEntity; readonly advisory: ScoringStructuredOutput }> => {
  const renderedPrompt = renderScoringAiPrompt(input.fixture, input.dossier, input.artifact, input.config);
  const result = await runStructuredOutput(
    {
      provider: input.config?.provider ?? DEFAULT_SCORING_AI_PROVIDER,
      requestedModel: input.config?.requestedModel ?? DEFAULT_SCORING_AI_MODEL,
      requestedReasoning: input.config?.requestedReasoning ?? DEFAULT_SCORING_AI_REASONING,
      webSearchMode: input.config?.webSearchMode ?? "disabled",
      schema: scoringStructuredOutputSchema,
      instructions: renderedPrompt.systemPrompt,
      input: renderedPrompt.userPrompt,
      includeEvents: true,
    },
    input.config,
  );

  const usage = toUsage(result);
  return {
    aiRun: createAiRun({
      id: createAiRunId(input.fixture.id, input.generatedAt),
      taskId: input.taskId,
      provider: result.provider,
      model: result.resolvedModel,
      promptVersion: renderedPrompt.version,
      ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...(usage ? { usage } : {}),
      outputRef: `scoring-worker://${input.fixture.id}/${input.generatedAt}/ai-synthesis.json`,
      status: "completed",
      createdAt: input.generatedAt,
      updatedAt: input.generatedAt,
    }),
    advisory: result.structuredOutput,
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
      where: {
        status: "scheduled",
        ...(options.fixtureIds ? { id: { in: Array.from(options.fixtureIds) } } : {}),
      },
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
  runtimeConfig: RuntimeConfig,
): Promise<TaskEntity> => {
  const payload = buildTaskPayload(fixtureId, runtimeConfig);
  const existing = await unitOfWork.tasks.getById(taskId);
  if (existing) {
    const currentLineage = JSON.stringify(existing.payload.lineage ?? null);
    const nextLineage = JSON.stringify(payload.lineage ?? null);
    if (currentLineage === nextLineage && existing.payload.source === payload.source) {
      return existing;
    }

    return unitOfWork.tasks.save({
      ...existing,
      payload: {
        ...existing.payload,
        ...payload,
      },
      updatedAt: generatedAt,
    });
  }

  const task = createTask({
    id: taskId,
    kind: "prediction",
    status: "succeeded",
    priority: 50,
    payload,
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
  const runtimeEnv =
    options.env ??
    (options.client || options.unitOfWork
      ? {
          NODE_ENV: "test",
          GANA_RUNTIME_PROFILE: "ci-smoke",
        }
      : undefined);
  const runtimeConfig = runtimeEnv
    ? loadRuntimeConfig({ appName: "scoring-worker", env: runtimeEnv })
    : loadRuntimeConfig({ appName: "scoring-worker" });

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

    const existingWorkflow = await runtime.unitOfWork.fixtureWorkflows.findByFixtureId(fixture.id);
    if (
      existingWorkflow?.selectionOverride === "force-exclude" ||
      existingWorkflow?.manualSelectionStatus === "rejected"
    ) {
      return {
        fixtureId: fixture.id,
        status: "skipped",
        reason: "Fixture is force-excluded by workflow ops.",
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

    const minDetectedOdd = detectMinDetectedOdd(latestOddsSnapshot);
    const coverageContext = await loadScoringCoveragePolicyContext(runtime.unitOfWork);
    if (coverageContext.hasPersistedPolicy) {
      const coverageDecision = evaluateFixtureCoverageScope({
        fixture,
        ...(existingWorkflow ? { workflow: existingWorkflow } : {}),
        leaguePolicies: coverageContext.leaguePolicies,
        teamPolicies: coverageContext.teamPolicies,
        dailyPolicy: coverageContext.dailyPolicy,
        ...(minDetectedOdd !== undefined ? { minDetectedOdd } : {}),
        now: generatedAt,
      });
      if (!coverageDecision.eligibleForScoring) {
        await persistCoverageBlockedWorkflow(
          runtime.unitOfWork,
          fixture.id,
          "prediction",
          generatedAt,
          coverageDecision,
          "scoring-worker",
        );
        return {
          fixtureId: fixture.id,
          status: "skipped",
          reason: summarizeCoverageBlock(coverageDecision.excludedBy),
        };
      }
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
      runtimeConfig,
    );

    const artifact = buildAtomicPrediction(enrichedFixture, dossier, {
      generatedAt,
      policy: { ...DEFAULT_SCORING_POLICY, ...options.policy },
      predictionIdFactory: (artifactFixture, candidate) =>
        createPredictionId(artifactFixture.id, candidate.outcome, generatedAt),
    });

    let aiRun: AiRunEntity;
    let advisorySignals: readonly string[] = [];
    let advisorySummary: string | undefined;

    if (artifact && isScoringAiEnabled(options.ai)) {
      const promptVersion = renderScoringAiPrompt(enrichedFixture, dossier, artifact, options.ai).version;
      try {
        const aiTrace = await runScoringSynthesisAi({
          fixture: enrichedFixture,
          dossier,
          artifact,
          taskId: task.id,
          generatedAt,
          ...(options.ai ? { config: options.ai } : {}),
        });
        aiRun = aiTrace.aiRun;
        advisorySummary = aiTrace.advisory.summary;
        advisorySignals = aiTrace.advisory.advisorySignals ?? [];
      } catch (error) {
        aiRun = createScoringFallbackAiRun(
          fixture.id,
          task.id,
          generatedAt,
          options.ai,
          promptVersion,
          error,
        );
      }
    } else {
      aiRun = createDeterministicAiRun(
        fixture.id,
        task.id,
        generatedAt,
        artifact ? "deterministic-baseline.json" : "no-candidate.json",
      );
    }

    aiRun = await runtime.unitOfWork.aiRuns.save(aiRun);

    if (!artifact) {
      await persistScoringWorkflow(
        runtime.unitOfWork,
        fixture.id,
        generatedAt,
        "failed",
        "No moneyline candidate satisfied scoring policy.",
      );
      return {
        fixtureId: fixture.id,
        status: "skipped",
        reason: "No moneyline candidate satisfied scoring policy.",
        aiRunId: aiRun.id,
        aiRunStatus: aiRun.status,
      };
    }

    const rationale = [...artifact.prediction.rationale];
    if (advisorySummary) {
      rationale.push(`AI advisory: ${advisorySummary}`);
    }
    if (advisorySignals.length > 0) {
      rationale.push(`AI signals: ${advisorySignals.join(" | ")}`);
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
        rationale,
        status: artifact.prediction.status,
        updatedAt: artifact.prediction.updatedAt,
      }),
    );
    await persistScoringWorkflow(runtime.unitOfWork, fixture.id, generatedAt, "succeeded");

    return {
      fixtureId: fixture.id,
      status: "scored",
      aiRunId: aiRun.id,
      aiRunStatus: aiRun.status,
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
        ...(options.env ? { env: options.env } : {}),
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
