import {
  createParlay,
  settleParlay,
  type ParlayEntity,
  type ParlayLeg,
  type ParlayLegStatus,
  type PredictionMarket,
  type PredictionOutcome,
  DomainError,
  type ISODateString,
} from "@gana-v8/domain-core";

export const workspaceInfo = {
  packageName: "@gana-v8/parlay-engine",
  workspaceName: "parlay-engine",
  category: "package",
  description: "Parlay composition, ranking, risk scoring, and lightweight settlement primitives.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface AtomicCandidate {
  readonly predictionId: string;
  readonly fixtureId: string;
  readonly market: PredictionMarket;
  readonly outcome: PredictionOutcome;
  readonly price: number;
  readonly confidence: number;
  readonly modelProbability: number;
  readonly impliedProbability?: number;
  readonly edge?: number;
  readonly competition?: string;
  readonly teamKeys?: readonly string[];
  readonly tags?: readonly string[];
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface CandidateRank {
  readonly candidate: AtomicCandidate;
  readonly score: number;
  readonly edge: number;
  readonly impliedProbability: number;
}

export interface CandidateRejection {
  readonly candidate: AtomicCandidate;
  readonly reason:
    | "duplicate-prediction"
    | "duplicate-selection"
    | "leg-limit"
    | "invalid-candidate";
}

export interface ParlayPolicy {
  readonly minLegs?: number;
  readonly maxLegs?: number;
  readonly maxCorrelationScore?: number;
}

export interface ParlayScorecard {
  readonly legCount: number;
  readonly averageLegScore: number;
  readonly combinedProbability: number;
  readonly combinedPrice: number;
  readonly expectedValuePerUnit: number;
  readonly parlayScore: number;
  readonly riskScore: number;
  readonly correlationScore: number;
  readonly ready: boolean;
  readonly reasons: readonly string[];
}

export interface BuildParlayInput extends ParlayPolicy {
  readonly id: string;
  readonly stake: number;
  readonly source: ParlayEntity["source"];
  readonly candidates: readonly AtomicCandidate[];
  readonly createdAt?: ISODateString;
}

export interface BuildParlayResult {
  readonly parlay: ParlayEntity;
  readonly rankedCandidates: readonly CandidateRank[];
  readonly selectedCandidates: readonly AtomicCandidate[];
  readonly rejectedCandidates: readonly CandidateRejection[];
  readonly scorecard: ParlayScorecard;
}

export type AtomicLegVerdict = Exclude<ParlayLegStatus, "pending">;

export interface AtomicLegSettlement {
  readonly predictionId: string;
  readonly status: AtomicLegVerdict;
}

export interface SettledLeg {
  readonly predictionId: string;
  readonly fixtureId: string;
  readonly market: string;
  readonly outcome: string;
  readonly price: number;
  readonly status: ParlayLegStatus;
  readonly settlementStatus: ParlayLegStatus;
}

export interface SettledParlayTicket {
  readonly parlay: ParlayEntity;
  readonly legs: readonly SettledLeg[];
  readonly finalized: boolean;
  readonly verdict: "pending" | "won" | "lost" | "voided";
  readonly actualPayout: number;
  readonly profit: number;
  readonly gradedLegCount: number;
}

const DEFAULT_POLICY: Required<ParlayPolicy> = {
  minLegs: 2,
  maxLegs: 4,
  maxCorrelationScore: 0.55,
};

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toImpliedProbability = (candidate: AtomicCandidate): number => {
  if (candidate.impliedProbability !== undefined) {
    return clamp(candidate.impliedProbability);
  }

  return clamp(1 / candidate.price);
};

const toEdge = (candidate: AtomicCandidate): number =>
  candidate.edge ?? candidate.modelProbability - toImpliedProbability(candidate);

const toCandidateScore = (candidate: AtomicCandidate): number => {
  const normalizedEdge = clamp((toEdge(candidate) + 0.2) / 0.4);
  return clamp(
    candidate.confidence * 0.45 + candidate.modelProbability * 0.35 + normalizedEdge * 0.2,
  );
};

const overlapSize = (left: readonly string[] = [], right: readonly string[] = []): number => {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
};

export const scoreAtomicCandidate = (candidate: AtomicCandidate): CandidateRank => {
  validateAtomicCandidate(candidate);
  return {
    candidate,
    score: toCandidateScore(candidate),
    edge: toEdge(candidate),
    impliedProbability: toImpliedProbability(candidate),
  };
};

export const calculateCorrelation = (
  left: AtomicCandidate,
  right: AtomicCandidate,
): number => {
  let correlation = 0;

  if (left.fixtureId === right.fixtureId) {
    correlation += 0.55;
  }

  if (left.competition !== undefined && left.competition === right.competition) {
    correlation += 0.15;
  }

  if (left.market === right.market) {
    correlation += 0.1;
  }

  if (overlapSize(left.teamKeys, right.teamKeys) > 0) {
    correlation += 0.15;
  }

  if (overlapSize(left.tags, right.tags) > 0) {
    correlation += 0.05;
  }

  return clamp(correlation);
};

export const calculateParlayCorrelation = (
  candidates: readonly AtomicCandidate[],
): number => {
  const pairScores: number[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index];
    if (current === undefined) {
      continue;
    }

    for (let inner = index + 1; inner < candidates.length; inner += 1) {
      const next = candidates[inner];
      if (next === undefined) {
        continue;
      }
      pairScores.push(calculateCorrelation(current, next));
    }
  }

  return average(pairScores);
};

export const calculateParlayRisk = (
  candidates: readonly AtomicCandidate[],
  correlationScore = calculateParlayCorrelation(candidates),
): number => {
  const combinedProbability = candidates.reduce(
    (product, candidate) => product * clamp(candidate.modelProbability),
    1,
  );

  return clamp((1 - combinedProbability) * 0.55 + correlationScore * 0.3 + candidates.length / 12);
};

export const buildParlayFromCandidates = (input: BuildParlayInput): BuildParlayResult => {
  const policy = { ...DEFAULT_POLICY, ...input };
  const rankedCandidates = [...input.candidates].map(scoreAtomicCandidate).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return right.edge - left.edge;
  });

  const selectedCandidates: AtomicCandidate[] = [];
  const rejectedCandidates: CandidateRejection[] = [];
  const predictionIds = new Set<string>();
  const selectionKeys = new Set<string>();

  for (const ranked of rankedCandidates) {
    const candidate = ranked.candidate;
    if (selectedCandidates.length >= policy.maxLegs) {
      rejectedCandidates.push({ candidate, reason: "leg-limit" });
      continue;
    }

    if (predictionIds.has(candidate.predictionId)) {
      rejectedCandidates.push({ candidate, reason: "duplicate-prediction" });
      continue;
    }

    const selectionKey = `${candidate.fixtureId}:${candidate.market}:${candidate.outcome}`;
    if (selectionKeys.has(selectionKey)) {
      rejectedCandidates.push({ candidate, reason: "duplicate-selection" });
      continue;
    }

    selectedCandidates.push(candidate);
    predictionIds.add(candidate.predictionId);
    selectionKeys.add(selectionKey);
  }

  if (selectedCandidates.length === 0) {
    throw new DomainError("Unable to build parlay without valid atomic candidates", "PARLAY_NO_VALID_CANDIDATES");
  }

  const legScores = selectedCandidates.map(toCandidateScore);
  const averageLegScore = average(legScores);
  const combinedProbability = selectedCandidates.reduce(
    (product, candidate) => product * clamp(candidate.modelProbability),
    1,
  );
  const combinedPrice = selectedCandidates.reduce((product, candidate) => product * candidate.price, 1);
  const correlationScore = calculateParlayCorrelation(selectedCandidates);
  const riskScore = calculateParlayRisk(selectedCandidates, correlationScore);
  const expectedValuePerUnit = combinedProbability * combinedPrice - 1;

  const reasons: string[] = [];
  if (selectedCandidates.length < policy.minLegs) {
    reasons.push(`requires at least ${policy.minLegs} legs`);
  }
  if (correlationScore > policy.maxCorrelationScore) {
    reasons.push(`correlation ${correlationScore.toFixed(2)} exceeds ${policy.maxCorrelationScore.toFixed(2)}`);
  }

  const ready = reasons.length === 0;
  const parlayScore = clamp(averageLegScore * 0.55 + combinedProbability * 0.2 + (1 - riskScore) * 0.25);
  const legs: ParlayLeg[] = selectedCandidates.map((candidate) => ({
    predictionId: candidate.predictionId,
    fixtureId: candidate.fixtureId,
    market: candidate.market,
    outcome: candidate.outcome,
    price: candidate.price,
    status: "pending",
  }));

  return {
    parlay: createParlay({
      id: input.id,
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
      status: ready ? "ready" : "draft",
      stake: input.stake,
      source: input.source,
      legs,
      correlationScore,
      expectedPayout: input.stake * combinedPrice,
    }),
    rankedCandidates,
    selectedCandidates,
    rejectedCandidates,
    scorecard: {
      legCount: selectedCandidates.length,
      averageLegScore,
      combinedProbability,
      combinedPrice,
      expectedValuePerUnit,
      parlayScore,
      riskScore,
      correlationScore,
      ready,
      reasons,
    },
  };
};

export const settleParlayTicket = (
  parlay: ParlayEntity,
  settlements: readonly AtomicLegSettlement[],
  settledAt?: ISODateString,
): SettledParlayTicket => {
  const settlementMap = new Map(settlements.map((settlement) => [settlement.predictionId, settlement.status] as const));
  const nextLegs: SettledLeg[] = parlay.legs.map((leg) => {
    const status = settlementMap.get(leg.predictionId) ?? "pending";
    return {
      ...leg,
      status,
      settlementStatus: status,
    };
  });

  if (nextLegs.some((leg) => leg.status === "pending")) {
    return {
      parlay: {
        ...parlay,
        legs: nextLegs,
      },
      legs: nextLegs,
      finalized: false,
      verdict: "pending",
      actualPayout: 0,
      profit: 0,
      gradedLegCount: nextLegs.filter((leg) => leg.status !== "pending").length,
    };
  }

  const allVoided = nextLegs.every((leg) => leg.status === "voided");
  const hasLoss = nextLegs.some((leg) => leg.status === "lost");
  const gradedLegCount = nextLegs.filter((leg) => leg.status !== "pending").length;

  const parlayEntity = settleParlay(
    parlay,
    nextLegs,
    allVoided ? "voided" : "settled",
    settledAt,
  );

  const payoutMultiplier = hasLoss
    ? 0
    : allVoided
      ? 1
      : nextLegs.reduce(
          (product, leg) => product * (leg.status === "voided" ? 1 : leg.price),
          1,
        );
  const actualPayout = parlayEntity.stake * payoutMultiplier;
  const profit = actualPayout - parlayEntity.stake;

  return {
    parlay: parlayEntity,
    legs: nextLegs,
    finalized: true,
    verdict: allVoided ? "voided" : hasLoss ? "lost" : "won",
    actualPayout,
    profit,
    gradedLegCount,
  };
};

function validateAtomicCandidate(candidate: AtomicCandidate): void {
  if (candidate.price <= 1) {
    throw new DomainError(`Candidate ${candidate.predictionId} price must be greater than 1`, "PARLAY_INVALID_PRICE");
  }

  if (candidate.confidence < 0 || candidate.confidence > 1) {
    throw new DomainError(
      `Candidate ${candidate.predictionId} confidence must be between 0 and 1`,
      "PARLAY_INVALID_CONFIDENCE",
    );
  }

  if (candidate.modelProbability < 0 || candidate.modelProbability > 1) {
    throw new DomainError(
      `Candidate ${candidate.predictionId} modelProbability must be between 0 and 1`,
      "PARLAY_INVALID_PROBABILITY",
    );
  }
}
