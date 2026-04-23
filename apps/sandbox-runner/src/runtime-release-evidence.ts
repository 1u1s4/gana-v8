import { execFileSync } from "node:child_process";

export type RuntimeReleaseEvidenceProfile =
  | "ci-ephemeral"
  | "staging-shared"
  | "pre-release";

export interface RuntimeReleaseEvidenceDefaults {
  readonly evidenceProfile: RuntimeReleaseEvidenceProfile;
  readonly gitSha: string;
  readonly now?: Date;
  readonly lookbackHours: number;
  readonly baselineRef: string;
  readonly candidateRef: string;
}

export interface ResolveRuntimeReleaseEvidenceDefaultsOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
  readonly evidenceProfile?: RuntimeReleaseEvidenceProfile;
  readonly gitSha?: string;
  readonly now?: Date;
  readonly lookbackHours?: number;
  readonly baselineRef?: string;
  readonly candidateRef?: string;
}

interface RuntimeReleaseEvidencePreset {
  readonly now?: string;
  readonly lookbackHours: number;
}

const runtimeReleaseEvidencePresets: Readonly<
  Record<RuntimeReleaseEvidenceProfile, RuntimeReleaseEvidencePreset>
> = {
  "ci-ephemeral": {
    now: "2100-01-02T00:00:00.000Z",
    lookbackHours: 48,
  },
  "staging-shared": {
    lookbackHours: 72,
  },
  "pre-release": {
    lookbackHours: 168,
  },
};

const truthyPattern = /^(1|true|yes|on)$/i;

const asNonEmptyString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const parseRuntimeReleaseEvidenceProfile = (
  rawValue: string,
): RuntimeReleaseEvidenceProfile => {
  const normalized = rawValue.trim().toLowerCase();
  switch (normalized) {
    case "ci-ephemeral":
    case "staging-shared":
    case "pre-release":
      return normalized;
    default:
      throw new Error(
        `Unsupported SANDBOX_CERT_EVIDENCE_PROFILE: ${rawValue}. Expected ci-ephemeral, staging-shared, pre-release.`,
      );
  }
};

const parseDateOverride = (rawValue: string, variableName: string): Date => {
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(
      `Unsupported ${variableName}: ${rawValue}. Expected an ISO-8601 timestamp.`,
    );
  }
  return parsed;
};

const parseLookbackHoursOverride = (
  rawValue: string,
  variableName: string,
): number => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Unsupported ${variableName}: ${rawValue}. Expected a finite number of hours.`,
    );
  }
  return parsed;
};

const isCiOrGitHubEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
): boolean =>
  truthyPattern.test(env.CI ?? "") ||
  truthyPattern.test(env.GITHUB_ACTIONS ?? "") ||
  asNonEmptyString(env.GITHUB_SHA) !== undefined ||
  asNonEmptyString(env.GITHUB_REF) !== undefined;

const mapRuntimeProfileToEvidenceProfile = (
  runtimeProfile: string | undefined,
): RuntimeReleaseEvidenceProfile | undefined => {
  switch (runtimeProfile?.trim().toLowerCase()) {
    case "ci-smoke":
    case "ci-regression":
      return "ci-ephemeral";
    case "staging":
    case "staging-like":
    case "hybrid":
      return "staging-shared";
    case "local-dev":
    case "historical-backtest":
    case "chaos-provider":
    case "human-qa-demo":
    case "production":
      return "pre-release";
    default:
      return undefined;
  }
};

const resolveGitCommand = (
  cwd: string,
  args: readonly string[],
): string | undefined => {
  try {
    const output = execFileSync("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString("utf8");
    return asNonEmptyString(output);
  } catch {
    return undefined;
  }
};

const resolveCurrentGitSha = (cwd: string): string | undefined =>
  resolveGitCommand(cwd, ["rev-parse", "HEAD"]);

const resolveCurrentGitBranch = (cwd: string): string | undefined =>
  resolveGitCommand(cwd, ["branch", "--show-current"]);

export const resolveRuntimeReleaseEvidenceDefaults = (
  options: ResolveRuntimeReleaseEvidenceDefaultsOptions = {},
): RuntimeReleaseEvidenceDefaults => {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const currentGitSha = resolveCurrentGitSha(cwd);
  const currentGitBranch =
    currentGitSha === undefined ? resolveCurrentGitBranch(cwd) : undefined;
  const evidenceProfileOverride = asNonEmptyString(
    env.SANDBOX_CERT_EVIDENCE_PROFILE,
  );
  const evidenceProfile =
    options.evidenceProfile ??
    (evidenceProfileOverride
      ? parseRuntimeReleaseEvidenceProfile(evidenceProfileOverride)
      : isCiOrGitHubEnvironment(env)
        ? "ci-ephemeral"
        : (mapRuntimeProfileToEvidenceProfile(
            asNonEmptyString(env.GANA_RUNTIME_PROFILE) ??
              asNonEmptyString(env.GANA_PROFILE),
          ) ?? "pre-release"));
  const preset = runtimeReleaseEvidencePresets[evidenceProfile];
  const gitSha =
    asNonEmptyString(options.gitSha) ??
    asNonEmptyString(env.SANDBOX_CERT_GIT_SHA) ??
    asNonEmptyString(env.GITHUB_SHA) ??
    currentGitSha ??
    "local-runtime-release";
  const envNow = asNonEmptyString(env.SANDBOX_CERT_NOW);
  const now =
    options.now ??
    (envNow
      ? parseDateOverride(envNow, "SANDBOX_CERT_NOW")
      : preset.now
        ? new Date(preset.now)
        : undefined);
  const envLookbackHours = asNonEmptyString(env.SANDBOX_CERT_LOOKBACK_HOURS);
  const lookbackHours = Math.max(
    1,
    options.lookbackHours ??
      (envLookbackHours
        ? parseLookbackHoursOverride(
            envLookbackHours,
            "SANDBOX_CERT_LOOKBACK_HOURS",
          )
        : preset.lookbackHours),
  );
  const baselineRef =
    asNonEmptyString(options.baselineRef) ??
    asNonEmptyString(env.SANDBOX_CERT_BASELINE_REF) ??
    asNonEmptyString(env.GITHUB_BASE_REF) ??
    "main";
  const candidateRef =
    asNonEmptyString(options.candidateRef) ??
    asNonEmptyString(env.SANDBOX_CERT_CANDIDATE_REF) ??
    asNonEmptyString(env.GITHUB_SHA) ??
    currentGitSha ??
    currentGitBranch ??
    gitSha;

  return {
    evidenceProfile,
    gitSha,
    ...(now ? { now } : {}),
    lookbackHours,
    baselineRef,
    candidateRef,
  };
};
