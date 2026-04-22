import test from "node:test";
import assert from "node:assert/strict";

import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  createInMemoryTaskQueueAdapter,
  createPrismaTaskQueueAdapter,
  type QueueTaskEntity,
  type QueueTaskRunEntity,
  type QueueUnitOfWorkLike,
} from "../src/index.js";

interface PrismaTaskUpdateCall {
  readonly where: Record<string, unknown>;
  readonly data: Record<string, unknown>;
}

const cloneTask = (task: QueueTaskEntity): QueueTaskEntity => structuredClone(task);

const cloneTaskRun = (taskRun: QueueTaskRunEntity): QueueTaskRunEntity => structuredClone(taskRun);

const createMockPrismaQueueHarness = (): {
  readonly client: {
    readonly task: {
      updateMany(args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }): Promise<{ count: number }>;
    };
    $transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T>;
  };
  readonly unitOfWork: QueueUnitOfWorkLike;
  readonly updateCalls: PrismaTaskUpdateCall[];
} => {
  const taskStore = new Map<string, QueueTaskEntity>();
  const taskRunStore = new Map<string, QueueTaskRunEntity>();
  const updateCalls: PrismaTaskUpdateCall[] = [];

  const applyTaskData = (
    task: QueueTaskEntity,
    data: Record<string, unknown>,
  ): QueueTaskEntity => {
    const next = cloneTask(task) as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (value === null) {
        delete next[key];
        continue;
      }

      next[key] = value instanceof Date ? value.toISOString() : value;
    }

    return next as QueueTaskEntity;
  };

  const matchesTaskWhere = (
    task: QueueTaskEntity,
    where: Record<string, unknown>,
  ): boolean =>
    Object.entries(where).every(([key, condition]) => {
      const value = (task as Record<string, unknown>)[key];
      if (
        condition &&
        typeof condition === "object" &&
        !(condition instanceof Date) &&
        !Array.isArray(condition)
      ) {
        const dateValue =
          typeof value === "string" ? Date.parse(value) : Number.NaN;
        if ("gt" in condition) {
          return Number.isFinite(dateValue) && dateValue > (condition.gt as Date).getTime();
        }

        if ("lte" in condition) {
          return Number.isFinite(dateValue) && dateValue <= (condition.lte as Date).getTime();
        }

        return false;
      }

      if (condition === null) {
        return value === null || value === undefined;
      }

      return value === condition;
    });

  const unitOfWork: QueueUnitOfWorkLike = {
    tasks: {
      async save(task) {
        taskStore.set(task.id, cloneTask(task));
        return cloneTask(task);
      },
      async getById(id) {
        return taskStore.has(id) ? cloneTask(taskStore.get(id)!) : null;
      },
      async list() {
        return Array.from(taskStore.values(), (task) => cloneTask(task));
      },
      async findByStatus(status) {
        return Array.from(taskStore.values(), (task) => cloneTask(task)).filter(
          (task) => task.status === status,
        );
      },
    },
    taskRuns: {
      async save(taskRun) {
        taskRunStore.set(taskRun.id, cloneTaskRun(taskRun));
        return cloneTaskRun(taskRun);
      },
      async getById(id) {
        return taskRunStore.has(id) ? cloneTaskRun(taskRunStore.get(id)!) : null;
      },
      async findByTaskId(taskId) {
        return Array.from(taskRunStore.values(), (taskRun) => cloneTaskRun(taskRun))
          .filter((taskRun) => taskRun.taskId === taskId)
          .sort((left, right) => left.attemptNumber - right.attemptNumber);
      },
    },
  };

  const taskClient = {
    async updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }> {
      updateCalls.push({ where: { ...args.where }, data: { ...args.data } });

      const taskId = String(args.where.id);
      const task = taskStore.get(taskId);
      if (!task || !matchesTaskWhere(task, args.where)) {
        return { count: 0 };
      }

      taskStore.set(taskId, applyTaskData(task, args.data));
      return { count: 1 };
    },
  };

  return {
    client: {
      task: taskClient,
      async $transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T> {
        return callback({ task: taskClient });
      },
    },
    unitOfWork,
    updateCalls,
  };
};

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
  assert.equal(claim.task.activeTaskRunId, claim.taskRun.id);
  assert.equal(claim.task.claimedAt, "2026-04-17T18:01:00.000Z");
  assert.equal(claim.task.lastHeartbeatAt, "2026-04-17T18:01:00.000Z");

  const execution = await queue.complete(claim.task.id, claim.taskRun.id, new Date("2026-04-17T18:02:00.000Z"));
  assert.equal(execution.task.status, "succeeded");
  assert.equal(execution.taskRun.status, "succeeded");
  assert.equal(execution.task.activeTaskRunId, undefined);
  assert.equal(execution.task.leaseOwner, undefined);
  assert.equal(execution.task.leaseExpiresAt, undefined);
  assert.equal(execution.task.lastHeartbeatAt, "2026-04-17T18:02:00.000Z");

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
  assert.equal(firstClaim.task.activeTaskRunId, firstClaim.taskRun.id);

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
  assert.equal(failed.task.activeTaskRunId, undefined);
  assert.equal(failed.task.leaseOwner, undefined);
  assert.equal(failed.task.leaseExpiresAt, undefined);
  assert.equal(failed.taskRun.error, "provider timeout");
  assert.equal(failed.taskRun.retryScheduledFor, "2026-04-17T19:07:00.000Z");

  const prematureClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:06:30.000Z"));
  assert.equal(prematureClaim?.task.id, "queue:test:low");

  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T19:07:00.000Z"));
  assert.ok(secondClaim);
  assert.equal(secondClaim.task.id, "queue:test:high");
  assert.equal(secondClaim.taskRun.attemptNumber, 2);
  assert.equal(secondClaim.task.activeTaskRunId, secondClaim.taskRun.id);
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
  assert.equal(firstClaim.task.claimedAt, "2026-04-17T19:41:00.000Z");
  assert.equal(firstClaim.task.lastHeartbeatAt, "2026-04-17T19:41:00.000Z");

  const renewed = await queue.renewLease(
    firstClaim.task.id,
    firstClaim.taskRun.id,
    new Date("2026-04-17T19:45:00.000Z"),
    5 * 60 * 1000,
  );
  assert.equal(renewed.task.status, "running");
  assert.equal(renewed.task.leaseExpiresAt, "2026-04-17T19:50:00.000Z");
  assert.equal(renewed.task.lastHeartbeatAt, "2026-04-17T19:45:00.000Z");
  assert.equal(renewed.task.activeTaskRunId, firstClaim.taskRun.id);

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
  assert.equal(firstClaim.task.activeTaskRunId, firstClaim.taskRun.id);

  const secondClaim = await queue.claimNext(undefined, new Date("2026-04-17T22:06:01.000Z"));
  assert.ok(secondClaim);
  assert.equal(secondClaim.task.id, firstClaim.task.id);
  assert.equal(secondClaim.task.status, "running");
  assert.equal(secondClaim.taskRun.attemptNumber, 2);
  assert.equal(secondClaim.task.activeTaskRunId, secondClaim.taskRun.id);
  const closedFirstRun = await unitOfWork.taskRuns.getById(firstClaim.taskRun.id);
  assert.equal(closedFirstRun?.status, "failed");
  assert.equal(closedFirstRun?.error, "Task lease expired before completion.");
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

test("prisma queue adapter uses activeTaskRunId and lease CAS when recycling stale claims", async () => {
  const { client, unitOfWork, updateCalls } = createMockPrismaQueueHarness();
  const queue = createPrismaTaskQueueAdapter(client, unitOfWork, {
    createTransactionalUnitOfWork: () => unitOfWork,
  });

  const enqueued = await queue.enqueue({
    id: "queue:test:prisma-cas",
    kind: "prediction",
    payload: {
      fixtureId: "fx-prisma",
      manifestId: "manifest:fx-prisma",
      workflowId: "workflow:prediction",
      traceId: "trace:fx-prisma",
      correlationId: "correlation:fx-prisma",
      source: "scheduler",
    },
    now: new Date("2026-04-18T00:00:00.000Z"),
  });

  assert.equal(enqueued.manifestId, "manifest:fx-prisma");
  assert.equal(enqueued.workflowId, "workflow:prediction");
  assert.equal(enqueued.traceId, "trace:fx-prisma");
  assert.equal(enqueued.correlationId, "correlation:fx-prisma");
  assert.equal(enqueued.source, "scheduler");

  const firstClaim = await queue.claimNext(undefined, new Date("2026-04-18T00:01:00.000Z"));
  assert.ok(firstClaim);
  assert.equal(firstClaim.task.activeTaskRunId, firstClaim.taskRun.id);
  assert.equal(firstClaim.task.claimedAt, "2026-04-18T00:01:00.000Z");
  assert.equal(firstClaim.task.lastHeartbeatAt, "2026-04-18T00:01:00.000Z");

  const reclaimed = await queue.claimNext(undefined, new Date("2026-04-18T00:06:01.000Z"));
  assert.ok(reclaimed);
  assert.equal(reclaimed.task.id, firstClaim.task.id);
  assert.equal(reclaimed.taskRun.attemptNumber, 2);
  assert.equal(reclaimed.task.activeTaskRunId, reclaimed.taskRun.id);
  assert.notEqual(reclaimed.taskRun.id, firstClaim.taskRun.id);

  const recycleCall = updateCalls.find(
    (call) =>
      call.where.activeTaskRunId === firstClaim.taskRun.id &&
      typeof call.where.leaseExpiresAt === "object" &&
      call.where.leaseExpiresAt !== null &&
      "lte" in call.where.leaseExpiresAt,
  );
  assert.ok(recycleCall);

  const closedFirstRun = await unitOfWork.taskRuns.getById(firstClaim.taskRun.id);
  assert.equal(closedFirstRun?.status, "failed");
  assert.equal(closedFirstRun?.error, "Task lease expired before completion.");

  await assert.rejects(
    queue.complete(firstClaim.task.id, firstClaim.taskRun.id, new Date("2026-04-18T00:06:30.000Z")),
    /is not running/,
  );
});
