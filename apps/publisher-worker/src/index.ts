import { createHash } from "node:crypto";

import { loadRuntimeConfig, type RuntimeConfig } from "@gana-v8/config-runtime";
import type {
  FixtureEntity,
  FixtureWorkflowEntity,
  ParlayEntity,
  PredictionEntity,
} from "@gana-v8/domain-core";
import { createAuditEvent, createFixtureWorkflow, transitionFixtureWorkflowStage } from "@gana-v8/domain-core";
import {
  evaluatePublicationReadiness,
  normalizePublicationLineage,
  type PublicationChannel,
  type PublicationDecision,
  type PublicationGateConfig,
  type PublicationLineage,
} from "@gana-v8/publication-engine";
import {
  buildParlayFromCandidates,
  scoreAtomicCandidate,
  type AtomicCandidate,
  type ParlayScorecard,
} from "@gana-v8/parlay-engine";
import {
  connectPrismaClientWithRetry,
  createPrismaUnitOfWork,
  retryPrismaReadOperation,
  createVerifiedPrismaClient,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";
import { evaluateFixtureCoverageScope, type FixtureCoverageScopeDecision } from "@gana-v8/policy-engine";

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

export interface PublishedPredictionRecordAiTask {
  readonly id: string;
  readonly triggerKind?: string;
  readonly payload?: Record<string, unknown> | null;
}

export interface AuthorizationActor {
  readonly id: string;
  readonly role: "viewer" | "operator" | "automation" | "system";
  readonly capabilities: readonly (
    | "publish:preview"
    | "publish:parlay-store"
    | "publish:telegram"
    | "publish:discord"
    | "publish:webhook"
    | "queue:operate"
    | "workflow:override"
    | "*"
  )[];
  readonly displayName?: string;
}

export interface PublishedPredictionRecordAiRun {
  readonly id: string;
  readonly taskId: string;
  readonly task?: PublishedPredictionRecordAiTask | null;
}

export interface PublishedPredictionRecord extends PredictionEntity {
  readonly fixture: FixtureEntity | null;
  readonly aiRun?: PublishedPredictionRecordAiRun | null;
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
        aiRun?: {
          include?: {
            task?: boolean;
          };
        } | boolean;
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
    | "outside-live-window"
    | "workflow-excluded"
    | "research-bundle-blocked"
    | "coverage-policy-blocked"
    | "not-enough-candidates"
    | "publication-blocked";
  readonly detail: string;
}

export interface PublisherWorkerPublicationOptions {
  readonly actor?: AuthorizationActor;
  readonly channel?: PublicationChannel;
  readonly gateConfig?: PublicationGateConfig;
  readonly lineage?: Partial<PublicationLineage>;
}

export interface PublishParlayMvpOptions {
  readonly client?: PublisherWorkerPrismaClientLike;
  readonly unitOfWork?: StorageUnitOfWork;
  readonly generatedAt?: string;
  readonly maxPredictions?: number;
  readonly predictionTaskIds?: readonly string[];
  readonly minLegs?: number;
  readonly maxLegs?: number;
  readonly source?: ParlayEntity["source"];
  readonly stake?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly publication?: PublisherWorkerPublicationOptions;
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
  readonly publicationDecision?: PublicationDecision;
}

const DEFAULT_GENERATED_AT = "2026-04-16T12:00:00.000Z";
const DEFAULT_STAKE = 10;
const DEFAULT_MIN_LEGS = 2;
const DEFAULT_MAX_LEGS = 2;
const LIVE_FIXTURE_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const LIVE_FIXTURE_LOOKAHEAD_MS = 36 * 60 * 60 * 1000;

const round = (value: number): number => Number(value.toFixed(4));

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const deriveRuntimePublicationLineage = (runtimeConfig: RuntimeConfig): PublicationLineage => ({
  environment: runtimeConfig.app.env,
  profile: runtimeConfig.app.profile,
  providerSource: runtimeConfig.provider.source,
  demoMode: runtimeConfig.flags.demoMode,
  cohort: runtimeConfig.flags.demoMode ? `demo:${runtimeConfig.app.profile}` : `live:${runtimeConfig.app.profile}`,
  source: "publisher-worker",
});

const defaultPublicationChannel = (runtimeConfig: RuntimeConfig): PublicationChannel =>
  runtimeConfig.flags.demoMode ? "preview-store" : "parlay-store";

const createAutomationActor = (id: string, displayName: string): AuthorizationActor => ({
  id,
  role: "automation",
  capabilities: ["publish:preview"] as const,
  displayName,
});

const createSystemActor = (id: string, displayName: string): AuthorizationActor => ({
  id,
  role: "system",
  capabilities: ["*"] as const,
  displayName,
});

const defaultPublicationActor = (runtimeConfig: RuntimeConfig): AuthorizationActor =>
  runtimeConfig.flags.demoMode
    ? createAutomationActor("publisher-worker:preview", "Publisher Worker Preview")
    : createSystemActor("publisher-worker:system", "Publisher Worker System");

const extractPredictionLineage = (prediction: PublishedPredictionRecord): PublicationLineage | null => {
  const payload = asRecord(prediction.aiRun?.task?.payload);
  const lineage = payload ? normalizePublicationLineage(payload.lineage as Record<string, unknown> | undefined) : null;
  if (lineage) {
    return lineage;
  }

  return null;
};

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

  const client = (options.client ?? createVerifiedPrismaClient({ databaseUrl })) as PublisherWorkerPrismaClientLike;
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

const ensureConnectedClient = async (
  client: PublisherWorkerPrismaClientLike,
): Promise<void> => {
  const maybeConnectable = client as {
    $connect?: (() => Promise<void>) | undefined;
    $disconnect?: (() => Promise<void>) | undefined;
  };
  if (
    typeof maybeConnectable.$connect !== "function" ||
    typeof maybeConnectable.$disconnect !== "function"
  ) {
    return;
  }

  await connectPrismaClientWithRetry(maybeConnectable as {
    $connect: () => Promise<void>;
    $disconnect: () => Promise<void>;
  });
};

const normalizeTeamKey = (team: string): string =>
  team
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createParlayId = (generatedAt: string, legs: readonly AtomicCandidate[]): string => {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      generatedAt,
      legs: legs.map((leg) => ({
        predictionId: leg.predictionId,
        fixtureId: leg.fixtureId,
        outcome: leg.outcome,
      })),
    }))
    .digest("hex")
    .slice(0, 24);

  return `parlay:auto:${generatedAt.replace(/[^0-9]/g, "")}:${fingerprint}`;
};

const persistParlayWorkflow = async (
  unitOfWork: StorageUnitOfWork,
  fixtureIds: readonly string[],
  generatedAt: string,
): Promise<readonly FixtureWorkflowEntity[]> =>
  Promise.all(
    fixtureIds.map(async (fixtureId) => {
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
        transitionFixtureWorkflowStage(current, "parlay", {
          status: "succeeded",
          occurredAt: generatedAt,
        }),
      );
    }),
  );

const defaultCoverageDailyPolicy = {
  minAllowedOdd: 1.2,
  requireTrackedLeagueOrTeam: false,
} as const;

const inferPredictionMinDetectedOdd = (prediction: PublishedPredictionRecord): number | undefined => {
  const impliedProbability = prediction.probabilities.implied;
  if (!Number.isFinite(impliedProbability) || impliedProbability <= 0) {
    return undefined;
  }

  return round(1 / impliedProbability);
};

const loadPublisherCoveragePolicyContext = async (unitOfWork: StorageUnitOfWork) => {
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

interface PersistedFixtureResearchSummary {
  readonly status: "publishable" | "degraded" | "hold";
  readonly publishable: boolean;
  readonly gateReasons: readonly string[];
}

const loadFixtureResearchSummary = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
): Promise<PersistedFixtureResearchSummary | null> => {
  const [bundle, snapshot] = await Promise.all([
    unitOfWork.researchBundles.findLatestByFixtureId(fixtureId),
    unitOfWork.featureSnapshots.findLatestByFixtureId(fixtureId),
  ]);

  if (!bundle && !snapshot) {
    return null;
  }

  const status = snapshot?.bundleStatus ?? bundle?.gateResult.status ?? "hold";
  const gateReasons =
    snapshot?.gateReasons.map((reason) => reason.message) ??
    bundle?.gateResult.reasons.map((reason) => reason.message) ??
    [];

  return {
    status,
    publishable: status === "publishable",
    gateReasons,
  };
};

const summarizeResearchBlock = (
  research: PersistedFixtureResearchSummary | null,
): string =>
  !research
    ? "No persisted research bundle found for fixture."
    : `Research bundle status ${research.status} is not publishable.` +
      (research.gateReasons.length > 0 ? ` ${research.gateReasons.join("; ")}` : "");

const persistCoverageBlockedParlayWorkflow = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
  generatedAt: string,
  scopeDecision: FixtureCoverageScopeDecision,
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
    transitionFixtureWorkflowStage(current, "parlay", {
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
      id: `audit:fixture-workflow:${fixtureId}:coverage-policy-blocked:parlay:${persistedWorkflow.updatedAt}`,
      aggregateType: "fixture-workflow",
      aggregateId: fixtureId,
      eventType: "fixture-workflow.coverage-policy.blocked",
      actor: "publisher-worker",
      payload: {
        stage: "parlay",
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

const persistResearchBundleBlockedParlayWorkflow = async (
  unitOfWork: StorageUnitOfWork,
  research: PersistedFixtureResearchSummary | null,
  fixtureId: string,
  generatedAt: string,
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
    transitionFixtureWorkflowStage(current, "parlay", {
      status: "blocked",
      occurredAt: generatedAt,
      isCandidate: false,
      diagnostics: {
        ...(current.diagnostics ?? {}),
        researchBundleDecision: research
          ? {
              status: research.status,
              publishable: research.publishable,
              gateReasons: research.gateReasons,
            }
          : {
              status: "hold",
              publishable: false,
              gateReasons: [],
            },
      },
    }),
  );

  await unitOfWork.auditEvents.save(
    createAuditEvent({
      id: `audit:fixture-workflow:${fixtureId}:research-bundle-blocked:parlay:${persistedWorkflow.updatedAt}`,
      aggregateType: "fixture-workflow",
      aggregateId: fixtureId,
      eventType: "fixture-workflow.research-bundle.blocked",
      actor: "publisher-worker",
      payload: {
        stage: "parlay",
        status: research?.status ?? "hold",
        publishable: research?.publishable ?? false,
        gateReasons: research?.gateReasons ?? [],
      },
      occurredAt: persistedWorkflow.updatedAt,
    }),
  );
};

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

const isFixtureWithinLiveParlayWindow = (
  fixture: FixtureEntity,
  generatedAt: string,
): boolean => {
  const scheduledAtMs = Date.parse(fixture.scheduledAt);
  const generatedAtMs = Date.parse(generatedAt);

  if (!Number.isFinite(scheduledAtMs) || !Number.isFinite(generatedAtMs)) {
    return false;
  }

  return (
    scheduledAtMs >= generatedAtMs - LIVE_FIXTURE_LOOKBACK_MS &&
    scheduledAtMs <= generatedAtMs + LIVE_FIXTURE_LOOKAHEAD_MS
  );
};

const collectCandidateValidation = (
  prediction: PublishedPredictionRecord,
  generatedAt: string,
): PublisherWorkerSkipReason | null => {
  if (prediction.status !== "published") {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      reason: "not-published",
      detail: `Prediction ${prediction.id} has status ${prediction.status}`,
    };
  }

  if (prediction.market !== "moneyline") {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      reason: "unsupported-market",
      detail: `Prediction ${prediction.id} market ${prediction.market} is outside MVP moneyline scope`,
    };
  }

  if (!prediction.fixture) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      reason: "missing-fixture",
      detail: `Prediction ${prediction.id} could not load fixture ${prediction.fixtureId}`,
    };
  }

  if (!isFixtureWithinLiveParlayWindow(prediction.fixture, generatedAt)) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      reason: "outside-live-window",
      detail: `Prediction ${prediction.id} skipped because fixture ${prediction.fixtureId} is outside the live parlay window`,
    };
  }

  const implied = prediction.probabilities.implied;
  if (!Number.isFinite(implied) || implied <= 0 || implied >= 1) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      reason: "invalid-implied-probability",
      detail: `Prediction ${prediction.id} implied probability must be between 0 and 1`,
    };
  }

  return null;
};

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
  options: Pick<PublishParlayMvpOptions, "client" | "maxPredictions"> & { generatedAt?: string } = {},
): Promise<{
  readonly predictions: readonly PublishedPredictionRecord[];
  readonly candidates: readonly AtomicCandidate[];
  readonly skipReasons: readonly PublisherWorkerSkipReason[];
}> => {
  const client = (options.client ?? createVerifiedPrismaClient({ databaseUrl })) as PublisherWorkerPrismaClientLike;
  const ownsClient = options.client === undefined;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  try {
    await ensureConnectedClient(client);

    const predictions = await retryPrismaReadOperation(() =>
      client.prediction.findMany({
        where: { status: "published" },
        include: { fixture: true, aiRun: { include: { task: true } } },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { confidence: "desc" }],
        ...(options.maxPredictions !== undefined ? { take: options.maxPredictions } : {}),
      }),
    );

    const candidates: AtomicCandidate[] = [];
    const skipReasons: PublisherWorkerSkipReason[] = [];

    for (const prediction of predictions) {
      const invalid = collectCandidateValidation(prediction, generatedAt);
      if (invalid) {
        skipReasons.push(invalid);
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

const applyWorkflowSelectionRules = async (
  unitOfWork: StorageUnitOfWork,
  candidates: readonly AtomicCandidate[],
  maxLegs: number,
): Promise<{
  readonly candidates: readonly AtomicCandidate[];
  readonly skipReasons: readonly PublisherWorkerSkipReason[];
}> => {
  const fixtureIds = [...new Set(candidates.map((candidate) => candidate.fixtureId))];
  const workflowEntries = await Promise.all(
    fixtureIds.map(async (fixtureId) => [fixtureId, await unitOfWork.fixtureWorkflows.findByFixtureId(fixtureId)] as const),
  );
  const workflowMap = new Map(workflowEntries);
  const skipReasons: PublisherWorkerSkipReason[] = [];

  const eligible = candidates.filter((candidate) => {
    const workflow = workflowMap.get(candidate.fixtureId);
    if (
      workflow?.selectionOverride === "force-exclude" ||
      workflow?.manualSelectionStatus === "rejected"
    ) {
      skipReasons.push({
        predictionId: candidate.predictionId,
        fixtureId: candidate.fixtureId,
        reason: "workflow-excluded",
        detail: `Prediction ${candidate.predictionId} skipped because fixture ${candidate.fixtureId} is excluded by workflow ops`,
      });
      return false;
    }

    return true;
  });

  const prioritized = [...eligible].sort((left, right) => {
    const leftWorkflow = workflowMap.get(left.fixtureId);
    const rightWorkflow = workflowMap.get(right.fixtureId);
    const leftPriority =
      leftWorkflow?.selectionOverride === "force-include"
        ? 2
        : leftWorkflow?.manualSelectionStatus === "selected"
          ? 1
          : 0;
    const rightPriority =
      rightWorkflow?.selectionOverride === "force-include"
        ? 2
        : rightWorkflow?.manualSelectionStatus === "selected"
          ? 1
          : 0;

    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    const leftRank = scoreAtomicCandidate(left);
    const rightRank = scoreAtomicCandidate(right);
    if (rightRank.score !== leftRank.score) {
      return rightRank.score - leftRank.score;
    }

    return rightRank.edge - leftRank.edge;
  });

  const deduped = dedupeCandidatesByFixture(prioritized);

  return {
    candidates: deduped.candidates.slice(0, maxLegs),
    skipReasons: [...skipReasons, ...deduped.skipReasons],
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
  const runtimeEnv =
    options.env ??
    (options.client || options.unitOfWork
      ? {
          NODE_ENV: "test",
          GANA_RUNTIME_PROFILE: "ci-smoke",
        }
      : undefined);
  const runtimeConfig = runtimeEnv
    ? loadRuntimeConfig({ appName: "publisher-worker", env: runtimeEnv })
    : loadRuntimeConfig({ appName: "publisher-worker" });

  try {
    await ensureConnectedClient(runtime.client);

    const loaded = await retryPrismaReadOperation(() =>
      runtime.client.prediction.findMany({
        where: { status: "published" },
        include: { fixture: true, aiRun: { include: { task: true } } },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { confidence: "desc" }],
        ...(options.maxPredictions !== undefined ? { take: options.maxPredictions } : {}),
      }),
    );
    const scopedLoaded = options.predictionTaskIds
      ? loaded.filter((prediction) =>
          prediction.aiRun?.taskId !== undefined && options.predictionTaskIds?.includes(prediction.aiRun.taskId),
        )
      : loaded;

    const candidates: AtomicCandidate[] = [];
    const skipReasons: PublisherWorkerSkipReason[] = [];
    const shouldEvaluateResearchBundle = options.unitOfWork !== undefined || options.client === undefined;
    const shouldEvaluateCoveragePolicy = options.unitOfWork !== undefined || options.client === undefined;
    const coverageContext = shouldEvaluateCoveragePolicy
      ? await loadPublisherCoveragePolicyContext(runtime.unitOfWork)
      : null;

    for (const prediction of scopedLoaded) {
      const invalid = collectCandidateValidation(prediction, generatedAt);
      if (invalid) {
        skipReasons.push(invalid);
        continue;
      }

      if (shouldEvaluateResearchBundle) {
        const persistedResearch = await loadFixtureResearchSummary(
          runtime.unitOfWork,
          prediction.fixtureId,
        );
        if (!persistedResearch?.publishable) {
          await persistResearchBundleBlockedParlayWorkflow(
            runtime.unitOfWork,
            persistedResearch,
            prediction.fixtureId,
            generatedAt,
          );
          skipReasons.push({
            predictionId: prediction.id,
            fixtureId: prediction.fixtureId,
            reason: "research-bundle-blocked",
            detail: summarizeResearchBlock(persistedResearch),
          });
          continue;
        }
      }

      const workflow = shouldEvaluateCoveragePolicy
        ? await runtime.unitOfWork.fixtureWorkflows.findByFixtureId(prediction.fixtureId)
        : undefined;
      if (coverageContext?.hasPersistedPolicy) {
        const minDetectedOdd = workflow?.minDetectedOdd ?? inferPredictionMinDetectedOdd(prediction);
        const coverageDecision = evaluateFixtureCoverageScope({
          fixture: prediction.fixture!,
          ...(workflow ? { workflow } : {}),
          leaguePolicies: coverageContext.leaguePolicies,
          teamPolicies: coverageContext.teamPolicies,
          dailyPolicy: coverageContext.dailyPolicy,
          ...(minDetectedOdd !== undefined ? { minDetectedOdd } : {}),
          now: generatedAt,
        });
        if (!coverageDecision.eligibleForParlay) {
          await persistCoverageBlockedParlayWorkflow(
            runtime.unitOfWork,
            prediction.fixtureId,
            generatedAt,
            coverageDecision,
          );
          skipReasons.push({
            predictionId: prediction.id,
            fixtureId: prediction.fixtureId,
            reason: "coverage-policy-blocked",
            detail: summarizeCoverageBlock(coverageDecision.excludedBy),
          });
          continue;
        }
      }

      candidates.push(toAtomicCandidateFromPrediction(prediction));
    }

    const selectedByWorkflow = options.unitOfWork
      ? await applyWorkflowSelectionRules(runtime.unitOfWork, candidates, maxLegs)
      : dedupeCandidatesByFixture(candidates);
    const selectedCandidates = selectedByWorkflow.candidates;
    const mergedSkips = [...skipReasons, ...selectedByWorkflow.skipReasons];

    if (selectedCandidates.length === 0) {
      return {
        generatedAt,
        status: "skipped",
        scorecard: createEmptyScorecard([`requires at least ${minLegs} legs`]),
        loadedPredictionCount: scopedLoaded.length,
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
        loadedPredictionCount: scopedLoaded.length,
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

    const selectedPredictionMap = new Map(scopedLoaded.map((prediction) => [prediction.id, prediction] as const));
    const selectedPredictionLineages = built.selectedCandidates
      .map((candidate) => selectedPredictionMap.get(candidate.predictionId))
      .flatMap((prediction) => (prediction ? [extractPredictionLineage(prediction)] : []));
    const publicationDecision = evaluatePublicationReadiness({
      actor: options.publication?.actor ?? defaultPublicationActor(runtimeConfig),
      channel: options.publication?.channel ?? defaultPublicationChannel(runtimeConfig),
      ...(options.publication?.gateConfig ? { gateConfig: options.publication.gateConfig } : {}),
      lineage: options.publication?.lineage ?? deriveRuntimePublicationLineage(runtimeConfig),
      sourceLineages: selectedPredictionLineages,
    });

    if (!publicationDecision.allowed) {
      return {
        generatedAt,
        status: "skipped",
        scorecard: built.scorecard,
        loadedPredictionCount: scopedLoaded.length,
        candidateCount: candidates.length,
        selectedCandidates: built.selectedCandidates,
        skipReasons: [
          ...mergedSkips,
          {
            reason: "publication-blocked",
            detail: publicationDecision.reasons.map((reason: { message: string }) => reason.message).join("; "),
          },
        ],
        publicationDecision,
      };
    }

    const parlay = await runtime.unitOfWork.parlays.save(built.parlay);
    await persistParlayWorkflow(
      runtime.unitOfWork,
      [...new Set(parlay.legs.map((leg) => leg.fixtureId))],
      generatedAt,
    );
    return {
      generatedAt,
      status: "persisted",
      parlay,
      scorecard: built.scorecard,
      loadedPredictionCount: loaded.length,
      candidateCount: candidates.length,
      selectedCandidates: built.selectedCandidates,
      skipReasons: mergedSkips,
      publicationDecision,
    };
  } finally {
    await runtime.disconnect();
  }
};

export const runPublisherWorker = publishParlayMvp;

export const createDemoPublisherWorkerResult = async (): Promise<PublishParlayMvpResult> =>
  publishParlayMvp(undefined, { generatedAt: DEFAULT_GENERATED_AT, stake: DEFAULT_STAKE });
