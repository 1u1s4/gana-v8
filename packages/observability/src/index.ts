import { randomUUID } from "node:crypto";

export const workspaceInfo = {
  packageName: "@gana-v8/observability",
  workspaceName: "observability",
  category: "package",
  description: "Structured logging and telemetry scaffolding.",
  dependencies: [{ name: "@gana-v8/domain-core", category: "workspace" }],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export type TelemetrySeverity = "debug" | "info" | "warn" | "error";
export type MetricType = "counter" | "gauge" | "histogram";

export interface TelemetryContext {
  readonly traceId: string;
  readonly spanId?: string;
  readonly correlationId: string;
  readonly workspace?: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface LogEvent {
  readonly id: string;
  readonly kind: "log";
  readonly timestamp: string;
  readonly severity: TelemetrySeverity;
  readonly message: string;
  readonly context: TelemetryContext;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface SpanEvent {
  readonly id: string;
  readonly kind: "span";
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly correlationId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly status: "ok" | "error";
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

export interface CounterMetric {
  readonly type: "counter";
  readonly name: string;
  readonly value: number;
}

export interface GaugeMetric {
  readonly type: "gauge";
  readonly name: string;
  readonly value: number;
}

export interface HistogramMetric {
  readonly type: "histogram";
  readonly name: string;
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly average: number;
}

export type MetricSnapshot = CounterMetric | GaugeMetric | HistogramMetric;
export type TelemetryEvent = LogEvent | SpanEvent;

export interface DurableTelemetryRefs {
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly sandboxCertificationRunId?: string;
}

export interface PersistedTelemetryEvent {
  readonly id: string;
  readonly kind: "log" | "span";
  readonly name: string;
  readonly severity: TelemetrySeverity;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly sandboxCertificationRunId?: string;
  readonly occurredAt: string;
  readonly finishedAt?: string;
  readonly durationMs?: number;
  readonly message?: string;
  readonly attributes: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PersistedMetricSample {
  readonly id: string;
  readonly name: string;
  readonly type: MetricType;
  readonly value: number;
  readonly labels: Record<string, string>;
  readonly traceId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly taskRunId?: string;
  readonly automationCycleId?: string;
  readonly sandboxCertificationRunId?: string;
  readonly recordedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DurableTelemetrySink {
  readonly telemetryEvents: {
    save(entity: PersistedTelemetryEvent): Promise<PersistedTelemetryEvent>;
  };
  readonly metricSamples: {
    save(entity: PersistedMetricSample): Promise<PersistedMetricSample>;
  };
}

export type TelemetryEntityRefs = DurableTelemetryRefs;

export interface ObservabilityMetricWrite {
  readonly metric: MetricSnapshot;
  readonly observedValue?: number;
  readonly context: TelemetryContext;
  readonly refs?: TelemetryEntityRefs;
  readonly recordedAt?: string;
}

export interface ObservabilitySinkCapabilities {
  readonly eventsDurable: boolean;
  readonly metricsDurable: boolean;
}

export interface ObservabilitySink {
  readonly capabilities: ObservabilitySinkCapabilities;
  appendEvent(event: TelemetryEvent, options?: { readonly refs?: TelemetryEntityRefs }): Promise<void> | void;
  appendMetric(input: ObservabilityMetricWrite): Promise<void> | void;
}

const cloneLabels = (labels?: Readonly<Record<string, string>>): Readonly<Record<string, string>> => ({ ...(labels ?? {}) });

const cloneRecord = <T extends Record<string, unknown>>(value?: T): Readonly<T> => ({ ...(value ?? ({} as T)) });

const metricKey = (name: string, type: MetricType): string => `${type}:${name}`;

const cloneRefs = (refs?: TelemetryEntityRefs): TelemetryEntityRefs => ({
  ...(refs?.taskId ? { taskId: refs.taskId } : {}),
  ...(refs?.taskRunId ? { taskRunId: refs.taskRunId } : {}),
  ...(refs?.automationCycleId ? { automationCycleId: refs.automationCycleId } : {}),
  ...(refs?.sandboxCertificationRunId ? { sandboxCertificationRunId: refs.sandboxCertificationRunId } : {}),
});

const mergeRefs = (base?: TelemetryEntityRefs, override?: TelemetryEntityRefs): TelemetryEntityRefs => ({
  ...cloneRefs(base),
  ...cloneRefs(override),
});

const mergeContext = (base: TelemetryContext, override?: Partial<TelemetryContext>): TelemetryContext =>
  createTelemetryContext({
    ...base,
    ...(override ?? {}),
    labels: {
      ...base.labels,
      ...(override?.labels ?? {}),
    },
  });

const pruneUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, candidate]) => candidate !== undefined)) as T;

export const createTelemetryContext = (input?: Partial<TelemetryContext>): TelemetryContext => ({
  correlationId: input?.correlationId ?? randomUUID(),
  labels: cloneLabels(input?.labels),
  ...(input?.spanId ? { spanId: input.spanId } : {}),
  traceId: input?.traceId ?? randomUUID(),
  ...(input?.workspace ? { workspace: input.workspace } : {}),
});

export const withTelemetryLabels = (
  context: TelemetryContext,
  labels: Readonly<Record<string, string>>,
): TelemetryContext => ({
  ...context,
  labels: {
    ...context.labels,
    ...labels,
  },
});

export const createLogEvent = (input: {
  readonly message: string;
  readonly severity?: TelemetrySeverity;
  readonly context?: Partial<TelemetryContext>;
  readonly data?: Record<string, unknown>;
  readonly timestamp?: string;
}): LogEvent => ({
  context: createTelemetryContext(input.context),
  data: cloneRecord(input.data),
  id: randomUUID(),
  kind: "log",
  message: input.message,
  severity: input.severity ?? "info",
  timestamp: input.timestamp ?? new Date().toISOString(),
});

export const startSpan = (input: {
  readonly name: string;
  readonly context?: Partial<TelemetryContext>;
  readonly attributes?: Record<string, string | number | boolean>;
  readonly startedAt?: string;
}): Omit<SpanEvent, "durationMs" | "endedAt" | "status"> & { readonly attributes: Readonly<Record<string, string | number | boolean>> } => {
  const context = createTelemetryContext(input.context);
  return {
    attributes: { ...(input.attributes ?? {}) },
    correlationId: context.correlationId,
    id: randomUUID(),
    kind: "span",
    name: input.name,
    ...(context.spanId ? { parentSpanId: context.spanId } : {}),
    spanId: randomUUID(),
    startedAt: input.startedAt ?? new Date().toISOString(),
    traceId: context.traceId,
  };
};

export const finishSpan = (
  span: ReturnType<typeof startSpan>,
  input?: {
    readonly endedAt?: string;
    readonly status?: "ok" | "error";
    readonly attributes?: Record<string, string | number | boolean>;
  },
): SpanEvent => {
  const endedAt = input?.endedAt ?? new Date().toISOString();
  return {
    ...span,
    attributes: {
      ...span.attributes,
      ...(input?.attributes ?? {}),
    },
    durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(span.startedAt)),
    endedAt,
    status: input?.status ?? "ok",
  };
};

export class InMemoryEventLog {
  private readonly events: TelemetryEvent[] = [];

  append<TEvent extends TelemetryEvent>(event: TEvent): TEvent {
    this.events.push(structuredClone(event));
    return structuredClone(event);
  }

  list(): readonly TelemetryEvent[] {
    return this.events.map((event) => structuredClone(event));
  }

  listByTrace(traceId: string): readonly TelemetryEvent[] {
    return this.events.filter((event) => event.kind === "span" ? event.traceId === traceId : event.context.traceId === traceId)
      .map((event) => structuredClone(event));
  }

  snapshot() {
    const logs = this.events.filter((event): event is LogEvent => event.kind === "log");
    const spans = this.events.filter((event): event is SpanEvent => event.kind === "span");

    return {
      errorCount: logs.filter((event) => event.severity === "error").length,
      logCount: logs.length,
      spanCount: spans.length,
      traces: new Set(this.events.map((event) => event.kind === "span" ? event.traceId : event.context.traceId)).size,
    } as const;
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();

  increment(name: string, value = 1): number {
    const next = (this.counters.get(name) ?? 0) + value;
    this.counters.set(name, next);
    return next;
  }

  setGauge(name: string, value: number): number {
    this.gauges.set(name, value);
    return value;
  }

  recordHistogram(name: string, value: number): number {
    const current = this.histograms.get(name) ?? [];
    current.push(value);
    this.histograms.set(name, current);
    return current.length;
  }

  getMetric(name: string, type: MetricType): MetricSnapshot | null {
    return this.snapshot().find((metric) => metric.name === name && metric.type === type) ?? null;
  }

  snapshot(): readonly MetricSnapshot[] {
    const counters: CounterMetric[] = [...this.counters.entries()].map(([name, value]) => ({ name, type: "counter", value }));
    const gauges: GaugeMetric[] = [...this.gauges.entries()].map(([name, value]) => ({ name, type: "gauge", value }));
    const histograms: HistogramMetric[] = [...this.histograms.entries()].map(([name, values]) => {
      const sum = values.reduce((total, current) => total + current, 0);
      return {
        average: values.length === 0 ? 0 : sum / values.length,
        count: values.length,
        max: Math.max(...values),
        min: Math.min(...values),
        name,
        sum,
        type: "histogram",
      };
    });

    return [...counters, ...gauges, ...histograms].sort((left, right) => metricKey(left.name, left.type).localeCompare(metricKey(right.name, right.type)));
  }
}

const telemetryEventName = (event: TelemetryEvent): string =>
  event.kind === "span" ? event.name : "log";

const telemetryEventSeverity = (event: TelemetryEvent): TelemetrySeverity =>
  event.kind === "span" ? (event.status === "error" ? "error" : "info") : event.severity;

const telemetryEventOccurredAt = (event: TelemetryEvent): string =>
  event.kind === "span" ? event.startedAt : event.timestamp;

const telemetryEventFinishedAt = (event: TelemetryEvent): string | undefined =>
  event.kind === "span" ? event.endedAt : undefined;

const telemetryEventDurationMs = (event: TelemetryEvent): number | undefined =>
  event.kind === "span" ? event.durationMs : undefined;

const telemetryEventMessage = (event: TelemetryEvent): string =>
  event.kind === "span" ? event.name : event.message;

const telemetryEventAttributes = (event: TelemetryEvent): Record<string, unknown> =>
  event.kind === "span"
    ? {
        attributes: event.attributes,
        correlationId: event.correlationId,
        parentSpanId: event.parentSpanId ?? null,
        spanId: event.spanId,
        status: event.status,
      }
    : {
        context: event.context,
        data: event.data,
      };

export const persistTelemetryEvent = async (input: {
  readonly sink: DurableTelemetrySink;
  readonly event: TelemetryEvent;
  readonly refs?: DurableTelemetryRefs;
}): Promise<PersistedTelemetryEvent> => {
  const occurredAt = telemetryEventOccurredAt(input.event);
  const finishedAt = telemetryEventFinishedAt(input.event);
  const durationMs = telemetryEventDurationMs(input.event);

  return input.sink.telemetryEvents.save({
    id: input.event.id,
    kind: input.event.kind,
    name: telemetryEventName(input.event),
    severity: telemetryEventSeverity(input.event),
    traceId: input.event.kind === "span" ? input.event.traceId : input.event.context.traceId,
    correlationId: input.event.kind === "span" ? input.event.correlationId : input.event.context.correlationId,
    ...(input.refs?.taskId ? { taskId: input.refs.taskId } : {}),
    ...(input.refs?.taskRunId ? { taskRunId: input.refs.taskRunId } : {}),
    ...(input.refs?.automationCycleId ? { automationCycleId: input.refs.automationCycleId } : {}),
    ...(input.refs?.sandboxCertificationRunId
      ? { sandboxCertificationRunId: input.refs.sandboxCertificationRunId }
      : {}),
    occurredAt,
    ...(finishedAt ? { finishedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    message: telemetryEventMessage(input.event),
    attributes: telemetryEventAttributes(input.event),
    createdAt: occurredAt,
    updatedAt: finishedAt ?? occurredAt,
  });
};

const metricSampleValue = (metric: MetricSnapshot): number =>
  metric.type === "histogram" ? metric.average : metric.value;

export const persistMetricSnapshot = async (input: {
  readonly sink: DurableTelemetrySink;
  readonly metric: MetricSnapshot;
  readonly refs?: DurableTelemetryRefs;
  readonly recordedAt?: string;
  readonly observedValue?: number;
  readonly context?: TelemetryContext;
}): Promise<PersistedMetricSample> => {
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const labels = input.context
    ? {
        ...input.context.labels,
        ...(input.context.workspace ? { workspace: input.context.workspace } : {}),
      }
    : {};

  return input.sink.metricSamples.save({
    id: randomUUID(),
    name: input.metric.name,
    type: input.metric.type,
    value: input.observedValue ?? metricSampleValue(input.metric),
    labels,
    ...(input.context?.traceId ? { traceId: input.context.traceId } : {}),
    ...(input.context?.correlationId ? { correlationId: input.context.correlationId } : {}),
    ...(input.refs?.taskId ? { taskId: input.refs.taskId } : {}),
    ...(input.refs?.taskRunId ? { taskRunId: input.refs.taskRunId } : {}),
    ...(input.refs?.automationCycleId ? { automationCycleId: input.refs.automationCycleId } : {}),
    ...(input.refs?.sandboxCertificationRunId
      ? { sandboxCertificationRunId: input.refs.sandboxCertificationRunId }
      : {}),
    recordedAt,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  });
};

type PrismaCreateDelegate<TRecord> = {
  create(args: { readonly data: Record<string, unknown> }): Promise<TRecord>;
};

const asPrismaCreateDelegate = <TRecord>(value: unknown): PrismaCreateDelegate<TRecord> | null => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("create" in value) ||
    typeof (value as { readonly create?: unknown }).create !== "function"
  ) {
    return null;
  }

  return value as PrismaCreateDelegate<TRecord>;
};

export const createNoopObservabilitySink = (): ObservabilitySink => ({
  capabilities: {
    eventsDurable: false,
    metricsDurable: false,
  },
  appendEvent() {},
  appendMetric() {},
});

export const createPrismaDurableObservabilitySink = (
  delegateHost: unknown,
): ObservabilitySink => {
  const candidate = typeof delegateHost === "object" && delegateHost !== null
    ? (delegateHost as Record<string, unknown>)
    : {};
  const telemetryDelegate = asPrismaCreateDelegate<PersistedTelemetryEvent>(candidate.operationalTelemetryEvent);
  const metricDelegate = asPrismaCreateDelegate<PersistedMetricSample>(candidate.operationalMetricSample);

  const sink: DurableTelemetrySink = {
    telemetryEvents: {
      async save(entity) {
        if (!telemetryDelegate) {
          return entity;
        }

        await telemetryDelegate.create({
          data: pruneUndefined({
            ...entity,
            attributes: entity.attributes,
          }),
        });
        return entity;
      },
    },
    metricSamples: {
      async save(entity) {
        if (!metricDelegate) {
          return entity;
        }

        await metricDelegate.create({
          data: pruneUndefined({
            ...entity,
            labels: entity.labels,
          }),
        });
        return entity;
      },
    },
  };

  return {
    capabilities: {
      eventsDurable: telemetryDelegate !== null,
      metricsDurable: metricDelegate !== null,
    },
    appendEvent(event, options) {
      if (!telemetryDelegate) {
        return;
      }

      return persistTelemetryEvent({
        sink,
        event,
        ...(options?.refs ? { refs: options.refs } : {}),
      }).then(() => undefined);
    },
    appendMetric(input) {
      if (!metricDelegate) {
        return;
      }

      return persistMetricSnapshot({
        sink,
        metric: input.metric,
        context: input.context,
        ...(input.refs ? { refs: input.refs } : {}),
        ...(input.recordedAt ? { recordedAt: input.recordedAt } : {}),
        ...(input.observedValue !== undefined ? { observedValue: input.observedValue } : {}),
      }).then(() => undefined);
    },
  };
};

export const createObservabilityKit = (input?: {
  readonly context?: Partial<TelemetryContext>;
  readonly refs?: TelemetryEntityRefs;
  readonly sink?: ObservabilitySink;
}) => {
  const eventLog = new InMemoryEventLog();
  const metrics = new MetricsRegistry();
  const baseContext = createTelemetryContext(input?.context);
  const baseRefs = cloneRefs(input?.refs);
  const sink = input?.sink;
  const pendingWrites = new Set<Promise<void>>();
  const writeFailures: string[] = [];

  const trackWrite = (candidate: Promise<void> | void) => {
    if (!candidate || typeof (candidate as Promise<void>).then !== "function") {
      return;
    }

    let tracked: Promise<void>;
    tracked = Promise.resolve(candidate)
      .catch((error) => {
        writeFailures.push(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        pendingWrites.delete(tracked);
      });
    pendingWrites.add(tracked);
  };

  const appendEvent = (event: TelemetryEvent, refs?: TelemetryEntityRefs) => {
    eventLog.append(event);
    if (!sink) {
      return;
    }

    trackWrite(sink.appendEvent(event, { refs: mergeRefs(baseRefs, refs) }));
  };

  const recordMetric = (
    metric: MetricSnapshot,
    observedValue: number,
    options?: {
      readonly context?: Partial<TelemetryContext>;
      readonly refs?: TelemetryEntityRefs;
      readonly recordedAt?: string;
    },
  ) => {
    if (!sink) {
      return;
    }

    trackWrite(
      sink.appendMetric({
        metric,
        observedValue,
        context: mergeContext(baseContext, options?.context),
        refs: mergeRefs(baseRefs, options?.refs),
        ...(options?.recordedAt ? { recordedAt: options.recordedAt } : {}),
      }),
    );
  };

  return {
    eventLog,
    metrics,
    sinkCapabilities: sink?.capabilities ?? createNoopObservabilitySink().capabilities,
    context(): TelemetryContext {
      return createTelemetryContext(baseContext);
    },
    failures(): readonly string[] {
      return [...writeFailures];
    },
    async flush(): Promise<void> {
      while (pendingWrites.size > 0) {
        await Promise.all([...pendingWrites]);
      }
    },
    log(
      message: string,
      options?: Omit<Parameters<typeof createLogEvent>[0], "message"> & { readonly refs?: TelemetryEntityRefs },
    ) {
      const event = createLogEvent({
        ...options,
        context: mergeContext(baseContext, options?.context),
        message,
      });
      appendEvent(event, options?.refs);
      const counterValue = metrics.increment(`logs.${event.severity}`);
      recordMetric(
        {
          name: `logs.${event.severity}`,
          type: "counter",
          value: counterValue,
        },
        counterValue,
        {
          context: event.context,
          ...(options?.refs ? { refs: options.refs } : {}),
          recordedAt: event.timestamp,
        },
      );
      return event;
    },
    incrementCounter(
      name: string,
      value = 1,
      options?: {
        readonly context?: Partial<TelemetryContext>;
        readonly refs?: TelemetryEntityRefs;
        readonly recordedAt?: string;
      },
    ): number {
      const next = metrics.increment(name, value);
      recordMetric(
        {
          name,
          type: "counter",
          value: next,
        },
        next,
        options,
      );
      return next;
    },
    setGauge(
      name: string,
      value: number,
      options?: {
        readonly context?: Partial<TelemetryContext>;
        readonly refs?: TelemetryEntityRefs;
        readonly recordedAt?: string;
      },
    ): number {
      const next = metrics.setGauge(name, value);
      recordMetric(
        {
          name,
          type: "gauge",
          value: next,
        },
        value,
        options,
      );
      return next;
    },
    recordHistogram(
      name: string,
      value: number,
      options?: {
        readonly context?: Partial<TelemetryContext>;
        readonly refs?: TelemetryEntityRefs;
        readonly recordedAt?: string;
      },
    ): MetricSnapshot | null {
      metrics.recordHistogram(name, value);
      const metric = metrics.getMetric(name, "histogram");
      if (metric) {
        recordMetric(metric, value, options);
      }
      return metric;
    },
    runSpan<T>(
      name: string,
      fn: (span: ReturnType<typeof startSpan>) => T,
      options?: Omit<Parameters<typeof startSpan>[0], "name"> & { readonly refs?: TelemetryEntityRefs },
    ): T {
      const span = startSpan({
        ...options,
        context: mergeContext(baseContext, options?.context),
        name,
      });

      try {
        const result = fn(span);
        appendEvent(finishSpan(span), options?.refs);
        const counterValue = metrics.increment("spans.completed");
        recordMetric(
          {
            name: "spans.completed",
            type: "counter",
            value: counterValue,
          },
          counterValue,
          {
            context: {
              correlationId: span.correlationId,
              labels: {},
              spanId: span.spanId,
              traceId: span.traceId,
            },
            ...(options?.refs ? { refs: options.refs } : {}),
          },
        );
        return result;
      } catch (error) {
        appendEvent(
          finishSpan(span, {
            attributes: { error: error instanceof Error ? error.message : String(error) },
            status: "error",
          }),
          options?.refs,
        );
        const counterValue = metrics.increment("spans.failed");
        recordMetric(
          {
            name: "spans.failed",
            type: "counter",
            value: counterValue,
          },
          counterValue,
          {
            context: {
              correlationId: span.correlationId,
              labels: {},
              spanId: span.spanId,
              traceId: span.traceId,
            },
            ...(options?.refs ? { refs: options.refs } : {}),
          },
        );
        throw error;
      }
    },
    async runAsyncSpan<T>(
      name: string,
      fn: (span: ReturnType<typeof startSpan>) => Promise<T>,
      options?: Omit<Parameters<typeof startSpan>[0], "name"> & { readonly refs?: TelemetryEntityRefs },
    ): Promise<T> {
      const span = startSpan({
        ...options,
        context: mergeContext(baseContext, options?.context),
        name,
      });

      try {
        const result = await fn(span);
        appendEvent(finishSpan(span), options?.refs);
        const counterValue = metrics.increment("spans.completed");
        recordMetric(
          {
            name: "spans.completed",
            type: "counter",
            value: counterValue,
          },
          counterValue,
          {
            context: {
              correlationId: span.correlationId,
              labels: {},
              spanId: span.spanId,
              traceId: span.traceId,
            },
            ...(options?.refs ? { refs: options.refs } : {}),
          },
        );
        return result;
      } catch (error) {
        appendEvent(
          finishSpan(span, {
            attributes: { error: error instanceof Error ? error.message : String(error) },
            status: "error",
          }),
          options?.refs,
        );
        const counterValue = metrics.increment("spans.failed");
        recordMetric(
          {
            name: "spans.failed",
            type: "counter",
            value: counterValue,
          },
          counterValue,
          {
            context: {
              correlationId: span.correlationId,
              labels: {},
              spanId: span.spanId,
              traceId: span.traceId,
            },
            ...(options?.refs ? { refs: options.refs } : {}),
          },
        );
        throw error;
      }
    },
  };
};

export interface ObservabilityRawBatchInput {
  readonly id: string;
  readonly endpointFamily: string;
  readonly providerCode: string;
  readonly extractionStatus: string;
  readonly extractionTime: string;
  readonly recordCount: number;
}

export interface ObservabilityOddsSnapshotInput {
  readonly id: string;
  readonly marketKey: string;
  readonly capturedAt: string;
  readonly selectionCount: number;
}

export interface ObservabilityHealthCheckInput {
  readonly name: string;
  readonly status: "pass" | "warn";
  readonly detail: string;
}

export interface ObservabilityHealthInput {
  readonly status: "ok" | "degraded";
  readonly checks: readonly ObservabilityHealthCheckInput[];
}

export interface WorkerMetricReadModel {
  readonly worker: string;
  readonly taskKinds: readonly string[];
  readonly totalRuns: number;
  readonly runningRuns: number;
  readonly failedRuns: number;
  readonly succeededRuns: number;
  readonly cancelledRuns: number;
  readonly latestRunAt?: string;
}

export interface ProviderMetricReadModel {
  readonly provider: string;
  readonly aiRunCount: number;
  readonly failedAiRunCount: number;
  readonly rawBatchCount: number;
  readonly latestActivityAt?: string;
  readonly latestError?: string;
}

export interface RetryPressureSummary {
  readonly queuedWithRetryHistory: number;
  readonly retryingNow: number;
  readonly failed: number;
  readonly quarantined: number;
  readonly exhausted: number;
}

export interface BackfillNeedReadModel {
  readonly area: "fixtures" | "odds" | "validation";
  readonly status: "ok" | "needed";
  readonly detail: string;
}

export interface TraceabilityCoverageSummary {
  readonly tasksWithTraceId: number;
  readonly tasksWithoutTraceId: number;
  readonly taskTraceCoverageRate: number;
  readonly aiRunsWithProviderRequestId: number;
  readonly aiRunsWithoutProviderRequestId: number;
  readonly aiRunRequestCoverageRate: number;
}

export interface OperationalObservabilitySummary {
  readonly generatedAt: string;
  readonly workers: readonly WorkerMetricReadModel[];
  readonly providers: readonly ProviderMetricReadModel[];
  readonly retries: RetryPressureSummary;
  readonly backfills: readonly BackfillNeedReadModel[];
  readonly traceability: TraceabilityCoverageSummary;
  readonly alerts: readonly string[];
}

interface ObservabilityTaskInput {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly payload: Record<string, unknown>;
  readonly attempts: readonly { readonly startedAt: string; readonly finishedAt?: string }[];
  readonly maxAttempts: number;
}

interface ObservabilityTaskRunEntity {
  readonly id: string;
  readonly taskId: string;
  readonly status: string;
  readonly workerName?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

interface ObservabilityAiRunEntity {
  readonly provider: string;
  readonly status: string;
  readonly providerRequestId?: string;
  readonly error?: string;
  readonly updatedAt: string;
}

const safeIsoMax = (...values: readonly (string | undefined)[]): string | undefined => {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort((left, right) => right.localeCompare(left))[0];
};

const asTaskPayload = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const calculateCoverageRate = (covered: number, total: number): number =>
  total === 0 ? 1 : Number((covered / total).toFixed(4));

export const createOperationalObservabilitySummary = (input: {
  readonly generatedAt: string;
  readonly tasks: readonly ObservabilityTaskInput[];
  readonly taskRuns: readonly ObservabilityTaskRunEntity[];
  readonly aiRuns: readonly ObservabilityAiRunEntity[];
  readonly rawBatches: readonly ObservabilityRawBatchInput[];
  readonly oddsSnapshots: readonly ObservabilityOddsSnapshotInput[];
  readonly health: ObservabilityHealthInput;
}): OperationalObservabilitySummary => {
  const tasksById = new Map(input.tasks.map((task) => [task.id, task] as const));

  const workers = [...input.taskRuns.reduce<Map<string, WorkerMetricReadModel>>((map, taskRun) => {
    const worker = taskRun.workerName ?? tasksById.get(taskRun.taskId)?.kind ?? "unknown";
    const current = map.get(worker) ?? {
      worker,
      taskKinds: [],
      totalRuns: 0,
      runningRuns: 0,
      failedRuns: 0,
      succeededRuns: 0,
      cancelledRuns: 0,
    };
    const taskKind = tasksById.get(taskRun.taskId)?.kind ?? "unknown";
    const latestRunAt = safeIsoMax(current.latestRunAt, taskRun.finishedAt, taskRun.startedAt);
    const next: WorkerMetricReadModel = {
      ...current,
      taskKinds: [...new Set([...current.taskKinds, taskKind])],
      totalRuns: current.totalRuns + 1,
      runningRuns: current.runningRuns + (taskRun.status === "running" ? 1 : 0),
      failedRuns: current.failedRuns + (taskRun.status === "failed" ? 1 : 0),
      succeededRuns: current.succeededRuns + (taskRun.status === "succeeded" ? 1 : 0),
      cancelledRuns: current.cancelledRuns + (taskRun.status === "cancelled" ? 1 : 0),
      ...(latestRunAt ? { latestRunAt } : {}),
    };
    map.set(worker, next);
    return map;
  }, new Map()).values()].sort((left, right) => left.worker.localeCompare(right.worker));

  const providers = [
    ...new Set([...input.aiRuns.map((aiRun) => aiRun.provider), ...input.rawBatches.map((batch) => batch.providerCode)]),
  ]
    .sort((left, right) => left.localeCompare(right))
    .map<ProviderMetricReadModel>((provider) => {
      const aiRuns = input.aiRuns.filter((aiRun) => aiRun.provider === provider);
      const rawBatches = input.rawBatches.filter((batch) => batch.providerCode === provider);
      const latestFailedAiRun = aiRuns
        .filter((aiRun) => aiRun.status === "failed" && aiRun.error)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      const latestActivityAt = safeIsoMax(
        ...aiRuns.map((aiRun) => aiRun.updatedAt),
        ...rawBatches.map((batch) => batch.extractionTime),
      );
      return {
        provider,
        aiRunCount: aiRuns.length,
        failedAiRunCount: aiRuns.filter((aiRun) => aiRun.status === "failed").length,
        rawBatchCount: rawBatches.length,
        ...(latestActivityAt ? { latestActivityAt } : {}),
        ...(latestFailedAiRun?.error ? { latestError: latestFailedAiRun.error } : {}),
      };
    });

  const retries: RetryPressureSummary = {
    queuedWithRetryHistory: input.tasks.filter((task) => task.status === "queued" && task.attempts.length > 0).length,
    retryingNow: input.tasks.filter((task) => task.status === "running" && task.attempts.length > 1).length,
    failed: input.tasks.filter((task) => task.status === "failed").length,
    quarantined: input.tasks.filter((task) => task.status === "quarantined").length,
    exhausted: input.tasks.filter(
      (task) => (task.status === "failed" || task.status === "quarantined") && task.attempts.length >= task.maxAttempts,
    ).length,
  };

  const backfills: BackfillNeedReadModel[] = [
    {
      area: "fixtures",
      status: input.health.checks.some((check) => check.name === "live-fixtures-freshness" && check.status === "warn")
        ? "needed"
        : "ok",
      detail:
        input.health.checks.find((check) => check.name === "live-fixtures-freshness")?.detail ??
        "No fixture freshness signal available",
    },
    {
      area: "odds",
      status: input.health.checks.some((check) => check.name === "live-odds-freshness" && check.status === "warn")
        ? "needed"
        : "ok",
      detail:
        input.health.checks.find((check) => check.name === "live-odds-freshness")?.detail ??
        "No odds freshness signal available",
    },
    {
      area: "validation",
      status: input.health.checks.some((check) => check.name === "validations" && check.status === "warn")
        ? "needed"
        : "ok",
      detail:
        input.health.checks.find((check) => check.name === "validations")?.detail ??
        "No validation signal available",
    },
  ];

  const tasksWithTraceId = input.tasks.filter((task) => {
    const payload = asTaskPayload(task.payload);
    return typeof payload.traceId === "string" && payload.traceId.length > 0;
  }).length;
  const aiRunsWithProviderRequestId = input.aiRuns.filter(
    (aiRun) => typeof aiRun.providerRequestId === "string" && aiRun.providerRequestId.length > 0,
  ).length;
  const traceability: TraceabilityCoverageSummary = {
    tasksWithTraceId,
    tasksWithoutTraceId: Math.max(input.tasks.length - tasksWithTraceId, 0),
    taskTraceCoverageRate: calculateCoverageRate(tasksWithTraceId, input.tasks.length),
    aiRunsWithProviderRequestId,
    aiRunsWithoutProviderRequestId: Math.max(input.aiRuns.length - aiRunsWithProviderRequestId, 0),
    aiRunRequestCoverageRate: calculateCoverageRate(aiRunsWithProviderRequestId, input.aiRuns.length),
  };

  const alerts = [
    ...backfills
      .filter((backfill) => backfill.status === "needed")
      .map((backfill) => `backfill ${backfill.area}: ${backfill.detail}`),
    ...(retries.exhausted > 0 ? [`retry pressure: ${retries.exhausted} exhausted task(s)`] : []),
    ...(retries.quarantined > 0 ? [`retry pressure: ${retries.quarantined} quarantined task(s)`] : []),
    ...providers
      .filter((provider) => provider.failedAiRunCount > 0)
      .map((provider) => `${provider.provider}: ${provider.failedAiRunCount} failed ai run(s)`),
    ...(traceability.taskTraceCoverageRate < 0.8
      ? [`traceability: only ${Math.round(traceability.taskTraceCoverageRate * 100)}% of tasks carry traceId`]
      : []),
  ];

  return {
    generatedAt: input.generatedAt,
    workers,
    providers,
    retries,
    backfills,
    traceability,
    alerts,
  };
};
