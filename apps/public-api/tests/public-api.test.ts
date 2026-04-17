import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import {
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
  assert.equal(
    findProviderStateByProvider(snapshot, snapshot.providerStates[0]!.provider)?.provider,
    snapshot.providerStates[0]!.provider,
  );
  assert.equal(handlers.aiRuns()[0]?.provider, snapshot.aiRuns[0]?.provider);
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
  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.validation?.id, snapshot.validations[1]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.id, snapshot.parlays[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.aiRun?.id, snapshot.aiRuns[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.legs[0]?.prediction?.id, snapshot.predictions[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.validation?.id, snapshot.validations[0]!.id);
  assert.equal(findValidationById(snapshot, snapshot.validations[0]!.id)?.id, snapshot.validations[0]!.id);
});

test("public api returns consistent 404 payloads for missing detail resources", () => {
  const handlers = createPublicApiHandlers(createOperationSnapshot());

  assert.deepEqual(routePublicApiRequest(handlers, "/fixtures/missing"), {
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

test("loadOperationSnapshotFromDatabase reads persisted fixtures and tasks", async () => {
  const snapshot = await loadOperationSnapshotFromDatabase(process.env.DATABASE_URL);

  assert.ok(snapshot.fixtures.length >= 1);
  assert.ok(snapshot.tasks.length >= 1);
  assert.ok(snapshot.taskRuns.length >= 1);
  assert.ok(snapshot.rawBatches.length >= 1);
  assert.ok(snapshot.oddsSnapshots.length >= 1);
});
