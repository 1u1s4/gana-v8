import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createAiRun,
  createAuditEvent,
  createDailyAutomationPolicy,
  createFixture,
  createFixtureWorkflow,
  createLeagueCoveragePolicy,
  createOperationalMetricSample,
  createOperationalTelemetryEvent,
  createParlay,
  createPrediction,
  createResearchAssignment,
  createResearchBundle,
  createResearchClaim,
  createSandboxCertificationRun,
  createSandboxNamespace,
  createTask,
  createTaskRun,
  createTeamCoveragePolicy,
  createValidation,
} from "@gana-v8/domain-core";

import {
  PrismaTaskRepository,
  PrismaSandboxNamespaceRepository,
  aiRunDomainToCreateInput,
  aiRunRecordToDomain,
  assertSchemaReadiness,
  auditEventDomainToCreateInput,
  auditEventRecordToDomain,
  createInMemoryUnitOfWork,
  createPrismaUnitOfWork,
  fixtureDomainToCreateInput,
  fixtureRecordToDomain,
  operationalMetricSampleDomainToCreateInput,
  operationalMetricSampleRecordToDomain,
  operationalTelemetryEventDomainToCreateInput,
  operationalTelemetryEventRecordToDomain,
  parlayRecordToDomain,
  predictionDomainToCreateInput,
  predictionRecordToDomain,
  researchAssignmentDomainToCreateInput,
  researchAssignmentRecordToDomain,
  researchBundleDomainToCreateInput,
  researchBundleRecordToDomain,
  researchClaimDomainToCreateInput,
  researchClaimRecordToDomain,
  sandboxNamespaceDomainToCreateInput,
  sandboxNamespaceRecordToDomain,
  sandboxCertificationRunDomainToCreateInput,
  sandboxCertificationRunRecordToDomain,
  taskDomainToCreateInput,
  taskAttemptToTaskRunInput,
  taskRecordToDomain,
  taskRunDomainToCreateInput,
  taskRunRecordToDomain,
  validationDomainToCreateInput,
  validationRecordToDomain,
} from "../src/index.js";
import { runOpsHistoryRetention } from "../src/ops-history-retention.js";

test("in-memory repositories store and query core aggregates", async () => {
  const uow = createInMemoryUnitOfWork();

  const fixture = createFixture({
    id: "fx-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    scheduledAt: "2026-04-14T21:00:00.000Z",
    status: "scheduled",
    metadata: { source: "feed-a" },
  });

  const prediction = createPrediction({
    id: "pred-1",
    fixtureId: fixture.id,
    market: "moneyline",
    outcome: "home",
    status: "draft",
    confidence: 0.66,
    probabilities: { implied: 0.53, model: 0.66, edge: 0.13 },
    rationale: ["Home team projected xG advantage"],
  });

  const parlay = createParlay({
    id: "parlay-1",
    status: "ready",
    stake: 10,
    source: "automatic",
    legs: [
      {
        predictionId: prediction.id,
        fixtureId: fixture.id,
        market: "moneyline",
        outcome: "home",
        price: 1.9,
        status: "pending",
      },
    ],
    correlationScore: 0.08,
    expectedPayout: 19,
  });

  const validation = createValidation({
    id: "val-1",
    targetType: "parlay",
    targetId: parlay.id,
    kind: "parlay-settlement",
    status: "pending",
    checks: [],
    summary: "",
  });

  const auditEvent = createAuditEvent({
    id: "audit-1",
    aggregateType: "parlay",
    aggregateId: parlay.id,
    eventType: "parlay.created",
    actor: "tests",
    payload: { source: "storage-adapters.test" },
  });

  const taskRun = createTaskRun({
    id: "task-1:attempt:1",
    taskId: "task-1",
    attemptNumber: 1,
    status: "succeeded",
    startedAt: "2026-04-14T20:00:00.000Z",
    finishedAt: "2026-04-14T20:01:00.000Z",
  });

  const sandbox = createSandboxNamespace({
    id: "ns-1",
    environment: "sandbox",
    sandboxId: "sbx-100",
    scope: "smoke",
    storagePrefix: "sandbox://sbx-100",
    queuePrefix: "sbx-100-queue",
    metadata: { owner: "tests" },
  });

  const leaguePolicy = createLeagueCoveragePolicy({
    id: "lcp-epl-2026",
    provider: "api-football",
    leagueKey: "39",
    leagueName: "Premier League",
    season: 2026,
    enabled: true,
    alwaysOn: true,
    priority: 100,
    marketsAllowed: ["moneyline", "totals"],
  });

  const teamPolicy = createTeamCoveragePolicy({
    id: "tcp-liverpool",
    provider: "api-football",
    teamKey: "40",
    teamName: "Liverpool",
    enabled: true,
    alwaysTrack: true,
    priority: 95,
    followHome: true,
    followAway: true,
    forceResearch: true,
  });

  const dailyPolicy = createDailyAutomationPolicy({
    id: "dap-default",
    policyName: "default-football-daily",
    enabled: true,
    timezone: "America/Guatemala",
    minAllowedOdd: 1.2,
    defaultMaxFixturesPerRun: 30,
    defaultLookaheadHours: 24,
    defaultLookbackHours: 6,
    requireTrackedLeagueOrTeam: true,
    allowManualInclusionBypass: true,
  });

  await uow.fixtures.save(fixture);
  await uow.predictions.save(prediction);
  await uow.parlays.save(parlay);
  await uow.validations.save(validation);
  const workflow = createFixtureWorkflow({
    fixtureId: fixture.id,
    ingestionStatus: "succeeded",
    oddsStatus: "pending",
    enrichmentStatus: "pending",
    candidateStatus: "pending",
    predictionStatus: "pending",
    parlayStatus: "pending",
    validationStatus: "pending",
    isCandidate: false,
    lastIngestedAt: "2026-04-14T19:59:00.000Z",
    manualSelectionStatus: "selected",
    manualSelectionBy: "ops-user",
    manualSelectionReason: "Important televised match",
    manuallySelectedAt: "2026-04-14T20:02:00.000Z",
    selectionOverride: "force-include",
    overrideReason: "Pinned by operator",
    overriddenAt: "2026-04-14T20:03:00.000Z",
    diagnostics: {
      research: { lean: "home" },
      notes: ["derby", "premium-slate"],
    },
  });

  await uow.auditEvents.save(auditEvent);
  await uow.taskRuns.save(taskRun);
  await uow.sandboxNamespaces.save(sandbox);
  await uow.fixtureWorkflows.save(workflow);
  await uow.leagueCoveragePolicies.save(leaguePolicy);
  await uow.teamCoveragePolicies.save(teamPolicy);
  await uow.dailyAutomationPolicies.save(dailyPolicy);

  assert.equal(
    (await uow.fixtures.findByCompetition("Premier League")).length,
    1,
  );
  assert.equal((await uow.predictions.findByFixtureId(fixture.id)).length, 1);
  assert.equal((await uow.parlays.findByPredictionId(prediction.id)).length, 1);
  assert.equal((await uow.validations.findByTargetId(parlay.id)).length, 1);
  assert.equal((await uow.auditEvents.findByAggregate("parlay", parlay.id)).length, 1);
  assert.equal((await uow.taskRuns.findByTaskId(taskRun.taskId)).length, 1);
  assert.equal((await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.fixtureId, fixture.id);
  assert.equal(
    (await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.manualSelectionStatus,
    "selected",
  );
  assert.equal(
    (await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.selectionOverride,
    "force-include",
  );
  assert.deepEqual((await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.diagnostics, {
    research: { lean: "home" },
    notes: ["derby", "premium-slate"],
  });
  assert.equal((await uow.leagueCoveragePolicies.findEnabled()).length, 1);
  assert.equal((await uow.teamCoveragePolicies.findEnabled()).length, 1);
  assert.equal((await uow.dailyAutomationPolicies.findEnabled()).length, 1);
  assert.equal((await uow.dailyAutomationPolicies.getById(dailyPolicy.id))?.minAllowedOdd, 1.2);
  assert.equal(
    (await uow.sandboxNamespaces.findByEnvironment("sandbox")).length,
    1,
  );
});

test("release ops repositories persist certification history and telemetry queries", async () => {
  const uow = createInMemoryUnitOfWork();
  const syntheticRun = createSandboxCertificationRun({
    id: "cert-synth-1",
    verificationKind: "synthetic-integrity",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-1",
    status: "passed",
    promotionStatus: "promotable",
    runtimeSignals: { diffEntryCount: 0 },
    diffEntries: [],
    summary: { replayEventCount: 4 },
    generatedAt: "2026-04-22T10:00:00.000Z",
  });
  const runtimeRun = createSandboxCertificationRun({
    id: "cert-runtime-1",
    verificationKind: "runtime-release",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-2",
    status: "failed",
    promotionStatus: "blocked",
    runtimeSignals: { manualReviewTaskCount: 1 },
    diffEntries: [{ path: "$.runtimeSignals.manualReviewTaskCount", kind: "changed", expected: 0, actual: 1 }],
    summary: { releaseEvidence: "runtime" },
    generatedAt: "2026-04-22T10:05:00.000Z",
  });
  const telemetryEvent = createOperationalTelemetryEvent({
    id: "telemetry-1",
    kind: "log",
    name: "public-api.task.quarantine",
    severity: "warn",
    traceId: "trace-1",
    taskId: "task-1",
    sandboxCertificationRunId: runtimeRun.id,
    occurredAt: "2026-04-22T10:06:00.000Z",
    message: "Task quarantined during release review.",
    attributes: { actor: "operator-console" },
  });
  const metricSample = createOperationalMetricSample({
    id: "metric-1",
    name: "release.review.manual_review_tasks",
    type: "gauge",
    value: 1,
    taskId: "task-1",
    sandboxCertificationRunId: runtimeRun.id,
    labels: { profileName: "ci-smoke" },
    recordedAt: "2026-04-22T10:06:30.000Z",
  });

  await uow.sandboxCertificationRuns.save(syntheticRun);
  await uow.sandboxCertificationRuns.save(runtimeRun);
  await uow.telemetryEvents.save(telemetryEvent);
  await uow.metricSamples.save(metricSample);

  assert.equal((await uow.sandboxCertificationRuns.listByQuery({ profileName: "ci-smoke" })).length, 2);
  assert.equal(
    (await uow.sandboxCertificationRuns.findLatestByProfilePack("ci-smoke", "football-dual-smoke", "runtime-release"))
      ?.id,
    runtimeRun.id,
  );
  assert.equal((await uow.telemetryEvents.listByQuery({ traceId: "trace-1" }))[0]?.id, telemetryEvent.id);
  assert.equal(
    (await uow.metricSamples.listByQuery({ sandboxCertificationRunId: runtimeRun.id }))[0]?.id,
    metricSample.id,
  );
});

test("in-memory certification retention preserves the latest expired run per tuple", async () => {
  const uow = createInMemoryUnitOfWork();
  const cutoff = "2026-01-01T00:00:00.000Z";

  const oldestExpiredRun = createSandboxCertificationRun({
    id: "cert-oldest-expired",
    verificationKind: "synthetic-integrity",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-oldest",
    status: "passed",
    runtimeSignals: {},
    diffEntries: [],
    summary: {},
    generatedAt: "2025-10-01T00:00:00.000Z",
  });
  const latestExpiredRun = createSandboxCertificationRun({
    id: "cert-latest-expired",
    verificationKind: "synthetic-integrity",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-latest-expired",
    status: "passed",
    runtimeSignals: {},
    diffEntries: [],
    summary: {},
    generatedAt: "2025-12-15T00:00:00.000Z",
  });
  const expiredWithFreshSibling = createSandboxCertificationRun({
    id: "cert-expired-with-fresh-sibling",
    verificationKind: "runtime-release",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-runtime-old",
    status: "failed",
    runtimeSignals: {},
    diffEntries: [],
    summary: {},
    generatedAt: "2025-11-01T00:00:00.000Z",
  });
  const freshRun = createSandboxCertificationRun({
    id: "cert-fresh",
    verificationKind: "runtime-release",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-runtime-fresh",
    status: "passed",
    runtimeSignals: {},
    diffEntries: [],
    summary: {},
    generatedAt: "2026-02-01T00:00:00.000Z",
  });
  const onlyExpiredRun = createSandboxCertificationRun({
    id: "cert-only-expired",
    verificationKind: "synthetic-integrity",
    profileName: "staging-like",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-only-expired",
    status: "passed",
    runtimeSignals: {},
    diffEntries: [],
    summary: {},
    generatedAt: "2025-12-20T00:00:00.000Z",
  });

  await uow.sandboxCertificationRuns.save(oldestExpiredRun);
  await uow.sandboxCertificationRuns.save(latestExpiredRun);
  await uow.sandboxCertificationRuns.save(expiredWithFreshSibling);
  await uow.sandboxCertificationRuns.save(freshRun);
  await uow.sandboxCertificationRuns.save(onlyExpiredRun);

  const dryRun = await uow.sandboxCertificationRuns.pruneBefore({ cutoff, dryRun: true });
  assert.equal(dryRun.prunableCount, 2);
  assert.equal(dryRun.deletedCount, 0);
  assert.equal(dryRun.preservedLatestCount, 2);
  assert.equal((await uow.sandboxCertificationRuns.list()).length, 5);

  const applied = await uow.sandboxCertificationRuns.pruneBefore({ cutoff });
  assert.equal(applied.prunableCount, 2);
  assert.equal(applied.deletedCount, 2);
  assert.equal(applied.preservedLatestCount, 2);
  assert.deepEqual(
    (await uow.sandboxCertificationRuns.list()).map((item) => item.id).sort(),
    [latestExpiredRun.id, freshRun.id, onlyExpiredRun.id].sort(),
  );
});

test("ops history retention apply writes a report and records an audit event", async () => {
  const uow = createInMemoryUnitOfWork();
  const now = new Date("2026-04-22T12:00:00.000Z");
  const reportDirectory = mkdtempSync(path.join(os.tmpdir(), "ops-history-retention-"));

  try {
    const preservedOldRun = createSandboxCertificationRun({
      id: "cert-preserved-old",
      verificationKind: "synthetic-integrity",
      profileName: "ci-smoke",
      packId: "football-dual-smoke",
      mode: "smoke",
      gitSha: "sha-preserved",
      status: "passed",
      runtimeSignals: {},
      diffEntries: [],
      summary: {},
      generatedAt: "2025-12-15T00:00:00.000Z",
    });
    const prunableOldRun = createSandboxCertificationRun({
      id: "cert-prunable-old",
      verificationKind: "runtime-release",
      profileName: "ci-smoke",
      packId: "football-dual-smoke",
      mode: "smoke",
      gitSha: "sha-prunable",
      status: "failed",
      runtimeSignals: {},
      diffEntries: [],
      summary: {},
      generatedAt: "2025-12-01T00:00:00.000Z",
    });
    const freshRun = createSandboxCertificationRun({
      id: "cert-fresh-apply",
      verificationKind: "runtime-release",
      profileName: "ci-smoke",
      packId: "football-dual-smoke",
      mode: "smoke",
      gitSha: "sha-fresh",
      status: "passed",
      runtimeSignals: {},
      diffEntries: [],
      summary: {},
      generatedAt: "2026-04-01T00:00:00.000Z",
    });
    const oldTelemetryEvent = createOperationalTelemetryEvent({
      id: "telemetry-old",
      kind: "log",
      name: "runtime.old",
      severity: "warn",
      occurredAt: "2025-12-20T00:00:00.000Z",
      message: "Old telemetry should be pruned.",
      attributes: {},
    });
    const freshTelemetryEvent = createOperationalTelemetryEvent({
      id: "telemetry-fresh",
      kind: "log",
      name: "runtime.fresh",
      severity: "info",
      occurredAt: "2026-04-20T00:00:00.000Z",
      message: "Fresh telemetry should remain.",
      attributes: {},
    });
    const oldMetricSample = createOperationalMetricSample({
      id: "metric-old",
      name: "runtime.old.count",
      type: "counter",
      value: 1,
      labels: {},
      recordedAt: "2025-12-21T00:00:00.000Z",
    });

    await uow.sandboxCertificationRuns.save(preservedOldRun);
    await uow.sandboxCertificationRuns.save(prunableOldRun);
    await uow.sandboxCertificationRuns.save(freshRun);
    await uow.telemetryEvents.save(oldTelemetryEvent);
    await uow.telemetryEvents.save(freshTelemetryEvent);
    await uow.metricSamples.save(oldMetricSample);

    const report = await runOpsHistoryRetention({
      unitOfWork: uow,
      mode: "apply",
      now,
      reportDirectory,
      auditEventIdFactory: () => "audit:ops-history-retention:test",
    });

    assert.equal(report.cutoff, "2026-01-22T12:00:00.000Z");
    assert.equal(report.sandboxCertificationRuns.prunableCount, 1);
    assert.equal(report.sandboxCertificationRuns.deletedCount, 1);
    assert.equal(report.sandboxCertificationRuns.preservedLatestCount, 1);
    assert.equal(report.telemetryEvents.deletedCount, 1);
    assert.equal(report.metricSamples.deletedCount, 1);
    assert.equal(report.totals.deletedCount, 3);
    assert.equal(report.auditEventId, "audit:ops-history-retention:test");
    assert.equal(path.dirname(report.reportPath ?? ""), reportDirectory);

    assert.deepEqual(
      (await uow.sandboxCertificationRuns.list()).map((item) => item.id).sort(),
      [preservedOldRun.id, freshRun.id].sort(),
    );
    assert.deepEqual(
      (await uow.telemetryEvents.list()).map((item) => item.id),
      [freshTelemetryEvent.id],
    );
    assert.deepEqual((await uow.metricSamples.list()).map((item) => item.id), []);

    const [auditEvent] = await uow.auditEvents.list();
    assert.equal(auditEvent?.id, "audit:ops-history-retention:test");
    assert.deepEqual(auditEvent?.payload.deletedCounts, {
      sandboxCertificationRuns: 1,
      telemetryEvents: 1,
      metricSamples: 1,
    });
    assert.equal(auditEvent?.payload.cutoff, report.cutoff);

    const persistedReport = JSON.parse(readFileSync(report.reportPath ?? "", "utf8"));
    assert.equal(persistedReport.auditEventId, "audit:ops-history-retention:test");
    assert.equal(persistedReport.totals.deletedCount, 3);
    assert.equal(persistedReport.cutoff, report.cutoff);
  } finally {
    rmSync(reportDirectory, { recursive: true, force: true });
  }
});

test("taskAttemptToTaskRunInput emits opaque trn task run ids", () => {
  const taskRun = taskAttemptToTaskRunInput(
    "tsk_1234567890abcdef",
    {
      startedAt: "2026-04-20T13:55:00.000Z",
      finishedAt: "2026-04-20T13:56:00.000Z",
    },
    1,
  );

  assert.match(taskRun.id, /^trn_[a-f0-9]{16}$/);
  assert.equal(taskRun.attemptNumber, 1);
});

test("prisma mappers preserve ai-run metadata roundtrip shape", () => {
  const aiRun = createAiRun({
    id: "ai-run-1",
    taskId: "task-1",
    provider: "codex",
    model: "gpt-5.4",
    promptVersion: "v8-slice-3",
    status: "failed",
    providerRequestId: "req-ai-1",
    usage: {
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    },
    outputRef: "s3://bucket/run.json",
    error: "provider timeout",
    fallbackReason: "provider timeout",
    degraded: true,
    createdAt: "2026-04-18T00:00:00.000Z",
    updatedAt: "2026-04-18T00:01:00.000Z",
  });

  const prismaInput = aiRunDomainToCreateInput(aiRun);
  const roundTrip = aiRunRecordToDomain({
    ...prismaInput,
    providerRequestId: prismaInput.providerRequestId ?? null,
    usagePromptTokens: prismaInput.usagePromptTokens ?? null,
    usageCompletionTokens: prismaInput.usageCompletionTokens ?? null,
    usageTotalTokens: prismaInput.usageTotalTokens ?? null,
    outputRef: prismaInput.outputRef ?? null,
    error: prismaInput.error ?? null,
    fallbackReason: prismaInput.fallbackReason ?? null,
    degraded: prismaInput.degraded ?? null,
    createdAt: new Date(aiRun.createdAt),
    updatedAt: new Date(aiRun.updatedAt),
  });

  assert.equal(roundTrip.providerRequestId, "req-ai-1");
  assert.equal(roundTrip.fallbackReason, "provider timeout");
  assert.equal(roundTrip.degraded, true);
  assert.deepEqual(roundTrip.usage, aiRun.usage);
});

test("prisma mappers preserve release ops durability roundtrip shape", () => {
  const certificationRun = createSandboxCertificationRun({
    id: "cert-run-1",
    verificationKind: "runtime-release",
    profileName: "ci-smoke",
    packId: "football-dual-smoke",
    mode: "smoke",
    gitSha: "sha-22",
    baselineRef: "main",
    candidateRef: "codex/release-ops-integration",
    status: "failed",
    promotionStatus: "review-required",
    goldenFingerprint: "golden-22",
    evidenceFingerprint: "evidence-22",
    artifactRef: "db://sandbox-certification/cert-run-1",
    runtimeSignals: { taskCount: 5 },
    diffEntries: [{ path: "$.taskCounts.quarantined", kind: "changed", expected: 0, actual: 1 }],
    summary: { promotion: { status: "review-required" } },
    generatedAt: "2026-04-22T12:00:00.000Z",
    createdAt: "2026-04-22T12:00:00.000Z",
    updatedAt: "2026-04-22T12:01:00.000Z",
  });
  const telemetryEvent = createOperationalTelemetryEvent({
    id: "telemetry-ops-1",
    kind: "span",
    name: "sandbox.runtime-release",
    severity: "info",
    traceId: "trace-ops-1",
    correlationId: "corr-ops-1",
    taskId: "task-1",
    taskRunId: "task-1:attempt:1",
    automationCycleId: "cycle-1",
    sandboxCertificationRunId: certificationRun.id,
    occurredAt: "2026-04-22T12:02:00.000Z",
    finishedAt: "2026-04-22T12:03:00.000Z",
    durationMs: 60000,
    message: "Runtime release certification executed",
    attributes: { profileName: "ci-smoke" },
    createdAt: "2026-04-22T12:02:00.000Z",
    updatedAt: "2026-04-22T12:03:00.000Z",
  });
  const metricSample = createOperationalMetricSample({
    id: "metric-ops-1",
    name: "sandbox.certification.diff_entries",
    type: "gauge",
    value: 1,
    labels: { profileName: "ci-smoke" },
    traceId: "trace-ops-1",
    sandboxCertificationRunId: certificationRun.id,
    recordedAt: "2026-04-22T12:03:00.000Z",
    createdAt: "2026-04-22T12:03:00.000Z",
    updatedAt: "2026-04-22T12:03:00.000Z",
  });

  const certificationInput = sandboxCertificationRunDomainToCreateInput(certificationRun);
  const certificationRoundTrip = sandboxCertificationRunRecordToDomain({
    ...certificationInput,
    baselineRef: certificationInput.baselineRef ?? null,
    candidateRef: certificationInput.candidateRef ?? null,
    promotionStatus: certificationInput.promotionStatus ?? null,
    goldenFingerprint: certificationInput.goldenFingerprint ?? null,
    evidenceFingerprint: certificationInput.evidenceFingerprint ?? null,
    artifactRef: certificationInput.artifactRef ?? null,
    generatedAt: new Date(certificationRun.generatedAt),
    createdAt: new Date(certificationRun.createdAt),
    updatedAt: new Date(certificationRun.updatedAt),
  } as never);
  const telemetryInput = operationalTelemetryEventDomainToCreateInput(telemetryEvent);
  const telemetryRoundTrip = operationalTelemetryEventRecordToDomain({
    ...telemetryInput,
    traceId: telemetryInput.traceId ?? null,
    correlationId: telemetryInput.correlationId ?? null,
    taskId: telemetryInput.taskId ?? null,
    taskRunId: telemetryInput.taskRunId ?? null,
    automationCycleId: telemetryInput.automationCycleId ?? null,
    sandboxCertificationRunId: telemetryInput.sandboxCertificationRunId ?? null,
    finishedAt: telemetryInput.finishedAt ?? null,
    durationMs: telemetryInput.durationMs ?? null,
    message: telemetryInput.message ?? null,
    occurredAt: new Date(telemetryEvent.occurredAt),
    createdAt: new Date(telemetryEvent.createdAt),
    updatedAt: new Date(telemetryEvent.updatedAt),
  } as never);
  const metricInput = operationalMetricSampleDomainToCreateInput(metricSample);
  const metricRoundTrip = operationalMetricSampleRecordToDomain({
    ...metricInput,
    traceId: metricInput.traceId ?? null,
    correlationId: metricInput.correlationId ?? null,
    taskId: metricInput.taskId ?? null,
    taskRunId: metricInput.taskRunId ?? null,
    automationCycleId: metricInput.automationCycleId ?? null,
    sandboxCertificationRunId: metricInput.sandboxCertificationRunId ?? null,
    recordedAt: new Date(metricSample.recordedAt),
    createdAt: new Date(metricSample.createdAt),
    updatedAt: new Date(metricSample.updatedAt),
  } as never);

  assert.equal(certificationRoundTrip.verificationKind, "runtime-release");
  assert.equal(certificationRoundTrip.promotionStatus, "review-required");
  assert.equal(telemetryRoundTrip.sandboxCertificationRunId, certificationRun.id);
  assert.equal(metricRoundTrip.labels.profileName, "ci-smoke");
});

test("prisma mappers preserve research bundle, claim, and assignment roundtrip shape", () => {
  const bundle = createResearchBundle({
    id: "bundle-1",
    fixtureId: "fixture:api-football:123",
    generatedAt: "2026-04-21T12:00:00.000Z",
    brief: {
      headline: "Fixture research bundle",
      context: "Research context",
      questions: ["Who is unavailable?"],
      assumptions: ["No late weather shift"],
    },
    summary: "Bundle ready for publishing.",
    recommendedLean: "home",
    directionalScore: {
      home: 0.62,
      away: 0.23,
      draw: 0.15,
    },
    risks: ["Lineup confirmation still pending."],
    gateResult: {
      status: "degraded",
      reasons: [
        {
          code: "freshness",
          severity: "warn",
          message: "Availability source is nearing freshness SLA.",
        },
      ],
      gatedAt: "2026-04-21T12:15:00.000Z",
    },
    trace: {
      synthesisMode: "deterministic",
      plannerVersion: "research-bundle-v1",
    },
    aiRunId: "airun-1",
    createdAt: "2026-04-21T12:00:00.000Z",
    updatedAt: "2026-04-21T12:15:00.000Z",
  });
  const claim = createResearchClaim({
    id: "claim-1",
    fixtureId: bundle.fixtureId,
    bundleId: bundle.id,
    kind: "availability",
    title: "Key striker doubtful",
    summary: "Primary forward is doubtful with a hamstring issue.",
    direction: "away",
    confidence: 0.71,
    impact: 0.44,
    significance: "critical",
    status: "corroborated",
    corroborationStatus: "corroborated",
    requiredSourceCount: 2,
    matchedSourceIds: ["source-1", "source-3"],
    freshnessWindowHours: 6,
    extractedAt: "2026-04-21T11:45:00.000Z",
    freshnessExpiresAt: "2026-04-21T17:45:00.000Z",
    metadata: {
      signalFamily: "availability",
      predicate: "player_status",
    },
    createdAt: "2026-04-21T11:45:00.000Z",
    updatedAt: "2026-04-21T11:45:00.000Z",
  });
  const assignment = createResearchAssignment({
    id: "assignment-1",
    fixtureId: bundle.fixtureId,
    bundleId: bundle.id,
    dimension: "availability",
    status: "completed",
    attemptNumber: 1,
    startedAt: "2026-04-21T11:30:00.000Z",
    finishedAt: "2026-04-21T11:40:00.000Z",
    summary: "Availability sweep completed with corroborated sources.",
    metadata: {
      sourceIds: ["source-1", "source-3"],
    },
    createdAt: "2026-04-21T11:30:00.000Z",
    updatedAt: "2026-04-21T11:40:00.000Z",
  });

  const bundleInput = researchBundleDomainToCreateInput(bundle);
  const bundleRoundTrip = researchBundleRecordToDomain({
    ...bundleInput,
    trace: bundleInput.trace ?? null,
    generatedAt: new Date(bundle.generatedAt),
    gatedAt: new Date(bundle.gateResult.gatedAt),
    createdAt: new Date(bundle.createdAt),
    updatedAt: new Date(bundle.updatedAt),
  } as never);
  const claimInput = researchClaimDomainToCreateInput(claim);
  const claimRoundTrip = researchClaimRecordToDomain({
    ...claimInput,
    assignmentId: claimInput.assignmentId ?? null,
    freshnessExpiresAt: claimInput.freshnessExpiresAt ?? null,
    createdAt: new Date(claim.createdAt),
    updatedAt: new Date(claim.updatedAt),
    extractedAt: new Date(claim.extractedAt),
  } as never);
  const assignmentInput = researchAssignmentDomainToCreateInput(assignment);
  const assignmentRoundTrip = researchAssignmentRecordToDomain({
    ...assignmentInput,
    bundleId: assignmentInput.bundleId ?? null,
    startedAt: assignmentInput.startedAt ?? null,
    finishedAt: assignmentInput.finishedAt ?? null,
    error: assignmentInput.error ?? null,
    summary: assignmentInput.summary ?? null,
    createdAt: new Date(assignment.createdAt),
    updatedAt: new Date(assignment.updatedAt),
  } as never);

  assert.equal(bundleRoundTrip.gateResult.gatedAt, "2026-04-21T12:15:00.000Z");
  assert.deepEqual(claimRoundTrip.matchedSourceIds, ["source-1", "source-3"]);
  assert.equal(assignmentRoundTrip.summary, "Availability sweep completed with corroborated sources.");
});

test("prisma mappers preserve long task, task-run, ai-run and validation errors without truncation", () => {
  const longError = "provider timeout :: " + "x".repeat(1200);
  const longSummary = "validation summary :: " + "y".repeat(1200);

  const task = createTask({
    id: "task-long-error",
    kind: "odds-ingestion",
    status: "failed",
    priority: 80,
    manifestId: "manifest:bundle:1492226",
    workflowId: "workflow:odds-ingestion",
    traceId: "trace:task-long-error",
    correlationId: "correlation:task-long-error",
    source: "scheduler",
    payload: {
      fixtureId: "fixture:api-football:1492226",
      manifestId: "manifest:bundle:1492226",
      workflowId: "workflow:odds-ingestion",
      traceId: "trace:task-long-error",
      correlationId: "correlation:task-long-error",
      source: "scheduler",
    },
    lastErrorMessage: longError,
    leaseOwner: "dispatcher:test",
    leaseExpiresAt: "2026-04-19T18:06:00.000Z",
    claimedAt: "2026-04-19T18:00:00.000Z",
    lastHeartbeatAt: "2026-04-19T18:01:00.000Z",
    activeTaskRunId: "task-long-error:attempt:1",
    createdAt: "2026-04-19T18:00:00.000Z",
    updatedAt: "2026-04-19T18:01:00.000Z",
  });
  const taskRun = createTaskRun({
    id: "task-long-error:attempt:1",
    taskId: task.id,
    attemptNumber: 1,
    status: "failed",
    startedAt: "2026-04-19T18:00:00.000Z",
    finishedAt: "2026-04-19T18:01:00.000Z",
    error: longError,
    result: { message: longError },
  });
  const aiRun = createAiRun({
    id: "ai-long-error",
    taskId: task.id,
    provider: "codex",
    model: "gpt-5.4",
    promptVersion: "v8-phase-0",
    status: "failed",
    error: longError,
    fallbackReason: longError,
    createdAt: "2026-04-19T18:00:00.000Z",
    updatedAt: "2026-04-19T18:01:00.000Z",
  });
  const validation = createValidation({
    id: "validation-long-summary",
    targetType: "task",
    targetId: task.id,
    kind: "sandbox-regression",
    status: "failed",
    checks: [{ code: "task-error", message: longError, passed: false }],
    summary: longSummary,
    executedAt: "2026-04-19T18:02:00.000Z",
    createdAt: "2026-04-19T18:02:00.000Z",
    updatedAt: "2026-04-19T18:02:00.000Z",
  });

  const taskInput = taskDomainToCreateInput(task);
  const taskRoundTrip = taskRecordToDomain({
    ...taskInput,
    payload: task.payload,
    lastErrorMessage: taskInput.lastErrorMessage ?? null,
    taskRuns: [],
  } as never);
  const taskRunInput = taskRunDomainToCreateInput(taskRun);
  const taskRunRoundTrip = taskRunRecordToDomain({
    ...taskRunInput,
    error: taskRunInput.error ?? null,
    result: taskRunInput.result ?? null,
  } as never);
  const aiRunInput = aiRunDomainToCreateInput(aiRun);
  const aiRunRoundTrip = aiRunRecordToDomain({
    ...aiRunInput,
    providerRequestId: aiRunInput.providerRequestId ?? null,
    usagePromptTokens: aiRunInput.usagePromptTokens ?? null,
    usageCompletionTokens: aiRunInput.usageCompletionTokens ?? null,
    usageTotalTokens: aiRunInput.usageTotalTokens ?? null,
    outputRef: aiRunInput.outputRef ?? null,
    error: aiRunInput.error ?? null,
    fallbackReason: aiRunInput.fallbackReason ?? null,
    degraded: aiRunInput.degraded ?? null,
  } as never);
  const validationInput = validationDomainToCreateInput(validation);
  const validationRoundTrip = validationRecordToDomain({
    ...validationInput,
    checks: validation.checks,
    summary: validationInput.summary,
  } as never);

  assert.equal(taskRoundTrip.lastErrorMessage, longError);
  assert.equal(taskRoundTrip.manifestId, "manifest:bundle:1492226");
  assert.equal(taskRoundTrip.workflowId, "workflow:odds-ingestion");
  assert.equal(taskRoundTrip.traceId, "trace:task-long-error");
  assert.equal(taskRoundTrip.correlationId, "correlation:task-long-error");
  assert.equal(taskRoundTrip.source, "scheduler");
  assert.equal(taskRoundTrip.leaseOwner, "dispatcher:test");
  assert.equal(taskRoundTrip.leaseExpiresAt, "2026-04-19T18:06:00.000Z");
  assert.equal(taskRoundTrip.claimedAt, "2026-04-19T18:00:00.000Z");
  assert.equal(taskRoundTrip.lastHeartbeatAt, "2026-04-19T18:01:00.000Z");
  assert.equal(taskRoundTrip.activeTaskRunId, "task-long-error:attempt:1");
  assert.equal(taskRunRoundTrip.error, longError);
  assert.equal(aiRunRoundTrip.error, longError);
  assert.equal(aiRunRoundTrip.fallbackReason, longError);
  assert.equal(validationRoundTrip.summary, longSummary);
});

test("prisma mappers preserve domain roundtrip shape for core persisted entities", () => {
  const fixture = createFixture({
    id: "fx-2",
    sport: "football",
    competition: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    scheduledAt: "2026-04-20T19:00:00.000Z",
    status: "completed",
    score: { home: 2, away: 1 },
    metadata: { source: "feed-b" },
    createdAt: "2026-04-20T18:00:00.000Z",
    updatedAt: "2026-04-20T21:00:00.000Z",
  });
  const prediction = createPrediction({
    id: "pred-2",
    fixtureId: fixture.id,
    aiRunId: "airun-1",
    market: "moneyline",
    outcome: "home",
    status: "published",
    confidence: 0.61,
    probabilities: { implied: 0.49, model: 0.61, edge: 0.12 },
    rationale: ["Expected midfield edge"],
    publishedAt: "2026-04-20T18:30:00.000Z",
    createdAt: "2026-04-20T18:10:00.000Z",
    updatedAt: "2026-04-20T18:30:00.000Z",
  });
  const validation = createValidation({
    id: "val-2",
    targetType: "prediction",
    targetId: prediction.id,
    kind: "prediction-settlement",
    status: "passed",
    checks: [{ code: "market-known", message: "known", passed: true }],
    summary: "ok",
    executedAt: "2026-04-20T22:00:00.000Z",
    createdAt: "2026-04-20T21:55:00.000Z",
    updatedAt: "2026-04-20T22:00:00.000Z",
  });
  const auditEvent = createAuditEvent({
    id: "audit-2",
    aggregateType: "prediction",
    aggregateId: prediction.id,
    eventType: "prediction.published",
    payload: { rationaleCount: 1 },
    occurredAt: "2026-04-20T18:30:00.000Z",
    createdAt: "2026-04-20T18:30:00.000Z",
    updatedAt: "2026-04-20T18:30:00.000Z",
  });

  const fixtureInput = fixtureDomainToCreateInput(fixture);
  const predictionInput = predictionDomainToCreateInput(prediction);
  const validationInput = validationDomainToCreateInput(validation);
  const auditEventInput = auditEventDomainToCreateInput(auditEvent);
  const sandbox = createSandboxNamespace({
    id: "ns-2",
    environment: "sandbox",
    sandboxId: "sbx-200",
    scope: "regression",
    storagePrefix: "sandbox://sbx-200",
    queuePrefix: "sbx-200-queue",
    metadata: { owner: "tests" },
    createdAt: "2026-04-20T18:00:00.000Z",
    updatedAt: "2026-04-20T18:05:00.000Z",
  });
  const sandboxInput = sandboxNamespaceDomainToCreateInput(sandbox);

  assert.equal(new Date(fixtureInput.scheduledAt).toISOString(), fixture.scheduledAt);
  assert.equal(
    predictionInput.publishedAt
      ? new Date(predictionInput.publishedAt).toISOString()
      : undefined,
    prediction.publishedAt,
  );
  assert.equal(validationInput.targetType, "prediction");
  assert.equal(new Date(auditEventInput.occurredAt).toISOString(), auditEvent.occurredAt);
  assert.equal(sandboxInput.environment, "sandbox");

  assert.deepEqual(
    fixtureRecordToDomain({
      ...fixtureInput,
      metadata: fixture.metadata,
      scoreHome: 2,
      scoreAway: 1,
    } as never),
    fixture,
  );
  assert.deepEqual(
    predictionRecordToDomain({
      ...predictionInput,
      probabilities: prediction.probabilities,
      rationale: prediction.rationale,
    } as never),
    prediction,
  );
  assert.deepEqual(
    validationRecordToDomain({
      ...validationInput,
      checks: validation.checks,
    } as never),
    validation,
  );
  assert.deepEqual(
    auditEventRecordToDomain({
      ...auditEventInput,
      payload: auditEvent.payload,
    } as never),
    auditEvent,
  );
  assert.deepEqual(
    sandboxNamespaceRecordToDomain({
      ...sandboxInput,
      metadata: sandbox.metadata,
    } as never),
    sandbox,
  );

  const parlay = parlayRecordToDomain({
    id: "parlay-2",
    status: "submitted",
    stake: 5,
    source: "manual",
    correlationScore: 0.03,
    expectedPayout: 15,
    submittedAt: new Date("2026-04-20T18:45:00.000Z"),
    settledAt: null,
    createdAt: new Date("2026-04-20T18:40:00.000Z"),
    updatedAt: new Date("2026-04-20T18:45:00.000Z"),
    legs: [
      {
        id: "parlay-2:leg:0",
        parlayId: "parlay-2",
        predictionId: prediction.id,
        fixtureId: fixture.id,
        index: 0,
        market: "moneyline",
        outcome: "home",
        price: 2,
        status: "pending",
      },
    ],
  } as never);
  assert.equal(parlay.legs.length, 1);
  assert.equal(parlay.legs[0]?.predictionId, prediction.id);
});

test("prisma task repository rehydrates attempts from taskRuns", async () => {
  const taskStore = new Map<string, Record<string, unknown>>();

  const taskDelegate = {
    upsert: async ({ where, create, update }: Record<string, any>) => {
      const next = taskStore.has(where.id) ? update : create;
      const taskRunsCreate = next.taskRuns?.create ?? [];
      const record = {
        ...next,
        taskRuns: taskRunsCreate.map((taskRun: Record<string, any>) => ({
          ...taskRun,
          taskId: where.id,
        })),
      };
      taskStore.set(where.id, record);
      return record;
    },
    findUnique: async ({ where }: Record<string, any>) => taskStore.get(where.id) ?? null,
    findMany: async () => Array.from(taskStore.values()),
    delete: async ({ where }: Record<string, any>) => {
      taskStore.delete(where.id);
    },
  };

  const repository = new PrismaTaskRepository({ task: taskDelegate } as never);
  const task = createTask({
    id: "task-2",
    kind: "prediction",
    status: "succeeded",
    triggerKind: "system",
    priority: 7,
    manifestId: "manifest:fx-99",
    workflowId: "workflow:prediction",
    traceId: "trace:prediction:fx-99",
    correlationId: "correlation:fx-99",
    source: "scheduler",
    payload: {
      fixtureId: "fx-99",
      manifestId: "manifest:fx-99",
      workflowId: "workflow:prediction",
      traceId: "trace:prediction:fx-99",
      correlationId: "correlation:fx-99",
      source: "scheduler",
    },
    maxAttempts: 3,
    attempts: [
      {
        startedAt: "2026-04-20T10:00:00.000Z",
        finishedAt: "2026-04-20T10:02:00.000Z",
      },
    ],
    claimedAt: "2026-04-20T10:00:00.000Z",
    lastHeartbeatAt: "2026-04-20T10:02:00.000Z",
    createdAt: "2026-04-20T09:59:00.000Z",
    updatedAt: "2026-04-20T10:02:00.000Z",
  });

  const saved = await repository.save(task);
  const loaded = await repository.getById(task.id);

  assert.deepEqual(saved, task);
  assert.deepEqual(loaded, task);
  assert.deepEqual(taskRecordToDomain(taskStore.get(task.id) as never), task);
});

test("prisma sandbox namespace repository persists and queries environments", async () => {
  const sandboxStore = new Map<string, Record<string, unknown>>();

  const sandboxNamespaceDelegate = {
    upsert: async ({ where, create, update }: Record<string, any>) => {
      const next = sandboxStore.has(where.id) ? update : create;
      const record = { ...next };
      sandboxStore.set(where.id, record);
      return record;
    },
    findUnique: async ({ where }: Record<string, any>) => sandboxStore.get(where.id) ?? null,
    findMany: async ({ where }: Record<string, any> = {}) =>
      Array.from(sandboxStore.values()).filter((record) =>
        where?.environment ? record.environment === where.environment : true,
      ),
    delete: async ({ where }: Record<string, any>) => {
      sandboxStore.delete(where.id);
    },
  };

  const repository = new PrismaSandboxNamespaceRepository({
    sandboxNamespace: sandboxNamespaceDelegate,
  } as never);
  const sandbox = createSandboxNamespace({
    id: "ns-3",
    environment: "sandbox",
    sandboxId: "sbx-300",
    scope: "smoke",
    storagePrefix: "sandbox://sbx-300",
    queuePrefix: "sbx-300-queue",
    metadata: { owner: "tests" },
    createdAt: "2026-04-20T12:00:00.000Z",
    updatedAt: "2026-04-20T12:05:00.000Z",
  });

  const saved = await repository.save(sandbox);
  const loaded = await repository.getById(sandbox.id);
  const filtered = await repository.findByEnvironment("sandbox");

  assert.deepEqual(saved, sandbox);
  assert.deepEqual(loaded, sandbox);
  assert.deepEqual(filtered, [sandbox]);
});

test("prisma unit of work now exposes sandbox namespace persistence", () => {
  const client = {
    fixture: {},
    task: {},
    taskRun: {},
    aiRun: {},
    prediction: {},
    parlay: {},
    parlayLeg: {},
    validation: {},
    auditEvent: {},
    sandboxNamespace: {},
  };

  const uow = createPrismaUnitOfWork(client as never);
  assert.ok(uow.sandboxNamespaces);
});

test("root prisma schema validates and generates client without a live database", () => {
  const rootDir = new URL("../../..", import.meta.url);
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ?? "mysql://hermes:hermes@127.0.0.1:3306/gana_v8_schema_validation",
  };

  execFileSync("pnpm", ["db:validate"], { cwd: rootDir, env });
  execFileSync("pnpm", ["db:generate"], { cwd: rootDir, env });
});

test("root prisma schema stores operational errors and summaries in text columns", () => {
  const schema = execFileSync(
    "node",
    [
      "-e",
      "const fs=require('fs');process.stdout.write(fs.readFileSync(process.argv[1],'utf8'))",
      new URL("../../../../prisma/schema.prisma", import.meta.url).pathname,
    ],
  ).toString();

  assert.match(schema, /lastErrorMessage\s+String\?\s+@db\.Text/);
  assert.match(schema, /error\s+String\?\s+@db\.Text/);
  assert.match(schema, /summary\s+String\s+@db\.Text/);
});

test("assertSchemaReadiness surfaces actionable guidance when migrations are pending", () => {
  assert.throws(
    () =>
      assertSchemaReadiness({
        execFileSyncImpl: () => {
          const error = new Error("migrate status failed") as Error & {
            stdout?: Buffer;
            stderr?: Buffer;
          };
          error.stdout = Buffer.from("Following migration have not yet been applied: 20260419_phase0_error_text_columns");
          error.stderr = Buffer.from("");
          throw error;
        },
      }),
    /db:migrate:deploy/i,
  );
});
