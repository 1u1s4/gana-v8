import type { AuditableEntity, ISODateString } from "../common.js";
import { nowIso } from "../common.js";

export type OperationalTelemetryKind = "log" | "span";

export type OperationalTelemetrySeverity = "debug" | "info" | "warn" | "error";

export type OperationalMetricType = "counter" | "gauge" | "histogram";

export interface OperationalTelemetryEventEntity extends AuditableEntity {
  readonly kind: OperationalTelemetryKind;
  readonly name: string;
  readonly severity: OperationalTelemetrySeverity;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly sandboxCertificationRunId?: string;
  readonly occurredAt: ISODateString;
  readonly finishedAt?: ISODateString;
  readonly durationMs?: number;
  readonly message?: string;
  readonly attributes: Record<string, unknown>;
}

export interface OperationalMetricSampleEntity extends AuditableEntity {
  readonly name: string;
  readonly type: OperationalMetricType;
  readonly value: number;
  readonly labels: Record<string, string>;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly sandboxCertificationRunId?: string;
  readonly recordedAt: ISODateString;
}

export const createOperationalTelemetryEvent = (
  input: Omit<OperationalTelemetryEventEntity, "createdAt" | "updatedAt" | "attributes"> &
    Partial<Pick<OperationalTelemetryEventEntity, "createdAt" | "updatedAt" | "attributes">>,
): OperationalTelemetryEventEntity => {
  const timestamp = input.createdAt ?? nowIso();

  return {
    id: input.id,
    kind: input.kind,
    name: input.name,
    severity: input.severity,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}),
    ...(input.automationCycleId ? { automationCycleId: input.automationCycleId } : {}),
    ...(input.sandboxCertificationRunId ? { sandboxCertificationRunId: input.sandboxCertificationRunId } : {}),
    occurredAt: input.occurredAt,
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.message ? { message: input.message } : {}),
    attributes: structuredClone(input.attributes ?? {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const createOperationalMetricSample = (
  input: Omit<OperationalMetricSampleEntity, "createdAt" | "updatedAt" | "labels"> &
    Partial<Pick<OperationalMetricSampleEntity, "createdAt" | "updatedAt" | "labels">>,
): OperationalMetricSampleEntity => {
  const timestamp = input.createdAt ?? nowIso();

  return {
    id: input.id,
    name: input.name,
    type: input.type,
    value: input.value,
    labels: { ...(input.labels ?? {}) },
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}),
    ...(input.automationCycleId ? { automationCycleId: input.automationCycleId } : {}),
    ...(input.sandboxCertificationRunId ? { sandboxCertificationRunId: input.sandboxCertificationRunId } : {}),
    recordedAt: input.recordedAt,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};
