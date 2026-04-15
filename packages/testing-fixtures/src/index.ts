export interface FixtureScore {
  readonly home: number;
  readonly away: number;
}

export interface FixtureEntity {
  readonly id: string;
  readonly sport: string;
  readonly competition: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly scheduledAt: string;
  readonly status: "scheduled" | "live" | "completed" | "cancelled";
  readonly score?: FixtureScore;
  readonly metadata: Record<string, string>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SandboxNamespace {
  readonly id: string;
  readonly environment: "sandbox";
  readonly sandboxId: string;
  readonly scope: string;
  readonly storagePrefix: string;
  readonly queuePrefix: string;
  readonly metadata: Record<string, string>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const createFixture = (
  input: Omit<FixtureEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<FixtureEntity, "createdAt" | "updatedAt">>,
): FixtureEntity => {
  const timestamp = input.createdAt ?? input.scheduledAt;
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

const createSandboxNamespace = (
  input: Omit<SandboxNamespace, "createdAt" | "updatedAt"> &
    Partial<Pick<SandboxNamespace, "createdAt" | "updatedAt">>,
): SandboxNamespace => {
  const timestamp = input.createdAt ?? baseTimestamp;
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

const namespaceKey = (namespace: SandboxNamespace): string =>
  `${namespace.environment}:${namespace.sandboxId}:${namespace.scope}`;

const assertSandboxIsolation = (
  namespace: SandboxNamespace,
  forbiddenPrefix: string,
): void => {
  if (namespace.storagePrefix.startsWith(forbiddenPrefix)) {
    throw new Error("Sandbox namespace points to a forbidden storage prefix");
  }
};

export const workspaceInfo = {
  packageName: "@gana-v8/testing-fixtures",
  workspaceName: "testing-fixtures",
  category: "package",
  description:
    "Synthetic fixture packs, sandbox profiles, and replay scaffolding for isolated testing.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export type SandboxProfileName =
  | "local-dev"
  | "ci-smoke"
  | "ci-regression"
  | "historical-backtest";

export type ProviderMode = "mock" | "replay" | "disabled" | "live-readonly";
export type RunnerMode = "smoke" | "replay" | "cron-validation";

export interface ReplayEvent {
  readonly id: string;
  readonly fixtureId: string;
  readonly offsetMinutes: number;
  readonly channel: "fixtures" | "odds" | "research" | "validation";
  readonly payload: Record<string, string | number | boolean>;
}

export interface SyntheticFixturePack {
  readonly id: string;
  readonly version: string;
  readonly seed: string;
  readonly sport: string;
  readonly profileHints: readonly SandboxProfileName[];
  readonly fixtures: readonly FixtureEntity[];
  readonly replayEvents: readonly ReplayEvent[];
  readonly validationTargets: {
    readonly expectedFixtureCount: number;
    readonly expectedReplayEvents: number;
    readonly expectedCompletedFixtures: number;
  };
}

export interface CronValidationWindow {
  readonly jobName: string;
  readonly cadenceMinutes: number;
  readonly lookbackMinutes: number;
  readonly dryRun: true;
  readonly writesAllowed: false;
}

export interface SandboxProfileConfig {
  readonly name: SandboxProfileName;
  readonly description: string;
  readonly providerModes: Readonly<Record<string, ProviderMode>>;
  readonly workerTopology: readonly string[];
  readonly clockMode: "real" | "virtual";
  readonly seedMode: "seed-boot" | "snapshot-boot";
  readonly cronValidation: readonly CronValidationWindow[];
  readonly isolation: {
    readonly publishEnabled: false;
    readonly allowedHosts: readonly string[];
    readonly objectStorageRoot: string;
    readonly redisPrefixRoot: string;
  };
}

export interface SandboxNamespaces {
  readonly runtime: SandboxNamespace;
  readonly persistence: SandboxNamespace;
  readonly execution: SandboxNamespace;
  readonly identity: SandboxNamespace;
}

export interface SandboxRunManifest {
  readonly sandboxId: string;
  readonly runId: string;
  readonly profile: SandboxProfileConfig;
  readonly fixturePack: SyntheticFixturePack;
  readonly namespaces: SandboxNamespaces;
  readonly assertionsPack: readonly string[];
}

const baseTimestamp = "2026-08-16T18:00:00.000Z";
const defaultForbiddenPrefix = "prod://";

const createPrng = (seed: string) => {
  let state = 0;
  for (const char of seed) {
    state = (state * 31 + char.charCodeAt(0)) >>> 0;
  }

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pickScore = (rand: () => number): FixtureScore => ({
  home: Math.floor(rand() * 4),
  away: Math.floor(rand() * 3),
});

const createSyntheticPack = (input: {
  readonly id: string;
  readonly seed: string;
  readonly profileHints: readonly SandboxProfileName[];
  readonly baseKickoff: string;
  readonly teams: readonly [string, string][];
  readonly replayShape: "smoke" | "odds-swing";
}): SyntheticFixturePack => {
  const rand = createPrng(input.seed);

  const fixtures = input.teams.map(([homeTeam, awayTeam], index) => {
    const fixtureId = `${input.id}-fx-${index + 1}`;
    const kickoff = new Date(Date.parse(input.baseKickoff) + index * 90 * 60_000).toISOString();
    const finalScore = pickScore(rand);

    return createFixture({
      id: fixtureId,
      sport: "football",
      competition: index % 2 === 0 ? "Premier League" : "Champions League",
      homeTeam,
      awayTeam,
      scheduledAt: kickoff,
      status: index === 0 ? "completed" : "scheduled",
      ...(index === 0 ? { score: finalScore } : {}),
      metadata: {
        seed: input.seed,
        scenario: input.replayShape,
        synthetic: "true",
      },
    });
  });

  const replayEvents = fixtures.flatMap<ReplayEvent>((fixture, index) => {
    const baseId = `${fixture.id}-evt`;
    const nominalEvents: ReplayEvent[] = [
      {
        id: `${baseId}-fixture-upsert`,
        fixtureId: fixture.id,
        offsetMinutes: index * 10,
        channel: "fixtures",
        payload: {
          event: "fixture.upserted",
          status: fixture.status,
        },
      },
      {
        id: `${baseId}-odds-open`,
        fixtureId: fixture.id,
        offsetMinutes: index * 10 + 3,
        channel: "odds",
        payload: {
          event: "odds.open",
          homePrice: Number((1.7 + rand()).toFixed(2)),
          awayPrice: Number((2.1 + rand()).toFixed(2)),
        },
      },
    ];

    if (input.replayShape === "smoke") {
      return nominalEvents;
    }

    return [
      ...nominalEvents,
      {
        id: `${baseId}-research-lineup`,
        fixtureId: fixture.id,
        offsetMinutes: index * 10 + 11,
        channel: "research" as const,
        payload: {
          event: "research.lineup_change",
          severity: "medium",
          source: "synthetic-press-room",
        },
      },
      {
        id: `${baseId}-validation-close`,
        fixtureId: fixture.id,
        offsetMinutes: index * 10 + 18,
        channel: "validation" as const,
        payload: {
          event: "validation.snapshot",
          verdict: index === 0 ? "pass" : "review",
        },
      },
    ];
  });

  return {
    id: input.id,
    version: "2026.08.16",
    seed: input.seed,
    sport: "football",
    profileHints: input.profileHints,
    fixtures,
    replayEvents,
    validationTargets: {
      expectedFixtureCount: fixtures.length,
      expectedReplayEvents: replayEvents.length,
      expectedCompletedFixtures: fixtures.filter((fixture) => fixture.status === "completed").length,
    },
  };
};

const fixturePackCatalog = {
  "football-dual-smoke": createSyntheticPack({
    id: "football-dual-smoke",
    seed: "smoke-seed-2026",
    profileHints: ["local-dev", "ci-smoke"],
    baseKickoff: baseTimestamp,
    teams: [
      ["Chelsea", "Arsenal"],
      ["Real Madrid", "Barcelona"],
    ],
    replayShape: "smoke",
  }),
  "football-replay-late-swing": createSyntheticPack({
    id: "football-replay-late-swing",
    seed: "replay-seed-2026",
    profileHints: ["ci-regression", "historical-backtest"],
    baseKickoff: "2026-05-09T17:30:00.000Z",
    teams: [
      ["Inter", "Milan"],
      ["Boca Juniors", "River Plate"],
      ["PSG", "Marseille"],
    ],
    replayShape: "odds-swing",
  }),
} as const satisfies Record<string, SyntheticFixturePack>;

const profileCatalog: Readonly<Record<SandboxProfileName, SandboxProfileConfig>> = {
  "local-dev": {
    name: "local-dev",
    description: "Fast local sandbox with deterministic synthetic data and mocked providers.",
    providerModes: {
      fixtures_api: "mock",
      odds_api: "mock",
      research_api: "mock",
      publish_api: "disabled",
    },
    workerTopology: ["sandbox-runner", "research-worker", "validation-worker"],
    clockMode: "virtual",
    seedMode: "seed-boot",
    cronValidation: [
      { jobName: "validation-smoke", cadenceMinutes: 15, lookbackMinutes: 120, dryRun: true, writesAllowed: false },
    ],
    isolation: {
      publishEnabled: false,
      allowedHosts: ["localhost", "127.0.0.1"],
      objectStorageRoot: "sandbox://local-dev",
      redisPrefixRoot: "sandbox:local-dev",
    },
  },
  "ci-smoke": {
    name: "ci-smoke",
    description: "Minimal end-to-end smoke path with replay-only sources and hard publishing guard rails.",
    providerModes: {
      fixtures_api: "replay",
      odds_api: "replay",
      research_api: "mock",
      publish_api: "disabled",
    },
    workerTopology: ["sandbox-runner", "validation-worker"],
    clockMode: "virtual",
    seedMode: "seed-boot",
    cronValidation: [
      { jobName: "cron-health-smoke", cadenceMinutes: 30, lookbackMinutes: 180, dryRun: true, writesAllowed: false },
    ],
    isolation: {
      publishEnabled: false,
      allowedHosts: ["sandbox-ci.local"],
      objectStorageRoot: "sandbox://ci-smoke",
      redisPrefixRoot: "sandbox:ci-smoke",
    },
  },
  "ci-regression": {
    name: "ci-regression",
    description: "Deterministic replay profile for regression and invariant checks across multiple fixture packs.",
    providerModes: {
      fixtures_api: "replay",
      odds_api: "replay",
      research_api: "replay",
      publish_api: "disabled",
    },
    workerTopology: ["sandbox-runner", "research-worker", "validation-worker", "scoring-worker"],
    clockMode: "virtual",
    seedMode: "snapshot-boot",
    cronValidation: [
      { jobName: "cron-regression-diff", cadenceMinutes: 60, lookbackMinutes: 720, dryRun: true, writesAllowed: false },
      { jobName: "cron-regression-scorecard", cadenceMinutes: 180, lookbackMinutes: 1440, dryRun: true, writesAllowed: false },
    ],
    isolation: {
      publishEnabled: false,
      allowedHosts: ["sandbox-regression.local"],
      objectStorageRoot: "sandbox://ci-regression",
      redisPrefixRoot: "sandbox:ci-regression",
    },
  },
  "historical-backtest": {
    name: "historical-backtest",
    description: "Time-travel replay for historical windows with validation snapshots and publishing disabled.",
    providerModes: {
      fixtures_api: "replay",
      odds_api: "replay",
      research_api: "live-readonly",
      publish_api: "disabled",
    },
    workerTopology: ["sandbox-runner", "research-worker", "validation-worker", "scoring-worker", "ingestion-worker"],
    clockMode: "virtual",
    seedMode: "snapshot-boot",
    cronValidation: [
      { jobName: "cron-backtest-snapshot", cadenceMinutes: 120, lookbackMinutes: 2880, dryRun: true, writesAllowed: false },
    ],
    isolation: {
      publishEnabled: false,
      allowedHosts: ["sandbox-historical.local"],
      objectStorageRoot: "sandbox://historical-backtest",
      redisPrefixRoot: "sandbox:historical-backtest",
    },
  },
};

export const listSyntheticFixturePackIds = (): readonly string[] =>
  Object.keys(fixturePackCatalog).sort();

export const listSandboxProfiles = (): readonly SandboxProfileName[] =>
  Object.keys(profileCatalog) as SandboxProfileName[];

export const getSyntheticFixturePack = (packId: string): SyntheticFixturePack => {
  const pack = fixturePackCatalog[packId as keyof typeof fixturePackCatalog];
  if (!pack) {
    throw new Error(`Unknown fixture pack: ${packId}`);
  }

  return pack;
};

export const getSandboxProfileConfig = (
  profileName: SandboxProfileName,
): SandboxProfileConfig => profileCatalog[profileName];

export const createSandboxIdentifiers = (input: {
  readonly profileName: SandboxProfileName;
  readonly packId: string;
  readonly gitSha: string;
  readonly now?: Date;
}) => {
  const now = input.now ?? new Date(baseTimestamp);
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const shortSha = input.gitSha.slice(0, 7);
  const base = `${input.profileName}-${input.packId}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  return {
    sandboxId: `sbx-${base}-${timestamp}-${shortSha}`,
    runId: `run-${timestamp}-${shortSha}`,
  };
};

export const createSandboxNamespaces = (input: {
  readonly sandboxId: string;
  readonly profile: SandboxProfileConfig;
  readonly now?: string;
}): SandboxNamespaces => {
  const createdAt = input.now ?? baseTimestamp;
  const createScopedNamespace = (scope: string, storageSegment: string, queueSegment: string): SandboxNamespace => {
    const namespace = createSandboxNamespace({
      id: `${input.sandboxId}-${scope}`,
      environment: "sandbox",
      sandboxId: input.sandboxId,
      scope,
      storagePrefix: `${input.profile.isolation.objectStorageRoot}/${input.sandboxId}/${storageSegment}`,
      queuePrefix: `${input.profile.isolation.redisPrefixRoot}:${input.sandboxId}:${queueSegment}`,
      metadata: {
        dryRun: "true",
        profile: input.profile.name,
      },
      createdAt,
      updatedAt: createdAt,
    });

    assertSandboxIsolation(namespace, defaultForbiddenPrefix);
    return namespace;
  };

  return {
    runtime: createScopedNamespace("runtime", "runtime", "runtime"),
    persistence: createScopedNamespace("persistence", "state", "state"),
    execution: createScopedNamespace("execution", "artifacts", "jobs"),
    identity: createScopedNamespace("identity", "identity", "sessions"),
  };
};

export const createSandboxRunManifest = (input: {
  readonly profileName: SandboxProfileName;
  readonly packId: string;
  readonly gitSha: string;
  readonly assertionsPack?: readonly string[];
  readonly now?: Date;
}): SandboxRunManifest => {
  const profile = getSandboxProfileConfig(input.profileName);
  const fixturePack = getSyntheticFixturePack(input.packId);
  const identifiers = createSandboxIdentifiers({
    profileName: input.profileName,
    packId: input.packId,
    gitSha: input.gitSha,
    ...(input.now ? { now: input.now } : {}),
  });

  return {
    sandboxId: identifiers.sandboxId,
    runId: identifiers.runId,
    profile,
    fixturePack,
    namespaces: createSandboxNamespaces({
      sandboxId: identifiers.sandboxId,
      profile,
      now: (input.now ?? new Date(baseTimestamp)).toISOString(),
    }),
    assertionsPack:
      input.assertionsPack ?? [
        "namespace-isolation",
        "provider-routing",
        "synthetic-fixture-integrity",
        "cron-validation-dry-run",
      ],
  };
};

export const summarizeNamespaces = (namespaces: SandboxNamespaces): readonly string[] =>
  Object.values(namespaces).map((namespace) => namespaceKey(namespace));

export const createCronValidationPlan = (
  manifest: SandboxRunManifest,
): readonly {
  readonly jobName: string;
  readonly namespaceKey: string;
  readonly cadenceMinutes: number;
  readonly lookbackMinutes: number;
  readonly dryRun: true;
  readonly writesAllowed: false;
}[] =>
  manifest.profile.cronValidation.map((job) => ({
    jobName: job.jobName,
    namespaceKey: namespaceKey(manifest.namespaces.execution),
    cadenceMinutes: job.cadenceMinutes,
    lookbackMinutes: job.lookbackMinutes,
    dryRun: job.dryRun,
    writesAllowed: job.writesAllowed,
  }));
