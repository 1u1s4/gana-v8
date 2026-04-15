import {
  createCronValidationPlan,
  createSandboxRunManifest,
  describeWorkspace as describeFixtureWorkspace,
  getSyntheticFixturePack,
  listSandboxProfiles,
  listSyntheticFixturePackIds,
  summarizeNamespaces,
  type RunnerMode,
  type SandboxProfileName,
  type SandboxRunManifest,
} from "../../../packages/testing-fixtures/dist/index.js";

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
  readonly safety: {
    readonly publishEnabled: false;
    readonly allowedHosts: readonly string[];
    readonly cronDryRunOnly: boolean;
  };
}

const createSummary = (
  manifest: SandboxRunManifest,
  mode: RunnerMode,
): SandboxRunSummary => {
  const cronPlan = createCronValidationPlan(manifest);
  const replayChannels = [...new Set(manifest.fixturePack.replayEvents.map((event) => event.channel))].sort();

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
    safety: {
      publishEnabled: manifest.profile.isolation.publishEnabled,
      allowedHosts: manifest.profile.isolation.allowedHosts,
      cronDryRunOnly: cronPlan.every((job) => job.dryRun && !job.writesAllowed),
    },
  };
};

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
      options.mode === "smoke" ? "smoke-health" : "replay-integrity",
      "cron-validation-dry-run",
    ],
  });
};

export const runSandboxScenario = (options: SandboxRunnerOptions): SandboxRunSummary => {
  const manifest = prepareSandboxRun(options);
  return createSummary(manifest, options.mode);
};

const parseArgValue = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
};

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

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  process.stdout.write(`${runSandboxCli(process.argv.slice(2))}\n`);
}
