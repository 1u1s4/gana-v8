import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const goldensRoot = resolve(rootDir, "fixtures/replays/goldens");
const artifactsRoot = resolve(rootDir, ".artifacts/sandbox-certification");
const historyRoot = resolve(artifactsRoot, "_history");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const includeRuntimeRelease = /^(1|true|yes)$/i.test(
  process.env.SANDBOX_CERT_INCLUDE_RUNTIME_RELEASE ?? "",
);

const isRuntimeReleasePrereqError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("database schema is not ready") ||
    normalized.includes("does not exist in the current database") ||
    normalized.includes("the table") ||
    normalized.includes("the column")
  );
};

const listJsonFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolutePath);
    }
  }

  return files;
};

await mkdir(artifactsRoot, { recursive: true });

execFileSync(pnpmBin, ["--filter", "@gana-v8/sandbox-runner", "build"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
});

const sandboxRunnerModule = await import(
  pathToFileURL(resolve(rootDir, "apps/sandbox-runner/dist/index.js")).href
);

const goldenPaths = (await listJsonFiles(goldensRoot)).sort();
if (goldenPaths.length === 0) {
  throw new Error(`No sandbox goldens found under ${goldensRoot}`);
}

const gitSha =
  process.env.SANDBOX_CERT_GIT_SHA ??
  process.env.GITHUB_SHA ??
  "local-cert-sha";
const databaseUrl = process.env.DATABASE_URL;
const certificationNow = process.env.SANDBOX_CERT_NOW
  ? new Date(process.env.SANDBOX_CERT_NOW)
  : undefined;
let runtimeReleaseSkipped = false;
const persistenceSession = databaseUrl
  ? await sandboxRunnerModule.openSandboxCertificationPersistenceSession(
      databaseUrl,
    )
  : null;

const failures = [];

try {
  for (const goldenPath of goldenPaths) {
    const golden = JSON.parse(await readFile(goldenPath, "utf8"));
    if (golden.schemaVersion !== "sandbox-golden-v1") {
      throw new Error(`Unsupported sandbox golden schema in ${goldenPath}`);
    }

    const artifactPath = resolve(
      artifactsRoot,
      golden.profileName,
      `${golden.fixturePackId}.evidence.json`,
    );
    await mkdir(dirname(artifactPath), { recursive: true });

    const result = await sandboxRunnerModule.certifySandboxRun({
      mode: golden.mode,
      profileName: golden.profileName,
      packId: golden.fixturePackId,
      gitSha,
      ...(certificationNow ? { now: certificationNow } : {}),
      goldenPath,
      artifactPath,
      historyRoot,
      ...(persistenceSession?.sandboxCertificationRuns
        ? {
            sandboxCertificationRuns:
              persistenceSession.sandboxCertificationRuns,
          }
        : {}),
      ...(persistenceSession?.telemetrySink
        ? { telemetrySink: persistenceSession.telemetrySink }
        : {}),
    });

    const goldenLabel = relative(rootDir, goldenPath);
    console.log(
      `[sandbox-certification] ${result.status.toUpperCase()} ${goldenLabel} (${result.diff.entryCount} diff entr${result.diff.entryCount === 1 ? "y" : "ies"})`,
    );
    if (result.historyArtifactPath) {
      console.log(
        `  history: ${relative(rootDir, result.historyArtifactPath)}`,
      );
    }
    if (result.persistedRun?.id) {
      console.log(`  persisted-run: ${result.persistedRun.id}`);
    }

    if (result.status === "failed") {
      for (const entry of result.diff.entries.slice(0, 10)) {
        console.log(
          `  - ${entry.kind.toUpperCase()} ${entry.path}: expected=${JSON.stringify(entry.expected)} actual=${JSON.stringify(entry.actual)}`,
        );
      }
      failures.push(goldenLabel);
    }
  }

  if (databaseUrl && includeRuntimeRelease) {
    try {
      const runtimeReleaseDefaults =
        sandboxRunnerModule.resolveRuntimeReleaseEvidenceDefaults({
          cwd: rootDir,
          env: process.env,
        });
      const runtimeReleaseArtifactPath = resolve(
        artifactsRoot,
        "runtime-release",
        "latest.json",
      );
      const runtimeRelease =
        await sandboxRunnerModule.runRuntimeReleaseCertification({
          databaseUrl,
          gitSha: runtimeReleaseDefaults.gitSha,
          evidenceProfile: runtimeReleaseDefaults.evidenceProfile,
          ...(runtimeReleaseDefaults.now
            ? { now: runtimeReleaseDefaults.now }
            : {}),
          lookbackHours: runtimeReleaseDefaults.lookbackHours,
          artifactPath: runtimeReleaseArtifactPath,
          historyRoot,
          baselineRef: runtimeReleaseDefaults.baselineRef,
          candidateRef: runtimeReleaseDefaults.candidateRef,
          ...(persistenceSession?.sandboxCertificationRuns
            ? {
                sandboxCertificationRuns:
                  persistenceSession.sandboxCertificationRuns,
              }
            : {}),
          ...(persistenceSession?.telemetrySink
            ? { telemetrySink: persistenceSession.telemetrySink }
            : {}),
        });

      console.log(
        `[sandbox-runtime-release] ${runtimeRelease.status.toUpperCase()} profile=${runtimeReleaseDefaults.evidenceProfile} promotion=${runtimeRelease.evidence.promotion.status} diff=${runtimeRelease.evidence.diffEntries.length}`,
      );
      if (runtimeRelease.historyArtifactPath) {
        console.log(
          `  history: ${relative(rootDir, runtimeRelease.historyArtifactPath)}`,
        );
      }
      if (runtimeRelease.persistedRun?.id) {
        console.log(`  persisted-run: ${runtimeRelease.persistedRun.id}`);
      }

      if (runtimeRelease.status === "failed") {
        failures.push("runtime-release");
      }
    } catch (error) {
      if (!isRuntimeReleasePrereqError(error)) {
        throw error;
      }

      runtimeReleaseSkipped = true;
      console.warn(
        `[sandbox-runtime-release] SKIPPED ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Sandbox certification failed for ${failures.length} golden pack(s): ${failures.join(", ")}`,
    );
  }

  console.log(
    `[sandbox-certification] Passed ${goldenPaths.length} golden certification run(s).` +
      (includeRuntimeRelease
        ? runtimeReleaseSkipped
          ? " Runtime release skipped because the database schema is not ready."
          : ""
        : " Runtime release is handled separately by the dedicated runtime-release flow."),
  );
} finally {
  if (persistenceSession) {
    await persistenceSession.close();
  }
}
