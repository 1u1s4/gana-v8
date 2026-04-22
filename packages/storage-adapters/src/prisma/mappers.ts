import type {
  AvailabilitySnapshotEntity,
  AiRunEntity,
  AutomationCycleEntity,
  AutomationCycleKind,
  AutomationCycleStatus,
  AutomationCycleSummary,
  AuditEventEntity,
  DailyAutomationPolicyEntity,
  FeatureSnapshotEntity,
  FixtureEntity,
  FixtureManualSelectionStatus,
  FixtureSelectionOverride,
  FixtureWorkflowEntity,
  LeagueCoveragePolicyEntity,
  LineupParticipantEntity,
  LineupSnapshotEntity,
  ParlayEntity,
  ParlayLeg,
  PredictionEntity,
  ResearchAssignmentEntity,
  ResearchBundleEntity,
  ResearchClaimEntity,
  ResearchClaimSourceEntity,
  ResearchConflictEntity,
  ResearchGateReason,
  ResearchSourceEntity,
  SandboxNamespace,
  SchedulerCursorEntity,
  TaskAttempt,
  TaskEntity,
  TaskKind,
  TaskTriggerKind,
  TaskRunEntity,
  TaskRunStatus,
  TeamCoveragePolicyEntity,
  ValidationCheck,
  ValidationEntity,
  ValidationKind,
  ValidationTargetType,
  WorkflowStageStatus,
} from "@gana-v8/domain-core";
import { createOpaqueTaskRunId } from "@gana-v8/domain-core";
import {
  Prisma,
  type AvailabilitySnapshot,
  type AiRun,
  type AutomationCycle,
  type AutomationCycleKind as PrismaAutomationCycleKind,
  type AutomationCycleStatus as PrismaAutomationCycleStatus,
  type AuditEvent,
  type DailyAutomationPolicy,
  type Environment as PrismaEnvironment,
  type FeatureSnapshot,
  type Fixture,
  type FixtureManualSelectionStatus as PrismaFixtureManualSelectionStatus,
  type FixtureSelectionOverride as PrismaFixtureSelectionOverride,
  type FixtureWorkflow,
  type LeagueCoveragePolicy,
  type LineupParticipant,
  type LineupSnapshot,
  type Parlay,
  type ParlayLeg as PrismaParlayLeg,
  type Prediction,
  type PredictionMarket as PrismaPredictionMarket,
  type ResearchAssignment,
  type ResearchBundle,
  type ResearchClaim,
  type ResearchClaimSource,
  type ResearchConflict,
  type ResearchSource,
  type SandboxNamespace as PrismaSandboxNamespace,
  type SchedulerCursor,
  type Task,
  type TaskKind as PrismaTaskKind,
  type TaskTriggerKind as PrismaTaskTriggerKind,
  type TaskRun,
  type TeamCoveragePolicy,
  type Validation,
  type ValidationKind as PrismaValidationKind,
  type ValidationTargetType as PrismaValidationTargetType,
  type WorkflowStageStatus as PrismaWorkflowStageStatus,
} from "@prisma/client";

const asRecord = (value: Prisma.JsonValue | null | undefined): Record<string, unknown> =>
  (value ?? {}) as Record<string, unknown>;

const asStringRecord = (
  value: Prisma.JsonValue | null | undefined,
): Record<string, string> => asRecord(value) as Record<string, string>;

const asStringArray = (value: Prisma.JsonValue | null | undefined): string[] =>
  ((value ?? []) as unknown as string[]).slice();

const asArray = <T>(
  value: Prisma.JsonValue | null | undefined,
): T[] => ((value ?? []) as unknown as T[]).slice();

const asValidationChecks = (
  value: Prisma.JsonValue | null | undefined,
): ValidationCheck[] =>
  ((value ?? []) as unknown as ValidationCheck[]).map((check) => ({ ...check }));

const toDate = (value: string | undefined): Date | undefined =>
  value ? new Date(value) : undefined;

const taskKindToDomain = (value: PrismaTaskKind): TaskKind =>
  value.replaceAll("_", "-") as TaskKind;

const taskKindToPrisma = (value: TaskKind): PrismaTaskKind =>
  value.replaceAll("-", "_") as PrismaTaskKind;

const taskTriggerKindToDomain = (value: PrismaTaskTriggerKind): TaskTriggerKind => value;

const taskTriggerKindToPrisma = (value: TaskTriggerKind): PrismaTaskTriggerKind => value;

const automationCycleKindToDomain = (
  value: PrismaAutomationCycleKind,
): AutomationCycleKind => value;

const automationCycleKindToPrisma = (
  value: AutomationCycleKind,
): PrismaAutomationCycleKind => value;

const automationCycleStatusToDomain = (
  value: PrismaAutomationCycleStatus,
): AutomationCycleStatus => value;

const automationCycleStatusToPrisma = (
  value: AutomationCycleStatus,
): PrismaAutomationCycleStatus => value;

const predictionMarketToDomain = (
  value: PrismaPredictionMarket,
): PredictionEntity["market"] => value.replaceAll("_", "-") as PredictionEntity["market"];

const predictionMarketToPrisma = (
  value: PredictionEntity["market"],
): PrismaPredictionMarket => value.replaceAll("-", "_") as PrismaPredictionMarket;

const validationKindToDomain = (value: PrismaValidationKind): ValidationKind =>
  value.replaceAll("_", "-") as ValidationKind;

const validationKindToPrisma = (
  value: ValidationKind,
): PrismaValidationKind => value.replaceAll("-", "_") as PrismaValidationKind;

const validationTargetTypeToDomain = (
  value: PrismaValidationTargetType,
): ValidationTargetType => value.replaceAll("_", "-") as ValidationTargetType;

const validationTargetTypeToPrisma = (
  value: ValidationTargetType,
): PrismaValidationTargetType =>
  value.replaceAll("-", "_") as PrismaValidationTargetType;

const workflowStageStatusToDomain = (
  value: PrismaWorkflowStageStatus,
): WorkflowStageStatus => value;

const workflowStageStatusToPrisma = (
  value: WorkflowStageStatus,
): PrismaWorkflowStageStatus => value;

const fixtureManualSelectionStatusToDomain = (
  value: PrismaFixtureManualSelectionStatus,
): FixtureManualSelectionStatus => value;

const fixtureManualSelectionStatusToPrisma = (
  value: FixtureManualSelectionStatus,
): PrismaFixtureManualSelectionStatus => value;

const fixtureSelectionOverrideToDomain = (
  value: PrismaFixtureSelectionOverride,
): FixtureSelectionOverride => value.replaceAll("_", "-") as FixtureSelectionOverride;

const fixtureSelectionOverrideToPrisma = (
  value: FixtureSelectionOverride,
): PrismaFixtureSelectionOverride => value.replaceAll("-", "_") as PrismaFixtureSelectionOverride;

const environmentToDomain = (value: PrismaEnvironment): SandboxNamespace["environment"] =>
  value as SandboxNamespace["environment"];

const environmentToPrisma = (
  value: SandboxNamespace["environment"],
): PrismaEnvironment => value as PrismaEnvironment;

export const fixtureInclude = {} as const satisfies Prisma.FixtureDefaultArgs;
export type FixtureRecord = Prisma.FixtureGetPayload<typeof fixtureInclude>;

export const automationCycleInclude = {} as const satisfies Prisma.AutomationCycleDefaultArgs;
export type AutomationCycleRecord = Prisma.AutomationCycleGetPayload<typeof automationCycleInclude>;

export const fixtureWorkflowInclude = {} as const satisfies Prisma.FixtureWorkflowDefaultArgs;
export type FixtureWorkflowRecord = Prisma.FixtureWorkflowGetPayload<typeof fixtureWorkflowInclude>;

export const schedulerCursorInclude = {} as const satisfies Prisma.SchedulerCursorDefaultArgs;
export type SchedulerCursorRecord = Prisma.SchedulerCursorGetPayload<typeof schedulerCursorInclude>;

export const taskInclude = {
  include: { taskRuns: { orderBy: { attemptNumber: "asc" } } },
} as const satisfies Prisma.TaskDefaultArgs;
export type TaskRecord = Prisma.TaskGetPayload<typeof taskInclude>;

export const taskRunInclude = {} as const satisfies Prisma.TaskRunDefaultArgs;
export type TaskRunRecord = Prisma.TaskRunGetPayload<typeof taskRunInclude>;

export const aiRunInclude = {} as const satisfies Prisma.AiRunDefaultArgs;
export type AiRunRecord = Prisma.AiRunGetPayload<typeof aiRunInclude>;

export const predictionInclude = {} as const satisfies Prisma.PredictionDefaultArgs;
export type PredictionRecord = Prisma.PredictionGetPayload<typeof predictionInclude>;

export const parlayInclude = {
  include: { legs: { orderBy: { index: "asc" } } },
} as const satisfies Prisma.ParlayDefaultArgs;
export type ParlayRecord = Prisma.ParlayGetPayload<typeof parlayInclude>;

export const validationInclude = {} as const satisfies Prisma.ValidationDefaultArgs;
export type ValidationRecord = Prisma.ValidationGetPayload<typeof validationInclude>;

export const auditEventInclude = {} as const satisfies Prisma.AuditEventDefaultArgs;
export type AuditEventRecord = Prisma.AuditEventGetPayload<typeof auditEventInclude>;

export const leagueCoveragePolicyInclude = {} as const satisfies Prisma.LeagueCoveragePolicyDefaultArgs;
export type LeagueCoveragePolicyRecord = Prisma.LeagueCoveragePolicyGetPayload<
  typeof leagueCoveragePolicyInclude
>;

export const teamCoveragePolicyInclude = {} as const satisfies Prisma.TeamCoveragePolicyDefaultArgs;
export type TeamCoveragePolicyRecord = Prisma.TeamCoveragePolicyGetPayload<typeof teamCoveragePolicyInclude>;

export const dailyAutomationPolicyInclude = {} as const satisfies Prisma.DailyAutomationPolicyDefaultArgs;
export type DailyAutomationPolicyRecord = Prisma.DailyAutomationPolicyGetPayload<
  typeof dailyAutomationPolicyInclude
>;

export const sandboxNamespaceInclude = {} as const satisfies Prisma.SandboxNamespaceDefaultArgs;
export type SandboxNamespaceRecord = Prisma.SandboxNamespaceGetPayload<
  typeof sandboxNamespaceInclude
>;

export const researchBundleInclude = {} as const satisfies Prisma.ResearchBundleDefaultArgs;
export type ResearchBundleRecord = Prisma.ResearchBundleGetPayload<typeof researchBundleInclude>;

export const researchSourceInclude = {} as const satisfies Prisma.ResearchSourceDefaultArgs;
export type ResearchSourceRecord = Prisma.ResearchSourceGetPayload<typeof researchSourceInclude>;

export const researchClaimInclude = {} as const satisfies Prisma.ResearchClaimDefaultArgs;
export type ResearchClaimRecord = Prisma.ResearchClaimGetPayload<typeof researchClaimInclude>;

export const researchClaimSourceInclude = {} as const satisfies Prisma.ResearchClaimSourceDefaultArgs;
export type ResearchClaimSourceRecord = Prisma.ResearchClaimSourceGetPayload<
  typeof researchClaimSourceInclude
>;

export const researchConflictInclude = {} as const satisfies Prisma.ResearchConflictDefaultArgs;
export type ResearchConflictRecord = Prisma.ResearchConflictGetPayload<typeof researchConflictInclude>;

export const featureSnapshotInclude = {} as const satisfies Prisma.FeatureSnapshotDefaultArgs;
export type FeatureSnapshotRecord = Prisma.FeatureSnapshotGetPayload<typeof featureSnapshotInclude>;

export const availabilitySnapshotInclude = {} as const satisfies Prisma.AvailabilitySnapshotDefaultArgs;
export type AvailabilitySnapshotRecord = Prisma.AvailabilitySnapshotGetPayload<
  typeof availabilitySnapshotInclude
>;

export const lineupSnapshotInclude = {} as const satisfies Prisma.LineupSnapshotDefaultArgs;
export type LineupSnapshotRecord = Prisma.LineupSnapshotGetPayload<typeof lineupSnapshotInclude>;

export const lineupParticipantInclude = {} as const satisfies Prisma.LineupParticipantDefaultArgs;
export type LineupParticipantRecord = Prisma.LineupParticipantGetPayload<typeof lineupParticipantInclude>;

export const researchAssignmentInclude = {} as const satisfies Prisma.ResearchAssignmentDefaultArgs;
export type ResearchAssignmentRecord = Prisma.ResearchAssignmentGetPayload<
  typeof researchAssignmentInclude
>;

export const taskAttemptToTaskRunInput = (
  taskId: string,
  attempt: TaskAttempt,
  attemptNumber: number,
): Prisma.TaskRunCreateWithoutTaskInput => ({
  id: createOpaqueTaskRunId(taskId, attemptNumber),
  attemptNumber,
  status: attempt.finishedAt
    ? attempt.error
      ? "failed"
      : "succeeded"
    : "running",
  startedAt: new Date(attempt.startedAt),
  finishedAt: toDate(attempt.finishedAt) ?? null,
  error: attempt.error ?? null,
  workerName: null,
  result: Prisma.JsonNull,
  retryScheduledFor: null,
  createdAt: new Date(attempt.startedAt),
  updatedAt: toDate(attempt.finishedAt) ?? new Date(attempt.startedAt),
});

export const taskRunToTaskAttempt = (record: TaskRun | TaskRunRecord): TaskAttempt => ({
  startedAt: record.startedAt.toISOString(),
  ...(record.finishedAt ? { finishedAt: record.finishedAt.toISOString() } : {}),
  ...(record.error ? { error: record.error } : {}),
});

export const taskRunRecordToDomain = (record: TaskRun | TaskRunRecord): TaskRunEntity => ({
  id: record.id,
  taskId: record.taskId,
  attemptNumber: record.attemptNumber,
  status: record.status,
  ...(record.workerName ? { workerName: record.workerName } : {}),
  startedAt: record.startedAt.toISOString(),
  ...(record.finishedAt ? { finishedAt: record.finishedAt.toISOString() } : {}),
  ...(record.error ? { error: record.error } : {}),
  ...(record.result ? { result: asRecord(record.result) } : {}),
  ...(record.retryScheduledFor ? { retryScheduledFor: record.retryScheduledFor.toISOString() } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const taskRunDomainToCreateInput = (
  entity: TaskRunEntity,
): Prisma.TaskRunUncheckedCreateInput => ({
  id: entity.id,
  taskId: entity.taskId,
  attemptNumber: entity.attemptNumber,
  status: entity.status,
  workerName: entity.workerName ?? null,
  startedAt: new Date(entity.startedAt),
  finishedAt: toDate(entity.finishedAt) ?? null,
  error: entity.error ?? null,
  result: entity.result ? (entity.result as Prisma.InputJsonValue) : Prisma.JsonNull,
  retryScheduledFor: toDate(entity.retryScheduledFor) ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

const asAutomationCycleSummary = (
  value: Prisma.JsonValue | null | undefined,
): AutomationCycleSummary | undefined =>
  value !== null && value !== undefined ? (asRecord(value) as AutomationCycleSummary) : undefined;

export const automationCycleRecordToDomain = (
  record: AutomationCycle | AutomationCycleRecord,
): AutomationCycleEntity => ({
  id: record.id,
  kind: automationCycleKindToDomain(record.kind),
  status: automationCycleStatusToDomain(record.status),
  leaseOwner: record.leaseOwner,
  ...(record.summary
    ? (() => {
        const summary = asAutomationCycleSummary(record.summary);
        return summary ? { summary } : {};
      })()
    : {}),
  ...(record.metadata ? { metadata: asRecord(record.metadata) } : {}),
  ...(record.error ? { error: record.error } : {}),
  startedAt: record.startedAt.toISOString(),
  ...(record.finishedAt ? { finishedAt: record.finishedAt.toISOString() } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const automationCycleDomainToCreateInput = (
  entity: AutomationCycleEntity,
): Prisma.AutomationCycleUncheckedCreateInput => ({
  id: entity.id,
  kind: automationCycleKindToPrisma(entity.kind),
  status: automationCycleStatusToPrisma(entity.status),
  leaseOwner: entity.leaseOwner,
  summary:
    entity.summary !== undefined
      ? (entity.summary as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  metadata:
    entity.metadata !== undefined
      ? (entity.metadata as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  error: entity.error ?? null,
  startedAt: new Date(entity.startedAt),
  finishedAt: toDate(entity.finishedAt) ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const fixtureRecordToDomain = (record: Fixture | FixtureRecord): FixtureEntity => ({
  id: record.id,
  sport: record.sport,
  competition: record.competition,
  homeTeam: record.homeTeam,
  awayTeam: record.awayTeam,
  scheduledAt: record.scheduledAt.toISOString(),
  status: record.status,
  ...(record.scoreHome !== null && record.scoreAway !== null
    ? { score: { home: record.scoreHome, away: record.scoreAway } }
    : {}),
  metadata: asStringRecord(record.metadata),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const fixtureDomainToCreateInput = (
  entity: FixtureEntity,
): Prisma.FixtureUncheckedCreateInput => ({
  id: entity.id,
  sport: entity.sport,
  competition: entity.competition,
  homeTeam: entity.homeTeam,
  awayTeam: entity.awayTeam,
  scheduledAt: new Date(entity.scheduledAt),
  status: entity.status,
  scoreHome: entity.score?.home ?? null,
  scoreAway: entity.score?.away ?? null,
  metadata: entity.metadata,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const fixtureWorkflowRecordToDomain = (
  record: FixtureWorkflow | FixtureWorkflowRecord,
): FixtureWorkflowEntity => ({
  id: record.id,
  fixtureId: record.fixtureId,
  ingestionStatus: workflowStageStatusToDomain(record.ingestionStatus),
  oddsStatus: workflowStageStatusToDomain(record.oddsStatus),
  enrichmentStatus: workflowStageStatusToDomain(record.enrichmentStatus),
  candidateStatus: workflowStageStatusToDomain(record.candidateStatus),
  predictionStatus: workflowStageStatusToDomain(record.predictionStatus),
  parlayStatus: workflowStageStatusToDomain(record.parlayStatus),
  validationStatus: workflowStageStatusToDomain(record.validationStatus),
  isCandidate: record.isCandidate,
  ...(record.minDetectedOdd !== null ? { minDetectedOdd: record.minDetectedOdd } : {}),
  ...(record.qualityScore !== null ? { qualityScore: record.qualityScore } : {}),
  ...(record.selectionScore !== null ? { selectionScore: record.selectionScore } : {}),
  ...(record.lastIngestedAt ? { lastIngestedAt: record.lastIngestedAt.toISOString() } : {}),
  ...(record.lastEnrichedAt ? { lastEnrichedAt: record.lastEnrichedAt.toISOString() } : {}),
  ...(record.lastPredictedAt ? { lastPredictedAt: record.lastPredictedAt.toISOString() } : {}),
  ...(record.lastParlayAt ? { lastParlayAt: record.lastParlayAt.toISOString() } : {}),
  ...(record.lastValidatedAt ? { lastValidatedAt: record.lastValidatedAt.toISOString() } : {}),
  manualSelectionStatus: fixtureManualSelectionStatusToDomain(record.manualSelectionStatus),
  ...(record.manualSelectionBy ? { manualSelectionBy: record.manualSelectionBy } : {}),
  ...(record.manualSelectionReason ? { manualSelectionReason: record.manualSelectionReason } : {}),
  ...(record.manuallySelectedAt ? { manuallySelectedAt: record.manuallySelectedAt.toISOString() } : {}),
  selectionOverride: fixtureSelectionOverrideToDomain(record.selectionOverride),
  ...(record.overrideReason ? { overrideReason: record.overrideReason } : {}),
  ...(record.overriddenAt ? { overriddenAt: record.overriddenAt.toISOString() } : {}),
  errorCount: record.errorCount,
  ...(record.lastErrorMessage ? { lastErrorMessage: record.lastErrorMessage } : {}),
  ...(record.diagnostics ? { diagnostics: asRecord(record.diagnostics) } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const schedulerCursorRecordToDomain = (
  record: SchedulerCursor | SchedulerCursorRecord,
): SchedulerCursorEntity => ({
  id: record.id,
  specId: record.specId,
  ...(record.lastTriggeredAt ? { lastTriggeredAt: record.lastTriggeredAt.toISOString() } : {}),
  ...(record.metadata ? { metadata: asRecord(record.metadata) } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const schedulerCursorDomainToCreateInput = (
  entity: SchedulerCursorEntity,
): Prisma.SchedulerCursorUncheckedCreateInput => ({
  id: entity.id,
  specId: entity.specId,
  lastTriggeredAt: toDate(entity.lastTriggeredAt) ?? null,
  metadata: entity.metadata ? (entity.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const fixtureWorkflowDomainToCreateInput = (
  entity: FixtureWorkflowEntity,
): Prisma.FixtureWorkflowUncheckedCreateInput => ({
  id: entity.id,
  fixtureId: entity.fixtureId,
  ingestionStatus: workflowStageStatusToPrisma(entity.ingestionStatus),
  oddsStatus: workflowStageStatusToPrisma(entity.oddsStatus),
  enrichmentStatus: workflowStageStatusToPrisma(entity.enrichmentStatus),
  candidateStatus: workflowStageStatusToPrisma(entity.candidateStatus),
  predictionStatus: workflowStageStatusToPrisma(entity.predictionStatus),
  parlayStatus: workflowStageStatusToPrisma(entity.parlayStatus),
  validationStatus: workflowStageStatusToPrisma(entity.validationStatus),
  isCandidate: entity.isCandidate,
  minDetectedOdd: entity.minDetectedOdd ?? null,
  qualityScore: entity.qualityScore ?? null,
  selectionScore: entity.selectionScore ?? null,
  lastIngestedAt: toDate(entity.lastIngestedAt) ?? null,
  lastEnrichedAt: toDate(entity.lastEnrichedAt) ?? null,
  lastPredictedAt: toDate(entity.lastPredictedAt) ?? null,
  lastParlayAt: toDate(entity.lastParlayAt) ?? null,
  lastValidatedAt: toDate(entity.lastValidatedAt) ?? null,
  manualSelectionStatus: fixtureManualSelectionStatusToPrisma(entity.manualSelectionStatus),
  manualSelectionBy: entity.manualSelectionBy ?? null,
  manualSelectionReason: entity.manualSelectionReason ?? null,
  manuallySelectedAt: toDate(entity.manuallySelectedAt) ?? null,
  selectionOverride: fixtureSelectionOverrideToPrisma(entity.selectionOverride),
  overrideReason: entity.overrideReason ?? null,
  overriddenAt: toDate(entity.overriddenAt) ?? null,
  errorCount: entity.errorCount,
  lastErrorMessage: entity.lastErrorMessage ?? null,
  diagnostics:
    entity.diagnostics !== undefined
      ? (entity.diagnostics as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const taskRecordToDomain = (record: TaskRecord | Task): TaskEntity => {
  const taskRuns = "taskRuns" in record ? record.taskRuns : [];
  return {
    id: record.id,
    kind: taskKindToDomain(record.kind),
    status: record.status,
    triggerKind: taskTriggerKindToDomain(record.triggerKind ?? "system"),
    priority: record.priority,
    ...(record.dedupeKey ? { dedupeKey: record.dedupeKey } : {}),
    ...(record.manifestId ? { manifestId: record.manifestId } : {}),
    ...(record.workflowId ? { workflowId: record.workflowId } : {}),
    ...(record.traceId ? { traceId: record.traceId } : {}),
    ...(record.correlationId ? { correlationId: record.correlationId } : {}),
    ...(record.source ? { source: record.source } : {}),
    payload: asRecord(record.payload),
    attempts: taskRuns.map(taskRunToTaskAttempt),
    ...(record.scheduledFor ? { scheduledFor: record.scheduledFor.toISOString() } : {}),
    maxAttempts: record.maxAttempts ?? 3,
    ...(record.lastErrorMessage ? { lastErrorMessage: record.lastErrorMessage } : {}),
    ...(record.leaseOwner ? { leaseOwner: record.leaseOwner } : {}),
    ...(record.leaseExpiresAt ? { leaseExpiresAt: record.leaseExpiresAt.toISOString() } : {}),
    ...(record.claimedAt ? { claimedAt: record.claimedAt.toISOString() } : {}),
    ...(record.lastHeartbeatAt ? { lastHeartbeatAt: record.lastHeartbeatAt.toISOString() } : {}),
    ...(record.activeTaskRunId ? { activeTaskRunId: record.activeTaskRunId } : {}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

export const taskDomainToCreateInput = (
  entity: TaskEntity,
): Prisma.TaskUncheckedCreateInput => ({
  id: entity.id,
  kind: taskKindToPrisma(entity.kind),
  status: entity.status,
  triggerKind: taskTriggerKindToPrisma(entity.triggerKind),
  priority: entity.priority,
  dedupeKey: entity.dedupeKey ?? null,
  manifestId: entity.manifestId ?? null,
  workflowId: entity.workflowId ?? null,
  traceId: entity.traceId ?? null,
  correlationId: entity.correlationId ?? null,
  source: entity.source ?? null,
  payload: entity.payload as Prisma.InputJsonValue,
  scheduledFor: toDate(entity.scheduledFor) ?? null,
  maxAttempts: entity.maxAttempts,
  lastErrorMessage: entity.lastErrorMessage ?? null,
  leaseOwner: entity.leaseOwner ?? null,
  leaseExpiresAt: toDate(entity.leaseExpiresAt) ?? null,
  claimedAt: toDate(entity.claimedAt) ?? null,
  lastHeartbeatAt: toDate(entity.lastHeartbeatAt) ?? null,
  activeTaskRunId: entity.activeTaskRunId ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const aiRunRecordToDomain = (record: AiRun | AiRunRecord): AiRunEntity => ({
  id: record.id,
  taskId: record.taskId,
  provider: record.provider,
  model: record.model,
  promptVersion: record.promptVersion,
  status: record.status,
  ...(record.providerRequestId ? { providerRequestId: record.providerRequestId } : {}),
  ...(record.usagePromptTokens !== null &&
  record.usageCompletionTokens !== null &&
  record.usageTotalTokens !== null
    ? {
        usage: {
          promptTokens: record.usagePromptTokens,
          completionTokens: record.usageCompletionTokens,
          totalTokens: record.usageTotalTokens,
        },
      }
    : {}),
  ...(record.outputRef ? { outputRef: record.outputRef } : {}),
  ...(record.error ? { error: record.error } : {}),
  ...(record.fallbackReason ? { fallbackReason: record.fallbackReason } : {}),
  ...(record.degraded !== null ? { degraded: record.degraded } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const aiRunDomainToCreateInput = (
  entity: AiRunEntity,
): Prisma.AiRunUncheckedCreateInput => ({
  id: entity.id,
  taskId: entity.taskId,
  provider: entity.provider,
  model: entity.model,
  promptVersion: entity.promptVersion,
  status: entity.status,
  providerRequestId: entity.providerRequestId ?? null,
  usagePromptTokens: entity.usage?.promptTokens ?? null,
  usageCompletionTokens: entity.usage?.completionTokens ?? null,
  usageTotalTokens: entity.usage?.totalTokens ?? null,
  outputRef: entity.outputRef ?? null,
  error: entity.error ?? null,
  fallbackReason: entity.fallbackReason ?? null,
  degraded: entity.degraded ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const predictionRecordToDomain = (
  record: Prediction | PredictionRecord,
): PredictionEntity => ({
  id: record.id,
  fixtureId: record.fixtureId,
  ...(record.aiRunId ? { aiRunId: record.aiRunId } : {}),
  market: predictionMarketToDomain(record.market),
  outcome: record.outcome,
  status: record.status,
  confidence: record.confidence,
  probabilities: asRecord(record.probabilities) as unknown as PredictionEntity["probabilities"],
  rationale: asStringArray(record.rationale),
  ...(record.publishedAt ? { publishedAt: record.publishedAt.toISOString() } : {}),
  ...(record.settledAt ? { settledAt: record.settledAt.toISOString() } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const predictionDomainToCreateInput = (
  entity: PredictionEntity,
): Prisma.PredictionUncheckedCreateInput => ({
  id: entity.id,
  fixtureId: entity.fixtureId,
  aiRunId: entity.aiRunId ?? null,
  market: predictionMarketToPrisma(entity.market),
  outcome: entity.outcome,
  status: entity.status,
  confidence: entity.confidence,
  probabilities: entity.probabilities as unknown as Prisma.InputJsonValue,
  rationale: entity.rationale as unknown as Prisma.InputJsonValue,
  publishedAt: toDate(entity.publishedAt) ?? null,
  settledAt: toDate(entity.settledAt) ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

const parlayLegRecordToDomain = (record: PrismaParlayLeg): ParlayLeg => ({
  predictionId: record.predictionId,
  fixtureId: record.fixtureId,
  market: record.market,
  outcome: record.outcome,
  price: record.price,
  status: record.status,
});

export const parlayRecordToDomain = (record: ParlayRecord | Parlay): ParlayEntity => ({
  id: record.id,
  status: record.status,
  stake: record.stake,
  source: record.source,
  legs: "legs" in record ? record.legs.map(parlayLegRecordToDomain) : [],
  correlationScore: record.correlationScore,
  expectedPayout: record.expectedPayout,
  ...(record.submittedAt ? { submittedAt: record.submittedAt.toISOString() } : {}),
  ...(record.settledAt ? { settledAt: record.settledAt.toISOString() } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const parlayDomainToCreateInput = (
  entity: ParlayEntity,
): Prisma.ParlayUncheckedCreateInput => ({
  id: entity.id,
  status: entity.status,
  stake: entity.stake,
  source: entity.source,
  correlationScore: entity.correlationScore,
  expectedPayout: entity.expectedPayout,
  submittedAt: toDate(entity.submittedAt) ?? null,
  settledAt: toDate(entity.settledAt) ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const validationRecordToDomain = (
  record: Validation | ValidationRecord,
): ValidationEntity => ({
  id: record.id,
  targetType: validationTargetTypeToDomain(record.targetType),
  targetId: record.targetId,
  kind: validationKindToDomain(record.kind),
  status: record.status,
  checks: asValidationChecks(record.checks),
  summary: record.summary,
  ...(record.executedAt ? { executedAt: record.executedAt.toISOString() } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const validationDomainToCreateInput = (
  entity: ValidationEntity,
): Prisma.ValidationUncheckedCreateInput => ({
  id: entity.id,
  targetType: validationTargetTypeToPrisma(entity.targetType),
  targetId: entity.targetId,
  kind: validationKindToPrisma(entity.kind),
  status: entity.status,
  checks: entity.checks as unknown as Prisma.InputJsonValue,
  summary: entity.summary,
  executedAt: toDate(entity.executedAt) ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const auditEventRecordToDomain = (
  record: AuditEvent | AuditEventRecord,
): AuditEventEntity => ({
  id: record.id,
  aggregateType: record.aggregateType,
  aggregateId: record.aggregateId,
  eventType: record.eventType,
  ...(record.actor ? { actor: record.actor } : {}),
  payload: asRecord(record.payload),
  occurredAt: record.occurredAt.toISOString(),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const auditEventDomainToCreateInput = (
  entity: AuditEventEntity,
): Prisma.AuditEventUncheckedCreateInput => ({
  id: entity.id,
  aggregateType: entity.aggregateType,
  aggregateId: entity.aggregateId,
  eventType: entity.eventType,
  actor: entity.actor ?? null,
  payload: entity.payload as Prisma.InputJsonValue,
  occurredAt: new Date(entity.occurredAt),
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const leagueCoveragePolicyRecordToDomain = (
  record: LeagueCoveragePolicy | LeagueCoveragePolicyRecord,
): LeagueCoveragePolicyEntity => ({
  id: record.id,
  provider: record.provider,
  leagueKey: record.leagueKey,
  leagueName: record.leagueName,
  season: record.season,
  enabled: record.enabled,
  alwaysOn: record.alwaysOn,
  priority: record.priority,
  marketsAllowed: asStringArray(record.marketsAllowed),
  ...(record.notes ? { notes: record.notes } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const leagueCoveragePolicyDomainToCreateInput = (
  entity: LeagueCoveragePolicyEntity,
): Prisma.LeagueCoveragePolicyUncheckedCreateInput => ({
  id: entity.id,
  provider: entity.provider,
  leagueKey: entity.leagueKey,
  leagueName: entity.leagueName,
  season: entity.season,
  enabled: entity.enabled,
  alwaysOn: entity.alwaysOn,
  priority: entity.priority,
  marketsAllowed: entity.marketsAllowed as Prisma.InputJsonValue,
  notes: entity.notes ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const teamCoveragePolicyRecordToDomain = (
  record: TeamCoveragePolicy | TeamCoveragePolicyRecord,
): TeamCoveragePolicyEntity => ({
  id: record.id,
  provider: record.provider,
  teamKey: record.teamKey,
  teamName: record.teamName,
  enabled: record.enabled,
  alwaysTrack: record.alwaysTrack,
  priority: record.priority,
  followHome: record.followHome,
  followAway: record.followAway,
  forceResearch: record.forceResearch,
  ...(record.notes ? { notes: record.notes } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const teamCoveragePolicyDomainToCreateInput = (
  entity: TeamCoveragePolicyEntity,
): Prisma.TeamCoveragePolicyUncheckedCreateInput => ({
  id: entity.id,
  provider: entity.provider,
  teamKey: entity.teamKey,
  teamName: entity.teamName,
  enabled: entity.enabled,
  alwaysTrack: entity.alwaysTrack,
  priority: entity.priority,
  followHome: entity.followHome,
  followAway: entity.followAway,
  forceResearch: entity.forceResearch,
  notes: entity.notes ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const dailyAutomationPolicyRecordToDomain = (
  record: DailyAutomationPolicy | DailyAutomationPolicyRecord,
): DailyAutomationPolicyEntity => ({
  id: record.id,
  policyName: record.policyName,
  enabled: record.enabled,
  timezone: record.timezone,
  minAllowedOdd: record.minAllowedOdd,
  defaultMaxFixturesPerRun: record.defaultMaxFixturesPerRun,
  defaultLookaheadHours: record.defaultLookaheadHours,
  defaultLookbackHours: record.defaultLookbackHours,
  requireTrackedLeagueOrTeam: record.requireTrackedLeagueOrTeam,
  allowManualInclusionBypass: record.allowManualInclusionBypass,
  ...(record.notes ? { notes: record.notes } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const dailyAutomationPolicyDomainToCreateInput = (
  entity: DailyAutomationPolicyEntity,
): Prisma.DailyAutomationPolicyUncheckedCreateInput => ({
  id: entity.id,
  policyName: entity.policyName,
  enabled: entity.enabled,
  timezone: entity.timezone,
  minAllowedOdd: entity.minAllowedOdd,
  defaultMaxFixturesPerRun: entity.defaultMaxFixturesPerRun,
  defaultLookaheadHours: entity.defaultLookaheadHours,
  defaultLookbackHours: entity.defaultLookbackHours,
  requireTrackedLeagueOrTeam: entity.requireTrackedLeagueOrTeam,
  allowManualInclusionBypass: entity.allowManualInclusionBypass,
  notes: entity.notes ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const sandboxNamespaceRecordToDomain = (
  record: PrismaSandboxNamespace | SandboxNamespaceRecord,
): SandboxNamespace => ({
  id: record.id,
  environment: environmentToDomain(record.environment),
  ...(record.sandboxId ? { sandboxId: record.sandboxId } : {}),
  scope: record.scope,
  storagePrefix: record.storagePrefix,
  queuePrefix: record.queuePrefix,
  metadata: asStringRecord(record.metadata),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const sandboxNamespaceDomainToCreateInput = (
  entity: SandboxNamespace,
): Prisma.SandboxNamespaceUncheckedCreateInput => ({
  id: entity.id,
  environment: environmentToPrisma(entity.environment),
  sandboxId: entity.sandboxId ?? null,
  scope: entity.scope,
  storagePrefix: entity.storagePrefix,
  queuePrefix: entity.queuePrefix,
  metadata: entity.metadata,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const researchBundleRecordToDomain = (
  record: ResearchBundle | ResearchBundleRecord,
): ResearchBundleEntity => ({
  id: record.id,
  fixtureId: record.fixtureId,
  generatedAt: record.generatedAt.toISOString(),
  brief: {
    headline: record.briefHeadline,
    context: record.briefContext,
    questions: asStringArray(record.briefQuestions),
    assumptions: asStringArray(record.briefAssumptions),
  },
  summary: record.summary,
  recommendedLean: record.recommendedLean as ResearchBundleEntity["recommendedLean"],
  directionalScore: asRecord(record.directionalScore) as unknown as ResearchBundleEntity["directionalScore"],
  risks: asStringArray(record.risks),
  gateResult: {
    status: record.status as ResearchBundleEntity["gateResult"]["status"],
    reasons: asArray<ResearchGateReason>(record.gateReasons),
    gatedAt: record.gatedAt.toISOString(),
  },
  ...(record.trace ? { trace: asRecord(record.trace) } : {}),
  ...(record.aiRunId ? { aiRunId: record.aiRunId } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const researchBundleDomainToCreateInput = (
  entity: ResearchBundleEntity,
): Prisma.ResearchBundleUncheckedCreateInput => ({
  id: entity.id,
  fixtureId: entity.fixtureId,
  generatedAt: new Date(entity.generatedAt),
  gatedAt: new Date(entity.gateResult.gatedAt),
  status: entity.gateResult.status,
  briefHeadline: entity.brief.headline,
  briefContext: entity.brief.context,
  briefQuestions: entity.brief.questions as unknown as Prisma.InputJsonValue,
  briefAssumptions: entity.brief.assumptions as unknown as Prisma.InputJsonValue,
  summary: entity.summary,
  recommendedLean: entity.recommendedLean,
  directionalScore: entity.directionalScore as unknown as Prisma.InputJsonValue,
  risks: entity.risks as unknown as Prisma.InputJsonValue,
  gateReasons: entity.gateResult.reasons as unknown as Prisma.InputJsonValue,
  trace:
    entity.trace !== undefined ? (entity.trace as Prisma.InputJsonValue) : Prisma.JsonNull,
  aiRunId: entity.aiRunId ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const researchSourceRecordToDomain = (
  record: ResearchSource | ResearchSourceRecord,
): ResearchSourceEntity => ({
  id: record.id,
  bundleId: record.bundleId,
  fixtureId: record.fixtureId,
  provider: record.provider,
  reference: record.reference,
  sourceType: record.sourceType,
  ...(record.title ? { title: record.title } : {}),
  ...(record.url ? { url: record.url } : {}),
  admissibility: record.admissibility as ResearchSourceEntity["admissibility"],
  independenceKey: record.independenceKey,
  capturedAt: record.capturedAt.toISOString(),
  ...(record.publishedAt ? { publishedAt: record.publishedAt.toISOString() } : {}),
  ...(record.freshnessExpiresAt
    ? { freshnessExpiresAt: record.freshnessExpiresAt.toISOString() }
    : {}),
  metadata: asRecord(record.metadata),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const researchSourceDomainToCreateInput = (
  entity: ResearchSourceEntity,
): Prisma.ResearchSourceUncheckedCreateInput => ({
  id: entity.id,
  bundleId: entity.bundleId,
  fixtureId: entity.fixtureId,
  provider: entity.provider,
  reference: entity.reference,
  sourceType: entity.sourceType,
  title: entity.title ?? null,
  url: entity.url ?? null,
  admissibility: entity.admissibility,
  independenceKey: entity.independenceKey,
  capturedAt: new Date(entity.capturedAt),
  publishedAt: toDate(entity.publishedAt) ?? null,
  freshnessExpiresAt: toDate(entity.freshnessExpiresAt) ?? null,
  metadata: entity.metadata as Prisma.InputJsonValue,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const researchClaimRecordToDomain = (
  record: ResearchClaim | ResearchClaimRecord,
): ResearchClaimEntity => ({
  id: record.id,
  bundleId: record.bundleId,
  fixtureId: record.fixtureId,
  ...(record.assignmentId ? { assignmentId: record.assignmentId } : {}),
  kind: record.kind as ResearchClaimEntity["kind"],
  title: record.title,
  summary: record.summary,
  direction: record.direction as ResearchClaimEntity["direction"],
  confidence: record.confidence,
  impact: record.impact,
  significance: record.significance as ResearchClaimEntity["significance"],
  status: record.status as ResearchClaimEntity["status"],
  corroborationStatus: record.corroborationStatus as ResearchClaimEntity["corroborationStatus"],
  requiredSourceCount: record.requiredSourceCount,
  matchedSourceIds: asStringArray(record.matchedSourceIds),
  freshnessWindowHours: record.freshnessWindowHours,
  extractedAt: record.extractedAt.toISOString(),
  ...(record.freshnessExpiresAt
    ? { freshnessExpiresAt: record.freshnessExpiresAt.toISOString() }
    : {}),
  metadata: asStringRecord(record.metadata),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const researchClaimDomainToCreateInput = (
  entity: ResearchClaimEntity,
): Prisma.ResearchClaimUncheckedCreateInput => ({
  id: entity.id,
  bundleId: entity.bundleId,
  fixtureId: entity.fixtureId,
  assignmentId: entity.assignmentId ?? null,
  kind: entity.kind,
  title: entity.title,
  summary: entity.summary,
  direction: entity.direction,
  confidence: entity.confidence,
  impact: entity.impact,
  significance: entity.significance,
  status: entity.status,
  corroborationStatus: entity.corroborationStatus,
  requiredSourceCount: entity.requiredSourceCount,
  matchedSourceIds: entity.matchedSourceIds as unknown as Prisma.InputJsonValue,
  freshnessWindowHours: entity.freshnessWindowHours,
  extractedAt: new Date(entity.extractedAt),
  freshnessExpiresAt: toDate(entity.freshnessExpiresAt) ?? null,
  metadata: entity.metadata,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const researchClaimSourceRecordToDomain = (
  record: ResearchClaimSource | ResearchClaimSourceRecord,
): ResearchClaimSourceEntity => ({
  id: record.id,
  claimId: record.claimId,
  sourceId: record.sourceId,
  orderIndex: record.orderIndex,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const researchClaimSourceDomainToCreateInput = (
  entity: ResearchClaimSourceEntity,
): Prisma.ResearchClaimSourceUncheckedCreateInput => ({
  id: entity.id,
  claimId: entity.claimId,
  sourceId: entity.sourceId,
  orderIndex: entity.orderIndex,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const researchConflictRecordToDomain = (
  record: ResearchConflict | ResearchConflictRecord,
): ResearchConflictEntity => ({
  id: record.id,
  bundleId: record.bundleId,
  fixtureId: record.fixtureId,
  claimIds: asStringArray(record.claimIds),
  summary: record.summary,
  severity: record.severity as ResearchConflictEntity["severity"],
  status: record.status as ResearchConflictEntity["status"],
  ...(record.resolutionNote ? { resolutionNote: record.resolutionNote } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const researchConflictDomainToCreateInput = (
  entity: ResearchConflictEntity,
): Prisma.ResearchConflictUncheckedCreateInput => ({
  id: entity.id,
  bundleId: entity.bundleId,
  fixtureId: entity.fixtureId,
  claimIds: entity.claimIds as unknown as Prisma.InputJsonValue,
  summary: entity.summary,
  severity: entity.severity,
  status: entity.status,
  resolutionNote: entity.resolutionNote ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const featureSnapshotRecordToDomain = (
  record: FeatureSnapshot | FeatureSnapshotRecord,
): FeatureSnapshotEntity => {
  const base: FeatureSnapshotEntity = {
    id: record.id,
    fixtureId: record.fixtureId,
    bundleId: record.bundleId,
    generatedAt: record.generatedAt.toISOString(),
    bundleStatus: record.bundleStatus as FeatureSnapshotEntity["bundleStatus"],
    gateReasons: asArray<ResearchGateReason>(record.gateReasons),
    recommendedLean: record.recommendedLean as FeatureSnapshotEntity["recommendedLean"],
    evidenceCount: record.evidenceCount,
    topEvidence: asArray<FeatureSnapshotEntity["topEvidence"][number]>(record.topEvidence),
    risks: asStringArray(record.risks),
    features: asRecord(record.features) as unknown as FeatureSnapshotEntity["features"],
    readiness: {
      status: record.readinessStatus as FeatureSnapshotEntity["readiness"]["status"],
      reasons: asStringArray(record.readinessReasons),
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };

  if (!record.researchTrace) {
    return base;
  }

  return {
    ...base,
    researchTrace: asRecord(record.researchTrace) as unknown as NonNullable<
      FeatureSnapshotEntity["researchTrace"]
    >,
  };
};

export const featureSnapshotDomainToCreateInput = (
  entity: FeatureSnapshotEntity,
): Prisma.FeatureSnapshotUncheckedCreateInput => ({
  id: entity.id,
  fixtureId: entity.fixtureId,
  bundleId: entity.bundleId,
  generatedAt: new Date(entity.generatedAt),
  bundleStatus: entity.bundleStatus,
  gateReasons: entity.gateReasons as unknown as Prisma.InputJsonValue,
  recommendedLean: entity.recommendedLean,
  evidenceCount: entity.evidenceCount,
  topEvidence: entity.topEvidence as unknown as Prisma.InputJsonValue,
  risks: entity.risks as unknown as Prisma.InputJsonValue,
  features: entity.features as unknown as Prisma.InputJsonValue,
  readinessStatus: entity.readiness.status,
  readinessReasons: entity.readiness.reasons as unknown as Prisma.InputJsonValue,
  researchTrace:
    entity.researchTrace !== undefined
      ? (entity.researchTrace as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const availabilitySnapshotRecordToDomain = (
  record: AvailabilitySnapshot | AvailabilitySnapshotRecord,
): AvailabilitySnapshotEntity => {
  const base: AvailabilitySnapshotEntity = {
    id: record.id,
    batchId: record.batchId,
    providerFixtureId: record.providerFixtureId,
    providerCode: record.providerCode,
    subjectType: record.subjectType as AvailabilitySnapshotEntity["subjectType"],
    subjectName: record.subjectName,
    status: record.status as AvailabilitySnapshotEntity["status"],
    capturedAt: record.capturedAt.toISOString(),
    summary: record.summary,
    payload: asRecord(record.payload),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(record.fixtureId ? { fixtureId: record.fixtureId } : {}),
  };

  return {
    ...base,
    ...(record.teamSide ? { teamSide: record.teamSide as AvailabilitySnapshotEntity["teamSide"] } : {}),
    ...(record.sourceUpdatedAt ? { sourceUpdatedAt: record.sourceUpdatedAt.toISOString() } : {}),
  } as AvailabilitySnapshotEntity;
};

export const availabilitySnapshotDomainToCreateInput = (
  entity: AvailabilitySnapshotEntity,
): Prisma.AvailabilitySnapshotUncheckedCreateInput => ({
  id: entity.id,
  batchId: entity.batchId,
  fixtureId: entity.fixtureId ?? null,
  providerFixtureId: entity.providerFixtureId,
  providerCode: entity.providerCode,
  teamSide: entity.teamSide ?? null,
  subjectType: entity.subjectType,
  subjectName: entity.subjectName,
  status: entity.status,
  capturedAt: new Date(entity.capturedAt),
  sourceUpdatedAt: toDate(entity.sourceUpdatedAt) ?? null,
  summary: entity.summary,
  payload: entity.payload as Prisma.InputJsonValue,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const lineupSnapshotRecordToDomain = (
  record: LineupSnapshot | LineupSnapshotRecord,
): LineupSnapshotEntity => ({
  id: record.id,
  batchId: record.batchId,
  ...(record.fixtureId ? { fixtureId: record.fixtureId } : {}),
  providerFixtureId: record.providerFixtureId,
  providerCode: record.providerCode,
  teamSide: record.teamSide as LineupSnapshotEntity["teamSide"],
  lineupStatus: record.lineupStatus as LineupSnapshotEntity["lineupStatus"],
  ...(record.formation ? { formation: record.formation } : {}),
  capturedAt: record.capturedAt.toISOString(),
  ...(record.sourceUpdatedAt ? { sourceUpdatedAt: record.sourceUpdatedAt.toISOString() } : {}),
  payload: asRecord(record.payload),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const lineupSnapshotDomainToCreateInput = (
  entity: LineupSnapshotEntity,
): Prisma.LineupSnapshotUncheckedCreateInput => ({
  id: entity.id,
  batchId: entity.batchId,
  fixtureId: entity.fixtureId ?? null,
  providerFixtureId: entity.providerFixtureId,
  providerCode: entity.providerCode,
  teamSide: entity.teamSide,
  lineupStatus: entity.lineupStatus,
  formation: entity.formation ?? null,
  capturedAt: new Date(entity.capturedAt),
  sourceUpdatedAt: toDate(entity.sourceUpdatedAt) ?? null,
  payload: entity.payload as Prisma.InputJsonValue,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const lineupParticipantRecordToDomain = (
  record: LineupParticipant | LineupParticipantRecord,
): LineupParticipantEntity => ({
  id: record.id,
  lineupSnapshotId: record.lineupSnapshotId,
  index: record.index,
  participantName: record.participantName,
  role: record.role as LineupParticipantEntity["role"],
  ...(record.position ? { position: record.position } : {}),
  ...(record.jerseyNumber !== null ? { jerseyNumber: record.jerseyNumber } : {}),
  ...(record.availabilityStatus
    ? {
        availabilityStatus:
          record.availabilityStatus as NonNullable<LineupParticipantEntity["availabilityStatus"]>,
      }
    : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const lineupParticipantDomainToCreateInput = (
  entity: LineupParticipantEntity,
): Prisma.LineupParticipantUncheckedCreateInput => ({
  id: entity.id,
  lineupSnapshotId: entity.lineupSnapshotId,
  index: entity.index,
  participantName: entity.participantName,
  role: entity.role,
  position: entity.position ?? null,
  jerseyNumber: entity.jerseyNumber ?? null,
  availabilityStatus: entity.availabilityStatus ?? null,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});

export const researchAssignmentRecordToDomain = (
  record: ResearchAssignment | ResearchAssignmentRecord,
): ResearchAssignmentEntity => ({
  id: record.id,
  fixtureId: record.fixtureId,
  ...(record.bundleId ? { bundleId: record.bundleId } : {}),
  dimension: record.dimension as ResearchAssignmentEntity["dimension"],
  status: record.status as ResearchAssignmentEntity["status"],
  attemptNumber: record.attemptNumber,
  ...(record.startedAt ? { startedAt: record.startedAt.toISOString() } : {}),
  ...(record.finishedAt ? { finishedAt: record.finishedAt.toISOString() } : {}),
  ...(record.error ? { error: record.error } : {}),
  ...(record.summary ? { summary: record.summary } : {}),
  metadata: asRecord(record.metadata),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const researchAssignmentDomainToCreateInput = (
  entity: ResearchAssignmentEntity,
): Prisma.ResearchAssignmentUncheckedCreateInput => ({
  id: entity.id,
  fixtureId: entity.fixtureId,
  bundleId: entity.bundleId ?? null,
  dimension: entity.dimension,
  status: entity.status,
  attemptNumber: entity.attemptNumber,
  startedAt: toDate(entity.startedAt) ?? null,
  finishedAt: toDate(entity.finishedAt) ?? null,
  error: entity.error ?? null,
  summary: entity.summary ?? null,
  metadata: entity.metadata as Prisma.InputJsonValue,
  createdAt: new Date(entity.createdAt),
  updatedAt: new Date(entity.updatedAt),
});
