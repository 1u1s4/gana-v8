import type {
  AiRunEntity,
  FeatureSnapshotEntity,
  ResearchBundleEntity,
  TaskEntity,
  TaskRunEntity,
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

const loadResearchFromClientModels = async (
  fixtureId: string,
  client: Record<string, unknown> | undefined,
): Promise<{
  readonly bundle: ResearchBundleEntity | null;
  readonly snapshot: FeatureSnapshotEntity | null;
} | null> => {
  if (!client) {
    return null;
  }

  const researchBundleModel = asRecord(Reflect.get(client, "researchBundle"));
  const featureSnapshotModel = asRecord(Reflect.get(client, "featureSnapshot"));
  const bundleFindFirst = researchBundleModel?.findFirst;
  const snapshotFindFirst = featureSnapshotModel?.findFirst;

  if (typeof bundleFindFirst !== "function" && typeof snapshotFindFirst !== "function") {
    return null;
  }

  const [bundle, snapshot] = await Promise.all([
    typeof bundleFindFirst === "function"
      ? (bundleFindFirst as (args: Record<string, unknown>) => Promise<ResearchBundleEntity | null>)({
          where: { fixtureId },
          orderBy: [{ generatedAt: "desc" }],
        })
      : Promise.resolve(null),
    typeof snapshotFindFirst === "function"
      ? (snapshotFindFirst as (args: Record<string, unknown>) => Promise<FeatureSnapshotEntity | null>)({
          where: { fixtureId },
          orderBy: [{ generatedAt: "desc" }],
        })
      : Promise.resolve(null),
  ]);

  return { bundle, snapshot };
};

const extractFixtureIdFromTask = (task: TaskEntity): string | null =>
  asString(asRecord(task.payload)?.fixtureId);

const loadResearchFromTaskArtifacts = async (
  fixtureId: string,
  unitOfWork: Pick<StorageUnitOfWork, "tasks" | "taskRuns" | "aiRuns">,
): Promise<PersistedFixtureResearch | null> => {
  const tasks = (await unitOfWork.tasks.list()).filter(
    (task) => task.kind === "research" && extractFixtureIdFromTask(task) === fixtureId,
  );
  if (tasks.length === 0) {
    return null;
  }

  const taskCandidates = await Promise.all(
    tasks.map(async (task) => {
      const [taskRuns, aiRuns] = await Promise.all([
        unitOfWork.taskRuns.findByTaskId(task.id),
        unitOfWork.aiRuns.findByTaskId(task.id),
      ]);
      const taskRun = sortByIsoDescending(taskRuns, (candidate) => candidate.finishedAt ?? candidate.updatedAt)[0] ?? null;
      if (!taskRun) {
        return null;
      }

      const result = asRecord(taskRun.result);
      if (!result) {
        return null;
      }

      const bundleRecord = asRecord(result.latestBundle ?? result.bundle);
      const bundleGateResult = asRecord(bundleRecord?.gateResult);
      const snapshotRecord = asRecord(result.latestSnapshot ?? result.featureSnapshot ?? result.snapshot);
      const snapshotReadiness = asRecord(snapshotRecord?.readiness);
      const traceRecord = asRecord(result.researchTrace ?? result.trace);
      if (bundleRecord === null && snapshotRecord === null) {
        return null;
      }

      const aiRunsById = new Map(aiRuns.map((aiRun) => [aiRun.id, aiRun]));
      const aiRunId =
        asString(bundleRecord?.aiRunId) ??
        asString(asRecord(snapshotRecord?.researchTrace)?.aiRunId) ??
        asString(asRecord(bundleRecord?.trace)?.aiRunId) ??
        asString(snapshotRecord?.aiRunId) ??
        asString(traceRecord?.aiRunId) ??
        asString(result.aiRunId);
      const aiRun =
        (aiRunId ? aiRunsById.get(aiRunId) : null) ??
        sortByIsoDescending(aiRuns, (candidate) => candidate.updatedAt)[0] ??
        null;
      const featureReadinessStatus =
        asString(snapshotReadiness?.status);
      const featureReadinessReasons =
        asStringArray(snapshotReadiness?.reasons);
      const status =
        asBundleStatus(bundleGateResult?.status) ??
        asBundleStatus(snapshotRecord?.bundleStatus) ??
        null;
      if (status === null) {
        return null;
      }
      const latestSnapshotGeneratedAt =
        asString(snapshotRecord?.generatedAt) ??
        null;
      const topEvidenceTitles = Array.isArray(snapshotRecord?.topEvidence)
        ? snapshotRecord.topEvidence.flatMap((entry) => {
            const title = asString(asRecord(entry)?.title);
            return title ? [title] : [];
          })
        : [];

      return toPersistedFixtureResearch({
        fixtureId,
        status,
        latestBundleGeneratedAt:
          asString(bundleRecord?.generatedAt) ??
          latestSnapshotGeneratedAt ??
          taskRun.finishedAt ??
          taskRun.updatedAt ??
          task.updatedAt,
        ...(latestSnapshotGeneratedAt ? { latestSnapshotGeneratedAt } : {}),
        ...(asString(snapshotRecord?.recommendedLean) ??
        asString(bundleRecord?.recommendedLean)
          ? {
              recommendedLean:
                (asString(snapshotRecord?.recommendedLean) ??
                  asString(bundleRecord?.recommendedLean)) as "home" | "away" | "draw",
            }
          : {}),
        ...(featureReadinessStatus === "ready" || featureReadinessStatus === "needs-review"
          ? { featureReadinessStatus }
          : {}),
        featureReadinessReasons,
        topEvidenceTitles,
        gateReasons: normalizeGateReasons(
          snapshotRecord?.gateReasons ?? bundleGateResult?.reasons,
          status,
          featureReadinessReasons,
        ),
        researchTrace: normalizeResearchTrace(
          snapshotRecord?.researchTrace ?? bundleRecord?.trace ?? result.researchTrace ?? result.trace,
          aiRun,
        ),
      });
    }),
  );

  return sortByIsoDescending(
    taskCandidates.filter((candidate): candidate is PersistedFixtureResearch => candidate !== null),
    (candidate) => candidate.latestBundleGeneratedAt,
  )[0] ?? null;
};

export const loadPersistedFixtureResearch = async (input: {
  readonly fixtureId: string;
  readonly unitOfWork: Pick<StorageUnitOfWork, "tasks" | "taskRuns" | "aiRuns"> & PersistedResearchRepositoryCollectionLike;
  readonly client?: Record<string, unknown>;
}): Promise<PersistedFixtureResearch | null> => {
  const aiRuns = await input.unitOfWork.aiRuns.list();
  const fromRepositories = await loadResearchFromRepositories(input.fixtureId, input.unitOfWork, aiRuns);
  if (fromRepositories) {
    return fromRepositories;
  }

  const fromClientModels = await loadResearchFromClientModels(input.fixtureId, input.client);
  if (fromClientModels?.bundle || fromClientModels?.snapshot) {
    const trace =
      fromClientModels.snapshot?.researchTrace
        ? normalizeResearchTrace(
            fromClientModels.snapshot.researchTrace,
            fromClientModels.snapshot.researchTrace.aiRunId
              ? aiRuns.find((candidate) => candidate.id === fromClientModels.snapshot!.researchTrace?.aiRunId) ?? null
              : null,
          )
        : normalizeResearchTrace(
            fromClientModels.bundle?.trace,
            fromClientModels.bundle?.aiRunId
              ? aiRuns.find((candidate) => candidate.id === fromClientModels.bundle!.aiRunId) ?? null
              : null,
          );
    const status =
      fromClientModels.snapshot?.bundleStatus ?? fromClientModels.bundle?.gateResult.status ?? "hold";
    return toPersistedFixtureResearch({
      fixtureId: input.fixtureId,
      status,
      latestBundleGeneratedAt:
        fromClientModels.bundle?.generatedAt ??
        fromClientModels.snapshot?.generatedAt ??
        fromClientModels.bundle?.updatedAt ??
        new Date(0).toISOString(),
      ...(fromClientModels.snapshot ? { latestSnapshotGeneratedAt: fromClientModels.snapshot.generatedAt } : {}),
      ...(fromClientModels.snapshot?.recommendedLean ?? fromClientModels.bundle?.recommendedLean
        ? {
            recommendedLean:
              (fromClientModels.snapshot?.recommendedLean ??
                fromClientModels.bundle?.recommendedLean) as "home" | "away" | "draw",
          }
        : {}),
      ...(fromClientModels.snapshot ? { featureReadinessStatus: fromClientModels.snapshot.readiness.status } : {}),
      featureReadinessReasons: fromClientModels.snapshot?.readiness.reasons ?? [],
      topEvidenceTitles: fromClientModels.snapshot?.topEvidence.map((item) => item.title) ?? [],
      gateReasons:
        fromClientModels.snapshot
          ? normalizeGateReasons(fromClientModels.snapshot.gateReasons, fromClientModels.snapshot.bundleStatus)
          : normalizeGateReasons(fromClientModels.bundle?.gateResult.reasons, status),
      researchTrace: trace,
    });
  }

  return loadResearchFromTaskArtifacts(input.fixtureId, input.unitOfWork);
};

export const formatPersistedResearchGateSummary = (
  research: PersistedFixtureResearch | null,
): string =>
  research?.gateReasons.map((reason) => reason.message).join("; ") ?? "";
