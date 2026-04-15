import {
  AuditableEntity,
  DomainError,
  ISODateString,
  nowIso,
} from "../common.js";

export type PredictionStatus = "draft" | "published" | "settled" | "voided";
export type PredictionMarket =
  | "moneyline"
  | "totals"
  | "spread"
  | "both-teams-score";
export type PredictionOutcome =
  | "home"
  | "away"
  | "draw"
  | "over"
  | "under"
  | "yes"
  | "no";

export interface ProbabilityBreakdown {
  readonly implied: number;
  readonly model: number;
  readonly edge: number;
}

export interface PredictionEntity extends AuditableEntity {
  readonly fixtureId: string;
  readonly aiRunId?: string;
  readonly market: PredictionMarket;
  readonly outcome: PredictionOutcome;
  readonly status: PredictionStatus;
  readonly confidence: number;
  readonly probabilities: ProbabilityBreakdown;
  readonly rationale: string[];
  readonly publishedAt?: ISODateString;
  readonly settledAt?: ISODateString;
}

export const createPrediction = (
  input: Omit<PredictionEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<PredictionEntity, "createdAt" | "updatedAt">>,
): PredictionEntity => {
  if (input.confidence < 0 || input.confidence > 1) {
    throw new DomainError(
      "Prediction confidence must be between 0 and 1",
      "PREDICTION_INVALID_CONFIDENCE",
    );
  }

  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const publishPrediction = (
  prediction: PredictionEntity,
  publishedAt: ISODateString = nowIso(),
): PredictionEntity => {
  if (prediction.status !== "draft") {
    throw new DomainError(
      `Prediction ${prediction.id} is not in draft state`,
      "PREDICTION_NOT_DRAFT",
    );
  }

  return {
    ...prediction,
    status: "published",
    publishedAt,
    updatedAt: publishedAt,
  };
};

export const settlePrediction = (
  prediction: PredictionEntity,
  status: Extract<PredictionStatus, "settled" | "voided">,
  settledAt: ISODateString = nowIso(),
): PredictionEntity => {
  if (prediction.status !== "published") {
    throw new DomainError(
      `Prediction ${prediction.id} is not published`,
      "PREDICTION_NOT_PUBLISHED",
    );
  }

  return {
    ...prediction,
    status,
    settledAt,
    updatedAt: settledAt,
  };
};
