import assert from "node:assert/strict";
import test from "node:test";

import {
  SimpleCronScheduler,
  SimpleInMemoryQueue,
  buildExampleCronSpecs,
  consumeBudget,
  createTaskEnvelope,
  createWorkflowRouter,
  evaluateBudget,
  matchesCronSpec,
} from "../src/index.js";

test("createTaskEnvelope derives deterministic ids and policy defaults", () => {
  const envelope = createTaskEnvelope({
    intent: "ingest-fixtures",
    metadata: {
      labels: ["demo"],
      source: "test-suite",
    },
    payload: {
      league: "PL",
      window: {
        end: "2026-04-15T06:00:00.000Z",
        granularity: "daily",
        start: "2026-04-15T00:00:00.000Z",
      },
    },
    scheduledFor: "2026-04-15T00:00:00.000Z",
    taskKind: "fixture-ingestion",
    traceId: "trace-1",
    workflowId: "wf-1",
  });

  assert.match(envelope.id, /^tsk_/);
  assert.equal(envelope.policy.maxAttempts, 3);
  assert.equal(envelope.dedupeKey.includes("ingest-fixtures"), true);
});

test("budget helpers track consumption and reject exhausted policies", () => {
  const snapshot = consumeBudget(
    { attemptsUsed: 0, creditsUsed: 0, runtimeMsUsed: 0 },
    { attemptsUsed: 2, creditsUsed: 5, runtimeMsUsed: 2000 },
  );
  const decision = evaluateBudget(
    { maxAttempts: 1, maxCredits: 10, maxRuntimeMs: 5000 },
    snapshot,
  );

  assert.equal(snapshot.attemptsUsed, 2);
  assert.equal(decision.accepted, false);
  assert.deepEqual(decision.reasons, ["max_attempts_exhausted"]);
});

test("scheduler enqueues only due cron jobs once per minute", () => {
  const queue = new SimpleInMemoryQueue();
  const scheduler = new SimpleCronScheduler(buildExampleCronSpecs(), queue);
  const tickAt = new Date("2026-04-15T12:00:00.000Z");

  const firstTick = scheduler.tick(tickAt);
  const secondTick = scheduler.tick(tickAt);

  assert.equal(firstTick.dueJobCount, 2);
  assert.equal(secondTick.dueJobCount, 0);
  assert.equal(queue.peek().length, 2);
});

test("router dispatches handlers and queue drains ready tasks", async () => {
  const queue = new SimpleInMemoryQueue();
  const envelope = createTaskEnvelope({
    intent: "ingest-odds",
    metadata: {
      labels: ["demo", "odds"],
      source: "test-suite",
    },
    payload: {
      marketKeys: ["h2h"],
      window: {
        end: "2026-04-15T01:00:00.000Z",
        granularity: "intraday",
        start: "2026-04-15T00:00:00.000Z",
      },
    },
    scheduledFor: "2026-04-15T00:00:00.000Z",
    taskKind: "odds-ingestion",
    traceId: "trace-2",
    workflowId: "wf-2",
  });
  queue.enqueue(envelope);

  const reservation = queue.dequeue(new Date("2026-04-15T00:00:00.000Z"));
  assert.ok(reservation);

  const router = createWorkflowRouter([
    {
      intent: "ingest-odds",
      async handle(task) {
        return { observedWindowStart: String(task.payload.window) };
      },
    },
  ]);

  const result = await router.dispatch(reservation.envelope);
  queue.complete(reservation.envelope.id, result);

  assert.equal(result.status, "succeeded");
  assert.equal(queue.stats().completed, 1);
});

test("matchesCronSpec supports wildcards and step fields", () => {
  assert.equal(matchesCronSpec("*/15 * * * *", new Date("2026-04-15T12:30:00.000Z")), true);
  assert.equal(matchesCronSpec("0 */6 * * *", new Date("2026-04-15T12:00:00.000Z")), true);
  assert.equal(matchesCronSpec("0 */6 * * *", new Date("2026-04-15T13:00:00.000Z")), false);
});
