import type { FixtureEntity } from "@gana-v8/domain-core";
import type { ResearchDossier } from "@gana-v8/research-engine";

export const workspaceInfo = {
  packageName: "@gana-v8/feature-store",
  workspaceName: "feature-store",
  category: "package",
  description: "Feature vector snapshots derived from fixture metadata and research dossiers.",
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
}

export interface BuildFeatureVectorSnapshotInput {
  readonly fixture: FixtureEntity;
  readonly dossier: ResearchDossier;
  readonly generatedAt?: string;
}

export interface PersistedFeatureSnapshotMetadata {
  readonly researchGeneratedAt?: string;
  readonly researchRecommendedLean?: FeatureVectorSnapshot["recommendedLean"];
  readonly researchEvidenceCount?: number;
  readonly researchTopEvidenceIds: readonly string[];
  readonly researchTopEvidenceTitles: readonly string[];
  readonly researchRiskSummary: readonly string[];
  readonly featureReadinessStatus?: FeatureReadiness["status"];
  readonly featureReadinessReasons: readonly string[];
  readonly featureScoreHome?: number;
  readonly featureScoreDraw?: number;
  readonly featureScoreAway?: number;
}

const toNumber = (value: string | undefined, fallback = 0): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitMetadataList = (value: string | undefined): string[] =>
  value
    ?.split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0) ?? [];

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

export const summarizePersistedFeatureMetadata = (
  fixture: FixtureEntity,
): PersistedFeatureSnapshotMetadata => ({
  ...(fixture.metadata.researchGeneratedAt !== undefined
    ? { researchGeneratedAt: fixture.metadata.researchGeneratedAt }
    : {}),
  ...(fixture.metadata.researchRecommendedLean !== undefined
    ? {
        researchRecommendedLean:
          fixture.metadata.researchRecommendedLean as FeatureVectorSnapshot["recommendedLean"],
      }
    : {}),
  ...(fixture.metadata.researchEvidenceCount !== undefined
    ? { researchEvidenceCount: toNumber(fixture.metadata.researchEvidenceCount, 0) }
    : {}),
  researchTopEvidenceIds: splitMetadataList(fixture.metadata.researchTopEvidenceIds),
  researchTopEvidenceTitles: splitMetadataList(fixture.metadata.researchTopEvidenceTitles),
  researchRiskSummary: splitMetadataList(fixture.metadata.researchRiskSummary),
  ...(fixture.metadata.featureReadinessStatus !== undefined
    ? {
        featureReadinessStatus:
          fixture.metadata.featureReadinessStatus as FeatureReadiness["status"],
      }
    : {}),
  featureReadinessReasons: splitMetadataList(fixture.metadata.featureReadinessReasons),
  ...(fixture.metadata.featureScoreHome !== undefined
    ? { featureScoreHome: toNumber(fixture.metadata.featureScoreHome, 0) }
    : {}),
  ...(fixture.metadata.featureScoreDraw !== undefined
    ? { featureScoreDraw: toNumber(fixture.metadata.featureScoreDraw, 0) }
    : {}),
  ...(fixture.metadata.featureScoreAway !== undefined
    ? { featureScoreAway: toNumber(fixture.metadata.featureScoreAway, 0) }
    : {}),
});

export const applyFeatureSnapshotToFixture = (
  fixture: FixtureEntity,
  snapshot: FeatureVectorSnapshot,
): FixtureEntity => ({
  ...fixture,
  metadata: {
    ...fixture.metadata,
    researchGeneratedAt: snapshot.generatedAt,
    researchRecommendedLean: snapshot.recommendedLean,
    researchEvidenceCount: String(snapshot.evidenceCount),
    researchTopEvidenceIds: snapshot.topEvidence.map((item) => item.id).join(" | "),
    researchTopEvidenceTitles: snapshot.topEvidence.map((item) => item.title).join(" | "),
    researchRiskSummary: snapshot.risks.join(" | "),
    featureReadinessStatus: snapshot.readiness.status,
    featureReadinessReasons: snapshot.readiness.reasons.join(" | "),
    featureScoreHome: String(snapshot.features.researchScoreHome),
    featureScoreDraw: String(snapshot.features.researchScoreDraw),
    featureScoreAway: String(snapshot.features.researchScoreAway),
  },
  updatedAt: snapshot.generatedAt,
});

export const buildFeatureVectorSnapshot = (
  input: BuildFeatureVectorSnapshotInput,
): FeatureVectorSnapshot => {
  const generatedAt = input.generatedAt ?? input.dossier.generatedAt;
  const generatedAtMs = Date.parse(generatedAt);
  const scheduledAtMs = Date.parse(input.fixture.scheduledAt);
  const topEvidence = pickTopEvidenceFeatures(input.dossier, 3);

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
      formHome: toNumber(input.fixture.metadata.formHome),
      formAway: toNumber(input.fixture.metadata.formAway),
      restHomeDays: toNumber(input.fixture.metadata.restHomeDays),
      restAwayDays: toNumber(input.fixture.metadata.restAwayDays),
      injuriesHome: toNumber(input.fixture.metadata.injuriesHome),
      injuriesAway: toNumber(input.fixture.metadata.injuriesAway),
      derby: input.fixture.metadata.derby === "true" ? 1 : 0,
      hoursUntilKickoff:
        Number.isFinite(generatedAtMs) && Number.isFinite(scheduledAtMs)
          ? round((scheduledAtMs - generatedAtMs) / 3_600_000)
          : 0,
    },
    readiness: {
      status: "ready",
      reasons: [],
    },
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
