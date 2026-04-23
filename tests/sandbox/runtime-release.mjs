import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const artifactsRoot = resolve(rootDir, ".artifacts/sandbox-certification");
const historyRoot = resolve(artifactsRoot, "_history");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const loadDotEnv = async () => {
  try {
    const envFile = await readFile(resolve(rootDir, ".env"), "utf8");
    for (const line of envFile.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
};

await loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Runtime release certification requires DATABASE_URL.");
}

await mkdir(artifactsRoot, { recursive: true });

execFileSync(
  pnpmBin,
  ["--filter", "@gana-v8/sandbox-runner", "build"],
  {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  },
);

const sandboxRunnerModule = await import(
  pathToFileURL(resolve(rootDir, "apps/sandbox-runner/dist/index.js")).href
);

const gitSha = process.env.SANDBOX_CERT_GIT_SHA ?? process.env.GITHUB_SHA ?? "local-runtime-release";
const certificationNow = process.env.SANDBOX_CERT_NOW
  ? new Date(process.env.SANDBOX_CERT_NOW)
  : undefined;
const lookbackHours = process.env.SANDBOX_CERT_LOOKBACK_HOURS
  ? Number(process.env.SANDBOX_CERT_LOOKBACK_HOURS)
  : undefined;
const artifactPath = resolve(artifactsRoot, "runtime-release", "latest.json");
await mkdir(dirname(artifactPath), { recursive: true });

const persistenceSession = await sandboxRunnerModule.openSandboxCertificationPersistenceSession(databaseUrl);

try {
  const runtimeRelease = await sandboxRunnerModule.runRuntimeReleaseCertification({
    databaseUrl,
    gitSha,
    ...(certificationNow ? { now: certificationNow } : {}),
    ...(Number.isFinite(lookbackHours) ? { lookbackHours } : {}),
    artifactPath,
    historyRoot,
    baselineRef: process.env.SANDBOX_CERT_BASELINE_REF,
    candidateRef: process.env.SANDBOX_CERT_CANDIDATE_REF ?? gitSha,
    ...(persistenceSession?.sandboxCertificationRuns
      ? { sandboxCertificationRuns: persistenceSession.sandboxCertificationRuns }
      : {}),
    ...(persistenceSession?.telemetrySink
      ? { telemetrySink: persistenceSession.telemetrySink }
      : {}),
  });

  console.log(
    `[sandbox-runtime-release] ${runtimeRelease.status.toUpperCase()} promotion=${runtimeRelease.evidence.promotion.status} diff=${runtimeRelease.evidence.diffEntries.length}`,
  );
  if (runtimeRelease.historyArtifactPath) {
    console.log(`  history: ${relative(rootDir, runtimeRelease.historyArtifactPath)}`);
  }
  if (runtimeRelease.persistedRun?.id) {
    console.log(`  persisted-run: ${runtimeRelease.persistedRun.id}`);
  }

  if (runtimeRelease.status === "failed") {
    throw new Error(
      `Runtime release certification failed: promotion=${runtimeRelease.evidence.promotion.status} diff=${runtimeRelease.evidence.diffEntries.length}`,
    );
  }
} finally {
  await persistenceSession.close();
}
