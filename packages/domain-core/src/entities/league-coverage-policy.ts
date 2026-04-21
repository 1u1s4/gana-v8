import type { AuditableEntity } from "../common.js";
import { DomainError, nowIso } from "../common.js";

export interface LeagueCoveragePolicyEntity extends AuditableEntity {
  readonly provider: string;
  readonly leagueKey: string;
  readonly leagueName: string;
  readonly season: number;
  readonly enabled: boolean;
  readonly alwaysOn: boolean;
  readonly priority: number;
  readonly marketsAllowed: readonly string[];
  readonly notes?: string;
}

export const createLeagueCoveragePolicy = (
  input: Omit<LeagueCoveragePolicyEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<LeagueCoveragePolicyEntity, "createdAt" | "updatedAt">>,
): LeagueCoveragePolicyEntity => {
  if (input.season <= 0) {
    throw new DomainError("season must be greater than 0", "LEAGUE_COVERAGE_INVALID_SEASON");
  }

  if (input.priority < 0) {
    throw new DomainError("priority must be greater than or equal to 0", "LEAGUE_COVERAGE_INVALID_PRIORITY");
  }

  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    marketsAllowed: [...input.marketsAllowed],
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
