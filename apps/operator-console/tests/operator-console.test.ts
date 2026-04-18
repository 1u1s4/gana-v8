import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOperatorConsoleModel,
  createOperatorConsoleSnapshot,
  createOperatorConsoleSnapshotFromOperation,
  renderOperatorConsole,
  renderSnapshotConsole,
} from "../src/index.js";

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

  assert.equal(model.panels.length, 12);
  assert.equal(model.health.status, "ok");
  assert.equal(model.validationSummary.partial, 1);
  assert.equal(model.alerts.length, 0);
  assert.equal(model.panels[1]?.title, "ETL");
  assert.equal(model.panels[2]?.title, "Task queue");
  assert.equal(model.panels[3]?.title, "Operational log");
  assert.equal(model.panels[4]?.title, "AI & providers");
  assert.equal(model.panels[5]?.title, "Traceability");
});

test("operator console derives an ops-focused snapshot from public-api operation data", () => {
  const operationSnapshot = createOperationLikeSnapshot();
  const snapshot = createOperatorConsoleSnapshotFromOperation(operationSnapshot as never);
  const model = buildOperatorConsoleModel(snapshot);

  assert.equal(snapshot.tasks.length, operationSnapshot.tasks.length);
  assert.equal(snapshot.taskRuns.length, operationSnapshot.taskRuns.length);
  assert.equal(snapshot.etl.latestBatch?.id, operationSnapshot.rawBatches[0]?.id ?? null);
  assert.equal(snapshot.etl.oddsSnapshotCount, operationSnapshot.oddsSnapshots.length);
  assert.equal(snapshot.operationalSummary.taskCounts.total, operationSnapshot.tasks.length);
  assert.ok(snapshot.operationalLogs.length >= 2);
  assert.equal(snapshot.aiRuns.length, 1);
  assert.equal(snapshot.providerStates[0]?.provider, "internal");
  assert.match(model.panels[2]?.lines.join("\n") ?? "", /succeeded:1/);
  assert.match(model.panels[3]?.lines.join("\n") ?? "", /fixture-ingestion succeeded/i);
  assert.match(model.panels[4]?.lines.join("\n") ?? "", /deterministic-moneyline-v1/);
  assert.match(model.panels[5]?.lines.join("\n") ?? "", /airun-demo-scoring/);
  assert.match(model.panels[5]?.lines.join("\n") ?? "", /prediction:fixture:api-football:123:moneyline:home/);
  assert.match(model.panels[5]?.lines.join("\n") ?? "", /parlay:demo/);
});

test("operator console surfaces fixture pipeline readiness from fixture metadata", () => {
  const operationSnapshot = createOperationLikeSnapshot({
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

  assert.ok(pipelinePanel);
  assert.match(pipelinePanel.lines.join("\n"), /needs-review/);
  assert.match(pipelinePanel.lines.join("\n"), /researchGeneratedAt/);
  assert.match(pipelinePanel.lines.join("\n"), /Boca Juniors/);
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
        status: "failed",
        error: "provider timeout",
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

  assert.ok(model.alerts.some((alert) => alert.includes("task-failed")));
  assert.ok(model.alerts.some((alert) => alert.includes("provider timeout")));
  assert.match(model.panels[3]?.lines.join("\n") ?? "", /provider timeout/);
  assert.match(model.panels[4]?.lines.join("\n") ?? "", /remaining 20/i);
  assert.match(model.panels[10]?.lines.join("\n") ?? "", /0 passed/);
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
