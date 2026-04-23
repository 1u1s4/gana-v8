import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type AuditActorType = "system" | "operator" | "service";

export interface AuditEventEntity extends AuditableEntity {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly actor?: string;
  readonly actorType?: AuditActorType;
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly action?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly lineageRefs?: readonly string[];
  readonly payload: Record<string, unknown>;
  readonly occurredAt: ISODateString;
}

export const createAuditEvent = (
  input: Omit<AuditEventEntity, "createdAt" | "updatedAt" | "occurredAt"> &
    Partial<Pick<AuditEventEntity, "createdAt" | "updatedAt" | "occurredAt">>,
): AuditEventEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    id: input.id,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.actorType ? { actorType: input.actorType } : {}),
    ...(input.subjectType ? { subjectType: input.subjectType } : {}),
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.lineageRefs ? { lineageRefs: [...input.lineageRefs] } : {}),
    payload: structuredClone(input.payload),
    occurredAt: input.occurredAt ?? timestamp,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
