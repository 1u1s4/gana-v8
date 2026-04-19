import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import {
  createFixtureWorkflow,
  createAiRun,
  createFixture,
  createParlay,
  createPrediction,
  createTask,
  createTaskRun,
  createValidation,
} from "@gana-v8/domain-core";
import { createInMemoryUnitOfWork, createPrismaClient, createPrismaUnitOfWork } from "@gana-v8/storage-adapters";

import {
  applyFixtureManualSelection,
  applyFixtureSelectionOverride,
  createOperationSnapshot,
  createPublicApiHandlers,
  createPublicApiServer,
  createOperationalSummary,
  createTaskLogEntries,
  createDemoAiRuns,
  createDemoProviderStates,
  findAiRunById,
  findProviderStateByProvider,
  findTaskById,
  findTaskRunById,
  findParlayById,
  findPredictionById,
  findValidationById,
  getHealth,
  getValidationSummary,
  listFixtures,
  listOperationalLogs,
  listParlays,
  listPredictions,
  listTaskRuns,
  listTaskRunsByTaskId,
  listTasks,
  listValidations,
  loadOperationSnapshotFromDatabase,
  loadOperationSnapshotFromUnitOfWork,
  publicApiEndpointPaths,
  routePublicApiRequest,
} from "../src/index.js";

test("public api exposes ai runs and provider states", () => {
  const snapshot = createOperationSnapshot();
  const handlers = createPublicApiHandlers(snapshot);

  assert.equal(snapshot.aiRuns.length, 1);
  assert.equal(snapshot.providerStates.length, 1);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.id, snapshot.aiRuns[0]!.id);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedPredictionIds.length, 1);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedParlayIds.length, 1);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedPredictions[0]?.id, snapshot.predictions[0]!.id);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.linkedParlays[0]?.id, snapshot.parlays[0]!.id);
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.providerRequestId, "req-demo-scoring");
  assert.equal(findAiRunById(snapshot, snapshot.aiRuns[0]!.id)?.latestPromptVersion, snapshot.aiRuns[0]!.promptVersion);
  assert.equal(
    findProviderStateByProvider(snapshot, snapshot.providerStates[0]!.provider)?.provider,
    snapshot.providerStates[0]!.provider,
  );
  assert.equal(handlers.aiRuns()[0]?.provider, snapshot.aiRuns[0]?.provider);
  assert.equal(handlers.aiRuns()[0]?.providerRequestId, "req-demo-scoring");
  assert.equal(handlers.aiRunById(snapshot.aiRuns[0]!.id)?.linkedPredictionIds[0], snapshot.predictions[0]!.id);
  assert.equal(
    handlers.providerStateByProvider(snapshot.providerStates[0]!.provider)?.provider,
    snapshot.providerStates[0]!.provider,
  );
});

test("public api routes ai runs and provider states", () => {
  const snapshot = createOperationSnapshot({
    aiRuns: createDemoAiRuns(),
    providerStates: createDemoProviderStates(),
  });
  const handlers = createPublicApiHandlers(snapshot);

  assert.equal(routePublicApiRequest(handlers, publicApiEndpointPaths.aiRuns).status, 200);
  assert.equal(routePublicApiRequest(handlers, publicApiEndpointPaths.providerStates).status, 200);
  assert.equal(routePublicApiRequest(handlers, `/ai-runs/${snapshot.aiRuns[0]!.id}`).status, 200);
  assert.equal(
    routePublicApiRequest(handlers, `/provider-states/${encodeURIComponent(snapshot.providerStates[0]!.provider)}`).status,
    200,
  );
});

test("public api enriches AI run read models with provider request ids, fallback reason, and compatibility fields", () => {
  const failedAiRun = createAiRun({
    id: "airun-failed",
    taskId: "task-failed",
    provider: "codex",
    model: "gpt-5.4",
    promptVersion: "v8-slice-3",
    providerRequestId: "req-failed-1",
    status: "failed",
    outputRef: "memory://airuns/airun-failed.json",
    error: "AI-assisted scoring fallback to deterministic baseline: provider timeout",
    createdAt: "2026-04-15T00:03:00.000Z",
    updatedAt: "2026-04-15T00:04:00.000Z",
  });
  const snapshot = createOperationSnapshot({
    aiRuns: [
      {
        id: failedAiRun.id,
        taskId: failedAiRun.taskId,
        provider: failedAiRun.provider,
        model: failedAiRun.model,
        promptVersion: failedAiRun.promptVersion,
        latestPromptVersion: failedAiRun.promptVersion,
        ...(failedAiRun.providerRequestId ? { providerRequestId: failedAiRun.providerRequestId } : {}),
        status: failedAiRun.status,
        ...(failedAiRun.outputRef ? { outputRef: failedAiRun.outputRef } : {}),
        ...(failedAiRun.error
          ? {
              error: failedAiRun.error,
              fallbackReason: failedAiRun.error,
              degraded: true,
            }
          : {}),
        createdAt: failedAiRun.createdAt,
        updatedAt: failedAiRun.updatedAt,
      },
    ],
  });

  const aiRun = findAiRunById(snapshot, "airun-failed");

  assert.equal(aiRun?.providerRequestId, "req-failed-1");
  assert.equal(aiRun?.latestPromptVersion, "v8-slice-3");
  assert.equal(aiRun?.degraded, true);
  assert.match(aiRun?.fallbackReason ?? "", /provider timeout/i);
});

test("public api snapshot exposes fixtures, predictions, parlays, validations, validation summary, and health", () => {
  const snapshot = createOperationSnapshot();

  assert.equal(listFixtures(snapshot).length, 2);
  assert.equal(listTasks(snapshot).length, 1);
  assert.equal(listTaskRuns(snapshot).length, 1);
  assert.equal(snapshot.rawBatches.length, 0);
  assert.equal(snapshot.oddsSnapshots.length, 0);
  assert.equal(listPredictions(snapshot).length, 2);
  assert.equal(listParlays(snapshot).length, 1);
  assert.equal(listValidations(snapshot).length, 2);
  assert.equal(getValidationSummary(snapshot).total, 2);
  assert.equal(getValidationSummary(snapshot).partial, 1);
  assert.equal(getHealth(snapshot).status, "degraded");
  assert.equal(publicApiEndpointPaths.health, "/health");
  assert.equal(publicApiEndpointPaths.validations, "/validations");
});

test("public api derives an operational summary from tasks, task runs, etl batches, and validations", () => {
  const snapshot = createOperationSnapshot({
    rawBatches: [
      {
        id: "batch-fixtures-1",
        endpointFamily: "fixtures",
        providerCode: "api-football",
        extractionStatus: "succeeded",
        extractionTime: "2026-04-15T00:01:00.000Z",
        recordCount: 15,
      },
      {
        id: "batch-odds-1",
        endpointFamily: "odds",
        providerCode: "api-football",
        extractionStatus: "failed",
        extractionTime: "2026-04-15T00:02:00.000Z",
        recordCount: 4,
      },
    ],
  });

  const summary = createOperationalSummary(snapshot);

  assert.equal(summary.taskCounts.total, snapshot.tasks.length);
  assert.equal(summary.taskRunCounts.total, snapshot.taskRuns.length);
  assert.equal(summary.etl.rawBatchCount, 2);
  assert.equal(summary.etl.endpointCounts.fixtures, 1);
  assert.equal(summary.etl.endpointCounts.odds, 1);
  assert.equal(summary.etl.latestBatch?.id, "batch-odds-1");
  assert.equal(summary.validation.total, snapshot.validationSummary.total);
});

test("public api builds task log entries sorted by newest timestamp", () => {
  const snapshot = createOperationSnapshot({
    tasks: [
      {
        ...createOperationSnapshot().tasks[0]!,
        id: "task-failed",
        kind: "prediction",
        status: "failed",
        createdAt: "2026-04-15T00:05:00.000Z",
        updatedAt: "2026-04-15T00:08:00.000Z",
      },
    ],
    taskRuns: [
      {
        ...createOperationSnapshot().taskRuns[0]!,
        id: "task-failed:attempt:1",
        taskId: "task-failed",
        status: "failed",
        startedAt: "2026-04-15T00:06:00.000Z",
        finishedAt: "2026-04-15T00:07:00.000Z",
        error: "provider timeout",
        updatedAt: "2026-04-15T00:07:00.000Z",
      },
    ],
  });

  const logs = createTaskLogEntries(snapshot);

  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.level, "ERROR");
  assert.equal(logs[0]?.taskRunId, "task-failed:attempt:1");
  assert.match(logs[0]?.message ?? "", /provider timeout/i);
  assert.equal(logs[0]?.taskId, "task-failed");
  assert.equal(logs[1]?.taskId, "task-failed");
});

test("public api handlers return consistent derived read models", () => {
  const snapshot = createOperationSnapshot();
  const api = createPublicApiHandlers(snapshot);

  assert.deepEqual(api.snapshot(), snapshot);
  assert.equal(api.fixtures()[0]?.homeTeam, "Boca Juniors");
  assert.equal(api.tasks()[0]?.kind, "fixture-ingestion");
  assert.equal(api.taskById(snapshot.tasks[0]!.id)?.id, snapshot.tasks[0]!.id);
  assert.equal(api.taskRuns()[0]?.taskId, snapshot.tasks[0]?.id);
  assert.equal(api.taskRunById(snapshot.taskRuns[0]!.id)?.id, snapshot.taskRuns[0]!.id);
  assert.equal(api.taskRunsByTaskId(snapshot.tasks[0]!.id).length, 1);
  assert.equal(api.predictions()[1]?.outcome, "over");
  assert.equal(api.predictionById(snapshot.predictions[0]!.id)?.id, snapshot.predictions[0]!.id);
  assert.equal(api.parlays()[0]?.legs.length, 2);
  assert.equal(api.parlayById(snapshot.parlays[0]!.id)?.id, snapshot.parlays[0]!.id);
  assert.equal(api.validations()[0]?.targetType, "parlay");
  assert.equal(api.validationById(snapshot.validations[0]!.id)?.id, snapshot.validations[0]!.id);
  assert.equal(api.validationSummary().completionRate, 1);
  assert.match(api.health().checks[0]?.detail ?? "", /fixture/);
  assert.equal(api.operationalSummary().taskCounts.total, snapshot.tasks.length);
  assert.equal(api.operationalLogs().length, listOperationalLogs(snapshot).length);
});

test("public api exposes detail lookups for tasks, task runs, predictions, parlays, and validations", () => {
  const snapshot = createOperationSnapshot();

  assert.equal(findTaskById(snapshot, snapshot.tasks[0]!.id)?.id, snapshot.tasks[0]!.id);
  assert.equal(findTaskRunById(snapshot, snapshot.taskRuns[0]!.id)?.id, snapshot.taskRuns[0]!.id);
  assert.equal(listTaskRunsByTaskId(snapshot, snapshot.tasks[0]!.id).length, 1);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.id, snapshot.predictions[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.aiRun?.id, snapshot.aiRuns[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.fixture?.id, snapshot.fixtures[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.linkedParlayIds[0], snapshot.parlays[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.linkedParlays[0]?.id, snapshot.parlays[0]!.id);
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.validation?.id, snapshot.validations[1]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.id, snapshot.parlays[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.aiRun?.id, snapshot.aiRuns[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.linkedAiRunIds[0], snapshot.aiRuns[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.legs[0]?.prediction?.id, snapshot.predictions[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.validation?.id, snapshot.validations[0]!.id);
  assert.equal(findValidationById(snapshot, snapshot.validations[0]!.id)?.id, snapshot.validations[0]!.id);
});

test("public api exposes fixture-centric ops detail", () => {
  const fixture = createFixture({
    id: "fx-ops-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Comunicaciones",
    awayTeam: "Municipal",
    scheduledAt: "2026-04-15T18:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });
  const prediction = createPrediction({
    id: "pred-ops-1",
    fixtureId: fixture.id,
    market: "moneyline",
    outcome: "home",
    status: "published",
    confidence: 0.62,
    probabilities: { implied: 0.5, model: 0.62, edge: 0.12 },
    rationale: ["fixture ops detail"],
  });
  const parlay = createParlay({
    id: "parlay-ops-1",
    status: "ready",
    stake: 10,
    source: "automatic",
    correlationScore: 0.1,
    expectedPayout: 19.4,
    legs: [{ predictionId: prediction.id, fixtureId: fixture.id, market: "moneyline", outcome: "home", price: 1.94, status: "pending" }],
  });
  const validation = createValidation({
    id: "val-ops-1",
    targetType: "prediction",
    targetId: prediction.id,
    kind: "prediction-settlement",
    status: "pending",
    checks: [],
    summary: "pending",
  });
  const snapshot = createOperationSnapshot({
    fixtures: [fixture],
    fixtureWorkflows: [createFixtureWorkflow({ fixtureId: fixture.id, ingestionStatus: "succeeded", oddsStatus: "succeeded", enrichmentStatus: "succeeded", candidateStatus: "succeeded", predictionStatus: "succeeded", parlayStatus: "pending", validationStatus: "pending", isCandidate: true, manualSelectionStatus: "selected", selectionOverride: "force-include" })],
    auditEvents: [
      {
        id: "audit-ops-2",
        aggregateType: "fixture-workflow",
        aggregateId: fixture.id,
        eventType: "fixture-workflow.selection-override.updated",
        actor: "public-api",
        payload: { mode: "force-include", reason: "high conviction" },
        occurredAt: "2026-04-15T16:06:00.000Z",
        createdAt: "2026-04-15T16:06:00.000Z",
        updatedAt: "2026-04-15T16:06:00.000Z",
      },
      {
        id: "audit-ops-1",
        aggregateType: "fixture-workflow",
        aggregateId: fixture.id,
        eventType: "fixture-workflow.manual-selection.updated",
        actor: "ops-user",
        payload: { status: "selected", reason: "desk review" },
        occurredAt: "2026-04-15T16:05:00.000Z",
        createdAt: "2026-04-15T16:05:00.000Z",
        updatedAt: "2026-04-15T16:05:00.000Z",
      },
    ],
    tasks: [createTask({ id: "task-ops-1", kind: "prediction", status: "failed", priority: 10, payload: { fixtureId: fixture.id } })],
    taskRuns: [createTaskRun({ id: "task-ops-1:attempt:1", taskId: "task-ops-1", attemptNumber: 1, status: "failed", startedAt: "2026-04-15T16:00:00.000Z", finishedAt: "2026-04-15T16:01:00.000Z", error: "provider timeout" })],
    oddsSnapshots: [{ id: "odds-ops-1", fixtureId: fixture.id, providerFixtureId: "pfx-1", bookmakerKey: "bet365", marketKey: "h2h", capturedAt: "2026-04-15T15:30:00.000Z", selectionCount: 3 }],
    predictions: [prediction],
    parlays: [parlay],
    validations: [validation],
  });
  const handlers = createPublicApiHandlers(snapshot);
  const response = routePublicApiRequest(handlers, `/fixtures/${fixture.id}/ops`);
  const auditEventsResponse = routePublicApiRequest(handlers, `/fixtures/${fixture.id}/audit-events`);

  assert.equal(response.status, 200);
  const body = response.body as any;
  assert.equal(body.fixture.id, fixture.id);
  assert.equal(body.workflow.predictionStatus, "succeeded");
  assert.equal(body.latestOddsSnapshot.id, "odds-ops-1");
  assert.equal(body.predictions.length, 1);
  assert.equal(body.parlays.length, 1);
  assert.equal(body.validations.length, 1);
  assert.equal(body.scoringEligibility.eligible, true);
  assert.match(body.scoringEligibility.reason ?? "", /force-included/i);
  assert.equal(body.recentAuditEvents.length, 2);
  assert.equal(body.recentAuditEvents[0]?.eventType, "fixture-workflow.selection-override.updated");
  assert.equal(body.recentAuditEvents[0]?.payload.mode, "force-include");
  assert.equal(body.recentAuditEvents[1]?.eventType, "fixture-workflow.manual-selection.updated");
  assert.match(body.recentTaskRuns[0]?.error ?? "", /provider timeout/i);
  assert.equal(auditEventsResponse.status, 200);
  assert.equal((auditEventsResponse.body as any[]).length, 2);
  assert.equal((auditEventsResponse.body as any[])[0]?.eventType, "fixture-workflow.selection-override.updated");
});

test("public api loads recent fixture workflow audit events from the unit of work", async () => {
  const fixture = createFixture({
    id: "fx-uow-audit-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Antigua",
    awayTeam: "Coban",
    scheduledAt: "2026-04-15T18:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });
  const unitOfWork = createInMemoryUnitOfWork();
  await unitOfWork.fixtures.save(fixture);
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: fixture.id,
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
      selectionOverride: "force-include",
    }),
  );
  await unitOfWork.auditEvents.save({
    id: "audit-uow-1",
    aggregateType: "fixture-workflow",
    aggregateId: fixture.id,
    eventType: "fixture-workflow.manual-selection.updated",
    actor: "ops-user",
    payload: { status: "selected", reason: "manual review" },
    occurredAt: "2026-04-15T16:00:00.000Z",
    createdAt: "2026-04-15T16:00:00.000Z",
    updatedAt: "2026-04-15T16:00:00.000Z",
  });
  await unitOfWork.auditEvents.save({
    id: "audit-uow-2",
    aggregateType: "fixture-workflow",
    aggregateId: fixture.id,
    eventType: "fixture-workflow.selection-override.updated",
    actor: "public-api",
    payload: { mode: "force-include", reason: "priority" },
    occurredAt: "2026-04-15T17:00:00.000Z",
    createdAt: "2026-04-15T17:00:00.000Z",
    updatedAt: "2026-04-15T17:00:00.000Z",
  });

  const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork);
  const fixtureOps = createPublicApiHandlers(snapshot).fixtureOpsById(fixture.id);

  assert.equal(fixtureOps?.recentAuditEvents.length, 2);
  assert.equal(fixtureOps?.recentAuditEvents[0]?.eventType, "fixture-workflow.selection-override.updated");
  assert.match(fixtureOps?.scoringEligibility.reason ?? "", /force-included/i);
});

test("public api returns consistent 404 payloads for missing detail resources", () => {
  const handlers = createPublicApiHandlers(createOperationSnapshot());

  assert.deepEqual(routePublicApiRequest(handlers, "/fixtures/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "fixture", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/fixtures/missing/audit-events"), {
    status: 404,
    body: { error: "resource_not_found", resource: "fixture", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/tasks/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "task", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/task-runs/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "task-run", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/predictions/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "prediction", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/parlays/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "parlay", resourceId: "missing" },
  });
  assert.deepEqual(routePublicApiRequest(handlers, "/validations/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "validation", resourceId: "missing" },
  });
});

test("public api exposes operational summary and logs routes", () => {
  const snapshot = createOperationSnapshot({
    rawBatches: [
      {
        id: "batch-fixtures-1",
        endpointFamily: "fixtures",
        providerCode: "api-football",
        extractionStatus: "succeeded",
        extractionTime: "2026-04-15T00:01:00.000Z",
        recordCount: 15,
      },
    ],
  });
  const handlers = createPublicApiHandlers(snapshot);

  const summaryResponse = routePublicApiRequest(handlers, publicApiEndpointPaths.operationalSummary);
  const logsResponse = routePublicApiRequest(handlers, publicApiEndpointPaths.operationalLogs);

  assert.equal(summaryResponse.status, 200);
  assert.equal((summaryResponse.body as ReturnType<typeof createOperationalSummary>).etl.rawBatchCount, 1);
  assert.equal(logsResponse.status, 200);
  assert.ok(Array.isArray(logsResponse.body));
});

test("public api filters tasks by status in routed requests", () => {
  const snapshot = createOperationSnapshot();
  const handlers = createPublicApiHandlers(snapshot);

  assert.deepEqual(
    routePublicApiRequest(handlers, `${publicApiEndpointPaths.tasks}?status=succeeded`),
    {
      status: 200,
      body: [snapshot.tasks[0]],
    },
  );
});

test("public api returns 400 for invalid task status filters", () => {
  const handlers = createPublicApiHandlers(createOperationSnapshot());

  assert.deepEqual(
    routePublicApiRequest(handlers, `${publicApiEndpointPaths.tasks}?status=paused`),
    {
      status: 400,
      body: {
        error: "invalid_query_parameter",
        parameter: "status",
        allowedValues: ["queued", "running", "failed", "succeeded", "cancelled"],
      },
    },
  );
});

test("public api persists manual selection and selection override actions through the unit of work", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fx-ops-action-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Comunicaciones",
    awayTeam: "Municipal",
    scheduledAt: "2026-04-22T02:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);

  const manuallySelected = await applyFixtureManualSelection(unitOfWork, fixture.id, {
    status: "selected",
    selectedBy: "luis",
    reason: "Partido clave del slate",
    occurredAt: "2026-04-22T00:10:00.000Z",
  });

  const overridden = await applyFixtureSelectionOverride(unitOfWork, fixture.id, {
    mode: "force-include",
    reason: "Pinned por operador",
    occurredAt: "2026-04-22T00:11:00.000Z",
  });

  assert.equal(manuallySelected.manualSelectionStatus, "selected");
  assert.equal(manuallySelected.manualSelectionBy, "luis");
  assert.equal(overridden.selectionOverride, "force-include");
  assert.equal(overridden.overrideReason, "Pinned por operador");
  assert.equal(
    (await unitOfWork.fixtureWorkflows.findByFixtureId(fixture.id))?.selectionOverride,
    "force-include",
  );
  const auditEvents = await unitOfWork.auditEvents.findByAggregate("fixture-workflow", fixture.id);
  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0]?.eventType, "fixture-workflow.manual-selection.updated");
  assert.equal(auditEvents[1]?.eventType, "fixture-workflow.selection-override.updated");
});

test("public api server exposes http endpoints for fixtures, predictions, parlays, validations, validation summary, health, snapshot, and operational views", async () => {
  const snapshot = createOperationSnapshot();
  const server = createPublicApiServer({ snapshot });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const fixturesResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.fixtures}`);
    assert.equal(fixturesResponse.status, 200);
    assert.deepEqual(await fixturesResponse.json(), snapshot.fixtures);

    const fixtureDetailResponse = await fetch(`${baseUrl}/fixtures/${snapshot.fixtures[0]!.id}`);
    assert.equal(fixtureDetailResponse.status, 200);
    assert.deepEqual(await fixtureDetailResponse.json(), snapshot.fixtures[0]);

    const tasksResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.tasks}`);
    assert.equal(tasksResponse.status, 200);
    assert.deepEqual(await tasksResponse.json(), snapshot.tasks);

    const taskDetailResponse = await fetch(`${baseUrl}/tasks/${snapshot.tasks[0]!.id}`);
    assert.equal(taskDetailResponse.status, 200);
    assert.deepEqual(await taskDetailResponse.json(), snapshot.tasks[0]);

    const taskRunDetailResponse = await fetch(`${baseUrl}/task-runs/${snapshot.taskRuns[0]!.id}`);
    assert.equal(taskRunDetailResponse.status, 200);
    assert.deepEqual(await taskRunDetailResponse.json(), snapshot.taskRuns[0]);

    const filteredTasksResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.tasks}?status=succeeded`,
    );
    assert.equal(filteredTasksResponse.status, 200);
    assert.deepEqual(await filteredTasksResponse.json(), [snapshot.tasks[0]]);

    const taskRunsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.taskRuns}`);
    assert.equal(taskRunsResponse.status, 200);
    assert.deepEqual(await taskRunsResponse.json(), snapshot.taskRuns);

    const taskRunsByTaskResponse = await fetch(`${baseUrl}/tasks/${snapshot.tasks[0]!.id}/runs`);
    assert.equal(taskRunsByTaskResponse.status, 200);
    assert.deepEqual(await taskRunsByTaskResponse.json(), snapshot.taskRuns);

    const rawBatchesResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.rawBatches}`);
    assert.equal(rawBatchesResponse.status, 200);
    assert.deepEqual(await rawBatchesResponse.json(), snapshot.rawBatches);

    const oddsSnapshotsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.oddsSnapshots}`);
    assert.equal(oddsSnapshotsResponse.status, 200);
    assert.deepEqual(await oddsSnapshotsResponse.json(), snapshot.oddsSnapshots);

    const predictionsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.predictions}`);
    assert.equal(predictionsResponse.status, 200);
    assert.deepEqual(await predictionsResponse.json(), snapshot.predictions);

    const predictionDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.predictions}/${snapshot.predictions[0]!.id}`,
    );
    assert.equal(predictionDetailResponse.status, 200);
    const predictionDetailJson = (await predictionDetailResponse.json()) as {
      id: string;
      aiRun?: { id: string };
      fixture?: { id: string };
      linkedParlayIds: string[];
    };
    assert.equal(predictionDetailJson.id, snapshot.predictions[0]!.id);
    assert.equal(predictionDetailJson.aiRun?.id, snapshot.aiRuns[0]!.id);
    assert.equal(predictionDetailJson.fixture?.id, snapshot.fixtures[0]!.id);
    assert.deepEqual(predictionDetailJson.linkedParlayIds, [snapshot.parlays[0]!.id]);

    const parlaysResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.parlays}`);
    assert.equal(parlaysResponse.status, 200);
    assert.deepEqual(await parlaysResponse.json(), snapshot.parlays);

    const parlayDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.parlays}/${snapshot.parlays[0]!.id}`,
    );
    assert.equal(parlayDetailResponse.status, 200);
    const parlayDetailJson = (await parlayDetailResponse.json()) as {
      id: string;
      aiRun?: { id: string };
      legs: Array<{ prediction?: { id: string } }>;
      validation?: { id: string };
    };
    assert.equal(parlayDetailJson.id, snapshot.parlays[0]!.id);
    assert.equal(parlayDetailJson.aiRun?.id, snapshot.aiRuns[0]!.id);
    assert.equal(parlayDetailJson.legs[0]?.prediction?.id, snapshot.predictions[0]!.id);
    assert.equal(parlayDetailJson.validation?.id, snapshot.validations[0]!.id);

    const validationsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.validations}`);
    assert.equal(validationsResponse.status, 200);
    assert.deepEqual(await validationsResponse.json(), snapshot.validations);

    const validationDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.validations}/${snapshot.validations[0]!.id}`,
    );
    assert.equal(validationDetailResponse.status, 200);
    assert.deepEqual(await validationDetailResponse.json(), snapshot.validations[0]);

    const operationalSummaryResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.operationalSummary}`);
    assert.equal(operationalSummaryResponse.status, 200);
    const operationalSummaryJson = (await operationalSummaryResponse.json()) as ReturnType<
      typeof createOperationalSummary
    >;
    assert.equal(operationalSummaryJson.taskCounts.total, snapshot.tasks.length);

    const operationalLogsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.operationalLogs}`);
    assert.equal(operationalLogsResponse.status, 200);
    assert.ok(Array.isArray(await operationalLogsResponse.json()));

    const missingPredictionResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.predictions}/missing-prediction`,
    );
    assert.equal(missingPredictionResponse.status, 404);
    assert.deepEqual(await missingPredictionResponse.json(), {
      error: "resource_not_found",
      resource: "prediction",
      resourceId: "missing-prediction",
    });

    const missingTaskResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.tasks}/missing-task`);
    assert.equal(missingTaskResponse.status, 404);
    assert.deepEqual(await missingTaskResponse.json(), {
      error: "resource_not_found",
      resource: "task",
      resourceId: "missing-task",
    });

    const missingTaskRunResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.taskRuns}/missing-task-run`);
    assert.equal(missingTaskRunResponse.status, 404);
    assert.deepEqual(await missingTaskRunResponse.json(), {
      error: "resource_not_found",
      resource: "task-run",
      resourceId: "missing-task-run",
    });

    const missingParlayResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.parlays}/missing-parlay`);
    assert.equal(missingParlayResponse.status, 404);
    assert.deepEqual(await missingParlayResponse.json(), {
      error: "resource_not_found",
      resource: "parlay",
      resourceId: "missing-parlay",
    });

    const missingValidationResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.validations}/missing-validation`,
    );
    assert.equal(missingValidationResponse.status, 404);
    assert.deepEqual(await missingValidationResponse.json(), {
      error: "resource_not_found",
      resource: "validation",
      resourceId: "missing-validation",
    });

    const validationResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.validationSummary}`);
    assert.equal(validationResponse.status, 200);
    assert.deepEqual(await validationResponse.json(), snapshot.validationSummary);

    const healthResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.health}`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), snapshot.health);

    const snapshotResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.snapshot}`);
    assert.equal(snapshotResponse.status, 200);
    assert.deepEqual(await snapshotResponse.json(), snapshot);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server accepts POST fixture ops actions when backed by a unit of work", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fx-server-action-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Xelajú",
    awayTeam: "Antigua",
    scheduledAt: "2026-04-22T03:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);

  const server = createPublicApiServer({ unitOfWork });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const manualSelectionResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "selected",
        selectedBy: "ops-user",
        reason: "TV game",
        occurredAt: "2026-04-22T00:20:00.000Z",
      }),
    });
    assert.equal(manualSelectionResponse.status, 200);
    assert.equal(
      ((await manualSelectionResponse.json()) as { manualSelectionStatus: string }).manualSelectionStatus,
      "selected",
    );

    const overrideResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/selection-override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "force-include",
        reason: "Operator pin",
        occurredAt: "2026-04-22T00:21:00.000Z",
      }),
    });
    assert.equal(overrideResponse.status, 200);
    assert.equal(
      ((await overrideResponse.json()) as { selectionOverride: string }).selectionOverride,
      "force-include",
    );

    const fixtureOpsResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/ops`);
    assert.equal(fixtureOpsResponse.status, 200);
    const fixtureOpsJson = (await fixtureOpsResponse.json()) as {
      workflow: { manualSelectionStatus: string; selectionOverride: string };
      scoringEligibility: { eligible: boolean; reason?: string };
    };
    assert.equal(fixtureOpsJson.workflow.manualSelectionStatus, "selected");
    assert.equal(fixtureOpsJson.workflow.selectionOverride, "force-include");
    assert.equal(fixtureOpsJson.scoringEligibility.eligible, true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("public api server can revert manual selection and selection override", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const fixture = createFixture({
    id: "fx-server-reset-1",
    sport: "football",
    competition: "Liga Nacional",
    homeTeam: "Cobán",
    awayTeam: "Malacateco",
    scheduledAt: "2026-04-22T04:00:00.000Z",
    status: "scheduled",
    metadata: {},
  });

  await unitOfWork.fixtures.save(fixture);
  const server = createPublicApiServer({ unitOfWork });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "selected", selectedBy: "ops-user" }),
    });
    await fetch(`${baseUrl}/fixtures/${fixture.id}/selection-override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "force-exclude", reason: "pause" }),
    });

    const resetManualResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/manual-selection/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "clear manual state", occurredAt: "2026-04-22T00:40:00.000Z" }),
    });
    assert.equal(resetManualResponse.status, 200);

    const resetOverrideResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/selection-override/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "clear override", occurredAt: "2026-04-22T00:41:00.000Z" }),
    });
    assert.equal(resetOverrideResponse.status, 200);

    const fixtureOpsResponse = await fetch(`${baseUrl}/fixtures/${fixture.id}/ops`);
    const fixtureOpsJson = (await fixtureOpsResponse.json()) as {
      workflow: { manualSelectionStatus: string; selectionOverride: string };
      scoringEligibility: { eligible: boolean; reason?: string };
    };
    assert.equal(fixtureOpsJson.workflow.manualSelectionStatus, "none");
    assert.equal(fixtureOpsJson.workflow.selectionOverride, "none");
    assert.equal(fixtureOpsJson.scoringEligibility.eligible, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("loadOperationSnapshotFromUnitOfWork preserves research metadata and ai-run linkage in persisted read models", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const prefix = `public-api-linking-${Date.now()}`;
  const fixtureId = `${prefix}-fixture`;

  try {
    const fixture = createFixture({
      id: fixtureId,
      sport: "football",
      competition: "Serie A",
      homeTeam: "Inter",
      awayTeam: "Milan",
      scheduledAt: "2026-04-20T18:45:00.000Z",
      status: "scheduled",
      metadata: {
        providerFixtureId: `${prefix}-provider-fixture`,
        researchGeneratedAt: "2026-04-20T10:00:00.000Z",
        researchRecommendedLean: "away",
        researchEvidenceCount: "5",
        featureReadinessStatus: "ready",
      },
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
    });
    const task = createTask({
      id: `${prefix}-task`,
      kind: "prediction",
      status: "succeeded",
      priority: 50,
      payload: { fixtureId: fixture.id, source: "scoring-worker" },
      attempts: [{ startedAt: "2026-04-20T10:05:00.000Z", finishedAt: "2026-04-20T10:06:00.000Z" }],
      scheduledFor: "2026-04-20T10:05:00.000Z",
      createdAt: "2026-04-20T10:05:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
    });
    const taskRun = createTaskRun({
      id: `${prefix}-task-run`,
      taskId: task.id,
      attemptNumber: 7,
      status: "succeeded",
      startedAt: "2026-04-20T10:05:00.000Z",
      finishedAt: "2026-04-20T10:06:00.000Z",
      createdAt: "2026-04-20T10:05:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
    });
    const aiRun = createAiRun({
      id: `${prefix}-ai-run`,
      taskId: task.id,
      provider: "internal",
      model: "deterministic-moneyline-v1",
      promptVersion: "scoring-worker-v2",
      status: "completed",
      outputRef: `scoring-worker://${fixture.id}/2026-04-20T10:06:00.000Z`,
      createdAt: "2026-04-20T10:06:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
    });
    const prediction = createPrediction({
      id: `${prefix}-prediction`,
      fixtureId: fixture.id,
      aiRunId: aiRun.id,
      market: "moneyline",
      outcome: "away",
      confidence: 0.71,
      probabilities: { implied: 0.51, model: 0.57, edge: 0.06 },
      rationale: ["Research lean away", "Odds snapshot agrees"],
      status: "published",
      createdAt: "2026-04-20T10:06:00.000Z",
      updatedAt: "2026-04-20T10:06:00.000Z",
      publishedAt: "2026-04-20T10:06:30.000Z",
    });
    const parlay = createParlay({
      id: `${prefix}-parlay`,
      status: "draft",
      stake: 1,
      source: "automatic",
      correlationScore: 0.11,
      expectedPayout: 2.4,
      legs: [
        {
          predictionId: prediction.id,
          fixtureId: fixture.id,
          market: prediction.market,
          outcome: prediction.outcome,
          price: 2.4,
          status: "pending",
        },
      ],
      createdAt: "2026-04-20T10:07:00.000Z",
      updatedAt: "2026-04-20T10:07:00.000Z",
    });
    const validation = createValidation({
      id: `${prefix}-validation`,
      targetType: "parlay",
      targetId: parlay.id,
      kind: "parlay-settlement",
      status: "passed",
      checks: [{ code: "trace", message: "trace ok", passed: true }],
      summary: "Validation passed",
      executedAt: "2026-04-20T10:08:00.000Z",
      createdAt: "2026-04-20T10:08:00.000Z",
      updatedAt: "2026-04-20T10:08:00.000Z",
    });

    await unitOfWork.fixtures.save(fixture);
    await unitOfWork.fixtureWorkflows.save(
      createFixtureWorkflow({
        fixtureId: fixture.id,
        ingestionStatus: "succeeded",
        oddsStatus: "succeeded",
        enrichmentStatus: "succeeded",
        candidateStatus: "succeeded",
        predictionStatus: "succeeded",
        parlayStatus: "pending",
        validationStatus: "pending",
        isCandidate: true,
        manualSelectionStatus: "selected",
        manualSelectionBy: "ops-user",
        selectionOverride: "force-include",
        diagnostics: { research: { lean: "away" } },
      }),
    );
    await unitOfWork.tasks.save(task);
    await unitOfWork.taskRuns.save(taskRun);
    await unitOfWork.aiRuns.save(aiRun);
    await unitOfWork.predictions.save(prediction);
    await unitOfWork.parlays.save(parlay);
    await unitOfWork.validations.save(validation);

    const snapshot = await loadOperationSnapshotFromUnitOfWork(unitOfWork);
    const loadedFixture = snapshot.fixtures.find((candidate) => candidate.id === fixture.id);
    const fixtureOpsDetail = routePublicApiRequest(createPublicApiHandlers(snapshot), `/fixtures/${fixture.id}/ops`).body as Record<string, any>;
    const aiRunDetail = findAiRunById(snapshot, aiRun.id);
    const predictionDetail = findPredictionById(snapshot, prediction.id);
    const parlayDetail = findParlayById(snapshot, parlay.id);

    assert.equal(loadedFixture?.metadata.researchRecommendedLean, "away");
    assert.equal(loadedFixture?.metadata.featureReadinessStatus, "ready");
    assert.equal(aiRunDetail?.linkedPredictions[0]?.id, prediction.id);
    assert.equal(aiRunDetail?.linkedParlays[0]?.id, parlay.id);
    assert.equal(predictionDetail?.linkedParlays[0]?.id, parlay.id);
    assert.equal(parlayDetail?.linkedAiRunIds[0], aiRun.id);
    assert.equal(fixtureOpsDetail.workflow.manualSelectionStatus, "selected");
    assert.equal(fixtureOpsDetail.workflow.selectionOverride, "force-include");
  } finally {
    await Promise.all([
      unitOfWork.validations.delete(`${prefix}-validation`),
      unitOfWork.parlays.delete(`${prefix}-parlay`),
      unitOfWork.predictions.delete(`${prefix}-prediction`),
      unitOfWork.aiRuns.delete(`${prefix}-ai-run`),
      unitOfWork.taskRuns.delete(`${prefix}-task-run`),
      unitOfWork.tasks.delete(`${prefix}-task`),
      unitOfWork.fixtureWorkflows.delete(fixtureId),
      unitOfWork.fixtures.delete(fixtureId),
    ]);
  }
});

