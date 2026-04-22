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
  | "historical-backtest"
  | "staging-like"
  | "hybrid"
  | "chaos-provider"
  | "human-qa-demo";

export type ProviderMode = "mock" | "replay" | "disabled" | "live-readonly";
export type RunnerMode = "smoke" | "replay" | "cron-validation";
export type SandboxSideEffect =
  | "sandbox-object-storage-write"
  | "sandbox-queue-write"
  | "network-live-readonly"
  | "human-review";
export type SandboxCapability =
  | "fixtures.read"
  | "odds.read"
  | "research.read"
  | "research.assignments"
  | "cron.validate"
  | "publication.inspect"
  | "operator.review";
export type SandboxSkill = "fixture-inspection" | "research-triage" | "ops-audit" | "manual-qa";

export interface SandboxSecretsPolicy {
  readonly mode: "forbid-real-secrets" | "allow-sandbox-secrets";
  readonly allowedSecretRefs: readonly string[];
  readonly allowProductionCredentials: false;
}

export interface SandboxMemoryIsolationPolicy {
  readonly strategy: "profile-run-namespace";
  readonly namespaceRoot: string;
  readonly allowProductionMemory: false;
}

export interface SandboxSessionIsolationPolicy {
  readonly strategy: "profile-run-namespace";
  readonly namespaceRoot: string;
  readonly allowSharedSessions: false;
}

export interface SandboxSkillPolicy {
  readonly mode: "allowlist";
  readonly defaultDeny: true;
  readonly enabledSkills: readonly SandboxSkill[];
}

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
  readonly assertionHints: readonly string[];
  readonly promotionExpectation: "normal" | "review-required";
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
    readonly sideEffects: readonly SandboxSideEffect[];
    readonly secretsPolicy: SandboxSecretsPolicy;
    readonly capabilityAllowlist: readonly SandboxCapability[];
    readonly memoryIsolation: SandboxMemoryIsolationPolicy;
    readonly sessionIsolation: SandboxSessionIsolationPolicy;
    readonly skillPolicy: SandboxSkillPolicy;
    readonly requiresManualQa: boolean;
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

export interface ReplayTimelineEntry {
  readonly id: string;
  readonly fixtureId: string;
  readonly channel: ReplayEvent["channel"];
  readonly offsetMinutes: number;
  readonly scheduledAt: string;
  readonly payloadFingerprint: string;
}

export interface VirtualClockTick {
  readonly at: string;
  readonly label: string;
  readonly offsetMinutes: number;
}

export interface VirtualClockPlan {
  readonly mode: SandboxProfileConfig["clockMode"];
  readonly startAt: string;
  readonly endAt: string;
  readonly tickCount: number;
  readonly ticks: readonly VirtualClockTick[];
}

export interface GoldenFixturePackFingerprint {
  readonly packId: string;
  readonly version: string;
  readonly fixtureCount: number;
  readonly replayEventCount: number;
  readonly fingerprint: string;
}

export interface FixturePackComparison {
  readonly baselineFingerprint: GoldenFixturePackFingerprint;
  readonly candidateFingerprint: GoldenFixturePackFingerprint;
  readonly changed: boolean;
  readonly fixtureDelta: number;
  readonly replayEventDelta: number;
  readonly changedFixtureIds: readonly string[];
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
  readonly assertionHints: readonly string[];
  readonly promotionExpectation: "normal" | "review-required";
  readonly baseKickoff: string;
  readonly teams: readonly [string, string][];
  readonly replayShape: "smoke" | "odds-swing" | "hybrid-mix" | "chaos-drill" | "manual-qa";
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

    if (input.replayShape === "hybrid-mix") {
      return [
        ...nominalEvents,
        {
          id: `${baseId}-research-hybrid`,
          fixtureId: fixture.id,
          offsetMinutes: index * 10 + 11,
          channel: "research" as const,
          payload: {
            event: "research.hybrid_snapshot",
            providerMode: index % 2 === 0 ? "live-readonly" : "replay",
            safeFallback: true,
          },
        },
        {
          id: `${baseId}-validation-hybrid`,
          fixtureId: fixture.id,
          offsetMinutes: index * 10 + 16,
          channel: "validation" as const,
          payload: {
            event: "validation.hybrid_gate",
            verdict: "pass",
            operatorReview: false,
          },
        },
      ];
    }

    if (input.replayShape === "chaos-drill") {
      return [
        ...nominalEvents,
        {
          id: `${baseId}-research-chaos`,
          fixtureId: fixture.id,
          offsetMinutes: index * 10 + 8,
          channel: "research" as const,
          payload: {
            event: "research.provider_fault",
            fault: index % 2 === 0 ? "timeout" : "stale-data",
            severity: index === 0 ? "high" : "medium",
          },
        },
        {
          id: `${baseId}-validation-chaos`,
          fixtureId: fixture.id,
          offsetMinutes: index * 10 + 14,
          channel: "validation" as const,
          payload: {
            event: "validation.degradation_gate",
            verdict: index === 0 ? "review" : "pass",
            operatorReview: true,
          },
        },
      ];
    }

    if (input.replayShape === "manual-qa") {
      return [
        ...nominalEvents,
        {
          id: `${baseId}-research-manual`,
          fixtureId: fixture.id,
          offsetMinutes: index * 10 + 9,
          channel: "research" as const,
          payload: {
            event: "research.manual_checkpoint",
            checklist: true,
            operatorReview: true,
          },
        },
        {
          id: `${baseId}-validation-manual`,
          fixtureId: fixture.id,
          offsetMinutes: index * 10 + 15,
          channel: "validation" as const,
          payload: {
            event: "validation.manual_gate",
            verdict: "review",
            operatorReview: true,
          },
        },
      ];
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
    assertionHints: input.assertionHints,
    promotionExpectation: input.promotionExpectation,
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
    assertionHints: ["smoke-health", "contract-coverage"],
    promotionExpectation: "normal",
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
    assertionHints: ["replay-integrity", "contract-coverage"],
    promotionExpectation: "normal",
    baseKickoff: "2026-05-09T17:30:00.000Z",
    teams: [
      ["Inter", "Milan"],
      ["Boca Juniors", "River Plate"],
      ["PSG", "Marseille"],
    ],
    replayShape: "odds-swing",
  }),
  "football-staging-parity": createSyntheticPack({
    id: "football-staging-parity",
    seed: "staging-parity-seed-2026",
    profileHints: ["staging-like"],
    assertionHints: ["staging-parity", "publication-safety", "contract-coverage"],
    promotionExpectation: "normal",
    baseKickoff: "2026-09-12T18:00:00.000Z",
    teams: [
      ["Manchester City", "Tottenham"],
      ["Atletico Madrid", "Sevilla"],
    ],
    replayShape: "odds-swing",
  }),
  "football-hybrid-routing": createSyntheticPack({
    id: "football-hybrid-routing",
    seed: "hybrid-routing-seed-2026",
    profileHints: ["hybrid"],
    assertionHints: ["mixed-provider-routing", "contract-coverage"],
    promotionExpectation: "normal",
    baseKickoff: "2026-10-02T17:00:00.000Z",
    teams: [
      ["Benfica", "Porto"],
      ["Ajax", "PSV"],
    ],
    replayShape: "hybrid-mix",
  }),
  "football-chaos-provider": createSyntheticPack({
    id: "football-chaos-provider",
    seed: "chaos-provider-seed-2026",
    profileHints: ["chaos-provider"],
    assertionHints: ["chaos-provider-degradation", "contract-coverage"],
    promotionExpectation: "review-required",
    baseKickoff: "2026-11-05T19:30:00.000Z",
    teams: [
      ["Liverpool", "Newcastle"],
      ["Roma", "Napoli"],
    ],
    replayShape: "chaos-drill",
  }),
  "football-human-qa-demo": createSyntheticPack({
    id: "football-human-qa-demo",
    seed: "human-qa-seed-2026",
    profileHints: ["human-qa-demo"],
    assertionHints: ["manual-qa-checklist", "contract-coverage"],
    promotionExpectation: "review-required",
    baseKickoff: "2026-12-08T20:00:00.000Z",
    teams: [
      ["Club America", "Pumas"],
      ["LAFC", "Seattle Sounders"],
    ],
    replayShape: "manual-qa",
  }),
} as const satisfies Record<string, SyntheticFixturePack>;

const createProfileIsolation = (input: {
  readonly profileName: SandboxProfileName;
  readonly allowedHosts: readonly string[];
  readonly objectStorageRoot: string;
  readonly redisPrefixRoot: string;
  readonly sideEffects: readonly SandboxSideEffect[];
  readonly capabilityAllowlist: readonly SandboxCapability[];
  readonly enabledSkills: readonly SandboxSkill[];
  readonly requiresManualQa: boolean;
}): SandboxProfileConfig["isolation"] => ({
  publishEnabled: false,
  allowedHosts: input.allowedHosts,
  objectStorageRoot: input.objectStorageRoot,
  redisPrefixRoot: input.redisPrefixRoot,
  sideEffects: input.sideEffects,
  secretsPolicy: {
    mode: "allow-sandbox-secrets",
    allowedSecretRefs: [`sandbox/${input.profileName}/provider-token`, `sandbox/${input.profileName}/ops-token`],
    allowProductionCredentials: false,
  },
  capabilityAllowlist: input.capabilityAllowlist,
  memoryIsolation: {
    strategy: "profile-run-namespace",
    namespaceRoot: `sandbox-memory://${input.profileName}`,
    allowProductionMemory: false,
  },
  sessionIsolation: {
    strategy: "profile-run-namespace",
    namespaceRoot: `sandbox-session://${input.profileName}`,
    allowSharedSessions: false,
  },
  skillPolicy: {
    mode: "allowlist",
    defaultDeny: true,
    enabledSkills: input.enabledSkills,
  },
  requiresManualQa: input.requiresManualQa,
});

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
    isolation: createProfileIsolation({
      profileName: "local-dev",
      allowedHosts: ["localhost", "127.0.0.1"],
      objectStorageRoot: "sandbox://local-dev",
      redisPrefixRoot: "sandbox:local-dev",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "research.read", "cron.validate"],
      enabledSkills: ["fixture-inspection"],
      requiresManualQa: false,
    }),
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
    isolation: createProfileIsolation({
      profileName: "ci-smoke",
      allowedHosts: ["sandbox-ci.local"],
      objectStorageRoot: "sandbox://ci-smoke",
      redisPrefixRoot: "sandbox:ci-smoke",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "cron.validate"],
      enabledSkills: ["ops-audit"],
      requiresManualQa: false,
    }),
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
    isolation: createProfileIsolation({
      profileName: "ci-regression",
      allowedHosts: ["sandbox-regression.local"],
      objectStorageRoot: "sandbox://ci-regression",
      redisPrefixRoot: "sandbox:ci-regression",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "research.read", "research.assignments", "cron.validate"],
      enabledSkills: ["fixture-inspection", "research-triage"],
      requiresManualQa: false,
    }),
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
    isolation: createProfileIsolation({
      profileName: "historical-backtest",
      allowedHosts: ["sandbox-historical.local"],
      objectStorageRoot: "sandbox://historical-backtest",
      redisPrefixRoot: "sandbox:historical-backtest",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write", "network-live-readonly"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "research.read", "research.assignments", "cron.validate"],
      enabledSkills: ["fixture-inspection", "research-triage"],
      requiresManualQa: false,
    }),
  },
  "staging-like": {
    name: "staging-like",
    description: "Highest parity sandbox profile with live-readonly provider policy and publication safety locked down.",
    providerModes: {
      fixtures_api: "live-readonly",
      odds_api: "live-readonly",
      research_api: "replay",
      publish_api: "disabled",
    },
    workerTopology: ["sandbox-runner", "research-worker", "validation-worker", "scoring-worker", "ingestion-worker"],
    clockMode: "virtual",
    seedMode: "snapshot-boot",
    cronValidation: [
      { jobName: "cron-staging-parity", cadenceMinutes: 60, lookbackMinutes: 360, dryRun: true, writesAllowed: false },
      { jobName: "cron-staging-publication-safety", cadenceMinutes: 180, lookbackMinutes: 1440, dryRun: true, writesAllowed: false },
    ],
    isolation: createProfileIsolation({
      profileName: "staging-like",
      allowedHosts: ["sandbox-staging.local", "api-football-v1.p.rapidapi.com"],
      objectStorageRoot: "sandbox://staging-like",
      redisPrefixRoot: "sandbox:staging-like",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write", "network-live-readonly"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "research.read", "research.assignments", "cron.validate", "publication.inspect"],
      enabledSkills: ["fixture-inspection", "research-triage", "ops-audit"],
      requiresManualQa: false,
    }),
  },
  hybrid: {
    name: "hybrid",
    description: "Mixed-provider sandbox with replay fixtures, mock assists, and explicit live-readonly policy tracing.",
    providerModes: {
      fixtures_api: "replay",
      odds_api: "live-readonly",
      research_api: "mock",
      publish_api: "disabled",
    },
    workerTopology: ["sandbox-runner", "research-worker", "validation-worker", "scoring-worker"],
    clockMode: "virtual",
    seedMode: "snapshot-boot",
    cronValidation: [
      { jobName: "cron-hybrid-routing", cadenceMinutes: 45, lookbackMinutes: 240, dryRun: true, writesAllowed: false },
    ],
    isolation: createProfileIsolation({
      profileName: "hybrid",
      allowedHosts: ["sandbox-hybrid.local", "api-football-v1.p.rapidapi.com"],
      objectStorageRoot: "sandbox://hybrid",
      redisPrefixRoot: "sandbox:hybrid",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write", "network-live-readonly"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "research.read", "research.assignments", "cron.validate", "publication.inspect"],
      enabledSkills: ["fixture-inspection", "research-triage", "ops-audit"],
      requiresManualQa: false,
    }),
  },
  "chaos-provider": {
    name: "chaos-provider",
    description: "Deterministic failure-injection profile for validating safe degradation and promotion review gates.",
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
      { jobName: "cron-chaos-drill", cadenceMinutes: 30, lookbackMinutes: 180, dryRun: true, writesAllowed: false },
    ],
    isolation: createProfileIsolation({
      profileName: "chaos-provider",
      allowedHosts: ["sandbox-chaos.local"],
      objectStorageRoot: "sandbox://chaos-provider",
      redisPrefixRoot: "sandbox:chaos-provider",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write", "human-review"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "research.read", "research.assignments", "cron.validate", "operator.review"],
      enabledSkills: ["fixture-inspection", "research-triage", "ops-audit"],
      requiresManualQa: true,
    }),
  },
  "human-qa-demo": {
    name: "human-qa-demo",
    description: "Operator-supervised QA walkthrough profile with checklist evidence and explicit manual review gates.",
    providerModes: {
      fixtures_api: "replay",
      odds_api: "mock",
      research_api: "mock",
      publish_api: "disabled",
    },
    workerTopology: ["sandbox-runner", "validation-worker", "research-worker"],
    clockMode: "virtual",
    seedMode: "seed-boot",
    cronValidation: [
      { jobName: "cron-human-qa-checklist", cadenceMinutes: 90, lookbackMinutes: 240, dryRun: true, writesAllowed: false },
    ],
    isolation: createProfileIsolation({
      profileName: "human-qa-demo",
      allowedHosts: ["sandbox-human-qa.local"],
      objectStorageRoot: "sandbox://human-qa-demo",
      redisPrefixRoot: "sandbox:human-qa-demo",
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write", "human-review"],
      capabilityAllowlist: ["fixtures.read", "odds.read", "research.read", "cron.validate", "operator.review"],
      enabledSkills: ["fixture-inspection", "manual-qa", "ops-audit"],
      requiresManualQa: true,
    }),
  },
};

const ensureUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Sandbox profile ${label} contains duplicated values`);
  }
};

export const validateSandboxProfileConfig = (profile: SandboxProfileConfig): void => {
  if (profile.isolation.publishEnabled) {
    throw new Error(`Sandbox profile ${profile.name} must keep publishing disabled`);
  }

  if (profile.providerModes.publish_api !== "disabled") {
    throw new Error(`Sandbox profile ${profile.name} must disable publish_api`);
  }

  if (profile.isolation.allowedHosts.length === 0) {
    throw new Error(`Sandbox profile ${profile.name} must define at least one allowed host`);
  }

  ensureUnique(profile.isolation.capabilityAllowlist, `${profile.name}:capabilityAllowlist`);
  ensureUnique(profile.isolation.skillPolicy.enabledSkills, `${profile.name}:enabledSkills`);

  if (!profile.isolation.skillPolicy.defaultDeny || profile.isolation.skillPolicy.mode !== "allowlist") {
    throw new Error(`Sandbox profile ${profile.name} must enforce default-deny skill policy`);
  }

  if (profile.isolation.secretsPolicy.allowProductionCredentials) {
    throw new Error(`Sandbox profile ${profile.name} must forbid production credentials`);
  }

  const usesLiveReadonly = Object.values(profile.providerModes).some((mode) => mode === "live-readonly");
  const allowsReadonlyNetwork = profile.isolation.sideEffects.includes("network-live-readonly");
  if (usesLiveReadonly !== allowsReadonlyNetwork) {
    throw new Error(
      `Sandbox profile ${profile.name} must align live-readonly providers with network-live-readonly side effects`,
    );
  }

  if (
    profile.isolation.requiresManualQa &&
    !profile.isolation.capabilityAllowlist.includes("operator.review")
  ) {
    throw new Error(`Sandbox profile ${profile.name} requires manual QA but lacks operator.review capability`);
  }
};

export interface SandboxPolicySnapshot {
  readonly sideEffects: readonly SandboxSideEffect[];
  readonly secretsPolicy: SandboxSecretsPolicy;
  readonly capabilityAllowlist: readonly SandboxCapability[];
  readonly memoryIsolation: SandboxMemoryIsolationPolicy;
  readonly sessionIsolation: SandboxSessionIsolationPolicy;
  readonly skillPolicy: SandboxSkillPolicy;
  readonly requiresManualQa: boolean;
  readonly defaultDeny: true;
}

export const createSandboxPolicySnapshot = (
  profile: SandboxProfileConfig,
): SandboxPolicySnapshot => ({
  sideEffects: profile.isolation.sideEffects,
  secretsPolicy: profile.isolation.secretsPolicy,
  capabilityAllowlist: profile.isolation.capabilityAllowlist,
  memoryIsolation: profile.isolation.memoryIsolation,
  sessionIsolation: profile.isolation.sessionIsolation,
  skillPolicy: profile.isolation.skillPolicy,
  requiresManualQa: profile.isolation.requiresManualQa,
  defaultDeny: profile.isolation.skillPolicy.defaultDeny,
});

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
  validateSandboxProfileConfig(input.profile);
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
        memoryIsolation: input.profile.isolation.memoryIsolation.strategy,
        sessionIsolation: input.profile.isolation.sessionIsolation.strategy,
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
  validateSandboxProfileConfig(profile);
  if (!fixturePack.profileHints.includes(input.profileName)) {
    throw new Error(`Fixture pack ${input.packId} is not approved for profile ${input.profileName}`);
  }
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
        "policy-default-deny",
        "synthetic-fixture-integrity",
        "cron-validation-dry-run",
        ...fixturePack.assertionHints,
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

const stableFingerprint = (value: unknown): string => JSON.stringify(value);

export const buildReplayTimeline = (manifest: SandboxRunManifest): readonly ReplayTimelineEntry[] =>
  [...manifest.fixturePack.replayEvents]
    .sort((left, right) => {
      if (left.offsetMinutes !== right.offsetMinutes) {
        return left.offsetMinutes - right.offsetMinutes;
      }

      return left.id.localeCompare(right.id);
    })
    .map((event) => ({
      id: event.id,
      fixtureId: event.fixtureId,
      channel: event.channel,
      offsetMinutes: event.offsetMinutes,
      scheduledAt: new Date(Date.parse(baseTimestamp) + event.offsetMinutes * 60_000).toISOString(),
      payloadFingerprint: stableFingerprint(event.payload),
    }));

export const createVirtualClockPlan = (manifest: SandboxRunManifest): VirtualClockPlan => {
  const timeline = buildReplayTimeline(manifest);
  const ticks: VirtualClockTick[] = timeline.map((entry) => ({
    at: entry.scheduledAt,
    label: `${entry.channel}:${entry.id}`,
    offsetMinutes: entry.offsetMinutes,
  }));
  const startAt = ticks[0]?.at ?? baseTimestamp;
  const endAt = ticks.at(-1)?.at ?? startAt;

  return {
    mode: manifest.profile.clockMode,
    startAt,
    endAt,
    tickCount: ticks.length,
    ticks,
  };
};

export const createGoldenFixturePackFingerprint = (
  pack: SyntheticFixturePack,
): GoldenFixturePackFingerprint => ({
  packId: pack.id,
  version: pack.version,
  fixtureCount: pack.fixtures.length,
  replayEventCount: pack.replayEvents.length,
  fingerprint: stableFingerprint({
    id: pack.id,
    version: pack.version,
    fixtures: pack.fixtures.map((fixture) => ({
      id: fixture.id,
      status: fixture.status,
      scheduledAt: fixture.scheduledAt,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      metadata: fixture.metadata,
    })),
    replayEvents: pack.replayEvents.map((event) => ({
      id: event.id,
      fixtureId: event.fixtureId,
      offsetMinutes: event.offsetMinutes,
      channel: event.channel,
      payload: event.payload,
    })),
  }),
});

export const compareFixturePacks = (
  baseline: SyntheticFixturePack,
  candidate: SyntheticFixturePack,
): FixturePackComparison => {
  const baselineFingerprint = createGoldenFixturePackFingerprint(baseline);
  const candidateFingerprint = createGoldenFixturePackFingerprint(candidate);
  const baselineFixtures = new Map(
    baseline.fixtures.map((fixture) => [fixture.id, stableFingerprint({ status: fixture.status, scheduledAt: fixture.scheduledAt, metadata: fixture.metadata })]),
  );
  const candidateFixtures = new Map(
    candidate.fixtures.map((fixture) => [fixture.id, stableFingerprint({ status: fixture.status, scheduledAt: fixture.scheduledAt, metadata: fixture.metadata })]),
  );
  const changedFixtureIds = [...new Set([...baselineFixtures.keys(), ...candidateFixtures.keys()])]
    .filter((fixtureId) => baselineFixtures.get(fixtureId) !== candidateFixtures.get(fixtureId))
    .sort();

  return {
    baselineFingerprint,
    candidateFingerprint,
    changed: baselineFingerprint.fingerprint !== candidateFingerprint.fingerprint,
    fixtureDelta: candidate.fixtures.length - baseline.fixtures.length,
    replayEventDelta: candidate.replayEvents.length - baseline.replayEvents.length,
    changedFixtureIds,
  };
};
