import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { createPersistedTaskQueue, enqueuePersistedTask, maybeClaimNextPersistedTask, runNextPersistedTask } from "../src/index.js";

const createPrismaClient = (databaseUrl: string) => new PrismaClient({ datasourceUrl: databaseUrl });
const databaseUrl = process.env.DATABASE_URL;
const testWithDatabase = (
  name: string,
  fn: (databaseUrl: string) => Promise<void> | void,
) =>
  test(name, { skip: databaseUrl ? false : "requires DATABASE_URL" }, async () => {
    await fn(databaseUrl!);
  });

const cleanupTaskPrefix = async (databaseUrl: string, prefix: string): Promise<void> => {
  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.taskRun.deleteMany({ where: { taskId: { startsWith: prefix } } });
    await prisma.task.deleteMany({ where: { id: { startsWith: prefix } } });
  } finally {
    await prisma.$disconnect();
  }
};

testWithDatabase("persisted queue renewLease extends the lease window and delays recovery", async (databaseUrl) => {
  const prefix = `phase1-renew-${Date.now()}`;
  const queue = createPersistedTaskQueue(databaseUrl);

  await cleanupTaskPrefix(databaseUrl, prefix);

  try {
    await enqueuePersistedTask(databaseUrl, {
      id: `${prefix}-task`,
      kind: "sandbox-replay",
      payload: { fixtureId: "fx-phase1-renew", market: "moneyline" },
      now: new Date("2026-04-17T19:40:00.000Z"),
    });

    const firstClaim = await queue.claimNext("sandbox-replay", new Date("2026-04-17T19:41:00.000Z"));
    assert.ok(firstClaim);

    const renewed = await queue.renewLease(
      firstClaim.task.id,
      firstClaim.taskRun.id,
      new Date("2026-04-17T19:45:00.000Z"),
      5 * 60 * 1000,
    );

    assert.equal(renewed.task.status, "running");

    const beforeExpiry = await maybeClaimNextPersistedTask(
      databaseUrl,
      "sandbox-replay",
      new Date("2026-04-17T19:49:59.000Z"),
    );
    assert.equal(beforeExpiry, null);

    const reclaimed = await maybeClaimNextPersistedTask(
      databaseUrl,
      "sandbox-replay",
      new Date("2026-04-17T19:50:01.000Z"),
    );
    assert.ok(reclaimed);
    assert.equal(reclaimed.task.id, firstClaim.task.id);
    assert.equal(reclaimed.taskRun.attemptNumber, 2);
  } finally {
    await queue.close();
    await cleanupTaskPrefix(databaseUrl, prefix);
  }
});

testWithDatabase("persisted queue quarantines exhausted tasks and allows manual redrive", async (databaseUrl) => {
  const prefix = `phase1-quarantine-${Date.now()}`;
  const queue = createPersistedTaskQueue(databaseUrl);

  await cleanupTaskPrefix(databaseUrl, prefix);

  try {
    await enqueuePersistedTask(databaseUrl, {
      id: `${prefix}-task`,
      kind: "sandbox-replay",
      payload: { fixtureId: "fx-phase1-quarantine", market: "moneyline" },
      now: new Date("2026-04-17T19:55:00.000Z"),
      maxAttempts: 1,
    });

    const firstClaim = await queue.claimNext("sandbox-replay", new Date("2026-04-17T19:56:00.000Z"));
    assert.ok(firstClaim);

    const failed = await queue.fail(
      firstClaim.task.id,
      firstClaim.taskRun.id,
      "permanent failure",
      new Date("2026-04-17T19:57:00.000Z"),
    );
    assert.equal(failed.task.status, "quarantined");
    assert.equal(failed.taskRun.status, "failed");
    assert.equal(await maybeClaimNextPersistedTask(databaseUrl, "sandbox-replay", new Date("2026-04-17T19:58:00.000Z")), null);

    const requeued = await queue.requeue(firstClaim.task.id, new Date("2026-04-17T19:59:00.000Z"));
    assert.equal(requeued.status, "queued");

    const reclaimed = await maybeClaimNextPersistedTask(
      databaseUrl,
      "sandbox-replay",
      new Date("2026-04-17T20:00:00.000Z"),
    );
    assert.ok(reclaimed);
    assert.equal(reclaimed.task.id, firstClaim.task.id);
    assert.equal(reclaimed.taskRun.attemptNumber, 2);
  } finally {
    await queue.close();
    await cleanupTaskPrefix(databaseUrl, prefix);
  }
});

testWithDatabase("runNextPersistedTask applies retry backoff before quarantining exhausted failures", async (databaseUrl) => {
  const prefix = `phase1-run-next-${Date.now()}`;

  await cleanupTaskPrefix(databaseUrl, prefix);

  try {
    await enqueuePersistedTask(databaseUrl, {
      id: `${prefix}-task`,
      kind: "sandbox-replay",
      payload: { fixtureId: "fx-phase1-run-next", market: "moneyline" },
      now: new Date("2026-04-17T20:05:00.000Z"),
      maxAttempts: 2,
    });

    const handlers = {
      research: async () => ({}),
      prediction: async () => ({}),
      "sandbox-replay": async () => {
        throw new Error("sandbox replay failed");
      },
    } as const;

    const firstExecution = await runNextPersistedTask(databaseUrl, handlers, {
      kind: "sandbox-replay",
      now: new Date("2026-04-17T20:06:00.000Z"),
    });
    assert.ok(firstExecution);
    assert.equal(firstExecution.task.status, "queued");
    assert.equal(firstExecution.task.triggerKind, "retry");
    assert.equal(firstExecution.taskRun.status, "failed");
    assert.equal(firstExecution.taskRun.attemptNumber, 1);
    assert.equal(firstExecution.error?.message, "sandbox replay failed");

    const beforeBackoff = await runNextPersistedTask(databaseUrl, handlers, {
      kind: "sandbox-replay",
      now: new Date("2026-04-17T20:06:59.000Z"),
    });
    assert.equal(beforeBackoff, null);

    const secondExecution = await runNextPersistedTask(databaseUrl, handlers, {
      kind: "sandbox-replay",
      now: new Date("2026-04-17T20:07:01.000Z"),
    });
    assert.ok(secondExecution);
    assert.equal(secondExecution.task.status, "quarantined");
    assert.equal(secondExecution.taskRun.status, "failed");
    assert.equal(secondExecution.taskRun.attemptNumber, 2);
    assert.equal(secondExecution.error?.message, "sandbox replay failed");
    assert.equal(
      await maybeClaimNextPersistedTask(databaseUrl, "sandbox-replay", new Date("2026-04-17T20:08:00.000Z")),
      null,
    );
  } finally {
    await cleanupTaskPrefix(databaseUrl, prefix);
  }
});
