import test from "node:test";
import assert from "node:assert/strict";

import {
  createAvailabilitySnapshot,
  createFixture,
  createLineupParticipant,
  createLineupSnapshot,
} from "@gana-v8/domain-core";

import {
  resolveResearchAiConfig,
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

test("runResearchTask produces a deterministic dossier and frozen feature snapshot for one fixture", async () => {
  const result = await runResearchTask({
    fixture: scheduledFixture,
    generatedAt: "2026-04-16T12:00:00.000Z",
  });

  assert.equal(result.fixture.id, scheduledFixture.id);
  assert.equal(result.dossier.fixtureId, scheduledFixture.id);
  assert.equal(result.featureSnapshot.fixtureId, scheduledFixture.id);
  assert.equal(result.featureSnapshot.recommendedLean, result.dossier.recommendedLean);
  assert.equal(result.featureSnapshot.readiness.status, "ready");
  assert.equal(result.featureSnapshot.researchTrace?.synthesisMode, "deterministic");
  assert.equal(result.persistableResearchBundle.generatedAt, "2026-04-16T12:00:00.000Z");
  assert.equal(result.persistableResearchBundle.gateResult.status, "degraded");
  assert.equal(result.persistableFeatureSnapshot.generatedAt, "2026-04-16T12:00:00.000Z");
  assert.equal(result.persistableFeatureSnapshot.recommendedLean, result.featureSnapshot.recommendedLean);
  assert.equal(result.persistableFeatureSnapshot.readiness.status, "needs-review");
  assert.equal(result.persistableFeatureSnapshot.researchTrace?.synthesisMode, "deterministic");
  assert.equal(result.fixture.metadata.researchGeneratedAt, undefined);
  assert.equal(result.fixture.metadata.researchRecommendedLean, undefined);
  assert.equal(result.fixture.metadata.featureReadinessStatus, undefined);
  assert.equal(result.fixture.metadata.researchSynthesisMode, undefined);
  assert.equal(result.workflow?.enrichmentStatus, "succeeded");
  assert.equal(result.workflow?.candidateStatus, "blocked");
  assert.equal(result.workflow?.lastEnrichedAt, "2026-04-16T12:00:00.000Z");
});

test("runResearchWorker skips non-scheduled fixtures and reports counts", async () => {
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

  const summary = await runResearchWorker({
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

test("runResearchTask prefers persisted availability and lineup snapshots over fixture metadata", async () => {
  const persistedFixture = createFixture({
    ...scheduledFixture,
    id: "fixture:api-football:777",
    metadata: {
      formHome: "0.74",
      formAway: "0.41",
      restHomeDays: "6",
      restAwayDays: "3",
      derby: "true",
    },
  });
  const availabilitySnapshots = [
    createAvailabilitySnapshot({
      id: "availability-home",
      batchId: "batch-a",
      fixtureId: persistedFixture.id,
      providerFixtureId: "777",
      providerCode: "api-football",
      teamSide: "home",
      subjectType: "player",
      subjectName: "Home striker",
      status: "out",
      capturedAt: "2026-04-16T11:30:00.000Z",
      summary: "Home striker out",
      payload: {},
    }),
    createAvailabilitySnapshot({
      id: "availability-away",
      batchId: "batch-a",
      fixtureId: persistedFixture.id,
      providerFixtureId: "777",
      providerCode: "api-football",
      teamSide: "away",
      subjectType: "player",
      subjectName: "Away midfielder",
      status: "questionable",
      capturedAt: "2026-04-16T11:32:00.000Z",
      summary: "Away midfielder questionable",
      payload: {},
    }),
  ];
  const lineupSnapshots = [
    createLineupSnapshot({
      id: "lineup-home",
      batchId: "batch-l",
      fixtureId: persistedFixture.id,
      providerFixtureId: "777",
      providerCode: "api-football",
      teamSide: "home",
      lineupStatus: "confirmed",
      formation: "4-2-3-1",
      capturedAt: "2026-04-16T11:40:00.000Z",
      payload: {},
    }),
    createLineupSnapshot({
      id: "lineup-away",
      batchId: "batch-l",
      fixtureId: persistedFixture.id,
      providerFixtureId: "777",
      providerCode: "api-football",
      teamSide: "away",
      lineupStatus: "projected",
      formation: "4-3-3",
      capturedAt: "2026-04-16T11:41:00.000Z",
      payload: {},
    }),
  ];
  const lineupParticipants = [
    createLineupParticipant({
      id: "lineup-home-p1",
      lineupSnapshotId: "lineup-home",
      index: 0,
      participantName: "Home striker",
      role: "starting",
    }),
  ];

  const result = await runResearchTask({
    fixture: persistedFixture,
    generatedAt: "2026-04-16T12:00:00.000Z",
    persistence: {
      availabilitySnapshots: {
        async findByFixtureId(fixtureId) {
          return availabilitySnapshots.filter((snapshot) => snapshot.fixtureId === fixtureId);
        },
      },
      lineupSnapshots: {
        async findByFixtureId(fixtureId) {
          return lineupSnapshots.filter((snapshot) => snapshot.fixtureId === fixtureId);
        },
      },
      lineupParticipants: {
        async findByLineupSnapshotId(lineupSnapshotId) {
          return lineupParticipants.filter((participant) => participant.lineupSnapshotId === lineupSnapshotId);
        },
      },
    },
  });

  assert.equal(result.featureSnapshot.features.injuriesHome, 1);
  assert.equal(result.featureSnapshot.features.injuriesAway, 1);
  assert.equal(
    result.persistableResearchBundle.sources.some((source) => source.provider === "availability-snapshot"),
    true,
  );
  assert.equal(
    result.persistableResearchBundle.sources.some((source) => source.provider === "lineup-snapshot"),
    true,
  );
});

test("resolveResearchAiConfig enables AI mode from environment defaults", () => {
  const config = resolveResearchAiConfig({
    GANA_RESEARCH_SYNTHESIS_MODE: "ai-assisted",
    GANA_RESEARCH_AI_MODEL: "gpt-5.4-mini",
    GANA_RESEARCH_AI_REASONING: "high",
    GANA_RESEARCH_AI_PROMPT_VERSION: "v-custom",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.requestedModel, "gpt-5.4-mini");
  assert.equal(config.requestedReasoning, "high");
  assert.equal(config.promptVersion, "v-custom");
});

test("resolveResearchAiConfig enables web search mode from environment", () => {
  const autoConfig = resolveResearchAiConfig({
    GANA_RESEARCH_SYNTHESIS_MODE: "ai-assisted",
    GANA_RESEARCH_WEB_SEARCH_MODE: "auto",
  });
  const requiredConfig = resolveResearchAiConfig({
    GANA_ENABLE_RESEARCH_AI: "1",
    GANA_RESEARCH_WEB_SEARCH_MODE: "required",
  });

  assert.equal(autoConfig.webSearchMode, "auto");
  assert.equal(requiredConfig.webSearchMode, "required");
});

test("AI fallback preserves deterministic dossier baseline when synthesis fails", async () => {
  const deterministic = await runResearchTask({
    fixture: scheduledFixture,
    generatedAt: "2026-04-16T12:00:00.000Z",
  });

  const result = await runResearchTask({
    fixture: scheduledFixture,
    generatedAt: "2026-04-16T12:00:00.000Z",
    ai: {
      enabled: true,
      codexAdapter: {
        provider: "codex",
        async run() {
          throw new Error("provider timeout");
        },
        async *stream() {
          throw new Error("provider timeout");
        },
        async listModels() {
          return [];
        },
      },
    },
  });

  assert.equal(result.dossier.summary, deterministic.dossier.summary);
  assert.equal(result.dossier.recommendedLean, deterministic.dossier.recommendedLean);
  assert.equal(result.featureSnapshot.researchTrace?.synthesisMode, "ai-fallback");
  assert.match(result.featureSnapshot.researchTrace?.fallbackSummary ?? "", /provider timeout/i);
  assert.equal(result.persistableFeatureSnapshot.researchTrace?.synthesisMode, "ai-fallback");
  assert.match(result.persistableFeatureSnapshot.researchTrace?.fallbackSummary ?? "", /provider timeout/i);
  assert.match(result.persistableResearchBundle.trace?.fallbackSummary ?? "", /provider timeout/i);
  assert.equal(result.fixture.metadata.researchFallbackSummary, undefined);
  assert.ok(result.dossier.risks.some((risk) => risk.includes("fallback")));
  assert.equal(result.aiRun?.status, "failed");
});
