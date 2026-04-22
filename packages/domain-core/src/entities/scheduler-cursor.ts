import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export interface SchedulerCursorEntity extends AuditableEntity {
  readonly specId: string;
  readonly lastTriggeredAt?: ISODateString;
  readonly metadata?: Record<string, unknown>;
}

export const createSchedulerCursor = (
  input: Omit<SchedulerCursorEntity, "createdAt" | "updatedAt"> &
    Partial<Pick<SchedulerCursorEntity, "createdAt" | "updatedAt">>,
): SchedulerCursorEntity => {
  const timestamp = input.createdAt ?? nowIso();
  return {
    id: input.id,
    specId: input.specId,
    ...(input.lastTriggeredAt ? { lastTriggeredAt: input.lastTriggeredAt } : {}),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
