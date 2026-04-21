import assert from "node:assert/strict";
import test from "node:test";

import {
  createFeatureSnapshot,
  createDailyAutomationPolicy,
  createFixture,
  createFixtureWorkflow,
  createLeagueCoveragePolicy,
  createResearchBundle,
  createTask,
  type AiRunEntity,
  type FixtureEntity,
} from "@gana-v8/domain-core";
import type { AiProviderAdapter } from "@gana-v8/ai-runtime";
import { createInMemoryUnitOfWork } from "@gana-v8/storage-adapters";

import {
  buildResearchDossierFromFixture,
  describeWorkspace,
  loadEligibleFixturesForScoring,
  resolveScoringAiConfig,
  runScoringWorker,
  scoreFixturePrediction,
} from "../src/index.js";

interface FakeSelection {
  readonly selectionKey: string;
  readonly priceDecimal: number;
}

interface FakeOddsSnapshot {
  readonly id: string;
  readonly fixtureId?: string | null;
  readonly providerFixtureId: string;
  readonly marketKey: string;
  readonly bookmakerKey: string;
  readonly capturedAt: Date;
  readonly selections: readonly FakeSelection[];
}

const fixture = (overrides: Partial<FixtureEntity> = {}): FixtureEntity =>
  createFixture({
    id: "fx-1",
    sport: "football",
    competition: "Premier League",
    homeTeam: "Chelsea",
    awayTeam: "Arsenal",
    scheduledAt: "2026-04-15T19:00:00.000Z",
    status: "scheduled",
    metadata: {
      providerFixtureId: "provider-1",
      providerCode: "api-football",
    },
    ...overrides,
  });

const snapshot = (overrides: Partial<FakeOddsSnapshot> = {}): FakeOddsSnapshot => ({
  id: "odds-1",
  fixtureId: "fx-1",
  providerFixtureId: "provider-1",
  marketKey: "h2h",
  bookmakerKey: "bet365",
  capturedAt: new Date("2026-04-15T12:00:00.000Z"),
  selections: [
    { selectionKey: "home", priceDecimal: 1.8 },
    { selectionKey: "draw", priceDecimal: 3.6 },
    { selectionKey: "away", priceDecimal: 4.8 },
  ],
  ...overrides,
});

const createFakeClient = (fixtures: readonly FixtureEntity[], snapshots: readonly FakeOddsSnapshot[]) => ({
  fixture: {
    async findMany({ where }: { where?: { status?: string } } = {}) {
      return fixtures
        .filter((item) => (where?.status ? item.status === where.status : true))
        .map((item) => ({ ...item }));
    },
    async findUnique({ where }: { where: { id: string } }) {
      return fixtures.find((item) => item.id === where.id) ?? null;
    },
  },
  oddsSnapshot: {
    async findFirst({ where }: { where: { marketKey: string; OR: Array<Record<string, unknown>> } }) {
      const matches = snapshots.filter((item) => {
        if (item.marketKey !== where.marketKey) {
          return false;
        }

        return where.OR.some((condition) => {
          if (condition.fixtureId) {
            return item.fixtureId === condition.fixtureId;
          }

          if (condition.providerFixtureId) {
            return item.providerFixtureId === condition.providerFixtureId;
          }

          return false;
        });
      });

      return [...matches].sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0] ?? null;
    },
  },
});

const createCodexAdapter = (options: {
  readonly outputText?: string;
  readonly providerRequestId?: string;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens: number };
  readonly error?: string;
} = {}): AiProviderAdapter => ({
  provider: "codex",
  async run() {
    if (options.error) {
      throw new Error(options.error);
    }

    return {
      provider: "codex",
      backend: "http",
      webSearchMode: "disabled",
      outputText:
        options.outputText ??
        JSON.stringify({
          summary: "Resumen AI: el pick base se sostiene por edge y research lean.",
          advisorySignals: ["confirmar alineaciones", "vigilar drift de odds"],
        }),
      usage: options.usage ?? {
        inputTokens: 120,
        outputTokens: 36,
        totalTokens: 156,
      },
      providerRequestId: options.providerRequestId ?? "req-scoring-1",
    };
  },
  async *stream() {
    if (options.error) {
      throw new Error(options.error);
    }

    yield {
      type: "complete" as const,
      provider: "codex",
      response: await this.run({
        provider: "codex",
        webSearchMode: "disabled",
        input: "",
      }),
    };
    return await this.run({ provider: "codex", webSearchMode: "disabled", input: "" });
  },
  async listModels() {
    return [
      {
        id: "gpt-5.4",
        label: "GPT 5.4",
        provider: "codex",
        defaultReasoningLevel: "low",
        supportedReasoningLevels: ["low", "medium", "high"],
        supportsReasoning: true,
        supportsWebSearch: false,
        availabilitySource: "bundled",
      },
    ];
  },
});

const seedPublishableResearch = async (
  unitOfWork: ReturnType<typeof createInMemoryUnitOfWork>,
  fixtureId: string,
  overrides: {
    readonly generatedAt?: string;
    readonly recommendedLean?: "home" | "away" | "draw";
    readonly readinessStatus?: "ready" | "needs-review";
    readonly topEvidenceTitle?: string;
  } = {},
): Promise<void> => {
  const generatedAt = overrides.generatedAt ?? "2026-04-15T11:55:00.000Z";
  const bundleId = `bundle:${fixtureId}:${generatedAt}`;
  const recommendedLean = overrides.recommendedLean ?? "away";

  await unitOfWork.researchBundles.save(
    createResearchBundle({
      id: bundleId,
      fixtureId,
      generatedAt,
      brief: {
        headline: `Research brief for ${fixtureId}`,
        context: "Test bundle",
        questions: ["Who has the edge?"],
        assumptions: ["Use persisted research only."],
      },
      summary: `Research snapshot leans ${recommendedLean}.`,
      recommendedLean,
      directionalScore: {
        home: recommendedLean === "home" ? 0.81 : 0.18,
        draw: 0.22,
        away: recommendedLean === "away" ? 0.81 : 0.18,
      },
      risks: ["late lineup variance"],
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
      recommendedLean,
      evidenceCount: 1,
      topEvidence: [
        {
          id: `research:${fixtureId}`,
          title: overrides.topEvidenceTitle ?? "Away side returns two starters",
          direction: recommendedLean,
          weightedScore: 0.91,
        },
      ],
      risks: ["late lineup variance"],
      features: {
        researchScoreHome: recommendedLean === "home" ? 0.81 : 0.18,
        researchScoreDraw: 0.22,
        researchScoreAway: recommendedLean === "away" ? 0.81 : 0.18,
        formHome: 0.44,
        formAway: 0.71,
        restHomeDays: 4,
        restAwayDays: 6,
        injuriesHome: 2,
        injuriesAway: 0,
        derby: 0,
        hoursUntilKickoff: 7,
      },
      readiness: {
        status: overrides.readinessStatus ?? "ready",
        reasons: [],
      },
      researchTrace: {
        synthesisMode: "deterministic",
      },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }),
  );
};

test("buildResearchDossierFromFixture derives deterministic implied probabilities and lean", () => {
  const dossier = buildResearchDossierFromFixture(fixture(), snapshot(), {
    generatedAt: "2026-04-15T12:05:00.000Z",
  });

  assert.equal(dossier.fixtureId, "fx-1");
  assert.equal(dossier.generatedAt, "2026-04-15T12:05:00.000Z");
  assert.equal(dossier.recommendedLean, "home");
  assert.equal(dossier.evidence.length, 3);
  assert.match(dossier.summary, /Chelsea vs Arsenal/);
  assert.equal(dossier.directionalScore.home > dossier.directionalScore.away, true);
});

test("buildResearchDossierFromFixture incorporates ready research metadata into the dossier", () => {
  const dossier = buildResearchDossierFromFixture(fixture(), snapshot(), {
    generatedAt: "2026-04-15T12:05:00.000Z",
    persistedResearch: {
      fixtureId: "fx-1",
      status: "publishable",
      publishable: true,
      gateReasons: [],
      latestBundleGeneratedAt: "2026-04-15T11:55:00.000Z",
      latestSnapshotGeneratedAt: "2026-04-15T11:55:00.000Z",
      recommendedLean: "away",
      featureReadinessStatus: "ready",
      featureReadinessReasons: [],
      topEvidenceTitles: ["Away side returns two starters"],
      researchTrace: {
        synthesisMode: "deterministic",
      },
    },
  });

  assert.equal(dossier.recommendedLean, "away");
  assert.match(dossier.summary, /Research snapshot leans away/);
  assert.equal(dossier.evidence.some((item) => item.id === "research:fx-1"), true);
});

test("loadEligibleFixturesForScoring returns latest h2h context and skip reasons", async () => {
  const scheduledFixture = fixture();
  const skippedFixture = fixture({
    id: "fx-2",
    homeTeam: "Inter",
    awayTeam: "Milan",
    metadata: { providerFixtureId: "provider-2", providerCode: "api-football" },
  });
  const client = createFakeClient(
    [scheduledFixture, skippedFixture],
    [
      snapshot({ id: "old", capturedAt: new Date("2026-04-15T10:00:00.000Z") }),
      snapshot({ id: "new", capturedAt: new Date("2026-04-15T12:00:00.000Z") }),
    ],
  );

  const result = await loadEligibleFixturesForScoring(undefined, { client: client as never });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.fixture.id, "fx-1");
  assert.equal(result[0]?.eligible, true);
  assert.equal(result[0]?.latestOddsSnapshot?.id, "new");
  assert.equal(result[1]?.fixture.id, "fx-2");
  assert.equal(result[1]?.eligible, false);
  assert.match(result[1]?.reason ?? "", /No latest h2h odds snapshot/);
});

test("scoreFixturePrediction auto-generates opaque tsk task ids when no task id is provided", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const baseFixture = fixture();

  await unitOfWork.fixtures.save(baseFixture);
  await seedPublishableResearch(unitOfWork, baseFixture.id);

  const result = await scoreFixturePrediction(undefined, baseFixture.id, undefined, {
    client: createFakeClient([baseFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:10:00.000Z",
    unitOfWork,
  });

  const persistedTasks = await unitOfWork.tasks.list();
  const persistedTask = persistedTasks.at(-1);

  assert.equal(result.status, "scored");
  assert.match(persistedTask?.id ?? "", /^tsk_[a-f0-9]{16}$/);
  assert.equal(result.prediction?.fixtureId, baseFixture.id);
});

test("scoreFixturePrediction persists completed AiRun and published prediction for eligible fixtures", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const baseFixture = fixture();
  const task = createTask({
    id: "task-score-1",
    kind: "prediction",
    status: "queued",
    priority: 10,
    payload: { fixtureId: baseFixture.id },
    scheduledFor: "2026-04-15T12:00:00.000Z",
  });

  await unitOfWork.fixtures.save(baseFixture);
  await unitOfWork.tasks.save(task);
  await seedPublishableResearch(unitOfWork, baseFixture.id);

  const result = await scoreFixturePrediction(undefined, baseFixture.id, task.id, {
    client: createFakeClient([baseFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:10:00.000Z",
    unitOfWork,
  });

  const aiRuns = await unitOfWork.aiRuns.list();
  const predictions = await unitOfWork.predictions.list();
  const workflow = await unitOfWork.fixtureWorkflows.findByFixtureId(baseFixture.id);
  const persistedTask = await unitOfWork.tasks.getById(task.id);

  assert.equal(result.status, "scored");
  assert.equal(result.aiRunStatus, "completed");
  assert.equal(aiRuns.length, 1);
  assert.equal(predictions.length, 1);
  assert.equal(workflow?.predictionStatus, "succeeded");
  assert.equal(workflow?.lastPredictedAt, "2026-04-15T12:10:00.000Z");
  assert.equal(workflow?.isCandidate, true);

  assert.equal(aiRuns[0]?.provider, "internal");
  assert.equal(predictions.length, 1);
  assert.equal(predictions[0]?.fixtureId, baseFixture.id);
  assert.equal(predictions[0]?.aiRunId, aiRuns[0]?.id);
  assert.deepEqual(persistedTask?.payload.lineage, {
    environment: "test",
    profile: "ci-smoke",
    providerSource: "mock",
    demoMode: true,
    cohort: "demo:ci-smoke",
    source: "scoring-worker",
  });
});

test("scoreFixturePrediction skips fixtures that are force-excluded by workflow ops", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const baseFixture = fixture();

  await unitOfWork.fixtures.save(baseFixture);
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: baseFixture.id,
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      selectionOverride: "force-exclude",
    }),
  );
  await seedPublishableResearch(unitOfWork, baseFixture.id);

  const result = await scoreFixturePrediction(undefined, baseFixture.id, undefined, {
    client: createFakeClient([baseFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:10:00.000Z",
    unitOfWork,
  });

  assert.equal(result.status, "skipped");
  assert.match(result.reason ?? "", /force-excluded/i);
  assert.equal((await unitOfWork.aiRuns.list()).length, 0);
  assert.equal((await unitOfWork.predictions.list()).length, 0);
});

test("scoreFixturePrediction blocks direct scoring when coverage policy rejects fixture by min allowed odd and records audit trail", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const baseFixture = fixture({
    metadata: {
      providerFixtureId: "provider-1",
      providerCode: "api-football",
      providerLeagueId: "39",
    },
  });

  await unitOfWork.fixtures.save(baseFixture);
  await unitOfWork.fixtureWorkflows.save(
    createFixtureWorkflow({
      fixtureId: baseFixture.id,
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
    }),
  );
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
  await seedPublishableResearch(unitOfWork, baseFixture.id);

  const result = await scoreFixturePrediction(undefined, baseFixture.id, undefined, {
    client: createFakeClient(
      [baseFixture],
      [
        snapshot({
          selections: [
            { selectionKey: "home", priceDecimal: 1.12 },
            { selectionKey: "draw", priceDecimal: 7.1 },
            { selectionKey: "away", priceDecimal: 16.5 },
          ],
        }),
      ],
    ) as never,
    generatedAt: "2026-04-15T12:10:00.000Z",
    unitOfWork,
  });

  const workflow = await unitOfWork.fixtureWorkflows.findByFixtureId(baseFixture.id);
  const auditEvents = await unitOfWork.auditEvents.list();
  const diagnostics = workflow?.diagnostics as
    | { coverageDecision?: { excludedBy?: Array<{ code?: string }> } }
    | undefined;

  assert.equal(result.status, "skipped");
  assert.match(result.reason ?? "", /below allowed threshold/i);
  assert.equal((await unitOfWork.aiRuns.list()).length, 0);
  assert.equal((await unitOfWork.predictions.list()).length, 0);
  assert.equal(workflow?.predictionStatus, "blocked");
  assert.equal(workflow?.minDetectedOdd, 1.12);
  assert.equal(
    diagnostics?.coverageDecision?.excludedBy?.some((reason) => reason.code === "odds-below-min-threshold"),
    true,
  );
  assert.equal(
    auditEvents.some(
      (event) =>
        event.aggregateType === "fixture-workflow" &&
        event.aggregateId === baseFixture.id &&
        event.eventType === "fixture-workflow.coverage-policy.blocked",
    ),
    true,
  );
});

test("scoreFixturePrediction runs an optional AI-assisted synthesis step without changing deterministic outcome", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const baseFixture = fixture();
  const task = createTask({
    id: "task-score-ai",
    kind: "prediction",
    status: "queued",
    priority: 10,
    payload: { fixtureId: baseFixture.id },
    scheduledFor: "2026-04-15T12:00:00.000Z",
  });

  await unitOfWork.fixtures.save(baseFixture);
  await unitOfWork.tasks.save(task);
  await seedPublishableResearch(unitOfWork, baseFixture.id);

  const result = await scoreFixturePrediction(undefined, baseFixture.id, task.id, {
    client: createFakeClient([baseFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:05:00.000Z",
    unitOfWork,
    ai: {
      enabled: true,
      codexAdapter: createCodexAdapter(),
    },
  });

  const aiRuns = await unitOfWork.aiRuns.list();
  const prediction = (await unitOfWork.predictions.list())[0];

  assert.equal(result.status, "scored");
  assert.equal(result.prediction?.outcome, "away");
  assert.equal(result.aiRunStatus, "completed");
  assert.equal(aiRuns[0]?.provider, "codex");
  assert.equal(aiRuns[0]?.providerRequestId, "req-scoring-1");
  assert.equal(aiRuns[0]?.promptVersion, "v8-slice-3");
  assert.equal(aiRuns[0]?.usage?.totalTokens, 156);
  assert.match(prediction?.rationale.join("\n") ?? "", /AI advisory:/);
  assert.match(prediction?.rationale.join("\n") ?? "", /confirmar alineaciones/);
});

test("scoreFixturePrediction falls back to deterministic scoring when AI synthesis fails", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const baseFixture = fixture();
  const task = createTask({
    id: "task-score-ai-fallback",
    kind: "prediction",
    status: "queued",
    priority: 10,
    payload: { fixtureId: baseFixture.id },
    scheduledFor: "2026-04-15T12:00:00.000Z",
  });

  await unitOfWork.fixtures.save(baseFixture);
  await unitOfWork.tasks.save(task);
  await seedPublishableResearch(unitOfWork, baseFixture.id);

  const result = await scoreFixturePrediction(undefined, baseFixture.id, task.id, {
    client: createFakeClient([baseFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:05:00.000Z",
    unitOfWork,
    ai: {
      enabled: true,
      codexAdapter: createCodexAdapter({ error: "provider timeout" }),
    },
  });

  const aiRun = (await unitOfWork.aiRuns.list())[0] as AiRunEntity;
  const prediction = (await unitOfWork.predictions.list())[0];

  assert.equal(result.status, "scored");
  assert.equal(result.prediction?.outcome, "away");
  assert.equal(result.aiRunStatus, "failed");
  assert.equal(aiRun.status, "failed");
  assert.match(aiRun.error ?? "", /fallback to deterministic baseline/i);
  assert.match(aiRun.outputRef ?? "", /deterministic-fallback/);
  assert.doesNotMatch(prediction?.rationale.join("\n") ?? "", /AI advisory:/);
});

test("runScoringWorker reports skips without breaking the batch", async () => {
  const unitOfWork = createInMemoryUnitOfWork();
  const eligibleFixture = fixture();
  const skippedFixture = fixture({
    id: "fx-2",
    homeTeam: "Roma",
    awayTeam: "Lazio",
    metadata: { providerFixtureId: "provider-2", providerCode: "api-football" },
  });

  await unitOfWork.fixtures.save(eligibleFixture);
  await unitOfWork.fixtures.save(skippedFixture);
  await seedPublishableResearch(unitOfWork, eligibleFixture.id);
  await seedPublishableResearch(unitOfWork, skippedFixture.id);

  const summary = await runScoringWorker(undefined, {
    client: createFakeClient([eligibleFixture, skippedFixture], [snapshot()]) as never,
    generatedAt: "2026-04-15T12:05:00.000Z",
    unitOfWork,
  });

  assert.match(describeWorkspace(), /scoring-worker/);
  assert.deepEqual(resolveScoringAiConfig({ GANA_ENABLE_SCORING_AI: "1" }).enabled, true);
  assert.equal(summary.totalFixtures, 2);
  assert.equal(summary.scoredCount, 1);
  assert.equal(summary.skippedCount, 1);
  assert.match(summary.results.find((item) => item.fixtureId === "fx-2")?.reason ?? "", /No latest h2h odds snapshot/);
});
