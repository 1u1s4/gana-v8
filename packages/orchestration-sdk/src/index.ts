import { createHash } from "node:crypto";

export type OrchestrationTaskKind =
  | "fixture-ingestion"
  | "odds-ingestion"
  | "research"
  | "prediction"
  | "validation"
  | "sandbox-replay";

export const workspaceInfo = {
  packageName: "@gana-v8/orchestration-sdk",
  workspaceName: "orchestration-sdk",
  category: "package",
  description: "Shared orchestration contract helpers for control-plane to worker communication.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export type WorkflowIntent =
  | "ingest-fixtures"
  | "ingest-odds"
  | "hydrate-fixture-context"
  | "research-fixture"
  | "score-predictions"
  | "publish-card";

export type QueueDispatchStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface WorkflowBudgetPolicy {
  readonly maxAttempts: number;
  readonly maxRuntimeMs: number;
  readonly maxCredits: number;
}

export interface WorkflowBudgetSnapshot {
  readonly attemptsUsed: number;
  readonly creditsUsed: number;
  readonly runtimeMsUsed: number;
}

export interface BudgetDecision {
  readonly accepted: boolean;
  readonly reasons: readonly string[];
  readonly remaining: WorkflowBudgetSnapshot;
}

export interface TaskEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly workflowId: string;
  readonly traceId: string;
  readonly intent: WorkflowIntent;
  readonly taskKind: OrchestrationTaskKind;
  readonly dedupeKey: string;
  readonly payload: TPayload;
  readonly scheduledFor: string;
  readonly priority: number;
  readonly createdAt: string;
  readonly policy: WorkflowBudgetPolicy;
  readonly metadata: {
    readonly source: string;
    readonly labels: readonly string[];
    readonly correlationId?: string;
  };
}

export interface WorkflowPlan<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly workflowId: string;
  readonly traceId: string;
  readonly intent: WorkflowIntent;
  readonly envelopes: readonly TaskEnvelope<TPayload>[];
}

export interface QueueReservation<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly envelope: TaskEnvelope<TPayload>;
  readonly dequeuedAt: string;
}

export interface TaskExecutionResult<TResult = unknown> {
  readonly status: Extract<QueueDispatchStatus, "succeeded" | "failed" | "cancelled">;
  readonly finishedAt: string;
  readonly output?: TResult;
  readonly error?: string;
  readonly errorDetails?: Record<string, unknown>;
  readonly budgetSnapshot?: WorkflowBudgetSnapshot;
}

export interface InMemoryQueueStats {
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
}

export interface InMemoryQueueAdapter {
  enqueue<TPayload extends Record<string, unknown>>(envelope: TaskEnvelope<TPayload>): void;
  dequeue(now?: Date): QueueReservation | null;
  complete(taskId: string, result: TaskExecutionResult): void;
  peek(): readonly TaskEnvelope[];
  results(): ReadonlyMap<string, TaskExecutionResult>;
  stats(): InMemoryQueueStats;
}

export interface SchedulerTick {
  readonly triggeredAt: string;
  readonly dueJobCount: number;
  readonly enqueuedTaskIds: readonly string[];
}

export interface CronWorkflowSpec<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly description: string;
  readonly cron: string;
  readonly intent: WorkflowIntent;
  readonly taskKind: OrchestrationTaskKind;
  readonly priority: number;
  readonly source: string;
  readonly labels?: readonly string[];
  readonly createPayload: (scheduledFor: string) => TPayload;
  readonly budgetPolicy?: Partial<WorkflowBudgetPolicy>;
}

export interface SchedulerJobState {
  readonly lastTriggeredAt?: string;
}

export interface WorkflowJobHandler<TPayload extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> {
  readonly intent: WorkflowIntent;
  handle(envelope: TaskEnvelope<TPayload>): Promise<TResult>;
}

export interface WorkflowRouter {
  dispatch(envelope: TaskEnvelope): Promise<TaskExecutionResult>;
  intents(): readonly WorkflowIntent[];
}

export const DEFAULT_WORKFLOW_BUDGET: WorkflowBudgetPolicy = {
  maxAttempts: 3,
  maxCredits: 100,
  maxRuntimeMs: 15 * 60 * 1000,
};

const scoreEnvelope = (envelope: TaskEnvelope): number => {
  const scheduledAt = Date.parse(envelope.scheduledFor);
  return scheduledAt * -1 + envelope.priority;
};

const clone = <T>(value: T): T => structuredClone(value);

const computeTaskId = (seed: string): string => {
  const digest = createHash("sha256").update(seed).digest("hex");
  return `tsk_${digest.slice(0, 16)}`;
};

const normalizeBudgetPolicy = (
  policy?: Partial<WorkflowBudgetPolicy>,
): WorkflowBudgetPolicy => ({
  maxAttempts: policy?.maxAttempts ?? DEFAULT_WORKFLOW_BUDGET.maxAttempts,
  maxCredits: policy?.maxCredits ?? DEFAULT_WORKFLOW_BUDGET.maxCredits,
  maxRuntimeMs: policy?.maxRuntimeMs ?? DEFAULT_WORKFLOW_BUDGET.maxRuntimeMs,
});

export const createTaskEnvelope = <TPayload extends Record<string, unknown>>(
  input: {
    readonly workflowId: string;
    readonly traceId: string;
    readonly intent: WorkflowIntent;
    readonly taskKind: OrchestrationTaskKind;
    readonly payload: TPayload;
    readonly scheduledFor: string;
    readonly priority?: number;
    readonly createdAt?: string;
    readonly policy?: Partial<WorkflowBudgetPolicy>;
    readonly metadata: TaskEnvelope<TPayload>["metadata"];
  },
): TaskEnvelope<TPayload> => {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const dedupeKey = `${input.intent}:${input.taskKind}:${input.scheduledFor}:${JSON.stringify(input.payload)}`;

  return {
    createdAt,
    dedupeKey,
    id: computeTaskId(`${input.workflowId}:${dedupeKey}`),
    intent: input.intent,
    metadata: clone({
      ...input.metadata,
      labels: [...input.metadata.labels],
    }),
    payload: clone(input.payload),
    policy: normalizeBudgetPolicy(input.policy),
    priority: input.priority ?? 0,
    scheduledFor: input.scheduledFor,
    taskKind: input.taskKind,
    traceId: input.traceId,
    workflowId: input.workflowId,
  };
};

export const createWorkflowIntentPlan = <TPayload extends Record<string, unknown>>(
  input: {
    readonly workflowId: string;
    readonly traceId: string;
    readonly intent: WorkflowIntent;
    readonly tasks: readonly Omit<
      Parameters<typeof createTaskEnvelope<TPayload>>[0],
      "workflowId" | "traceId" | "intent"
    >[];
  },
): WorkflowPlan<TPayload> => ({
  envelopes: input.tasks.map((task) =>
    createTaskEnvelope({
      ...task,
      intent: input.intent,
      traceId: input.traceId,
      workflowId: input.workflowId,
    }),
  ),
  intent: input.intent,
  traceId: input.traceId,
  workflowId: input.workflowId,
});

export const evaluateBudget = (
  policy: WorkflowBudgetPolicy,
  snapshot: WorkflowBudgetSnapshot,
): BudgetDecision => {
  const reasons: string[] = [];

  if (snapshot.attemptsUsed > policy.maxAttempts) {
    reasons.push("max_attempts_exhausted");
  }

  if (snapshot.creditsUsed > policy.maxCredits) {
    reasons.push("max_credits_exhausted");
  }

  if (snapshot.runtimeMsUsed > policy.maxRuntimeMs) {
    reasons.push("max_runtime_exhausted");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    remaining: {
      attemptsUsed: Math.max(0, policy.maxAttempts - snapshot.attemptsUsed),
      creditsUsed: Math.max(0, policy.maxCredits - snapshot.creditsUsed),
      runtimeMsUsed: Math.max(0, policy.maxRuntimeMs - snapshot.runtimeMsUsed),
    },
  };
};

export const consumeBudget = (
  current: WorkflowBudgetSnapshot,
  input: Partial<WorkflowBudgetSnapshot>,
): WorkflowBudgetSnapshot => ({
  attemptsUsed: current.attemptsUsed + (input.attemptsUsed ?? 0),
  creditsUsed: current.creditsUsed + (input.creditsUsed ?? 0),
  runtimeMsUsed: current.runtimeMsUsed + (input.runtimeMsUsed ?? 0),
});

export class SimpleInMemoryQueue implements InMemoryQueueAdapter {
  private readonly queued = new Map<string, TaskEnvelope>();
  private readonly running = new Map<string, QueueReservation>();
  private readonly completedItems = new Map<string, TaskExecutionResult>();

  enqueue<TPayload extends Record<string, unknown>>(envelope: TaskEnvelope<TPayload>): void {
    this.queued.set(envelope.id, clone(envelope));
  }

  dequeue(now: Date = new Date()): QueueReservation | null {
    const ready = [...this.queued.values()]
      .filter((item) => Date.parse(item.scheduledFor) <= now.getTime())
      .sort((left, right) => scoreEnvelope(right) - scoreEnvelope(left));

    const envelope = ready.at(0);
    if (!envelope) {
      return null;
    }

    this.queued.delete(envelope.id);
    const reservation = {
      dequeuedAt: now.toISOString(),
      envelope: clone(envelope),
    } satisfies QueueReservation;
    this.running.set(envelope.id, reservation);
    return clone(reservation);
  }

  complete(taskId: string, result: TaskExecutionResult): void {
    this.running.delete(taskId);
    this.completedItems.set(taskId, clone(result));
  }

  peek(): readonly TaskEnvelope[] {
    return [...this.queued.values()].map((item) => clone(item));
  }

  results(): ReadonlyMap<string, TaskExecutionResult> {
    return new Map([...this.completedItems.entries()].map(([key, value]) => [key, clone(value)]));
  }

  stats(): InMemoryQueueStats {
    return {
      completed: this.completedItems.size,
      queued: this.queued.size,
      running: this.running.size,
    };
  }
}

export class SimpleCronScheduler {
  private readonly state = new Map<string, SchedulerJobState>();

  constructor(
    private readonly specs: readonly CronWorkflowSpec[],
    private readonly queue: InMemoryQueueAdapter,
  ) {}

  tick(now: Date = new Date()): SchedulerTick {
    const enqueuedTaskIds: string[] = [];
    const currentMinute = floorToMinute(now);

    for (const spec of this.specs) {
      const state = this.state.get(spec.id);
      if (!matchesCronSpec(spec.cron, currentMinute)) {
        continue;
      }

      if (state?.lastTriggeredAt === currentMinute.toISOString()) {
        continue;
      }

      const envelope = createTaskEnvelope({
        intent: spec.intent,
        metadata: {
          labels: [...(spec.labels ?? [])],
          source: spec.source,
        },
        payload: spec.createPayload(currentMinute.toISOString()),
        ...(spec.budgetPolicy ? { policy: spec.budgetPolicy } : {}),
        priority: spec.priority,
        scheduledFor: currentMinute.toISOString(),
        taskKind: spec.taskKind,
        traceId: `${spec.id}:${currentMinute.toISOString()}`,
        workflowId: spec.id,
      });

      this.queue.enqueue(envelope);
      this.state.set(spec.id, { lastTriggeredAt: currentMinute.toISOString() });
      enqueuedTaskIds.push(envelope.id);
    }

    return {
      dueJobCount: enqueuedTaskIds.length,
      enqueuedTaskIds,
      triggeredAt: now.toISOString(),
    };
  }

  snapshot(): ReadonlyMap<string, SchedulerJobState> {
    return new Map(this.state);
  }
}

export const buildExampleCronSpecs = (): readonly CronWorkflowSpec[] => [
  {
    budgetPolicy: { maxAttempts: 2, maxCredits: 20, maxRuntimeMs: 120_000 },
    createPayload: (scheduledFor) => ({
      league: "PL",
      window: buildCoverageWindow(scheduledFor, 24),
    }),
    cron: "0 */6 * * *",
    description: "Warm daily fixture windows every 6 hours.",
    id: "fixtures-daily-seed",
    intent: "ingest-fixtures",
    labels: ["demo", "fixtures"],
    priority: 50,
    source: "control-plane/cron",
    taskKind: "fixture-ingestion",
  },
  {
    budgetPolicy: { maxAttempts: 4, maxCredits: 40, maxRuntimeMs: 60_000 },
    createPayload: (scheduledFor) => ({
      marketKeys: ["h2h"],
      window: buildCoverageWindow(scheduledFor, 1),
    }),
    cron: "*/15 * * * *",
    description: "Refresh intraday h2h odds every 15 minutes.",
    id: "odds-intraday-poll",
    intent: "ingest-odds",
    labels: ["demo", "odds"],
    priority: 80,
    source: "control-plane/cron",
    taskKind: "odds-ingestion",
  },
];

export const createWorkflowRouter = (
  handlers: readonly WorkflowJobHandler[],
): WorkflowRouter => {
  const handlerMap = new Map(handlers.map((handler) => [handler.intent, handler]));
  const serializeErrorDetails = (error: unknown): Record<string, unknown> | undefined => {
    if (!error || typeof error !== "object") {
      return undefined;
    }

    const details = Object.entries(error as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        acc[key] = value;
        return acc;
      }
      if (Array.isArray(value) || (value && typeof value === "object")) {
        acc[key] = value;
      }
      return acc;
    }, {});

    return Object.keys(details).length > 0 ? details : undefined;
  };

  return {
    async dispatch(envelope: TaskEnvelope): Promise<TaskExecutionResult> {
      const startedAt = Date.now();
      const handler = handlerMap.get(envelope.intent);

      if (!handler) {
        return {
          error: `unhandled_intent:${envelope.intent}`,
          finishedAt: new Date().toISOString(),
          status: "failed",
        };
      }

      try {
        const output = await handler.handle(envelope);
        return {
          budgetSnapshot: {
            attemptsUsed: 1,
            creditsUsed: 1,
            runtimeMsUsed: Date.now() - startedAt,
          },
          finishedAt: new Date().toISOString(),
          output,
          status: "succeeded",
        };
      } catch (error) {
        const errorDetails = serializeErrorDetails(error);
        return {
          budgetSnapshot: {
            attemptsUsed: 1,
            creditsUsed: 1,
            runtimeMsUsed: Date.now() - startedAt,
          },
          ...(errorDetails ? { errorDetails } : {}),
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString(),
          status: "failed",
        };
      }
    },
    intents() {
      return [...handlerMap.keys()];
    },
  };
};

const buildCoverageWindow = (scheduledFor: string, durationHours: number) => {
  const start = new Date(scheduledFor);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

  return {
    end: end.toISOString(),
    granularity: durationHours > 1 ? "daily" : "intraday",
    start: start.toISOString(),
  } as const;
};

const floorToMinute = (date: Date): Date => new Date(Math.floor(date.getTime() / 60_000) * 60_000);

const parseCronField = (field: string, min: number, max: number): readonly number[] | null => {
  if (field === "*") {
    return null;
  }

  if (field.startsWith("*/")) {
    const step = Number(field.slice(2));
    const values: number[] = [];
    for (let current = min; current <= max; current += step) {
      values.push(current);
    }
    return values;
  }

  return field.split(",").map((value) => Number(value.trim()));
};

export const matchesCronSpec = (cron: string, date: Date): boolean => {
  const [minuteField, hourField, dayField, monthField, weekdayField] = cron.trim().split(/\s+/);
  if (!minuteField || !hourField || !dayField || !monthField || !weekdayField) {
    throw new Error(`Invalid cron expression: ${cron}`);
  }

  const matchField = (field: string, actual: number, min: number, max: number): boolean => {
    const values = parseCronField(field, min, max);
    return values === null ? true : values.includes(actual);
  };

  return (
    matchField(minuteField, date.getUTCMinutes(), 0, 59) &&
    matchField(hourField, date.getUTCHours(), 0, 23) &&
    matchField(dayField, date.getUTCDate(), 1, 31) &&
    matchField(monthField, date.getUTCMonth() + 1, 1, 12) &&
    matchField(weekdayField, date.getUTCDay(), 0, 6)
  );
};
