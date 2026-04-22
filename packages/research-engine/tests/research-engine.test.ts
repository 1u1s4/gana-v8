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
  const signals = {
    form: { home: 0.83, away: 0.49, updatedAt: "2026-04-14T17:00:00.000Z" },
    schedule: { restHomeDays: 6, restAwayDays: 3, updatedAt: "2026-04-14T17:00:00.000Z" },
    availability: {
      injuriesHome: 1,
      injuriesAway: 4,
      official: true,
      updatedAt: "2026-04-14T17:30:00.000Z",
      homeUnavailableNames: ["Home CB"],
      awayUnavailableNames: ["Away DM", "Away FW", "Away LB", "Away GK"],
    },
    context: { derby: true, drawBias: 0.12, updatedAt: "2026-04-14T17:00:00.000Z" },
    lineups: {
      official: true,
      updatedAt: "2026-04-14T17:35:00.000Z",
      home: { status: "confirmed", formation: "4-2-3-1" },
      away: { status: "projected", formation: "4-3-3" },
    },
  } as const;
  const brief = buildResearchBrief(fixture, { now, signals });
  const evidence = createBaselineEvidence(fixture, { now, signals });
  const dossier = buildResearchDossier(fixture, { now, evidence, signals });

  assert.match(brief.headline, /Research brief Arsenal vs Chelsea/);
  assert.ok(evidence.length >= 4);
  assert.equal(dossier.fixtureId, fixture.id);
  assert.equal(dossier.recommendedLean, "home");
  assert.ok(dossier.directionalScore.home > dossier.directionalScore.away);
  assert.ok(dossier.summary.includes("lean home"));
  assert.equal(pickTopEvidence(evidence, 2).length, 2);
  assert.equal(evidence.some((item) => item.source.provider === "lineup-snapshot"), true);
});
