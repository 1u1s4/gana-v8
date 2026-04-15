import { DomainError, nowIso } from "../common.js";
import type { AuditableEntity, ISODateString } from "../common.js";

export type ValidationStatus = "pending" | "passed" | "failed" | "partial";
export type ValidationKind =
  | "fixture-result"
  | "prediction-settlement"
  | "parlay-settlement"
  | "sandbox-regression";

export interface ValidationCheck {
  readonly code: string;
  readonly message: string;
  readonly passed: boolean;
}

export interface ValidationEntity extends AuditableEntity {
  readonly targetId: string;
  readonly kind: ValidationKind;
  readonly status: ValidationStatus;
  readonly checks: readonly ValidationCheck[];
  readonly summary: string;
  readonly executedAt?: ISODateString;
}

export const createValidation = (
  input: Omit<ValidationEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<ValidationEntity, "createdAt" | "updatedAt">>,
): ValidationEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const finalizeValidation = (
  validation: ValidationEntity,
  status: Exclude<ValidationStatus, "pending">,
  checks: readonly ValidationCheck[],
  summary: string,
  executedAt: ISODateString = nowIso(),
): ValidationEntity => {
  if (validation.status !== "pending") {
    throw new DomainError(
      `Validation ${validation.id} already finalized`,
      "VALIDATION_ALREADY_FINALIZED",
    );
  }

  return {
    ...validation,
    status,
    checks,
    summary,
    executedAt,
    updatedAt: executedAt,
  };
};
