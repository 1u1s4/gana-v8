import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";
import type { AvailabilityStatus, TeamSide } from "./availability-snapshot.js";

export type LineupStatus = "projected" | "confirmed";
export type LineupParticipantRole = "starting" | "bench";

export interface LineupSnapshotEntity extends AuditableEntity {
  readonly batchId: string;
  readonly fixtureId?: string;
  readonly providerFixtureId: string;
  readonly providerCode: string;
  readonly teamSide: TeamSide;
  readonly lineupStatus: LineupStatus;
  readonly formation?: string;
  readonly capturedAt: ISODateString;
  readonly sourceUpdatedAt?: ISODateString;
  readonly payload: Record<string, unknown>;
}

export interface LineupParticipantEntity extends AuditableEntity {
  readonly lineupSnapshotId: string;
  readonly index: number;
  readonly participantName: string;
  readonly role: LineupParticipantRole;
  readonly position?: string;
  readonly jerseyNumber?: number;
  readonly availabilityStatus?: AvailabilityStatus;
}

export const createLineupSnapshot = (
  input: Omit<LineupSnapshotEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<LineupSnapshotEntity, "createdAt" | "updatedAt">>,
): LineupSnapshotEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const createLineupParticipant = (
  input: Omit<LineupParticipantEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<LineupParticipantEntity, "createdAt" | "updatedAt">>,
): LineupParticipantEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
