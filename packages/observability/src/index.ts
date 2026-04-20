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
