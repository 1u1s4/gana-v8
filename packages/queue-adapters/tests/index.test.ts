import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  createInMemoryTaskQueueAdapter,
} from "../src/index.js";

test("in-memory queue adapter enqueues, claims, completes and summarizes tasks", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:prediction",
    kind: "prediction",
    payload: { fixtureId: "fx-1" },
    now: new Date("2026-04-17T18:00:00.000Z"),
    priority: 50,
  });

  const claim = await queue.claimNext(undefined, new Date("2026-04-17T18:01:00.000Z"));
  assert.ok(claim);
  assert.equal(claim.task.id, "queue:test:prediction");
  assert.equal(claim.task.status, "running");
  assert.equal(claim.taskRun.attemptNumber, 1);

  const execution = await queue.complete(claim.task.id, claim.taskRun.id, new Date("2026-04-17T18:02:00.000Z"));
  assert.equal(execution.task.status, "succeeded");
  assert.equal(execution.taskRun.status, "succeeded");

  const summary = await queue.summary();
  assert.equal(summary.total, 1);
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.latestTasks[0]?.id, "queue:test:prediction");
});

test("in-memory queue adapter orders ready tasks and requeues failed tasks with a new attempt", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:low",
    kind: "prediction",
    payload: { fixtureId: "fx-low" },
    now: new Date("2026-04-17T19:00:00.000Z"),
    priority: 1,
    scheduledFor: new Date("2026-04-17T19:05:00.000Z"),
  });
  await queue.enqueue({
    id: "queue:test:high",
    kind: "prediction",
    payload: { fixtureId: "fx-high" },
    now: new Date("2026-04-17T19:01:00.000Z"),
    priority: 10,
    scheduledFor: new Date("2026-04-17T19:05:00.000Z"),
  });

  const firstClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:05:00.000Z"));
  assert.ok(firstClaim);
  assert.equal(firstClaim.task.id, "queue:test:high");

  const failed = await queue.fail(
    firstClaim.task.id,
    firstClaim.taskRun.id,
    "provider timeout",
    new Date("2026-04-17T19:06:00.000Z"),
  );
  assert.equal(failed.task.status, "failed");
  assert.equal(failed.taskRun.error, "provider timeout");

  const requeued = await queue.requeue(firstClaim.task.id, new Date("2026-04-17T19:07:00.000Z"));
  assert.equal(requeued.status, "queued");

  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:08:00.000Z"));
  assert.ok(secondClaim);
  assert.equal(secondClaim.task.id, "queue:test:high");
  assert.equal(secondClaim.taskRun.attemptNumber, 2);
});

test("in-memory queue adapter rejects completing a task with a taskRun from another task", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:first",
    kind: "prediction",
    payload: { fixtureId: "fx-first" },
    now: new Date("2026-04-17T20:00:00.000Z"),
  });
  await queue.enqueue({
    id: "queue:test:second",
    kind: "prediction",
    payload: { fixtureId: "fx-second" },
    now: new Date("2026-04-17T20:01:00.000Z"),
  });

  const firstClaim = await queue.claimNext(undefined, new Date("2026-04-17T20:02:00.000Z"));
  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T20:03:00.000Z"));

  assert.ok(firstClaim);
  assert.ok(secondClaim);
  await assert.rejects(
    queue.complete(firstClaim.task.id, secondClaim.taskRun.id, new Date("2026-04-17T20:04:00.000Z")),
    /does not belong/,
  );
});

test("in-memory queue adapter rejects closing a stale task run after requeue", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:stale",
    kind: "prediction",
    payload: { fixtureId: "fx-stale" },
    now: new Date("2026-04-17T21:00:00.000Z"),
  });

  const firstClaim = await queue.claimNext(undefined, new Date("2026-04-17T21:01:00.000Z"));
  assert.ok(firstClaim);

  await queue.fail(firstClaim.task.id, firstClaim.taskRun.id, "temporary", new Date("2026-04-17T21:02:00.000Z"));
  await queue.requeue(firstClaim.task.id, new Date("2026-04-17T21:03:00.000Z"));
  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T21:04:00.000Z"));

  assert.ok(secondClaim);
  await assert.rejects(
    queue.complete(firstClaim.task.id, firstClaim.taskRun.id, new Date("2026-04-17T21:05:00.000Z")),
    /is not running/,
  );
});

test("in-memory queue adapter serializes claims across adapters sharing the same unit of work", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const firstQueue = createInMemoryTaskQueueAdapter(unitOfWork);
  const secondQueue = createInMemoryTaskQueueAdapter(unitOfWork);

  await firstQueue.enqueue({
    id: "queue:test:shared-claim",
    kind: "prediction",
    payload: { fixtureId: "fx-shared" },
    now: new Date("2026-04-17T22:00:00.000Z"),
  });

  const [firstClaim, secondClaim] = await Promise.all([
    firstQueue.claimNext(undefined, new Date("2026-04-17T22:01:00.000Z")),
    secondQueue.claimNext(undefined, new Date("2026-04-17T22:01:00.000Z")),
  ]);

  const successfulClaims = [firstClaim, secondClaim].filter((claim) => claim !== null);
  assert.equal(successfulClaims.length, 1);
  assert.equal(successfulClaims[0]?.task.id, "queue:test:shared-claim");
});
