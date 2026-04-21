import type { AddressInfo } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAiRun, createFixture, createTask, createTaskRun } from "@gana-v8/domain-core";
import {
  createPublicApiServer,
  createPublicApiTokenAuthentication,
} from "@gana-v8/public-api";
import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  buildOperatorConsoleModel,
  createOperatorConsoleWebServer,
  createOperatorConsoleSnapshot,
  createOperatorConsoleSnapshotFromOperation,
  loadOperatorConsoleWebPayload,
  renderOperatorConsole,
  renderSnapshotConsole,
} from "../src/index.js";

const createSandboxCertificationFixture = async (): Promise<{
  readonly goldensRoot: string;
  readonly artifactsRoot: string;
}> => {
  const root = await mkdtemp(join(tmpdir(), "gana-v8-operator-console-cert-"));
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
  };

  await writeFile(
    join(goldensRoot, "ci-smoke", "football-dual-smoke.json"),
    `${JSON.stringify(goldenSnapshot, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(artifactsRoot, "ci-smoke", "football-dual-smoke.evidence.json"),
    `${JSON.stringify(
      {
        schemaVersion: "sandbox-certification-v1",
        generatedAt: "2026-08-16T20:30:00.000Z",
        summary: {
          fixturePackId: "football-dual-smoke",
        },
        goldenSnapshot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { goldensRoot, artifactsRoot };
};

const createOperationLikeSnapshot = (overrides: Record<string, unknown> = {}) => ({
  generatedAt: "2026-04-15T01:00:00.000Z",
  fixtures: [
    {
      id: "fixture:api-football:123",
      sport: "football",
      competition: "Liga Profesional",
      homeTeam: "Boca Juniors",
      awayTeam: "River Plate",
      scheduledAt: "2026-04-15T03:00:00.000Z",
      status: "scheduled",
      scoreHome: null,
      scoreAway: null,
      metadata: {},
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:00:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task-demo-fixtures",
      kind: "fixture-ingestion",
      status: "succeeded",
      priority: 80,
      payload: { fixtureId: "fixture:api-football:123" },
      scheduledFor: "2026-04-15T00:00:00.000Z",
      attempts: [],
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:01:00.000Z",
    },
  ],
  taskRuns: [
    {
      id: "task-demo-fixtures:attempt:1",
      taskId: "task-demo-fixtures",
      attemptNumber: 1,
      status: "succeeded",
      startedAt: "2026-04-15T00:00:00.000Z",
      finishedAt: "2026-04-15T00:01:00.000Z",
      error: null,
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:01:00.000Z",
    },
  ],
  rawBatches: [
    {
      id: "raw-batch-demo-fixtures",
      endpointFamily: "fixtures",
      providerCode: "api-football",
      extractionStatus: "succeeded",
      extractionTime: "2026-04-15T00:01:00.000Z",
      recordCount: 1,
    },
  ],
  oddsSnapshots: [
    {
      id: "odds-demo-fixture-123",
      fixtureId: "fixture:api-football:123",
      providerFixtureId: "123",
      bookmakerKey: "bet365",
      marketKey: "h2h",
      capturedAt: "2026-04-15T00:02:00.000Z",
      selectionCount: 3,
    },
  ],
  aiRuns: [
    {
      id: "airun-demo-scoring",
      taskId: "task-demo-fixtures",
      provider: "internal",
      model: "deterministic-moneyline-v1",
      promptVersion: "scoring-worker-mvp-v1",
      latestPromptVersion: "scoring-worker-mvp-v1",
      providerRequestId: "req-demo-scoring",
      status: "completed",
      usage: {
        promptTokens: 120,
        completionTokens: 48,
        totalTokens: 168,
      },
      outputRef: "memory://demo/airuns/airun-demo-scoring.json",
      createdAt: "2026-04-15T00:10:00.000Z",
      updatedAt: "2026-04-15T00:10:05.000Z",
    },
  ],
  providerStates: [
    {
      provider: "internal",
      latestModel: "deterministic-moneyline-v1",
      latestPromptVersion: "scoring-worker-mvp-v1",
      aiRunCount: 1,
      failedAiRunCount: 0,
      latestAiRunAt: "2026-04-15T00:10:05.000Z",
      rawBatchCount: 1,
      latestRawBatchAt: "2026-04-15T00:01:00.000Z",
      latestRawBatchStatus: "succeeded",
      quota: {
        limit: 1000,
        used: 320,
        remaining: 680,
        updatedAt: "2026-04-15T00:10:05.000Z",
      },
    },
  ],
  predictions: [
    {
      id: "prediction:fixture:api-football:123:moneyline:home",
      fixtureId: "fixture:api-football:123",
      aiRunId: "airun-demo-scoring",
      market: "moneyline",
      outcome: "home",
      confidence: 0.64,
      edge: 0.08,
      status: "published",
      rationale: "home edge",
      probabilities: { home: 0.52, draw: 0.25, away: 0.23 },
      createdAt: "2026-04-15T00:10:00.000Z",
      updatedAt: "2026-04-15T00:10:00.000Z",
    },
  ],
  parlays: [
    {
      id: "parlay:demo",
      status: "ready",
      source: "automatic",
      expectedPayout: 91.65,
      rationale: "single leg demo",
      legs: [
        {
          predictionId: "prediction:fixture:api-football:123:moneyline:home",
          fixtureId: "fixture:api-football:123",
          market: "moneyline",
          outcome: "home",
          confidence: 0.64,
          oddsDecimal: 1.91,
          status: "pending",
        },
      ],
      createdAt: "2026-04-15T00:15:00.000Z",
      updatedAt: "2026-04-15T00:15:00.000Z",
    },
  ],
  validations: [
    {
      id: "validation:demo",
      targetType: "prediction",
      targetId: "prediction:fixture:api-football:123:moneyline:home",
      kind: "prediction-settlement",
      status: "partial",
      summary: "awaiting final score",
      details: {},
      createdAt: "2026-04-15T00:20:00.000Z",
      updatedAt: "2026-04-15T00:20:00.000Z",
    },
  ],
  validationSummary: {
    total: 1,
    passed: 0,
    failed: 0,
    partial: 1,
    pending: 0,
    completionRate: 1,
  },
  health: {
    status: "ok",
    generatedAt: "2026-04-15T01:00:00.000Z",
    checks: [
      { name: "fixtures", status: "pass", detail: "1 fixture(s) in snapshot" },
      { name: "tasks", status: "pass", detail: "1 task(s) in snapshot" },
      { name: "predictions", status: "pass", detail: "1 prediction(s) in snapshot" },
      { name: "validations", status: "warn", detail: "0 passed / 0 failed / 1 partial / 0 pending" },
    ],
  },
  ...overrides,
});

test("operator console builds panels and alerts from the snapshot", () => {
  const snapshot = createOperatorConsoleSnapshot();
  const model = buildOperatorConsoleModel(snapshot);

  assert.equal(model.panels.length, 18);
  assert.equal(model.health.status, "ok");
  assert.equal(model.validationSummary.partial, 1);
  assert.equal(model.alerts.length, 0);
  assert.equal(model.panels[1]?.title, "ETL");
  assert.equal(model.panels[2]?.title, "Task queue");
  assert.equal(model.panels[3]?.title, "Operational log");
  assert.equal(model.panels[4]?.title, "AI & providers");
  assert.equal(model.panels[5]?.title, "Sandbox certification");
  assert.equal(model.panels[6]?.title, "Observability");
  assert.equal(model.panels[7]?.title, "Policy");
  assert.equal(model.panels[8]?.title, "Traceability");
});

test("operator console derives an ops-focused snapshot from public-api operation data", () => {
  const operationSnapshot = createOperationLikeSnapshot();
  const snapshot = createOperatorConsoleSnapshotFromOperation(operationSnapshot as never);
  const model = buildOperatorConsoleModel(snapshot);
  const queuePanel = model.panels.find((panel) => panel.title === "Task queue");
  const logPanel = model.panels.find((panel) => panel.title === "Operational log");
  const aiPanel = model.panels.find((panel) => panel.title === "AI & providers");
  const observabilityPanel = model.panels.find((panel) => panel.title === "Observability");
  const policyPanel = model.panels.find((panel) => panel.title === "Policy");
  const traceabilityPanel = model.panels.find((panel) => panel.title === "Traceability");
  const fixtureOpsPanel = model.panels.find((panel) => panel.title === "Fixture ops");

  assert.equal(snapshot.tasks.length, operationSnapshot.tasks.length);
  assert.equal(snapshot.taskRuns.length, operationSnapshot.taskRuns.length);
  assert.equal(snapshot.etl.latestBatch?.id, operationSnapshot.rawBatches[0]?.id ?? null);
  assert.equal(snapshot.etl.oddsSnapshotCount, operationSnapshot.oddsSnapshots.length);
  assert.equal(snapshot.operationalSummary.taskCounts.total, operationSnapshot.tasks.length);
  assert.ok(snapshot.operationalLogs.length >= 2);
  assert.equal(snapshot.aiRuns.length, 1);
  assert.equal(snapshot.providerStates[0]?.provider, "internal");
  assert.match(queuePanel?.lines.join("\n") ?? "", /succeeded:1/);
  assert.match(logPanel?.lines.join("\n") ?? "", /fixture-ingestion succeeded/i);
  assert.match(aiPanel?.lines.join("\n") ?? "", /deterministic-moneyline-v1/);
  assert.match(aiPanel?.lines.join("\n") ?? "", /req-demo-scoring/);
  assert.match(aiPanel?.lines.join("\n") ?? "", /latestPrompt/);
  assert.match(observabilityPanel?.lines.join("\n") ?? "", /Workers:/);
  assert.match(observabilityPanel?.lines.join("\n") ?? "", /Traceability:/);
  assert.match(policyPanel?.lines.join("\n") ?? "", /Publish allowed: no/);
  assert.match(traceabilityPanel?.lines.join("\n") ?? "", /airun-demo-scoring/);
  assert.match(traceabilityPanel?.lines.join("\n") ?? "", /memory:\/\/demo\/airuns\/airun-demo-scoring.json/);
  assert.match(traceabilityPanel?.lines.join("\n") ?? "", /prediction:fixture:api-football:123:moneyline:home/);
  assert.match(traceabilityPanel?.lines.join("\n") ?? "", /parlay:demo/);
  assert.match(fixtureOpsPanel?.lines.join("\n") ?? "", /fixture:api-football:123/);
  assert.match(fixtureOpsPanel?.lines.join("\n") ?? "", /workflow/);
  assert.match(fixtureOpsPanel?.lines.join("\n") ?? "", /predictions 1/);
});

test("operator console surfaces fixture pipeline readiness from fixture metadata", () => {
  const operationSnapshot = createOperationLikeSnapshot({
    fixtureWorkflows: [
      {
        id: "fixture:api-football:123",
        fixtureId: "fixture:api-football:123",
        ingestionStatus: "succeeded",
        oddsStatus: "succeeded",
        enrichmentStatus: "succeeded",
        candidateStatus: "succeeded",
        predictionStatus: "pending",
        parlayStatus: "pending",
        validationStatus: "pending",
        isCandidate: true,
        manualSelectionStatus: "selected",
        manualSelectionBy: "ops-user",
        selectionOverride: "force-include",
        diagnostics: { research: { lean: "home" } },
        errorCount: 0,
        createdAt: "2026-04-15T00:00:00.000Z",
        updatedAt: "2026-04-15T00:15:00.000Z",
      },
    ],
    auditEvents: [
      {
        id: "audit-fixture-2",
        aggregateType: "fixture-workflow",
        aggregateId: "fixture:api-football:123",
        eventType: "fixture-workflow.selection-override.updated",
        actor: "public-api",
        payload: { mode: "force-include", reason: "high conviction" },
        occurredAt: "2026-04-15T00:16:00.000Z",
        createdAt: "2026-04-15T00:16:00.000Z",
        updatedAt: "2026-04-15T00:16:00.000Z",
      },
      {
        id: "audit-fixture-1",
        aggregateType: "fixture-workflow",
        aggregateId: "fixture:api-football:123",
        eventType: "fixture-workflow.manual-selection.updated",
        actor: "ops-user",
        payload: { status: "selected", reason: "desk review" },
        occurredAt: "2026-04-15T00:15:30.000Z",
        createdAt: "2026-04-15T00:15:30.000Z",
        updatedAt: "2026-04-15T00:15:30.000Z",
      },
    ],
    fixtures: [
      {
        id: "fixture:api-football:123",
        sport: "football",
        competition: "Liga Profesional",
        homeTeam: "Boca Juniors",
        awayTeam: "River Plate",
        scheduledAt: "2026-04-15T03:00:00.000Z",
        status: "scheduled",
        metadata: {
          researchRecommendedLean: "home",
          featureReadinessStatus: "needs-review",
          featureReadinessReasons: "research dossier has no evidence items | feature snapshot has no ranked evidence",
          researchGeneratedAt: "2026-04-15T00:15:00.000Z",
        },
        createdAt: "2026-04-15T00:00:00.000Z",
        updatedAt: "2026-04-15T00:15:00.000Z",
      },
    ],
  });

  const model = buildOperatorConsoleModel(createOperatorConsoleSnapshotFromOperation(operationSnapshot as never));
  const pipelinePanel = model.panels.find((panel) => panel.title === "Fixture pipeline");
  const fixtureOpsPanel = model.panels.find((panel) => panel.title === "Fixture ops");

  assert.ok(pipelinePanel);
  assert.ok(fixtureOpsPanel);
  assert.match(pipelinePanel.lines.join("\n"), /needs-review/);
  assert.match(pipelinePanel.lines.join("\n"), /researchGeneratedAt/);
  assert.match(pipelinePanel.lines.join("\n"), /Boca Juniors/);
  assert.match(fixtureOpsPanel.lines.join("\n"), /manual selected/);
  assert.match(fixtureOpsPanel.lines.join("\n"), /override force-include/);
  assert.match(fixtureOpsPanel.lines.join("\n"), /eligibility Fixture is force-included by workflow ops/i);
  assert.match(fixtureOpsPanel.lines.join("\n"), /recent ops/);
  assert.match(fixtureOpsPanel.lines.join("\n"), /selection-override.updated.*high conviction/i);
  assert.match(fixtureOpsPanel.lines.join("\n"), /manual-selection.updated.*desk review/i);
});

test("operator console adds coverage and daily scope panels", () => {
  const operationSnapshot = createOperationLikeSnapshot({
    leagueCoveragePolicies: [
      {
        id: "league-policy-epl",
        provider: "api-football",
        leagueKey: "39",
        leagueName: "Premier League",
        season: 2099,
        enabled: true,
        alwaysOn: true,
        priority: 90,
        marketsAllowed: ["moneyline"],
        createdAt: "2099-01-01T00:00:00.000Z",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    teamCoveragePolicies: [
      {
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
        createdAt: "2099-01-01T00:00:00.000Z",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    dailyAutomationPolicies: [
      {
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
        createdAt: "2099-01-01T00:00:00.000Z",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    fixtureWorkflows: [
      {
        id: "fixture:api-football:123",
        fixtureId: "fixture:api-football:123",
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
        manualSelectionStatus: "none",
        errorCount: 0,
        createdAt: "2099-01-01T00:00:00.000Z",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    fixtures: [
      {
        id: "fixture:api-football:123",
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
        createdAt: "2099-01-01T00:00:00.000Z",
        updatedAt: "2099-01-01T00:00:00.000Z",
      },
    ],
  });

  const model = buildOperatorConsoleModel(createOperatorConsoleSnapshotFromOperation(operationSnapshot as never));
  const coveragePanel = model.panels.find((panel) => panel.title === "Coverage registry");
  const scopePanel = model.panels.find((panel) => panel.title === "Daily scope");

  assert.ok(coveragePanel);
  assert.ok(scopePanel);
  assert.match(coveragePanel.lines.join("\n"), /Leagues: 1/);
  assert.match(coveragePanel.lines.join("\n"), /Teams: 1/);
  assert.match(coveragePanel.lines.join("\n"), /Min allowed odd: 1.20/);
  assert.match(scopePanel.lines.join("\n"), /fixture:api-football:123/);
  assert.match(scopePanel.lines.join("\n"), /included yes/);
  assert.match(scopePanel.lines.join("\n"), /scoring no/);
  assert.match(scopePanel.lines.join("\n"), /odds-below-min-threshold/);
});

test("operator console raises alerts from operational logs and degraded validation health", () => {
  const operationSnapshot = createOperationLikeSnapshot({
    tasks: [
      {
        id: "task-failed",
        kind: "prediction",
        status: "failed",
        priority: 50,
        payload: { fixtureId: "fixture:api-football:123" },
        scheduledFor: null,
        attempts: [],
        createdAt: "2026-04-15T00:03:00.000Z",
        updatedAt: "2026-04-15T00:04:00.000Z",
      },
    ],
    taskRuns: [
      {
        id: "task-failed:attempt:1",
        taskId: "task-failed",
        attemptNumber: 1,
        status: "failed",
        startedAt: "2026-04-15T00:03:00.000Z",
        finishedAt: "2026-04-15T00:04:00.000Z",
        error: "provider timeout",
        createdAt: "2026-04-15T00:03:00.000Z",
        updatedAt: "2026-04-15T00:04:00.000Z",
      },
    ],
    aiRuns: [
      {
        id: "airun-demo-scoring",
        taskId: "task-failed",
        provider: "internal",
        model: "deterministic-moneyline-v1",
        promptVersion: "scoring-worker-mvp-v1",
        latestPromptVersion: "scoring-worker-mvp-v1",
        providerRequestId: "req-timeout-1",
        status: "failed",
        error: "provider timeout",
        fallbackReason: "provider timeout",
        degraded: true,
        createdAt: "2026-04-15T00:03:30.000Z",
        updatedAt: "2026-04-15T00:04:00.000Z",
      },
    ],
    providerStates: [
      {
        provider: "internal",
        latestModel: "deterministic-moneyline-v1",
        latestPromptVersion: "scoring-worker-mvp-v1",
        aiRunCount: 1,
        failedAiRunCount: 1,
        latestAiRunAt: "2026-04-15T00:04:00.000Z",
        latestError: "provider timeout",
        rawBatchCount: 0,
        quota: {
          limit: 1000,
          used: 980,
          remaining: 20,
          updatedAt: "2026-04-15T00:04:00.000Z",
        },
      },
    ],
    validations: [],
    validationSummary: {
      total: 0,
      passed: 0,
      failed: 0,
      partial: 0,
      pending: 0,
      completionRate: 1,
    },
    health: {
      status: "degraded",
      generatedAt: "2026-04-15T01:00:00.000Z",
      checks: [
        { name: "fixtures", status: "pass", detail: "1 fixture(s) in snapshot" },
        { name: "tasks", status: "warn", detail: "1 failed task(s) in snapshot" },
      ],
    },
  });
  const snapshot = createOperatorConsoleSnapshotFromOperation(operationSnapshot as never);
  const model = buildOperatorConsoleModel(snapshot);
  const logPanel = model.panels.find((panel) => panel.title === "Operational log");
  const aiPanel = model.panels.find((panel) => panel.title === "AI & providers");
  const observabilityPanel = model.panels.find((panel) => panel.title === "Observability");
  const policyPanel = model.panels.find((panel) => panel.title === "Policy");
  const validationPanel = model.panels.find((panel) => panel.title === "Validation");

  assert.ok(model.alerts.some((alert) => alert.includes("task-failed")));
  assert.ok(model.alerts.some((alert) => alert.includes("provider timeout")));
  assert.ok(model.alerts.some((alert) => alert.includes("policy:")));
  assert.match(logPanel?.lines.join("\n") ?? "", /provider timeout/);
  assert.match(aiPanel?.lines.join("\n") ?? "", /req-timeout-1/);
  assert.match(aiPanel?.lines.join("\n") ?? "", /fallback provider timeout/);
  assert.match(aiPanel?.lines.join("\n") ?? "", /remaining 20/i);
  assert.match(observabilityPanel?.lines.join("\n") ?? "", /failed 1/);
  assert.match(policyPanel?.lines.join("\n") ?? "", /degraded|blocked/i);
  assert.match(validationPanel?.lines.join("\n") ?? "", /0 passed/);
});

test("operator console renderer prints a useful CLI view", () => {
  const snapshot = createOperatorConsoleSnapshot();
  const output = renderOperatorConsole(buildOperatorConsoleModel(snapshot));

  assert.match(output, /Gana V8 Operator Console/);
  assert.match(output, /Boca Juniors vs River Plate/);
  assert.match(output, /Task queue/);
  assert.match(output, /Operational log/);
  assert.match(output, /ETL/);
  assert.match(renderSnapshotConsole(snapshot), /Health: OK/);
});

test("operator console can load a web payload from public-api snapshots", async () => {
  const { goldensRoot, artifactsRoot } = await createSandboxCertificationFixture();
  const authentication = createPublicApiTokenAuthentication({
    viewerToken: "viewer-token",
  });
  const publicApiServer = createPublicApiServer({
    snapshot: createOperationLikeSnapshot() as never,
    sandboxCertification: {
      goldensRoot,
      artifactsRoot,
    },
    ...(authentication ? { auth: authentication } : {}),
  });

  await new Promise<void>((resolve) => publicApiServer.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = publicApiServer.address();
    assert.ok(address && typeof address !== "string");
    const payload = await loadOperatorConsoleWebPayload({
      publicApiBaseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
      publicApiToken: "viewer-token",
    });

    assert.equal(payload.snapshot.fixtures.length, 1);
    assert.equal(payload.certification.length, 1);
    assert.equal(payload.snapshot.sandboxCertification[0]?.status, "passed");
    assert.equal(payload.model.health.status, "ok");
    assert.ok(payload.model.panels.some((panel) => panel.title === "Task queue"));
    assert.ok(payload.model.panels.some((panel) => panel.title === "Sandbox certification"));
  } finally {
    await new Promise<void>((resolve, reject) =>
      publicApiServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("operator console web server serves dashboard assets and proxies fixture actions through public-api", async () => {
  const { goldensRoot, artifactsRoot } = await createSandboxCertificationFixture();
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fixture:web-console:1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Xelajú",
    awayTeam: "Antigua",
    scheduledAt: "2026-04-22T03:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);
  await unitOfWork.tasks.save(
    createTask({
      id: "task:web-console:1",
      kind: "research",
      status: "failed",
      priority: 70,
      payload: { fixtureId: fixture.id },
      attempts: [
        {
          startedAt: "2026-04-22T00:40:00.000Z",
          finishedAt: "2026-04-22T00:41:00.000Z",
          error: "provider timeout",
        },
      ],
      lastErrorMessage: "provider timeout",
      scheduledFor: "2026-04-22T00:40:00.000Z",
      createdAt: "2026-04-22T00:40:00.000Z",
      updatedAt: "2026-04-22T00:41:00.000Z",
    }),
  );
  await unitOfWork.taskRuns.save(
    createTaskRun({
      id: "task:web-console:1:attempt:1",
      taskId: "task:web-console:1",
      attemptNumber: 1,
      status: "failed",
      startedAt: "2026-04-22T00:40:00.000Z",
      finishedAt: "2026-04-22T00:41:00.000Z",
      error: "provider timeout",
      createdAt: "2026-04-22T00:40:00.000Z",
      updatedAt: "2026-04-22T00:41:00.000Z",
    }),
  );
  await unitOfWork.aiRuns.save(
    createAiRun({
      id: "airun:web-console:1",
      taskId: "task:web-console:1",
      provider: "groq",
      model: "openai/gpt-oss-120b",
      promptVersion: "research-v2",
      status: "completed",
      providerRequestId: "req-web-console-1",
      outputRef: "memory://ai-runs/airun:web-console:1.json",
      createdAt: "2026-04-22T00:40:20.000Z",
      updatedAt: "2026-04-22T00:40:30.000Z",
    }),
  );
  const authentication = createPublicApiTokenAuthentication({
    viewerToken: "viewer-token",
    operatorToken: "operator-token",
  });
  const publicApiServer = createPublicApiServer({
    unitOfWork,
    sandboxCertification: {
      goldensRoot,
      artifactsRoot,
    },
    ...(authentication ? { auth: authentication } : {}),
  });
  await new Promise<void>((resolve) => publicApiServer.listen(0, "127.0.0.1", () => resolve()));

  const publicApiAddress = publicApiServer.address();
  assert.ok(publicApiAddress && typeof publicApiAddress !== "string");
  const operatorConsoleServer = createOperatorConsoleWebServer({
    publicApiBaseUrl: `http://127.0.0.1:${(publicApiAddress as AddressInfo).port}`,
    publicApiToken: "operator-token",
  });
  await new Promise<void>((resolve) => operatorConsoleServer.listen(0, "127.0.0.1", () => resolve()));

  try {
    const operatorConsoleAddress = operatorConsoleServer.address();
    assert.ok(operatorConsoleAddress && typeof operatorConsoleAddress !== "string");
    const baseUrl = `http://127.0.0.1:${(operatorConsoleAddress as AddressInfo).port}`;

    const htmlResponse = await fetch(`${baseUrl}/`);
    assert.equal(htmlResponse.status, 200);
    assert.match(await htmlResponse.text(), /Harness Control Surface/);

    const appJsResponse = await fetch(`${baseUrl}/app.js`);
    assert.equal(appJsResponse.status, 200);
    const appJs = await appJsResponse.text();
    assert.match(appJs, /Task Inspector/);
    assert.match(appJs, /AI Run Inspector/);

    const payloadResponse = await fetch(`${baseUrl}/api/console`);
    assert.equal(payloadResponse.status, 200);
    const payloadJson = (await payloadResponse.json()) as {
      snapshot: { fixtures: Array<{ id: string }> };
      certification: Array<{ packId: string; status: string }>;
      model: { panels: Array<{ title: string }> };
    };
    assert.equal(payloadJson.snapshot.fixtures[0]?.id, fixture.id);
    assert.equal(payloadJson.certification[0]?.packId, "football-dual-smoke");
    assert.equal(payloadJson.certification[0]?.status, "passed");
    assert.ok(payloadJson.model.panels.some((panel) => panel.title === "Fixture ops"));
    assert.ok(payloadJson.model.panels.some((panel) => panel.title === "Sandbox certification"));

    const certificationDetailResponse = await fetch(
      `${baseUrl}/api/public/sandbox-certification/ci-smoke/football-dual-smoke`,
    );
    assert.equal(certificationDetailResponse.status, 200);
    assert.equal(((await certificationDetailResponse.json()) as { status: string }).status, "passed");

    const aiRunResponse = await fetch(`${baseUrl}/api/public/ai-runs/${encodeURIComponent("airun:web-console:1")}`);
    assert.equal(aiRunResponse.status, 200);
    assert.equal(((await aiRunResponse.json()) as { id: string }).id, "airun:web-console:1");

    const taskRunsResponse = await fetch(`${baseUrl}/api/public/tasks/${encodeURIComponent("task:web-console:1")}/runs`);
    assert.equal(taskRunsResponse.status, 200);
    assert.equal(((await taskRunsResponse.json()) as Array<{ id: string }>)[0]?.id, "task:web-console:1:attempt:1");

    const actionResponse = await fetch(`${baseUrl}/api/public/fixtures/${encodeURIComponent(fixture.id)}/manual-selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "selected",
        selectedBy: "web-console",
        reason: "TV slot",
      }),
    });
    assert.equal(actionResponse.status, 200);

    const fixtureOpsResponse = await fetch(`${baseUrl}/api/public/fixtures/${encodeURIComponent(fixture.id)}/ops`);
    assert.equal(fixtureOpsResponse.status, 200);
    const fixtureOpsJson = (await fixtureOpsResponse.json()) as {
      workflow?: { manualSelectionStatus: string; manualSelectionBy?: string };
    };
    assert.equal(fixtureOpsJson.workflow?.manualSelectionStatus, "selected");
    assert.equal(fixtureOpsJson.workflow?.manualSelectionBy, "web-console");

    const queueActionResponse = await fetch(`${baseUrl}/api/public/tasks/${encodeURIComponent("task:web-console:1")}/requeue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(queueActionResponse.status, 200);
    assert.equal(((await queueActionResponse.json()) as { status: string }).status, "queued");
  } finally {
    await new Promise<void>((resolve, reject) =>
      operatorConsoleServer.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      publicApiServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
