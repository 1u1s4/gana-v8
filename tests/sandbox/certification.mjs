import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createHarnessArtifactSummary,
  createHarnessFailure,
  repoRelativePath,
  writeHarnessArtifactSummary,
} from "../../scripts/harness-artifact-summary.mjs";

const rootDir = process.cwd();
const goldensRoot = resolve(rootDir, "fixtures/replays/goldens");
const artifactsRoot = resolve(rootDir, ".artifacts/sandbox-certification");
const historyRoot = resolve(artifactsRoot, "_history");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const includeRuntimeRelease = /^(1|true|yes)$/i.test(
  process.env.SANDBOX_CERT_INCLUDE_RUNTIME_RELEASE ?? "",
);
const startedAt = new Date().toISOString();

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

    if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "registry.json") {
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

const failureLabels = [];
const summaryChecks = [];
const summaryArtifacts = [];
const summaryFailures = [];

const writeSummary = async (status) =>
  writeHarnessArtifactSummary(
    resolve(artifactsRoot, "summary.json"),
    createHarnessArtifactSummary({
      agentActionable: status !== "passed",
      artifacts: summaryArtifacts,
      checks: summaryChecks,
      command: "pnpm test:sandbox:certification",
      evidenceRoot: repoRelativePath(rootDir, artifactsRoot),
      failures: summaryFailures,
      finishedAt: new Date().toISOString(),
      runbooks: [
        "runbooks/sandbox-certification.md",
        "runbooks/sandbox-certification-drift.md",
        ...(includeRuntimeRelease ? ["runbooks/release-review-promotion.md"] : []),
      ],
      startedAt,
      status,
      summaryKind: "sandbox-certification",
    }),
  );

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
    const artifactRef = repoRelativePath(rootDir, artifactPath);

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
    summaryChecks.push({
      id: `${golden.profileName}/${golden.fixturePackId}`,
      status: result.status === "failed" ? "failed" : "passed",
      artifactPath: artifactRef,
      diffEntryCount: result.diff.entryCount,
      profileName: golden.profileName,
      fixturePackId: golden.fixturePackId,
    });
    summaryArtifacts.push({
      path: artifactRef,
      kind: "sandbox-certification-evidence",
      profileName: golden.profileName,
      fixturePackId: golden.fixturePackId,
    });
    if (result.historyArtifactPath) {
      console.log(
        `  history: ${relative(rootDir, result.historyArtifactPath)}`,
      );
      summaryArtifacts.push({
        path: repoRelativePath(rootDir, result.historyArtifactPath),
        kind: "sandbox-certification-history",
        profileName: golden.profileName,
        fixturePackId: golden.fixturePackId,
      });
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
      summaryFailures.push(
        createHarnessFailure({
          artifactPath: artifactRef,
          category: "golden-drift",
          cause: `Golden drift detected for ${goldenLabel}: ${result.diff.entryCount} diff entr${result.diff.entryCount === 1 ? "y" : "ies"}.`,
          checkId: `${golden.profileName}/${golden.fixturePackId}`,
          expected: "0 diff entries",
          actual: `${result.diff.entryCount} diff entries`,
          reproCommand: `pnpm --filter @gana-v8/sandbox-runner certify -- --mode ${golden.mode} --profile ${golden.profileName} --pack ${golden.fixturePackId} --golden ${goldenLabel} --artifact ${artifactRef}`,
          runbook: "runbooks/sandbox-certification-drift.md",
        }),
      );
      failureLabels.push(goldenLabel);
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
      summaryChecks.push({
        id: "runtime-release",
        status: runtimeRelease.status === "failed" ? "failed" : "passed",
        artifactPath: repoRelativePath(rootDir, runtimeReleaseArtifactPath),
        diffEntryCount: runtimeRelease.evidence.diffEntries.length,
        profileName: runtimeReleaseDefaults.evidenceProfile,
        promotionStatus: runtimeRelease.evidence.promotion.status,
      });
      summaryArtifacts.push({
        path: repoRelativePath(rootDir, runtimeReleaseArtifactPath),
        kind: "runtime-release-evidence",
        profileName: runtimeReleaseDefaults.evidenceProfile,
      });
      if (runtimeRelease.historyArtifactPath) {
        console.log(
          `  history: ${relative(rootDir, runtimeRelease.historyArtifactPath)}`,
        );
        summaryArtifacts.push({
          path: repoRelativePath(rootDir, runtimeRelease.historyArtifactPath),
          kind: "runtime-release-history",
          profileName: runtimeReleaseDefaults.evidenceProfile,
        });
      }
      if (runtimeRelease.persistedRun?.id) {
        console.log(`  persisted-run: ${runtimeRelease.persistedRun.id}`);
      }

      if (runtimeRelease.status === "failed") {
        summaryFailures.push(
          createHarnessFailure({
            artifactPath: repoRelativePath(rootDir, runtimeReleaseArtifactPath),
            category: "runtime-drift",
            cause: `Runtime release certification failed: promotion=${runtimeRelease.evidence.promotion.status} diff=${runtimeRelease.evidence.diffEntries.length}.`,
            checkId: "runtime-release",
            expected: "promotion not blocked and no blocking runtime diff",
            actual: `promotion=${runtimeRelease.evidence.promotion.status} diff=${runtimeRelease.evidence.diffEntries.length}`,
            ownerType: "human",
            reproCommand: "pnpm test:runtime:release",
            runbook: "runbooks/release-review-promotion.md",
          }),
        );
        failureLabels.push("runtime-release");
      }
    } catch (error) {
      if (!isRuntimeReleasePrereqError(error)) {
        throw error;
      }

      runtimeReleaseSkipped = true;
      summaryChecks.push({
        id: "runtime-release",
        status: "skipped",
        detail: error instanceof Error ? error.message : String(error),
        runbook: "runbooks/expensive-verification-triage.md",
      });
      console.warn(
        `[sandbox-runtime-release] SKIPPED ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failureLabels.length > 0) {
    await writeSummary("failed");
    throw new Error(
      `Sandbox certification failed for ${failureLabels.length} golden pack(s): ${failureLabels.join(", ")}`,
    );
  }

  await writeSummary("passed");
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
