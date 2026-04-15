import assert from "node:assert/strict";
import test from "node:test";

import { createFixture } from "@gana-v8/domain-core";

import {
  buildResearchBrief,
  buildResearchDossier,
  createBaselineEvidence,
  pickTopEvidence,
} from "../src/index.ts";

const now = () => "2026-04-14T18:00:00.000Z";

const fixture = createFixture({
  id: "fx-research-1",
  sport: "football",
  competition: "Premier League",
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  scheduledAt: "2026-04-14T21:00:00.000Z",
  status: "scheduled",
  metadata: {
    derby: "true",
    formHome: "0.83",
    formAway: "0.49",
    restHomeDays: "6",
    restAwayDays: "3",
    injuriesHome: "1",
    injuriesAway: "4",
    drawBias: "0.12",
  },
});

test("research engine builds brief, evidence, and dossier from fixture metadata", () => {
  const brief = buildResearchBrief(fixture, { now });
  const evidence = createBaselineEvidence(fixture, { now });
  const dossier = buildResearchDossier(fixture, { now, evidence });

  assert.match(brief.headline, /Research brief Arsenal vs Chelsea/);
  assert.ok(evidence.length >= 4);
  assert.equal(dossier.fixtureId, fixture.id);
  assert.equal(dossier.recommendedLean, "home");
  assert.ok(dossier.directionalScore.home > dossier.directionalScore.away);
  assert.ok(dossier.summary.includes("lean home"));
  assert.equal(pickTopEvidence(evidence, 2).length, 2);
});
