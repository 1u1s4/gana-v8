import test from "node:test";
import assert from "node:assert/strict";

import {
  createAuditEvent,
  createFixture,
  createPrediction,
  createSandboxNamespace,
  createTaskRun,
  publishPrediction,
  transitionFixtureStatus,
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
