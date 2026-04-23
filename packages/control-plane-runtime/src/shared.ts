import { randomUUID } from "node:crypto";

import {
  createAutomationCycle,
  type AutomationCycleEntity,
  type AutomationCycleKind,
  type AutomationCycleStageEntity,
} from "@gana-v8/domain-core";
import {
  createPrismaTaskQueueAdapter,
  type QueueTaskEntity,
  type QueueTaskSummary,
} from "@gana-v8/queue-adapters";
import {
  loadOperationSnapshotFromDatabase,
  type AutomationCycleReadModel,
} from "@gana-v8/public-api";
import {
  createPrismaUnitOfWork,
  createConnectedVerifiedPrismaClient,
  isRetryablePrismaConnectionError,
  type PrismaUnitOfWork,
} from "@gana-v8/storage-adapters";

export const workspaceInfo = {
  packageName: "@gana-v8/control-plane-runtime",
  workspaceName: "control-plane-runtime",
  category: "package",
  description: "Shared runtime helpers for persisted automation cycles and Hermes operational services.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/ingestion-worker", category: "workspace" },
    { name: "@gana-v8/orchestration-sdk", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/queue-adapters", category: "workspace" },
    { name: "@gana-v8/public-api", category: "workspace" },
    { name: "@gana-v8/research-worker", category: "workspace" },
    { name: "@gana-v8/sandbox-runner", category: "workspace" },
    { name: "@gana-v8/scoring-worker", category: "workspace" },
    { name: "@gana-v8/publisher-worker", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" },
    { name: "@gana-v8/validation-worker", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface RuntimeCycleResult {
  readonly cycle: AutomationCycleEntity;
  readonly readModel?: AutomationCycleReadModel | null;
}

export interface SchedulerCycleOptions {
  readonly fixtureIds?: readonly string[];
  readonly now?: Date;
  readonly leaseOwner?: string;
}

export interface DispatcherCycleOptions {
  readonly maxClaims?: number;
  readonly manifestId?: string;
  readonly now?: Date;
  readonly leaseOwner?: string;
}

export interface RecoveryCycleOptions {
  readonly now?: Date;
  readonly leaseOwner?: string;
  readonly redriveLimit?: number;
  readonly leaseRecoveryLimit?: number;
  readonly renewLeaseMs?: number;
}

export type QueueHealthStatus = "healthy" | "degraded" | "blocked";

export interface QueueHealthAssessment {
  readonly status: QueueHealthStatus;
  readonly reasons: readonly string[];
  readonly expiredLeaseTaskIds: readonly string[];
  readonly nearExpiryTaskIds: readonly string[];
}

export const defaultLeaseOwner = (kind: AutomationCycleKind): string =>
  `${kind}:${process.pid}`;

export const toIso = (value: Date): string => value.toISOString();

export const DEFAULT_RECOVERY_NEAR_EXPIRY_MS = 60 * 1000;
export const DEFAULT_RECOVERY_RENEW_LEASE_MS = 2 * 60 * 1000;
export const DEFAULT_RECOVERY_LEASE_RECOVERY_LIMIT = 5;

export const cycleId = (kind: AutomationCycleKind, now: Date): string =>
  `automation-cycle:${kind}:${now.toISOString().replace(/[^0-9]/g, "")}:${randomUUID().slice(0, 8)}`;

export const cloneStage = (stage: AutomationCycleStageEntity): AutomationCycleStageEntity => ({
  ...stage,
  taskIds: [...stage.taskIds],
  taskRunIds: [...stage.taskRunIds],
});

export const dedupeStrings = (values: readonly string[]): readonly string[] =>
  values.filter((value, index, current) => current.indexOf(value) === index);

export const fixtureIdFromTask = (task: QueueTaskEntity): string | undefined =>
  typeof task.payload.fixtureId === "string" ? String(task.payload.fixtureId) : undefined;

export const taskLeaseDeadline = (task: QueueTaskEntity): string | null => {
  if (task.status !== "running") {
    return null;
  }

  return task.leaseExpiresAt ?? null;
};

export const hasExpiredTaskLease = (
  task: QueueTaskEntity,
  now: Date,
): boolean => {
  const leaseDeadline = taskLeaseDeadline(task);
  return leaseDeadline !== null && leaseDeadline <= toIso(now);
};

const isTaskLeaseExpiringSoon = (
  task: QueueTaskEntity,
  now: Date,
  thresholdMs: number = DEFAULT_RECOVERY_NEAR_EXPIRY_MS,
): boolean => {
  const leaseDeadline = taskLeaseDeadline(task);
  if (!leaseDeadline) {
    return false;
  }

  const leaseDeadlineMs = Date.parse(leaseDeadline);
  const nowMs = now.getTime();
  return leaseDeadlineMs > nowMs && leaseDeadlineMs - nowMs <= thresholdMs;
};

export const assessQueueHealth = (
  summary: QueueTaskSummary,
  tasks: readonly QueueTaskEntity[],
  now: Date,
): QueueHealthAssessment => {
  const expiredLeaseTaskIds = dedupeStrings(
    tasks.filter((task) => hasExpiredTaskLease(task, now)).map((task) => task.id),
  );
  const nearExpiryTaskIds = dedupeStrings(
    tasks.filter((task) => isTaskLeaseExpiringSoon(task, now)).map((task) => task.id),
  );

  const reasons: string[] = [];
  if (summary.quarantined > 0) {
    reasons.push(`${summary.quarantined} quarantined task(s) require manual review`);
  }
  if (expiredLeaseTaskIds.length > 0) {
    reasons.push(`${expiredLeaseTaskIds.length} running task lease(s) expired and need recovery`);
  }
  if (summary.failed > 0) {
    reasons.push(`${summary.failed} failed task(s) waiting for redrive`);
  }
  if (nearExpiryTaskIds.length > 0) {
    reasons.push(`${nearExpiryTaskIds.length} running task(s) are near lease expiry`);
  }
  if (summary.queued > 25) {
    reasons.push(`${summary.queued} queued task(s) indicate backlog pressure`);
  }

  let status: QueueHealthStatus = "healthy";
  if (summary.quarantined > 0 || expiredLeaseTaskIds.length > 0) {
    status = "blocked";
  } else if (summary.failed > 0 || nearExpiryTaskIds.length > 0 || summary.queued > 25) {
    status = "degraded";
  }

  return {
    status,
    reasons,
    expiredLeaseTaskIds,
    nearExpiryTaskIds,
  };
};

const saveCycle = async (
  databaseUrl: string,
  cycle: AutomationCycleEntity,
): Promise<AutomationCycleEntity> => {
  const client = await createConnectedVerifiedPrismaClient({ databaseUrl });
  try {
    return await createPrismaUnitOfWork(client).automationCycles.save(cycle);
  } finally {
    await client.$disconnect();
  }
};

export const createRuntimeQueue = (
  client: Parameters<typeof createPrismaTaskQueueAdapter>[0],
  unitOfWork: PrismaUnitOfWork,
) =>
  createPrismaTaskQueueAdapter(client, unitOfWork, {
    createTransactionalUnitOfWork: (transactionClient) =>
      createPrismaUnitOfWork(transactionClient as Parameters<typeof createPrismaUnitOfWork>[0]),
  });

export const registerAutomationCycle = async (
  databaseUrl: string,
  input: Omit<AutomationCycleEntity, "createdAt" | "updatedAt">,
): Promise<AutomationCycleEntity> =>
  saveCycle(
    databaseUrl,
    createAutomationCycle(input),
  );

export const listAutomationCycles = async (
  databaseUrl: string,
): Promise<readonly AutomationCycleEntity[]> => {
  const client = await createConnectedVerifiedPrismaClient({ databaseUrl });
  try {
    return createPrismaUnitOfWork(client).automationCycles.list();
  } finally {
    await client.$disconnect();
  }
};

export const loadAutomationCycleReadModel = async (
  databaseUrl: string,
  cycleIdToFind: string,
): Promise<AutomationCycleReadModel | null> => {
  const snapshot = await loadOperationSnapshotFromDatabase(databaseUrl);
  return snapshot.automationCycles.find((cycle) => cycle.id === cycleIdToFind) ?? null;
};

export const loadAutomationCycleReadModelSafely = async (
  databaseUrl: string,
  cycleIdToFind: string,
): Promise<AutomationCycleReadModel | null> => {
  try {
    return await loadAutomationCycleReadModel(databaseUrl, cycleIdToFind);
  } catch (error) {
    if (isRetryablePrismaConnectionError(error)) {
      return null;
    }

    throw error;
  }
};

export const updateCycle = (
  cycle: AutomationCycleEntity,
  input: {
    readonly status: AutomationCycleEntity["status"];
    readonly finishedAt: string;
    readonly summary?: AutomationCycleEntity["summary"];
    readonly metadata?: Record<string, unknown>;
    readonly error?: string;
  },
): AutomationCycleEntity =>
  createAutomationCycle({
    ...cycle,
    status: input.status,
    finishedAt: input.finishedAt,
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.error ? { error: input.error } : {}),
    updatedAt: input.finishedAt,
  });
