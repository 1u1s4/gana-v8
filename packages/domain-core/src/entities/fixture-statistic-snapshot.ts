import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type FixtureStatisticScope = "home" | "away" | "match";

export interface FixtureStatisticSnapshotEntity extends AuditableEntity {
  readonly batchId: string;
  readonly fixtureId?: string;
  readonly providerFixtureId: string;
  readonly providerCode: string;
  readonly statKey: string;
  readonly scope: FixtureStatisticScope;
  readonly valueNumeric?: number;
  readonly capturedAt: ISODateString;
  readonly sourceUpdatedAt?: ISODateString;
  readonly payload: Record<string, unknown>;
}

export const createFixtureStatisticSnapshot = (
  input: Omit<FixtureStatisticSnapshotEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<FixtureStatisticSnapshotEntity, "createdAt" | "updatedAt">>,
): FixtureStatisticSnapshotEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
