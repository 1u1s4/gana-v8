import assert from "node:assert/strict";
import test from "node:test";

import {
  createLogEvent,
  createObservabilityKit,
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
