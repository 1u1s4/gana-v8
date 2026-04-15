import { randomUUID } from "node:crypto";

import { createLogEvent, type LogEvent, type TelemetryContext } from "@gana-v8/observability";

export const workspaceInfo = {
  packageName: "@gana-v8/audit-lineage",
  workspaceName: "audit-lineage",
  category: "package",
  description: "Traceability primitives for workflows, artifacts, and operator actions.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export type AuditActorType = "system" | "operator" | "service";
export type AuditAction = "created" | "updated" | "approved" | "rejected" | "executed" | "attached";
export type AuditSubjectType = "workflow" | "artifact" | "prediction" | "prompt" | "approval";

export interface LineageRef {
  readonly id: string;
  readonly kind: string;
  readonly source: string;
  readonly runId: string;
  readonly capturedAt: string;
  readonly schemaVersion: string;
  readonly checksum?: string;
  readonly parents: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface AuditActor {
  readonly id: string;
  readonly type: AuditActorType;
  readonly displayName: string;
}

export interface AuditSubject {
  readonly id: string;
  readonly type: AuditSubjectType;
}

export interface AuditTrailEntry {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: AuditAction;
  readonly actor: AuditActor;
  readonly subject: AuditSubject;
  readonly summary: string;
  readonly lineage: readonly LineageRef[];
  readonly tags: readonly string[];
  readonly details: Readonly<Record<string, unknown>>;
  readonly traceId?: string;
  readonly correlationId?: string;
}

export interface AuditTrailRecord {
  readonly entry: AuditTrailEntry;
  readonly event: LogEvent;
}

const cloneStringMap = (value?: Readonly<Record<string, string>>): Readonly<Record<string, string>> => ({ ...(value ?? {}) });
const cloneUnknownMap = (value?: Record<string, unknown>): Readonly<Record<string, unknown>> => ({ ...(value ?? {}) });

export const createLineageRef = (input: {
  readonly kind: string;
  readonly source: string;
  readonly runId: string;
  readonly capturedAt: string;
  readonly schemaVersion: string;
  readonly checksum?: string;
  readonly parents?: readonly string[];
  readonly metadata?: Readonly<Record<string, string>>;
}): LineageRef => ({
  capturedAt: input.capturedAt,
  ...(input.checksum ? { checksum: input.checksum } : {}),
  id: randomUUID(),
  kind: input.kind,
  metadata: cloneStringMap(input.metadata),
  parents: [...(input.parents ?? [])],
  runId: input.runId,
  schemaVersion: input.schemaVersion,
  source: input.source,
});

export const linkLineage = (ref: LineageRef, parents: readonly LineageRef[]): LineageRef => ({
  ...ref,
  parents: [...new Set([...ref.parents, ...parents.map((parent) => parent.id)])],
});

export const createAuditEntry = (input: {
  readonly action: AuditAction;
  readonly actor: AuditActor;
  readonly subject: AuditSubject;
  readonly summary: string;
  readonly occurredAt?: string;
  readonly lineage?: readonly LineageRef[];
  readonly tags?: readonly string[];
  readonly details?: Record<string, unknown>;
  readonly context?: Partial<TelemetryContext>;
}): AuditTrailRecord => {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const lineage = [...(input.lineage ?? [])].map((ref) => structuredClone(ref));
  const entry: AuditTrailEntry = {
    action: input.action,
    actor: structuredClone(input.actor),
    ...(input.context?.correlationId ? { correlationId: input.context.correlationId } : {}),
    details: cloneUnknownMap(input.details),
    id: randomUUID(),
    lineage,
    occurredAt,
    ...(input.context?.traceId ? { traceId: input.context.traceId } : {}),
    subject: structuredClone(input.subject),
    summary: input.summary,
    tags: [...(input.tags ?? [])],
  };

  return {
    entry,
    event: createLogEvent({
      ...(input.context ? { context: input.context } : {}),
      data: {
        action: entry.action,
        actorId: entry.actor.id,
        lineageIds: entry.lineage.map((ref) => ref.id),
        subjectId: entry.subject.id,
        subjectType: entry.subject.type,
        tags: entry.tags,
      },
      message: `audit:${entry.subject.type}:${entry.action}`,
      severity: "info",
      timestamp: occurredAt,
    }),
  };
};

export const collectLineageIds = (entry: AuditTrailEntry): readonly string[] => entry.lineage.map((ref) => ref.id);

export const buildAuditTrailSummary = (entries: readonly AuditTrailEntry[]) => ({
  actors: new Set(entries.map((entry) => entry.actor.id)).size,
  entries: entries.length,
  lineageRefs: new Set(entries.flatMap((entry) => entry.lineage.map((ref) => ref.id))).size,
  subjects: new Set(entries.map((entry) => `${entry.subject.type}:${entry.subject.id}`)).size,
});

export class InMemoryAuditTrail {
  private readonly records: AuditTrailRecord[] = [];

  append(record: AuditTrailRecord): AuditTrailRecord {
    this.records.push(structuredClone(record));
    return structuredClone(record);
  }

  record(input: Parameters<typeof createAuditEntry>[0]): AuditTrailRecord {
    return this.append(createAuditEntry(input));
  }

  list(): readonly AuditTrailEntry[] {
    return this.records.map((record) => structuredClone(record.entry));
  }

  events(): readonly LogEvent[] {
    return this.records.map((record) => structuredClone(record.event));
  }

  listBySubject(subject: AuditSubject): readonly AuditTrailEntry[] {
    return this.records
      .filter((record) => record.entry.subject.id === subject.id && record.entry.subject.type === subject.type)
      .map((record) => structuredClone(record.entry));
  }

  listByLineageRef(lineageId: string): readonly AuditTrailEntry[] {
    return this.records
      .filter((record) => record.entry.lineage.some((lineage) => lineage.id === lineageId))
      .map((record) => structuredClone(record.entry));
  }

  summary() {
    return buildAuditTrailSummary(this.list());
  }
}
