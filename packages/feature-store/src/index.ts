import type { FixtureEntity } from "@gana-v8/domain-core";
import type {
  ResearchDossier,
  ResearchSignalSnapshot,
} from "@gana-v8/research-engine";

export const workspaceInfo = {
  packageName: "@gana-v8/feature-store",
  workspaceName: "feature-store",
  category: "package",
  description: "Feature vector snapshots derived from structured research signals and research dossiers.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/research-engine", category: "workspace" },
  ],
} as const;

export interface FeatureReadiness {
  readonly status: "ready" | "needs-review";
  readonly reasons: readonly string[];
}

export interface TopEvidenceFeature {
  readonly id: string;
  readonly title: string;
  readonly direction: string;
  readonly weightedScore: number;
}

export interface ResearchTraceMetadata {
  readonly synthesisMode: "deterministic" | "ai-assisted" | "ai-fallback";
  readonly aiRunId?: string;
  readonly aiProvider?: string;
  readonly aiModel?: string;
  readonly aiPromptVersion?: string;
  readonly providerRequestId?: string;
  readonly fallbackSummary?: string;
}

export interface FeatureVectorValues {
  readonly researchScoreHome: number;
  readonly researchScoreDraw: number;
  readonly researchScoreAway: number;
  readonly formHome: number;
  readonly formAway: number;
  readonly restHomeDays: number;
  readonly restAwayDays: number;
  readonly injuriesHome: number;
  readonly injuriesAway: number;
  readonly derby: number;
  readonly hoursUntilKickoff: number;
}

export interface FeatureVectorSnapshot {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly recommendedLean: ResearchDossier["recommendedLean"];
  readonly evidenceCount: number;
  readonly topEvidence: readonly TopEvidenceFeature[];
  readonly risks: readonly string[];
  readonly features: FeatureVectorValues;
  readonly readiness: FeatureReadiness;
  readonly researchTrace?: ResearchTraceMetadata;
}

export interface BuildFeatureVectorSnapshotInput {
  readonly fixture: FixtureEntity;
  readonly dossier: ResearchDossier;
  readonly generatedAt?: string;
  readonly researchTrace?: ResearchTraceMetadata;
  readonly signals?: Pick<ResearchSignalSnapshot, "form" | "schedule" | "availability" | "context">;
}

const toNumber = (value: string | undefined, fallback = 0): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value: number): number => Number(value.toFixed(4));

const pickTopEvidenceFeatures = (
  dossier: ResearchDossier,
  limit = 3,
): TopEvidenceFeature[] => {
  return [...dossier.evidence]
    .sort((left, right) => right.impact * right.confidence - left.impact * left.confidence)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      direction: item.direction,
      weightedScore: round(item.impact * item.confidence),
    }));
};

const createInitialReadiness = (
  fixture: FixtureEntity,
  dossier: ResearchDossier,
  topEvidence: readonly TopEvidenceFeature[],
): FeatureReadiness => {
  const reasons: string[] = [];

  if (fixture.status !== "scheduled") {
    reasons.push(`fixture status is ${fixture.status}, expected scheduled`);
  }
  if (dossier.evidence.length === 0) {
    reasons.push("research dossier has no evidence items");
  }
  if (topEvidence.length === 0) {
    reasons.push("feature snapshot has no ranked evidence");
  }
  if (
    dossier.directionalScore.home === 0 &&
    dossier.directionalScore.draw === 0 &&
    dossier.directionalScore.away === 0
  ) {
    reasons.push("research directional scores are all zero");
  }

  return {
    status: reasons.length === 0 ? "ready" : "needs-review",
    reasons,
  };
};

export const summarizeFeatureReadiness = (
  snapshot: FeatureVectorSnapshot,
): FeatureReadiness => {
  const reasons = [...snapshot.readiness.reasons];

  if (snapshot.evidenceCount === 0 && !reasons.some((reason) => reason.includes("evidence"))) {
    reasons.push("feature snapshot has no evidence backing");
  }

  return {
    status: reasons.length === 0 ? "ready" : "needs-review",
    reasons,
  };
};

const resolveFeatureSignalValues = (
  fixture: FixtureEntity,
  signals: BuildFeatureVectorSnapshotInput["signals"],
): Omit<FeatureVectorValues, "researchScoreHome" | "researchScoreDraw" | "researchScoreAway" | "hoursUntilKickoff"> => ({
  formHome: signals?.form?.home ?? toNumber(fixture.metadata.formHome),
  formAway: signals?.form?.away ?? toNumber(fixture.metadata.formAway),
  restHomeDays: signals?.schedule?.restHomeDays ?? toNumber(fixture.metadata.restHomeDays),
  restAwayDays: signals?.schedule?.restAwayDays ?? toNumber(fixture.metadata.restAwayDays),
  injuriesHome: signals?.availability?.injuriesHome ?? toNumber(fixture.metadata.injuriesHome),
  injuriesAway: signals?.availability?.injuriesAway ?? toNumber(fixture.metadata.injuriesAway),
  derby: (signals?.context?.derby ?? (fixture.metadata.derby === "true")) ? 1 : 0,
});

export const buildFeatureVectorSnapshot = (
  input: BuildFeatureVectorSnapshotInput,
): FeatureVectorSnapshot => {
  const generatedAt = input.generatedAt ?? input.dossier.generatedAt;
  const generatedAtMs = Date.parse(generatedAt);
  const scheduledAtMs = Date.parse(input.fixture.scheduledAt);
  const topEvidence = pickTopEvidenceFeatures(input.dossier, 3);
  const signalValues = resolveFeatureSignalValues(input.fixture, input.signals);

  const snapshot: FeatureVectorSnapshot = {
    fixtureId: input.fixture.id,
    generatedAt,
    recommendedLean: input.dossier.recommendedLean,
    evidenceCount: input.dossier.evidence.length,
    topEvidence,
    risks: [...input.dossier.risks],
    features: {
      researchScoreHome: input.dossier.directionalScore.home,
      researchScoreDraw: input.dossier.directionalScore.draw,
      researchScoreAway: input.dossier.directionalScore.away,
      ...signalValues,
      hoursUntilKickoff:
        Number.isFinite(generatedAtMs) && Number.isFinite(scheduledAtMs)
          ? round((scheduledAtMs - generatedAtMs) / 3_600_000)
          : 0,
    },
    readiness: {
      status: "ready",
      reasons: [],
    },
    ...(input.researchTrace ? { researchTrace: input.researchTrace } : {}),
  };

  const readiness = createInitialReadiness(input.fixture, input.dossier, topEvidence);
  return {
    ...snapshot,
    readiness,
  };
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
