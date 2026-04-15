import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export interface AuditEventEntity extends AuditableEntity {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly actor?: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: ISODateString;
}

export const createAuditEvent = (
  input: Omit<AuditEventEntity, "createdAt" | "updatedAt" | "occurredAt"> &
    Partial<Pick<AuditEventEntity, "createdAt" | "updatedAt" | "occurredAt">>,
): AuditEventEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    occurredAt: input.occurredAt ?? timestamp,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
