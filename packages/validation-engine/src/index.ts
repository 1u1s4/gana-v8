import {
  createValidation,
  finalizeValidation,
  settlePrediction,
  type ISODateString,
  type PredictionEntity,
  type PredictionMarket,
  type PredictionOutcome,
  type ValidationCheck,
  type ValidationEntity,
} from "@gana-v8/domain-core";
import { settleParlayTicket, type AtomicLegSettlement, type SettledParlayTicket } from "@gana-v8/parlay-engine";
import type { ParlayEntity } from "@gana-v8/domain-core";

export const workspaceInfo = {
  packageName: "@gana-v8/validation-engine",
  workspaceName: "validation-engine",
  category: "package",
  description: "Outcome settlement, scorecards, retrospective validation, and lightweight replay primitives.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/parlay-engine", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" },
    { name: "@gana-v8/audit-lineage", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface MarketOutcome {
  readonly fixtureId: string;
  readonly market: PredictionMarket;
  readonly winningOutcomes: readonly PredictionOutcome[];
  readonly voided?: boolean;
}

export interface AtomicTicket {
  readonly prediction: PredictionEntity;
  readonly price: number;
  readonly stake?: number;
}

export interface SettledAtomicTicket {
  readonly prediction: PredictionEntity;
  readonly verdict: "won" | "lost" | "voided";
  readonly graded: boolean;
  readonly correct: boolean;
  readonly stake: number;
  readonly actualPayout: number;
  readonly profit: number;
  readonly calibrationError: number;
  readonly brierScore: number;
  readonly logLoss: number;
}

export interface ValidationScorecard {
  readonly totalAtomics: number;
  readonly gradedAtomics: number;
  readonly atomicWins: number;
  readonly atomicLosses: number;
  readonly atomicVoids: number;
  readonly atomicHitRate: number;
  readonly totalParlays: number;
  readonly gradedParlays: number;
  readonly parlayWins: number;
  readonly parlayLosses: number;
  readonly parlayVoids: number;
  readonly parlayHitRate: number;
  readonly totalStake: number;
  readonly totalProfit: number;
  readonly roi: number;
  readonly averageCalibrationError: number;
  readonly averageBrierScore: number;
  readonly averageLogLoss: number;
}

export interface ValidationReplayRequest {
  readonly id: string;
  readonly atomics: readonly AtomicTicket[];
  readonly parlays: readonly ParlayEntity[];
  readonly outcomes: readonly MarketOutcome[];
  readonly executedAt?: ISODateString;
}

export interface ValidationReplayResult {
  readonly validation: ValidationEntity;
  readonly atomics: readonly SettledAtomicTicket[];
  readonly parlays: readonly SettledParlayTicket[];
  readonly scorecard: ValidationScorecard;
}

const clampProbability = (value: number): number => Math.min(0.999999, Math.max(0.000001, value));

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const outcomeKey = (fixtureId: string, market: PredictionMarket): string => `${fixtureId}:${market}`;

export const settleAtomicTicket = (
  ticket: AtomicTicket,
  outcome: MarketOutcome,
  settledAt?: ISODateString,
): SettledAtomicTicket => {
  const stake = ticket.stake ?? 1;
  const prediction = ticket.prediction;
  const impliedProbability = clampProbability(prediction.probabilities.model);

  if (outcome.voided) {
    return {
      prediction: settlePrediction(prediction, "voided", settledAt),
      verdict: "voided",
      graded: false,
      correct: false,
      stake,
      actualPayout: stake,
      profit: 0,
      calibrationError: 0,
      brierScore: 0,
      logLoss: 0,
    };
  }

  const correct = outcome.winningOutcomes.includes(prediction.outcome);
  const settledPrediction = settlePrediction(prediction, "settled", settledAt);
  const actualPayout = correct ? stake * ticket.price : 0;
  const profit = actualPayout - stake;
  const observed = correct ? 1 : 0;
  const calibrationError = Math.abs(impliedProbability - observed);
  const brierScore = (impliedProbability - observed) ** 2;
  const logLoss = -(observed * Math.log(impliedProbability) + (1 - observed) * Math.log(1 - impliedProbability));

  return {
    prediction: settledPrediction,
    verdict: correct ? "won" : "lost",
    graded: true,
    correct,
    stake,
    actualPayout,
    profit,
    calibrationError,
    brierScore,
    logLoss,
  };
};

export const buildValidationScorecard = (
  atomics: readonly SettledAtomicTicket[],
  parlays: readonly SettledParlayTicket[],
): ValidationScorecard => {
  const gradedAtomics = atomics.filter((atomic) => atomic.graded);
  const atomicWins = gradedAtomics.filter((atomic) => atomic.verdict === "won").length;
  const atomicLosses = gradedAtomics.filter((atomic) => atomic.verdict === "lost").length;
  const atomicVoids = atomics.filter((atomic) => atomic.verdict === "voided").length;

  const gradedParlays = parlays.filter((parlay) => parlay.finalized);
  const parlayWins = gradedParlays.filter((parlay) => parlay.verdict === "won").length;
  const parlayLosses = gradedParlays.filter((parlay) => parlay.verdict === "lost").length;
  const parlayVoids = gradedParlays.filter((parlay) => parlay.verdict === "voided").length;

  const totalStake = atomics.reduce((sum, atomic) => sum + atomic.stake, 0) + parlays.reduce((sum, parlay) => sum + parlay.parlay.stake, 0);
  const totalProfit = atomics.reduce((sum, atomic) => sum + atomic.profit, 0) + parlays.reduce((sum, parlay) => sum + parlay.profit, 0);

  return {
    totalAtomics: atomics.length,
    gradedAtomics: gradedAtomics.length,
    atomicWins,
    atomicLosses,
    atomicVoids,
    atomicHitRate: gradedAtomics.length === 0 ? 0 : atomicWins / gradedAtomics.length,
    totalParlays: parlays.length,
    gradedParlays: gradedParlays.length,
    parlayWins,
    parlayLosses,
    parlayVoids,
    parlayHitRate: gradedParlays.length === 0 ? 0 : parlayWins / gradedParlays.length,
    totalStake,
    totalProfit,
    roi: totalStake === 0 ? 0 : totalProfit / totalStake,
    averageCalibrationError: average(gradedAtomics.map((atomic) => atomic.calibrationError)),
    averageBrierScore: average(gradedAtomics.map((atomic) => atomic.brierScore)),
    averageLogLoss: average(gradedAtomics.map((atomic) => atomic.logLoss)),
  };
};

export const replayValidationRun = (request: ValidationReplayRequest): ValidationReplayResult => {
  const outcomeIndex = new Map(request.outcomes.map((outcome) => [outcomeKey(outcome.fixtureId, outcome.market), outcome] as const));
  const missingCoverage: string[] = [];

  const atomics = request.atomics.map((ticket) => {
    const outcome = outcomeIndex.get(outcomeKey(ticket.prediction.fixtureId, ticket.prediction.market));
    if (outcome === undefined) {
      missingCoverage.push(`${ticket.prediction.fixtureId}:${ticket.prediction.market}`);
      return {
        prediction: ticket.prediction,
        verdict: "voided",
        graded: false,
        correct: false,
        stake: ticket.stake ?? 1,
        actualPayout: ticket.stake ?? 1,
        profit: 0,
        calibrationError: 0,
        brierScore: 0,
        logLoss: 0,
      } satisfies SettledAtomicTicket;
    }

    return settleAtomicTicket(ticket, outcome, request.executedAt);
  });

  const atomicSettlementByPrediction = new Map<string, AtomicLegSettlement>(
    atomics
      .filter((atomic) => atomic.prediction.status === "settled" || atomic.prediction.status === "voided")
      .map((atomic) => [
        atomic.prediction.id,
        {
          predictionId: atomic.prediction.id,
          status: atomic.verdict,
        },
      ] as const),
  );

  const parlays = request.parlays.map((parlay) =>
    settleParlayTicket(
      parlay,
      parlay.legs
        .map((leg) => atomicSettlementByPrediction.get(leg.predictionId))
        .filter((settlement): settlement is AtomicLegSettlement => settlement !== undefined),
      request.executedAt,
    ),
  );

  const scorecard = buildValidationScorecard(atomics, parlays);
  const checks: ValidationCheck[] = [
    {
      code: "OUTCOME_COVERAGE",
      message:
        missingCoverage.length === 0
          ? "All atomic tickets had a market outcome"
          : `Missing outcomes for ${missingCoverage.length} atomic tickets`,
      passed: missingCoverage.length === 0,
    },
    {
      code: "ATOMIC_SAMPLE",
      message: `Graded ${scorecard.gradedAtomics} atomic predictions`,
      passed: scorecard.gradedAtomics > 0,
    },
    {
      code: "PARLAY_FINALIZATION",
      message: `Finalized ${scorecard.gradedParlays} parlays`,
      passed: scorecard.gradedParlays === request.parlays.length,
    },
  ];

  const passedCount = checks.filter((check) => check.passed).length;
  const status =
    passedCount === checks.length
      ? "passed"
      : passedCount === 0
        ? "failed"
        : "partial";

  const summary = [
    `${scorecard.gradedAtomics}/${scorecard.totalAtomics} atomics graded`,
    `${scorecard.gradedParlays}/${scorecard.totalParlays} parlays finalized`,
    `ROI ${scorecard.roi.toFixed(3)}`,
  ].join(" | ");

  const validation = finalizeValidation(
    createValidation({
      id: request.id,
      targetType: "sandbox-namespace",
      targetId: request.id,
      kind: "sandbox-regression",
      status: "pending",
      checks: [],
      summary: "",
      ...(request.executedAt !== undefined ? { createdAt: request.executedAt } : {}),
    }),
    status,
    checks,
    summary,
    request.executedAt,
  );

  return {
    validation,
    atomics,
    parlays,
    scorecard,
  };
};
