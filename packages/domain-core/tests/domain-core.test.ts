import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFixtureWorkflowManualSelection,
  applyFixtureWorkflowSelectionOverride,
  createAuditEvent,
  createDailyAutomationPolicy,
  createFixture,
  createFixtureWorkflow,
  createLeagueCoveragePolicy,
  createOpaqueTaskId,
  createOpaqueTaskRunId,
  createPrediction,
  createSandboxNamespace,
  createTaskRun,
  createTeamCoveragePolicy,
  publishPrediction,
  transitionFixtureStatus,
  transitionFixtureWorkflowStage,
} from "../src/index.js";

test("fixture transitions and prediction publishing keep domain invariants", () => {
  const fixture = createFixture({
    id: "fx-1",
    sport: "football",
    competition: "UCL",
    homeTeam: "Home",
    awayTeam: "Away",
    scheduledAt: "2026-04-14T21:00:00.000Z",
    status: "scheduled",
    metadata: { source: "synthetic" },
  });

  const liveFixture = transitionFixtureStatus(fixture, "live");
  assert.equal(liveFixture.status, "live");

  const prediction = publishPrediction(
    createPrediction({
      id: "pred-1",
      fixtureId: fixture.id,
      market: "moneyline",
      outcome: "home",
      status: "draft",
      confidence: 0.64,
      probabilities: { implied: 0.52, model: 0.64, edge: 0.12 },
      rationale: ["Strong home form"],
    }),
  );

  assert.equal(prediction.status, "published");
  assert.ok(prediction.publishedAt);
});

test("sandbox namespaces require sandbox id when environment is sandbox", () => {
  const namespace = createSandboxNamespace({
    id: "ns-1",
    environment: "sandbox",
    sandboxId: "sbx-42",
    scope: "ci-regression",
    storagePrefix: "sandbox://sbx-42/artifacts",
    queuePrefix: "sbx-42-queue",
    metadata: { owner: "ci" },
  });

  assert.equal(namespace.sandboxId, "sbx-42");
});

test("task runs and audit events get default timestamps", () => {
  const taskRun = createTaskRun({
    id: "task-1:attempt:1",
    taskId: "task-1",
    attemptNumber: 1,
    status: "running",
    startedAt: "2026-04-15T09:00:00.000Z",
  });

  const auditEvent = createAuditEvent({
    id: "audit-1",
    aggregateType: "task",
    aggregateId: "task-1",
    eventType: "task.started",
    payload: { attemptNumber: 1 },
  });

  assert.equal(taskRun.taskId, "task-1");
  assert.equal(auditEvent.aggregateId, "task-1");
  assert.ok(auditEvent.occurredAt);
});

test("opaque task ids stay stable and use tsk/trn prefixes", () => {
  const taskId = createOpaqueTaskId("scoring-worker:fx-1");
  const sameTaskId = createOpaqueTaskId("scoring-worker:fx-1");
  const taskRunId = createOpaqueTaskRunId(taskId, 1);

  assert.equal(taskId, sameTaskId);
  assert.match(taskId, /^tsk_[a-f0-9]{16}$/);
  assert.match(taskRunId, /^trn_[a-f0-9]{16}$/);
});

test("fixture workflow tracks stage state, timestamps, and errors", () => {
  const workflow = createFixtureWorkflow({
    fixtureId: "fx-1",
    ingestionStatus: "pending",
    oddsStatus: "pending",
    enrichmentStatus: "pending",
    candidateStatus: "pending",
    predictionStatus: "pending",
    parlayStatus: "pending",
    validationStatus: "pending",
    isCandidate: false,
  });

  const updated = transitionFixtureWorkflowStage(workflow, "prediction", {
    status: "running",
    occurredAt: "2026-04-15T10:00:00.000Z",
    qualityScore: 0.72,
    selectionScore: 0.63,
    minDetectedOdd: 1.91,
    isCandidate: true,
  });

  const failed = transitionFixtureWorkflowStage(updated, "prediction", {
    status: "failed",
    occurredAt: "2026-04-15T10:01:00.000Z",
    errorMessage: "provider timeout",
  });

  assert.equal(updated.predictionStatus, "running");
  assert.equal(updated.lastPredictedAt, "2026-04-15T10:00:00.000Z");
  assert.equal(updated.isCandidate, true);
  assert.equal(updated.qualityScore, 0.72);
  assert.equal(updated.selectionScore, 0.63);
  assert.equal(updated.minDetectedOdd, 1.91);
  assert.equal(failed.predictionStatus, "failed");
  assert.equal(failed.errorCount, 1);
  assert.equal(failed.lastErrorMessage, "provider timeout");
});

test("fixture workflow preserves manual selection and override metadata", () => {
  const workflow = createFixtureWorkflow({
    fixtureId: "fx-2",
    ingestionStatus: "succeeded",
    oddsStatus: "succeeded",
    enrichmentStatus: "succeeded",
    candidateStatus: "succeeded",
    predictionStatus: "pending",
    parlayStatus: "pending",
    validationStatus: "pending",
    isCandidate: true,
    diagnostics: {
      research: { lean: "home" },
      thresholds: { minOdd: 1.8 },
    },
  });

  const manuallySelected = applyFixtureWorkflowManualSelection(workflow, {
    status: "selected",
    selectedBy: "luis",
    reason: "High conviction derby edge",
    occurredAt: "2026-04-15T10:05:00.000Z",
  });

  const overridden = applyFixtureWorkflowSelectionOverride(manuallySelected, {
    mode: "force-include",
    reason: "Operator override for premium slate",
    occurredAt: "2026-04-15T10:06:00.000Z",
  });

  assert.equal(manuallySelected.manualSelectionStatus, "selected");
  assert.equal(manuallySelected.manualSelectionBy, "luis");
  assert.equal(manuallySelected.manualSelectionReason, "High conviction derby edge");
  assert.equal(manuallySelected.manuallySelectedAt, "2026-04-15T10:05:00.000Z");
  assert.equal(overridden.selectionOverride, "force-include");
  assert.equal(overridden.overrideReason, "Operator override for premium slate");
  assert.equal(overridden.overriddenAt, "2026-04-15T10:06:00.000Z");
  assert.deepEqual(overridden.diagnostics, {
    research: { lean: "home" },
    thresholds: { minOdd: 1.8 },
  });
});

test("coverage policies preserve watchlist and min-odd invariants", () => {
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
    notes: "Tier 1 league",
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
    notes: "Always monitor Liverpool",
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
    notes: "Default autonomous football policy",
  });

  assert.equal(leaguePolicy.alwaysOn, true);
  assert.deepEqual(leaguePolicy.marketsAllowed, ["moneyline", "totals"]);
  assert.equal(teamPolicy.alwaysTrack, true);
  assert.equal(teamPolicy.forceResearch, true);
  assert.equal(dailyPolicy.minAllowedOdd, 1.2);
  assert.equal(dailyPolicy.requireTrackedLeagueOrTeam, true);
  assert.equal(dailyPolicy.allowManualInclusionBypass, true);
  assert.throws(
    () =>
      createDailyAutomationPolicy({
        id: "dap-invalid",
        policyName: "invalid",
        enabled: true,
        timezone: "America/Guatemala",
        minAllowedOdd: 1,
        defaultMaxFixturesPerRun: 10,
        defaultLookaheadHours: 24,
        defaultLookbackHours: 6,
        requireTrackedLeagueOrTeam: true,
        allowManualInclusionBypass: true,
      }),
    /minAllowedOdd must be greater than 1/i,
  );
});
