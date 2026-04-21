import type { AuditableEntity } from "../common.js";
import { DomainError, nowIso } from "../common.js";

export interface DailyAutomationPolicyEntity extends AuditableEntity {
  readonly policyName: string;
  readonly enabled: boolean;
  readonly timezone: string;
  readonly minAllowedOdd: number;
  readonly defaultMaxFixturesPerRun: number;
  readonly defaultLookaheadHours: number;
  readonly defaultLookbackHours: number;
  readonly requireTrackedLeagueOrTeam: boolean;
  readonly allowManualInclusionBypass: boolean;
  readonly notes?: string;
}

export const createDailyAutomationPolicy = (
  input: Omit<DailyAutomationPolicyEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<DailyAutomationPolicyEntity, "createdAt" | "updatedAt">>,
): DailyAutomationPolicyEntity => {
  if (input.minAllowedOdd <= 1) {
    throw new DomainError(
      "minAllowedOdd must be greater than 1",
      "DAILY_AUTOMATION_POLICY_INVALID_MIN_ODD",
    );
  }

  if (input.defaultMaxFixturesPerRun <= 0) {
    throw new DomainError(
      "defaultMaxFixturesPerRun must be greater than 0",
      "DAILY_AUTOMATION_POLICY_INVALID_MAX_FIXTURES",
    );
  }

  if (input.defaultLookaheadHours < 0 || input.defaultLookbackHours < 0) {
    throw new DomainError(
      "lookahead/lookback hours must be greater than or equal to 0",
      "DAILY_AUTOMATION_POLICY_INVALID_LOOK_WINDOW",
    );
  }

  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
