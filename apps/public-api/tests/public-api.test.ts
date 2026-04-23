import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAuditEvent,
  createFixtureWorkflow,
  createAiRun,
  createFeatureSnapshot,
  createDailyAutomationPolicy,
  createFixture,
  createLeagueCoveragePolicy,
  createParlay,
  createPrediction,
  createResearchBundle,
  createTask,
  createTaskRun,
  createTeamCoveragePolicy,
  createValidation,
} from "@gana-v8/domain-core";
import { createInMemoryTaskQueueAdapter } from "@gana-v8/queue-adapters";
import { createInMemoryUnitOfWork, createPrismaClient, createPrismaUnitOfWork } from "@gana-v8/storage-adapters";

import {
  applyFixtureManualSelection,
  applyFixtureSelectionOverride,
  createPublicApiTokenAuthentication,
  createOperationSnapshot,
  createPublicApiHandlers,
  createPublicApiServer,
  createOperationalSummary,
  createTaskLogEntries,
  findAiRunById,
  findProviderStateByProvider,
  findTaskById,
  findTaskRunById,
  findParlayById,
  findPredictionById,
  findValidationById,
  getHealth,
  getValidationSummary,
  listFixtures,
  listOperationalLogs,
  listParlays,
  listPredictions,
  listTaskRuns,
  listTaskRunsByTaskId,
  listTasks,
  listValidations,
  loadOperationSnapshotFromDatabase,
  loadOperationSnapshotFromUnitOfWork,
  loadSandboxCertificationReadModels,
  publicApiEndpointPaths,
  routePublicApiRequest,
} from "../src/index.js";
import {
  createDemoAiRuns,
  createDemoOperationSnapshot,
  createDemoProviderStates,
} from "./demo-fixtures.js";

const createSandboxCertificationFixture = async (input: {
  readonly status?: "passed" | "failed" | "missing";
} = {}): Promise<{
  readonly goldensRoot: string;
  readonly artifactsRoot: string;
}> => {
  const root = await mkdtemp(join(tmpdir(), "gana-v8-public-api-cert-"));
  const goldensRoot = join(root, "goldens");
  const artifactsRoot = join(root, "artifacts");
  await mkdir(join(goldensRoot, "ci-smoke"), { recursive: true });
  await mkdir(join(artifactsRoot, "ci-smoke"), { recursive: true });

  const goldenSnapshot = {
    schemaVersion: "sandbox-golden-v1",
    mode: "smoke",
    fixturePackId: "football-dual-smoke",
    profileName: "ci-smoke",
    assertions: ["namespace-isolation", "smoke-health"],
    providerModes: {
      fixtures_api: "replay",
      odds_api: "replay",
    },
    stats: {
      fixtureCount: 2,
      completedFixtures: 1,
      replayEventCount: 4,
      replayChannels: ["fixtures", "odds"],
      cronJobsValidated: 1,
    },
    clock: {
      mode: "virtual",
      startAt: "2026-08-16T18:00:00.000Z",
      endAt: "2026-08-16T18:13:00.000Z",
      tickCount: 4,
    },
    replayTimeline: [
      {
        id: "evt-1",
        fixtureId: "fx-1",
        channel: "fixtures",
        offsetMinutes: 0,
        scheduledAt: "2026-08-16T18:00:00.000Z",
      },
    ],
    golden: {
      packId: "football-dual-smoke",
      version: "2026.08.16",
      fingerprint: "golden-fingerprint-1",
    },
    comparison: {
      baselinePackId: "football-dual-smoke",
      candidatePackId: "football-dual-smoke",
      changed: false,
      fixtureDelta: 0,
      replayEventDelta: 0,
      changedFixtureIds: [],
    },
    safety: {
      publishEnabled: false,
      allowedHosts: ["sandbox-ci.local"],
      cronDryRunOnly: true,
    },
    policy: {
      sideEffects: ["sandbox-object-storage-write", "sandbox-queue-write"],
      secretsPolicy: {
        mode: "allow-sandbox-secrets",
        allowedSecretRefs: ["sandbox/ci-smoke/provider-token"],
        allowProductionCredentials: false,
      },
      capabilityAllowlist: ["fixtures.read", "odds.read", "cron.validate"],
      memoryIsolation: {
        strategy: "profile-run-namespace",
        namespaceRoot: "sandbox-memory://ci-smoke",
        allowProductionMemory: false,
      },
      sessionIsolation: {
        strategy: "profile-run-namespace",
        namespaceRoot: "sandbox-session://ci-smoke",
        allowSharedSessions: false,
      },
      skillPolicy: {
        mode: "allowlist",
        defaultDeny: true,
        enabledSkills: ["ops-audit"],
      },
      requiresManualQa: false,
      defaultDeny: true,
    },
    promotion: {
      status: "promotable",
      summary: "Sandbox promotion evidence is promotable.",
      gates: [
        { name: "sandbox-certification", status: "pass", detail: "Certification evidence matches the tracked golden snapshot." },
        { name: "contract-coverage", status: "pass", detail: "Contract coverage assertions are included." },
        { name: "cron-workflows", status: "pass", detail: "Cron workflows are dry-run only." },
        { name: "publication-safety", status: "pass", detail: "Publication side effects remain disabled." },
        { name: "capability-isolation", status: "pass", detail: "Default deny is active." },
        { name: "manual-qa", status: "pass", detail: "No manual QA review is required." },
      ],
    },
  };

  await writeFile(
    join(goldensRoot, "ci-smoke", "football-dual-smoke.json"),
    `${JSON.stringify(goldenSnapshot, null, 2)}\n`,
    "utf8",
  );

  if (input.status !== "missing") {
    const evidenceSnapshot =
      input.status === "failed"
        ? {
            ...goldenSnapshot,
            stats: {
              ...goldenSnapshot.stats,
              replayEventCount: 99,
            },
          }
        : goldenSnapshot;
    await writeFile(
      join(artifactsRoot, "ci-smoke", "football-dual-smoke.evidence.json"),
      `${JSON.stringify(
        {
          schemaVersion: "sandbox-certification-v1",
          generatedAt: "2026-08-16T20:30:00.000Z",
          summary: {
            fixturePackId: "football-dual-smoke",
            promotion: goldenSnapshot.promotion,
            policy: goldenSnapshot.policy,
          },
          goldenSnapshot: evidenceSnapshot,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return { goldensRoot, artifactsRoot };
};

const createPersistedSandboxCertificationRuns = () => [
  {
    id: "scr-synthetic-1",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    verificationKind: "synthetic-integrity" as const,
    status: "passed" as const,
    gitSha: "abc123synthetic",
    goldenFingerprint: "golden-fingerprint-1",
    evidenceFingerprint: "evidence-fingerprint-1",
    artifactRef: "memory://certification/synthetic-1.json",
    runtimeSignals: {},
    diffEntryCount: 0,
    diffEntries: [],
    summary: { syntheticIntegrity: "passed" },
    generatedAt: "2026-08-16T20:30:00.000Z",
  },
  {
    id: "scr-runtime-1",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    verificationKind: "runtime-release" as const,
    status: "failed" as const,
    promotionStatus: "blocked" as const,
    gitSha: "def456runtime",
    baselineRef: "release/2026.08.15",
    candidateRef: "release/2026.08.16",
    artifactRef: "memory://certification/runtime-1.json",
    runtimeSignals: {
      latestRuntimeRelease: "release-2026.08.16",
      workerHealth: "degraded",
    },
    diffEntryCount: 1,
    diffEntries: [
      {
        path: "$.runtime.signals.workerHealth",
        kind: "changed" as const,
        expected: "ok",
        actual: "degraded",
      },
    ],
    summary: { releaseDecision: "blocked" },
    generatedAt: "2026-08-16T21:10:00.000Z",
  },
] as const;

const createReleaseOpsSnapshot = () =>
  createOperationSnapshot({
    generatedAt: "2026-08-16T21:15:00.000Z",
    fixtures: [
      createFixture({
        id: "fx-release-ops-1",
        sport: "football",
        competition: "Liga Nacional",
        homeTeam: "Comunicaciones",
        awayTeam: "Municipal",
        scheduledAt: "2026-08-16T22:00:00.000Z",
        status: "scheduled",
        metadata: {},
      }),
    ],
    tasks: [
      createTask({
        id: "task-release-ops-1",
        kind: "prediction",
        status: "quarantined",
        priority: 90,
        payload: {
          fixtureId: "fx-release-ops-1",
          workflowId: "wf-release-ops-1",
          traceId: "trace-release-ops-1",
          correlationId: "corr-release-ops-1",
        },
        attempts: [
          { startedAt: "2026-08-16T20:45:00.000Z", finishedAt: "2026-08-16T20:55:00.000Z", error: "Recovered expired lease after 3 attempts; manual review required." },
          { startedAt: "2026-08-16T20:56:00.000Z", finishedAt: "2026-08-16T21:05:00.000Z", error: "Recovered expired lease after 3 attempts; manual review required." },
          { startedAt: "2026-08-16T21:06:00.000Z", finishedAt: "2026-08-16T21:10:00.000Z", error: "Recovered expired lease after 3 attempts; manual review required." },
        ],
        maxAttempts: 3,
        lastErrorMessage: "Recovered expired lease after 3 attempts; manual review required.",
        createdAt: "2026-08-16T20:45:00.000Z",
        updatedAt: "2026-08-16T21:10:00.000Z",
      }),
    ],
    taskRuns: [
      createTaskRun({
        id: "trn-release-ops-1",
        taskId: "task-release-ops-1",
        attemptNumber: 3,
        status: "failed",
        startedAt: "2026-08-16T21:06:00.000Z",
        finishedAt: "2026-08-16T21:10:00.000Z",
        error: "Recovered expired lease after 3 attempts; manual review required.",
      }),
    ],
    automationCycles: [
      {
        id: "cycle-recovery-1",
        leaseOwner: "recovery-worker-1",
        source: "hermes-recovery",
        status: "succeeded",
        startedAt: "2026-08-16T21:08:00.000Z",
        completedAt: "2026-08-16T21:12:00.000Z",
        fixtureIds: ["fx-release-ops-1"],
        taskIds: ["task-release-ops-1"],
        stages: [],
        summary: {
          researchTaskCount: 0,
          predictionTaskCount: 1,
          parlayCount: 0,
          validationTaskCount: 0,
          expiredLeaseCount: 1,
          recoveredLeaseCount: 1,
          renewedLeaseCount: 1,
          redrivenTaskCount: 0,
          quarantinedTaskCount: 1,
          manualReviewTaskCount: 1,
        },
        metadata: {
          quarantinedTaskIds: ["task-release-ops-1"],
          manualReviewTaskIds: ["task-release-ops-1"],
          recoveryActions: [
            {
              action: "quarantine-expired-lease",
              taskId: "task-release-ops-1",
              taskRunId: "trn-release-ops-1",
              reason: "Recovered expired lease after 3 attempts; manual review required.",
            },
          ],
        },
      },
    ],
    telemetryEvents: [
      {
        id: "tel-event-1",
        kind: "log",
        name: "release.ops.quarantine",
        severity: "warn",
        source: "hermes-recovery",
        occurredAt: "2026-08-16T21:10:00.000Z",
        taskId: "task-release-ops-1",
        taskRunId: "trn-release-ops-1",
        automationCycleId: "cycle-recovery-1",
        message: "Task moved to quarantine for manual review.",
        attributes: { queue: "prediction" },
      },
    ],
    telemetryMetrics: [
      {
        id: "metric-sample-1",
        name: "release_ops.quarantined_tasks",
        type: "gauge",
        value: 1,
        labels: { queue: "prediction" },
        source: "hermes-recovery",
        taskId: "task-release-ops-1",
        automationCycleId: "cycle-recovery-1",
        recordedAt: "2026-08-16T21:12:00.000Z",
      },
    ],
  });

const createFixtureResearchReadModel = (fixtureId: string) => ({
  fixtureId,
  status: "publishable" as const,
  publishable: true,
  gateReasons: [],
  latestBundle: {
    id: `bundle:${fixtureId}`,
    generatedAt: "2026-04-15T15:20:00.000Z",
    summary: "Research bundle ready",
    recommendedLean: "home",
  },
  latestSnapshot: {
    bundleId: `bundle:${fixtureId}`,
    generatedAt: "2026-04-15T15:20:00.000Z",
    bundleStatus: "publishable" as const,
    gateReasons: [],
    recommendedLean: "home",
    evidenceCount: 1,
    topEvidenceTitles: ["Confirmed availability edge"],
    risks: [],
    featureReadinessStatus: "ready",
    featureReadinessReasons: [],
    researchTrace: {
      synthesisMode: "deterministic" as const,
    },
  },
  researchTrace: {
    synthesisMode: "deterministic" as const,
  },
});

const seedPublishableResearch = async (
  unitOfWork: ReturnType<typeof createInMemoryUnitOfWork>,
  fixtureId: string,
  generatedAt = "2026-04-15T15:20:00.000Z",
): Promise<void> => {
  const bundleId = `bundle:${fixtureId}:${generatedAt}`;
  await unitOfWork.researchBundles.save(
    createResearchBundle({
      id: bundleId,
      fixtureId,
      generatedAt,
      brief: {
        headline: `Research brief for ${fixtureId}`,
        context: "Public API test bundle",
        questions: ["Who has the edge?"],
        assumptions: ["Use persisted research."],
      },
      summary: "Research bundle ready",
      recommendedLean: "home",
      directionalScore: { home: 0.71, draw: 0.18, away: 0.22 },
      risks: [],
      gateResult: {
        status: "publishable",
        reasons: [],
        gatedAt: generatedAt,
      },
      trace: {
        synthesisMode: "deterministic",
      },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }),
  );
  await unitOfWork.featureSnapshots.save(
    createFeatureSnapshot({
      id: `feature:${fixtureId}:${generatedAt}`,
      fixtureId,
      bundleId,
      generatedAt,
      bundleStatus: "publishable",
      gateReasons: [],
      recommendedLean: "home",
      evidenceCount: 1,
      topEvidence: [
        {
          id: `research:${fixtureId}`,
          title: "Confirmed availability edge",
          direction: "home",
          weightedScore: 0.88,
        },
      ],
      risks: [],
      features: {
        researchScoreHome: 0.71,
        researchScoreDraw: 0.18,
        researchScoreAway: 0.22,
        formHome: 0.6,
        formAway: 0.4,
        restHomeDays: 5,
        restAwayDays: 4,
        injuriesHome: 0,
        injuriesAway: 1,
        derby: 0,
        hoursUntilKickoff: 3,
      },
      readiness: {
        status: "ready",
        reasons: [],
      },
      researchTrace: {
        synthesisMode: "deterministic",
      },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }),
  );
};

test("public api exposes ai runs and provider states", () => {
  const snapshot = createDemoOperationSnapshot();
  const handlers = createPublicApiHandlers(snapshot);

  assert.equal(snapshot.aiRuns.length, 1);
  assert.equal(snapshot.providerStates.length, 1);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.id, snapshot.aiRuns[0]!.id);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedPredictionIds.length, 1);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedParlayIds.length, 1);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedPredictions[0]?.id, snapshot.predictions[0]!.id);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedParlays[0]?.id, snapshot.parlays[0]!.id);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.providerRequestId, "req-demo-scoring");
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.latestPromptVersion, snapshot.aiRuns[0]!.promptVersion);
  assert.equal(
    findProviderStateByProvider(snapshot, snapshot.providerStates[0]!.provider)?.provider,
    snapshot.providerStates[0]!.provider,
  );
  assert.equal(handlers.aiRuns()[0]?.provider, snapshot.aiRuns[0]?.provider);
  assert.equal(handlers.aiRuns()[0]?.providerRequestId, "req-demo-scoring");
  assert.equal(handlers.aiRunById(snapshot.aiRuns[0]!.id)?.linkedPredictionIds[0], snapshot.predictions[0]!.id);
  assert.equal(
    handlers.providerStateByProvider(snapshot.providerStates[0]!.provider)?.provider,
    snapshot.providerStates[0]!.provider,
  );
});

test("public api snapshots are empty by default and do not inject demo records implicitly", () => {
  const snapshot = createOperationSnapshot();
  const handlers = createPublicApiHandlers(snapshot);

  assert.equal(snapshot.fixtures.length, 0);
  assert.equal(snapshot.tasks.length, 0);
  assert.equal(snapshot.aiRuns.length, 0);
  assert.equal(snapshot.predictions.length, 0);
  assert.equal(snapshot.parlays.length, 0);
  assert.equal(snapshot.validations.length, 0);
  assert.equal(handlers.snapshot().fixtures.length, 0);
});

test("public api routes ai runs and provider states", () => {
  const snapshot = createOperationSnapshot({
    aiRuns: createDemoAiRuns(),
    providerStates: createDemoProviderStates(),
  });
  const handlers = createPublicApiHandlers(snapshot);

  assert.equal(routePublicApiRequest(handlers, publicApiEndpointPaths.aiRuns).status, 200);
  assert.equal(routePublicApiRequest(handlers, publicApiEndpointPaths.providerStates).status, 200);
  assert.equal(routePublicApiRequest(handlers, `/ai-runs/${snapshot.aiRuns[0]!.id}`).status, 200);
  assert.equal(
    routePublicApiRequest(handlers, `/provider-states/${encodeURIComponent(snapshot.providerStates[0]!.provider)}`).status,
    200,
  );
});

test("public api loads sandbox certification read models from goldens and evidence packs", async () => {
  const { goldensRoot, artifactsRoot } = await createSandboxCertificationFixture({ status: "failed" });
  const certifications = await loadSandboxCertificationReadModels({
    goldensRoot,
    artifactsRoot,
  });

  assert.equal(certifications.length, 1);
  assert.equal(certifications[0]?.profileName, "ci-smoke");
  assert.equal(certifications[0]?.packId, "football-dual-smoke");
  assert.equal(certifications[0]?.status, "failed");
  assert.ok((certifications[0]?.diffEntryCount ?? 0) > 0);
});

test("public api exposes persisted live ingestion runs reconstructed from task, task-run, and audit events", () => {
  const fixtureTask = createTask({
    id: "task-live-fixtures-1",
    kind: "fixture-ingestion",
    status: "succeeded",
    priority: 80,
    payload: {
      league: "39",
      season: 2025,
      window: {
        start: "2026-04-20T00:00:00.000Z",
        end: "2026-04-21T00:00:00.000Z",
        granularity: "daily",
      },
      metadata: { labels: ["official", "live", "fixtures"], source: "ingestion-worker/live-runner" },
      traceId: "trace-live-fixtures-1",
      workflowId: "wf-live-fixtures-1",
    },
    attempts: [{ startedAt: "2026-04-20T12:00:00.000Z", finishedAt: "2026-04-20T12:01:00.000Z" }],
    scheduledFor: "2026-04-20T12:00:00.000Z",
    createdAt: "2026-04-20T12:00:00.000Z",
    updatedAt: "2026-04-20T12:01:00.000Z",
  });
  const fixtureRun = createTaskRun({
    id: "trn_live_fixture_1",
    taskId: fixtureTask.id,
    attemptNumber: 1,
    status: "succeeded",
    startedAt: "2026-04-20T12:00:00.000Z",
    finishedAt: "2026-04-20T12:01:00.000Z",
  });
  const fixtureAudit = createAuditEvent({
    id: "audit:task-live-fixtures-1",
    aggregateType: "task",
    aggregateId: fixtureTask.id,
    eventType: "ingest-fixtures.succeeded",
    actor: "ingestion-worker",
    payload: {
      taskRunId: fixtureRun.id,
      status: "succeeded",
      intent: "ingest-fixtures",
      workflowId: "wf-live-fixtures-1",
      request: {
        league: "39",
        season: 2025,
        window: {
          start: "2026-04-20T00:00:00.000Z",
          end: "2026-04-21T00:00:00.000Z",
          granularity: "daily",
        },
        quirksApplied: ["api-football-season-inferred"],
      },
      provider: {
        endpointFamily: "fixtures",
        providerSource: "live-readonly",
        providerBaseUrl: "https://provider.example/v3",
        requestKind: "live-runner",
      },
      batchId: "batch-fixtures-1",
      checksum: "chk-fixtures-1",
      observedRecords: 3,
      rawRefs: ["memory://fixtures/1.json"],
      snapshotId: "snapshot-fixtures-1",
      warnings: [],
    },
    occurredAt: "2026-04-20T12:01:00.000Z",
  });
  const oddsTask = createTask({
    id: "task-live-odds-1",
    kind: "odds-ingestion",
    status: "failed",
    priority: 90,
    payload: {
      fixtureIds: ["1499235"],
      marketKeys: ["h2h"],
      window: {
        start: "2026-04-20T11:45:00.000Z",
        end: "2026-04-20T13:30:00.000Z",
        granularity: "intraday",
      },
      metadata: { labels: ["official", "live", "odds"], source: "ingestion-worker/live-runner" },
      traceId: "trace-live-odds-1",
      workflowId: "wf-live-odds-1",
    },
    attempts: [{ startedAt: "2026-04-20T12:05:00.000Z", finishedAt: "2026-04-20T12:06:00.000Z", error: "provider failed" }],
    scheduledFor: "2026-04-20T12:05:00.000Z",
    createdAt: "2026-04-20T12:05:00.000Z",
    updatedAt: "2026-04-20T12:06:00.000Z",
  });
  const oddsRun = createTaskRun({
    id: "trn_live_odds_1",
    taskId: oddsTask.id,
    attemptNumber: 1,
    status: "failed",
    startedAt: "2026-04-20T12:05:00.000Z",
    finishedAt: "2026-04-20T12:06:00.000Z",
    error: "provider failed",
  });
  const oddsAudit = createAuditEvent({
    id: "audit:task-live-odds-1",
    aggregateType: "task",
    aggregateId: oddsTask.id,
    eventType: "ingest-odds.failed",
    actor: "ingestion-worker",
    payload: {
      taskRunId: oddsRun.id,
      status: "failed",
      intent: "ingest-odds",
      workflowId: "wf-live-odds-1",
      request: {
        fixtureIds: ["1499235"],
        marketKeys: ["h2h"],
        window: {
          start: "2026-04-20T11:45:00.000Z",
          end: "2026-04-20T13:30:00.000Z",
          granularity: "intraday",
        },
        quirksApplied: [],
      },
      provider: {
        endpointFamily: "odds",
        providerSource: "live-readonly",
        providerBaseUrl: "https://provider.example/v3",
        requestKind: "live-runner",
      },
      error: "provider failed",
      errorDetails: {
        category: "provider-envelope",
        endpoint: "odds",
        provider: "api-football",
        retriable: false,
        url: "https://provider.example/v3/odds?fixture=1499235",
        providerErrors: { token: "invalid" },
      },
      warnings: [],
    },
    occurredAt: "2026-04-20T12:06:00.000Z",
  });

  const snapshot = createOperationSnapshot({
    generatedAt: "2026-04-20T12:10:00.000Z",
    tasks: [fixtureTask, oddsTask],
    taskRuns: [fixtureRun, oddsRun],
    auditEvents: [fixtureAudit, oddsAudit],
    rawBatches: [
      {
        id: "batch-fixtures-1",
        endpointFamily: "fixtures",
        providerCode: "api-football",
        extractionStatus: "success",
        extractionTime: "2026-04-20T12:01:00.000Z",
        recordCount: 3,
      },
    ],
    oddsSnapshots: [
      {
        id: "odds-snapshot-1",
        fixtureId: "fixture:api-football:1499235",
        providerFixtureId: "1499235",
        bookmakerKey: "bet365",
        marketKey: "h2h",
        capturedAt: "2026-04-20T12:02:00.000Z",
        selectionCount: 3,
      },
    ],
  });
  const handlers = createPublicApiHandlers(snapshot);
  const listResponse = routePublicApiRequest(handlers, "/live-ingestion-runs");
  const detailResponse = routePublicApiRequest(handlers, `/live-ingestion-runs/${fixtureTask.id}`);

  assert.equal(listResponse.status, 200);
  assert.equal(detailResponse.status, 200);
  const runs = listResponse.body as Array<Record<string, any>>;
  const detail = detailResponse.body as Record<string, any>;
  assert.equal(runs.length, 2);
  assert.equal(runs[0]?.taskId, oddsTask.id);
  assert.equal(detail.taskRunId, fixtureRun.id);
  assert.equal(detail.provider.endpointFamily, "fixtures");
  assert.equal(detail.provider.providerSource, "live-readonly");
  assert.equal(detail.request.league, "39");
  assert.equal(detail.request.season, 2025);
  assert.deepEqual(detail.request.quirksApplied, ["api-football-season-inferred"]);
  assert.equal(runs[1]?.batch.batchId, "batch-fixtures-1");
  assert.equal(runs[0]?.providerError.category, "provider-envelope");
});

test("public api exposes coverage policies and daily scope read models", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const trackedFixture = createFixture({
    id: "fixture:api-football:cov-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Liverpool",
    awayTeam: "Chelsea",
    scheduledAt: "2099-01-01T18:00:00.000Z",
    status: "scheduled",
    metadata: {
      providerCode: "api-football",
      providerLeagueId: "39",
      providerHomeTeamId: "40",
      providerAwayTeamId: "49",
    },
  });
  const blockedFixture = createFixture({
    id: "fixture:api-football:cov-2",
    sport: "football",
    competition: "Untracked League",
    homeTeam: "Home",
    awayTeam: "Away",
    scheduledAt: "2099-01-01T19:00:00.000Z",
    status: "scheduled",
    metadata: {
      providerCode: "api-football",
      providerLeagueId: "999",
      providerHomeTeamId: "9991",
      providerAwayTeamId: "9992",
    },
  });
  await unitOfWork.fixtures.save(trackedFixture);
  await unitOfWork.fixtures.save(blockedFixture);
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: trackedFixture.id,
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
      selectionOverride: "force-include",
      minDetectedOdd: 1.11,
    }),
  );
  await unitOfWork.leagueCoveragePolicies.save(
    createLeagueCoveragePolicy({
      id: "league-policy-epl",
      provider: "api-football",
      leagueKey: "39",
      leagueName: "Premier League",
      season: 2099,
      enabled: true,
      alwaysOn: true,
      priority: 90,
      marketsAllowed: ["moneyline"],
    }),
  );
  await unitOfWork.teamCoveragePolicies.save(
    createTeamCoveragePolicy({
      id: "team-policy-liverpool",
      provider: "api-football",
      teamKey: "40",
      teamName: "Liverpool",
      enabled: true,
      alwaysTrack: true,
      priority: 95,
      followHome: true,
      followAway: true,
      forceResearch: true,
    }),
  );
  await unitOfWork.dailyAutomationPolicies.save(
    createDailyAutomationPolicy({
      id: "daily-policy-default",
      policyName: "default-football-daily",
      enabled: true,
      timezone: "America/Guatemala",
      minAllowedOdd: 1.2,
      defaultMaxFixturesPerRun: 30,
      defaultLookaheadHours: 24,
      defaultLookbackHours: 6,
      requireTrackedLeagueOrTeam: true,
      allowManualInclusionBypass: true,
    }),
  );

  const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork);
  const handlers = createPublicApiHandlers(snapshot);
  const leaguesResponse = routePublicApiRequest(handlers, "/coverage/leagues");
  const teamsResponse = routePublicApiRequest(handlers, "/coverage/teams");
  const dailyPolicyResponse = routePublicApiRequest(handlers, "/coverage/daily-policy");
  const dailyScopeResponse = routePublicApiRequest(handlers, "/coverage/daily-scope");

  assert.equal(leaguesResponse.status, 200);
  assert.equal(teamsResponse.status, 200);
  assert.equal(dailyPolicyResponse.status, 200);
  assert.equal(dailyScopeResponse.status, 200);
  assert.equal((leaguesResponse.body as any[]).length, 1);
  assert.equal((teamsResponse.body as any[]).length, 1);
  assert.equal((dailyPolicyResponse.body as any).minAllowedOdd, 1.2);
  assert.equal((dailyScopeResponse.body as any[]).length, 2);
  assert.equal((dailyScopeResponse.body as any[]).some((entry) => entry.fixtureId === trackedFixture.id && entry.included === true), true);
  assert.equal((dailyScopeResponse.body as any[]).some((entry) => entry.fixtureId === trackedFixture.id && entry.eligibleForScoring === false), true);
  assert.equal((dailyScopeResponse.body as any[]).some((entry) => entry.fixtureId === blockedFixture.id && entry.included === false), true);
});

test("public api health reports live ingestion freshness and recent failures", () => {
  const snapshot = createOperationSnapshot({
    generatedAt: "2026-04-20T12:10:00.000Z",
    tasks: [
      createTask({
        id: "task-live-fixtures-stale",
        kind: "fixture-ingestion",
        status: "succeeded",
        priority: 80,
        payload: {},
        attempts: [{ startedAt: "2026-04-18T09:00:00.000Z", finishedAt: "2026-04-18T09:10:00.000Z" }],
        scheduledFor: "2026-04-18T09:00:00.000Z",
        createdAt: "2026-04-18T09:00:00.000Z",
        updatedAt: "2026-04-18T09:10:00.000Z",
      }),
      createTask({
        id: "task-live-odds-failed",
        kind: "odds-ingestion",
        status: "failed",
        priority: 90,
        payload: {},
        attempts: [{ startedAt: "2026-04-20T11:40:00.000Z", finishedAt: "2026-04-20T11:50:00.000Z", error: "provider failed" }],
        scheduledFor: "2026-04-20T11:40:00.000Z",
        createdAt: "2026-04-20T11:40:00.000Z",
        updatedAt: "2026-04-20T11:50:00.000Z",
      }),
    ],
    rawBatches: [
      {
        id: "stale-fixtures-batch",
        endpointFamily: "fixtures",
        providerCode: "api-football",
        extractionStatus: "success",
        extractionTime: "2026-04-18T09:10:00.000Z",
        recordCount: 5,
      },
    ],
    oddsSnapshots: [
      {
        id: "stale-odds-snapshot",
        fixtureId: "fixture:api-football:1499235",
        providerFixtureId: "1499235",
        bookmakerKey: "bet365",
        marketKey: "h2h",
        capturedAt: "2026-04-20T08:00:00.000Z",
        selectionCount: 3,
      },
    ],
  });

  const health = snapshot.health;
  const fixturesFreshness = health.checks.find((check) => check.name === "live-fixtures-freshness");
  const oddsFreshness = health.checks.find((check) => check.name === "live-odds-freshness");
  const failures = health.checks.find((check) => check.name === "live-ingestion-recent-failures");

  assert.equal(health.status, "degraded");
  assert.equal(fixturesFreshness?.status, "warn");
  assert.match(fixturesFreshness?.detail ?? "", /51\.00h old/i);
  assert.equal(oddsFreshness?.status, "warn");
  assert.match(oddsFreshness?.detail ?? "", /4\.17h|4\./i);
  assert.equal(failures?.status, "warn");
  assert.match(failures?.detail ?? "", /1 recent failed\/quarantined/i);
});

test("loadOperationSnapshotFromUnitOfWork loads ETL from Prisma-like sources and telemetry from repos", async () => {
  const unitOfWork = createInMemoryUnitOfWork() as ReturnType<typeof createInMemoryUnitOfWork> & {
    client: {
      rawIngestionBatch: {
        findMany: () => Promise<Array<{
          id: string;
          endpointFamily: string;
          providerCode: string;
          extractionStatus: string;
          extractionTime: Date;
          recordCount: number;
        }>>;
      };
      $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown[]>;
    };
    telemetryEvents: {
      listByQuery: () => Promise<unknown[]>;
    };
    metricSamples: {
      listByQuery: () => Promise<unknown[]>;
    };
  };

  unitOfWork.client = {
    rawIngestionBatch: {
      findMany: async () => [
        {
          id: "raw-batch-prisma-1",
          endpointFamily: "fixtures",
          providerCode: "api-football",
          extractionStatus: "succeeded",
          extractionTime: new Date("2026-08-16T20:40:00.000Z"),
          recordCount: 12,
        },
      ],
    },
    $queryRawUnsafe: async (sql: string) => {
      if (sql.includes("information_schema.tables")) {
        return [];
      }

      if (sql.includes("FROM OddsSnapshot")) {
        return [
          {
            id: "odds-snapshot-prisma-1",
            fixtureId: "fx-release-ops-1",
            providerFixtureId: "provider-fixture-1",
            bookmakerKey: "bet365",
            marketKey: "h2h",
            capturedAt: new Date("2026-08-16T20:42:00.000Z"),
            selectionCount: 3,
          },
        ];
      }

      return [];
    },
  };
  unitOfWork.telemetryEvents = {
    save: async (entity) => entity,
    getById: async () => null,
    list: async () => [],
    delete: async () => {},
    listByQuery: async () => [
      {
        id: "repo-event-1",
        kind: "log",
        name: "telemetry.repo.loaded",
        severity: "info",
        occurredAt: "2026-08-16T20:45:00.000Z",
        createdAt: "2026-08-16T20:45:00.000Z",
        updatedAt: "2026-08-16T20:45:00.000Z",
        source: "repo",
        attributes: { from: "repo" },
      },
    ],
  };
  unitOfWork.metricSamples = {
    save: async (entity) => entity,
    getById: async () => null,
    list: async () => [],
    delete: async () => {},
    listByQuery: async () => [
      {
        id: "repo-metric-1",
        name: "telemetry_repo_loaded_total",
        type: "counter",
        value: 1,
        labels: { source: "repo" },
        recordedAt: "2026-08-16T20:46:00.000Z",
        createdAt: "2026-08-16T20:46:00.000Z",
        updatedAt: "2026-08-16T20:46:00.000Z",
        source: "repo",
      },
    ],
  };

  const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork);

  assert.equal(snapshot.rawBatches[0]?.id, "raw-batch-prisma-1");
  assert.equal(snapshot.oddsSnapshots[0]?.id, "odds-snapshot-prisma-1");
  assert.equal(snapshot.telemetryEvents[0]?.name, "telemetry.repo.loaded");
  assert.equal(snapshot.telemetryMetrics[0]?.name, "telemetry_repo_loaded_total");
});

test("public api enriches AI run read models with provider request ids, fallback reason, and compatibility fields", () => {
  const failedAiRun = createAiRun({
    id: "airun-failed",
    taskId: "task-failed",
    provider: "codex",
    model: "gpt-5.4",
    promptVersion: "v8-slice-3",
    providerRequestId: "req-failed-1",
    status: "failed",
    outputRef: "memory://airuns/airun-failed.json",
    error: "AI-assisted scoring fallback to deterministic baseline: provider timeout",
    createdAt: "2026-04-15T00:03:00.000Z",
    updatedAt: "2026-04-15T00:04:00.000Z",
  });
  const snapshot = createOperationSnapshot({
    aiRuns: [
      {
        id: failedAiRun.id,
        taskId: failedAiRun.taskId,
        provider: failedAiRun.provider,
        model: failedAiRun.model,
        promptVersion: failedAiRun.promptVersion,
        latestPromptVersion: failedAiRun.promptVersion,
        ...(failedAiRun.providerRequestId ? { providerRequestId: failedAiRun.providerRequestId } : {}),
        status: failedAiRun.status,
        ...(failedAiRun.outputRef ? { outputRef: failedAiRun.outputRef } : {}),
        ...(failedAiRun.error
          ? {
              error: failedAiRun.error,
              fallbackReason: failedAiRun.error,
              degraded: true,
            }
          : {}),
        createdAt: failedAiRun.createdAt,
        updatedAt: failedAiRun.updatedAt,
      },
    ],
  });

  const aiRun = findAiRunById(snapshot, "airun-failed");

  assert.equal(aiRun?.providerRequestId, "req-failed-1");
  assert.equal(aiRun?.latestPromptVersion, "v8-slice-3");
  assert.equal(aiRun?.degraded, true);
  assert.match(aiRun?.fallbackReason ?? "", /provider timeout/i);
});

test("public api snapshot exposes fixtures, predictions, parlays, validations, validation summary, and health", () => {
  const snapshot = createDemoOperationSnapshot();

  assert.equal(listFixtures(snapshot).length, 2);
  assert.equal(listTasks(snapshot).length, 1);
  assert.equal(listTaskRuns(snapshot).length, 1);
  assert.equal(snapshot.rawBatches.length, 0);
  assert.equal(snapshot.oddsSnapshots.length, 0);
  assert.equal(listPredictions(snapshot).length, 2);
  assert.equal(listParlays(snapshot).length, 1);
  assert.equal(listValidations(snapshot).length, 2);
  assert.equal(getValidationSummary(snapshot).total, 2);
  assert.equal(getValidationSummary(snapshot).partial, 1);
  assert.equal(getHealth(snapshot).status, "degraded");
  assert.equal(publicApiEndpointPaths.health, "/health");
  assert.equal(publicApiEndpointPaths.validations, "/validations");
});

test("public api derives an operational summary from tasks, task runs, etl batches, and validations", () => {
  const snapshot = createDemoOperationSnapshot({
    rawBatches: [
      {
        id: "batch-fixtures-1",
        endpointFamily: "fixtures",
        providerCode: "api-football",
        extractionStatus: "succeeded",
        extractionTime: "2026-04-15T00:01:00.000Z",
        recordCount: 15,
      },
      {
        id: "batch-odds-1",
        endpointFamily: "odds",
        providerCode: "api-football",
        extractionStatus: "failed",
        extractionTime: "2026-04-15T00:02:00.000Z",
        recordCount: 4,
      },
    ],
  });

  const summary = createOperationalSummary(snapshot);

  assert.equal(summary.taskCounts.total, snapshot.tasks.length);
  assert.equal(summary.taskRunCounts.total, snapshot.taskRuns.length);
  assert.equal(summary.etl.rawBatchCount, 2);
  assert.equal(summary.etl.endpointCounts.fixtures, 1);
  assert.equal(summary.etl.endpointCounts.odds, 1);
  assert.equal(summary.etl.latestBatch?.id, "batch-odds-1");
  assert.equal(summary.validation.total, snapshot.validationSummary.total);
  assert.ok(summary.observability.workers.length >= 1);
  assert.equal(typeof summary.observability.traceability.taskTraceCoverageRate, "number");
  assert.equal(summary.policy.status === "ready" || summary.policy.status === "degraded" || summary.policy.status === "blocked", true);
  assert.equal(typeof summary.policy.publishAllowed, "boolean");
});

test("public api operational summary counts quarantined tasks explicitly", () => {
  const snapshot = createReleaseOpsSnapshot();

  const summary = createOperationalSummary(snapshot);

  assert.equal(summary.taskCounts.quarantined, 1);
  assert.equal(summary.observability.retries.quarantined, 1);
});

test("public api builds task log entries sorted by newest timestamp", () => {
  const demoSnapshot = createDemoOperationSnapshot();
  const snapshot = createOperationSnapshot({
    tasks: [
      {
        ...demoSnapshot.tasks[0]!,
        id: "task-failed",
        kind: "prediction",
        status: "failed",
        createdAt: "2026-04-15T00:05:00.000Z",
        updatedAt: "2026-04-15T00:08:00.000Z",
      },
    ],
    taskRuns: [
      {
        ...demoSnapshot.taskRuns[0]!,
        id: "task-failed:attempt:1",
        taskId: "task-failed",
        status: "failed",
        startedAt: "2026-04-15T00:06:00.000Z",
        finishedAt: "2026-04-15T00:07:00.000Z",
        error: "provider timeout",
        updatedAt: "2026-04-15T00:07:00.000Z",
      },
    ],
  });

  const logs = createTaskLogEntries(snapshot);

  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.level, "ERROR");
  assert.equal(logs[0]?.taskRunId, "task-failed:attempt:1");
  assert.match(logs[0]?.message ?? "", /provider timeout/i);
  assert.equal(logs[0]?.taskId, "task-failed");
  assert.equal(logs[1]?.taskId, "task-failed");
});

test("public api handlers return consistent derived read models", () => {
  const snapshot = createDemoOperationSnapshot();
  const api = createPublicApiHandlers(snapshot);

  assert.deepEqual(api.snapshot(), snapshot);
  assert.equal(api.fixtures()[0]?.homeTeam, "Boca Juniors");
  assert.equal(api.tasks()[0]?.kind, "fixture-ingestion");
  assert.equal(api.taskById(snapshot.tasks[0]!.id)?.id, snapshot.tasks[0]!.id);
  assert.equal(api.taskRuns()[0]?.taskId, snapshot.tasks[0]?.id);
  assert.equal(api.taskRunById(snapshot.taskRuns[0]!.id)?.id, snapshot.taskRuns[0]!.id);
  assert.equal(api.taskRunsByTaskId(snapshot.tasks[0]!.id).length, 1);
  assert.equal(api.predictions()[1]?.outcome, "over");
  assert.equal(api.predictionById(snapshot.predictions[0]!.id)?.id, snapshot.predictions[0]!.id);
  assert.equal(api.parlays()[0]?.legs.length, 2);
  assert.equal(api.parlayById(snapshot.parlays[0]!.id)?.id, snapshot.parlays[0]!.id);
  assert.equal(api.validations()[0]?.targetType, "parlay");
  assert.equal(api.validationById(snapshot.validations[0]!.id)?.id, snapshot.validations[0]!.id);
  assert.equal(api.validationSummary().completionRate, 1);
  assert.match(api.health().checks[0]?.detail ?? "", /fixture/);
  assert.equal(api.operationalSummary().taskCounts.total, snapshot.tasks.length);
  assert.ok(api.operationalSummary().observability.workers.length >= 1);
  assert.equal(typeof api.operationalSummary().policy.publishAllowed, "boolean");
  assert.equal(api.operationalLogs().length, listOperationalLogs(snapshot).length);
});

test("public api exposes detail lookups for tasks, task runs, predictions, parlays, and validations", () => {
  const snapshot = createDemoOperationSnapshot();

  assert.equal(findTaskById(snapshot, snapshot.tasks[0]!.id)?.id, snapshot.tasks[0]!.id);
  assert.equal(findTaskRunById(snapshot, snapshot.taskRuns[0]!.id)?.id, snapshot.taskRuns[0]!.id);
  assert.equal(listTaskRunsByTaskId(snapshot, snapshot.tasks[0]!.id).length, 1);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.id, snapshot.predictions[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.aiRun?.id, snapshot.aiRuns[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.fixture?.id, snapshot.fixtures[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.linkedParlayIds[0], snapshot.parlays[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.linkedParlays[0]?.id, snapshot.parlays[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.validation?.id, snapshot.validations[1]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.id, snapshot.parlays[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.aiRun?.id, snapshot.aiRuns[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.linkedAiRunIds[0], snapshot.aiRuns[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.legs[0]?.prediction?.id, snapshot.predictions[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.validation?.id, snapshot.validations[0]!.id);
  assert.equal(findValidationById(snapshot, snapshot.validations[0]!.id)?.id, snapshot.validations[0]!.id);
});

test("public api exposes fixture-centric ops detail", () => {
  const fixture = createFixture({
    id: "fx-ops-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Comunicaciones",
    awayTeam: "Municipal",
    scheduledAt: "2026-04-15T18:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });
  const prediction = createPrediction({
    id: "pred-ops-1",
    fixtureId: fixture.id,
    market: "moneyline",
    outcome: "home",
    status: "published",
    confidence: 0.62,
    probabilities: { implied: 0.5, model: 0.62, edge: 0.12 },
    rationale: ["fixture ops detail"],
  });
  const parlay = createParlay({
    id: "parlay-ops-1",
    status: "ready",
    stake: 10,
    source: "automatic",
    correlationScore: 0.1,
    expectedPayout: 19.4,
    legs: [{ predictionId: prediction.id, fixtureId: fixture.id, market: "moneyline", outcome: "home", price: 1.94, status: "pending" }],
  });
  const validation = createValidation({
    id: "val-ops-1",
    targetType: "prediction",
    targetId: prediction.id,
    kind: "prediction-settlement",
    status: "pending",
    checks: [],
    summary: "pending",
  });
  const snapshot = createOperationSnapshot({
    fixtures: [fixture],
    fixtureResearch: [createFixtureResearchReadModel(fixture.id)],
    fixtureWorkflows: [createFixtureWorkflow({ fixtureId: fixture.id, ingestionStatus: "succeeded", oddsStatus: "succeeded", enrichmentStatus: "succeeded", candidateStatus: "succeeded", predictionStatus: "succeeded", parlayStatus: "pending", validationStatus: "pending", isCandidate: true, manualSelectionStatus: "selected", selectionOverride: "force-include" })],
    auditEvents: [
      {
        id: "audit-ops-2",
        aggregateType: "fixture-workflow",
        aggregateId: fixture.id,
        eventType: "fixture-workflow.selection-override.updated",
        actor: "public-api",
        payload: { mode: "force-include", reason: "high conviction" },
        occurredAt: "2026-04-15T16:06:00.000Z",
        createdAt: "2026-04-15T16:06:00.000Z",
        updatedAt: "2026-04-15T16:06:00.000Z",
      },
      {
        id: "audit-ops-1",
        aggregateType: "fixture-workflow",
        aggregateId: fixture.id,
        eventType: "fixture-workflow.manual-selection.updated",
        actor: "ops-user",
        payload: { status: "selected", reason: "desk review" },
        occurredAt: "2026-04-15T16:05:00.000Z",
        createdAt: "2026-04-15T16:05:00.000Z",
        updatedAt: "2026-04-15T16:05:00.000Z",
      },
    ],
    tasks: [createTask({ id: "task-ops-1", kind: "prediction", status: "failed", priority: 10, payload: { fixtureId: fixture.id } })],
    taskRuns: [createTaskRun({ id: "task-ops-1:attempt:1", taskId: "task-ops-1", attemptNumber: 1, status: "failed", startedAt: "2026-04-15T16:00:00.000Z", finishedAt: "2026-04-15T16:01:00.000Z", error: "provider timeout" })],
    oddsSnapshots: [{ id: "odds-ops-1", fixtureId: fixture.id, providerFixtureId: "pfx-1", bookmakerKey: "bet365", marketKey: "h2h", capturedAt: "2026-04-15T15:30:00.000Z", selectionCount: 3 }],
    predictions: [prediction],
    parlays: [parlay],
    validations: [validation],
  });
  const handlers = createPublicApiHandlers(snapshot);
  const response = routePublicApiRequest(handlers, `/fixtures/${fixture.id}/ops`);
  const auditEventsResponse = routePublicApiRequest(handlers, `/fixtures/${fixture.id}/audit-events`);

  assert.equal(response.status, 200);
  const body = response.body as any;
  assert.equal(body.fixture.id, fixture.id);
  assert.equal(body.workflow.predictionStatus, "succeeded");
  assert.equal(body.latestOddsSnapshot.id, "odds-ops-1");
  assert.equal(body.predictions.length, 1);
  assert.equal(body.parlays.length, 1);
  assert.equal(body.validations.length, 1);
  assert.equal(body.scoringEligibility.eligible, true);
  assert.match(body.scoringEligibility.reason ?? "", /force-included/i);
  assert.equal(body.recentAuditEvents.length, 2);
  assert.equal(body.recentAuditEvents[0]?.eventType, "fixture-workflow.selection-override.updated");
  assert.equal(body.recentAuditEvents[0]?.payload.mode, "force-include");
  assert.equal(body.recentAuditEvents[1]?.eventType, "fixture-workflow.manual-selection.updated");
  assert.match(body.recentTaskRuns[0]?.error ?? "", /provider timeout/i);
  assert.equal(auditEventsResponse.status, 200);
  assert.equal((auditEventsResponse.body as any[]).length, 2);
  assert.equal((auditEventsResponse.body as any[])[0]?.eventType, "fixture-workflow.selection-override.updated");
});

test("public api loads recent fixture workflow audit events from the unit of work", async () => {
  const fixture = createFixture({
    id: "fx-uow-audit-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Antigua",
    awayTeam: "Coban",
    scheduledAt: "2026-04-15T18:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });
  const unitOfWork = createInMemoryUnitOfWork();
  await unitOfWork.fixtures.save(fixture);
  await seedPublishableResearch(unitOfWork, fixture.id);
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: fixture.id,
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
      selectionOverride: "force-include",
    }),
  );
  await unitOfWork.auditEvents.save({
    id: "audit-uow-1",
    aggregateType: "fixture-workflow",
    aggregateId: fixture.id,
    eventType: "fixture-workflow.manual-selection.updated",
    actor: "ops-user",
    payload: { status: "selected", reason: "manual review" },
    occurredAt: "2026-04-15T16:00:00.000Z",
    createdAt: "2026-04-15T16:00:00.000Z",
    updatedAt: "2026-04-15T16:00:00.000Z",
  });
  await unitOfWork.auditEvents.save({
    id: "audit-uow-2",
    aggregateType: "fixture-workflow",
    aggregateId: fixture.id,
    eventType: "fixture-workflow.selection-override.updated",
    actor: "public-api",
    payload: { mode: "force-include", reason: "priority" },
    occurredAt: "2026-04-15T17:00:00.000Z",
    createdAt: "2026-04-15T17:00:00.000Z",
    updatedAt: "2026-04-15T17:00:00.000Z",
  });

  const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork);
  const fixtureOps = createPublicApiHandlers(snapshot).fixtureOpsById(fixture.id);

  assert.equal(fixtureOps?.recentAuditEvents.length, 2);
  assert.equal(fixtureOps?.recentAuditEvents[0]?.eventType, "fixture-workflow.selection-override.updated");
  assert.match(fixtureOps?.scoringEligibility.reason ?? "", /force-included/i);
});

test("public api returns consistent 404 payloads for missing detail resources", () => {
  const handlers = createPublicApiHandlers(createDemoOperationSnapshot());

  assert.deepEqual(routePublicApiRequest(handlers, "/fixtures/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "fixture", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/fixtures/missing/audit-events"), {
    status: 404,
    body: { error: "resource_not_found", resource: "fixture", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/tasks/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "task", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/task-runs/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "task-run", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/predictions/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "prediction", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/parlays/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "parlay", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/validations/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "validation", resourceId: "missing" },
  });
});

test("public api exposes operational summary and logs routes", () => {
  const snapshot = createOperationSnapshot({
    rawBatches: [
      {
        id: "batch-fixtures-1",
        endpointFamily: "fixtures",
        providerCode: "api-football",
        extractionStatus: "succeeded",
        extractionTime: "2026-04-15T00:01:00.000Z",
        recordCount: 15,
      },
    ],
  });
  const handlers = createPublicApiHandlers(snapshot);

  const summaryResponse = routePublicApiRequest(handlers, publicApiEndpointPaths.operationalSummary);
  const logsResponse = routePublicApiRequest(handlers, publicApiEndpointPaths.operationalLogs);

  assert.equal(summaryResponse.status, 200);
  assert.equal((summaryResponse.body as ReturnType<typeof createOperationalSummary>).etl.rawBatchCount, 1);
  assert.equal(logsResponse.status, 200);
  assert.ok(Array.isArray(logsResponse.body));
});

test("public api filters tasks by status in routed requests", () => {
  const snapshot = createDemoOperationSnapshot();
  const handlers = createPublicApiHandlers(snapshot);

  assert.deepEqual(
    routePublicApiRequest(handlers, `${publicApiEndpointPaths.tasks}?status=succeeded`),
    {
      status: 200,
      body: [snapshot.tasks[0]],
    },
  );
});

test("public api returns 400 for invalid task status filters", () => {
  const handlers = createPublicApiHandlers(createDemoOperationSnapshot());

  assert.deepEqual(
    routePublicApiRequest(handlers, `${publicApiEndpointPaths.tasks}?status=paused`),
    {
      status: 400,
      body: {
        error: "invalid_query_parameter",
        parameter: "status",
        allowedValues: ["queued", "running", "failed", "quarantined", "succeeded", "cancelled"],
      },
    },
  );
});

test("public api persists manual selection and selection override actions through the unit of work", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fx-ops-action-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Comunicaciones",
    awayTeam: "Municipal",
    scheduledAt: "2026-04-22T02:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);

  const manuallySelected = await applyFixtureManualSelection(unitOfWork, fixture.id, {
    status: "selected",
    selectedBy: "luis",
    reason: "Partido clave del slate",
    occurredAt: "2026-04-22T00:10:00.000Z",
  });

  const overridden = await applyFixtureSelectionOverride(unitOfWork, fixture.id, {
    mode: "force-include",
    reason: "Pinned por operador",
    occurredAt: "2026-04-22T00:11:00.000Z",
  });

  assert.equal(manuallySelected.manualSelectionStatus, "selected");
  assert.equal(manuallySelected.manualSelectionBy, "luis");
  assert.equal(overridden.selectionOverride, "force-include");
  assert.equal(overridden.overrideReason, "Pinned por operador");
  assert.equal(
    (await unitOfWork.fixtureWorkflows.findByFixtureId(fixture.id))?.selectionOverride,
    "force-include",
  );
  const auditEvents = await unitOfWork.auditEvents.findByAggregate("fixture-workflow", fixture.id);
  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0]?.eventType, "fixture-workflow.manual-selection.updated");
  assert.equal(auditEvents[1]?.eventType, "fixture-workflow.selection-override.updated");
});

test("public api server exposes http endpoints for fixtures, predictions, parlays, validations, validation summary, health, snapshot, and operational views", async () => {
  const snapshot = createDemoOperationSnapshot();
  const server = createPublicApiServer({ snapshot });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const fixturesResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.fixtures}`);
    assert.equal(fixturesResponse.status, 200);
    assert.deepEqual(await fixturesResponse.json(), snapshot.fixtures);

    const fixtureDetailResponse = await fetch(`${baseUrl}/fixtures/${snapshot.fixtures[0]!.id}`);
    assert.equal(fixtureDetailResponse.status, 200);
    assert.deepEqual(await fixtureDetailResponse.json(), snapshot.fixtures[0]);

    const tasksResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.tasks}`);
    assert.equal(tasksResponse.status, 200);
    assert.deepEqual(await tasksResponse.json(), snapshot.tasks);

    const taskDetailResponse = await fetch(`${baseUrl}/tasks/${snapshot.tasks[0]!.id}`);
    assert.equal(taskDetailResponse.status, 200);
    assert.deepEqual(await taskDetailResponse.json(), snapshot.tasks[0]);

    const taskRunDetailResponse = await fetch(`${baseUrl}/task-runs/${snapshot.taskRuns[0]!.id}`);
    assert.equal(taskRunDetailResponse.status, 200);
    assert.deepEqual(await taskRunDetailResponse.json(), snapshot.taskRuns[0]);

    const filteredTasksResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.tasks}?status=succeeded`,
    );
    assert.equal(filteredTasksResponse.status, 200);
    assert.deepEqual(await filteredTasksResponse.json(), [snapshot.tasks[0]]);

    const taskRunsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.taskRuns}`);
    assert.equal(taskRunsResponse.status, 200);
    assert.deepEqual(await taskRunsResponse.json(), snapshot.taskRuns);

    const taskRunsByTaskResponse = await fetch(`${baseUrl}/tasks/${snapshot.tasks[0]!.id}/runs`);
    assert.equal(taskRunsByTaskResponse.status, 200);
    assert.deepEqual(await taskRunsByTaskResponse.json(), snapshot.taskRuns);

    const rawBatchesResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.rawBatches}`);
    assert.equal(rawBatchesResponse.status, 200);
    assert.deepEqual(await rawBatchesResponse.json(), snapshot.rawBatches);

    const oddsSnapshotsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.oddsSnapshots}`);
    assert.equal(oddsSnapshotsResponse.status, 200);
    assert.deepEqual(await oddsSnapshotsResponse.json(), snapshot.oddsSnapshots);

    const predictionsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.predictions}`);
    assert.equal(predictionsResponse.status, 200);
    assert.deepEqual(await predictionsResponse.json(), snapshot.predictions);

    const predictionDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.predictions}/${snapshot.predictions[0]!.id}`,
    );
    assert.equal(predictionDetailResponse.status, 200);
    const predictionDetailJson = (await predictionDetailResponse.json()) as {
      id: string;
      aiRun?: { id: string };
      fixture?: { id: string };
      linkedParlayIds: string[];
    };
    assert.equal(predictionDetailJson.id, snapshot.predictions[0]!.id);
    assert.equal(predictionDetailJson.aiRun?.id, snapshot.aiRuns[0]!.id);
    assert.equal(predictionDetailJson.fixture?.id, snapshot.fixtures[0]!.id);
    assert.deepEqual(predictionDetailJson.linkedParlayIds, [snapshot.parlays[0]!.id]);

    const parlaysResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.parlays}`);
    assert.equal(parlaysResponse.status, 200);
    assert.deepEqual(await parlaysResponse.json(), snapshot.parlays);

    const parlayDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.parlays}/${snapshot.parlays[0]!.id}`,
    );
    assert.equal(parlayDetailResponse.status, 200);
    const parlayDetailJson = (await parlayDetailResponse.json()) as {
      id: string;
      aiRun?: { id: string };
      legs: Array<{ prediction?: { id: string } }>;
      validation?: { id: string };
    };
    assert.equal(parlayDetailJson.id, snapshot.parlays[0]!.id);
    assert.equal(parlayDetailJson.aiRun?.id, snapshot.aiRuns[0]!.id);
    assert.equal(parlayDetailJson.legs[0]?.prediction?.id, snapshot.predictions[0]!.id);
    assert.equal(parlayDetailJson.validation?.id, snapshot.validations[0]!.id);

    const validationsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.validations}`);
    assert.equal(validationsResponse.status, 200);
    assert.deepEqual(await validationsResponse.json(), snapshot.validations);

    const validationDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.validations}/${snapshot.validations[0]!.id}`,
    );
    assert.equal(validationDetailResponse.status, 200);
    assert.deepEqual(await validationDetailResponse.json(), snapshot.validations[0]);

    const operationalSummaryResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.operationalSummary}`);
    assert.equal(operationalSummaryResponse.status, 200);
    const operationalSummaryJson = (await operationalSummaryResponse.json()) as ReturnType<
      typeof createOperationalSummary
    >;
    assert.equal(operationalSummaryJson.taskCounts.total, snapshot.tasks.length);

    const operationalLogsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.operationalLogs}`);
    assert.equal(operationalLogsResponse.status, 200);
    assert.ok(Array.isArray(await operationalLogsResponse.json()));

    const missingPredictionResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.predictions}/missing-prediction`,
    );
    assert.equal(missingPredictionResponse.status, 404);
    assert.deepEqual(await missingPredictionResponse.json(), {
      error: "resource_not_found",
      resource: "prediction",
      resourceId: "missing-prediction",
    });

    const missingTaskResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.tasks}/missing-task`);
    assert.equal(missingTaskResponse.status, 404);
    assert.deepEqual(await missingTaskResponse.json(), {
      error: "resource_not_found",
      resource: "task",
      resourceId: "missing-task",
    });

    const missingTaskRunResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.taskRuns}/missing-task-run`);
    assert.equal(missingTaskRunResponse.status, 404);
    assert.deepEqual(await missingTaskRunResponse.json(), {
      error: "resource_not_found",
      resource: "task-run",
      resourceId: "missing-task-run",
    });

    const missingParlayResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.parlays}/missing-parlay`);
    assert.equal(missingParlayResponse.status, 404);
    assert.deepEqual(await missingParlayResponse.json(), {
      error: "resource_not_found",
      resource: "parlay",
      resourceId: "missing-parlay",
    });

    const missingValidationResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.validations}/missing-validation`,
    );
    assert.equal(missingValidationResponse.status, 404);
    assert.deepEqual(await missingValidationResponse.json(), {
      error: "resource_not_found",
      resource: "validation",
      resourceId: "missing-validation",
    });

    const validationResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.validationSummary}`);
    assert.equal(validationResponse.status, 200);
    assert.deepEqual(await validationResponse.json(), snapshot.validationSummary);

    const healthResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.health}`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), snapshot.health);

    const readinessResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.readiness}`);
    assert.equal(readinessResponse.status, 200);
    const readiness = await readinessResponse.json();

    const automationCyclesResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.automationCycles}`);
    assert.equal(automationCyclesResponse.status, 200);
    assert.deepEqual(await automationCyclesResponse.json(), snapshot.automationCycles);

    const snapshotResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.snapshot}`);
    assert.equal(snapshotResponse.status, 200);
    assert.deepEqual(await snapshotResponse.json(), {
      ...snapshot,
      readiness,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server enforces bearer tokens for reads when auth is configured", async () => {
  const snapshot = createDemoOperationSnapshot();
  const authentication = createPublicApiTokenAuthentication({
    viewerToken: "viewer-token",
    operatorToken: "operator-token",
  });
  const server = createPublicApiServer({
    snapshot,
    ...(authentication ? { auth: authentication } : {}),
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const unauthorizedResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.health}`);
    assert.equal(unauthorizedResponse.status, 401);
    assert.match(unauthorizedResponse.headers.get("www-authenticate") ?? "", /Bearer/i);

    const viewerResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.health}`, {
      headers: { authorization: "Bearer viewer-token" },
    });
    assert.equal(viewerResponse.status, 200);
    assert.deepEqual(await viewerResponse.json(), snapshot.health);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server exposes sandbox certification summaries and detail routes", async () => {
  const { goldensRoot, artifactsRoot } = await createSandboxCertificationFixture({ status: "passed" });
  const persistedRuns = createPersistedSandboxCertificationRuns();
  const server = createPublicApiServer({
    snapshot: createDemoOperationSnapshot(),
    sandboxCertification: {
      goldensRoot,
      artifactsRoot,
      persistedRuns,
    },
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const listResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.sandboxCertification}`);
    assert.equal(listResponse.status, 200);
    const listJson = (await listResponse.json()) as Array<{
      status: string;
      packId: string;
      latestSyntheticIntegrity: { verificationKind: string; status: string } | null;
      latestRuntimeRelease: { verificationKind: string; promotionStatus?: string } | null;
    }>;
    assert.equal(listJson[0]?.status, "passed");
    assert.equal(listJson[0]?.packId, "football-dual-smoke");
    assert.equal(listJson[0]?.latestSyntheticIntegrity?.verificationKind, "synthetic-integrity");
    assert.equal(listJson[0]?.latestSyntheticIntegrity?.status, "passed");
    assert.equal(listJson[0]?.latestRuntimeRelease?.verificationKind, "runtime-release");
    assert.equal(listJson[0]?.latestRuntimeRelease?.promotionStatus, "blocked");

    const runsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.sandboxCertificationRuns}`);
    assert.equal(runsResponse.status, 200);
    const runsJson = (await runsResponse.json()) as Array<{
      verificationKind: string;
      status: string;
      promotionStatus?: string;
    }>;
    assert.equal(runsJson.length, 2);
    assert.equal(runsJson[0]?.verificationKind, "runtime-release");
    assert.equal(runsJson[0]?.promotionStatus, "blocked");

    const detailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.sandboxCertification}/ci-smoke/football-dual-smoke`,
    );
    assert.equal(detailResponse.status, 200);
    const detailJson = (await detailResponse.json()) as {
      status: string;
      diffEntries: unknown[];
      allowedHosts: string[];
    };
    assert.equal(detailJson.status, "passed");
    assert.deepEqual(detailJson.diffEntries, []);
    assert.deepEqual(detailJson.allowedHosts, ["sandbox-ci.local"]);
    assert.equal((detailJson as any).latestRuntimeRelease?.promotionStatus, "blocked");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api exposes manual review, quarantine, recovery, and telemetry read models from snapshots", async () => {
  const snapshot = createReleaseOpsSnapshot();
  const server = createPublicApiServer({ snapshot });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const [manualReviewResponse, quarantinesResponse, recoveryResponse, telemetryEventsResponse, telemetryMetricsResponse] =
      await Promise.all([
        fetch(`${baseUrl}${publicApiEndpointPaths.manualReview}`),
        fetch(`${baseUrl}${publicApiEndpointPaths.quarantines}`),
        fetch(`${baseUrl}${publicApiEndpointPaths.recovery}`),
        fetch(`${baseUrl}${publicApiEndpointPaths.telemetryEvents}`),
        fetch(`${baseUrl}${publicApiEndpointPaths.telemetryMetrics}`),
      ]);

    assert.equal(manualReviewResponse.status, 200);
    assert.equal(quarantinesResponse.status, 200);
    assert.equal(recoveryResponse.status, 200);
    assert.equal(telemetryEventsResponse.status, 200);
    assert.equal(telemetryMetricsResponse.status, 200);

    const manualReviewJson = (await manualReviewResponse.json()) as Array<{ taskId: string; source: string }>;
    const quarantinesJson = (await quarantinesResponse.json()) as Array<{ taskId: string; manualReviewRequired: boolean }>;
    const recoveryJson = (await recoveryResponse.json()) as Array<{ cycleId: string; manualReviewTaskCount: number }>;
    const telemetryEventsJson = (await telemetryEventsResponse.json()) as Array<{ name: string; severity: string }>;
    const telemetryMetricsJson = (await telemetryMetricsResponse.json()) as Array<{ name: string; type: string }>;

    assert.equal(manualReviewJson[0]?.taskId, "task-release-ops-1");
    assert.equal(manualReviewJson[0]?.source, "recovery");
    assert.equal(quarantinesJson[0]?.taskId, "task-release-ops-1");
    assert.equal(quarantinesJson[0]?.manualReviewRequired, true);
    assert.equal(recoveryJson[0]?.cycleId, "cycle-recovery-1");
    assert.equal(recoveryJson[0]?.manualReviewTaskCount, 1);
    assert.equal(telemetryEventsJson[0]?.name, "release.ops.quarantine");
    assert.equal(telemetryEventsJson[0]?.severity, "warn");
    assert.equal(telemetryMetricsJson[0]?.name, "release_ops.quarantined_tasks");
    assert.equal(telemetryMetricsJson[0]?.type, "gauge");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api filters sandbox certification runs and exposes run detail by runId", async () => {
  const { goldensRoot, artifactsRoot } = await createSandboxCertificationFixture({ status: "passed" });
  const server = createPublicApiServer({
    snapshot: createOperationSnapshot(),
    sandboxCertification: {
      goldensRoot,
      artifactsRoot,
      persistedRuns: createPersistedSandboxCertificationRuns(),
    },
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const [runsResponse, detailResponse] = await Promise.all([
      fetch(
        `${baseUrl}${publicApiEndpointPaths.sandboxCertificationRuns}?profileName=ci-smoke&packId=football-dual-smoke&verificationKind=runtime-release&status=failed`,
      ),
      fetch(`${baseUrl}${publicApiEndpointPaths.sandboxCertificationRuns}/scr-runtime-1`),
    ]);

    assert.equal(runsResponse.status, 200);
    assert.equal(detailResponse.status, 200);

    const runsJson = (await runsResponse.json()) as Array<{ id: string; verificationKind: string; status: string }>;
    const detailJson = (await detailResponse.json()) as {
      id: string;
      packId: string;
      verificationKind: string;
      diffEntries: unknown[];
    };

    assert.equal(runsJson.length, 1);
    assert.equal(runsJson[0]?.id, "scr-runtime-1");
    assert.equal(runsJson[0]?.verificationKind, "runtime-release");
    assert.equal(detailJson.id, "scr-runtime-1");
    assert.equal(detailJson.packId, "football-dual-smoke");
    assert.equal(detailJson.verificationKind, "runtime-release");
    assert.equal(detailJson.diffEntries.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api filters telemetry events and metrics by query params", async () => {
  const snapshot = createReleaseOpsSnapshot();
  const server = createPublicApiServer({ snapshot });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const [eventsResponse, metricsResponse] = await Promise.all([
      fetch(
        `${baseUrl}${publicApiEndpointPaths.telemetryEvents}?taskId=task-release-ops-1&automationCycleId=cycle-recovery-1&severity=warn&name=release.ops.quarantine&from=2026-08-16T21:00:00.000Z&to=2026-08-16T21:11:00.000Z`,
      ),
      fetch(
        `${baseUrl}${publicApiEndpointPaths.telemetryMetrics}?taskId=task-release-ops-1&automationCycleId=cycle-recovery-1&name=release_ops.quarantined_tasks&from=2026-08-16T21:00:00.000Z&to=2026-08-16T21:13:00.000Z`,
      ),
    ]);

    assert.equal(eventsResponse.status, 200);
    assert.equal(metricsResponse.status, 200);

    const eventsJson = (await eventsResponse.json()) as Array<{ id: string; name: string }>;
    const metricsJson = (await metricsResponse.json()) as Array<{ id: string; name: string }>;

    assert.equal(eventsJson.length, 1);
    assert.equal(eventsJson[0]?.name, "release.ops.quarantine");
    assert.equal(metricsJson.length, 1);
    assert.equal(metricsJson[0]?.name, "release_ops.quarantined_tasks");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server accepts POST fixture ops actions when backed by a unit of work", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fx-server-action-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Xelajú",
    awayTeam: "Antigua",
    scheduledAt: "2026-04-22T03:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);
  await seedPublishableResearch(unitOfWork, fixture.id, "2026-04-22T00:10:00.000Z");

  const server = createPublicApiServer({ unitOfWork });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const manualSelectionResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "selected",
        selectedBy: "ops-user",
        reason: "TV game",
        occurredAt: "2026-04-22T00:20:00.000Z",
      }),
    });
    assert.equal(manualSelectionResponse.status, 200);
    assert.equal(
      ((await manualSelectionResponse.json()) as { manualSelectionStatus: string }).manualSelectionStatus,
      "selected",
    );

    const overrideResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/selection-override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "force-include",
        reason: "Operator pin",
        occurredAt: "2026-04-22T00:21:00.000Z",
      }),
    });
    assert.equal(overrideResponse.status, 200);
    assert.equal(
      ((await overrideResponse.json()) as { selectionOverride: string }).selectionOverride,
      "force-include",
    );

    const fixtureOpsResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/ops`);
    assert.equal(fixtureOpsResponse.status, 200);
    const fixtureOpsJson = (await fixtureOpsResponse.json()) as {
      workflow: { manualSelectionStatus: string; selectionOverride: string };
      scoringEligibility: { eligible: boolean; reason?: string };
    };
    assert.equal(fixtureOpsJson.workflow.manualSelectionStatus, "selected");
    assert.equal(fixtureOpsJson.workflow.selectionOverride, "force-include");
    assert.equal(fixtureOpsJson.scoringEligibility.eligible, true);

    const telemetryEvents = await unitOfWork.telemetryEvents.list();
    const metricSamples = await unitOfWork.metricSamples.list();
    assert.equal(
      telemetryEvents.some((event) => event.name === "public_api.manual-selection"),
      true,
    );
    assert.equal(
      telemetryEvents.some((event) => event.name === "public_api.selection-override"),
      true,
    );
    assert.equal(
      metricSamples.some((sample) => sample.name === "public_api.manual-selection.count"),
      true,
    );
    assert.equal(
      metricSamples.some((sample) => sample.name === "public_api.selection-override.count"),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server rejects fixture ops writes without workflow override capability", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fx-server-authz-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Municipal",
    awayTeam: "Comunicaciones",
    scheduledAt: "2026-04-22T05:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);
  const authentication = createPublicApiTokenAuthentication({
    viewerToken: "viewer-token",
    operatorToken: "operator-token",
  });
  const server = createPublicApiServer({
    unitOfWork,
    ...(authentication ? { auth: authentication } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const viewerResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection`, {
      method: "POST",
      headers: {
        authorization: "Bearer viewer-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "selected", selectedBy: "viewer" }),
    });
    assert.equal(viewerResponse.status, 403);

    const operatorResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection`, {
      method: "POST",
      headers: {
        authorization: "Bearer operator-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "selected", selectedBy: "operator" }),
    });
    assert.equal(operatorResponse.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server can quarantine running tasks and requeue them through queue actions", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queueAdapter = createInMemoryTaskQueueAdapter(unitOfWork);
  const task = createTask({
    id: "task-server-queue-1",
    kind: "research",
    status: "queued",
    priority: 74,
    payload: { fixtureId: "fx-server-queue-1" },
    scheduledFor: "2026-04-22T00:30:00.000Z",
    createdAt: "2026-04-22T00:30:00.000Z",
    updatedAt: "2026-04-22T00:30:00.000Z",
  });

  await unitOfWork.tasks.save(task);
  const claim = await queueAdapter.claim(task.id, new Date("2026-04-22T00:31:00.000Z"));
  assert.ok(claim);

  const server = createPublicApiServer({ unitOfWork });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const quarantineResponse = await fetch(`${baseUrl}/tasks/${task.id}/quarantine`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Manual operator stop",
        occurredAt: "2026-04-22T00:32:00.000Z",
      }),
    });
    assert.equal(quarantineResponse.status, 200);
    const quarantineJson = (await quarantineResponse.json()) as {
      task: { status: string };
      taskRun: { id: string; status: string; error?: string };
    };
    assert.equal(quarantineJson.task.status, "quarantined");
    assert.equal(quarantineJson.taskRun.id, claim.taskRun.id);
    assert.equal(quarantineJson.taskRun.status, "failed");
    assert.equal(quarantineJson.taskRun.error, "Manual operator stop");

    const requeueResponse = await fetch(`${baseUrl}/tasks/${task.id}/requeue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        occurredAt: "2026-04-22T00:33:00.000Z",
      }),
    });
    assert.equal(requeueResponse.status, 200);
    assert.equal(((await requeueResponse.json()) as { status: string }).status, "queued");

    const taskRunsResponse = await fetch(`${baseUrl}/tasks/${task.id}/runs`);
    assert.equal(taskRunsResponse.status, 200);
    const taskRunsJson = (await taskRunsResponse.json()) as Array<{ id: string; status: string; error?: string }>;
    assert.equal(taskRunsJson[0]?.id, claim.taskRun.id);
    assert.equal(taskRunsJson[0]?.status, "failed");

    const telemetryEvents = await unitOfWork.telemetryEvents.list();
    const metricSamples = await unitOfWork.metricSamples.list();
    assert.equal(
      telemetryEvents.some((event) => event.name === "public_api.task-quarantine"),
      true,
    );
    assert.equal(
      telemetryEvents.some((event) => event.name === "public_api.task-requeue"),
      true,
    );
    assert.equal(
      metricSamples.some((sample) => sample.name === "public_api.task-quarantine.count"),
      true,
    );
    assert.equal(
      metricSamples.some((sample) => sample.name === "public_api.task-requeue.count"),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server restricts queue actions to actors with queue operate capability", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await unitOfWork.tasks.save(
    createTask({
      id: "task-server-authz-queue-1",
      kind: "prediction",
      status: "failed",
      priority: 90,
      payload: { fixtureId: "fx-server-authz-queue-1" },
      attempts: [
        {
          startedAt: "2026-04-22T01:00:00.000Z",
          finishedAt: "2026-04-22T01:01:00.000Z",
          error: "provider timeout",
        },
      ],
      lastErrorMessage: "provider timeout",
      scheduledFor: "2026-04-22T01:00:00.000Z",
      createdAt: "2026-04-22T01:00:00.000Z",
      updatedAt: "2026-04-22T01:01:00.000Z",
    }),
  );

  const authentication = createPublicApiTokenAuthentication({
    viewerToken: "viewer-token",
    automationToken: "automation-token",
    operatorToken: "operator-token",
  });
  const server = createPublicApiServer({
    unitOfWork,
    ...(authentication ? { auth: authentication } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const automationResponse = await fetch(`${baseUrl}/tasks/task-server-authz-queue-1/requeue`, {
      method: "POST",
      headers: {
        authorization: "Bearer automation-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(automationResponse.status, 403);

    const operatorResponse = await fetch(`${baseUrl}/tasks/task-server-authz-queue-1/requeue`, {
      method: "POST",
      headers: {
        authorization: "Bearer operator-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(operatorResponse.status, 200);
    assert.equal(((await operatorResponse.json()) as { status: string }).status, "queued");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server can revert manual selection and selection override", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fx-server-reset-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Cobán",
    awayTeam: "Malacateco",
    scheduledAt: "2026-04-22T04:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);
  const server = createPublicApiServer({ unitOfWork });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "selected", selectedBy: "ops-user" }),
    });
    await fetch(`${baseUrl}/fixtures/${fixture.id}/selection-override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "force-exclude", reason: "pause" }),
    });

    const resetManualResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "clear manual state", occurredAt: "2026-04-22T00:40:00.000Z" }),
    });
    assert.equal(resetManualResponse.status, 200);

    const resetOverrideResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/selection-override/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "clear override", occurredAt: "2026-04-22T00:41:00.000Z" }),
    });
    assert.equal(resetOverrideResponse.status, 200);

    const fixtureOpsResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/ops`);
    const fixtureOpsJson = (await fixtureOpsResponse.json()) as {
      workflow: { manualSelectionStatus: string; selectionOverride: string };
      scoringEligibility: { eligible: boolean; reason?: string };
    };
    assert.equal(fixtureOpsJson.workflow.manualSelectionStatus, "none");
    assert.equal(fixtureOpsJson.workflow.selectionOverride, "none");
    assert.equal(fixtureOpsJson.scoringEligibility.eligible, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("loadOperationSnapshotFromUnitOfWork preserves persisted research read models and ai-run linkage", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const prefix = `public-api-linking-${Date.now()}`;
  const fixtureId = `${prefix}-fixture`;

  try {
    const fixture = createFixture({
      id: fixtureId,
      sport: "football",
      competition: "Serie A",
      homeTeam: "Inter",
      awayTeam: "Milan",
      scheduledAt: "2026-04-20T18:45:00.000Z",
      status: "scheduled",
      metadata: {
        providerFixtureId: `${prefix}-provider-fixture`,
      },
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
    });
    const task = createTask({
      id: `${prefix}-task`,
      kind: "prediction",
      status: "succeeded",
      priority: 50,
      payload: { fixtureId: fixture.id, source: "scoring-worker" },
      attempts: [{ startedAt: "2026-04-20T10:05:00.000Z", finishedAt: "2026-04-20T10:06:00.000Z" }],
      scheduledFor: "2026-04-20T10:05:00.000Z",
      createdAt: "2026-04-20T10:05:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
    });
    const taskRun = createTaskRun({
      id: `${prefix}-task-run`,
      taskId: task.id,
      attemptNumber: 7,
      status: "succeeded",
      startedAt: "2026-04-20T10:05:00.000Z",
      finishedAt: "2026-04-20T10:06:00.000Z",
      createdAt: "2026-04-20T10:05:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
    });
    const aiRun = createAiRun({
      id: `${prefix}-ai-run`,
      taskId: task.id,
      provider: "internal",
      model: "deterministic-moneyline-v1",
      promptVersion: "scoring-worker-v2",
      status: "completed",
      outputRef: `scoring-worker://${fixture.id}/2026-04-20T10:06:00.000Z`,
      createdAt: "2026-04-20T10:06:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
    });
    const prediction = createPrediction({
      id: `${prefix}-prediction`,
      fixtureId: fixture.id,
      aiRunId: aiRun.id,
      market: "moneyline",
      outcome: "away",
      confidence: 0.71,
      probabilities: { implied: 0.51, model: 0.57, edge: 0.06 },
      rationale: ["Research lean away", "Odds snapshot agrees"],
      status: "published",
      createdAt: "2026-04-20T10:06:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
      publishedAt: "2026-04-20T10:06:30.000Z",
    });
    const parlay = createParlay({
      id: `${prefix}-parlay`,
      status: "draft",
      stake: 1,
      source: "automatic",
      correlationScore: 0.11,
      expectedPayout: 2.4,
      legs: [
        {
          predictionId: prediction.id,
          fixtureId: fixture.id,
          market: prediction.market,
          outcome: prediction.outcome,
          price: 2.4,
          status: "pending",
        },
      ],
      createdAt: "2026-04-20T10:07:00.000Z",
      updatedAt: "2026-04-20T10:07:00.000Z",
    });
    const validation = createValidation({
      id: `${prefix}-validation`,
      targetType: "parlay",
      targetId: parlay.id,
      kind: "parlay-settlement",
      status: "passed",
      checks: [{ code: "trace", message: "trace ok", passed: true }],
      summary: "Validation passed",
      executedAt: "2026-04-20T10:08:00.000Z",
      createdAt: "2026-04-20T10:08:00.000Z",
      updatedAt: "2026-04-20T10:08:00.000Z",
    });

    await unitOfWork.fixtures.save(fixture);
    await unitOfWork.researchBundles.save(
      createResearchBundle({
        id: `${prefix}-bundle`,
        fixtureId: fixture.id,
        generatedAt: "2026-04-20T10:00:00.000Z",
        brief: {
          headline: "Research brief Inter vs Milan",
          context: "Serie A derby",
          questions: ["Who carries the edge?"],
          assumptions: ["Persisted for API test."],
        },
        summary: "Persisted research bundle leans away",
        recommendedLean: "away",
        directionalScore: { home: 0.21, draw: 0.19, away: 0.74 },
        risks: [],
        gateResult: {
          status: "publishable",
          reasons: [],
          gatedAt: "2026-04-20T10:00:00.000Z",
        },
        trace: {
          synthesisMode: "deterministic",
          aiRunId: aiRun.id,
        },
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:00:00.000Z",
      }),
    );
    await unitOfWork.featureSnapshots.save(
      createFeatureSnapshot({
        id: `${prefix}-feature`,
        fixtureId: fixture.id,
        bundleId: `${prefix}-bundle`,
        generatedAt: "2026-04-20T10:00:00.000Z",
        bundleStatus: "publishable",
        gateReasons: [],
        recommendedLean: "away",
        evidenceCount: 5,
        topEvidence: [
          {
            id: `${prefix}-evidence`,
            title: "Away side availability edge",
            direction: "away",
            weightedScore: 0.9,
          },
        ],
        risks: [],
        features: {
          researchScoreHome: 0.21,
          researchScoreDraw: 0.19,
          researchScoreAway: 0.74,
          formHome: 0.52,
          formAway: 0.66,
          restHomeDays: 4,
          restAwayDays: 5,
          injuriesHome: 2,
          injuriesAway: 0,
          derby: 1,
          hoursUntilKickoff: 8,
        },
        readiness: {
          status: "ready",
          reasons: [],
        },
        researchTrace: {
          synthesisMode: "deterministic",
          aiRunId: aiRun.id,
        },
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:00:00.000Z",
      }),
    );
    await unitOfWork.fixtureWorkflows.save(
      createFixtureWorkflow({
        fixtureId: fixture.id,
        ingestionStatus: "succeeded",
        oddsStatus: "succeeded",
        enrichmentStatus: "succeeded",
        candidateStatus: "succeeded",
        predictionStatus: "succeeded",
        parlayStatus: "pending",
        validationStatus: "pending",
        isCandidate: true,
        manualSelectionStatus: "selected",
        manualSelectionBy: "ops-user",
        selectionOverride: "force-include",
        diagnostics: { research: { lean: "away" } },
      }),
    );
    await unitOfWork.tasks.save(task);
    await unitOfWork.taskRuns.save(taskRun);
    await unitOfWork.aiRuns.save(aiRun);
    await unitOfWork.predictions.save(prediction);
    await unitOfWork.parlays.save(parlay);
    await unitOfWork.validations.save(validation);

    const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork);
    const loadedFixture = snapshot.fixtures.find((candidate) => candidate.id === fixture.id);
    const fixtureOpsDetail = routePublicApiRequest(createPublicApiHandlers(snapshot), `/fixtures/${fixture.id}/ops`).body as Record<string, any>;
    const aiRunDetail = findAiRunById(snapshot, aiRun.id);
    const predictionDetail = findPredictionById(snapshot, prediction.id);
    const parlayDetail = findParlayById(snapshot, parlay.id);

    assert.equal(loadedFixture?.metadata.researchRecommendedLean, undefined);
    assert.equal(loadedFixture?.metadata.featureReadinessStatus, undefined);
    assert.equal(snapshot.fixtureResearch[0]?.latestBundle.recommendedLean, "away");
    assert.equal(snapshot.fixtureResearch[0]?.latestSnapshot?.featureReadinessStatus, "ready");
    assert.equal(aiRunDetail?.linkedPredictions[0]?.id, prediction.id);
    assert.equal(aiRunDetail?.linkedParlays[0]?.id, parlay.id);
    assert.equal(predictionDetail?.linkedParlays[0]?.id, parlay.id);
    assert.equal(parlayDetail?.linkedAiRunIds[0], aiRun.id);
    assert.equal(fixtureOpsDetail.workflow.manualSelectionStatus, "selected");
    assert.equal(fixtureOpsDetail.workflow.selectionOverride, "force-include");
  } finally {
    await Promise.all([
      unitOfWork.validations.delete(`${prefix}-validation`),
      unitOfWork.parlays.delete(`${prefix}-parlay`),
      unitOfWork.predictions.delete(`${prefix}-prediction`),
      unitOfWork.aiRuns.delete(`${prefix}-ai-run`),
      unitOfWork.featureSnapshots.delete(`${prefix}-feature`),
      unitOfWork.researchBundles.delete(`${prefix}-bundle`),
      unitOfWork.taskRuns.delete(`${prefix}-task-run`),
      unitOfWork.tasks.delete(`${prefix}-task`),
      unitOfWork.fixtureWorkflows.delete(fixtureId),
      unitOfWork.fixtures.delete(fixtureId),
    ]);
  }
});
