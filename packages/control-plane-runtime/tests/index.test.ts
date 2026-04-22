import assert from "node:assert/strict";
import test from "node:test";

import type { QueueTaskEntity, QueueTaskSummary } from "@gana-v8/queue-adapters";

import {
  assessQueueHealth,
  hasExpiredTaskLease,
} from "../src/index.js";

const createQueueTask = (
  overrides: Partial<QueueTaskEntity> = {},
): QueueTaskEntity => ({
  id: overrides.id ?? "task:test",
  kind: overrides.kind ?? "research",
  status: overrides.status ?? "queued",
  triggerKind: overrides.triggerKind ?? "system",
  priority: overrides.priority ?? 50,
  payload: overrides.payload ?? {},
  attempts: overrides.attempts ?? [],
  maxAttempts: overrides.maxAttempts ?? 3,
  createdAt: overrides.createdAt ?? "2026-04-22T12:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-04-22T12:00:00.000Z",
  ...(overrides.dedupeKey ? { dedupeKey: overrides.dedupeKey } : {}),
  ...(overrides.scheduledFor ? { scheduledFor: overrides.scheduledFor } : {}),
  ...(overrides.lastErrorMessage ? { lastErrorMessage: overrides.lastErrorMessage } : {}),
  ...(overrides.leaseOwner ? { leaseOwner: overrides.leaseOwner } : {}),
  ...(overrides.leaseExpiresAt ? { leaseExpiresAt: overrides.leaseExpiresAt } : {}),
});

const createQueueSummary = (
  overrides: Partial<QueueTaskSummary> = {},
): QueueTaskSummary => ({
  total: overrides.total ?? 0,
  queued: overrides.queued ?? 0,
  running: overrides.running ?? 0,
  succeeded: overrides.succeeded ?? 0,
  failed: overrides.failed ?? 0,
  quarantined: overrides.quarantined ?? 0,
  cancelled: overrides.cancelled ?? 0,
  latestTasks: overrides.latestTasks ?? [],
});

test("hasExpiredTaskLease detects explicit expired leases only", () => {
  const now = new Date("2026-04-22T12:10:00.000Z");

  const explicitExpiredTask = createQueueTask({
    id: "task:explicit-expired",
    status: "running",
    leaseExpiresAt: "2026-04-22T12:09:00.000Z",
  });
  const healthyTask = createQueueTask({
    id: "task:healthy",
    status: "running",
    leaseExpiresAt: "2026-04-22T12:12:00.000Z",
  });

  assert.equal(hasExpiredTaskLease(explicitExpiredTask, now), true);
  assert.equal(hasExpiredTaskLease(healthyTask, now), false);
});

test("assessQueueHealth blocks on quarantines or expired leases and flags near-expiry pressure", () => {
  const now = new Date("2026-04-22T12:10:00.000Z");
  const expiredTask = createQueueTask({
    id: "task:expired",
    status: "running",
    leaseExpiresAt: "2026-04-22T12:09:00.000Z",
  });
  const nearExpiryTask = createQueueTask({
    id: "task:near-expiry",
    status: "running",
    leaseExpiresAt: "2026-04-22T12:10:45.000Z",
  });
  const summary = createQueueSummary({
    total: 3,
    running: 2,
    failed: 1,
    latestTasks: [expiredTask, nearExpiryTask],
  });

  const assessment = assessQueueHealth(summary, [expiredTask, nearExpiryTask], now);

  assert.equal(assessment.status, "blocked");
  assert.deepEqual(assessment.expiredLeaseTaskIds, ["task:expired"]);
  assert.deepEqual(assessment.nearExpiryTaskIds, ["task:near-expiry"]);
  assert.ok(assessment.reasons.some((reason) => reason.includes("expired")));
  assert.ok(assessment.reasons.some((reason) => reason.includes("redrive")));
});

test("assessQueueHealth stays healthy when the queue has no operational pressure", () => {
  const now = new Date("2026-04-22T12:10:00.000Z");
  const summary = createQueueSummary({
    total: 2,
    succeeded: 2,
  });

  const assessment = assessQueueHealth(summary, [], now);

  assert.equal(assessment.status, "healthy");
  assert.deepEqual(assessment.reasons, []);
  assert.deepEqual(assessment.expiredLeaseTaskIds, []);
  assert.deepEqual(assessment.nearExpiryTaskIds, []);
});
