import { DomainError, nowIso } from "../common.js";
import type { AuditableEntity, ISODateString } from "../common.js";

export type FixtureStatus = "scheduled" | "live" | "completed" | "cancelled";

export interface FixtureScore {
  readonly home: number;
  readonly away: number;
}

export interface FixtureEntity extends AuditableEntity {
  readonly sport: string;
  readonly competition: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly scheduledAt: ISODateString;
  readonly status: FixtureStatus;
  readonly score?: FixtureScore;
  readonly metadata: Record<string, string>;
}

const validTransitions: Record<FixtureStatus, FixtureStatus[]> = {
  scheduled: ["live", "completed", "cancelled"],
  live: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const createFixture = (
  input: Omit<FixtureEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<FixtureEntity, "createdAt" | "updatedAt">>,
): FixtureEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const transitionFixtureStatus = (
  fixture: FixtureEntity,
  nextStatus: FixtureStatus,
  score?: FixtureScore,
): FixtureEntity => {
  if (!validTransitions[fixture.status].includes(nextStatus)) {
    throw new DomainError(
      `Cannot transition fixture ${fixture.id} from ${fixture.status} to ${nextStatus}`,
      "FIXTURE_INVALID_TRANSITION",
    );
  }

  return {
    ...fixture,
    status: nextStatus,
    ...(score !== undefined
      ? { score }
      : fixture.score !== undefined
        ? { score: fixture.score }
        : {}),
    updatedAt: nowIso(),
  };
};
