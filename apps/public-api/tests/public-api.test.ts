import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import {
  createOperationSnapshot,
  createPublicApiHandlers,
  createPublicApiServer,
  findParlayById,
  findPredictionById,
  findValidationById,
  getHealth,
  getValidationSummary,
  listFixtures,
  listParlays,
  listPredictions,
  listTasks,
  listValidations,
  loadOperationSnapshotFromDatabase,
  publicApiEndpointPaths,
  routePublicApiRequest,
} from "../src/index.js";

test("public api snapshot exposes fixtures, predictions, parlays, validations, validation summary, and health", () => {
  const snapshot = createOperationSnapshot();

  assert.equal(listFixtures(snapshot).length, 2);
  assert.equal(listTasks(snapshot).length, 1);
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

test("public api handlers return consistent derived read models", () => {
  const snapshot = createOperationSnapshot();
  const api = createPublicApiHandlers(snapshot);

  assert.deepEqual(api.snapshot(), snapshot);
  assert.equal(api.fixtures()[0]?.homeTeam, "Boca Juniors");
  assert.equal(api.tasks()[0]?.kind, "fixture-ingestion");
  assert.equal(api.predictions()[1]?.outcome, "over");
  assert.equal(api.predictionById(snapshot.predictions[0]!.id)?.id, snapshot.predictions[0]!.id);
  assert.equal(api.parlays()[0]?.legs.length, 2);
  assert.equal(api.parlayById(snapshot.parlays[0]!.id)?.id, snapshot.parlays[0]!.id);
  assert.equal(api.validations()[0]?.targetType, "parlay");
  assert.equal(api.validationById(snapshot.validations[0]!.id)?.id, snapshot.validations[0]!.id);
  assert.equal(api.validationSummary().completionRate, 1);
  assert.match(api.health().checks[0]?.detail ?? "", /fixture/);
});

test("public api exposes detail lookups for predictions, parlays, and validations", () => {
  const snapshot = createOperationSnapshot();

  assert.equal(findPredictionById(snapshot, snapshot.predictions[0]!.id)?.id, snapshot.predictions[0]!.id);
  assert.equal(findParlayById(snapshot, snapshot.parlays[0]!.id)?.id, snapshot.parlays[0]!.id);
  assert.equal(findValidationById(snapshot, snapshot.validations[0]!.id)?.id, snapshot.validations[0]!.id);
});

test("public api returns consistent 404 payloads for missing detail resources", () => {
  const handlers = createPublicApiHandlers(createOperationSnapshot());

  assert.deepEqual(routePublicApiRequest(handlers, "/fixtures/missing"), {
    status: 404,
    body: { error: "resource_not_found", resource: "fixture", resourceId: "missing" },
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

test("public api server exposes http endpoints for fixtures, predictions, parlays, validations, validation summary, health, and snapshot", async () => {
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
    assert.deepEqual(await predictionDetailResponse.json(), snapshot.predictions[0]);

    const parlaysResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.parlays}`);
    assert.equal(parlaysResponse.status, 200);
    assert.deepEqual(await parlaysResponse.json(), snapshot.parlays);

    const parlayDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.parlays}/${snapshot.parlays[0]!.id}`,
    );
    assert.equal(parlayDetailResponse.status, 200);
    assert.deepEqual(await parlayDetailResponse.json(), snapshot.parlays[0]);

    const validationsResponse = await fetch(`${baseUrl}${publicApiEndpointPaths.validations}`);
    assert.equal(validationsResponse.status, 200);
    assert.deepEqual(await validationsResponse.json(), snapshot.validations);

    const validationDetailResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.validations}/${snapshot.validations[0]!.id}`,
    );
    assert.equal(validationDetailResponse.status, 200);
    assert.deepEqual(await validationDetailResponse.json(), snapshot.validations[0]);

    const missingPredictionResponse = await fetch(
      `${baseUrl}${publicApiEndpointPaths.predictions}/missing-prediction`,
    );
    assert.equal(missingPredictionResponse.status, 404);
    assert.deepEqual(await missingPredictionResponse.json(), {
      error: "resource_not_found",
      resource: "prediction",
      resourceId: "missing-prediction",
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
  assert.ok(snapshot.rawBatches.length >= 1);
  assert.ok(snapshot.oddsSnapshots.length >= 1);
});
