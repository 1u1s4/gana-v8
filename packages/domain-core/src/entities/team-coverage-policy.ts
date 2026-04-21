import type { AuditableEntity } from "../common.js";
import { DomainError, nowIso } from "../common.js";

export interface TeamCoveragePolicyEntity extends AuditableEntity {
  readonly provider: string;
  readonly teamKey: string;
  readonly teamName: string;
  readonly enabled: boolean;
  readonly alwaysTrack: boolean;
  readonly priority: number;
  readonly followHome: boolean;
  readonly followAway: boolean;
  readonly forceResearch: boolean;
  readonly notes?: string;
}

export const createTeamCoveragePolicy = (
  input: Omit<TeamCoveragePolicyEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<TeamCoveragePolicyEntity, "createdAt" | "updatedAt">>,
): TeamCoveragePolicyEntity => {
  if (!input.followHome && !input.followAway) {
    throw new DomainError(
      "at least one of followHome or followAway must be true",
      "TEAM_COVERAGE_INVALID_FOLLOW_SCOPE",
    );
  }

  if (input.priority < 0) {
    throw new DomainError("priority must be greater than or equal to 0", "TEAM_COVERAGE_INVALID_PRIORITY");
  }

  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
