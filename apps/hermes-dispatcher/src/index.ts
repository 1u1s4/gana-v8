import { pathToFileURL } from "node:url";

import {
  runDispatcherCycle,
  type DispatcherCycleOptions,
  type RuntimeCycleResult,
} from "@gana-v8/control-plane-runtime";

export const workspaceInfo = {
  packageName: "@gana-v8/hermes-dispatcher",
  workspaceName: "hermes-dispatcher",
  category: "app",
  description: "Claims persisted tasks, executes workers, and records dispatcher cycles.",
  dependencies: [{ name: "@gana-v8/control-plane-runtime", category: "workspace" }],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export const runDispatcherService = runDispatcherCycle;

interface DispatcherServiceConfig {
  readonly intervalMs: number;
  readonly maxCycles?: number;
  readonly runForMs?: number;
  readonly cycleTimeoutMs?: number;
  readonly cycleOptions: DispatcherCycleOptions;
}

const serviceName = "hermes-dispatcher";

const readArgValue = (
  args: readonly string[],
  name: string,
): string | undefined => {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const hasArg = (args: readonly string[], name: string): boolean =>
  args.includes(name) || args.some((arg) => arg.startsWith(`${name}=`));

const parsePositiveInteger = (
  value: string | undefined,
  name: string,
): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

const parseNow = (value: string | undefined): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("--now must be a valid ISO-8601 timestamp");
  }

  return parsed;
};

const parseServiceConfig = (
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): DispatcherServiceConfig => {
  const intervalMs =
    parsePositiveInteger(
      readArgValue(args, "--interval-ms") ?? readArgValue(args, "--intervalMs") ?? env.GANA_HERMES_INTERVAL_MS,
      "intervalMs",
    ) ?? 1_000;
  const maxCycles = parsePositiveInteger(
    readArgValue(args, "--max-cycles") ?? readArgValue(args, "--maxCycles") ?? env.GANA_HERMES_MAX_CYCLES,
    "maxCycles",
  );
  const runForMs = parsePositiveInteger(
    readArgValue(args, "--run-for-ms") ?? readArgValue(args, "--runForMs") ?? env.GANA_HERMES_RUN_FOR_MS,
    "runForMs",
  );
  const cycleTimeoutMs = parsePositiveInteger(
    readArgValue(args, "--cycle-timeout-ms") ??
      readArgValue(args, "--timeout-ms") ??
      readArgValue(args, "--timeoutMs") ??
      env.GANA_HERMES_CYCLE_TIMEOUT_MS,
    "cycleTimeoutMs",
  );
  const now = parseNow(readArgValue(args, "--now") ?? env.GANA_HERMES_NOW);
  const leaseOwner = readArgValue(args, "--lease-owner") ?? env.GANA_HERMES_LEASE_OWNER;
  const maxClaims = parsePositiveInteger(
    readArgValue(args, "--max-claims") ?? readArgValue(args, "--maxClaims") ?? env.GANA_HERMES_DISPATCHER_MAX_CLAIMS,
    "maxClaims",
  );
  const manifestId =
    readArgValue(args, "--manifest-id") ??
    readArgValue(args, "--manifestId") ??
    env.GANA_HERMES_DISPATCHER_MANIFEST_ID;

  return {
    intervalMs,
    ...(maxCycles !== undefined ? { maxCycles } : {}),
    ...(runForMs !== undefined ? { runForMs } : {}),
    ...(cycleTimeoutMs !== undefined ? { cycleTimeoutMs } : {}),
    cycleOptions: {
      ...(maxClaims !== undefined ? { maxClaims } : {}),
      ...(manifestId ? { manifestId } : {}),
      ...(now ? { now } : {}),
      ...(leaseOwner ? { leaseOwner } : {}),
    },
  };
};

const shouldRunService = (args: readonly string[], env: NodeJS.ProcessEnv): boolean =>
  hasArg(args, "--service") ||
  hasArg(args, "--loop") ||
  env.GANA_HERMES_SERVICE === "1" ||
  env.GANA_HERMES_DISPATCHER_SERVICE === "1";

const logServiceEvent = (
  event: string,
  payload: Record<string, unknown> = {},
): void => {
  console.log(JSON.stringify({
    event,
    service: serviceName,
    pid: process.pid,
    timestamp: new Date().toISOString(),
    ...payload,
  }));
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const withCycleTimeout = async (
  cycle: Promise<RuntimeCycleResult>,
  cycleTimeoutMs: number | undefined,
): Promise<RuntimeCycleResult> => {
  if (cycleTimeoutMs === undefined) {
    return cycle;
  }

  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      cycle,
      new Promise<RuntimeCycleResult>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`dispatcher cycle timed out after ${cycleTimeoutMs}ms`));
        }, cycleTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

export const runDispatcherLoop = async (
  databaseUrl: string,
  config: DispatcherServiceConfig,
): Promise<void> => {
  const startedAtMs = Date.now();
  let stopping = false;
  let cycleNumber = 0;
  const stop = () => {
    stopping = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  logServiceEvent("hermes.service.ready", {
    intervalMs: config.intervalMs,
    maxCycles: config.maxCycles ?? null,
    runForMs: config.runForMs ?? null,
    cycleTimeoutMs: config.cycleTimeoutMs ?? null,
  });

  try {
    while (!stopping) {
      if (config.runForMs !== undefined && Date.now() - startedAtMs >= config.runForMs) {
        break;
      }
      if (config.maxCycles !== undefined && cycleNumber >= config.maxCycles) {
        break;
      }

      cycleNumber += 1;
      logServiceEvent("hermes.cycle.started", { cycleNumber });
      const result = await withCycleTimeout(
        runDispatcherService(databaseUrl, config.cycleOptions),
        config.cycleTimeoutMs,
      );
      logServiceEvent("hermes.cycle.completed", {
        cycleNumber,
        cycleId: result.cycle.id,
        status: result.cycle.status,
        taskCount: result.cycle.summary?.taskIds?.length ?? 0,
        fixtureCount: result.cycle.summary?.fixtureIds?.length ?? 0,
        readModelLoaded: result.readModel !== undefined && result.readModel !== null,
      });

      if (config.maxCycles !== undefined && cycleNumber >= config.maxCycles) {
        break;
      }

      const elapsedMs = Date.now() - startedAtMs;
      const remainingRunMs =
        config.runForMs !== undefined ? config.runForMs - elapsedMs : undefined;
      if (remainingRunMs !== undefined && remainingRunMs <= 0) {
        break;
      }

      await delay(
        remainingRunMs === undefined
          ? config.intervalMs
          : Math.min(config.intervalMs, remainingRunMs),
      );
    }
  } catch (error) {
    logServiceEvent("hermes.cycle.failed", {
      cycleNumber,
      error: error instanceof Error ? error.message : "Unexpected dispatcher service error",
    });
    throw error;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    logServiceEvent("hermes.service.stopped", {
      cycleCount: cycleNumber,
      reason: stopping ? "signal" : "limit",
    });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.GANA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("GANA_DATABASE_URL or DATABASE_URL is required");
  }

  const args = process.argv.slice(2);
  if (shouldRunService(args, process.env)) {
    await runDispatcherLoop(databaseUrl, parseServiceConfig(args, process.env));
  } else {
    const result = await runDispatcherService(databaseUrl);
    console.log(JSON.stringify(result.readModel ?? result.cycle, null, 2));
  }
}
