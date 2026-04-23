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
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
};

await loadDotEnv();

process.env.GANA_RUNTIME_PROFILE ??= "ci-smoke";
process.env.SANDBOX_CERT_EVIDENCE_PROFILE ??= "ci-ephemeral";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Runtime release certification requires DATABASE_URL.");
}

await mkdir(artifactsRoot, { recursive: true });

execFileSync(pnpmBin, ["--filter", "@gana-v8/sandbox-runner", "build"], {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit",
});

const sandboxRunnerModule = await import(
  pathToFileURL(resolve(rootDir, "apps/sandbox-runner/dist/index.js")).href
);

const runtimeReleaseDefaults =
  sandboxRunnerModule.resolveRuntimeReleaseEvidenceDefaults({
    cwd: rootDir,
    env: process.env,
  });
const artifactPath = resolve(artifactsRoot, "runtime-release", "latest.json");
await mkdir(dirname(artifactPath), { recursive: true });

const seedRuntimeReleaseEvidence = async (client, defaults) => {
  const timestamp = (defaults.now ?? new Date()).toISOString();
  const prefix = `runtime-release-certification:${process.pid}:${Date.now()}`;
  const taskId = `${prefix}:task`;
  const traceId = `${prefix}:trace`;
  const cycleInputs = ["scheduler", "dispatcher", "recovery"].map((kind) => ({
    id: `${prefix}:cycle:${kind}`,
    kind,
    status: "succeeded",
    leaseOwner: `${prefix}:lease-owner`,
    summary: {
      source: "runtime-release-certification-seed",
      taskIds: kind === "dispatcher" ? [taskId] : [],
      fixtureIds: [],
      stages: [],
    },
    metadata: {
      seed: true,
      evidenceProfile: defaults.evidenceProfile,
    },
    startedAt: new Date(timestamp),
    finishedAt: new Date(timestamp),
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
  }));

  const cleanup = async () => {
    await client.taskRun.deleteMany({ where: { taskId: { startsWith: prefix } } });
    await client.task.deleteMany({ where: { id: { startsWith: prefix } } });
    await client.auditEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await client.automationCycle.deleteMany({ where: { id: { startsWith: prefix } } });
  };

  await cleanup();
  await client.automationCycle.createMany({ data: cycleInputs });
  await client.task.create({
    data: {
      id: taskId,
      kind: "research",
      status: "succeeded",
      triggerKind: "system",
      priority: 1,
      manifestId: `${prefix}:manifest`,
      workflowId: `${prefix}:workflow`,
      traceId,
      correlationId: prefix,
      source: "runtime-release-certification-seed",
      payload: {
        traceId,
        correlationId: prefix,
        seed: true,
      },
      scheduledFor: new Date(timestamp),
      createdAt: new Date(timestamp),
      updatedAt: new Date(timestamp),
    },
  });
  await client.taskRun.create({
    data: {
      id: `${prefix}:task-run`,
      taskId,
      attemptNumber: 1,
      status: "succeeded",
      workerName: "runtime-release-certification-seed",
      startedAt: new Date(timestamp),
      finishedAt: new Date(timestamp),
      result: { seed: true },
      createdAt: new Date(timestamp),
      updatedAt: new Date(timestamp),
    },
  });
  await client.auditEvent.create({
    data: {
      id: `${prefix}:audit`,
      aggregateType: "runtime-release",
      aggregateId: prefix,
      eventType: "runtime-release-certification-seed",
      actor: "runtime-release-certification",
      actorType: "system",
      subjectType: "task",
      subjectId: taskId,
      action: "seed-evidence",
      traceId,
      correlationId: prefix,
      lineageRefs: { taskId },
      payload: { seed: true, evidenceProfile: defaults.evidenceProfile },
      occurredAt: new Date(timestamp),
      createdAt: new Date(timestamp),
      updatedAt: new Date(timestamp),
    },
  });

  return cleanup;
};

const persistenceSession =
  await sandboxRunnerModule.openSandboxCertificationPersistenceSession(
    databaseUrl,
  );
const cleanupRuntimeReleaseEvidence = await seedRuntimeReleaseEvidence(
  persistenceSession.client,
  runtimeReleaseDefaults,
);

try {
  const runtimeRelease =
    await sandboxRunnerModule.runRuntimeReleaseCertification({
      databaseUrl,
      gitSha: runtimeReleaseDefaults.gitSha,
      evidenceProfile: runtimeReleaseDefaults.evidenceProfile,
      ...(runtimeReleaseDefaults.now
        ? { now: runtimeReleaseDefaults.now }
        : {}),
      lookbackHours: runtimeReleaseDefaults.lookbackHours,
      artifactPath,
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
      ...(persistenceSession?.runtimeReleaseSnapshots
        ? { runtimeReleaseSnapshots: persistenceSession.runtimeReleaseSnapshots }
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
    throw new Error(
      `Runtime release certification failed: promotion=${runtimeRelease.evidence.promotion.status} diff=${runtimeRelease.evidence.diffEntries.length}`,
    );
  }
} finally {
  await cleanupRuntimeReleaseEvidence();
  await persistenceSession.close();
}
