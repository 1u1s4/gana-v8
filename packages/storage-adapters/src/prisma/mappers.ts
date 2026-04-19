import type {
  AiRunEntity,
  AuditEventEntity,
  FixtureEntity,
  FixtureManualSelectionStatus,
  FixtureSelectionOverride,
  FixtureWorkflowEntity,
  ParlayEntity,
  ParlayLeg,
  PredictionEntity,
  SandboxNamespace,
  TaskAttempt,
  TaskEntity,
  TaskKind,
  TaskTriggerKind,
  TaskRunEntity,
  TaskRunStatus,
  ValidationCheck,
  ValidationEntity,
  ValidationKind,
  ValidationTargetType,
  WorkflowStageStatus,
} from "@gana-v8/domain-core";
import {
  Prisma,
  type AiRun,
  type AuditEvent,
  type Environment as PrismaEnvironment,
  type Fixture,
  type FixtureManualSelectionStatus as PrismaFixtureManualSelectionStatus,
  type FixtureSelectionOverride as PrismaFixtureSelectionOverride,
  type FixtureWorkflow,
  type Parlay,
  type ParlayLeg as PrismaParlayLeg,
  type Prediction,
  type PredictionMarket as PrismaPredictionMarket,
  type SandboxNamespace as PrismaSandboxNamespace,
  type Task,
  type TaskKind as PrismaTaskKind,
  type TaskTriggerKind as PrismaTaskTriggerKind,
  type TaskRun,
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

export const fixtureInclude = Prisma.validator<Prisma.FixtureDefaultArgs>()({});
export type FixtureRecord = Prisma.FixtureGetPayload<typeof fixtureInclude>;

export const fixtureWorkflowInclude = Prisma.validator<Prisma.FixtureWorkflowDefaultArgs>()({});
export type FixtureWorkflowRecord = Prisma.FixtureWorkflowGetPayload<typeof fixtureWorkflowInclude>;

export const taskInclude = Prisma.validator<Prisma.TaskDefaultArgs>()({
  include: { taskRuns: { orderBy: { attemptNumber: "asc" } } },
});
export type TaskRecord = Prisma.TaskGetPayload<typeof taskInclude>;

export const taskRunInclude = Prisma.validator<Prisma.TaskRunDefaultArgs>()({});
export type TaskRunRecord = Prisma.TaskRunGetPayload<typeof taskRunInclude>;

export const aiRunInclude = Prisma.validator<Prisma.AiRunDefaultArgs>()({});
export type AiRunRecord = Prisma.AiRunGetPayload<typeof aiRunInclude>;

export const predictionInclude = Prisma.validator<Prisma.PredictionDefaultArgs>()({});
export type PredictionRecord = Prisma.PredictionGetPayload<typeof predictionInclude>;

export const parlayInclude = Prisma.validator<Prisma.ParlayDefaultArgs>()({
  include: { legs: { orderBy: { index: "asc" } } },
});
export type ParlayRecord = Prisma.ParlayGetPayload<typeof parlayInclude>;

export const validationInclude = Prisma.validator<Prisma.ValidationDefaultArgs>()({});
export type ValidationRecord = Prisma.ValidationGetPayload<typeof validationInclude>;

export const auditEventInclude = Prisma.validator<Prisma.AuditEventDefaultArgs>()({});
export type AuditEventRecord = Prisma.AuditEventGetPayload<typeof auditEventInclude>;

export const sandboxNamespaceInclude = Prisma.validator<Prisma.SandboxNamespaceDefaultArgs>()({});
export type SandboxNamespaceRecord = Prisma.SandboxNamespaceGetPayload<
  typeof sandboxNamespaceInclude
>;

export const taskAttemptToTaskRunInput = (
  taskId: string,
  attempt: TaskAttempt,
  attemptNumber: number,
): Prisma.TaskRunCreateWithoutTaskInput => ({
  id: `${taskId}:attempt:${attemptNumber}`,
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
    payload: asRecord(record.payload),
    attempts: taskRuns.map(taskRunToTaskAttempt),
    ...(record.scheduledFor ? { scheduledFor: record.scheduledFor.toISOString() } : {}),
    maxAttempts: record.maxAttempts ?? 3,
    ...(record.lastErrorMessage ? { lastErrorMessage: record.lastErrorMessage } : {}),
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
  payload: entity.payload as Prisma.InputJsonValue,
  scheduledFor: toDate(entity.scheduledFor) ?? null,
  maxAttempts: entity.maxAttempts,
  lastErrorMessage: entity.lastErrorMessage ?? null,
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
