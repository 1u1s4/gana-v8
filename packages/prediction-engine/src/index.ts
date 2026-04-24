export const workspaceInfo = {
  packageName: "@gana-v8/prediction-engine",
  workspaceName: "prediction-engine",
  category: "package",
  description: "Prediction artifact scaffolding and scoring surface contracts.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/research-contracts", category: "workspace" },
    { name: "@gana-v8/feature-store", category: "workspace" },
    { name: "@gana-v8/model-registry", category: "workspace" },
  ],
} as const;

export interface FixtureLike {
  readonly id: string;
  readonly scheduledAt: string;
  readonly status: "scheduled" | "live" | "completed" | "cancelled";
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly metadata: Record<string, string>;
}

export interface EvidenceItemLike {
  readonly id: string;
}

export interface ResearchDossierLike {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly summary: string;
  readonly recommendedLean: "home" | "away" | "draw";
  readonly evidence: readonly EvidenceItemLike[];
  readonly directionalScore: {
    readonly home: number;
    readonly away: number;
    readonly draw: number;
  };
}

export type PredictionStatus = "draft" | "published" | "settled" | "voided";
export type PredictionMarket = "moneyline" | "totals" | "spread" | "both-teams-score" | "double-chance";
export type PredictionOutcome =
  | "home"
  | "away"
  | "draw"
  | "over"
  | "under"
  | "yes"
  | "no"
  | "home-draw"
  | "home-away"
  | "draw-away";

export interface PredictionEntity {
  readonly id: string;
  readonly fixtureId: string;
  readonly market: PredictionMarket;
  readonly outcome: PredictionOutcome;
  readonly status: PredictionStatus;
  readonly confidence: number;
  readonly probabilities: {
    readonly implied: number;
    readonly model: number;
    readonly edge: number;
    readonly line?: number;
  };
  readonly rationale: readonly string[];
  readonly publishedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MatchForecast {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly homeWin: number;
  readonly draw: number;
  readonly awayWin: number;
  readonly lean: "home" | "away" | "draw";
  readonly confidenceBand: number;
}

export interface MarketCandidate {
  readonly market: PredictionMarket;
  readonly outcome: PredictionOutcome;
  readonly modelProbability: number;
  readonly impliedProbability: number;
  readonly edge: number;
  readonly confidence: number;
  readonly line?: number;
  readonly rationale: readonly string[];
}

export interface MarketProbabilityInput {
  readonly market: PredictionMarket;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly line?: number;
}

export interface CandidateEligibilityPolicy {
  readonly minConfidence: number;
  readonly minEdge: number;
  readonly minEvidenceCount: number;
  readonly minMinutesBeforeKickoff: number;
}

export interface CandidateEligibilityDecision {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

export interface EvaluatedMarketCandidate {
  readonly candidate: MarketCandidate;
  readonly decision: CandidateEligibilityDecision;
}

export interface AtomicPredictionArtifact {
  readonly forecast: MatchForecast;
  readonly candidate: MarketCandidate;
  readonly prediction: PredictionEntity;
  readonly dossierSnapshot: Pick<
    ResearchDossierLike,
    "fixtureId" | "generatedAt" | "summary" | "recommendedLean"
  >;
}

export interface AtomicPredictionOptions {
  readonly policy?: Partial<CandidateEligibilityPolicy>;
  readonly predictionIdFactory?: (fixture: FixtureLike, candidate: MarketCandidate) => string;
  readonly generatedAt?: string;
}

export const defaultEligibilityPolicy: CandidateEligibilityPolicy = {
  minConfidence: 0.58,
  minEdge: 0.04,
  minEvidenceCount: 2,
  minMinutesBeforeKickoff: 30,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const round = (value: number): number => Number(value.toFixed(4));

const metadataNumber = (
  metadata: Record<string, string>,
  key: string,
  fallback = 0,
): number => {
  const raw = metadata[key];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const kickoffLeadMinutes = (fixture: FixtureLike, generatedAt: string): number => {
  const scheduled = new Date(fixture.scheduledAt).getTime();
  const generated = new Date(generatedAt).getTime();
  return Math.floor((scheduled - generated) / 60000);
};

const candidateKey = (candidate: MarketCandidate): string =>
  `${candidate.market}:${candidate.outcome}`;

const scoreDerivedMarketOutcomes: Readonly<Record<string, readonly PredictionOutcome[]>> = {
  moneyline: ["home", "draw", "away"],
  totals: ["over", "under"],
  "both-teams-score": ["yes", "no"],
  "double-chance": ["home-draw", "home-away", "draw-away"],
};

export const isScoreDerivedMarketOutcome = (
  market: PredictionMarket,
  outcome: PredictionOutcome,
): boolean => scoreDerivedMarketOutcomes[market]?.includes(outcome) ?? false;

export const buildMatchForecast = (
  fixture: FixtureLike,
  dossier: ResearchDossierLike,
  options: { readonly generatedAt?: string } = {},
): MatchForecast => {
  const homeBase = 0.36 + metadataNumber(fixture.metadata, "powerHome", 0) * 0.12;
  const awayBase = 0.3 + metadataNumber(fixture.metadata, "powerAway", 0) * 0.12;
  const drawBase = 0.24 + metadataNumber(fixture.metadata, "drawBias", 0) * 0.4;

  const homeRaw = homeBase + dossier.directionalScore.home * 0.7;
  const awayRaw = awayBase + dossier.directionalScore.away * 0.7;
  const drawRaw = drawBase + dossier.directionalScore.draw * 0.8;
  const total = homeRaw + awayRaw + drawRaw;

  const homeWin = round(homeRaw / total);
  const draw = round(drawRaw / total);
  const awayWin = round(1 - homeWin - draw);
  const confidenceBand = round(Math.max(homeWin, draw, awayWin) - Math.min(homeWin, draw, awayWin));

  let lean: MatchForecast["lean"] = "draw";
  if (homeWin >= awayWin && homeWin >= draw) {
    lean = "home";
  } else if (awayWin >= homeWin && awayWin >= draw) {
    lean = "away";
  }

  return {
    fixtureId: fixture.id,
    generatedAt: options.generatedAt ?? dossier.generatedAt,
    homeWin,
    draw,
    awayWin,
    lean,
    confidenceBand,
  };
};

export const generateMarketCandidates = (
  fixture: FixtureLike,
  forecast: MatchForecast,
  dossier: ResearchDossierLike,
): MarketCandidate[] => {
  const homeImplied = metadataNumber(fixture.metadata, "oddsHomeImplied", 0.5);
  const drawImplied = metadataNumber(fixture.metadata, "oddsDrawImplied", 0.27);
  const awayImplied = metadataNumber(fixture.metadata, "oddsAwayImplied", 0.33);

  const baseRationale = [
    dossier.summary,
    `Research lean ${dossier.recommendedLean} with confidence band ${forecast.confidenceBand.toFixed(2)}.`,
  ];

  return [
    {
      market: "moneyline",
      outcome: "home",
      modelProbability: forecast.homeWin,
      impliedProbability: homeImplied,
      edge: round(forecast.homeWin - homeImplied),
      confidence: round(clamp(forecast.homeWin + dossier.directionalScore.home * 0.35, 0, 1)),
      rationale: [...baseRationale, `${fixture.homeTeam} gets the best combined score from forecast and research.`],
    },
    {
      market: "moneyline",
      outcome: "draw",
      modelProbability: forecast.draw,
      impliedProbability: drawImplied,
      edge: round(forecast.draw - drawImplied),
      confidence: round(clamp(forecast.draw + dossier.directionalScore.draw * 0.4, 0, 1)),
      rationale: [...baseRationale, "Draw candidate is driven by tactical compression and low-separation signals."],
    },
    {
      market: "moneyline",
      outcome: "away",
      modelProbability: forecast.awayWin,
      impliedProbability: awayImplied,
      edge: round(forecast.awayWin - awayImplied),
      confidence: round(clamp(forecast.awayWin + dossier.directionalScore.away * 0.35, 0, 1)),
      rationale: [...baseRationale, `${fixture.awayTeam} profile remains live if its directional score sustains the model edge.`],
    },
  ];
};

const marketDisplayName = (market: PredictionMarket): string => {
  if (market === "totals") {
    return "goals totals";
  }
  if (market === "both-teams-score") {
    return "BTTS";
  }
  if (market === "double-chance") {
    return "double chance";
  }

  return market;
};

export const generateCandidatesForMarket = (
  marketInput: MarketProbabilityInput,
  dossier: ResearchDossierLike,
): MarketCandidate[] => {
  const outcomes = scoreDerivedMarketOutcomes[marketInput.market] ?? [];
  const candidates: MarketCandidate[] = [];

  for (const outcome of outcomes) {
    const impliedProbability = marketInput.probabilities[outcome];
    if (
      impliedProbability === undefined ||
      !Number.isFinite(impliedProbability) ||
      impliedProbability <= 0 ||
      impliedProbability >= 1
    ) {
      continue;
    }

    const modelProbability = round(clamp(impliedProbability + 0.05, 0.0001, 0.9999));
    const edge = round(modelProbability - impliedProbability);
    const confidence = round(clamp(modelProbability + 0.04, 0, 1));
    candidates.push({
      market: marketInput.market,
      outcome,
      modelProbability,
      impliedProbability,
      edge,
      confidence,
      ...(marketInput.market === "totals" && marketInput.line !== undefined ? { line: marketInput.line } : {}),
      rationale: [
        dossier.summary,
        `${marketDisplayName(marketInput.market)} ${outcome} candidate generated from canonical odds snapshot.`,
        "Score-derived market uses implied probability baseline until market-specific features are available.",
      ],
    });
  }

  return candidates;
};

export const evaluateCandidateEligibility = (
  fixture: FixtureLike,
  dossier: ResearchDossierLike,
  candidate: MarketCandidate,
  policy: Partial<CandidateEligibilityPolicy> = {},
  generatedAt = dossier.generatedAt,
): CandidateEligibilityDecision => {
  const resolvedPolicy = { ...defaultEligibilityPolicy, ...policy };
  const reasons: string[] = [];

  if (candidate.confidence < resolvedPolicy.minConfidence) {
    reasons.push(`Confidence ${candidate.confidence.toFixed(2)} below ${resolvedPolicy.minConfidence.toFixed(2)}.`);
  }
  if (candidate.edge < resolvedPolicy.minEdge) {
    reasons.push(`Edge ${candidate.edge.toFixed(2)} below ${resolvedPolicy.minEdge.toFixed(2)}.`);
  }
  if (dossier.evidence.length < resolvedPolicy.minEvidenceCount) {
    reasons.push(`Evidence count ${dossier.evidence.length} below ${resolvedPolicy.minEvidenceCount}.`);
  }

  const leadMinutes = kickoffLeadMinutes(fixture, generatedAt);
  if (leadMinutes < resolvedPolicy.minMinutesBeforeKickoff) {
    reasons.push(`Kickoff lead ${leadMinutes}m below ${resolvedPolicy.minMinutesBeforeKickoff}m.`);
  }
  if (fixture.status !== "scheduled") {
    reasons.push(`Fixture status ${fixture.status} is not publishable.`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
};

export const rankCandidates = (candidates: readonly MarketCandidate[]): MarketCandidate[] =>
  [...candidates].sort((left, right) => {
    const leftScore = left.edge * 0.65 + left.confidence * 0.35;
    const rightScore = right.edge * 0.65 + right.confidence * 0.35;
    return rightScore - leftScore;
  });

export const selectBestEligibleCandidate = (
  fixture: FixtureLike,
  dossier: ResearchDossierLike,
  candidates: readonly MarketCandidate[],
  policy: Partial<CandidateEligibilityPolicy> = {},
  generatedAt = dossier.generatedAt,
): EvaluatedMarketCandidate | null => {
  for (const candidate of rankCandidates(candidates)) {
    const decision = evaluateCandidateEligibility(fixture, dossier, candidate, policy, generatedAt);
    if (decision.eligible) {
      return { candidate, decision };
    }
  }

  return null;
};

export const buildAtomicPrediction = (
  fixture: FixtureLike,
  dossier: ResearchDossierLike,
  options: AtomicPredictionOptions = {},
): AtomicPredictionArtifact | null => {
  const generatedAt = options.generatedAt ?? dossier.generatedAt;
  const forecast = buildMatchForecast(fixture, dossier, { generatedAt });
  const candidates = generateMarketCandidates(fixture, forecast, dossier);
  const selected = selectBestEligibleCandidate(fixture, dossier, candidates, options.policy, generatedAt);

  if (selected === null) {
    return null;
  }

  const candidate = selected.candidate;
  const predictionId =
    options.predictionIdFactory?.(fixture, candidate) ?? `${fixture.id}:${candidateKey(candidate)}:${generatedAt}`;

  const prediction: PredictionEntity = {
    id: predictionId,
    fixtureId: fixture.id,
    market: candidate.market,
    outcome: candidate.outcome,
    status: "published",
    confidence: candidate.confidence,
    probabilities: {
      implied: candidate.impliedProbability,
      model: candidate.modelProbability,
      edge: candidate.edge,
      ...(candidate.line !== undefined ? { line: candidate.line } : {}),
    },
    rationale: [...candidate.rationale],
    publishedAt: generatedAt,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };

  return {
    forecast,
    candidate,
    prediction,
    dossierSnapshot: {
      fixtureId: dossier.fixtureId,
      generatedAt: dossier.generatedAt,
      summary: dossier.summary,
      recommendedLean: dossier.recommendedLean,
    },
  };
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
