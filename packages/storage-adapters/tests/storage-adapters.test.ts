import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  createAiRun,
  createAuditEvent,
  createDailyAutomationPolicy,
  createFixture,
  createFixtureWorkflow,
  createLeagueCoveragePolicy,
  createParlay,
  createPrediction,
  createSandboxNamespace,
  createTask,
  createTaskRun,
  createTeamCoveragePolicy,
  createValidation,
} from "@gana-v8/domain-core";

import {
  PrismaTaskRepository,
  PrismaSandboxNamespaceRepository,
  aiRunDomainToCreateInput,
  aiRunRecordToDomain,
  assertSchemaReadiness,
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
  taskDomainToCreateInput,
  taskAttemptToTaskRunInput,
  taskRecordToDomain,
  taskRunDomainToCreateInput,
  taskRunRecordToDomain,
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

  const leaguePolicy = createLeagueCoveragePolicy({
    id: "lcp-epl-2026",
    provider: "api-football",
    leagueKey: "39",
    leagueName: "Premier League",
    season: 2026,
    enabled: true,
    alwaysOn: true,
    priority: 100,
    marketsAllowed: ["moneyline", "totals"],
  });

  const teamPolicy = createTeamCoveragePolicy({
    id: "tcp-liverpool",
    provider: "api-football",
    teamKey: "40",
    teamName: "Liverpool",
    enabled: true,
    alwaysTrack: true,
    priority: 95,
    followHome: true,
    followAway: true,
    forceResearch: true,
  });

  const dailyPolicy = createDailyAutomationPolicy({
    id: "dap-default",
    policyName: "default-football-daily",
    enabled: true,
    timezone: "America/Guatemala",
    minAllowedOdd: 1.2,
    defaultMaxFixturesPerRun: 30,
    defaultLookaheadHours: 24,
    defaultLookbackHours: 6,
    requireTrackedLeagueOrTeam: true,
    allowManualInclusionBypass: true,
  });

  await uow.fixtures.save(fixture);
  await uow.predictions.save(prediction);
  await uow.parlays.save(parlay);
  await uow.validations.save(validation);
  const workflow = createFixtureWorkflow({
    fixtureId: fixture.id,
    ingestionStatus: "succeeded",
    oddsStatus: "pending",
    enrichmentStatus: "pending",
    candidateStatus: "pending",
    predictionStatus: "pending",
    parlayStatus: "pending",
    validationStatus: "pending",
    isCandidate: false,
    lastIngestedAt: "2026-04-14T19:59:00.000Z",
    manualSelectionStatus: "selected",
    manualSelectionBy: "ops-user",
    manualSelectionReason: "Important televised match",
    manuallySelectedAt: "2026-04-14T20:02:00.000Z",
    selectionOverride: "force-include",
    overrideReason: "Pinned by operator",
    overriddenAt: "2026-04-14T20:03:00.000Z",
    diagnostics: {
      research: { lean: "home" },
      notes: ["derby", "premium-slate"],
    },
  });

  await uow.auditEvents.save(auditEvent);
  await uow.taskRuns.save(taskRun);
  await uow.sandboxNamespaces.save(sandbox);
  await uow.fixtureWorkflows.save(workflow);
  await uow.leagueCoveragePolicies.save(leaguePolicy);
  await uow.teamCoveragePolicies.save(teamPolicy);
  await uow.dailyAutomationPolicies.save(dailyPolicy);

  assert.equal(
    (await uow.fixtures.findByCompetition("Premier League")).length,
    1,
  );
  assert.equal((await uow.predictions.findByFixtureId(fixture.id)).length, 1);
  assert.equal((await uow.parlays.findByPredictionId(prediction.id)).length, 1);
  assert.equal((await uow.validations.findByTargetId(parlay.id)).length, 1);
  assert.equal((await uow.auditEvents.findByAggregate("parlay", parlay.id)).length, 1);
  assert.equal((await uow.taskRuns.findByTaskId(taskRun.taskId)).length, 1);
  assert.equal((await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.fixtureId, fixture.id);
  assert.equal(
    (await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.manualSelectionStatus,
    "selected",
  );
  assert.equal(
    (await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.selectionOverride,
    "force-include",
  );
  assert.deepEqual((await uow.fixtureWorkflows.findByFixtureId(fixture.id))?.diagnostics, {
    research: { lean: "home" },
    notes: ["derby", "premium-slate"],
  });
  assert.equal((await uow.leagueCoveragePolicies.findEnabled()).length, 1);
  assert.equal((await uow.teamCoveragePolicies.findEnabled()).length, 1);
  assert.equal((await uow.dailyAutomationPolicies.findEnabled()).length, 1);
  assert.equal((await uow.dailyAutomationPolicies.getById(dailyPolicy.id))?.minAllowedOdd, 1.2);
  assert.equal(
    (await uow.sandboxNamespaces.findByEnvironment("sandbox")).length,
    1,
  );
});

test("taskAttemptToTaskRunInput emits opaque trn task run ids", () => {
  const taskRun = taskAttemptToTaskRunInput(
    "tsk_1234567890abcdef",
    {
      startedAt: "2026-04-20T13:55:00.000Z",
      finishedAt: "2026-04-20T13:56:00.000Z",
    },
    1,
  );

  assert.match(taskRun.id, /^trn_[a-f0-9]{16}$/);
  assert.equal(taskRun.attemptNumber, 1);
});

test("prisma mappers preserve ai-run metadata roundtrip shape", () => {
  const aiRun = createAiRun({
    id: "ai-run-1",
    taskId: "task-1",
    provider: "codex",
    model: "gpt-5.4",
    promptVersion: "v8-slice-3",
    status: "failed",
    providerRequestId: "req-ai-1",
    usage: {
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    },
    outputRef: "s3://bucket/run.json",
    error: "provider timeout",
    fallbackReason: "provider timeout",
    degraded: true,
    createdAt: "2026-04-18T00:00:00.000Z",
    updatedAt: "2026-04-18T00:01:00.000Z",
  });

  const prismaInput = aiRunDomainToCreateInput(aiRun);
  const roundTrip = aiRunRecordToDomain({
    ...prismaInput,
    providerRequestId: prismaInput.providerRequestId ?? null,
    usagePromptTokens: prismaInput.usagePromptTokens ?? null,
    usageCompletionTokens: prismaInput.usageCompletionTokens ?? null,
    usageTotalTokens: prismaInput.usageTotalTokens ?? null,
    outputRef: prismaInput.outputRef ?? null,
    error: prismaInput.error ?? null,
    fallbackReason: prismaInput.fallbackReason ?? null,
    degraded: prismaInput.degraded ?? null,
    createdAt: new Date(aiRun.createdAt),
    updatedAt: new Date(aiRun.updatedAt),
  });

  assert.equal(roundTrip.providerRequestId, "req-ai-1");
  assert.equal(roundTrip.fallbackReason, "provider timeout");
  assert.equal(roundTrip.degraded, true);
  assert.deepEqual(roundTrip.usage, aiRun.usage);
});

test("prisma mappers preserve long task, task-run, ai-run and validation errors without truncation", () => {
  const longError = "provider timeout :: " + "x".repeat(1200);
  const longSummary = "validation summary :: " + "y".repeat(1200);

  const task = createTask({
    id: "task-long-error",
    kind: "odds-ingestion",
    status: "failed",
    priority: 80,
    payload: { fixtureId: "fixture:api-football:1492226" },
    lastErrorMessage: longError,
    createdAt: "2026-04-19T18:00:00.000Z",
    updatedAt: "2026-04-19T18:01:00.000Z",
  });
  const taskRun = createTaskRun({
    id: "task-long-error:attempt:1",
    taskId: task.id,
    attemptNumber: 1,
    status: "failed",
    startedAt: "2026-04-19T18:00:00.000Z",
    finishedAt: "2026-04-19T18:01:00.000Z",
    error: longError,
    result: { message: longError },
  });
  const aiRun = createAiRun({
    id: "ai-long-error",
    taskId: task.id,
    provider: "codex",
    model: "gpt-5.4",
    promptVersion: "v8-phase-0",
    status: "failed",
    error: longError,
    fallbackReason: longError,
    createdAt: "2026-04-19T18:00:00.000Z",
    updatedAt: "2026-04-19T18:01:00.000Z",
  });
  const validation = createValidation({
    id: "validation-long-summary",
    targetType: "task",
    targetId: task.id,
    kind: "sandbox-regression",
    status: "failed",
    checks: [{ code: "task-error", message: longError, passed: false }],
    summary: longSummary,
    executedAt: "2026-04-19T18:02:00.000Z",
    createdAt: "2026-04-19T18:02:00.000Z",
    updatedAt: "2026-04-19T18:02:00.000Z",
  });

  const taskInput = taskDomainToCreateInput(task);
  const taskRoundTrip = taskRecordToDomain({
    ...taskInput,
    payload: task.payload,
    lastErrorMessage: taskInput.lastErrorMessage ?? null,
    taskRuns: [],
  } as never);
  const taskRunInput = taskRunDomainToCreateInput(taskRun);
  const taskRunRoundTrip = taskRunRecordToDomain({
    ...taskRunInput,
    error: taskRunInput.error ?? null,
    result: taskRunInput.result ?? null,
  } as never);
  const aiRunInput = aiRunDomainToCreateInput(aiRun);
  const aiRunRoundTrip = aiRunRecordToDomain({
    ...aiRunInput,
    providerRequestId: aiRunInput.providerRequestId ?? null,
    usagePromptTokens: aiRunInput.usagePromptTokens ?? null,
    usageCompletionTokens: aiRunInput.usageCompletionTokens ?? null,
    usageTotalTokens: aiRunInput.usageTotalTokens ?? null,
    outputRef: aiRunInput.outputRef ?? null,
    error: aiRunInput.error ?? null,
    fallbackReason: aiRunInput.fallbackReason ?? null,
    degraded: aiRunInput.degraded ?? null,
  } as never);
  const validationInput = validationDomainToCreateInput(validation);
  const validationRoundTrip = validationRecordToDomain({
    ...validationInput,
    checks: validation.checks,
    summary: validationInput.summary,
  } as never);

  assert.equal(taskRoundTrip.lastErrorMessage, longError);
  assert.equal(taskRunRoundTrip.error, longError);
  assert.equal(aiRunRoundTrip.error, longError);
  assert.equal(aiRunRoundTrip.fallbackReason, longError);
  assert.equal(validationRoundTrip.summary, longSummary);
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
    triggerKind: "system",
    priority: 7,
    payload: { fixtureId: "fx-99" },
    maxAttempts: 3,
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

test("root prisma schema stores operational errors and summaries in text columns", () => {
  const schema = execFileSync(
    "node",
    [
      "-e",
      "const fs=require('fs');process.stdout.write(fs.readFileSync(process.argv[1],'utf8'))",
      new URL("../../../../prisma/schema.prisma", import.meta.url).pathname,
    ],
  ).toString();

  assert.match(schema, /lastErrorMessage\s+String\?\s+@db\.Text/);
  assert.match(schema, /error\s+String\?\s+@db\.Text/);
  assert.match(schema, /summary\s+String\s+@db\.Text/);
});

test("assertSchemaReadiness surfaces actionable guidance when migrations are pending", () => {
  assert.throws(
    () =>
      assertSchemaReadiness({
        execFileSyncImpl: () => {
          const error = new Error("migrate status failed") as Error & {
            stdout?: Buffer;
            stderr?: Buffer;
          };
          error.stdout = Buffer.from("Following migration have not yet been applied: 20260419_phase0_error_text_columns");
          error.stderr = Buffer.from("");
          throw error;
        },
      }),
    /db:migrate:deploy/i,
  );
});
