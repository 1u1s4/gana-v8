import assert from "node:assert/strict";
import test from "node:test";

import {
  createLogEvent,
  createObservabilityKit,
  createOperationalObservabilitySummary,
  createTelemetryContext,
  finishSpan,
  InMemoryEventLog,
  MetricsRegistry,
  startSpan,
  withTelemetryLabels,
} from "../src/index.js";

test("event log stores structured logs and spans by trace", () => {
  const context = createTelemetryContext({ correlationId: "corr-1", traceId: "trace-1", workspace: "research-worker" });
  const log = createLogEvent({ context, data: { fixtureId: "fx-1" }, message: "fixture queued" });
  const span = finishSpan(
    startSpan({ attributes: { worker: "research" }, context, name: "hydrate-fixture", startedAt: "2026-04-15T00:00:00.000Z" }),
    { endedAt: "2026-04-15T00:00:01.250Z" },
  );

  const eventLog = new InMemoryEventLog();
  eventLog.append(log);
  eventLog.append(span);

  assert.equal(eventLog.listByTrace("trace-1").length, 2);
  assert.equal(eventLog.snapshot().traces, 1);
  assert.equal(span.durationMs, 1250);
});

test("metrics registry accumulates counter, gauge and histogram snapshots", () => {
  const metrics = new MetricsRegistry();
  metrics.increment("jobs.completed");
  metrics.increment("jobs.completed", 2);
  metrics.setGauge("queue.depth", 4);
  metrics.recordHistogram("latency.ms", 100);
  metrics.recordHistogram("latency.ms", 200);

  assert.deepEqual(metrics.getMetric("jobs.completed", "counter"), {
    name: "jobs.completed",
    type: "counter",
    value: 3,
  });
  assert.deepEqual(metrics.getMetric("queue.depth", "gauge"), {
    name: "queue.depth",
    type: "gauge",
    value: 4,
  });
  assert.deepEqual(metrics.getMetric("latency.ms", "histogram"), {
    average: 150,
    count: 2,
    max: 200,
    min: 100,
    name: "latency.ms",
    sum: 300,
    type: "histogram",
  });
});

test("observability kit logs span failures and keeps correlation context", () => {
  const kit = createObservabilityKit({ context: { correlationId: "corr-22", labels: { slice: "research" }, traceId: "trace-22" } });
  const enriched = withTelemetryLabels(kit.context(), { worker: "research-worker" });

  assert.equal(enriched.labels.worker, "research-worker");
  assert.equal(enriched.correlationId, "corr-22");

  kit.log("started", { context: { labels: { phase: "begin" } } });

  assert.throws(() => {
    kit.runSpan("failing-job", () => {
      throw new Error("boom");
    });
  }, /boom/);

  const summary = kit.eventLog.snapshot();
  assert.equal(summary.logCount, 1);
  assert.equal(summary.spanCount, 1);
  assert.deepEqual(kit.metrics.getMetric("logs.info", "counter"), {
    name: "logs.info",
    type: "counter",
    value: 1,
  });
  assert.deepEqual(kit.metrics.getMetric("spans.failed", "counter"), {
    name: "spans.failed",
    type: "counter",
    value: 1,
  });
});

test("operational observability summary reports workers, retry pressure, backfills, and trace coverage", () => {
  const summary = createOperationalObservabilitySummary({
    generatedAt: "2026-04-20T12:00:00.000Z",
    tasks: [
      {
        id: "task-1",
        kind: "fixture-ingestion",
        status: "quarantined",
        triggerKind: "system",
        priority: 100,
        payload: { traceId: "trace-1" },
        attempts: [{ startedAt: "2026-04-20T10:00:00.000Z", finishedAt: "2026-04-20T10:01:00.000Z" }],
        maxAttempts: 1,
        lastErrorMessage: "provider timeout",
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:01:00.000Z",
      },
      {
        id: "task-2",
        kind: "prediction",
        status: "running",
        triggerKind: "system",
        priority: 50,
        payload: {},
        attempts: [
          { startedAt: "2026-04-20T10:00:00.000Z", finishedAt: "2026-04-20T10:01:00.000Z" },
          { startedAt: "2026-04-20T11:00:00.000Z" },
        ],
        maxAttempts: 3,
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T11:00:00.000Z",
      },
    ],
    taskRuns: [
      {
        id: "run-1",
        taskId: "task-1",
        attemptNumber: 1,
        status: "failed",
        workerName: "ingestion-worker",
        startedAt: "2026-04-20T10:00:00.000Z",
        finishedAt: "2026-04-20T10:01:00.000Z",
        error: "provider timeout",
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:01:00.000Z",
      },
      {
        id: "run-2",
        taskId: "task-2",
        attemptNumber: 2,
        status: "running",
        workerName: "scoring-worker",
        startedAt: "2026-04-20T11:00:00.000Z",
        createdAt: "2026-04-20T11:00:00.000Z",
        updatedAt: "2026-04-20T11:00:00.000Z",
      },
    ],
    aiRuns: [
      {
        id: "airun-1",
        taskId: "task-2",
        provider: "codex",
        model: "gpt-5.4",
        promptVersion: "v1",
        status: "failed",
        error: "quota",
        createdAt: "2026-04-20T11:00:00.000Z",
        updatedAt: "2026-04-20T11:01:00.000Z",
      },
    ],
    rawBatches: [
      {
        id: "batch-1",
        endpointFamily: "fixtures",
        providerCode: "api-football",
        extractionStatus: "succeeded",
        extractionTime: "2026-04-18T10:00:00.000Z",
        recordCount: 12,
      },
    ],
    oddsSnapshots: [
      {
        id: "odds-1",
        marketKey: "h2h",
        capturedAt: "2026-04-20T09:00:00.000Z",
        selectionCount: 3,
      },
    ],
    health: {
      status: "degraded",
      checks: [
        { name: "live-fixtures-freshness", status: "warn", detail: "Latest fixtures batch is 50h old" },
        { name: "live-odds-freshness", status: "pass", detail: "Latest odds snapshot is 1h old" },
        { name: "validations", status: "warn", detail: "1 partial validation" },
      ],
    },
  });

  assert.equal(summary.workers.length, 2);
  assert.equal(summary.providers.some((provider) => provider.provider === "codex"), true);
  assert.equal(summary.retries.quarantined, 1);
  assert.equal(summary.retries.retryingNow, 1);
  assert.equal(summary.backfills.some((entry) => entry.area === "fixtures" && entry.status === "needed"), true);
  assert.equal(summary.traceability.tasksWithTraceId, 1);
  assert.equal(summary.alerts.some((alert) => alert.includes("backfill fixtures")), true);
});
