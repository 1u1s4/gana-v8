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

const cloneLabels = (labels?: Readonly<Record<string, string>>): Readonly<Record<string, string>> => ({ ...(labels ?? {}) });

const cloneRecord = <T extends Record<string, unknown>>(value?: T): Readonly<T> => ({ ...(value ?? ({} as T)) });

const metricKey = (name: string, type: MetricType): string => `${type}:${name}`;

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

export const createObservabilityKit = (input?: { readonly context?: Partial<TelemetryContext> }) => {
  const eventLog = new InMemoryEventLog();
  const metrics = new MetricsRegistry();
  const baseContext = createTelemetryContext(input?.context);

  return {
    eventLog,
    metrics,
    context(): TelemetryContext {
      return createTelemetryContext(baseContext);
    },
    log(message: string, options?: Omit<Parameters<typeof createLogEvent>[0], "message">) {
      const event = createLogEvent({
        ...options,
        context: {
          ...baseContext,
          ...(options?.context ?? {}),
          labels: {
            ...baseContext.labels,
            ...(options?.context?.labels ?? {}),
          },
        },
        message,
      });
      eventLog.append(event);
      metrics.increment(`logs.${event.severity}`);
      return event;
    },
    runSpan<T>(
      name: string,
      fn: (span: ReturnType<typeof startSpan>) => T,
      options?: Omit<Parameters<typeof startSpan>[0], "name">,
    ): T {
      const span = startSpan({
        ...options,
        context: {
          ...baseContext,
          ...(options?.context ?? {}),
          labels: {
            ...baseContext.labels,
            ...(options?.context?.labels ?? {}),
          },
        },
        name,
      });

      try {
        const result = fn(span);
        eventLog.append(finishSpan(span));
        metrics.increment("spans.completed");
        return result;
      } catch (error) {
        eventLog.append(
          finishSpan(span, {
            attributes: { error: error instanceof Error ? error.message : String(error) },
            status: "error",
          }),
        );
        metrics.increment("spans.failed");
        throw error;
      }
    },
  };
};
