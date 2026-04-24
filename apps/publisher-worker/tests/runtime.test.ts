import assert from "node:assert/strict";
import test from "node:test";

import {
  createFeatureSnapshot,
  createDailyAutomationPolicy,
  createFixture,
  createFixtureWorkflow,
  createLeagueCoveragePolicy,
  createPrediction,
  createResearchBundle,
} from "@gana-v8/domain-core";
import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  describeWorkspace,
  publishParlayMvp,
  toAtomicCandidateFromPrediction,
  type PublishedPredictionRecord,
  type PublisherWorkerPrismaClientLike,
} from "../src/index.js";

const automationActor = (id = "automation:test", displayName = "Automation Test") => ({
  id,
  role: "automation" as const,
  capabilities: ["publish:preview"] as const,
  displayName,
});

const createAuthorizationActor = (input: {
  readonly id: string;
  readonly role: "viewer" | "operator" | "automation" | "system";
  readonly capabilities?: readonly (
    | "publish:preview"
    | "publish:parlay-store"
    | "publish:telegram"
    | "publish:discord"
    | "publish:webhook"
    | "queue:operate"
    | "workflow:override"
    | "*"
  )[];
  readonly displayName?: string;
}) => ({
  id: input.id,
  role: input.role,
  capabilities: [...(input.capabilities ?? [])],
  ...(input.displayName ? { displayName: input.displayName } : {}),
});

const fixture = (id: string, overrides: Partial<PublishedPredictionRecord["fixture"]> = {}) =>
  createFixture({
    id,
    sport: "football",
    competition: "Premier League",
    homeTeam: `Home ${id}`,
    awayTeam: `Away ${id}`,
    scheduledAt: "2026-04-16T18:00:00.000Z",
    status: "scheduled",
    metadata: {},
    ...overrides,
  });

const predictionRecord = (
  id: string,
  fixtureId: string,
  overrides: Partial<PublishedPredictionRecord> = {},
): PublishedPredictionRecord => ({
  ...createPrediction({
    id,
    fixtureId,
    market: "moneyline",
    outcome: "home",
    status: "published",
    confidence: 0.66,
    probabilities: { implied: 0.5, model: 0.62, edge: 0.12 },
    rationale: ["Deterministic edge"],
    publishedAt: "2026-04-16T12:00:00.000Z",
    createdAt: "2026-04-16T11:55:00.000Z",
    updatedAt: "2026-04-16T12:00:00.000Z",
  }),
  fixture: fixture(fixtureId),
  ...overrides,
});

const withLineage = (
  prediction: PublishedPredictionRecord,
  lineage: Record<string, unknown>,
): PublishedPredictionRecord => ({
  ...prediction,
  aiRun: {
    id: `airun:${prediction.id}`,
    taskId: `task:${prediction.id}`,
    task: {
      id: `task:${prediction.id}`,
      triggerKind: "system",
      payload: {
        fixtureId: prediction.fixtureId,
        source: "scoring-worker",
        lineage,
      },
    },
  },
});

const createClient = (
  predictions: readonly PublishedPredictionRecord[],
): PublisherWorkerPrismaClientLike => ({
  prediction: {
    async findMany() {
      return predictions.map((entry) => structuredClone(entry));
    },
  },
});

const previewEnv = {
  NODE_ENV: "test",
  GANA_RUNTIME_PROFILE: "human-qa-demo",
} as const;

const seedPublishableResearch = async (
  unitOfWork: ReturnType<typeof createInMemoryUnitOfWork>,
  fixtureIds: readonly string[],
  generatedAt = "2026-04-16T12:00:00.000Z",
): Promise<void> => {
  for (const fixtureId of fixtureIds) {
    const bundleId = `bundle:${fixtureId}:${generatedAt}`;
    await unitOfWork.researchBundles.save(
      createResearchBundle({
        id: bundleId,
        fixtureId,
        generatedAt,
        brief: {
          headline: `Research brief for ${fixtureId}`,
          context: "Publisher test research",
          questions: ["Should the fixture be publishable?"],
          assumptions: ["Use persisted research."],
        },
        summary: "Publishable research bundle",
        recommendedLean: "home",
        directionalScore: { home: 0.71, draw: 0.18, away: 0.22 },
        risks: [],
        gateResult: {
          status: "publishable",
          reasons: [],
          gatedAt: generatedAt,
        },
        trace: {
          synthesisMode: "deterministic",
        },
        createdAt: generatedAt,
        updatedAt: generatedAt,
      }),
    );
    await unitOfWork.featureSnapshots.save(
      createFeatureSnapshot({
        id: `feature:${fixtureId}:${generatedAt}`,
        fixtureId,
        bundleId,
        generatedAt,
        bundleStatus: "publishable",
        gateReasons: [],
        recommendedLean: "home",
        evidenceCount: 1,
        topEvidence: [
          {
            id: `research:${fixtureId}`,
            title: "Confirmed publishable bundle",
            direction: "home",
            weightedScore: 0.84,
          },
        ],
        risks: [],
        features: {
          researchScoreHome: 0.71,
          researchScoreDraw: 0.18,
          researchScoreAway: 0.22,
          formHome: 0.55,
          formAway: 0.44,
          restHomeDays: 5,
          restAwayDays: 4,
          injuriesHome: 0,
          injuriesAway: 1,
          derby: 0,
          hoursUntilKickoff: 4,
        },
        readiness: {
          status: "ready",
          reasons: [],
        },
        researchTrace: {
          synthesisMode: "deterministic",
        },
        createdAt: generatedAt,
        updatedAt: generatedAt,
      }),
    );
  }
};

test("toAtomicCandidateFromPrediction derives decimal price from implied probability", () => {
  const candidate = toAtomicCandidateFromPrediction(predictionRecord("pred-1", "fx-1"));

  assert.equal(candidate.price, 2);
  assert.equal(candidate.market, "moneyline");
  assert.equal(candidate.competition, "Premier League");
  assert.deepEqual(candidate.teamKeys, ["home-fx-1", "away-fx-1"]);
});

test("toAtomicCandidateFromPrediction accepts supported score-derived prediction markets", () => {
  const supported = [
    { market: "moneyline", outcome: "home" },
    { market: "totals", outcome: "over" },
    { market: "both-teams-score", outcome: "yes" },
    { market: "double-chance", outcome: "home-draw" },
  ] as const;

  for (const entry of supported) {
    const candidate = toAtomicCandidateFromPrediction(
      predictionRecord(`pred-${entry.market}`, `fx-${entry.market}`, {
        market: entry.market,
        outcome: entry.outcome,
      }),
    );

    assert.equal(candidate.market, entry.market);
    assert.equal(candidate.outcome, entry.outcome);
  }
});

test("publishParlayMvp persists a two-leg parlay from published predictions", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2", "fx-4"]);
  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-1", "fx-1", {
        confidence: 0.71,
        probabilities: { implied: 0.5, model: 0.64, edge: 0.14 },
      }),
      predictionRecord("pred-2", "fx-2", {
        confidence: 0.69,
        probabilities: { implied: 0.4761904762, model: 0.61, edge: 0.1338095238 },
      }),
      predictionRecord("pred-3", "fx-1", {
        publishedAt: "2026-04-16T11:00:00.000Z",
        updatedAt: "2026-04-16T11:00:00.000Z",
      }),
      predictionRecord("pred-4", "fx-4", {
        market: "totals",
        outcome: "over",
      }),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    env: previewEnv,
  });

  const parlays = await unitOfWork.parlays.list();
  const workflowOne = await unitOfWork.fixtureWorkflows.findByFixtureId("fx-1");
  const workflowTwo = await unitOfWork.fixtureWorkflows.findByFixtureId("fx-2");

  assert.match(describeWorkspace(), /publisher-worker/);
  assert.equal(result.status, "persisted");
  assert.equal(result.scorecard.ready, true);
  assert.equal(result.selectedCandidates.length, 2);
  assert.equal(result.selectedCandidates[0]?.price, 2);
  assert.equal(parlays.length, 1);
  assert.equal(parlays[0]?.legs.length, 2);
  assert.equal(parlays[0]?.status, "ready");
  assert.equal(workflowOne?.parlayStatus, "succeeded");
  assert.equal(workflowTwo?.parlayStatus, "succeeded");
  assert.equal(
    result.skipReasons.some((skip) => skip.reason === "duplicate-fixture"),
    true,
  );
  assert.equal(
    result.skipReasons.some((skip) => skip.reason === "unsupported-market"),
    false,
  );
});

test("publishParlayMvp persists a mixed-market parlay across different fixtures", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2", "fx-3", "fx-4"]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-moneyline", "fx-1", {
        market: "moneyline",
        outcome: "home",
        confidence: 0.78,
        probabilities: { implied: 0.45, model: 0.67, edge: 0.22 },
      }),
      predictionRecord("pred-totals", "fx-2", {
        market: "totals",
        outcome: "over",
        confidence: 0.75,
        probabilities: { implied: 0.48, model: 0.63, edge: 0.15 },
      }),
      predictionRecord("pred-btts", "fx-3", {
        market: "both-teams-score",
        outcome: "yes",
        confidence: 0.73,
        probabilities: { implied: 0.52, model: 0.61, edge: 0.09 },
      }),
      predictionRecord("pred-double-chance", "fx-4", {
        market: "double-chance",
        outcome: "home-draw",
        confidence: 0.7,
        probabilities: { implied: 0.58, model: 0.66, edge: 0.08 },
      }),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    minLegs: 4,
    maxLegs: 4,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.deepEqual(
    new Set(result.selectedCandidates.map((candidate) => candidate.market)),
    new Set(["moneyline", "totals", "both-teams-score", "double-chance"]),
  );
  assert.deepEqual(
    new Set(result.selectedCandidates.map((candidate) => candidate.fixtureId)),
    new Set(["fx-1", "fx-2", "fx-3", "fx-4"]),
  );
  assert.equal(
    result.skipReasons.some((skip) => skip.reason === "unsupported-market"),
    false,
  );
});

test("publishParlayMvp skips published corners predictions with explicit experimental policy reason", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2"]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-corners", "fx-corners", {
        market: "corners-total",
        outcome: "over",
        confidence: 0.82,
        probabilities: { implied: 0.46, model: 0.65, edge: 0.19, line: 9.5 },
      }),
      predictionRecord("pred-moneyline", "fx-1", {
        market: "moneyline",
        outcome: "home",
        confidence: 0.72,
        probabilities: { implied: 0.48, model: 0.63, edge: 0.15 },
      }),
      predictionRecord("pred-totals", "fx-2", {
        market: "totals",
        outcome: "over",
        confidence: 0.7,
        probabilities: { implied: 0.49, model: 0.61, edge: 0.12 },
      }),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    maxLegs: 2,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.deepEqual(
    result.selectedCandidates.map((candidate) => candidate.predictionId),
    ["pred-moneyline", "pred-totals"],
  );
  assert.equal(
    result.skipReasons.some(
      (skip) =>
        skip.predictionId === "pred-corners" &&
        skip.reason === "experimental-corners-policy-blocked",
    ),
    true,
  );
  assert.equal(
    result.skipReasons.some(
      (skip) => skip.predictionId === "pred-corners" && skip.reason === "unsupported-market",
    ),
    false,
  );
});

test("publishParlayMvp blocks same-fixture corners candidates with anti-correlation reason", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2"]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-fx1-corners", "fx-1", {
        market: "corners-h2h",
        outcome: "home",
        confidence: 0.91,
        probabilities: { implied: 0.44, model: 0.69, edge: 0.25 },
      }),
      predictionRecord("pred-fx1-moneyline", "fx-1", {
        market: "moneyline",
        outcome: "home",
        confidence: 0.73,
        probabilities: { implied: 0.48, model: 0.63, edge: 0.15 },
      }),
      predictionRecord("pred-fx2-totals", "fx-2", {
        market: "totals",
        outcome: "over",
        confidence: 0.7,
        probabilities: { implied: 0.49, model: 0.61, edge: 0.12 },
      }),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    maxLegs: 2,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.deepEqual(
    result.selectedCandidates.map((candidate) => candidate.predictionId),
    ["pred-fx1-moneyline", "pred-fx2-totals"],
  );
  assert.equal(
    result.skipReasons.some(
      (skip) =>
        skip.predictionId === "pred-fx1-corners" &&
        skip.reason === "experimental-corners-anti-correlation-blocked",
    ),
    true,
  );
  assert.equal(
    result.skipReasons.some(
      (skip) => skip.predictionId === "pred-fx1-corners" && skip.reason === "unsupported-market",
    ),
    false,
  );
});

test("publishParlayMvp keeps max one leg per fixture across mixed markets", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2"]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-fx1-moneyline", "fx-1", {
        market: "moneyline",
        outcome: "home",
        confidence: 0.61,
        probabilities: { implied: 0.5, model: 0.56, edge: 0.06 },
      }),
      predictionRecord("pred-fx1-totals", "fx-1", {
        market: "totals",
        outcome: "over",
        confidence: 0.79,
        probabilities: { implied: 0.47, model: 0.68, edge: 0.21 },
      }),
      predictionRecord("pred-fx2-btts", "fx-2", {
        market: "both-teams-score",
        outcome: "yes",
        confidence: 0.74,
        probabilities: { implied: 0.49, model: 0.64, edge: 0.15 },
      }),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    maxLegs: 2,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.deepEqual(
    result.selectedCandidates.map((candidate) => candidate.predictionId),
    ["pred-fx1-totals", "pred-fx2-btts"],
  );
  assert.equal(
    result.skipReasons.some(
      (skip) => skip.predictionId === "pred-fx1-moneyline" && skip.reason === "duplicate-fixture",
    ),
    true,
  );
});

test("publishParlayMvp returns scorecard and reasons when not enough valid predictions", async () => {
  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-1", "fx-1"),
      predictionRecord("pred-2", "fx-2", {
        probabilities: { implied: 0, model: 0.58, edge: 0.58 },
      }),
    ]),
    generatedAt: "2026-04-16T12:35:00.000Z",
    stake: 10,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.parlay, undefined);
  assert.equal(result.scorecard.ready, false);
  assert.match(result.scorecard.reasons.join(" | "), /requires at least 2 legs/);
  assert.equal(
    result.skipReasons.some((skip) => skip.reason === "invalid-implied-probability"),
    true,
  );
});

test("publishParlayMvp respects workflow overrides when selecting parlay legs", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2", "fx-3", "fx-4"]);
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: "fx-1",
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "succeeded",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      selectionOverride: "force-include",
    }),
  );
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: "fx-3",
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "succeeded",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      selectionOverride: "force-exclude",
    }),
  );

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-force-include", "fx-1", {
        confidence: 0.42,
        probabilities: { implied: 0.54, model: 0.46, edge: -0.08 },
      }),
      predictionRecord("pred-best", "fx-2", {
        confidence: 0.76,
        probabilities: { implied: 0.45, model: 0.67, edge: 0.22 },
      }),
      predictionRecord("pred-force-exclude", "fx-3", {
        confidence: 0.79,
        probabilities: { implied: 0.42, model: 0.69, edge: 0.27 },
      }),
      predictionRecord("pred-alternate", "fx-4", {
        confidence: 0.74,
        probabilities: { implied: 0.47, model: 0.63, edge: 0.16 },
      }),
    ]),
    generatedAt: "2026-04-16T12:40:00.000Z",
    stake: 10,
    unitOfWork,
    maxLegs: 2,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.equal(
    result.selectedCandidates.some((candidate) => candidate.predictionId === "pred-force-include"),
    true,
  );
  assert.equal(
    result.selectedCandidates.some((candidate) => candidate.predictionId === "pred-force-exclude"),
    false,
  );
  assert.equal(
    result.skipReasons.some(
      (skip) => skip.predictionId === "pred-force-exclude" && skip.reason === "workflow-excluded",
    ),
    true,
  );
});

test("publishParlayMvp excludes predictions blocked by coverage policy and records blocked parlay workflow audit", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-blocked", "fx-2", "fx-3"]);
  await unitOfWork.leagueCoveragePolicies.save(
    createLeagueCoveragePolicy({
      id: "league-pl",
      provider: "api-football",
      leagueKey: "39",
      leagueName: "Premier League",
      season: 2026,
      enabled: true,
      alwaysOn: true,
      priority: 10,
      marketsAllowed: ["moneyline"],
    }),
  );
  await unitOfWork.dailyAutomationPolicies.save(
    createDailyAutomationPolicy({
      id: "daily-policy",
      policyName: "default",
      timezone: "America/Guatemala",
      enabled: true,
      minAllowedOdd: 1.2,
      defaultMaxFixturesPerRun: 50,
      defaultLookaheadHours: 24,
      defaultLookbackHours: 6,
      requireTrackedLeagueOrTeam: true,
      allowManualInclusionBypass: true,
    }),
  );
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: "fx-blocked",
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "succeeded",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      minDetectedOdd: 1.11,
    }),
  );
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: "fx-2",
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "succeeded",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      minDetectedOdd: 1.5,
    }),
  );
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: "fx-3",
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "succeeded",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      minDetectedOdd: 1.7,
    }),
  );

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-blocked", "fx-blocked", {
        fixture: fixture("fx-blocked", {
          metadata: { providerLeagueId: "39" },
        }),
        confidence: 0.8,
        probabilities: { implied: 0.78, model: 0.84, edge: 0.06 },
      }),
      predictionRecord("pred-best", "fx-2", {
        fixture: fixture("fx-2", {
          metadata: { providerLeagueId: "39" },
        }),
        confidence: 0.76,
        probabilities: { implied: 0.45, model: 0.67, edge: 0.22 },
      }),
      predictionRecord("pred-alternate", "fx-3", {
        fixture: fixture("fx-3", {
          metadata: { providerLeagueId: "39" },
        }),
        confidence: 0.74,
        probabilities: { implied: 0.47, model: 0.63, edge: 0.16 },
      }),
    ]),
    generatedAt: "2026-04-16T12:40:00.000Z",
    stake: 10,
    unitOfWork,
    maxLegs: 2,
    env: previewEnv,
  });

  const blockedWorkflow = await unitOfWork.fixtureWorkflows.findByFixtureId("fx-blocked");
  const blockedDiagnostics = blockedWorkflow?.diagnostics as
    | { coverageDecision?: { excludedBy?: Array<{ code?: string }> } }
    | undefined;
  const auditEvents = await unitOfWork.auditEvents.list();

  assert.equal(result.status, "persisted");
  assert.deepEqual(
    result.selectedCandidates.map((candidate) => candidate.predictionId),
    ["pred-best", "pred-alternate"],
  );
  assert.equal(
    result.skipReasons.some(
      (skip) => skip.predictionId === "pred-blocked" && skip.reason === "coverage-policy-blocked",
    ),
    true,
  );
  assert.equal(blockedWorkflow?.parlayStatus, "blocked");
  assert.equal(
    blockedDiagnostics?.coverageDecision?.excludedBy?.some((reason) => reason.code === "odds-below-min-threshold"),
    true,
  );
  assert.equal(
    auditEvents.some(
      (event) =>
        event.aggregateType === "fixture-workflow" &&
        event.aggregateId === "fx-blocked" &&
        event.eventType === "fixture-workflow.coverage-policy.blocked",
    ),
    true,
  );
});

test("publishParlayMvp scopes parlay selection to the current prediction task ids and excludes historical predictions", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2", "fx-old"]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      withLineage(
        predictionRecord("pred-current-1", "fx-1", {
          confidence: 0.64,
          probabilities: { implied: 0.5, model: 0.61, edge: 0.11 },
        }),
        {
          environment: "test",
          profile: "ci-smoke",
          providerSource: "mock",
          demoMode: true,
          cohort: "demo:ci-smoke",
          source: "scoring-worker",
        },
      ),
      {
        ...withLineage(
          predictionRecord("pred-current-2", "fx-2", {
            confidence: 0.63,
            probabilities: { implied: 0.48, model: 0.59, edge: 0.11 },
          }),
          {
            environment: "test",
            profile: "ci-smoke",
            providerSource: "mock",
            demoMode: true,
            cohort: "demo:ci-smoke",
            source: "scoring-worker",
          },
        ),
        aiRun: {
          id: "airun:pred-current-2",
          taskId: "task:current-2",
          task: {
            id: "task:current-2",
            triggerKind: "system",
            payload: {
              fixtureId: "fx-2",
              source: "scoring-worker",
              lineage: {
                environment: "test",
                profile: "ci-smoke",
                providerSource: "mock",
                demoMode: true,
                cohort: "demo:ci-smoke",
                source: "scoring-worker",
              },
            },
          },
        },
      },
      {
        ...withLineage(
          predictionRecord("pred-historical-best", "fx-old", {
            confidence: 0.99,
            probabilities: { implied: 0.4, model: 0.75, edge: 0.35 },
            publishedAt: "2026-04-15T12:00:00.000Z",
            updatedAt: "2026-04-15T12:00:00.000Z",
          }),
          {
            environment: "test",
            profile: "ci-smoke",
            providerSource: "mock",
            demoMode: true,
            cohort: "demo:ci-smoke",
            source: "scoring-worker",
          },
        ),
        aiRun: {
          id: "airun:pred-historical-best",
          taskId: "task:historical-best",
          task: {
            id: "task:historical-best",
            triggerKind: "system",
            payload: {
              fixtureId: "fx-old",
              source: "scoring-worker",
              lineage: {
                environment: "test",
                profile: "ci-smoke",
                providerSource: "mock",
                demoMode: true,
                cohort: "demo:ci-smoke",
                source: "scoring-worker",
              },
            },
          },
        },
      },
    ]),
    generatedAt: "2026-04-16T12:40:00.000Z",
    stake: 10,
    unitOfWork,
    predictionTaskIds: ["task:pred-current-1", "task:current-2"],
    maxLegs: 2,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.deepEqual(
    result.selectedCandidates.map((candidate) => candidate.predictionId),
    ["pred-current-1", "pred-current-2"],
  );
  assert.equal(
    result.selectedCandidates.some((candidate) => candidate.predictionId === "pred-historical-best"),
    false,
  );
});

test("publishParlayMvp excludes far-future demo predictions when live candidates are available", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, [
    "fixture:api-football:1499245",
    "fixture:api-football:1499240",
    "haemo4orszd-fixture-1",
  ]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord("pred-mictlan", "fixture:api-football:1499245", {
        outcome: "home",
        confidence: 0.676,
        probabilities: { implied: 0.4463, model: 0.4498, edge: 0.0035 },
        fixture: fixture("fixture:api-football:1499245", {
          competition: "Liga Nacional",
          homeTeam: "Mictlán",
          awayTeam: "Xelajú",
          scheduledAt: "2026-04-19T23:00:00.000Z",
        }),
        publishedAt: "2026-04-19T19:43:33.728Z",
        updatedAt: "2026-04-19T19:43:33.728Z",
      }),
      predictionRecord("pred-antigua", "fixture:api-football:1499240", {
        outcome: "draw",
        confidence: 0.3422,
        probabilities: { implied: 0.2315, model: 0.2416, edge: 0.0101 },
        fixture: fixture("fixture:api-football:1499240", {
          competition: "Liga Nacional",
          homeTeam: "Antigua GFC",
          awayTeam: "Malacateco",
          scheduledAt: "2026-04-20T01:00:00.000Z",
        }),
        publishedAt: "2026-04-19T19:43:37.639Z",
        updatedAt: "2026-04-19T19:43:37.639Z",
      }),
      predictionRecord("pred-demo", "haemo4orszd-fixture-1", {
        outcome: "away",
        confidence: 0.3241,
        probabilities: { implied: 0.1982, model: 0.2477, edge: 0.0495 },
        fixture: fixture("haemo4orszd-fixture-1", {
          competition: "Automation Test League",
          homeTeam: "Home 1",
          awayTeam: "Away 1",
          scheduledAt: "2099-01-01T10:00:00.000Z",
        }),
        publishedAt: "2099-01-01T10:05:00.000Z",
        updatedAt: "2099-01-01T10:05:00.000Z",
      }),
    ]),
    generatedAt: "2026-04-19T19:44:00.000Z",
    stake: 10,
    unitOfWork,
    maxLegs: 2,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.equal(
    result.selectedCandidates.some((candidate) => candidate.predictionId === "pred-demo"),
    false,
  );
  assert.deepEqual(
    result.selectedCandidates.map((candidate) => candidate.predictionId),
    ["pred-mictlan", "pred-antigua"],
  );
});

test("publishParlayMvp generates a persisted parlay id that fits the database column", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, [
    "fixture:api-football:1499245",
    "fixture:api-football:1499240",
  ]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      predictionRecord(
        "prediction:fixture:api-football:1499245:moneyline:home:2026-04-19T19:43:33.728Z",
        "fixture:api-football:1499245",
        {
          outcome: "home",
          confidence: 0.676,
          probabilities: { implied: 0.4463, model: 0.4498, edge: 0.0035 },
          fixture: fixture("fixture:api-football:1499245", {
            competition: "Liga Nacional",
            homeTeam: "Mictlán",
            awayTeam: "Xelajú",
            scheduledAt: "2026-04-19T23:00:00.000Z",
          }),
          publishedAt: "2026-04-19T19:43:33.728Z",
          updatedAt: "2026-04-19T19:43:33.728Z",
        },
      ),
      predictionRecord(
        "prediction:fixture:api-football:1499240:moneyline:draw:2026-04-19T19:43:37.639Z",
        "fixture:api-football:1499240",
        {
          outcome: "draw",
          confidence: 0.3422,
          probabilities: { implied: 0.2315, model: 0.2416, edge: 0.0101 },
          fixture: fixture("fixture:api-football:1499240", {
            competition: "Liga Nacional",
            homeTeam: "Antigua GFC",
            awayTeam: "Malacateco",
            scheduledAt: "2026-04-20T01:00:00.000Z",
          }),
          publishedAt: "2026-04-19T19:43:37.639Z",
          updatedAt: "2026-04-19T19:43:37.639Z",
        },
      ),
    ]),
    generatedAt: "2026-04-19T19:44:00.000Z",
    stake: 10,
    unitOfWork,
    maxLegs: 2,
    env: previewEnv,
  });

  assert.equal(result.status, "persisted");
  assert.ok(result.parlay);
  assert.equal(result.parlay!.id.length <= 128, true);
});

test("publishParlayMvp blocks live publication when selected predictions carry demo lineage", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2"]);

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      withLineage(predictionRecord("pred-demo-1", "fx-1"), {
        environment: "test",
        profile: "ci-smoke",
        providerSource: "mock",
        demoMode: true,
        cohort: "demo-ci",
        source: "scoring-worker",
      }),
      withLineage(predictionRecord("pred-demo-2", "fx-2"), {
        environment: "test",
        profile: "ci-smoke",
        providerSource: "mock",
        demoMode: true,
        cohort: "demo-ci",
        source: "scoring-worker",
      }),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    publication: {
      channel: "parlay-store",
      actor: automationActor("automation:publisher"),
    },
    env: {
      GANA_APP_ENV: "production",
      GANA_RUNTIME_PROFILE: "production",
      DATABASE_URL: "mysql://gana:secret@db.example.com:3306/gana_v8",
      GANA_PROVIDER_SOURCE: "live-readonly",
      GANA_DRY_RUN: "0",
      GANA_DEMO_MODE: "0",
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.publicationDecision?.allowed, false);
  assert.equal(result.skipReasons.some((reason) => reason.reason === "publication-blocked"), true);
  assert.equal((await unitOfWork.parlays.list()).length, 0);
});

test("publishParlayMvp respects per-channel publication pauses without touching candidate selection", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2"]);
  const liveLineage = {
    environment: "production",
    profile: "production",
    providerSource: "live-readonly",
    demoMode: false,
    cohort: "live-main",
    source: "scoring-worker",
  } as const;

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      withLineage(predictionRecord("pred-live-1", "fx-1"), liveLineage),
      withLineage(predictionRecord("pred-live-2", "fx-2"), liveLineage),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    publication: {
      channel: "telegram",
      actor: automationActor("automation:publisher"),
      gateConfig: {
        channelStates: {
          telegram: "paused",
        },
      },
    },
    env: {
      GANA_APP_ENV: "production",
      GANA_RUNTIME_PROFILE: "production",
      DATABASE_URL: "mysql://gana:secret@db.example.com:3306/gana_v8",
      GANA_PROVIDER_SOURCE: "live-readonly",
      GANA_DRY_RUN: "0",
      GANA_DEMO_MODE: "0",
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.selectedCandidates.length, 2);
  assert.equal(result.publicationDecision?.reasons.some((reason: { code: string }) => reason.code === "channel-paused"), true);
});

test("publishParlayMvp requires channel capability for sensitive publication targets", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  await seedPublishableResearch(unitOfWork, ["fx-1", "fx-2"]);
  const liveLineage = {
    environment: "production",
    profile: "production",
    providerSource: "live-readonly",
    demoMode: false,
    cohort: "live-main",
    source: "scoring-worker",
  } as const;

  const result = await publishParlayMvp(undefined, {
    client: createClient([
      withLineage(predictionRecord("pred-live-authz-1", "fx-1"), liveLineage),
      withLineage(predictionRecord("pred-live-authz-2", "fx-2"), liveLineage),
    ]),
    generatedAt: "2026-04-16T12:30:00.000Z",
    stake: 10,
    unitOfWork,
    publication: {
      channel: "telegram",
      actor: createAuthorizationActor({ id: "viewer:luis", role: "viewer" }),
    },
    env: {
      GANA_APP_ENV: "production",
      GANA_RUNTIME_PROFILE: "production",
      DATABASE_URL: "mysql://gana:secret@db.example.com:3306/gana_v8",
      GANA_PROVIDER_SOURCE: "live-readonly",
      GANA_DRY_RUN: "0",
      GANA_DEMO_MODE: "0",
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.publicationDecision?.reasons.some((reason: { code: string }) => reason.code === "missing-capability"), true);
});
