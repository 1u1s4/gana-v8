import test from "node:test";
import assert from "node:assert/strict";

import { createFixture } from "@gana-v8/domain-core";
import { buildResearchDossier } from "../../research-engine/src/index.js";

import {
  buildFeatureVectorSnapshot,
  summarizeFeatureReadiness,
} from "../src/index.js";

const fixture = createFixture({
  id: "fixture:api-football:123",
  sport: "football",
  competition: "Liga Profesional",
  homeTeam: "Boca Juniors",
  awayTeam: "River Plate",
  scheduledAt: "2026-04-16T20:00:00.000Z",
  status: "scheduled",
  metadata: {
    derby: "true",
  },
});

test("buildFeatureVectorSnapshot freezes research-derived scoring features from structured signals", () => {
  const dossier = buildResearchDossier(fixture, {
    now: () => "2026-04-16T12:00:00.000Z",
    signals: {
      form: { home: 0.74, away: 0.41 },
      schedule: { restHomeDays: 6, restAwayDays: 3 },
      availability: { injuriesHome: 1, injuriesAway: 3, official: true },
      context: { derby: true, drawBias: 0.1 },
    },
  });

  const snapshot = buildFeatureVectorSnapshot({
    fixture,
    dossier,
    generatedAt: "2026-04-16T12:05:00.000Z",
    researchTrace: {
      synthesisMode: "ai-assisted",
      aiRunId: "airun:test",
      aiProvider: "codex",
      aiModel: "gpt-5.4",
      aiPromptVersion: "v8-slice-1",
      providerRequestId: "req_123",
    },
    signals: {
      form: { home: 0.74, away: 0.41 },
      schedule: { restHomeDays: 6, restAwayDays: 3 },
      availability: { injuriesHome: 1, injuriesAway: 3, official: true },
      context: { derby: true },
    },
  });

  assert.equal(snapshot.fixtureId, fixture.id);
  assert.equal(snapshot.generatedAt, "2026-04-16T12:05:00.000Z");
  assert.equal(snapshot.recommendedLean, dossier.recommendedLean);
  assert.equal(snapshot.evidenceCount, dossier.evidence.length);
  assert.equal(snapshot.topEvidence.length, Math.min(3, dossier.evidence.length));
  assert.equal(snapshot.features.derby, 1);
  assert.equal(snapshot.features.injuriesAway, 3);
  assert.ok(snapshot.features.researchScoreHome > snapshot.features.researchScoreAway);
  assert.equal(snapshot.readiness.status, "ready");
  assert.equal(snapshot.researchTrace?.providerRequestId, "req_123");
});

test("summarizeFeatureReadiness marks snapshots with no evidence as degraded", () => {
  const dossier = buildResearchDossier(fixture, {
    now: () => "2026-04-16T12:00:00.000Z",
    signals: {
      form: { home: 0.74, away: 0.41 },
      schedule: { restHomeDays: 6, restAwayDays: 3 },
      availability: { injuriesHome: 1, injuriesAway: 3, official: true },
      context: { derby: true, drawBias: 0.1 },
    },
  });

  const snapshot = buildFeatureVectorSnapshot({
    fixture,
    dossier,
    generatedAt: "2026-04-16T12:05:00.000Z",
    signals: {
      form: { home: 0.74, away: 0.41 },
      schedule: { restHomeDays: 6, restAwayDays: 3 },
      availability: { injuriesHome: 1, injuriesAway: 3, official: true },
      context: { derby: true },
    },
  });
  const degradedSnapshot = {
    ...snapshot,
    evidenceCount: 0,
    readiness: {
      status: "ready" as const,
      reasons: [],
    },
  };

  const readiness = summarizeFeatureReadiness(degradedSnapshot);
  assert.equal(readiness.status, "needs-review");
  assert.match(readiness.reasons.join("\n"), /evidence/i);
});

test("buildFeatureVectorSnapshot preserves AI trace without writing fixture metadata", () => {
  const dossier = buildResearchDossier(fixture, {
    now: () => "2026-04-16T12:00:00.000Z",
    signals: {
      form: { home: 0.74, away: 0.41 },
      schedule: { restHomeDays: 6, restAwayDays: 3 },
      availability: { injuriesHome: 1, injuriesAway: 3, official: true },
      context: { derby: true, drawBias: 0.1 },
    },
  });
  const snapshot = buildFeatureVectorSnapshot({
    fixture,
    dossier,
    generatedAt: "2026-04-16T12:05:00.000Z",
    researchTrace: {
      synthesisMode: "ai-fallback",
      aiRunId: "airun:fallback",
      aiProvider: "codex",
      aiModel: "gpt-5.4-mini",
      aiPromptVersion: "v8-slice-1",
      fallbackSummary: "AI synthesis fallback to deterministic baseline: provider timeout",
    },
    signals: {
      form: { home: 0.74, away: 0.41 },
      schedule: { restHomeDays: 6, restAwayDays: 3 },
      availability: { injuriesHome: 1, injuriesAway: 3, official: true },
      context: { derby: true },
    },
  });

  assert.equal(snapshot.researchTrace?.synthesisMode, "ai-fallback");
  assert.equal(snapshot.researchTrace?.aiRunId, "airun:fallback");
  assert.equal(snapshot.researchTrace?.aiProvider, "codex");
  assert.equal(snapshot.researchTrace?.aiModel, "gpt-5.4-mini");
  assert.match(snapshot.researchTrace?.fallbackSummary ?? "", /provider timeout/i);
  assert.equal(fixture.metadata.researchAiRunId, undefined);
});
