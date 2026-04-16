export const workspaceInfo = {
  packageName: "@gana-v8/config-runtime",
  workspaceName: "config-runtime",
  category: "package",
  description: "Runtime configuration loading and environment profile scaffolding.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export const appEnvironments = [
  "development",
  "test",
  "staging",
  "production",
] as const;

export const runtimeProfiles = [
  "local-dev",
  "ci-smoke",
  "ci-regression",
  "staging-like",
  "historical-backtest",
  "production",
] as const;

export const runtimeProviderSources = [
  "mock",
  "replay",
  "live-readonly",
] as const;

export const runtimeLogLevels = [
  "debug",
  "info",
  "warn",
  "error",
] as const;

export type AppEnvironment = (typeof appEnvironments)[number];
export type RuntimeProfile = (typeof runtimeProfiles)[number];
export type RuntimeProviderSource = (typeof runtimeProviderSources)[number];
export type RuntimeLogLevel = (typeof runtimeLogLevels)[number];

export interface RuntimeConfig {
  readonly app: {
    readonly name: string;
    readonly env: AppEnvironment;
    readonly profile: RuntimeProfile;
  };
  readonly database: {
    readonly url: string;
  };
  readonly provider: {
    readonly source: RuntimeProviderSource;
    readonly baseUrl: string;
  };
  readonly logging: {
    readonly level: RuntimeLogLevel;
  };
  readonly flags: {
    readonly dryRun: boolean;
    readonly demoMode: boolean;
  };
}

export interface LoadRuntimeConfigOptions {
  readonly appName?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

interface RuntimeProfilePreset {
  readonly appEnv: AppEnvironment;
  readonly databaseUrl: string;
  readonly providerSource: RuntimeProviderSource;
  readonly providerBaseUrl: string;
  readonly logLevel: RuntimeLogLevel;
  readonly dryRun: boolean;
  readonly demoMode: boolean;
}

const defaultProviderBaseUrls: Readonly<Record<RuntimeProviderSource, string>> = {
  mock: "mock://api-football",
  replay: "replay://api-football",
  "live-readonly": "https://api-football-v1.p.rapidapi.com/v3",
};

const createLocalDatabaseUrl = (databaseName: string): string =>
  `mysql://gana:***@localhost:3306/${databaseName}`;

const runtimeProfilePresets: Readonly<Record<RuntimeProfile, RuntimeProfilePreset>> = {
  "local-dev": {
    appEnv: "development",
    databaseUrl: createLocalDatabaseUrl("gana_v8_local_dev"),
    providerSource: "mock",
    providerBaseUrl: defaultProviderBaseUrls.mock,
    logLevel: "debug",
    dryRun: true,
    demoMode: true,
  },
  "ci-smoke": {
    appEnv: "test",
    databaseUrl: createLocalDatabaseUrl("gana_v8_ci_smoke"),
    providerSource: "mock",
    providerBaseUrl: defaultProviderBaseUrls.mock,
    logLevel: "warn",
    dryRun: true,
    demoMode: true,
  },
  "ci-regression": {
    appEnv: "test",
    databaseUrl: createLocalDatabaseUrl("gana_v8_ci_regression"),
    providerSource: "replay",
    providerBaseUrl: defaultProviderBaseUrls.replay,
    logLevel: "warn",
    dryRun: true,
    demoMode: true,
  },
  "staging-like": {
    appEnv: "staging",
    databaseUrl: createLocalDatabaseUrl("gana_v8_staging_like"),
    providerSource: "live-readonly",
    providerBaseUrl: defaultProviderBaseUrls["live-readonly"],
    logLevel: "info",
    dryRun: true,
    demoMode: false,
  },
  "historical-backtest": {
    appEnv: "test",
    databaseUrl: createLocalDatabaseUrl("gana_v8_historical_backtest"),
    providerSource: "replay",
    providerBaseUrl: defaultProviderBaseUrls.replay,
    logLevel: "info",
    dryRun: true,
    demoMode: false,
  },
  production: {
    appEnv: "production",
    databaseUrl: createLocalDatabaseUrl("gana_v8"),
    providerSource: "live-readonly",
    providerBaseUrl: defaultProviderBaseUrls["live-readonly"],
    logLevel: "info",
    dryRun: false,
    demoMode: false,
  },
};

const firstDefined = (...values: readonly (string | undefined)[]): string | undefined =>
  values.find((value) => value !== undefined && value.trim().length > 0);

const parseAppEnvironment = (rawValue: string, variableName: string): AppEnvironment => {
  const normalized = rawValue.trim().toLowerCase();

  switch (normalized) {
    case "dev":
    case "development":
      return "development";
    case "test":
      return "test";
    case "stage":
    case "staging":
      return "staging";
    case "prod":
    case "production":
      return "production";
    default:
      throw new Error(
        `Unsupported ${variableName}: ${rawValue}. Expected one of development, test, staging, production.`,
      );
  }
};

const parseEnum = <TValue extends string>(
  rawValue: string,
  variableName: string,
  allowedValues: readonly TValue[],
): TValue => {
  const normalized = rawValue.trim().toLowerCase();
  const parsed = allowedValues.find((allowedValue) => allowedValue === normalized);
  if (parsed) {
    return parsed;
  }

  throw new Error(
    `Unsupported ${variableName}: ${rawValue}. Expected one of ${allowedValues.join(", ")}.`,
  );
};

const parseBoolean = (rawValue: string, variableName: string): boolean => {
  const normalized = rawValue.trim().toLowerCase();

  switch (normalized) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(`Unsupported boolean value for ${variableName}: ${rawValue}.`);
  }
};

export const defaultRuntimeProfileForEnv = (appEnv: AppEnvironment): RuntimeProfile => {
  switch (appEnv) {
    case "development":
      return "local-dev";
    case "test":
      return "ci-smoke";
    case "staging":
      return "staging-like";
    case "production":
      return "production";
  }
};

export const loadRuntimeConfig = (
  options: LoadRuntimeConfigOptions = {},
): RuntimeConfig => {
  const env = options.env ?? process.env;
  const appName = options.appName ?? "gana-v8";

  const appEnv = (() => {
    const rawValue = firstDefined(env.GANA_APP_ENV, env.APP_ENV, env.NODE_ENV);
    if (!rawValue) {
      return "development";
    }

    const variableName = env.GANA_APP_ENV
      ? "GANA_APP_ENV"
      : env.APP_ENV
        ? "APP_ENV"
        : "NODE_ENV";

    return parseAppEnvironment(rawValue, variableName);
  })();

  const profile = (() => {
    const rawValue = firstDefined(env.GANA_RUNTIME_PROFILE, env.GANA_PROFILE);
    if (!rawValue) {
      return defaultRuntimeProfileForEnv(appEnv);
    }

    return parseEnum(rawValue, "GANA_RUNTIME_PROFILE", runtimeProfiles);
  })();

  const preset = runtimeProfilePresets[profile];
  const providerSource = (() => {
    const rawValue = env.GANA_PROVIDER_SOURCE;
    if (!rawValue) {
      return preset.providerSource;
    }

    return parseEnum(rawValue, "GANA_PROVIDER_SOURCE", runtimeProviderSources);
  })();

  const databaseUrl =
    firstDefined(env.GANA_DATABASE_URL, env.DATABASE_URL) ?? preset.databaseUrl;
  const providerBaseUrl =
    firstDefined(env.GANA_PROVIDER_BASE_URL) ?? defaultProviderBaseUrls[providerSource];
  const logLevel = (() => {
    const rawValue = env.GANA_LOG_LEVEL;
    if (!rawValue) {
      return preset.logLevel;
    }

    return parseEnum(rawValue, "GANA_LOG_LEVEL", runtimeLogLevels);
  })();
  const dryRun = env.GANA_DRY_RUN ? parseBoolean(env.GANA_DRY_RUN, "GANA_DRY_RUN") : preset.dryRun;
  const demoMode = env.GANA_DEMO_MODE ? parseBoolean(env.GANA_DEMO_MODE, "GANA_DEMO_MODE") : preset.demoMode;

  return {
    app: {
      name: appName,
      env: appEnv,
      profile,
    },
    database: {
      url: databaseUrl,
    },
    provider: {
      source: providerSource,
      baseUrl: providerBaseUrl,
    },
    logging: {
      level: logLevel,
    },
    flags: {
      dryRun,
      demoMode,
    },
  };
};
