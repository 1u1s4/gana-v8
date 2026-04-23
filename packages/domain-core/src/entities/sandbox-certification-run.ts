import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type SandboxCertificationVerificationKind = "synthetic-integrity" | "runtime-release";

export type SandboxCertificationRunStatus = "passed" | "failed";

export type SandboxPromotionStatus = "blocked" | "review-required" | "promotable";

export interface SandboxCertificationDiffEntry {
  readonly path: string;
  readonly kind: "added" | "removed" | "changed";
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export interface SandboxCertificationRunEntity extends AuditableEntity {
  readonly verificationKind: SandboxCertificationVerificationKind;
  readonly profileName: string;
  readonly packId: string;
  readonly mode: string;
  readonly gitSha: string;
  readonly baselineRef?: string;
  readonly candidateRef?: string;
  readonly status: SandboxCertificationRunStatus;
  readonly promotionStatus?: SandboxPromotionStatus;
  readonly goldenFingerprint?: string;
  readonly evidenceFingerprint?: string;
  readonly artifactRef?: string;
  readonly runtimeSignals: Record<string, unknown>;
  readonly diffEntries: readonly SandboxCertificationDiffEntry[];
  readonly summary: Record<string, unknown>;
  readonly generatedAt: ISODateString;
}

const cloneDiffEntry = (
  entry: SandboxCertificationDiffEntry,
): SandboxCertificationDiffEntry => ({
  path: entry.path,
  kind: entry.kind,
  ...(entry.expected !== undefined ? { expected: structuredClone(entry.expected) } : {}),
  ...(entry.actual !== undefined ? { actual: structuredClone(entry.actual) } : {}),
});

export const createSandboxCertificationRun = (
  input: Omit<SandboxCertificationRunEntity, "createdAt" | "updatedAt" | "runtimeSignals" | "diffEntries" | "summary"> &
    Partial<
      Pick<SandboxCertificationRunEntity, "createdAt" | "updatedAt" | "runtimeSignals" | "diffEntries" | "summary">
    >,
): SandboxCertificationRunEntity => {
  const timestamp = input.createdAt ?? nowIso();

  return {
    id: input.id,
    verificationKind: input.verificationKind,
    profileName: input.profileName,
    packId: input.packId,
    mode: input.mode,
    gitSha: input.gitSha,
    ...(input.baselineRef ? { baselineRef: input.baselineRef } : {}),
    ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
    status: input.status,
    ...(input.promotionStatus ? { promotionStatus: input.promotionStatus } : {}),
    ...(input.goldenFingerprint ? { goldenFingerprint: input.goldenFingerprint } : {}),
    ...(input.evidenceFingerprint ? { evidenceFingerprint: input.evidenceFingerprint } : {}),
    ...(input.artifactRef ? { artifactRef: input.artifactRef } : {}),
    runtimeSignals: structuredClone(input.runtimeSignals ?? {}),
    diffEntries: (input.diffEntries ?? []).map(cloneDiffEntry),
    summary: structuredClone(input.summary ?? {}),
    generatedAt: input.generatedAt,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
