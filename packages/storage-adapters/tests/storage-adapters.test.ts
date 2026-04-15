import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  createAuditEvent,
  createFixture,
  createParlay,
  createPrediction,
  createSandboxNamespace,
  createTask,
  createTaskRun,
  createValidation,
} from "@gana-v8/domain-core";

import {
  PrismaTaskRepository,
  PrismaSandboxNamespaceRepository,
  auditEventDomainToCreateInput,
  auditEventRecordToDomain,
  createInMemoryUnitOfWork,
  createPrismaUnitOfWork,
  fixtureDomainToCreateInput,
  fixtureRecordToDomain,
  parlayRecordToDomain,
  predictionDomainToCreateInput,
  predictionRecordToDomain,
  sandboxNamespaceDomainToCreateInput,
  sandboxNamespaceRecordToDomain,
  taskRecordToDomain,
  validationDomainToCreateInput,
  validationRecordToDomain,
} from "../src/index.js";

test("in-memory repositories store and query core aggregates", async () => {
  const uow = createInMemoryUnitOfWork();

  const fixture = createFixture({
    id: "fx-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    scheduledAt: "2026-04-14T21:00:00.000Z",
    status: "scheduled",
    metadata: { source: "feed-a" },
  });

  const prediction = createPrediction({
    id: "pred-1",
    fixtureId: fixture.id,
    market: "moneyline",
    outcome: "home",
    status: "draft",
    confidence: 0.66,
    probabilities: { implied: 0.53, model: 0.66, edge: 0.13 },
    rationale: ["Home team projected xG advantage"],
  });

  const parlay = createParlay({
    id: "parlay-1",
    status: "ready",
    stake: 10,
    source: "automatic",
    legs: [
      {
        predictionId: prediction.id,
        fixtureId: fixture.id,
        market: "moneyline",
        outcome: "home",
        price: 1.9,
        status: "pending",
      },
    ],
    correlationScore: 0.08,
    expectedPayout: 19,
  });

  const validation = createValidation({
    id: "val-1",
    targetType: "parlay",
    targetId: parlay.id,
    kind: "parlay-settlement",
    status: "pending",
    checks: [],
    summary: "",
  });

  const auditEvent = createAuditEvent({
    id: "audit-1",
    aggregateType: "parlay",
    aggregateId: parlay.id,
    eventType: "parlay.created",
    actor: "tests",
    payload: { source: "storage-adapters.test" },
  });

  const taskRun = createTaskRun({
    id: "task-1:attempt:1",
    taskId: "task-1",
    attemptNumber: 1,
    status: "succeeded",
    startedAt: "2026-04-14T20:00:00.000Z",
    finishedAt: "2026-04-14T20:01:00.000Z",
  });

  const sandbox = createSandboxNamespace({
    id: "ns-1",
    environment: "sandbox",
    sandboxId: "sbx-100",
    scope: "smoke",
    storagePrefix: "sandbox://sbx-100",
    queuePrefix: "sbx-100-queue",
    metadata: { owner: "tests" },
  });

  await uow.fixtures.save(fixture);
  await uow.predictions.save(prediction);
  await uow.parlays.save(parlay);
  await uow.validations.save(validation);
  await uow.auditEvents.save(auditEvent);
  await uow.taskRuns.save(taskRun);
  await uow.sandboxNamespaces.save(sandbox);

  assert.equal(
    (await uow.fixtures.findByCompetition("Premier League")).length,
    1,
  );
  assert.equal((await uow.predictions.findByFixtureId(fixture.id)).length, 1);
  assert.equal((await uow.parlays.findByPredictionId(prediction.id)).length, 1);
  assert.equal((await uow.validations.findByTargetId(parlay.id)).length, 1);
  assert.equal((await uow.auditEvents.findByAggregate("parlay", parlay.id)).length, 1);
  assert.equal((await uow.taskRuns.findByTaskId(taskRun.taskId)).length, 1);
  assert.equal(
    (await uow.sandboxNamespaces.findByEnvironment("sandbox")).length,
    1,
  );
});

test("prisma mappers preserve domain roundtrip shape for core persisted entities", () => {
  const fixture = createFixture({
    id: "fx-2",
    sport: "football",
    competition: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    scheduledAt: "2026-04-20T19:00:00.000Z",
    status: "completed",
    score: { home: 2, away: 1 },
    metadata: { source: "feed-b" },
    createdAt: "2026-04-20T18:00:00.000Z",
    updatedAt: "2026-04-20T21:00:00.000Z",
  });
  const prediction = createPrediction({
    id: "pred-2",
    fixtureId: fixture.id,
    aiRunId: "airun-1",
    market: "moneyline",
    outcome: "home",
    status: "published",
    confidence: 0.61,
    probabilities: { implied: 0.49, model: 0.61, edge: 0.12 },
    rationale: ["Expected midfield edge"],
    publishedAt: "2026-04-20T18:30:00.000Z",
    createdAt: "2026-04-20T18:10:00.000Z",
    updatedAt: "2026-04-20T18:30:00.000Z",
  });
  const validation = createValidation({
    id: "val-2",
    targetType: "prediction",
    targetId: prediction.id,
    kind: "prediction-settlement",
    status: "passed",
    checks: [{ code: "market-known", message: "known", passed: true }],
    summary: "ok",
    executedAt: "2026-04-20T22:00:00.000Z",
    createdAt: "2026-04-20T21:55:00.000Z",
    updatedAt: "2026-04-20T22:00:00.000Z",
  });
  const auditEvent = createAuditEvent({
    id: "audit-2",
    aggregateType: "prediction",
    aggregateId: prediction.id,
    eventType: "prediction.published",
    payload: { rationaleCount: 1 },
    occurredAt: "2026-04-20T18:30:00.000Z",
    createdAt: "2026-04-20T18:30:00.000Z",
    updatedAt: "2026-04-20T18:30:00.000Z",
  });

  const fixtureInput = fixtureDomainToCreateInput(fixture);
  const predictionInput = predictionDomainToCreateInput(prediction);
  const validationInput = validationDomainToCreateInput(validation);
  const auditEventInput = auditEventDomainToCreateInput(auditEvent);
  const sandbox = createSandboxNamespace({
    id: "ns-2",
    environment: "sandbox",
    sandboxId: "sbx-200",
    scope: "regression",
    storagePrefix: "sandbox://sbx-200",
    queuePrefix: "sbx-200-queue",
    metadata: { owner: "tests" },
    createdAt: "2026-04-20T18:00:00.000Z",
    updatedAt: "2026-04-20T18:05:00.000Z",
  });
  const sandboxInput = sandboxNamespaceDomainToCreateInput(sandbox);

  assert.equal(new Date(fixtureInput.scheduledAt).toISOString(), fixture.scheduledAt);
  assert.equal(
    predictionInput.publishedAt
      ? new Date(predictionInput.publishedAt).toISOString()
      : undefined,
    prediction.publishedAt,
  );
  assert.equal(validationInput.targetType, "prediction");
  assert.equal(new Date(auditEventInput.occurredAt).toISOString(), auditEvent.occurredAt);
  assert.equal(sandboxInput.environment, "sandbox");

  assert.deepEqual(
    fixtureRecordToDomain({
      ...fixtureInput,
      metadata: fixture.metadata,
      scoreHome: 2,
      scoreAway: 1,
    } as never),
    fixture,
  );
  assert.deepEqual(
    predictionRecordToDomain({
      ...predictionInput,
      probabilities: prediction.probabilities,
      rationale: prediction.rationale,
    } as never),
    prediction,
  );
  assert.deepEqual(
    validationRecordToDomain({
      ...validationInput,
      checks: validation.checks,
    } as never),
    validation,
  );
  assert.deepEqual(
    auditEventRecordToDomain({
      ...auditEventInput,
      payload: auditEvent.payload,
    } as never),
    auditEvent,
  );
  assert.deepEqual(
    sandboxNamespaceRecordToDomain({
      ...sandboxInput,
      metadata: sandbox.metadata,
    } as never),
    sandbox,
  );

  const parlay = parlayRecordToDomain({
    id: "parlay-2",
    status: "submitted",
    stake: 5,
    source: "manual",
    correlationScore: 0.03,
    expectedPayout: 15,
    submittedAt: new Date("2026-04-20T18:45:00.000Z"),
    settledAt: null,
    createdAt: new Date("2026-04-20T18:40:00.000Z"),
    updatedAt: new Date("2026-04-20T18:45:00.000Z"),
    legs: [
      {
        id: "parlay-2:leg:0",
        parlayId: "parlay-2",
        predictionId: prediction.id,
        fixtureId: fixture.id,
        index: 0,
        market: "moneyline",
        outcome: "home",
        price: 2,
        status: "pending",
      },
    ],
  } as never);
  assert.equal(parlay.legs.length, 1);
  assert.equal(parlay.legs[0]?.predictionId, prediction.id);
});

test("prisma task repository rehydrates attempts from taskRuns", async () => {
  const taskStore = new Map<string, Record<string, unknown>>();

  const taskDelegate = {
    upsert: async ({ where, create, update }: Record<string, any>) => {
      const next = taskStore.has(where.id) ? update : create;
      const taskRunsCreate = next.taskRuns?.create ?? [];
      const record = {
        id: next.id,
        kind: next.kind,
        status: next.status,
        priority: next.priority,
        payload: next.payload,
        scheduledFor: next.scheduledFor ?? null,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
        taskRuns: taskRunsCreate.map((taskRun: Record<string, any>) => ({
          ...taskRun,
          taskId: where.id,
        })),
      };
      taskStore.set(where.id, record);
      return record;
    },
    findUnique: async ({ where }: Record<string, any>) => taskStore.get(where.id) ?? null,
    findMany: async () => Array.from(taskStore.values()),
    delete: async ({ where }: Record<string, any>) => {
      taskStore.delete(where.id);
    },
  };

  const repository = new PrismaTaskRepository({ task: taskDelegate } as never);
  const task = createTask({
    id: "task-2",
    kind: "prediction",
    status: "succeeded",
    priority: 7,
    payload: { fixtureId: "fx-99" },
    attempts: [
      {
        startedAt: "2026-04-20T10:00:00.000Z",
        finishedAt: "2026-04-20T10:02:00.000Z",
      },
    ],
    createdAt: "2026-04-20T09:59:00.000Z",
    updatedAt: "2026-04-20T10:02:00.000Z",
  });

  const saved = await repository.save(task);
  const loaded = await repository.getById(task.id);

  assert.deepEqual(saved, task);
  assert.deepEqual(loaded, task);
  assert.deepEqual(taskRecordToDomain(taskStore.get(task.id) as never), task);
});

test("prisma sandbox namespace repository persists and queries environments", async () => {
  const sandboxStore = new Map<string, Record<string, unknown>>();

  const sandboxNamespaceDelegate = {
    upsert: async ({ where, create, update }: Record<string, any>) => {
      const next = sandboxStore.has(where.id) ? update : create;
      const record = { ...next };
      sandboxStore.set(where.id, record);
      return record;
    },
    findUnique: async ({ where }: Record<string, any>) => sandboxStore.get(where.id) ?? null,
    findMany: async ({ where }: Record<string, any> = {}) =>
      Array.from(sandboxStore.values()).filter((record) =>
        where?.environment ? record.environment === where.environment : true,
      ),
    delete: async ({ where }: Record<string, any>) => {
      sandboxStore.delete(where.id);
    },
  };

  const repository = new PrismaSandboxNamespaceRepository({
    sandboxNamespace: sandboxNamespaceDelegate,
  } as never);
  const sandbox = createSandboxNamespace({
    id: "ns-3",
    environment: "sandbox",
    sandboxId: "sbx-300",
    scope: "smoke",
    storagePrefix: "sandbox://sbx-300",
    queuePrefix: "sbx-300-queue",
    metadata: { owner: "tests" },
    createdAt: "2026-04-20T12:00:00.000Z",
    updatedAt: "2026-04-20T12:05:00.000Z",
  });

  const saved = await repository.save(sandbox);
  const loaded = await repository.getById(sandbox.id);
  const filtered = await repository.findByEnvironment("sandbox");

  assert.deepEqual(saved, sandbox);
  assert.deepEqual(loaded, sandbox);
  assert.deepEqual(filtered, [sandbox]);
});

test("prisma unit of work now exposes sandbox namespace persistence", () => {
  const client = {
    fixture: {},
    task: {},
    taskRun: {},
    aiRun: {},
    prediction: {},
    parlay: {},
    parlayLeg: {},
    validation: {},
    auditEvent: {},
    sandboxNamespace: {},
  };

  const uow = createPrismaUnitOfWork(client as never);
  assert.ok(uow.sandboxNamespaces);
});

test("root prisma schema validates and generates client without a live database", () => {
  execFileSync("pnpm", ["db:validate"], { cwd: new URL("../../..", import.meta.url) });
  execFileSync("pnpm", ["db:generate"], { cwd: new URL("../../..", import.meta.url) });
});
