import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type TeamSide = "home" | "away";
export type AvailabilitySubjectType = "team" | "player";
export type AvailabilityStatus = "available" | "questionable" | "out";

export interface AvailabilitySnapshotEntity extends AuditableEntity {
  readonly batchId: string;
  readonly fixtureId?: string;
  readonly providerFixtureId: string;
  readonly providerCode: string;
  readonly teamSide?: TeamSide;
  readonly subjectType: AvailabilitySubjectType;
  readonly subjectName: string;
  readonly status: AvailabilityStatus;
  readonly capturedAt: ISODateString;
  readonly sourceUpdatedAt?: ISODateString;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
}

export const createAvailabilitySnapshot = (
  input: Omit<AvailabilitySnapshotEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<AvailabilitySnapshotEntity, "createdAt" | "updatedAt">>,
): AvailabilitySnapshotEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
