import assert from "node:assert/strict";
import test from "node:test";

import {
  createDailyAutomationPolicy,
  createFixture,
  createFixtureWorkflow,
  createLeagueCoveragePolicy,
  createTeamCoveragePolicy,
} from "@gana-v8/domain-core";

import {
  describeWorkspace,
  evaluateFixtureCoverageScope,
  evaluateOperationalPolicy,
} from "../src/index.ts";

test("policy-engine reports ready status when health, retries, and backfills are clean", () => {
  const report = evaluateOperationalPolicy({
    health: { status: "ok", checks: [] },
    retries: { retrying: 0, failed: 0, quarantined: 0, exhausted: 0 },
    backfills: [{ area: "fixtures", status: "ok", detail: "fresh" }],
    traceability: { taskTraceCoverageRate: 1, aiRunRequestCoverageRate: 1 },
  });

  assert.match(describeWorkspace(), /policy-engine/);
  assert.equal(report.status, "ready");
  assert.equal(report.publishAllowed, true);
});

test("policy-engine blocks publication when quarantines or backfills exist", () => {
  const report = evaluateOperationalPolicy({
    health: { status: "degraded", checks: [{ name: "live-fixtures-freshness", status: "warn", detail: "36h old" }] },
    retries: { retrying: 1, failed: 2, quarantined: 1, exhausted: 0 },
    backfills: [{ area: "fixtures", status: "needed", detail: "Latest fixtures batch is stale" }],
    traceability: { taskTraceCoverageRate: 0.9, aiRunRequestCoverageRate: 0.8 },
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.publishAllowed, false);
  assert.equal(report.backfillRequired, true);
  assert.equal(report.gates.some((gate) => gate.name === "retries" && gate.status === "block"), true);
});

test("coverage scope resolver force-includes tracked fixtures but blocks scoring below min odd", () => {
  const fixture = createFixture({
    id: "fx-coverage-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Liverpool",
    awayTeam: "Chelsea",
    scheduledAt: "2099-01-01T18:00:00.000Z",
    status: "scheduled",
    metadata: {
      providerCode: "api-football",
      providerLeagueId: "39",
      providerHomeTeamId: "40",
      providerAwayTeamId: "49",
    },
  });
  const workflow = createFixtureWorkflow({
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
    minDetectedOdd: 1.11,
  });
  const leaguePolicy = createLeagueCoveragePolicy({
    id: "lcp-epl-2026",
    provider: "api-football",
    leagueKey: "39",
    leagueName: "Premier League",
    season: 2099,
    enabled: true,
    alwaysOn: true,
    priority: 90,
    marketsAllowed: ["moneyline"],
  });
  const teamPolicy = createTeamCoveragePolicy({
    id: "tcp-liverpool",
    provider: "api-football",
    teamKey: "40",
    teamName: "Liverpool",
    enabled: true,
    alwaysTrack: true,
    priority: 95,
    followHome: true,
    followAway: true,
    forceResearch: true,
  });
  const dailyPolicy = createDailyAutomationPolicy({
    id: "dap-default",
    policyName: "default",
    enabled: true,
    timezone: "America/Guatemala",
    minAllowedOdd: 1.2,
    defaultMaxFixturesPerRun: 30,
    defaultLookaheadHours: 24,
    defaultLookbackHours: 6,
    requireTrackedLeagueOrTeam: true,
    allowManualInclusionBypass: true,
  });

  const decision = evaluateFixtureCoverageScope({
    fixture,
    workflow,
    leaguePolicies: [leaguePolicy],
    teamPolicies: [teamPolicy],
    dailyPolicy,
    minDetectedOdd: 1.11,
    now: "2099-01-01T10:00:00.000Z",
  });

  assert.equal(decision.included, true);
  assert.equal(decision.visibleInOps, true);
  assert.equal(decision.eligibleForScoring, false);
  assert.equal(decision.eligibleForParlay, false);
  assert.equal(decision.matchedLeaguePolicyId, leaguePolicy.id);
  assert.deepEqual(decision.matchedTeamPolicyIds, [teamPolicy.id]);
  assert.equal(decision.includedBy.some((reason) => reason.code === "force-include"), true);
  assert.equal(decision.excludedBy.some((reason) => reason.code === "odds-below-min-threshold"), true);
});

test("coverage scope resolver excludes untracked fixtures when policy requires tracked league or team", () => {
  const fixture = createFixture({
    id: "fx-coverage-2",
    sport: "football",
    competition: "Untracked League",
    homeTeam: "Home",
    awayTeam: "Away",
    scheduledAt: "2099-01-01T20:00:00.000Z",
    status: "scheduled",
    metadata: { providerCode: "api-football" },
  });
  const dailyPolicy = createDailyAutomationPolicy({
    id: "dap-default-2",
    policyName: "default-2",
    enabled: true,
    timezone: "America/Guatemala",
    minAllowedOdd: 1.2,
    defaultMaxFixturesPerRun: 30,
    defaultLookaheadHours: 24,
    defaultLookbackHours: 6,
    requireTrackedLeagueOrTeam: true,
    allowManualInclusionBypass: true,
  });

  const decision = evaluateFixtureCoverageScope({
    fixture,
    leaguePolicies: [],
    teamPolicies: [],
    dailyPolicy,
    minDetectedOdd: 1.8,
    now: "2099-01-01T10:00:00.000Z",
  });

  assert.equal(decision.included, false);
  assert.equal(decision.visibleInOps, true);
  assert.equal(decision.eligibleForScoring, false);
  assert.equal(decision.excludedBy.some((reason) => reason.code === "not-tracked-by-policy"), true);
});
