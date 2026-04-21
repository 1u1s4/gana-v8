import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  createInMemoryTaskQueueAdapter,
} from "../src/index.js";

test("in-memory queue adapter enqueues, claims, completes and summarizes tasks", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  const enqueued = await queue.enqueue({
    kind: "prediction",
    payload: { fixtureId: "fx-1" },
    now: new Date("2026-04-17T18:00:00.000Z"),
    priority: 50,
  });

  assert.match(enqueued.id, /^tsk_[a-f0-9]{16}$/);

  const claim = await queue.claimNext(undefined, new Date("2026-04-17T18:01:00.000Z"));
  assert.ok(claim);
  assert.equal(claim.task.id, enqueued.id);
  assert.equal(claim.task.status, "running");
  assert.equal(claim.taskRun.attemptNumber, 1);
  assert.match(claim.taskRun.id, /^trn_[a-f0-9]{16}$/);

  const execution = await queue.complete(claim.task.id, claim.taskRun.id, new Date("2026-04-17T18:02:00.000Z"));
  assert.equal(execution.task.status, "succeeded");
  assert.equal(execution.taskRun.status, "succeeded");

  const summary = await queue.summary();
  assert.equal(summary.total, 1);
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.latestTasks[0]?.id, enqueued.id);
});

test("in-memory queue adapter can claim a specific ready task by id without consuming neighbors", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:claim-target",
    kind: "prediction",
    payload: { fixtureId: "fx-target" },
    now: new Date("2026-04-17T18:10:00.000Z"),
    priority: 1,
  });
  await queue.enqueue({
    id: "queue:test:claim-neighbor",
    kind: "prediction",
    payload: { fixtureId: "fx-neighbor" },
    now: new Date("2026-04-17T18:11:00.000Z"),
    priority: 10,
  });

  const targetedClaim = await queue.claim("queue:test:claim-target", new Date("2026-04-17T18:12:00.000Z"));
  assert.ok(targetedClaim);
  assert.equal(targetedClaim.task.id, "queue:test:claim-target");
  assert.equal(targetedClaim.taskRun.attemptNumber, 1);

  const nextClaim = await queue.claimNext(undefined, new Date("2026-04-17T18:13:00.000Z"));
  assert.ok(nextClaim);
  assert.equal(nextClaim.task.id, "queue:test:claim-neighbor");
});

test("in-memory queue adapter auto-retries failed tasks with backoff and a new attempt", async () => {
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
    maxAttempts: 3,
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
  assert.equal(failed.task.status, "queued");
  assert.equal(failed.task.triggerKind, "retry");
  assert.equal(failed.task.lastErrorMessage, "provider timeout");
  assert.equal(failed.task.scheduledFor, "2026-04-17T19:07:00.000Z");
  assert.equal(failed.taskRun.error, "provider timeout");
  assert.equal(failed.taskRun.retryScheduledFor, "2026-04-17T19:07:00.000Z");

  const prematureClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:06:30.000Z"));
  assert.equal(prematureClaim?.task.id, "queue:test:low");

  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:07:00.000Z"));
  assert.ok(secondClaim);
  assert.equal(secondClaim.task.id, "queue:test:high");
  assert.equal(secondClaim.taskRun.attemptNumber, 2);
});


test("in-memory queue adapter quarantines tasks after exhausting max attempts", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:max-attempts",
    kind: "prediction",
    payload: { fixtureId: "fx-max-attempts" },
    now: new Date("2026-04-17T19:30:00.000Z"),
    maxAttempts: 1,
  });

  const claim = await queue.claimNext(undefined, new Date("2026-04-17T19:31:00.000Z"));
  assert.ok(claim);

  const failed = await queue.fail(
    claim.task.id,
    claim.taskRun.id,
    "permanent failure",
    new Date("2026-04-17T19:32:00.000Z"),
  );

  assert.equal(failed.task.status, "quarantined");
  assert.equal(failed.task.triggerKind, "system");
  assert.equal(failed.task.lastErrorMessage, "permanent failure");
  assert.equal(failed.task.scheduledFor, undefined);
  assert.equal(failed.taskRun.retryScheduledFor, undefined);
  assert.equal(await queue.claimNext(undefined, new Date("2026-04-17T19:33:00.000Z")), null);
});

test("in-memory queue adapter renews leases for running tasks and delays recovery", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:renew-lease",
    kind: "prediction",
    payload: { fixtureId: "fx-renew-lease" },
    now: new Date("2026-04-17T19:40:00.000Z"),
  });

  const firstClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:41:00.000Z"));
  assert.ok(firstClaim);

  const renewed = await queue.renewLease(
    firstClaim.task.id,
    firstClaim.taskRun.id,
    new Date("2026-04-17T19:45:00.000Z"),
    5 * 60 * 1000,
  );
  assert.equal(renewed.task.status, "running");
  assert.equal(renewed.task.leaseExpiresAt, "2026-04-17T19:50:00.000Z");

  const beforeExpiry = await queue.claimNext(undefined, new Date("2026-04-17T19:49:59.000Z"));
  assert.equal(beforeExpiry, null);

  const reclaimed = await queue.claimNext(undefined, new Date("2026-04-17T19:50:01.000Z"));
  assert.ok(reclaimed);
  assert.equal(reclaimed.task.id, firstClaim.task.id);
  assert.equal(reclaimed.taskRun.attemptNumber, 2);
});

test("in-memory queue adapter can explicitly quarantine a running task and later requeue it", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:manual-quarantine",
    kind: "prediction",
    payload: { fixtureId: "fx-manual-quarantine" },
    now: new Date("2026-04-17T19:55:00.000Z"),
  });

  const firstClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:56:00.000Z"));
  assert.ok(firstClaim);

  const quarantined = await queue.quarantine(
    firstClaim.task.id,
    firstClaim.taskRun.id,
    "operator requested quarantine",
    new Date("2026-04-17T19:57:00.000Z"),
  );
  assert.equal(quarantined.task.status, "quarantined");
  assert.equal(quarantined.task.lastErrorMessage, "operator requested quarantine");
  assert.equal(quarantined.taskRun.status, "failed");
  assert.equal(await queue.claimNext(undefined, new Date("2026-04-17T19:58:00.000Z")), null);

  const requeued = await queue.requeue(firstClaim.task.id, new Date("2026-04-17T19:59:00.000Z"));
  assert.equal(requeued.status, "queued");

  const reclaimed = await queue.claimNext(undefined, new Date("2026-04-17T20:00:00.000Z"));
  assert.ok(reclaimed);
  assert.equal(reclaimed.task.id, firstClaim.task.id);
  assert.equal(reclaimed.taskRun.attemptNumber, 2);
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

test("in-memory queue adapter rejects closing a stale task run after automatic retry reschedule", async () => {
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
  assert.ok(firstClaim.task.leaseExpiresAt);
  assert.equal(firstClaim.task.leaseOwner, "in-memory-queue");

  const retried = await queue.fail(
    firstClaim.task.id,
    firstClaim.taskRun.id,
    "temporary",
    new Date("2026-04-17T21:02:00.000Z"),
  );
  assert.equal(retried.task.status, "queued");
  assert.equal(retried.task.leaseOwner, undefined);
  assert.equal(retried.task.leaseExpiresAt, undefined);

  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T21:03:00.000Z"));

  assert.ok(secondClaim);
  await assert.rejects(
    queue.complete(firstClaim.task.id, firstClaim.taskRun.id, new Date("2026-04-17T21:05:00.000Z")),
    /is not running/,
  );
});

test("in-memory queue adapter recovers expired leases and allows reclaiming the task", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const queue = createInMemoryTaskQueueAdapter(unitOfWork);

  await queue.enqueue({
    id: "queue:test:expired-lease",
    kind: "prediction",
    payload: { fixtureId: "fx-expired" },
    now: new Date("2026-04-17T22:00:00.000Z"),
  });

  const firstClaim = await queue.claimNext(undefined, new Date("2026-04-17T22:01:00.000Z"));
  assert.ok(firstClaim);
  assert.equal(firstClaim.task.status, "running");
  assert.equal(firstClaim.task.leaseExpiresAt, "2026-04-17T22:06:00.000Z");

  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T22:06:01.000Z"));
  assert.ok(secondClaim);
  assert.equal(secondClaim.task.id, firstClaim.task.id);
  assert.equal(secondClaim.task.status, "running");
  assert.equal(secondClaim.taskRun.attemptNumber, 2);
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
