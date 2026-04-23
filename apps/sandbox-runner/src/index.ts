import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

import {
  buildReplayTimeline,
  compareFixturePacks,
  createSandboxPolicySnapshot,
  createCronValidationPlan,
  createGoldenFixturePackFingerprint,
  createSandboxRunManifest,
  createVirtualClockPlan,
  describeWorkspace as describeFixtureWorkspace,
  getSyntheticFixturePack,
  listSandboxProfiles,
  listSyntheticFixturePackIds,
  summarizeNamespaces,
  validateSandboxProfileConfig,
  type RunnerMode,
  type SandboxPolicySnapshot,
  type SandboxProfileName,
  type SandboxRunManifest,
} from "../../../packages/testing-fixtures/dist/index.js";
import {
  evaluateSandboxPromotion,
  type SandboxPromotionReport,
} from "../../../packages/policy-engine/dist/index.js";
import {
  createObservabilityKit,
  createPrismaDurableObservabilitySink,
  type ObservabilitySink,
  type TelemetryEntityRefs,
} from "../../../packages/observability/dist/index.js";

export const workspaceInfo = {
  packageName: "@gana-v8/sandbox-runner",
  workspaceName: "sandbox-runner",
  category: "app",
  description:
    "Isolated sandbox execution entrypoint for smoke, replay, and cron validation workflows.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/dev-cli", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/testing-fixtures", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface SandboxRunnerOptions {
  readonly mode: RunnerMode;
  readonly profileName: SandboxProfileName;
  readonly packId: string;
  readonly gitSha: string;
  readonly now?: Date;
}

export interface SandboxRunSummary {
  readonly mode: RunnerMode;
  readonly sandboxId: string;
  readonly runId: string;
  readonly fixturePackId: string;
  readonly profileName: SandboxProfileName;
  readonly namespaceKeys: readonly string[];
  readonly assertions: readonly string[];
  readonly providerModes: Readonly<Record<string, string>>;
  readonly stats: {
    readonly fixtureCount: number;
    readonly completedFixtures: number;
    readonly replayEventCount: number;
    readonly replayChannels: readonly string[];
    readonly cronJobsValidated: number;
  };
  readonly clock: {
    readonly mode: "real" | "virtual";
    readonly startAt: string;
    readonly endAt: string;
    readonly tickCount: number;
  };
  readonly replayTimeline: readonly {
    readonly id: string;
    readonly fixtureId: string;
    readonly channel: string;
    readonly offsetMinutes: number;
    readonly scheduledAt: string;
  }[];
  readonly golden: {
    readonly packId: string;
    readonly version: string;
    readonly fingerprint: string;
  };
  readonly comparison: {
    readonly baselinePackId: string;
    readonly candidatePackId: string;
    readonly changed: boolean;
    readonly fixtureDelta: number;
    readonly replayEventDelta: number;
    readonly changedFixtureIds: readonly string[];
  };
  readonly safety: {
    readonly publishEnabled: false;
    readonly allowedHosts: readonly string[];
    readonly cronDryRunOnly: boolean;
  };
  readonly policy: SandboxPolicySnapshot;
  readonly promotion: SandboxPromotionReport;
}

export interface MaterializedSandboxRun {
  readonly summary: SandboxRunSummary;
  readonly persistedNamespaceCount: number;
  readonly persistedNamespaceIds: readonly string[];
}

interface PersistedSandboxNamespace {
  readonly id: string;
  readonly environment: "sandbox";
  readonly sandboxId?: string;
  readonly scope: string;
  readonly storagePrefix: string;
  readonly queuePrefix: string;
  readonly metadata: Record<string, string>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface SandboxNamespaceRepositoryLike {
  save(namespace: PersistedSandboxNamespace): Promise<PersistedSandboxNamespace>;
  list(): Promise<PersistedSandboxNamespace[]>;
  delete(id: string): Promise<void>;
}

export interface SandboxStorageUnitOfWorkLike {
  readonly sandboxNamespaces: SandboxNamespaceRepositoryLike;
}

const createPersistedSandboxNamespace = (input: PersistedSandboxNamespace): PersistedSandboxNamespace => input;

const createPromotionReport = (manifest: SandboxRunManifest): SandboxPromotionReport => {
  const cronPlan = createCronValidationPlan(manifest);
  const capabilityIsolationValid = (() => {
    try {
      validateSandboxProfileConfig(manifest.profile);
      return true;
    } catch {
      return false;
    }
  })();

  return evaluateSandboxPromotion({
    certification: {
      status: "pass",
      detail: "Sandbox profile materialized with certification-ready assertions and policy snapshot.",
    },
    contractCoverage: {
      status: manifest.assertionsPack.includes("contract-coverage") ? "pass" : "block",
      detail: manifest.assertionsPack.includes("contract-coverage")
        ? "Contract coverage assertions are included in the sandbox evidence pack."
        : "Contract coverage assertions are missing from the sandbox evidence pack.",
    },
    cronWorkflows: {
      status: cronPlan.length > 0 && cronPlan.every((job) => job.dryRun && !job.writesAllowed) ? "pass" : "block",
      detail:
        cronPlan.length > 0
          ? cronPlan
              .map((job) => `${job.jobName}:${job.dryRun ? "dry-run" : "writes"}:${job.lookbackMinutes}m`)
              .join(" | ")
          : "No cron workflows were declared for this sandbox profile.",
    },
    publicationSafety: {
      status:
        !manifest.profile.isolation.publishEnabled && manifest.profile.providerModes.publish_api === "disabled"
          ? "pass"
          : "block",
      detail:
        !manifest.profile.isolation.publishEnabled && manifest.profile.providerModes.publish_api === "disabled"
          ? "Publishing remains disabled and publication safety is enforced."
          : "Publishing is not fully disabled for this sandbox profile.",
    },
    capabilityIsolation: {
      status: capabilityIsolationValid ? "pass" : "block",
      detail: capabilityIsolationValid
        ? `Default deny is active with ${manifest.profile.isolation.capabilityAllowlist.length} allowed capability(ies).`
        : "Capability or skill allowlists are inconsistent with the sandbox profile policy.",
    },
    manualQa: {
      status:
        manifest.fixturePack.promotionExpectation === "review-required" || manifest.profile.isolation.requiresManualQa
          ? "warn"
          : "pass",
      detail:
        manifest.fixturePack.promotionExpectation === "review-required" || manifest.profile.isolation.requiresManualQa
          ? "Manual QA review is required before promotion for this profile."
          : "No manual QA review is required for this profile.",
    },
  });
};

const createSummary = (
  manifest: SandboxRunManifest,
  mode: RunnerMode,
): SandboxRunSummary => {
  const cronPlan = createCronValidationPlan(manifest);
  const replayChannels = [...new Set(manifest.fixturePack.replayEvents.map((event) => event.channel))].sort();
  const timeline = buildReplayTimeline(manifest);
  const clock = createVirtualClockPlan(manifest);
  const golden = createGoldenFixturePackFingerprint(manifest.fixturePack);
  const comparison = compareFixturePacks(manifest.fixturePack, manifest.fixturePack);
  const policy = createSandboxPolicySnapshot(manifest.profile);
  const promotion = createPromotionReport(manifest);

  return {
    mode,
    sandboxId: manifest.sandboxId,
    runId: manifest.runId,
    fixturePackId: manifest.fixturePack.id,
    profileName: manifest.profile.name,
    namespaceKeys: summarizeNamespaces(manifest.namespaces),
    assertions: manifest.assertionsPack,
    providerModes: manifest.profile.providerModes,
    stats: {
      fixtureCount: manifest.fixturePack.fixtures.length,
      completedFixtures: manifest.fixturePack.fixtures.filter((fixture) => fixture.status === "completed").length,
      replayEventCount: manifest.fixturePack.replayEvents.length,
      replayChannels,
      cronJobsValidated: cronPlan.length,
    },
    clock: {
      mode: clock.mode,
      startAt: clock.startAt,
      endAt: clock.endAt,
      tickCount: clock.tickCount,
    },
    replayTimeline: timeline.map((entry) => ({
      id: entry.id,
      fixtureId: entry.fixtureId,
      channel: entry.channel,
      offsetMinutes: entry.offsetMinutes,
      scheduledAt: entry.scheduledAt,
    })),
    golden: {
      packId: golden.packId,
      version: golden.version,
      fingerprint: golden.fingerprint,
    },
    comparison: {
      baselinePackId: comparison.baselineFingerprint.packId,
      candidatePackId: comparison.candidateFingerprint.packId,
      changed: comparison.changed,
      fixtureDelta: comparison.fixtureDelta,
      replayEventDelta: comparison.replayEventDelta,
      changedFixtureIds: comparison.changedFixtureIds,
    },
    safety: {
      publishEnabled: manifest.profile.isolation.publishEnabled,
      allowedHosts: manifest.profile.isolation.allowedHosts,
      cronDryRunOnly: cronPlan.every((job) => job.dryRun && !job.writesAllowed),
    },
    policy,
    promotion,
  };
};

const sanitizeArtifactToken = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]+/g, "-");

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const pruneUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, candidate]) => candidate !== undefined),
  ) as T;

const createSandboxCertificationRunId = (
  verificationKind: SandboxCertificationRunEntity["verificationKind"],
  generatedAt: string,
): string =>
  `sandbox-certification:${verificationKind}:${generatedAt.replace(/[^0-9]/g, "")}:${randomUUID().slice(0, 8)}`;

const createSyntheticIntegrityRefs = (
  runId: string,
  options: Pick<SandboxCertificationOptions, "correlationId" | "traceId" | "profileName" | "packId" | "gitSha">,
): {
  readonly traceId: string;
  readonly correlationId: string;
  readonly refs: TelemetryEntityRefs;
} => ({
  traceId: options.traceId ?? `sandbox-certification:${options.profileName}:${options.packId}:${options.gitSha}`,
  correlationId: options.correlationId ?? `${options.profileName}:${options.packId}:${options.gitSha}`,
  refs: {
    sandboxCertificationRunId: runId,
  },
});

const createRuntimeReleaseRefs = (
  runId: string,
  options: Pick<RuntimeReleaseCertificationOptions, "correlationId" | "traceId" | "gitSha">,
): {
  readonly traceId: string;
  readonly correlationId: string;
  readonly refs: TelemetryEntityRefs;
} => ({
  traceId: options.traceId ?? `runtime-release-certification:${options.gitSha}`,
  correlationId: options.correlationId ?? `runtime-release:${options.gitSha}`,
  refs: {
    sandboxCertificationRunId: runId,
  },
});

const sandboxCertificationVerificationKindToPrisma = (
  value: SandboxCertificationRunEntity["verificationKind"],
): string => value.replaceAll("-", "_");

const sandboxPromotionStatusToPrisma = (
  value: NonNullable<SandboxCertificationRunEntity["promotionStatus"]>,
): string => value.replaceAll("-", "_");

const sandboxCertificationVerificationKindFromPrisma = (
  value: unknown,
): SandboxCertificationRunEntity["verificationKind"] =>
  typeof value === "string" && value.includes("_")
    ? value.replaceAll("_", "-") as SandboxCertificationRunEntity["verificationKind"]
    : value as SandboxCertificationRunEntity["verificationKind"];

const sandboxPromotionStatusFromPrisma = (
  value: unknown,
): SandboxCertificationRunEntity["promotionStatus"] =>
  typeof value === "string" && value.includes("_")
    ? value.replaceAll("_", "-") as SandboxCertificationRunEntity["promotionStatus"]
    : value as SandboxCertificationRunEntity["promotionStatus"];

type PrismaCreateFindDelegate<TRecord> = {
  create(args: { readonly data: Record<string, unknown> }): Promise<TRecord>;
  findMany?(args?: Record<string, unknown>): Promise<TRecord[]>;
};

const asPrismaCreateFindDelegate = <TRecord>(
  value: unknown,
): PrismaCreateFindDelegate<TRecord> | null => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("create" in value) ||
    typeof (value as { readonly create?: unknown }).create !== "function"
  ) {
    return null;
  }

  return value as PrismaCreateFindDelegate<TRecord>;
};

export const createPrismaSandboxCertificationRunStore = (
  delegateHost: unknown,
): SandboxCertificationRunRepositoryLike | undefined => {
  const delegate = asPrismaCreateFindDelegate<SandboxCertificationRunEntity>(
    typeof delegateHost === "object" && delegateHost !== null
      ? (delegateHost as Record<string, unknown>).sandboxCertificationRun
      : undefined,
  );
  if (!delegate) {
    return undefined;
  }

  const normalizeRecord = (record: SandboxCertificationRunEntity): SandboxCertificationRunEntity =>
    ({
      ...structuredClone(record),
      verificationKind: sandboxCertificationVerificationKindFromPrisma(record.verificationKind),
      ...(record.promotionStatus
        ? { promotionStatus: sandboxPromotionStatusFromPrisma(record.promotionStatus) }
        : {}),
    }) as SandboxCertificationRunEntity;

  const listByQuery = async (query: SandboxCertificationRunQuery = {}): Promise<readonly SandboxCertificationRunEntity[]> => {
    if (typeof delegate.findMany !== "function") {
      return [];
    }

    try {
      const records = await delegate.findMany({
        where: pruneUndefined({
          ...(query.verificationKind
            ? { verificationKind: sandboxCertificationVerificationKindToPrisma(query.verificationKind) }
            : {}),
          ...(query.profileName ? { profileName: query.profileName } : {}),
          ...(query.packId ? { packId: query.packId } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.promotionStatus
            ? { promotionStatus: sandboxPromotionStatusToPrisma(query.promotionStatus) }
            : {}),
        }),
        orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      });
      return records.map(normalizeRecord);
    } catch {
      return [];
    }
  };

  return {
    async append(entity) {
      try {
        await delegate.create({
          data: pruneUndefined({
            ...entity,
            verificationKind: sandboxCertificationVerificationKindToPrisma(entity.verificationKind),
            ...(entity.promotionStatus
              ? { promotionStatus: sandboxPromotionStatusToPrisma(entity.promotionStatus) }
              : {}),
            runtimeSignals: entity.runtimeSignals,
            diffEntries: entity.diffEntries,
            summary: entity.summary,
          }),
        });
      } catch {
        return entity;
      }
      return entity;
    },
    listByQuery,
    async findLatestByProfilePack(profileName, packId, verificationKind) {
      const records = await listByQuery({
        ...(verificationKind ? { verificationKind } : {}),
        profileName,
        packId,
      });
      return records[0] ?? null;
    },
  };
};

const appendSandboxCertificationRun = async (
  repository: SandboxCertificationRunRepositoryLike | undefined,
  entity: SandboxCertificationRunEntity,
): Promise<SandboxCertificationRunEntity | undefined> => {
  if (!repository) {
    return undefined;
  }

  if (typeof repository.append === "function") {
    return repository.append(entity);
  }

  if (typeof repository.save === "function") {
    return repository.save(entity);
  }

  return undefined;
};

const createSandboxCertificationPrismaClient = async (
  databaseUrl: string,
): Promise<PrismaClient> => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  await client.$connect();
  return client;
};

export const openSandboxCertificationPersistenceSession = async (
  databaseUrl: string,
): Promise<SandboxCertificationPersistenceSession> => {
  const client = await createSandboxCertificationPrismaClient(databaseUrl) as unknown as SandboxCertificationPersistenceSession["client"];
  const sandboxCertificationRuns = createPrismaSandboxCertificationRunStore(client);
  return {
    client,
    ...(sandboxCertificationRuns ? { sandboxCertificationRuns } : {}),
    telemetrySink: createPrismaDurableObservabilitySink(client),
    async close() {
      if (typeof client.$disconnect === "function") {
        await client.$disconnect();
      }
    },
  };
};

export interface SandboxReleaseComparisonResult {
  readonly baselineGitSha: string;
  readonly candidateGitSha: string;
  readonly packId: string;
  readonly changed: boolean;
  readonly fingerprintChanged: boolean;
  readonly fixtureDelta: number;
  readonly replayEventDelta: number;
  readonly changedFixtureIds: readonly string[];
}

export interface SandboxGoldenSnapshot {
  readonly schemaVersion: "sandbox-golden-v1";
  readonly mode: RunnerMode;
  readonly fixturePackId: string;
  readonly profileName: SandboxProfileName;
  readonly assertions: readonly string[];
  readonly providerModes: Readonly<Record<string, string>>;
  readonly stats: SandboxRunSummary["stats"];
  readonly clock: SandboxRunSummary["clock"];
  readonly replayTimeline: SandboxRunSummary["replayTimeline"];
  readonly golden: SandboxRunSummary["golden"];
  readonly comparison: SandboxRunSummary["comparison"];
  readonly safety: SandboxRunSummary["safety"];
  readonly policy: SandboxRunSummary["policy"];
  readonly promotion: SandboxRunSummary["promotion"];
}

export interface GoldenDiffEntry {
  readonly path: string;
  readonly kind: "added" | "removed" | "changed";
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface GoldenDiff {
  readonly changed: boolean;
  readonly entryCount: number;
  readonly entries: readonly GoldenDiffEntry[];
}

export interface SandboxCertificationEvidencePack {
  readonly schemaVersion: "sandbox-certification-v1";
  readonly generatedAt: string;
  readonly workspace: string;
  readonly fixtureWorkspace: string;
  readonly runtime: {
    readonly gitSha: string;
    readonly mode: RunnerMode;
    readonly profileName: SandboxProfileName;
    readonly packId: string;
  };
  readonly summary: SandboxRunSummary;
  readonly goldenSnapshot: SandboxGoldenSnapshot;
}

export interface SandboxCertificationResult {
  readonly status: "passed" | "failed";
  readonly goldenPath: string;
  readonly artifactPath?: string;
  readonly historyArtifactPath?: string;
  readonly persistedRun?: SandboxCertificationRunEntity;
  readonly evidence: SandboxCertificationEvidencePack;
  readonly diff: GoldenDiff;
}

export interface SandboxCertificationOptions extends SandboxRunnerOptions {
  readonly goldenPath: string;
  readonly artifactPath?: string;
  readonly historyRoot?: string;
  readonly sandboxCertificationRuns?: SandboxCertificationRunRepositoryLike;
  readonly telemetrySink?: ObservabilitySink;
  readonly traceId?: string;
  readonly correlationId?: string;
}

export type SandboxCertificationDiffEntry = GoldenDiffEntry;

export interface SandboxCertificationRunEntity {
  readonly id: string;
  readonly verificationKind: "synthetic-integrity" | "runtime-release";
  readonly status: "passed" | "failed";
  readonly promotionStatus?: "blocked" | "review-required" | "promotable";
  readonly profileName?: string;
  readonly packId?: string;
  readonly mode?: string;
  readonly gitSha: string;
  readonly baselineRef?: string;
  readonly candidateRef?: string;
  readonly goldenFingerprint?: string;
  readonly evidenceFingerprint?: string;
  readonly artifactRef?: string;
  readonly runtimeSignals: Readonly<Record<string, unknown>>;
  readonly diffEntries: readonly SandboxCertificationDiffEntry[];
  readonly summary: Readonly<Record<string, unknown>>;
  readonly generatedAt: string;
}

export interface SandboxCertificationRunQuery {
  readonly verificationKind?: SandboxCertificationRunEntity["verificationKind"];
  readonly profileName?: string;
  readonly packId?: string;
  readonly status?: SandboxCertificationRunEntity["status"];
  readonly promotionStatus?: NonNullable<SandboxCertificationRunEntity["promotionStatus"]>;
}

export interface SandboxCertificationRunRepositoryLike {
  append?(entity: SandboxCertificationRunEntity): Promise<SandboxCertificationRunEntity>;
  save?(entity: SandboxCertificationRunEntity): Promise<SandboxCertificationRunEntity>;
  listByQuery?(query?: SandboxCertificationRunQuery): Promise<readonly SandboxCertificationRunEntity[]>;
  findLatestByProfilePack?(
    profileName: string,
    packId: string,
    verificationKind?: SandboxCertificationRunEntity["verificationKind"],
  ): Promise<SandboxCertificationRunEntity | null>;
}

export class InMemorySandboxCertificationRunStore implements SandboxCertificationRunRepositoryLike {
  private readonly runs: SandboxCertificationRunEntity[] = [];

  async append(entity: SandboxCertificationRunEntity): Promise<SandboxCertificationRunEntity> {
    this.runs.push(structuredClone(entity));
    return structuredClone(entity);
  }

  async listByQuery(query: SandboxCertificationRunQuery = {}): Promise<readonly SandboxCertificationRunEntity[]> {
    return this.runs
      .filter((run) =>
        (query.verificationKind === undefined || run.verificationKind === query.verificationKind) &&
        (query.profileName === undefined || run.profileName === query.profileName) &&
        (query.packId === undefined || run.packId === query.packId) &&
        (query.status === undefined || run.status === query.status) &&
        (query.promotionStatus === undefined || run.promotionStatus === query.promotionStatus),
      )
      .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
      .map((run) => structuredClone(run));
  }

  async findLatestByProfilePack(
    profileName: string,
    packId: string,
    verificationKind?: SandboxCertificationRunEntity["verificationKind"],
  ): Promise<SandboxCertificationRunEntity | null> {
    return (
      (await this.listByQuery({
        ...(verificationKind ? { verificationKind } : {}),
        profileName,
        packId,
      }))[0] ?? null
    );
  }
}

export interface SandboxCertificationPersistenceSession {
  readonly client: {
    readonly $disconnect?: () => Promise<void>;
  } & Record<string, unknown>;
  readonly sandboxCertificationRuns?: SandboxCertificationRunRepositoryLike;
  readonly telemetrySink: ObservabilitySink;
  close(): Promise<void>;
}

export interface RuntimeReleaseCertificationEvidencePack {
  readonly schemaVersion: "runtime-release-certification-v1";
  readonly generatedAt: string;
  readonly workspace: string;
  readonly runtime: {
    readonly gitSha: string;
    readonly baselineRef?: string;
    readonly candidateRef?: string;
  };
  readonly runtimeSignals: Readonly<Record<string, unknown>>;
  readonly promotion: SandboxPromotionReport;
  readonly diffEntries: readonly SandboxCertificationDiffEntry[];
}

export interface RuntimeReleaseCertificationResult {
  readonly status: "passed" | "failed";
  readonly artifactPath?: string;
  readonly historyArtifactPath?: string;
  readonly persistedRun?: SandboxCertificationRunEntity;
  readonly evidence: RuntimeReleaseCertificationEvidencePack;
}

export interface RuntimeReleaseCertificationOptions {
  readonly databaseUrl: string;
  readonly gitSha: string;
  readonly now?: Date;
  readonly lookbackHours?: number;
  readonly artifactPath?: string;
  readonly historyRoot?: string;
  readonly baselineRef?: string;
  readonly candidateRef?: string;
  readonly sandboxCertificationRuns?: SandboxCertificationRunRepositoryLike;
  readonly telemetrySink?: ObservabilitySink;
  readonly traceId?: string;
  readonly correlationId?: string;
}

export const prepareSandboxRun = (options: SandboxRunnerOptions): SandboxRunManifest => {
  const fixturePack = getSyntheticFixturePack(options.packId);
  if (!fixturePack.profileHints.includes(options.profileName)) {
    throw new Error(
      `Fixture pack ${options.packId} is not approved for profile ${options.profileName}`,
    );
  }

  return createSandboxRunManifest({
    profileName: options.profileName,
    packId: options.packId,
    gitSha: options.gitSha,
    ...(options.now ? { now: options.now } : {}),
    assertionsPack: [
      "namespace-isolation",
      "provider-routing",
      "policy-default-deny",
      options.mode === "smoke" ? "smoke-health" : "replay-integrity",
      "cron-validation-dry-run",
      ...fixturePack.assertionHints,
    ],
  });
};

export const runSandboxScenario = (options: SandboxRunnerOptions): SandboxRunSummary => {
  const manifest = prepareSandboxRun(options);
  return createSummary(manifest, options.mode);
};

const materializeManifestNamespaces = async (
  manifest: SandboxRunManifest,
  unitOfWork: SandboxStorageUnitOfWorkLike,
): Promise<readonly string[]> => {
  const namespaces = Object.values(manifest.namespaces).map((namespace) =>
    createPersistedSandboxNamespace({
      id: namespace.id,
      environment: namespace.environment,
      sandboxId: namespace.sandboxId,
      scope: namespace.scope,
      storagePrefix: namespace.storagePrefix,
      queuePrefix: namespace.queuePrefix,
      metadata: {
        ...namespace.metadata,
        profileName: manifest.profile.name,
        fixturePackId: manifest.fixturePack.id,
      },
      createdAt: namespace.createdAt,
      updatedAt: namespace.updatedAt,
    }),
  );

  const persistedNamespaces: PersistedSandboxNamespace[] = [];

  try {
    for (const namespace of namespaces) {
      persistedNamespaces.push(await unitOfWork.sandboxNamespaces.save(namespace));
    }

    return persistedNamespaces.map((namespace) => namespace.id);
  } catch (error) {
    await Promise.all(
      persistedNamespaces.map(async (namespace) => {
        try {
          await unitOfWork.sandboxNamespaces.delete(namespace.id);
        } catch {
          // best-effort rollback for non-transactional unit-of-work implementations
        }
      }),
    );
    throw error;
  }
};

export const materializeSandboxRun = async (
  options: SandboxRunnerOptions,
  unitOfWork: SandboxStorageUnitOfWorkLike,
): Promise<MaterializedSandboxRun> => {
  const manifest = prepareSandboxRun(options);
  const persistedNamespaceIds = await materializeManifestNamespaces(manifest, unitOfWork);

  return {
    summary: createSummary(manifest, options.mode),
    persistedNamespaceCount: persistedNamespaceIds.length,
    persistedNamespaceIds,
  };
};

export const compareSandboxReleases = (input: {
  readonly profileName: SandboxProfileName;
  readonly packId: string;
  readonly baselineGitSha: string;
  readonly candidateGitSha: string;
  readonly now?: Date;
}): SandboxReleaseComparisonResult => {
  const baselineManifest = createSandboxRunManifest({
    profileName: input.profileName,
    packId: input.packId,
    gitSha: input.baselineGitSha,
    ...(input.now ? { now: input.now } : {}),
  });
  const candidateManifest = createSandboxRunManifest({
    profileName: input.profileName,
    packId: input.packId,
    gitSha: input.candidateGitSha,
    ...(input.now ? { now: input.now } : {}),
  });
  const comparison = compareFixturePacks(baselineManifest.fixturePack, candidateManifest.fixturePack);

  return {
    baselineGitSha: input.baselineGitSha,
    candidateGitSha: input.candidateGitSha,
    packId: input.packId,
    changed: comparison.changed,
    fingerprintChanged:
      comparison.baselineFingerprint.fingerprint !== comparison.candidateFingerprint.fingerprint,
    fixtureDelta: comparison.fixtureDelta,
    replayEventDelta: comparison.replayEventDelta,
    changedFixtureIds: comparison.changedFixtureIds,
  };
};

export const createSandboxGoldenSnapshot = (
  summary: SandboxRunSummary,
): SandboxGoldenSnapshot => ({
  schemaVersion: "sandbox-golden-v1",
  mode: summary.mode,
  fixturePackId: summary.fixturePackId,
  profileName: summary.profileName,
  assertions: summary.assertions,
  providerModes: summary.providerModes,
  stats: summary.stats,
  clock: summary.clock,
  replayTimeline: summary.replayTimeline,
  golden: summary.golden,
  comparison: summary.comparison,
  safety: summary.safety,
  policy: summary.policy,
  promotion: summary.promotion,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const compareGoldenValues = (
  expected: unknown,
  actual: unknown,
  path: string,
): GoldenDiffEntry[] => {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const entries: GoldenDiffEntry[] = [];
    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index += 1) {
      const childPath = `${path}[${index}]`;
      if (index >= expected.length) {
        entries.push({ path: childPath, kind: "added", actual: actual[index] });
        continue;
      }
      if (index >= actual.length) {
        entries.push({ path: childPath, kind: "removed", expected: expected[index] });
        continue;
      }
      entries.push(...compareGoldenValues(expected[index], actual[index], childPath));
    }
    return entries;
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const entries: GoldenDiffEntry[] = [];
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      if (!(key in actual)) {
        entries.push({ path: childPath, kind: "removed", expected: expected[key] });
        continue;
      }
      if (!(key in expected)) {
        entries.push({ path: childPath, kind: "added", actual: actual[key] });
        continue;
      }
      entries.push(...compareGoldenValues(expected[key], actual[key], childPath));
    }
    return entries;
  }

  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    return [{ path, kind: "changed", expected, actual }];
  }

  return [];
};

export const diffSandboxGoldenSnapshot = (
  expected: SandboxGoldenSnapshot,
  actual: SandboxGoldenSnapshot,
): GoldenDiff => {
  const entries = compareGoldenValues(expected, actual, "$");
  return {
    changed: entries.length > 0,
    entryCount: entries.length,
    entries,
  };
};

export const createSandboxCertificationEvidencePack = (
  options: SandboxRunnerOptions,
): SandboxCertificationEvidencePack => {
  const summary = runSandboxScenario(options);
  return {
    schemaVersion: "sandbox-certification-v1",
    generatedAt: new Date().toISOString(),
    workspace: describeWorkspace(),
    fixtureWorkspace: describeFixtureWorkspace(),
    runtime: {
      gitSha: options.gitSha,
      mode: options.mode,
      profileName: options.profileName,
      packId: options.packId,
    },
    summary,
    goldenSnapshot: createSandboxGoldenSnapshot(summary),
  };
};

const withCertificationOutcome = (
  evidence: SandboxCertificationEvidencePack,
  certificationStatus: SandboxCertificationResult["status"],
): SandboxCertificationEvidencePack => {
  const gates: SandboxPromotionReport["gates"] = evidence.summary.promotion.gates.map((gate) => {
    if (gate.name !== "sandbox-certification") {
      return gate;
    }

    const gateStatus: SandboxPromotionReport["gates"][number]["status"] =
      certificationStatus === "passed" ? "pass" : "block";

    return {
      ...gate,
      status: gateStatus,
      detail:
        certificationStatus === "passed"
          ? "Certification evidence matches the tracked golden snapshot."
          : "Certification drift was detected against the tracked golden snapshot.",
    };
  });
  const findGateStatus = (
    name: SandboxPromotionReport["gates"][number]["name"],
  ): SandboxPromotionReport["gates"][number]["status"] =>
    gates.find((gate) => gate.name === name)?.status ?? "block";
  const findGateDetail = (name: SandboxPromotionReport["gates"][number]["name"], fallback: string): string =>
    gates.find((gate) => gate.name === name)?.detail ?? fallback;

  const promotion = evaluateSandboxPromotion({
    certification: {
      status: findGateStatus("sandbox-certification"),
      detail: findGateDetail("sandbox-certification", "Certification gate status is unavailable."),
    },
    contractCoverage: {
      status: findGateStatus("contract-coverage"),
      detail: findGateDetail("contract-coverage", "Contract coverage is unavailable."),
    },
    cronWorkflows: {
      status: findGateStatus("cron-workflows"),
      detail: findGateDetail("cron-workflows", "Cron workflow status is unavailable."),
    },
    publicationSafety: {
      status: findGateStatus("publication-safety"),
      detail: findGateDetail("publication-safety", "Publication safety status is unavailable."),
    },
    capabilityIsolation: {
      status: findGateStatus("capability-isolation"),
      detail: findGateDetail("capability-isolation", "Capability isolation status is unavailable."),
    },
    manualQa: {
      status: findGateStatus("manual-qa"),
      detail: findGateDetail("manual-qa", "Manual QA status is unavailable."),
    },
  });

  return {
    ...evidence,
    summary: {
      ...evidence.summary,
      promotion,
    },
  };
};

export const loadSandboxGoldenSnapshot = async (
  goldenPath: string,
): Promise<SandboxGoldenSnapshot> => {
  const loaded = JSON.parse(await readFile(goldenPath, "utf8")) as SandboxGoldenSnapshot;
  if (loaded.schemaVersion !== "sandbox-golden-v1") {
    throw new Error(`Unsupported sandbox golden schema in ${goldenPath}`);
  }

  return loaded;
};

export const writeSandboxGoldenSnapshot = async (
  goldenPath: string,
  snapshot: SandboxGoldenSnapshot,
): Promise<void> => {
  await mkdir(dirname(goldenPath), { recursive: true });
  await writeFile(goldenPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
};

const writeJsonArtifact = async (
  artifactPath: string,
  payload: unknown,
): Promise<string> => {
  const resolvedArtifactPath = resolve(artifactPath);
  await mkdir(dirname(resolvedArtifactPath), { recursive: true });
  await writeFile(resolvedArtifactPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return resolvedArtifactPath;
};

const writeCertificationHistoryArtifact = async (input: {
  readonly historyRoot: string;
  readonly verificationKind: SandboxCertificationRunEntity["verificationKind"];
  readonly generatedAt: string;
  readonly gitSha: string;
  readonly payload: unknown;
  readonly profileName?: string;
  readonly packId?: string;
}): Promise<string> => {
  const timestamp = sanitizeArtifactToken(input.generatedAt.replace(/[:]/g, ""));
  const historyPath = resolve(
    input.historyRoot,
    input.verificationKind,
    ...(input.profileName ? [sanitizeArtifactToken(input.profileName)] : []),
    ...(input.packId ? [sanitizeArtifactToken(input.packId)] : []),
    `${timestamp}-${sanitizeArtifactToken(input.gitSha)}.json`,
  );

  return writeJsonArtifact(historyPath, input.payload);
};

export const writeSandboxCertificationArtifact = async (
  artifactPath: string,
  evidence: SandboxCertificationEvidencePack,
): Promise<string> => {
  return writeJsonArtifact(artifactPath, evidence);
};

export const certifySandboxRun = async (
  options: SandboxCertificationOptions,
): Promise<SandboxCertificationResult> => {
  const initialEvidence = createSandboxCertificationEvidencePack(options);
  const runId = createSandboxCertificationRunId("synthetic-integrity", initialEvidence.generatedAt);
  const telemetry = createSyntheticIntegrityRefs(runId, options);
  const observability = createObservabilityKit({
    context: {
      correlationId: telemetry.correlationId,
      traceId: telemetry.traceId,
      workspace: workspaceInfo.workspaceName,
      labels: {
        mode: options.mode,
        packId: options.packId,
        profileName: options.profileName,
        verificationKind: "synthetic-integrity",
      },
    },
    refs: telemetry.refs,
    ...(options.telemetrySink ? { sink: options.telemetrySink } : {}),
  });
  observability.log("sandbox synthetic-integrity certification started", {
    data: {
      gitSha: options.gitSha,
      mode: options.mode,
      packId: options.packId,
      profileName: options.profileName,
    },
    refs: telemetry.refs,
  });
  const resolvedGoldenPath = resolve(options.goldenPath);
  const expectedGolden = await loadSandboxGoldenSnapshot(resolvedGoldenPath);
  const diff = diffSandboxGoldenSnapshot(expectedGolden, initialEvidence.goldenSnapshot);
  const evidence = withCertificationOutcome(initialEvidence, diff.changed ? "failed" : "passed");
  const artifactPath = options.artifactPath
    ? await writeSandboxCertificationArtifact(options.artifactPath, evidence)
    : undefined;
  const historyArtifactPath = options.historyRoot
    ? await writeCertificationHistoryArtifact({
        historyRoot: options.historyRoot,
        verificationKind: "synthetic-integrity",
        generatedAt: evidence.generatedAt,
        gitSha: options.gitSha,
        payload: evidence,
        profileName: options.profileName,
        packId: options.packId,
      })
    : undefined;
  observability.setGauge("sandbox.certification.synthetic_integrity.diff_entries", diff.entryCount, {
    refs: telemetry.refs,
    recordedAt: evidence.generatedAt,
  });
  observability.incrementCounter(
    diff.changed ? "sandbox.certification.synthetic_integrity.failed" : "sandbox.certification.synthetic_integrity.passed",
    1,
    {
      refs: telemetry.refs,
      recordedAt: evidence.generatedAt,
    },
  );
  observability.log(
    diff.changed
      ? "sandbox synthetic-integrity certification detected drift"
      : "sandbox synthetic-integrity certification passed",
    {
      severity: diff.changed ? "warn" : "info",
      data: {
        artifactPath: artifactPath ?? null,
        diffEntryCount: diff.entryCount,
        historyArtifactPath: historyArtifactPath ?? null,
      },
      refs: telemetry.refs,
      timestamp: evidence.generatedAt,
    },
  );
  await observability.flush();
  const runEntity: SandboxCertificationRunEntity = {
    id: runId,
    verificationKind: "synthetic-integrity",
    status: diff.changed ? "failed" : "passed",
    promotionStatus: evidence.summary.promotion.status,
    profileName: options.profileName,
    packId: options.packId,
    mode: options.mode,
    gitSha: options.gitSha,
    goldenFingerprint: expectedGolden.golden.fingerprint,
    evidenceFingerprint: stableStringify(evidence.goldenSnapshot),
    ...(historyArtifactPath
      ? { artifactRef: historyArtifactPath }
      : artifactPath
        ? { artifactRef: artifactPath }
        : {}),
    runtimeSignals: {
      artifactPath: artifactPath ?? null,
      historyArtifactPath: historyArtifactPath ?? null,
      telemetryDurable:
        observability.sinkCapabilities.eventsDurable || observability.sinkCapabilities.metricsDurable,
      telemetryFailures: observability.failures(),
    },
    diffEntries: diff.entries,
    summary: {
      diffEntryCount: diff.entryCount,
      fixtureCount: evidence.summary.stats.fixtureCount,
      promotion: evidence.summary.promotion,
      replayEventCount: evidence.summary.stats.replayEventCount,
    },
    generatedAt: evidence.generatedAt,
  };
  const persistedRun = await appendSandboxCertificationRun(options.sandboxCertificationRuns, runEntity);

  return {
    status: diff.changed ? "failed" : "passed",
    goldenPath: resolvedGoldenPath,
    ...(artifactPath ? { artifactPath } : {}),
    ...(historyArtifactPath ? { historyArtifactPath } : {}),
    ...(persistedRun ? { persistedRun } : {}),
    evidence,
    diff,
  };
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asIsoString = (value: unknown): string | undefined =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === "string" && value.length > 0
      ? value
      : undefined;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const countBy = (values: readonly string[]): Readonly<Record<string, number>> =>
  values.reduce<Record<string, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {});

type PrismaFindManyDelegate<TRecord> = {
  findMany(args?: Record<string, unknown>): Promise<TRecord[]>;
};

const asPrismaFindManyDelegate = <TRecord>(
  value: unknown,
): PrismaFindManyDelegate<TRecord> | null => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("findMany" in value) ||
    typeof (value as { readonly findMany?: unknown }).findMany !== "function"
  ) {
    return null;
  }

  return value as PrismaFindManyDelegate<TRecord>;
};

const listPrismaRecords = async <TRecord>(
  delegateHost: Record<string, unknown>,
  delegateName: string,
  args?: Record<string, unknown>,
): Promise<TRecord[]> => {
  const delegate = asPrismaFindManyDelegate<TRecord>(delegateHost[delegateName]);
  if (!delegate) {
    return [];
  }

  return delegate.findMany(args);
};

export const runRuntimeReleaseCertification = async (
  options: RuntimeReleaseCertificationOptions,
): Promise<RuntimeReleaseCertificationResult> => {
  const generatedAt = (options.now ?? new Date()).toISOString();
  const runId = createSandboxCertificationRunId("runtime-release", generatedAt);
  const session = await openSandboxCertificationPersistenceSession(options.databaseUrl);
  const telemetry = createRuntimeReleaseRefs(runId, options);
  const observability = createObservabilityKit({
    context: {
      correlationId: telemetry.correlationId,
      traceId: telemetry.traceId,
      workspace: workspaceInfo.workspaceName,
      labels: {
        gitSha: options.gitSha,
        verificationKind: "runtime-release",
      },
    },
    refs: telemetry.refs,
    ...((options.telemetrySink ?? session.telemetrySink)
      ? { sink: options.telemetrySink ?? session.telemetrySink }
      : {}),
  });

  try {
    const lookbackHours = Math.max(1, options.lookbackHours ?? 168);
    const lookbackStart = new Date(Date.parse(generatedAt) - lookbackHours * 60 * 60 * 1000);
    observability.log("runtime-release certification started", {
      data: {
        baselineRef: options.baselineRef ?? null,
        candidateRef: options.candidateRef ?? null,
        gitSha: options.gitSha,
        lookbackHours,
      },
      refs: telemetry.refs,
      timestamp: generatedAt,
    });

    const delegateHost = session.client as Record<string, unknown>;
    const automationCycles = await listPrismaRecords<Record<string, unknown>>(delegateHost, "automationCycle", {
      where: { createdAt: { gte: lookbackStart } },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    const tasks = await listPrismaRecords<Record<string, unknown>>(delegateHost, "task", {
      where: { createdAt: { gte: lookbackStart } },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    });
    const taskRuns = await listPrismaRecords<Record<string, unknown>>(delegateHost, "taskRun", {
      where: { createdAt: { gte: lookbackStart } },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    });
    const auditEvents = await listPrismaRecords<Record<string, unknown>>(delegateHost, "auditEvent", {
      where: { occurredAt: { gte: lookbackStart } },
      orderBy: [{ occurredAt: "desc" }],
      take: 500,
    });

    const cycleStatuses = automationCycles.map((cycle) => asString(cycle.status) ?? "unknown");
    const cycleKinds = automationCycles.map((cycle) => asString(cycle.kind) ?? "unknown");
    const taskStatuses = tasks.map((task) => asString(task.status) ?? "unknown");
    const taskRunStatuses = taskRuns.map((taskRun) => asString(taskRun.status) ?? "unknown");
    const auditAggregateTypes = auditEvents.map((event) => asString(event.aggregateType) ?? "unknown");
    const tasksWithTraceId = tasks.filter((task) => {
      const payload = asRecord(task.payload);
      return asString(task.traceId) !== undefined || asString(payload?.traceId) !== undefined;
    }).length;
    const auditsWithTraceId = auditEvents.filter((event) => {
      const payload = asRecord(event.payload);
      return asString(event.traceId) !== undefined || asString(payload?.traceId) !== undefined;
    }).length;
    const taskTraceCoverageRate = tasks.length === 0 ? 0 : Number((tasksWithTraceId / tasks.length).toFixed(4));
    const auditTraceCoverageRate = auditEvents.length === 0 ? 0 : Number((auditsWithTraceId / auditEvents.length).toFixed(4));
    const schedulerSucceeded = automationCycles.some(
      (cycle) => asString(cycle.kind) === "scheduler" && asString(cycle.status) === "succeeded",
    );
    const dispatcherSucceeded = automationCycles.some(
      (cycle) => asString(cycle.kind) === "dispatcher" && asString(cycle.status) === "succeeded",
    );
    const recoverySucceeded = automationCycles.some(
      (cycle) => asString(cycle.kind) === "recovery" && asString(cycle.status) === "succeeded",
    );
    const failedTasks = taskStatuses.filter((status) => status === "failed").length;
    const quarantinedTasks = taskStatuses.filter((status) => status === "quarantined").length;
    const latestCycleId = asString(automationCycles[0]?.id);
    const latestAuditOccurredAt = asIsoString(auditEvents[0]?.occurredAt);

    const promotion = evaluateSandboxPromotion({
      certification: {
        status:
          automationCycles.length > 0 && taskRuns.length > 0 && auditEvents.length > 0
            ? "pass"
            : "block",
        detail: `${automationCycles.length} cycle(s), ${tasks.length} task(s), ${taskRuns.length} task run(s), ${auditEvents.length} audit event(s) observed in durable runtime.`,
      },
      contractCoverage: {
        status:
          schedulerSucceeded && dispatcherSucceeded && recoverySucceeded
            ? "pass"
            : automationCycles.length > 0 && taskRuns.length > 0
              ? "warn"
              : "block",
        detail: `scheduler=${schedulerSucceeded ? "ok" : "missing"} | dispatcher=${dispatcherSucceeded ? "ok" : "missing"} | recovery=${recoverySucceeded ? "ok" : "missing"}`,
      },
      cronWorkflows: {
        status: schedulerSucceeded ? "pass" : automationCycles.some((cycle) => asString(cycle.kind) === "scheduler") ? "warn" : "block",
        detail: schedulerSucceeded
          ? "A succeeded scheduler cycle was observed in the lookback window."
          : "No succeeded scheduler cycle was observed in the lookback window.",
      },
      publicationSafety: {
        status: quarantinedTasks > 0 ? "block" : failedTasks > 0 ? "warn" : "pass",
        detail: `${quarantinedTasks} quarantined task(s) and ${failedTasks} failed task(s) observed.`,
      },
      capabilityIsolation: {
        status: taskTraceCoverageRate >= 0.8 && auditTraceCoverageRate >= 0.8 ? "pass" : taskTraceCoverageRate >= 0.5 ? "warn" : "block",
        detail: `task trace coverage ${Math.round(taskTraceCoverageRate * 100)}% | audit trace coverage ${Math.round(auditTraceCoverageRate * 100)}%`,
      },
      manualQa: {
        status: quarantinedTasks > 0 || failedTasks > 0 ? "warn" : "pass",
        detail:
          quarantinedTasks > 0 || failedTasks > 0
            ? "Runtime evidence contains quarantined or failed work that should be reviewed before promotion."
            : "No manual QA review signals were detected in the lookback window.",
      },
    });

    const diffEntries: SandboxCertificationDiffEntry[] = [
      ...(automationCycles.length === 0
        ? [{ path: "$.runtimeSignals.automationCycles.total", kind: "changed", expected: ">0", actual: 0 } satisfies SandboxCertificationDiffEntry]
        : []),
      ...(!schedulerSucceeded
        ? [{ path: "$.runtimeSignals.automationCycles.scheduler", kind: "changed", expected: "succeeded", actual: "missing" } satisfies SandboxCertificationDiffEntry]
        : []),
      ...(!dispatcherSucceeded
        ? [{ path: "$.runtimeSignals.automationCycles.dispatcher", kind: "changed", expected: "succeeded", actual: "missing" } satisfies SandboxCertificationDiffEntry]
        : []),
      ...(!recoverySucceeded
        ? [{ path: "$.runtimeSignals.automationCycles.recovery", kind: "changed", expected: "succeeded", actual: "missing" } satisfies SandboxCertificationDiffEntry]
        : []),
      ...(quarantinedTasks > 0
        ? [{ path: "$.runtimeSignals.tasks.quarantined", kind: "changed", expected: 0, actual: quarantinedTasks } satisfies SandboxCertificationDiffEntry]
        : []),
      ...(taskTraceCoverageRate < 0.8
        ? [{ path: "$.runtimeSignals.tasks.traceCoverageRate", kind: "changed", expected: 0.8, actual: taskTraceCoverageRate } satisfies SandboxCertificationDiffEntry]
        : []),
      ...(auditEvents.length === 0
        ? [{ path: "$.runtimeSignals.auditEvents.total", kind: "changed", expected: ">0", actual: 0 } satisfies SandboxCertificationDiffEntry]
        : []),
    ];

    const runtimeSignals = {
      lookbackHours,
      automationCycles: {
        total: automationCycles.length,
        byKind: countBy(cycleKinds),
        byStatus: countBy(cycleStatuses),
        latestCycleId: latestCycleId ?? null,
      },
      tasks: {
        total: tasks.length,
        byStatus: countBy(taskStatuses),
        traceCoverageRate: taskTraceCoverageRate,
      },
      taskRuns: {
        total: taskRuns.length,
        byStatus: countBy(taskRunStatuses),
      },
      auditEvents: {
        total: auditEvents.length,
        byAggregateType: countBy(auditAggregateTypes),
        latestOccurredAt: latestAuditOccurredAt ?? null,
        traceCoverageRate: auditTraceCoverageRate,
      },
      telemetry: {
        durableEvents: observability.sinkCapabilities.eventsDurable,
        durableMetrics: observability.sinkCapabilities.metricsDurable,
      },
    } satisfies Record<string, unknown>;

    const evidence: RuntimeReleaseCertificationEvidencePack = {
      schemaVersion: "runtime-release-certification-v1",
      generatedAt,
      workspace: describeWorkspace(),
      runtime: {
        gitSha: options.gitSha,
        ...(options.baselineRef ? { baselineRef: options.baselineRef } : {}),
        ...(options.candidateRef ? { candidateRef: options.candidateRef } : {}),
      },
      runtimeSignals,
      promotion,
      diffEntries,
    };

    const artifactPath = options.artifactPath
      ? await writeJsonArtifact(options.artifactPath, evidence)
      : undefined;
    const historyArtifactPath = options.historyRoot
      ? await writeCertificationHistoryArtifact({
          historyRoot: options.historyRoot,
          verificationKind: "runtime-release",
          generatedAt,
          gitSha: options.gitSha,
          payload: evidence,
        })
      : undefined;

    observability.setGauge("sandbox.certification.runtime_release.automation_cycles", automationCycles.length, {
      refs: telemetry.refs,
      recordedAt: generatedAt,
    });
    observability.setGauge("sandbox.certification.runtime_release.tasks", tasks.length, {
      refs: telemetry.refs,
      recordedAt: generatedAt,
    });
    observability.setGauge("sandbox.certification.runtime_release.audit_events", auditEvents.length, {
      refs: telemetry.refs,
      recordedAt: generatedAt,
    });
    observability.log("runtime-release certification completed", {
      severity: promotion.status === "blocked" ? "warn" : "info",
      data: {
        artifactPath: artifactPath ?? null,
        diffEntryCount: diffEntries.length,
        historyArtifactPath: historyArtifactPath ?? null,
        promotionStatus: promotion.status,
      },
      refs: telemetry.refs,
      timestamp: generatedAt,
    });
    await observability.flush();

    const runEntity: SandboxCertificationRunEntity = {
      id: runId,
      verificationKind: "runtime-release",
      status: promotion.status === "blocked" ? "failed" : "passed",
      promotionStatus: promotion.status,
      mode: "runtime-release",
      gitSha: options.gitSha,
      ...(options.baselineRef ? { baselineRef: options.baselineRef } : {}),
      ...(options.candidateRef ? { candidateRef: options.candidateRef } : {}),
      ...(historyArtifactPath
        ? { artifactRef: historyArtifactPath }
        : artifactPath
          ? { artifactRef: artifactPath }
          : {}),
      runtimeSignals: {
        ...runtimeSignals,
        telemetryFailures: observability.failures(),
      },
      diffEntries,
      summary: {
        promotion,
        latestCycleId: latestCycleId ?? null,
      },
      generatedAt,
    };
    const persistedRun = await appendSandboxCertificationRun(
      options.sandboxCertificationRuns ?? session.sandboxCertificationRuns,
      runEntity,
    );

    return {
      status: promotion.status === "blocked" ? "failed" : "passed",
      ...(artifactPath ? { artifactPath } : {}),
      ...(historyArtifactPath ? { historyArtifactPath } : {}),
      ...(persistedRun ? { persistedRun } : {}),
      evidence,
    };
  } finally {
    await session.close();
  }
};

const parseArgValue = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
};

const hasArgFlag = (argv: readonly string[], flag: string): boolean => argv.includes(flag);

export const parseSandboxRunnerArgs = (
  argv: readonly string[],
): SandboxRunnerOptions => {
  const mode = (parseArgValue(argv, "--mode") ?? "smoke") as RunnerMode;
  const profileName = (parseArgValue(argv, "--profile") ?? "ci-smoke") as SandboxProfileName;
  const packId = parseArgValue(argv, "--pack") ?? "football-dual-smoke";
  const gitSha = parseArgValue(argv, "--git-sha") ?? "dev-sha-0000000";
  const now = parseArgValue(argv, "--now");

  const validModes: readonly RunnerMode[] = ["smoke", "replay", "cron-validation"];
  if (!validModes.includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  if (!listSandboxProfiles().includes(profileName)) {
    throw new Error(`Unsupported profile: ${profileName}`);
  }

  if (!listSyntheticFixturePackIds().includes(packId)) {
    throw new Error(`Unsupported fixture pack: ${packId}`);
  }

  return {
    mode,
    profileName,
    packId,
    gitSha,
    ...(now ? { now: new Date(now) } : {}),
  };
};

export const runSandboxCli = (argv: readonly string[]): string => {
  const summary = runSandboxScenario(parseSandboxRunnerArgs(argv));

  return JSON.stringify(
    {
      workspace: describeWorkspace(),
      fixtureWorkspace: describeFixtureWorkspace(),
      summary,
    },
    null,
    2,
  );
};

export const parseSandboxCertificationArgs = (
  argv: readonly string[],
): SandboxCertificationOptions => {
  const runnerOptions = parseSandboxRunnerArgs(argv);
  const goldenPath = parseArgValue(argv, "--golden");
  if (!goldenPath) {
    throw new Error("Sandbox certification requires --golden <path>");
  }

  const artifactPath = parseArgValue(argv, "--artifact");

  return {
    ...runnerOptions,
    goldenPath,
    ...(artifactPath ? { artifactPath } : {}),
  };
};

export const runSandboxCertificationCli = async (argv: readonly string[]): Promise<string> => {
  const result = await certifySandboxRun(parseSandboxCertificationArgs(argv));
  return JSON.stringify(result, null, 2);
};

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  if (hasArgFlag(process.argv.slice(2), "--certify")) {
    process.stdout.write(`${await runSandboxCertificationCli(process.argv.slice(2))}\n`);
  } else {
    process.stdout.write(`${runSandboxCli(process.argv.slice(2))}\n`);
  }
}
