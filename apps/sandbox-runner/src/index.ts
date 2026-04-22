import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
  readonly evidence: SandboxCertificationEvidencePack;
  readonly diff: GoldenDiff;
}

export interface SandboxCertificationOptions extends SandboxRunnerOptions {
  readonly goldenPath: string;
  readonly artifactPath?: string;
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

export const writeSandboxCertificationArtifact = async (
  artifactPath: string,
  evidence: SandboxCertificationEvidencePack,
): Promise<string> => {
  const resolvedArtifactPath = resolve(artifactPath);
  await mkdir(dirname(resolvedArtifactPath), { recursive: true });
  await writeFile(resolvedArtifactPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return resolvedArtifactPath;
};

export const certifySandboxRun = async (
  options: SandboxCertificationOptions,
): Promise<SandboxCertificationResult> => {
  const initialEvidence = createSandboxCertificationEvidencePack(options);
  const resolvedGoldenPath = resolve(options.goldenPath);
  const expectedGolden = await loadSandboxGoldenSnapshot(resolvedGoldenPath);
  const diff = diffSandboxGoldenSnapshot(expectedGolden, initialEvidence.goldenSnapshot);
  const evidence = withCertificationOutcome(initialEvidence, diff.changed ? "failed" : "passed");
  const artifactPath = options.artifactPath
    ? await writeSandboxCertificationArtifact(options.artifactPath, evidence)
    : undefined;

  return {
    status: diff.changed ? "failed" : "passed",
    goldenPath: resolvedGoldenPath,
    ...(artifactPath ? { artifactPath } : {}),
    evidence,
    diff,
  };
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
