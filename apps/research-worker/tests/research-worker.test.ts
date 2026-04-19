import test from "node:test";
import assert from "node:assert/strict";

import { createFixture } from "@gana-v8/domain-core";
import { buildResearchDossier } from "@gana-v8/research-engine";

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
  assert.equal(result.fixture.metadata.researchGeneratedAt, "2026-04-16T12:00:00.000Z");
  assert.equal(result.fixture.metadata.researchRecommendedLean, result.featureSnapshot.recommendedLean);
  assert.equal(result.fixture.metadata.featureReadinessStatus, "ready");
  assert.equal(result.fixture.metadata.researchSynthesisMode, "deterministic");
  assert.equal(result.workflow?.enrichmentStatus, "succeeded");
  assert.equal(result.workflow?.candidateStatus, "succeeded");
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

test("AI fallback preserves deterministic dossier baseline when synthesis fails", async () => {
  const deterministic = buildResearchDossier(scheduledFixture, {
    now: () => "2026-04-16T12:00:00.000Z",
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

  assert.equal(result.dossier.summary, deterministic.summary);
  assert.equal(result.featureSnapshot.researchTrace?.synthesisMode, "ai-fallback");
  assert.match(result.featureSnapshot.researchTrace?.fallbackSummary ?? "", /provider timeout/i);
  assert.match(result.fixture.metadata.researchFallbackSummary ?? "", /provider timeout/i);
  assert.ok(result.dossier.risks.some((risk) => risk.includes("fallback")));
  assert.equal(result.aiRun?.status, "failed");
});
