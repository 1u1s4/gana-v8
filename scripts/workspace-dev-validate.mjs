#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = resolve(dirname(scriptPath), "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const startupTimeoutMs = 120_000;
const pollIntervalMs = 1_000;
const stopDeadlineMs = 7_500;

const publicApiChecks = [
  { id: "public-api-health", path: "/health", type: "json" },
  { id: "public-api-readiness", path: "/readiness", type: "json" },
  { id: "public-api-snapshot", path: "/snapshot", type: "json" },
  { id: "public-api-operational-summary", path: "/operational-summary", type: "json" },
  { id: "public-api-sandbox-certification", path: "/sandbox-certification", type: "json" },
  {
    id: "public-api-runtime-release-runs",
    path: "/sandbox-certification/runs?verificationKind=runtime-release",
    type: "json",
  },
  { id: "public-api-telemetry-events", path: "/telemetry/events", type: "json" },
  { id: "public-api-telemetry-metrics", path: "/telemetry/metrics", type: "json" },
];

const operatorConsoleChecks = [
  { id: "operator-console-root", path: "/", type: "html", includes: "dashboard-root" },
  { id: "operator-console-app-js", path: "/app.js", type: "text", includes: "renderDashboard" },
  { id: "operator-console-styles", path: "/styles.css", type: "text", includes: "dashboard-root" },
  { id: "operator-console-api-console", path: "/api/console", type: "json" },
];

export const runWorkspaceDevValidation = async (input = {}) => {
  const repoRoot = input.repoRoot ?? defaultRepoRoot;
  const worktreeId = input.worktreeId ?? process.env.GANA_WORKSPACE_DEV_ID ?? "workspace";
  const basePort = Number(input.basePort ?? process.env.GANA_WORKSPACE_DEV_BASE_PORT ?? 3100);
  const publicApiPort = Number(input.publicApiPort ?? process.env.GANA_PUBLIC_API_PORT ?? basePort);
  const operatorConsolePort = Number(
    input.operatorConsolePort ?? process.env.GANA_OPERATOR_CONSOLE_PORT ?? (basePort === 3100 ? 3200 : basePort + 1),
  );
  const artifactRoot = resolve(
    repoRoot,
    input.artifactRoot ?? process.env.GANA_WORKSPACE_DEV_ARTIFACT_ROOT ?? `.artifacts/workspace-dev/${worktreeId}`,
  );
  const level = input.level ?? "smoke";
  if (!["smoke", "live", "release"].includes(level)) {
    throw new Error(`Unsupported validation level: ${level}`);
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const validationRoot = resolve(artifactRoot, "validation", runId);
  const logsRoot = resolve(validationRoot, "logs");
  const responsesRoot = resolve(validationRoot, "responses");
  await mkdir(logsRoot, { recursive: true });
  await mkdir(responsesRoot, { recursive: true });

  const env = createValidationEnv({
    baseEnv: input.env ?? process.env,
    level,
    operatorConsolePort,
    publicApiPort,
    validationRoot,
    worktreeId,
  });

  const children = [];
  const checks = [];
  try {
    children.push(
      startProcess("public-api", ["--filter", "@gana-v8/public-api", "serve"], {
        env,
        logsRoot,
        repoRoot,
      }),
    );
    await waitForHealthyUrl(`http://127.0.0.1:${publicApiPort}/health`, children[0]);
    children.push(
      startProcess("operator-console", ["--filter", "@gana-v8/operator-console", "serve:web"], {
        env,
        logsRoot,
        repoRoot,
      }),
    );
    await waitForHealthyUrl(`http://127.0.0.1:${operatorConsolePort}/api/console`, children[1]);

    for (const check of publicApiChecks) {
      checks.push(
        await runHttpCheck({
          ...check,
          baseUrl: `http://127.0.0.1:${publicApiPort}`,
          responsesRoot,
        }),
      );
    }
    for (const check of operatorConsoleChecks) {
      checks.push(
        await runHttpCheck({
          ...check,
          baseUrl: `http://127.0.0.1:${operatorConsolePort}`,
          responsesRoot,
        }),
      );
    }

    const failed = checks.filter((check) => check.status !== "passed");
    const summary = {
      artifactRoot,
      checks,
      failed: failed.length,
      finishedAt: new Date().toISOString(),
      level,
      operatorConsoleUrl: `http://127.0.0.1:${operatorConsolePort}`,
      publicApiUrl: `http://127.0.0.1:${publicApiPort}`,
      runId,
      validationRoot,
      worktreeId,
    };
    await writeFile(resolve(validationRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    if (failed.length > 0) {
      throw new Error(`workspace-dev validation failed: ${failed.map((check) => check.id).join(", ")}`);
    }
    console.log(`workspace-dev validation passed: ${validationRoot}`);
    return summary;
  } finally {
    await stopChildren(children);
  }
};

const createValidationEnv = ({ baseEnv, level, operatorConsolePort, publicApiPort, validationRoot, worktreeId }) => {
  const env = { ...baseEnv };
  if (level === "smoke" && env.GANA_WORKSPACE_DEV_DATABASE_ISOLATED !== "true") {
    env.DATABASE_URL = "";
    env.GANA_DATABASE_URL = "";
    env.DATABASE_ADMIN_URL = "";
  }
  env.GANA_WORKSPACE_DEV_ID = worktreeId;
  env.GANA_WORKSPACE_DEV_VALIDATION_ROOT = validationRoot;
  env.GANA_PUBLIC_API_HOST = "127.0.0.1";
  env.GANA_PUBLIC_API_PORT = String(publicApiPort);
  env.GANA_OPERATOR_CONSOLE_HOST = "127.0.0.1";
  env.GANA_OPERATOR_CONSOLE_PORT = String(operatorConsolePort);
  env.GANA_OPERATOR_CONSOLE_PUBLIC_API_URL = `http://127.0.0.1:${publicApiPort}`;
  env.GANA_SANDBOX_CERT_ARTIFACTS_ROOT =
    env.GANA_SANDBOX_CERT_ARTIFACTS_ROOT ?? resolve(validationRoot, "sandbox-certification");
  return env;
};

const startProcess = (label, args, { env, logsRoot, repoRoot }) => {
  const stdout = createWriteStream(resolve(logsRoot, `${label}.stdout.log`), { flags: "a" });
  const stderr = createWriteStream(resolve(logsRoot, `${label}.stderr.log`), { flags: "a" });
  const child = spawn(pnpmBin, args, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => stdout.write(chunk));
  child.stderr.on("data", (chunk) => stderr.write(chunk));
  child.once("exit", (code, signal) => {
    stdout.write(`\n[workspace-dev] exited code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    stderr.write(`\n[workspace-dev] exited code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    stdout.end();
    stderr.end();
  });
  return { child, label };
};

const waitForHealthyUrl = async (url, processRef) => {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (processRef.child.exitCode !== null) {
      throw new Error(`${processRef.label} exited before ${url} became available`);
    }
    try {
      const response = await fetch(url, { headers: { connection: "close" } });
      if (response.ok) {
        await response.arrayBuffer();
        return;
      }
      await response.arrayBuffer();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, pollIntervalMs));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
};

const runHttpCheck = async ({ baseUrl, id, includes, path, responsesRoot, type }) => {
  const url = `${baseUrl}${path}`;
  const startedAt = new Date().toISOString();
  const response = await fetch(url, { headers: { connection: "close" } });
  const bodyText = await response.text();
  const extension = type === "json" ? "json" : type === "html" ? "html" : "txt";
  await writeFile(resolve(responsesRoot, `${id}.${extension}`), bodyText, "utf8");
  const result = {
    id,
    path,
    status: response.ok ? "passed" : "failed",
    statusCode: response.status,
    type,
    url,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  if (!response.ok) {
    return { ...result, detail: `HTTP ${response.status}` };
  }
  if (type === "json") {
    try {
      JSON.parse(bodyText);
    } catch (error) {
      return {
        ...result,
        detail: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        status: "failed",
      };
    }
  }
  if (includes && !bodyText.includes(includes)) {
    return { ...result, detail: `Response did not include ${includes}`, status: "failed" };
  }
  return result;
};

const stopChildren = async (children) => {
  for (const { child } of children) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, stopDeadlineMs));
  for (const { child } of children) {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }
};

const parseCliArgs = (args) => {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? (args[index + 1]?.startsWith("--") ? undefined : args[index + 1]);
    if (inlineValue === undefined && value !== undefined) {
      index += 1;
    }
    options[key.replace(/-([a-z])/gu, (_, char) => char.toUpperCase())] = value ?? "true";
  }
  return options;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseCliArgs(process.argv.slice(2));
  await runWorkspaceDevValidation({
    artifactRoot: options.artifactRoot,
    basePort: options.basePort ? Number(options.basePort) : undefined,
    level: options.level,
    operatorConsolePort: options.operatorConsolePort ? Number(options.operatorConsolePort) : undefined,
    publicApiPort: options.publicApiPort ? Number(options.publicApiPort) : undefined,
    repoRoot: defaultRepoRoot,
    worktreeId: options.worktreeId,
  });
  process.exit(0);
}
