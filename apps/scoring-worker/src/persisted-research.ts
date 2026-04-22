import type {
  AiRunEntity,
  FeatureSnapshotEntity,
  ResearchBundleEntity,
} from "@gana-v8/domain-core";
import type { StorageUnitOfWork } from "@gana-v8/storage-adapters";

export type PersistedResearchBundleStatus = "publishable" | "degraded" | "hold";

export interface PersistedResearchGateReason {
  readonly code?: string | null;
  readonly severity?: string | null;
  readonly message: string;
}

export interface PersistedResearchTrace {
  readonly synthesisMode: "deterministic" | "ai-assisted" | "ai-fallback";
  readonly aiRunId?: string;
  readonly aiProvider?: string;
  readonly aiModel?: string;
  readonly aiPromptVersion?: string;
  readonly providerRequestId?: string;
  readonly fallbackSummary?: string;
}

export interface PersistedFixtureResearch {
  readonly fixtureId: string;
  readonly status: PersistedResearchBundleStatus;
  readonly publishable: boolean;
  readonly gateReasons: readonly PersistedResearchGateReason[];
  readonly latestBundleGeneratedAt: string;
  readonly latestSnapshotGeneratedAt?: string;
  readonly recommendedLean?: "home" | "away" | "draw";
  readonly featureReadinessStatus?: "ready" | "needs-review";
  readonly featureReadinessReasons: readonly string[];
  readonly topEvidenceTitles: readonly string[];
  readonly researchTrace: PersistedResearchTrace | null;
}

interface PersistedResearchRepositoryCollectionLike {
  readonly researchBundles?: {
    list(): Promise<ResearchBundleEntity[]>;
    findLatestByFixtureId?(fixtureId: string): Promise<ResearchBundleEntity | null>;
  };
  readonly featureSnapshots?: {
    list(): Promise<FeatureSnapshotEntity[]>;
    findLatestByFixtureId?(fixtureId: string): Promise<FeatureSnapshotEntity | null>;
  };
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === "string" && entry.trim().length > 0 ? [entry] : []));
  }

  if (typeof value === "string") {
    return value
      .split("|")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
};

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBundleStatus = (value: unknown): PersistedResearchBundleStatus | null => {
  const normalized = asString(value)?.trim().toLowerCase();
  return normalized === "publishable" || normalized === "degraded" || normalized === "hold"
    ? normalized
    : null;
};

const defaultSeverity = (status: PersistedResearchBundleStatus): string =>
  status === "hold" ? "block" : status === "degraded" ? "warn" : "info";

const sortByIsoDescending = <T>(
  items: readonly T[],
  selector: (item: T) => string,
): T[] =>
  [...items].sort((left, right) => selector(right).localeCompare(selector(left)));

const normalizeGateReasons = (
  value: unknown,
  status: PersistedResearchBundleStatus,
  fallbackMessages: readonly string[] = [],
): PersistedResearchGateReason[] => {
  const reasons = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (typeof entry === "string" && entry.trim().length > 0) {
          return [{
            message: entry,
            severity: defaultSeverity(status),
          } satisfies PersistedResearchGateReason];
        }

        const record = asRecord(entry);
        const message = asString(record?.message);
        if (!message) {
          return [];
        }

        return [{
          message,
          ...(asString(record?.code) ? { code: asString(record?.code) } : {}),
          ...(asString(record?.severity) ? { severity: asString(record?.severity) } : {}),
        } satisfies PersistedResearchGateReason];
      })
    : [];

  return reasons.length > 0
    ? reasons
    : fallbackMessages.map((message) => ({
        message,
        severity: defaultSeverity(status),
      }));
};

const normalizeResearchTrace = (
  value: unknown,
  aiRun?: AiRunEntity | null,
): PersistedResearchTrace | null => {
  const record = asRecord(value);
  const synthesisMode = asString(record?.synthesisMode);
  const resolvedMode =
    synthesisMode === "deterministic" || synthesisMode === "ai-assisted" || synthesisMode === "ai-fallback"
      ? synthesisMode
      : aiRun?.status === "failed"
        ? "ai-fallback"
        : aiRun
          ? "ai-assisted"
          : null;

  if (!resolvedMode) {
    return null;
  }

  const trace: PersistedResearchTrace = {
    synthesisMode: resolvedMode,
  };

  return {
    ...trace,
    ...(asString(record?.aiRunId) ?? aiRun?.id ? { aiRunId: asString(record?.aiRunId) ?? aiRun?.id } : {}),
    ...(asString(record?.aiProvider) ?? aiRun?.provider
      ? { aiProvider: asString(record?.aiProvider) ?? aiRun?.provider }
      : {}),
    ...(asString(record?.aiModel) ?? aiRun?.model
      ? { aiModel: asString(record?.aiModel) ?? aiRun?.model }
      : {}),
    ...(asString(record?.aiPromptVersion) ?? aiRun?.promptVersion
      ? { aiPromptVersion: asString(record?.aiPromptVersion) ?? aiRun?.promptVersion }
      : {}),
    ...(asString(record?.providerRequestId) ?? aiRun?.providerRequestId
      ? { providerRequestId: asString(record?.providerRequestId) ?? aiRun?.providerRequestId }
      : {}),
    ...(asString(record?.fallbackSummary) ?? aiRun?.error
      ? { fallbackSummary: asString(record?.fallbackSummary) ?? aiRun?.error }
      : {}),
  } as PersistedResearchTrace;
};

const toPersistedFixtureResearch = (input: {
  readonly fixtureId: string;
  readonly status: PersistedResearchBundleStatus;
  readonly latestBundleGeneratedAt: string;
  readonly latestSnapshotGeneratedAt?: string;
  readonly recommendedLean?: "home" | "away" | "draw";
  readonly featureReadinessStatus?: "ready" | "needs-review";
  readonly featureReadinessReasons?: readonly string[];
  readonly topEvidenceTitles?: readonly string[];
  readonly gateReasons?: readonly PersistedResearchGateReason[];
  readonly researchTrace?: PersistedResearchTrace | null;
}): PersistedFixtureResearch => ({
  fixtureId: input.fixtureId,
  status: input.status,
  publishable: input.status === "publishable",
  gateReasons: [...(input.gateReasons ?? [])],
  latestBundleGeneratedAt: input.latestBundleGeneratedAt,
  ...(input.latestSnapshotGeneratedAt ? { latestSnapshotGeneratedAt: input.latestSnapshotGeneratedAt } : {}),
  ...(input.recommendedLean ? { recommendedLean: input.recommendedLean } : {}),
  ...(input.featureReadinessStatus ? { featureReadinessStatus: input.featureReadinessStatus } : {}),
  featureReadinessReasons: [...(input.featureReadinessReasons ?? [])],
  topEvidenceTitles: [...(input.topEvidenceTitles ?? [])],
  researchTrace: input.researchTrace ?? null,
});

const findLatestByFixtureId = <T extends { readonly fixtureId: string; readonly generatedAt: string }>(
  items: readonly T[],
  fixtureId: string,
): T | null =>
  sortByIsoDescending(
    items.filter((item) => item.fixtureId === fixtureId),
    (item) => item.generatedAt,
  )[0] ?? null;

const loadResearchFromRepositories = async (
  fixtureId: string,
  unitOfWork: PersistedResearchRepositoryCollectionLike,
  aiRuns: readonly AiRunEntity[],
): Promise<PersistedFixtureResearch | null> => {
  if (!unitOfWork.researchBundles && !unitOfWork.featureSnapshots) {
    return null;
  }

  const [bundles, snapshots] = await Promise.all([
    unitOfWork.researchBundles?.list() ?? Promise.resolve([]),
    unitOfWork.featureSnapshots?.list() ?? Promise.resolve([]),
  ]);
  const latestBundle = findLatestByFixtureId(bundles, fixtureId);
  const latestSnapshot = findLatestByFixtureId(snapshots, fixtureId);

  if (!latestBundle && !latestSnapshot) {
    return null;
  }

  const aiRunsById = new Map(aiRuns.map((aiRun) => [aiRun.id, aiRun]));
  const trace =
    latestSnapshot?.researchTrace
      ? normalizeResearchTrace(
          latestSnapshot.researchTrace,
          latestSnapshot.researchTrace.aiRunId
            ? aiRunsById.get(latestSnapshot.researchTrace.aiRunId) ?? null
            : null,
        )
      : normalizeResearchTrace(
          latestBundle?.trace,
          latestBundle?.aiRunId ? aiRunsById.get(latestBundle.aiRunId) ?? null : null,
        );
  const status = latestSnapshot?.bundleStatus ?? latestBundle?.gateResult.status ?? "hold";

  return toPersistedFixtureResearch({
    fixtureId,
    status,
    latestBundleGeneratedAt: latestBundle?.generatedAt ?? latestSnapshot?.generatedAt ?? latestBundle?.updatedAt ?? new Date(0).toISOString(),
    ...(latestSnapshot ? { latestSnapshotGeneratedAt: latestSnapshot.generatedAt } : {}),
    ...(latestSnapshot?.recommendedLean ?? latestBundle?.recommendedLean
      ? {
          recommendedLean:
            (latestSnapshot?.recommendedLean ?? latestBundle?.recommendedLean) as "home" | "away" | "draw",
        }
      : {}),
    ...(latestSnapshot ? { featureReadinessStatus: latestSnapshot.readiness.status } : {}),
    featureReadinessReasons: latestSnapshot?.readiness.reasons ?? [],
    topEvidenceTitles: latestSnapshot?.topEvidence.map((item) => item.title) ?? [],
    gateReasons:
      latestSnapshot
        ? normalizeGateReasons(latestSnapshot.gateReasons, latestSnapshot.bundleStatus)
        : normalizeGateReasons(latestBundle?.gateResult.reasons, status),
    researchTrace: trace,
  });
};

export const loadPersistedFixtureResearch = async (input: {
  readonly fixtureId: string;
  readonly unitOfWork: Pick<StorageUnitOfWork, "aiRuns"> & PersistedResearchRepositoryCollectionLike;
}): Promise<PersistedFixtureResearch | null> => {
  const aiRuns = await input.unitOfWork.aiRuns.list();
  return loadResearchFromRepositories(input.fixtureId, input.unitOfWork, aiRuns);
};

export const formatPersistedResearchGateSummary = (
  research: PersistedFixtureResearch | null,
): string =>
  research?.gateReasons.map((reason) => reason.message).join("; ") ?? "";
