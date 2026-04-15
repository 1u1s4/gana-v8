import {
  AuditableEntity,
  DomainError,
  ISODateString,
  nowIso,
} from "../common.js";

export type ParlayStatus =
  | "draft"
  | "ready"
  | "submitted"
  | "settled"
  | "voided";
export type ParlayLegStatus = "pending" | "won" | "lost" | "voided";

export interface ParlayLeg {
  readonly predictionId: string;
  readonly fixtureId: string;
  readonly market: string;
  readonly outcome: string;
  readonly price: number;
  readonly status: ParlayLegStatus;
}

export interface ParlayEntity extends AuditableEntity {
  readonly status: ParlayStatus;
  readonly stake: number;
  readonly source: "manual" | "automatic";
  readonly legs: readonly ParlayLeg[];
  readonly correlationScore: number;
  readonly expectedPayout: number;
  readonly submittedAt?: ISODateString;
  readonly settledAt?: ISODateString;
}

export const createParlay = (
  input: Omit<ParlayEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ParlayEntity, "createdAt" | "updatedAt">>,
): ParlayEntity => {
  if (input.legs.length === 0) {
    throw new DomainError("A parlay requires at least one leg", "PARLAY_EMPTY");
  }

  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const settleParlay = (
  parlay: ParlayEntity,
  legs: readonly ParlayLeg[],
  status: Extract<ParlayStatus, "settled" | "voided">,
  settledAt: ISODateString = nowIso(),
): ParlayEntity => {
  if (parlay.status !== "submitted" && parlay.status !== "ready") {
    throw new DomainError(
      `Parlay ${parlay.id} cannot be settled from ${parlay.status}`,
      "PARLAY_INVALID_SETTLEMENT",
    );
  }

  return {
    ...parlay,
    legs,
    status,
    settledAt,
    updatedAt: settledAt,
  };
};
