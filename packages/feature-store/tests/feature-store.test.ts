import test from "node:test";
import assert from "node:assert/strict";

import { createFixture } from "@gana-v8/domain-core";
import { buildResearchDossier } from "../../research-engine/src/index.js";

import {
  applyFeatureSnapshotToFixture,
  buildFeatureVectorSnapshot,
  summarizeFeatureReadiness,
  summarizePersistedFeatureMetadata,
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
    formHome: "0.74",
    formAway: "0.41",
    restHomeDays: "6",
    restAwayDays: "3",
    injuriesHome: "1",
    injuriesAway: "3",
    derby: "true",
  },
});

test("buildFeatureVectorSnapshot freezes research-derived scoring features", () => {
  const dossier = buildResearchDossier(fixture, {
    now: () => "2026-04-16T12:00:00.000Z",
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
    evidence: [],
  });

  const snapshot = buildFeatureVectorSnapshot({
    fixture,
    dossier,
    generatedAt: "2026-04-16T12:05:00.000Z",
  });

  const readiness = summarizeFeatureReadiness(snapshot);
  assert.equal(readiness.status, "needs-review");
  assert.match(readiness.reasons.join("\n"), /evidence/i);
});

test("applyFeatureSnapshotToFixture persists research AI trace metadata for downstream consumers", () => {
  const dossier = buildResearchDossier(fixture, {
    now: () => "2026-04-16T12:00:00.000Z",
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
  });

  const enrichedFixture = applyFeatureSnapshotToFixture(fixture, snapshot);
  const persisted = summarizePersistedFeatureMetadata(enrichedFixture);

  assert.equal(persisted.researchSynthesisMode, "ai-fallback");
  assert.equal(persisted.researchAiRunId, "airun:fallback");
  assert.equal(persisted.researchAiProvider, "codex");
  assert.equal(persisted.researchAiModel, "gpt-5.4-mini");
  assert.match(persisted.researchFallbackSummary ?? "", /provider timeout/i);
});
