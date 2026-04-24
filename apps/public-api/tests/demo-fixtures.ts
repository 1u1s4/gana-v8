import {
  createAiRun,
  createFixture,
  createFixtureWorkflow,
  createParlay,
  createPrediction,
  createTask,
  createTaskRun,
  createValidation,
  type FixtureEntity,
  type FixtureWorkflowEntity,
  type ParlayEntity,
  type PredictionEntity,
  type TaskEntity,
  type TaskRunEntity,
  type ValidationEntity,
} from "@gana-v8/domain-core";

import {
  createOperationSnapshot,
  type AiRunReadModel,
  type CreateOperationSnapshotInput,
  type OperationSnapshot,
  type ProviderStateReadModel,
  type RawIngestionBatchReadModel,
} from "../src/index.js";

export function createDemoFixtures(): readonly FixtureEntity[] {
  return [
    createFixture({
      id: "fx-boca-river",
      sport: "football",
      competition: "Liga Profesional",
      homeTeam: "Boca Juniors",
      awayTeam: "River Plate",
      scheduledAt: "2026-04-16T00:30:00.000Z",
      status: "scheduled",
      metadata: { source: "seed", feed: "demo" },
    }),
    createFixture({
      id: "fx-inter-milan",
      sport: "football",
      competition: "Serie A",
      homeTeam: "Inter",
      awayTeam: "Milan",
      scheduledAt: "2026-04-16T18:45:00.000Z",
      status: "scheduled",
      metadata: { source: "seed", feed: "demo" },
    }),
  ];
}

export function createDemoTasks(): readonly TaskEntity[] {
  return [
    createTask({
      id: "task-demo-fixtures",
      kind: "fixture-ingestion",
      status: "succeeded",
      priority: 100,
      payload: { source: "demo" },
      attempts: [
        {
          startedAt: "2026-04-15T00:00:00.000Z",
          finishedAt: "2026-04-15T00:01:00.000Z",
        },
      ],
      scheduledFor: "2026-04-15T00:00:00.000Z",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:01:00.000Z",
    }),
  ];
}

export function createDemoTaskRuns(
  tasks: readonly TaskEntity[] = createDemoTasks(),
): readonly TaskRunEntity[] {
  return [
    createTaskRun({
      id: "task-demo-fixtures:attempt:1",
      taskId: tasks[0]?.id ?? "task-demo-fixtures",
      attemptNumber: 1,
      status: "succeeded",
      startedAt: "2026-04-15T00:00:00.000Z",
      finishedAt: "2026-04-15T00:01:00.000Z",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:01:00.000Z",
    }),
  ];
}

export function createDemoAiRuns(
  tasks: readonly TaskEntity[] = createDemoTasks(),
): readonly AiRunReadModel[] {
  return [
    createAiRun({
      id: "airun-demo-scoring",
      taskId: tasks[0]?.id ?? "task-demo-fixtures",
      provider: "internal",
      model: "deterministic-moneyline-v1",
      promptVersion: "scoring-worker-mvp-v1",
      providerRequestId: "req-demo-scoring",
      status: "completed",
      usage: {
        promptTokens: 120,
        completionTokens: 48,
        totalTokens: 168,
      },
      outputRef: "memory://demo/airuns/airun-demo-scoring.json",
      createdAt: "2026-04-15T00:10:00.000Z",
      updatedAt: "2026-04-15T00:10:05.000Z",
    }),
  ].map((aiRun) => ({
    id: aiRun.id,
    taskId: aiRun.taskId,
    provider: aiRun.provider,
    model: aiRun.model,
    promptVersion: aiRun.promptVersion,
    latestPromptVersion: aiRun.promptVersion,
    status: aiRun.status,
    ...(aiRun.providerRequestId ? { providerRequestId: aiRun.providerRequestId } : {}),
    ...(aiRun.usage ? { usage: aiRun.usage } : {}),
    ...(aiRun.outputRef ? { outputRef: aiRun.outputRef } : {}),
    ...(aiRun.error ? { error: aiRun.error, fallbackReason: aiRun.error, degraded: true } : {}),
    createdAt: aiRun.createdAt,
    updatedAt: aiRun.updatedAt,
  }));
}

export function createDemoProviderStates(
  aiRuns: readonly AiRunReadModel[] = createDemoAiRuns(),
  rawBatches: readonly RawIngestionBatchReadModel[] = [],
): readonly ProviderStateReadModel[] {
  const latestAiRun = aiRuns[0];
  const latestRawBatch = rawBatches[0];
  const latestQuotaUpdatedAt = latestRawBatch?.extractionTime ?? latestAiRun?.updatedAt;
  const latestError = aiRuns.find((aiRun) => aiRun.error)?.error;

  return [
    {
      provider: latestAiRun?.provider ?? "internal",
      ...(latestAiRun?.model ? { latestModel: latestAiRun.model } : {}),
      ...(latestAiRun?.promptVersion ? { latestPromptVersion: latestAiRun.promptVersion } : {}),
      aiRunCount: aiRuns.length,
      failedAiRunCount: aiRuns.filter((aiRun) => aiRun.status === "failed").length,
      ...(latestAiRun?.updatedAt ? { latestAiRunAt: latestAiRun.updatedAt } : {}),
      ...(latestError ? { latestError } : {}),
      rawBatchCount: rawBatches.length,
      ...(latestRawBatch?.extractionTime ? { latestRawBatchAt: latestRawBatch.extractionTime } : {}),
      ...(latestRawBatch?.extractionStatus
        ? { latestRawBatchStatus: latestRawBatch.extractionStatus }
        : {}),
      quota: {
        limit: 1000,
        used: 320,
        remaining: 680,
        ...(latestQuotaUpdatedAt ? { updatedAt: latestQuotaUpdatedAt } : {}),
      },
    },
  ];
}

export function createDemoPredictions(
  fixtures: readonly FixtureEntity[] = createDemoFixtures(),
  aiRuns: readonly AiRunReadModel[] = createDemoAiRuns(),
): readonly PredictionEntity[] {
  const linkedAiRunId = aiRuns[0]?.id;

  return [
    createPrediction({
      id: "pred-boca-home",
      fixtureId: fixtures[0]?.id ?? "fx-boca-river",
      ...(linkedAiRunId ? { aiRunId: linkedAiRunId } : {}),
      market: "moneyline",
      outcome: "home",
      status: "published",
      confidence: 0.64,
      probabilities: { implied: 0.54, model: 0.64, edge: 0.1 },
      rationale: ["Home pressure profile", "Set-piece edge"],
      publishedAt: "2026-04-15T00:15:00.000Z",
    }),
    createPrediction({
      id: "pred-inter-over",
      fixtureId: fixtures[1]?.id ?? "fx-inter-milan",
      market: "totals",
      outcome: "over",
      status: "published",
      confidence: 0.58,
      probabilities: { implied: 0.5, model: 0.58, edge: 0.08, line: 2.5 },
      rationale: ["High tempo matchup"],
      publishedAt: "2026-04-15T00:20:00.000Z",
    }),
  ];
}

export function createDemoParlays(
  predictions: readonly PredictionEntity[] = createDemoPredictions(),
): readonly ParlayEntity[] {
  return [
    createParlay({
      id: "parlay-core-slate",
      status: "ready",
      stake: 25,
      source: "automatic",
      legs: predictions.map((prediction) => ({
        predictionId: prediction.id,
        fixtureId: prediction.fixtureId,
        market: prediction.market,
        outcome: prediction.outcome,
        price: prediction.market === "moneyline" ? 1.88 : 1.95,
        status: "pending",
      })),
      correlationScore: 0.12,
      expectedPayout: 91.65,
    }),
  ];
}

export function createDemoFixtureWorkflows(
  fixtures: readonly FixtureEntity[] = createDemoFixtures(),
): readonly FixtureWorkflowEntity[] {
  return [
    createFixtureWorkflow({
      fixtureId: fixtures[0]?.id ?? "fx-boca-river",
      ingestionStatus: "succeeded",
      oddsStatus: "succeeded",
      enrichmentStatus: "succeeded",
      candidateStatus: "succeeded",
      predictionStatus: "succeeded",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: true,
      minDetectedOdd: 1.88,
      qualityScore: 0.78,
      selectionScore: 0.66,
      lastIngestedAt: "2026-04-15T00:01:00.000Z",
      lastEnrichedAt: "2026-04-15T00:10:00.000Z",
      lastPredictedAt: "2026-04-15T00:20:00.000Z",
      manualSelectionStatus: "selected",
      manualSelectionBy: "ops-user",
      manualSelectionReason: "Premium slate fixture",
      manuallySelectedAt: "2026-04-15T00:11:00.000Z",
      selectionOverride: "force-include",
      overrideReason: "Pinned by operator",
      overriddenAt: "2026-04-15T00:12:00.000Z",
    }),
  ];
}

export function createDemoValidations(
  parlays: readonly ParlayEntity[] = createDemoParlays(),
  predictions: readonly PredictionEntity[] = createDemoPredictions(),
): readonly ValidationEntity[] {
  return [
    createValidation({
      id: "val-parlay-core",
      targetType: "parlay",
      targetId: parlays[0]?.id ?? "parlay-core-slate",
      kind: "parlay-settlement",
      status: "passed",
      checks: [
        {
          code: "legs-linked",
          message: "All parlay legs reference active predictions",
          passed: true,
        },
      ],
      summary: "Parlay dependencies linked correctly.",
      executedAt: "2026-04-15T00:40:00.000Z",
    }),
    createValidation({
      id: "val-predictions-market-shape",
      targetType: "prediction",
      targetId: predictions[0]?.id ?? "pred-boca-home",
      kind: "prediction-settlement",
      status: "partial",
      checks: [
        {
          code: "market-supported",
          message: "Markets mapped to supported publication schema",
          passed: true,
        },
        {
          code: "freshness-window",
          message: "One prediction is close to refresh threshold",
          passed: false,
        },
      ],
      summary: "Publication schema is valid, but one prediction is nearing freshness threshold.",
      executedAt: "2026-04-15T00:45:00.000Z",
    }),
  ];
}

export function createDemoOperationSnapshot(
  input: CreateOperationSnapshotInput = {},
): OperationSnapshot {
  const generatedAt = input.generatedAt ?? "2026-04-15T01:00:00.000Z";
  const automationCycles = [...(input.automationCycles ?? [])];
  const fixtures = [...(input.fixtures ?? createDemoFixtures())];
  const fixtureResearch = [...(input.fixtureResearch ?? [])];
  const fixtureWorkflows = [...(input.fixtureWorkflows ?? createDemoFixtureWorkflows(fixtures))];
  const leagueCoveragePolicies = [...(input.leagueCoveragePolicies ?? [])];
  const teamCoveragePolicies = [...(input.teamCoveragePolicies ?? [])];
  const dailyAutomationPolicies = [...(input.dailyAutomationPolicies ?? [])];
  const auditEvents = [...(input.auditEvents ?? [])];
  const tasks = [...(input.tasks ?? createDemoTasks())];
  const taskRuns = [...(input.taskRuns ?? createDemoTaskRuns(tasks))];
  const rawBatches = [...(input.rawBatches ?? [])];
  const oddsSnapshots = [...(input.oddsSnapshots ?? [])];
  const aiRuns = [...(input.aiRuns ?? createDemoAiRuns(tasks))];
  const providerStates = [...(input.providerStates ?? createDemoProviderStates(aiRuns, rawBatches))];
  const predictions = [...(input.predictions ?? createDemoPredictions(fixtures, aiRuns))];
  const parlays = [...(input.parlays ?? createDemoParlays(predictions))];
  const validations = [...(input.validations ?? createDemoValidations(parlays, predictions))];

  return createOperationSnapshot({
    generatedAt,
    automationCycles,
    fixtures,
    fixtureResearch,
    fixtureWorkflows,
    leagueCoveragePolicies,
    teamCoveragePolicies,
    dailyAutomationPolicies,
    auditEvents,
    tasks,
    taskRuns,
    aiRuns,
    providerStates,
    rawBatches,
    oddsSnapshots,
    predictions,
    parlays,
    validations,
    ...(input.readiness ? { readiness: input.readiness } : {}),
  });
}
