import test from "node:test";
import assert from "node:assert/strict";

import { createFixture } from "@gana-v8/domain-core";

import {
  runResearchTask,
  runResearchWorker,
} from "../src/index.js";

const scheduledFixture = createFixture({
  id: "fixture:api-football:123",
  sport: "football",
  competition: "Liga Profesional",
  homeTeam: "Boca Juniors",
  awayTeam: "River Plate",
  scheduledAt: "2026-04-16T20:00:00.000Z",
  status: "scheduled",
  metadata: {
    formHome: "0.74",
    formAway: "0.41",
    restHomeDays: "6",
    restAwayDays: "3",
    injuriesHome: "1",
    injuriesAway: "3",
    derby: "true",
  },
});

test("runResearchTask produces a dossier and frozen feature snapshot for one fixture", () => {
  const result = runResearchTask({
    fixture: scheduledFixture,
    generatedAt: "2026-04-16T12:00:00.000Z",
  });

  assert.equal(result.fixture.id, scheduledFixture.id);
  assert.equal(result.dossier.fixtureId, scheduledFixture.id);
  assert.equal(result.featureSnapshot.fixtureId, scheduledFixture.id);
  assert.equal(result.featureSnapshot.recommendedLean, result.dossier.recommendedLean);
  assert.equal(result.featureSnapshot.readiness.status, "ready");
});

test("runResearchWorker skips non-scheduled fixtures and reports counts", () => {
  const completedFixture = createFixture({
    id: "fixture:api-football:999",
    sport: "football",
    competition: "Serie A",
    homeTeam: "Inter",
    awayTeam: "Milan",
    scheduledAt: "2026-04-16T22:00:00.000Z",
    status: "completed",
    metadata: {},
  });

  const summary = runResearchWorker({
    fixtures: [scheduledFixture, completedFixture],
    generatedAt: "2026-04-16T12:00:00.000Z",
  });

  assert.equal(summary.processedCount, 1);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.results.length, 2);
  assert.equal(summary.results[0]?.status, "processed");
  assert.equal(summary.results[1]?.status, "skipped");
  assert.match(summary.results[1]?.reason ?? "", /scheduled/i);
});
