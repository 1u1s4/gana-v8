#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const commands = new Set(["bootstrap", "serve", "validate", "clean", "help"]);
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const stopDeadlineMs = 7_500;

const main = async () => {
  const [rawCommand, ...rawArgs] = process.argv.slice(2);
  const command = rawCommand ?? "help";

  if (!commands.has(command)) {
    await runLegacyWorkspaceCommand(command, rawArgs);
    return;
  }

  const options = parseArgs(rawArgs);
  if (command === "help") {
    printHelp();
    return;
  }

  const context = await createWorkspaceDevContext(options);
  if (command === "bootstrap") {
    await bootstrap(context);
    return;
  }
  if (command === "serve") {
    await serve(context);
    return;
  }
  if (command === "validate") {
    const { runWorkspaceDevValidation } = await import("./workspace-dev-validate.mjs");
    await runWorkspaceDevValidation({
      artifactRoot: context.artifactRoot,
      basePort: context.basePort,
      env: context.childEnv,
      level: readStringOption(options, "level") ?? "smoke",
      operatorConsolePort: context.operatorConsolePort,
      publicApiPort: context.publicApiPort,
      repoRoot,
      worktreeId: context.worktreeId,
    });
    process.exit(0);
    return;
  }

  await clean(context);
};

const parseArgs = (args) => {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      const positional = options.get("_") ?? [];
      positional.push(arg);
      options.set("_", positional);
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (!key) {
      continue;
    }
    if (inlineValue !== undefined) {
      options.set(key, inlineValue);
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(key, next);
      index += 1;
    } else {
      options.set(key, true);
    }
  }

  return options;
};

const readStringOption = (options, key) => {
  const value = options.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const readIntegerOption = (options, key) => {
  const value = readStringOption(options, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return parsed;
};

const readBooleanFlag = (options, key) => options.get(key) === true || options.get(key) === "true";

const createWorkspaceDevContext = async (options) => {
  const dotenv = await readDotEnv(resolve(repoRoot, ".env"));
  const inheritedEnv = { ...dotenv, ...process.env };
  const explicitWorktreeId = readStringOption(options, "worktree-id") ?? inheritedEnv.GANA_WORKSPACE_DEV_ID;
  const worktreeId = toSafeSlug(explicitWorktreeId ?? readGitBranch() ?? basename(repoRoot));
  const isolated = Boolean(explicitWorktreeId);
  const basePort = readIntegerOption(options, "base-port") ?? (isolated ? 4100 + stableHash(worktreeId) * 10 : 3100);
  const publicApiPort = readIntegerOption(options, "public-api-port") ?? basePort;
  const operatorConsolePort =
    readIntegerOption(options, "operator-console-port") ?? (isolated ? basePort + 1 : 3200);
  const artifactRoot = resolve(
    repoRoot,
    readStringOption(options, "artifact-root") ?? `.artifacts/workspace-dev/${worktreeId}`,
  );
  const databaseIsolated = inheritedEnv.GANA_WORKSPACE_DEV_DATABASE_ISOLATED === "true";
  const databaseUrl = inheritedEnv.GANA_DATABASE_URL ?? inheritedEnv.DATABASE_URL;
  const sharedDatabase = Boolean(databaseUrl && !databaseIsolated);
  const childEnv = {
    ...inheritedEnv,
    GANA_WORKSPACE_DEV_ID: worktreeId,
    GANA_WORKSPACE_DEV_ARTIFACT_ROOT: artifactRoot,
    GANA_WORKSPACE_DEV_DATABASE_SHARED: sharedDatabase ? "true" : "false",
    GANA_PUBLIC_API_HOST: readStringOption(options, "host") ?? inheritedEnv.GANA_PUBLIC_API_HOST ?? "127.0.0.1",
    GANA_PUBLIC_API_PORT: String(publicApiPort),
    GANA_OPERATOR_CONSOLE_HOST:
      readStringOption(options, "host") ?? inheritedEnv.GANA_OPERATOR_CONSOLE_HOST ?? "127.0.0.1",
    GANA_OPERATOR_CONSOLE_PORT: String(operatorConsolePort),
    GANA_OPERATOR_CONSOLE_PUBLIC_API_URL: `http://127.0.0.1:${publicApiPort}`,
    GANA_SANDBOX_CERT_ARTIFACTS_ROOT:
      inheritedEnv.GANA_SANDBOX_CERT_ARTIFACTS_ROOT ?? resolve(artifactRoot, "sandbox-certification"),
  };

  return {
    artifactRoot,
    basePort,
    childEnv,
    databaseIsolated,
    databaseUrl,
    operatorConsolePort,
    options,
    publicApiPort,
    sharedDatabase,
    worktreeId,
  };
};

const readDotEnv = async (path) => {
  try {
    const content = await readFile(path, "utf8");
    const values = {};
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
    return values;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
};

const readGitBranch = () => {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return undefined;
  }
  const branch = result.stdout.trim();
  return branch && branch !== "HEAD" ? branch : undefined;
};

const toSafeSlug = (value) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  if (!slug) {
    throw new Error(`Unable to derive a safe worktree id from ${JSON.stringify(value)}`);
  }
  return slug;
};

const stableHash = (value) => {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 200;
  }
  return hash;
};

const writeContextArtifacts = async (context) => {
  await mkdir(context.artifactRoot, { recursive: true });
  const envPath = resolve(context.artifactRoot, "env");
  const metadataPath = resolve(context.artifactRoot, "metadata.json");
  const envLines = [
    `GANA_WORKSPACE_DEV_ID=${context.worktreeId}`,
    `GANA_WORKSPACE_DEV_ARTIFACT_ROOT=${context.artifactRoot}`,
    `GANA_WORKSPACE_DEV_DATABASE_SHARED=${context.sharedDatabase ? "true" : "false"}`,
    `GANA_PUBLIC_API_HOST=${context.childEnv.GANA_PUBLIC_API_HOST}`,
    `GANA_PUBLIC_API_PORT=${context.publicApiPort}`,
    `GANA_OPERATOR_CONSOLE_HOST=${context.childEnv.GANA_OPERATOR_CONSOLE_HOST}`,
    `GANA_OPERATOR_CONSOLE_PORT=${context.operatorConsolePort}`,
    `GANA_OPERATOR_CONSOLE_PUBLIC_API_URL=${context.childEnv.GANA_OPERATOR_CONSOLE_PUBLIC_API_URL}`,
    `GANA_SANDBOX_CERT_ARTIFACTS_ROOT=${context.childEnv.GANA_SANDBOX_CERT_ARTIFACTS_ROOT}`,
  ];
  await writeFile(envPath, `${envLines.join("\n")}\n`, "utf8");
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        artifactRoot: context.artifactRoot,
        database: context.databaseUrl
          ? { isolated: context.databaseIsolated, shared: context.sharedDatabase }
          : { configured: false },
        generatedAt: new Date().toISOString(),
        operatorConsoleUrl: `http://127.0.0.1:${context.operatorConsolePort}`,
        publicApiUrl: `http://127.0.0.1:${context.publicApiPort}`,
        worktreeId: context.worktreeId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { envPath, metadataPath };
};

const bootstrap = async (context) => {
  const { envPath, metadataPath } = await writeContextArtifacts(context);
  console.log(`workspace-dev bootstrap ready: ${context.worktreeId}`);
  console.log(`env: ${envPath}`);
  console.log(`metadata: ${metadataPath}`);
  console.log(`public-api: http://127.0.0.1:${context.publicApiPort}`);
  console.log(`operator-console: http://127.0.0.1:${context.operatorConsolePort}`);
  if (context.sharedDatabase) {
    console.warn("DATABASE_URL is configured and treated as shared; use GANA_WORKSPACE_DEV_DATABASE_ISOLATED=true only for an isolated DB.");
  }

  if (readBooleanFlag(context.options, "skip-db")) {
    console.log("db bootstrap skipped by --skip-db");
    return;
  }
  if (!context.databaseUrl) {
    console.log("db bootstrap skipped: DATABASE_URL/GANA_DATABASE_URL is not configured");
    return;
  }

  const dbMode = readStringOption(context.options, "db-mode") ?? "push";
  if (!["push", "migrate"].includes(dbMode)) {
    throw new Error("--db-mode must be push or migrate");
  }
  await runCommand("pnpm", ["db:generate"], context);
  await runCommand("pnpm", [dbMode === "migrate" ? "db:migrate:deploy" : "db:push"], context);
};

const serve = async (context) => {
  await writeContextArtifacts(context);
  await mkdir(resolve(context.artifactRoot, "logs"), { recursive: true });
  const publicApi = startProcess(
    "public-api",
    pnpmBin,
    ["--filter", "@gana-v8/public-api", "serve"],
    context,
  );
  const operatorConsole = startProcess(
    "operator-console",
    pnpmBin,
    ["--filter", "@gana-v8/operator-console", "serve:web"],
    context,
  );
  const children = [publicApi, operatorConsole];
  console.log(`workspace-dev serving ${context.worktreeId}`);
  console.log(`public-api: http://127.0.0.1:${context.publicApiPort}`);
  console.log(`operator-console: http://127.0.0.1:${context.operatorConsolePort}`);
  try {
    await waitForSignal(children);
  } finally {
    await stopChildren(children);
  }
};

const clean = async (context) => {
  await rm(context.artifactRoot, { force: true, recursive: true });
  console.log(`removed ${context.artifactRoot}`);
};

const runCommand = (command, args, context) =>
  new Promise((resolvePromise, reject) => {
    console.log(`$ ${command} ${args.join(" ")}`);
    const child = spawn(command === "pnpm" ? pnpmBin : command, args, {
      cwd: repoRoot,
      env: context.childEnv,
      stdio: "inherit",
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
      }
    });
  });

const startProcess = (label, command, args, context) => {
  const logPath = resolve(context.artifactRoot, "logs", `${label}.log`);
  const logStream = createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: context.childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const writeLine = (stream, chunk) => {
    const text = chunk.toString();
    process[stream].write(`[${label}] ${text}`);
    logStream.write(text);
  };
  child.stdout.on("data", (chunk) => writeLine("stdout", chunk));
  child.stderr.on("data", (chunk) => writeLine("stderr", chunk));
  child.once("exit", (code, signal) => {
    logStream.write(`\n[workspace-dev] exited code=${code ?? "null"} signal=${signal ?? "null"}\n`);
    logStream.end();
  });
  return child;
};

const waitForSignal = async (children) => {
  process.once("SIGINT", () => {
    void stopChildren(children).then(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    void stopChildren(children).then(() => process.exit(143));
  });
  await Promise.race(
    children.map(
      (child) =>
        new Promise((resolvePromise, reject) => {
          child.once("exit", (code, signal) => {
            if (code === 0) {
              resolvePromise();
            } else {
              reject(new Error(`service exited early with ${signal ?? code}`));
            }
          });
        }),
    ),
  );
};

const stopChildren = async (children) => {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, stopDeadlineMs));
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }
};

const runLegacyWorkspaceCommand = async (workspaceName, args) => {
  if (workspaceName === "public-api") {
    const context = await createWorkspaceDevContext(parseArgs(args));
    await writeContextArtifacts(context);
    await runCommand("pnpm", ["--filter", "@gana-v8/public-api", "serve"], context);
    return;
  }
  if (workspaceName === "operator-console") {
    const context = await createWorkspaceDevContext(parseArgs(args));
    await writeContextArtifacts(context);
    await runCommand("pnpm", ["--filter", "@gana-v8/operator-console", "serve:web"], context);
    return;
  }
  console.log(`${workspaceName}: no dedicated dev server; use pnpm harness:serve for the live harness.`);
};

const printHelp = () => {
  console.log(`Usage:
  node scripts/workspace-dev.mjs bootstrap --worktree-id <slug> [--db-mode push|migrate] [--base-port <n>] [--skip-db]
  node scripts/workspace-dev.mjs serve --worktree-id <slug> [--base-port <n>]
  node scripts/workspace-dev.mjs validate --worktree-id <slug> [--level smoke|live|release] [--base-port <n>]
  node scripts/workspace-dev.mjs clean --worktree-id <slug>
`);
};

await main();
