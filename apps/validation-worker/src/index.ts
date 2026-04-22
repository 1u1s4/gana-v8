import {
  createFixtureWorkflow,
  createValidation,
  finalizeValidation,
  transitionFixtureWorkflowStage,
  type FixtureEntity,
  type FixtureWorkflowEntity,
  type ISODateString,
  type ParlayEntity,
  type PredictionEntity,
  type PredictionOutcome,
  type ValidationCheck,
  type ValidationEntity,
} from "@gana-v8/domain-core";
import { settleParlayTicket, type AtomicLegSettlement } from "@gana-v8/parlay-engine";
import {
  connectPrismaClientWithRetry,
  createPrismaClient,
  createPrismaUnitOfWork,
  createVerifiedPrismaClient,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";
import { settleAtomicTicket } from "@gana-v8/validation-engine";

export const workspaceInfo = {
  packageName: "@gana-v8/validation-worker",
  workspaceName: "validation-worker",
  category: "app",
  description: "Settles outcomes, calibration jobs, and retrospective validation workflows.",
  dependencies: [
    { name: "@gana-v8/audit-lineage", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/parlay-engine", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" },
    { name: "@gana-v8/validation-engine", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface ValidationWorkerOptions {
  readonly executedAt?: ISODateString;
  readonly unitOfWork?: StorageUnitOfWork;
}

export interface PredictionValidationResult {
  readonly predictionId: string;
  readonly fixtureId: string;
  readonly status: "settled" | "skipped";
  readonly verdict?: "won" | "lost" | "voided";
  readonly validationId?: string;
  readonly reason?: string;
}

export interface ParlayValidationResult {
  readonly parlayId: string;
  readonly status: "settled" | "pending" | "skipped";
  readonly verdict?: "won" | "lost" | "voided";
  readonly validationId?: string;
  readonly reason?: string;
}

export interface ValidationWorkerRunResult {
  readonly executedAt: ISODateString;
  readonly settledPredictionCount: number;
  readonly skippedPredictionCount: number;
  readonly settledParlayCount: number;
  readonly pendingParlayCount: number;
  readonly predictionResults: readonly PredictionValidationResult[];
  readonly parlayResults: readonly ParlayValidationResult[];
}

const createManagedRuntime = (
  databaseUrl?: string,
  options: ValidationWorkerOptions = {},
): { client?: ReturnType<typeof createPrismaClient> | undefined; unitOfWork: StorageUnitOfWork; disconnect: () => Promise<void> } => {
  if (options.unitOfWork) {
    return {
      unitOfWork: options.unitOfWork,
      disconnect: async () => {},
    };
  }

  const client = createVerifiedPrismaClient({ databaseUrl });
  return {
    client,
    unitOfWork: createPrismaUnitOfWork(client),
    disconnect: async () => {
      await client.$disconnect();
    },
  };
};

const createPredictionValidationId = (predictionId: string): string =>
  `validation:prediction-settlement:${predictionId}`;

const createParlayValidationId = (parlayId: string): string =>
  `validation:parlay-settlement:${parlayId}`;

const persistValidationWorkflow = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
  executedAt: ISODateString,
): Promise<FixtureWorkflowEntity> => {
  const current =
    (await unitOfWork.fixtureWorkflows.findByFixtureId(fixtureId)) ??
    createFixtureWorkflow({
      fixtureId,
      ingestionStatus: "pending",
      oddsStatus: "pending",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
    });

  return unitOfWork.fixtureWorkflows.save(
    transitionFixtureWorkflowStage(current, "validation", {
      status: "succeeded",
      occurredAt: executedAt,
    }),
  );
};

const toSettlementPrice = (prediction: PredictionEntity): number => {
  const implied = prediction.probabilities.implied;
  if (Number.isFinite(implied) && implied > 0) {
    return Math.max(1.000001, Number((1 / implied).toFixed(6)));
  }

  return 1.000001;
};

export const deriveMoneylineOutcomeFromFixture = (
  fixture: FixtureEntity,
): PredictionOutcome | null => {
  if (fixture.status !== "completed") {
    return null;
  }

  if (fixture.score === undefined) {
    return null;
  }

  if (fixture.score.home > fixture.score.away) {
    return "home";
  }

  if (fixture.score.home < fixture.score.away) {
    return "away";
  }

  return "draw";
};

const validationStatusFromVerdict = (
  verdict: "won" | "lost" | "voided",
): Exclude<ValidationEntity["status"], "pending"> => {
  if (verdict === "won") {
    return "passed";
  }

  if (verdict === "lost") {
    return "failed";
  }

  return "partial";
};

const createSettlementValidation = (input: {
  readonly id: string;
  readonly targetType: ValidationEntity["targetType"];
  readonly targetId: string;
  readonly kind: ValidationEntity["kind"];
  readonly verdict: "won" | "lost" | "voided";
  readonly summary: string;
  readonly checks: readonly ValidationCheck[];
  readonly executedAt: ISODateString;
}): ValidationEntity =>
  finalizeValidation(
    createValidation({
      id: input.id,
      targetType: input.targetType,
      targetId: input.targetId,
      kind: input.kind,
      status: "pending",
      checks: [],
      summary: "",
      createdAt: input.executedAt,
      updatedAt: input.executedAt,
    }),
    validationStatusFromVerdict(input.verdict),
    input.checks,
    input.summary,
    input.executedAt,
  );

const derivePredictionVerdict = (
  prediction: PredictionEntity,
  fixtureById: ReadonlyMap<string, FixtureEntity>,
): AtomicLegSettlement["status"] | null => {
  if (prediction.status === "voided") {
    return "voided";
  }

  if (prediction.market !== "moneyline") {
    return null;
  }

  const fixture = fixtureById.get(prediction.fixtureId);
  if (!fixture) {
    return null;
  }

  const winningOutcome = deriveMoneylineOutcomeFromFixture(fixture);
  if (!winningOutcome) {
    return null;
  }

  return prediction.outcome === winningOutcome ? "won" : "lost";
};

const settlePredictionValidation = async (
  unitOfWork: StorageUnitOfWork,
  fixtureById: ReadonlyMap<string, FixtureEntity>,
  prediction: PredictionEntity,
  executedAt: ISODateString,
): Promise<PredictionValidationResult> => {
  if (prediction.market !== "moneyline") {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: `Only moneyline predictions are supported, received ${prediction.market}.`,
    };
  }

  const fixture = fixtureById.get(prediction.fixtureId);
  if (!fixture) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: "Fixture not found for prediction settlement.",
    };
  }

  if (fixture.status !== "completed") {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: `Fixture status ${fixture.status} is not eligible for settlement.`,
    };
  }

  const winningOutcome = deriveMoneylineOutcomeFromFixture(fixture);
  if (!winningOutcome) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: "Fixture is completed but score coverage is missing.",
    };
  }

  const score = fixture.score;
  if (score === undefined) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: "Fixture is completed but score coverage is missing.",
    };
  }

  const settledTicket = settleAtomicTicket(
    {
      prediction,
      price: toSettlementPrice(prediction),
    },
    {
      fixtureId: prediction.fixtureId,
      market: prediction.market,
      winningOutcomes: [winningOutcome],
    },
    executedAt,
  );

  await unitOfWork.predictions.save(settledTicket.prediction);

  const validation = createSettlementValidation({
    id: createPredictionValidationId(prediction.id),
    targetType: "prediction",
    targetId: prediction.id,
    kind: "prediction-settlement",
    verdict: settledTicket.verdict,
    summary: `Prediction ${prediction.id} settled ${settledTicket.verdict} from ${fixture.homeTeam} ${score.home}-${score.away} ${fixture.awayTeam}.`,
    checks: [
      {
        code: "FIXTURE_COMPLETED",
        message: `Fixture ${fixture.id} is completed.`,
        passed: true,
      },
      {
        code: "SCORE_AVAILABLE",
        message: `Fixture score ${score.home}-${score.away} was available.`,
        passed: true,
      },
      {
        code: "MONEYLINE_OUTCOME",
        message: `Winning outcome resolved to ${winningOutcome}.`,
        passed: true,
      },
      {
        code: "PREDICTION_VERDICT",
        message: `Prediction verdict was ${settledTicket.verdict}.`,
        passed: settledTicket.verdict === "won",
      },
    ],
    executedAt,
  });

  await unitOfWork.validations.save(validation);
  await persistValidationWorkflow(unitOfWork, prediction.fixtureId, executedAt);

  return {
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    status: "settled",
    verdict: settledTicket.verdict,
    validationId: validation.id,
  };
};

const settleParlayValidation = async (
  unitOfWork: StorageUnitOfWork,
  fixtureById: ReadonlyMap<string, FixtureEntity>,
  parlay: ParlayEntity,
  executedAt: ISODateString,
): Promise<ParlayValidationResult> => {
  if (parlay.status === "settled" || parlay.status === "voided") {
    return {
      parlayId: parlay.id,
      status: "skipped",
      reason: `Parlay already ${parlay.status}.`,
    };
  }

  const predictions = await Promise.all(
    parlay.legs.map((leg) => unitOfWork.predictions.getById(leg.predictionId)),
  );

  const settlements: AtomicLegSettlement[] = predictions.flatMap((prediction) => {
    if (!prediction) {
      return [];
    }

    const verdict = derivePredictionVerdict(prediction, fixtureById);
    return verdict ? [{ predictionId: prediction.id, status: verdict }] : [];
  });

  const settledParlay = settleParlayTicket(parlay, settlements, executedAt);
  if (!settledParlay.finalized) {
    return {
      parlayId: parlay.id,
      status: "pending",
      reason: "Parlay still has unsettled legs.",
    };
  }

  const verdict =
    settledParlay.verdict === "pending" ? "voided" : settledParlay.verdict;

  await unitOfWork.parlays.save(settledParlay.parlay);

  const validation = createSettlementValidation({
    id: createParlayValidationId(parlay.id),
    targetType: "parlay",
    targetId: parlay.id,
    kind: "parlay-settlement",
    verdict,
    summary: `Parlay ${parlay.id} settled ${verdict} with ${settledParlay.gradedLegCount}/${parlay.legs.length} graded legs.`,
    checks: [
      {
        code: "PARLAY_LEG_COVERAGE",
        message: `Resolved ${settledParlay.gradedLegCount} of ${parlay.legs.length} legs.`,
        passed: settledParlay.gradedLegCount === parlay.legs.length,
      },
      {
        code: "PARLAY_VERDICT",
        message: `Parlay verdict was ${verdict}.`,
        passed: verdict === "won",
      },
    ],
    executedAt,
  });

  await unitOfWork.validations.save(validation);
  await Promise.all(
    [...new Set(parlay.legs.map((leg) => leg.fixtureId))].map((fixtureId) =>
      persistValidationWorkflow(unitOfWork, fixtureId, executedAt),
    ),
  );

  return {
    parlayId: parlay.id,
    status: "settled",
    verdict,
    validationId: validation.id,
  };
};

export const runValidationWorker = async (
  databaseUrl?: string,
  options: ValidationWorkerOptions = {},
): Promise<ValidationWorkerRunResult> => {
  const runtime = createManagedRuntime(databaseUrl, options);
  const executedAt = options.executedAt ?? new Date().toISOString();

  try {
    if (runtime.client) {
      await connectPrismaClientWithRetry(runtime.client);
    }

    const fixtures = await runtime.unitOfWork.fixtures.list();
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture] as const));
    const predictions = await runtime.unitOfWork.predictions.list();
    const predictionResults: PredictionValidationResult[] = [];

    for (const prediction of predictions) {
      if (prediction.status !== "published") {
        continue;
      }

      predictionResults.push(
        await settlePredictionValidation(
          runtime.unitOfWork,
          fixtureById,
          prediction,
          executedAt,
        ),
      );
    }

    const parlays = await runtime.unitOfWork.parlays.list();
    const parlayResults: ParlayValidationResult[] = [];

    for (const parlay of parlays) {
      parlayResults.push(
        await settleParlayValidation(runtime.unitOfWork, fixtureById, parlay, executedAt),
      );
    }

    return {
      executedAt,
      settledPredictionCount: predictionResults.filter((result) => result.status === "settled").length,
      skippedPredictionCount: predictionResults.filter((result) => result.status === "skipped").length,
      settledParlayCount: parlayResults.filter((result) => result.status === "settled").length,
      pendingParlayCount: parlayResults.filter((result) => result.status === "pending").length,
      predictionResults,
      parlayResults,
    };
  } finally {
    await runtime.disconnect();
  }
};
