import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type RuntimeReleaseSnapshotRefRole = "baseline" | "candidate";

export interface RuntimeReleaseSnapshotEntity extends AuditableEntity {
  readonly refName: string;
  readonly refRole: RuntimeReleaseSnapshotRefRole;
  readonly evidenceProfile: string;
  readonly gitSha: string;
  readonly baselineRef?: string;
  readonly candidateRef?: string;
  readonly lookbackHours: number;
  readonly lookbackStart: ISODateString;
  readonly lookbackEnd: ISODateString;
  readonly fingerprint: string;
  readonly runtimeSignals: Record<string, unknown>;
  readonly coverage: Record<string, unknown>;
}

export const createRuntimeReleaseSnapshot = (
  input: Omit<
    RuntimeReleaseSnapshotEntity,
    "createdAt" | "updatedAt" | "runtimeSignals" | "coverage"
  > &
    Partial<
      Pick<
        RuntimeReleaseSnapshotEntity,
        "createdAt" | "updatedAt" | "runtimeSignals" | "coverage"
      >
    >,
): RuntimeReleaseSnapshotEntity => {
  const timestamp = input.createdAt ?? nowIso();

  return {
    id: input.id,
    refName: input.refName,
    refRole: input.refRole,
    evidenceProfile: input.evidenceProfile,
    gitSha: input.gitSha,
    ...(input.baselineRef ? { baselineRef: input.baselineRef } : {}),
    ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
    lookbackHours: input.lookbackHours,
    lookbackStart: input.lookbackStart,
    lookbackEnd: input.lookbackEnd,
    fingerprint: input.fingerprint,
    runtimeSignals: structuredClone(input.runtimeSignals ?? {}),
    coverage: structuredClone(input.coverage ?? {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
