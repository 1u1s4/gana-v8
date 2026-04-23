import type {
  AvailabilitySnapshotEntity,
  AvailabilitySnapshotRepository,
  AiRunEntity,
  AiRunRepository,
  AutomationCycleEntity,
  AutomationCycleRepository,
  AuditEventEntity,
  AuditEventRepository,
  DailyAutomationPolicyEntity,
  DailyAutomationPolicyRepository,
  EntityId,
  FeatureSnapshotEntity,
  FeatureSnapshotRepository,
  FixtureEntity,
  FixtureRepository,
  FixtureWorkflowEntity,
  FixtureWorkflowRepository,
  LeagueCoveragePolicyEntity,
  LeagueCoveragePolicyRepository,
  LineupParticipantEntity,
  LineupParticipantRepository,
  LineupSnapshotEntity,
  LineupSnapshotRepository,
  OperationalMetricSampleEntity,
  OperationalMetricSampleQuery,
  OperationalMetricSampleRepository,
  OperationalTelemetryEventEntity,
  OperationalTelemetryEventQuery,
  OperationalTelemetryEventRepository,
  ParlayEntity,
  ParlayRepository,
  PredictionEntity,
  PredictionRepository,
  ResearchAssignmentEntity,
  ResearchAssignmentRepository,
  ResearchBundleEntity,
  ResearchBundleRepository,
  ResearchClaimEntity,
  ResearchClaimRepository,
  ResearchClaimSourceEntity,
  ResearchClaimSourceRepository,
  ResearchConflictEntity,
  ResearchConflictRepository,
  ResearchSourceEntity,
  ResearchSourceRepository,
  SandboxNamespace,
  SandboxCertificationRunEntity,
  SandboxCertificationRunQuery,
  SandboxCertificationRunRepository,
  SandboxNamespaceRepository,
  SchedulerCursorEntity,
  SchedulerCursorRepository,
  TaskEntity,
  TaskRepository,
  TaskRunEntity,
  TaskRunRepository,
  TeamCoveragePolicyEntity,
  TeamCoveragePolicyRepository,
  ValidationEntity,
  ValidationRepository,
} from "@gana-v8/domain-core";
import type { PrismaClient } from "@prisma/client";

import {
  availabilitySnapshotDomainToCreateInput,
  availabilitySnapshotInclude,
  availabilitySnapshotRecordToDomain,
  aiRunDomainToCreateInput,
  aiRunInclude,
  aiRunRecordToDomain,
  automationCycleDomainToCreateInput,
  automationCycleInclude,
  automationCycleRecordToDomain,
  auditEventDomainToCreateInput,
  auditEventInclude,
  auditEventRecordToDomain,
  dailyAutomationPolicyDomainToCreateInput,
  dailyAutomationPolicyInclude,
  dailyAutomationPolicyRecordToDomain,
  featureSnapshotDomainToCreateInput,
  featureSnapshotInclude,
  featureSnapshotRecordToDomain,
  fixtureDomainToCreateInput,
  fixtureInclude,
  fixtureRecordToDomain,
  fixtureWorkflowDomainToCreateInput,
  fixtureWorkflowInclude,
  fixtureWorkflowRecordToDomain,
  leagueCoveragePolicyDomainToCreateInput,
  leagueCoveragePolicyInclude,
  leagueCoveragePolicyRecordToDomain,
  lineupParticipantDomainToCreateInput,
  lineupParticipantInclude,
  lineupParticipantRecordToDomain,
  lineupSnapshotDomainToCreateInput,
  lineupSnapshotInclude,
  lineupSnapshotRecordToDomain,
  operationalMetricSampleDomainToCreateInput,
  operationalMetricSampleInclude,
  operationalMetricSampleRecordToDomain,
  operationalTelemetryEventDomainToCreateInput,
  operationalTelemetryEventInclude,
  operationalTelemetryEventRecordToDomain,
  parlayDomainToCreateInput,
  parlayInclude,
  parlayRecordToDomain,
  predictionDomainToCreateInput,
  predictionInclude,
  predictionRecordToDomain,
  researchAssignmentDomainToCreateInput,
  researchAssignmentInclude,
  researchAssignmentRecordToDomain,
  researchBundleDomainToCreateInput,
  researchBundleInclude,
  researchBundleRecordToDomain,
  researchClaimDomainToCreateInput,
  researchClaimInclude,
  researchClaimRecordToDomain,
  researchClaimSourceDomainToCreateInput,
  researchClaimSourceInclude,
  researchClaimSourceRecordToDomain,
  researchConflictDomainToCreateInput,
  researchConflictInclude,
  researchConflictRecordToDomain,
  researchSourceDomainToCreateInput,
  researchSourceInclude,
  researchSourceRecordToDomain,
  sandboxCertificationRunDomainToCreateInput,
  sandboxCertificationRunInclude,
  sandboxCertificationRunRecordToDomain,
  taskDomainToCreateInput,
  taskInclude,
  taskRecordToDomain,
  taskRunDomainToCreateInput,
  taskRunInclude,
  taskRunRecordToDomain,
  validationDomainToCreateInput,
  validationInclude,
  validationRecordToDomain,
  taskAttemptToTaskRunInput,
  sandboxNamespaceDomainToCreateInput,
  sandboxNamespaceInclude,
  sandboxNamespaceRecordToDomain,
  schedulerCursorDomainToCreateInput,
  schedulerCursorInclude,
  schedulerCursorRecordToDomain,
  teamCoveragePolicyDomainToCreateInput,
  teamCoveragePolicyInclude,
  teamCoveragePolicyRecordToDomain,
} from "./mappers.js";
import { retryPrismaReadOperation } from "./client.js";

export type PrismaClientLike = Pick<
  PrismaClient,
  | "$queryRawUnsafe"
  | "fixture"
  | "automationCycle"
  | "fixtureWorkflow"
  | "schedulerCursor"
  | "task"
  | "taskRun"
  | "aiRun"
  | "researchBundle"
  | "researchClaim"
  | "researchClaimSource"
  | "researchSource"
  | "researchConflict"
  | "featureSnapshot"
  | "availabilitySnapshot"
  | "lineupSnapshot"
  | "lineupParticipant"
  | "researchAssignment"
  | "prediction"
  | "parlay"
  | "parlayLeg"
  | "validation"
  | "auditEvent"
  | "sandboxCertificationRun"
  | "operationalTelemetryEvent"
  | "operationalMetricSample"
  | "rawIngestionBatch"
  | "leagueCoveragePolicy"
  | "teamCoveragePolicy"
  | "dailyAutomationPolicy"
  | "sandboxNamespace"
>;

export class PrismaFixtureRepository implements FixtureRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: FixtureEntity): Promise<FixtureEntity> {
    const record = await this.client.fixture.upsert({
      where: { id: entity.id },
      create: fixtureDomainToCreateInput(entity),
      update: fixtureDomainToCreateInput(entity),
      ...fixtureInclude,
    });
    return fixtureRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<FixtureEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.fixture.findUnique({
        where: { id },
        ...fixtureInclude,
      }),
    );
    return record ? fixtureRecordToDomain(record) : null;
  }

  async list(): Promise<FixtureEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.fixture.findMany({
        orderBy: { scheduledAt: "asc" },
        ...fixtureInclude,
      }),
    );
    return records.map(fixtureRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.fixture.delete({ where: { id } });
  }

  async findByCompetition(competition: string): Promise<FixtureEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.fixture.findMany({
        where: { competition },
        orderBy: { scheduledAt: "asc" },
        ...fixtureInclude,
      }),
    );
    return records.map(fixtureRecordToDomain);
  }
}

export class PrismaAutomationCycleRepository implements AutomationCycleRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: AutomationCycleEntity): Promise<AutomationCycleEntity> {
    const record = await this.client.automationCycle.upsert({
      where: { id: entity.id },
      create: automationCycleDomainToCreateInput(entity),
      update: automationCycleDomainToCreateInput(entity),
      ...automationCycleInclude,
    });
    return automationCycleRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<AutomationCycleEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.automationCycle.findUnique({
        where: { id },
        ...automationCycleInclude,
      }),
    );
    return record ? automationCycleRecordToDomain(record) : null;
  }

  async list(): Promise<AutomationCycleEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.automationCycle.findMany({
        orderBy: { startedAt: "desc" },
        ...automationCycleInclude,
      }),
    );
    return records.map(automationCycleRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.automationCycle.delete({ where: { id } });
  }
}

export class PrismaSchedulerCursorRepository implements SchedulerCursorRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: SchedulerCursorEntity): Promise<SchedulerCursorEntity> {
    const record = await this.client.schedulerCursor.upsert({
      where: { id: entity.id },
      create: schedulerCursorDomainToCreateInput(entity),
      update: schedulerCursorDomainToCreateInput(entity),
      ...schedulerCursorInclude,
    });
    return schedulerCursorRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<SchedulerCursorEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.schedulerCursor.findUnique({
        where: { id },
        ...schedulerCursorInclude,
      }),
    );
    return record ? schedulerCursorRecordToDomain(record) : null;
  }

  async list(): Promise<SchedulerCursorEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.schedulerCursor.findMany({
        orderBy: { updatedAt: "asc" },
        ...schedulerCursorInclude,
      }),
    );
    return records.map(schedulerCursorRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.schedulerCursor.delete({ where: { id } });
  }
}

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: TaskEntity): Promise<TaskEntity> {
    const record = await this.client.task.upsert({
      where: { id: entity.id },
      create: {
        ...taskDomainToCreateInput(entity),
        taskRuns: {
          create: entity.attempts.map((attempt, index) =>
            taskAttemptToTaskRunInput(entity.id, attempt, index + 1),
          ),
        },
      },
      update: {
        ...taskDomainToCreateInput(entity),
      },
      ...taskInclude,
    });
    return taskRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<TaskEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.task.findUnique({
        where: { id },
        ...taskInclude,
      }),
    );
    return record ? taskRecordToDomain(record) : null;
  }

  async list(): Promise<TaskEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.task.findMany({
        orderBy: { createdAt: "asc" },
        ...taskInclude,
      }),
    );
    return records.map(taskRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.task.delete({ where: { id } });
  }

  async findByStatus(status: TaskEntity["status"]): Promise<TaskEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.task.findMany({
        where: { status },
        orderBy: { createdAt: "asc" },
        ...taskInclude,
      }),
    );
    return records.map(taskRecordToDomain);
  }
}

export class PrismaFixtureWorkflowRepository implements FixtureWorkflowRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: FixtureWorkflowEntity): Promise<FixtureWorkflowEntity> {
    const record = await this.client.fixtureWorkflow.upsert({
      where: { id: entity.id },
      create: fixtureWorkflowDomainToCreateInput(entity),
      update: fixtureWorkflowDomainToCreateInput(entity),
      ...fixtureWorkflowInclude,
    });
    return fixtureWorkflowRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<FixtureWorkflowEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.fixtureWorkflow.findUnique({
        where: { id },
        ...fixtureWorkflowInclude,
      }),
    );
    return record ? fixtureWorkflowRecordToDomain(record) : null;
  }

  async list(): Promise<FixtureWorkflowEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.fixtureWorkflow.findMany({
        orderBy: { updatedAt: "asc" },
        ...fixtureWorkflowInclude,
      }),
    );
    return records.map(fixtureWorkflowRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.fixtureWorkflow.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<FixtureWorkflowEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.fixtureWorkflow.findUnique({
        where: { fixtureId },
        ...fixtureWorkflowInclude,
      }),
    );
    return record ? fixtureWorkflowRecordToDomain(record) : null;
  }
}

export class PrismaTaskRunRepository implements TaskRunRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: TaskRunEntity): Promise<TaskRunEntity> {
    const record = await this.client.taskRun.upsert({
      where: { id: entity.id },
      create: taskRunDomainToCreateInput(entity),
      update: taskRunDomainToCreateInput(entity),
      ...taskRunInclude,
    });
    return taskRunRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<TaskRunEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.taskRun.findUnique({
        where: { id },
        ...taskRunInclude,
      }),
    );
    return record ? taskRunRecordToDomain(record) : null;
  }

  async list(): Promise<TaskRunEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.taskRun.findMany({
        orderBy: [{ taskId: "asc" }, { attemptNumber: "asc" }],
        ...taskRunInclude,
      }),
    );
    return records.map(taskRunRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.taskRun.delete({ where: { id } });
  }

  async findByTaskId(taskId: EntityId): Promise<TaskRunEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.taskRun.findMany({
        where: { taskId },
        orderBy: { attemptNumber: "asc" },
        ...taskRunInclude,
      }),
    );
    return records.map(taskRunRecordToDomain);
  }
}

export class PrismaAiRunRepository implements AiRunRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: AiRunEntity): Promise<AiRunEntity> {
    const record = await this.client.aiRun.upsert({
      where: { id: entity.id },
      create: aiRunDomainToCreateInput(entity),
      update: aiRunDomainToCreateInput(entity),
      ...aiRunInclude,
    });
    return aiRunRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<AiRunEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.aiRun.findUnique({
        where: { id },
        ...aiRunInclude,
      }),
    );
    return record ? aiRunRecordToDomain(record) : null;
  }

  async list(): Promise<AiRunEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.aiRun.findMany({
        orderBy: { createdAt: "asc" },
        ...aiRunInclude,
      }),
    );
    return records.map(aiRunRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.aiRun.delete({ where: { id } });
  }

  async findByTaskId(taskId: EntityId): Promise<AiRunEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.aiRun.findMany({
        where: { taskId },
        orderBy: { createdAt: "asc" },
        ...aiRunInclude,
      }),
    );
    return records.map(aiRunRecordToDomain);
  }
}

export class PrismaResearchBundleRepository implements ResearchBundleRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ResearchBundleEntity): Promise<ResearchBundleEntity> {
    const record = await this.client.researchBundle.upsert({
      where: { id: entity.id },
      create: researchBundleDomainToCreateInput(entity),
      update: researchBundleDomainToCreateInput(entity),
      ...researchBundleInclude,
    });
    return researchBundleRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ResearchBundleEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.researchBundle.findUnique({
        where: { id },
        ...researchBundleInclude,
      }),
    );
    return record ? researchBundleRecordToDomain(record) : null;
  }

  async list(): Promise<ResearchBundleEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.researchBundle.findMany({
        orderBy: { generatedAt: "asc" },
        ...researchBundleInclude,
      }),
    );
    return records.map(researchBundleRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.researchBundle.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<ResearchBundleEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.researchBundle.findMany({
        where: { fixtureId },
        orderBy: { generatedAt: "asc" },
        ...researchBundleInclude,
      }),
    );
    return records.map(researchBundleRecordToDomain);
  }

  async findLatestByFixtureId(fixtureId: EntityId): Promise<ResearchBundleEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.researchBundle.findFirst({
        where: { fixtureId },
        orderBy: { generatedAt: "desc" },
        ...researchBundleInclude,
      }),
    );
    return record ? researchBundleRecordToDomain(record) : null;
  }
}

export class PrismaResearchClaimRepository implements ResearchClaimRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ResearchClaimEntity): Promise<ResearchClaimEntity> {
    const record = await this.client.researchClaim.upsert({
      where: { id: entity.id },
      create: researchClaimDomainToCreateInput(entity),
      update: researchClaimDomainToCreateInput(entity),
      ...researchClaimInclude,
    });
    return researchClaimRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ResearchClaimEntity | null> {
    const record = await this.client.researchClaim.findUnique({
      where: { id },
      ...researchClaimInclude,
    });
    return record ? researchClaimRecordToDomain(record) : null;
  }

  async list(): Promise<ResearchClaimEntity[]> {
    const records = await this.client.researchClaim.findMany({
      orderBy: { extractedAt: "asc" },
      ...researchClaimInclude,
    });
    return records.map(researchClaimRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.researchClaim.delete({ where: { id } });
  }

  async findByBundleId(bundleId: EntityId): Promise<ResearchClaimEntity[]> {
    const records = await this.client.researchClaim.findMany({
      where: { bundleId },
      orderBy: { extractedAt: "asc" },
      ...researchClaimInclude,
    });
    return records.map(researchClaimRecordToDomain);
  }

  async findByFixtureId(fixtureId: EntityId): Promise<ResearchClaimEntity[]> {
    const records = await this.client.researchClaim.findMany({
      where: { fixtureId },
      orderBy: { extractedAt: "asc" },
      ...researchClaimInclude,
    });
    return records.map(researchClaimRecordToDomain);
  }
}

export class PrismaResearchSourceRepository implements ResearchSourceRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ResearchSourceEntity): Promise<ResearchSourceEntity> {
    const record = await this.client.researchSource.upsert({
      where: { id: entity.id },
      create: researchSourceDomainToCreateInput(entity),
      update: researchSourceDomainToCreateInput(entity),
      ...researchSourceInclude,
    });
    return researchSourceRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ResearchSourceEntity | null> {
    const record = await this.client.researchSource.findUnique({
      where: { id },
      ...researchSourceInclude,
    });
    return record ? researchSourceRecordToDomain(record) : null;
  }

  async list(): Promise<ResearchSourceEntity[]> {
    const records = await this.client.researchSource.findMany({
      orderBy: { capturedAt: "asc" },
      ...researchSourceInclude,
    });
    return records.map(researchSourceRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.researchSource.delete({ where: { id } });
  }

  async findByBundleId(bundleId: EntityId): Promise<ResearchSourceEntity[]> {
    const records = await this.client.researchSource.findMany({
      where: { bundleId },
      orderBy: { capturedAt: "asc" },
      ...researchSourceInclude,
    });
    return records.map(researchSourceRecordToDomain);
  }

  async findByFixtureId(fixtureId: EntityId): Promise<ResearchSourceEntity[]> {
    const records = await this.client.researchSource.findMany({
      where: { fixtureId },
      orderBy: { capturedAt: "asc" },
      ...researchSourceInclude,
    });
    return records.map(researchSourceRecordToDomain);
  }
}

export class PrismaResearchClaimSourceRepository implements ResearchClaimSourceRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ResearchClaimSourceEntity): Promise<ResearchClaimSourceEntity> {
    const record = await this.client.researchClaimSource.upsert({
      where: { id: entity.id },
      create: researchClaimSourceDomainToCreateInput(entity),
      update: researchClaimSourceDomainToCreateInput(entity),
      ...researchClaimSourceInclude,
    });
    return researchClaimSourceRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ResearchClaimSourceEntity | null> {
    const record = await this.client.researchClaimSource.findUnique({
      where: { id },
      ...researchClaimSourceInclude,
    });
    return record ? researchClaimSourceRecordToDomain(record) : null;
  }

  async list(): Promise<ResearchClaimSourceEntity[]> {
    const records = await this.client.researchClaimSource.findMany({
      orderBy: [{ claimId: "asc" }, { orderIndex: "asc" }],
      ...researchClaimSourceInclude,
    });
    return records.map(researchClaimSourceRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.researchClaimSource.delete({ where: { id } });
  }

  async findByClaimId(claimId: EntityId): Promise<ResearchClaimSourceEntity[]> {
    const records = await this.client.researchClaimSource.findMany({
      where: { claimId },
      orderBy: { orderIndex: "asc" },
      ...researchClaimSourceInclude,
    });
    return records.map(researchClaimSourceRecordToDomain);
  }

  async findBySourceId(sourceId: EntityId): Promise<ResearchClaimSourceEntity[]> {
    const records = await this.client.researchClaimSource.findMany({
      where: { sourceId },
      orderBy: { orderIndex: "asc" },
      ...researchClaimSourceInclude,
    });
    return records.map(researchClaimSourceRecordToDomain);
  }
}

export class PrismaResearchConflictRepository implements ResearchConflictRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ResearchConflictEntity): Promise<ResearchConflictEntity> {
    const record = await this.client.researchConflict.upsert({
      where: { id: entity.id },
      create: researchConflictDomainToCreateInput(entity),
      update: researchConflictDomainToCreateInput(entity),
      ...researchConflictInclude,
    });
    return researchConflictRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ResearchConflictEntity | null> {
    const record = await this.client.researchConflict.findUnique({
      where: { id },
      ...researchConflictInclude,
    });
    return record ? researchConflictRecordToDomain(record) : null;
  }

  async list(): Promise<ResearchConflictEntity[]> {
    const records = await this.client.researchConflict.findMany({
      orderBy: { createdAt: "asc" },
      ...researchConflictInclude,
    });
    return records.map(researchConflictRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.researchConflict.delete({ where: { id } });
  }

  async findByBundleId(bundleId: EntityId): Promise<ResearchConflictEntity[]> {
    const records = await this.client.researchConflict.findMany({
      where: { bundleId },
      orderBy: { createdAt: "asc" },
      ...researchConflictInclude,
    });
    return records.map(researchConflictRecordToDomain);
  }
}

export class PrismaFeatureSnapshotRepository implements FeatureSnapshotRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: FeatureSnapshotEntity): Promise<FeatureSnapshotEntity> {
    const record = await this.client.featureSnapshot.upsert({
      where: { id: entity.id },
      create: featureSnapshotDomainToCreateInput(entity),
      update: featureSnapshotDomainToCreateInput(entity),
      ...featureSnapshotInclude,
    });
    return featureSnapshotRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<FeatureSnapshotEntity | null> {
    const record = await this.client.featureSnapshot.findUnique({
      where: { id },
      ...featureSnapshotInclude,
    });
    return record ? featureSnapshotRecordToDomain(record) : null;
  }

  async list(): Promise<FeatureSnapshotEntity[]> {
    const records = await this.client.featureSnapshot.findMany({
      orderBy: { generatedAt: "asc" },
      ...featureSnapshotInclude,
    });
    return records.map(featureSnapshotRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.featureSnapshot.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<FeatureSnapshotEntity[]> {
    const records = await this.client.featureSnapshot.findMany({
      where: { fixtureId },
      orderBy: { generatedAt: "asc" },
      ...featureSnapshotInclude,
    });
    return records.map(featureSnapshotRecordToDomain);
  }

  async findByBundleId(bundleId: EntityId): Promise<FeatureSnapshotEntity[]> {
    const records = await this.client.featureSnapshot.findMany({
      where: { bundleId },
      orderBy: { generatedAt: "asc" },
      ...featureSnapshotInclude,
    });
    return records.map(featureSnapshotRecordToDomain);
  }

  async findLatestByFixtureId(fixtureId: EntityId): Promise<FeatureSnapshotEntity | null> {
    const record = await this.client.featureSnapshot.findFirst({
      where: { fixtureId },
      orderBy: { generatedAt: "desc" },
      ...featureSnapshotInclude,
    });
    return record ? featureSnapshotRecordToDomain(record) : null;
  }
}

export class PrismaAvailabilitySnapshotRepository implements AvailabilitySnapshotRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: AvailabilitySnapshotEntity): Promise<AvailabilitySnapshotEntity> {
    const record = await this.client.availabilitySnapshot.upsert({
      where: { id: entity.id },
      create: availabilitySnapshotDomainToCreateInput(entity),
      update: availabilitySnapshotDomainToCreateInput(entity),
      ...availabilitySnapshotInclude,
    });
    return availabilitySnapshotRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<AvailabilitySnapshotEntity | null> {
    const record = await this.client.availabilitySnapshot.findUnique({
      where: { id },
      ...availabilitySnapshotInclude,
    });
    return record ? availabilitySnapshotRecordToDomain(record) : null;
  }

  async list(): Promise<AvailabilitySnapshotEntity[]> {
    const records = await this.client.availabilitySnapshot.findMany({
      orderBy: { capturedAt: "asc" },
      ...availabilitySnapshotInclude,
    });
    return records.map(availabilitySnapshotRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.availabilitySnapshot.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<AvailabilitySnapshotEntity[]> {
    const records = await this.client.availabilitySnapshot.findMany({
      where: { fixtureId },
      orderBy: { capturedAt: "asc" },
      ...availabilitySnapshotInclude,
    });
    return records.map(availabilitySnapshotRecordToDomain);
  }

  async findByBatchId(batchId: EntityId): Promise<AvailabilitySnapshotEntity[]> {
    const records = await this.client.availabilitySnapshot.findMany({
      where: { batchId },
      orderBy: { capturedAt: "asc" },
      ...availabilitySnapshotInclude,
    });
    return records.map(availabilitySnapshotRecordToDomain);
  }
}

export class PrismaLineupSnapshotRepository implements LineupSnapshotRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: LineupSnapshotEntity): Promise<LineupSnapshotEntity> {
    const record = await this.client.lineupSnapshot.upsert({
      where: { id: entity.id },
      create: lineupSnapshotDomainToCreateInput(entity),
      update: lineupSnapshotDomainToCreateInput(entity),
      ...lineupSnapshotInclude,
    });
    return lineupSnapshotRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<LineupSnapshotEntity | null> {
    const record = await this.client.lineupSnapshot.findUnique({
      where: { id },
      ...lineupSnapshotInclude,
    });
    return record ? lineupSnapshotRecordToDomain(record) : null;
  }

  async list(): Promise<LineupSnapshotEntity[]> {
    const records = await this.client.lineupSnapshot.findMany({
      orderBy: { capturedAt: "asc" },
      ...lineupSnapshotInclude,
    });
    return records.map(lineupSnapshotRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.lineupSnapshot.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<LineupSnapshotEntity[]> {
    const records = await this.client.lineupSnapshot.findMany({
      where: { fixtureId },
      orderBy: { capturedAt: "asc" },
      ...lineupSnapshotInclude,
    });
    return records.map(lineupSnapshotRecordToDomain);
  }

  async findByBatchId(batchId: EntityId): Promise<LineupSnapshotEntity[]> {
    const records = await this.client.lineupSnapshot.findMany({
      where: { batchId },
      orderBy: { capturedAt: "asc" },
      ...lineupSnapshotInclude,
    });
    return records.map(lineupSnapshotRecordToDomain);
  }
}

export class PrismaLineupParticipantRepository implements LineupParticipantRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: LineupParticipantEntity): Promise<LineupParticipantEntity> {
    const record = await this.client.lineupParticipant.upsert({
      where: { id: entity.id },
      create: lineupParticipantDomainToCreateInput(entity),
      update: lineupParticipantDomainToCreateInput(entity),
      ...lineupParticipantInclude,
    });
    return lineupParticipantRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<LineupParticipantEntity | null> {
    const record = await this.client.lineupParticipant.findUnique({
      where: { id },
      ...lineupParticipantInclude,
    });
    return record ? lineupParticipantRecordToDomain(record) : null;
  }

  async list(): Promise<LineupParticipantEntity[]> {
    const records = await this.client.lineupParticipant.findMany({
      orderBy: [{ lineupSnapshotId: "asc" }, { index: "asc" }],
      ...lineupParticipantInclude,
    });
    return records.map(lineupParticipantRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.lineupParticipant.delete({ where: { id } });
  }

  async findByLineupSnapshotId(lineupSnapshotId: EntityId): Promise<LineupParticipantEntity[]> {
    const records = await this.client.lineupParticipant.findMany({
      where: { lineupSnapshotId },
      orderBy: { index: "asc" },
      ...lineupParticipantInclude,
    });
    return records.map(lineupParticipantRecordToDomain);
  }
}

export class PrismaResearchAssignmentRepository implements ResearchAssignmentRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ResearchAssignmentEntity): Promise<ResearchAssignmentEntity> {
    const record = await this.client.researchAssignment.upsert({
      where: { id: entity.id },
      create: researchAssignmentDomainToCreateInput(entity),
      update: researchAssignmentDomainToCreateInput(entity),
      ...researchAssignmentInclude,
    });
    return researchAssignmentRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ResearchAssignmentEntity | null> {
    const record = await this.client.researchAssignment.findUnique({
      where: { id },
      ...researchAssignmentInclude,
    });
    return record ? researchAssignmentRecordToDomain(record) : null;
  }

  async list(): Promise<ResearchAssignmentEntity[]> {
    const records = await this.client.researchAssignment.findMany({
      orderBy: { createdAt: "asc" },
      ...researchAssignmentInclude,
    });
    return records.map(researchAssignmentRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.researchAssignment.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<ResearchAssignmentEntity[]> {
    const records = await this.client.researchAssignment.findMany({
      where: { fixtureId },
      orderBy: { createdAt: "asc" },
      ...researchAssignmentInclude,
    });
    return records.map(researchAssignmentRecordToDomain);
  }

  async findByBundleId(bundleId: EntityId): Promise<ResearchAssignmentEntity[]> {
    const records = await this.client.researchAssignment.findMany({
      where: { bundleId },
      orderBy: { createdAt: "asc" },
      ...researchAssignmentInclude,
    });
    return records.map(researchAssignmentRecordToDomain);
  }
}

export class PrismaPredictionRepository implements PredictionRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: PredictionEntity): Promise<PredictionEntity> {
    const record = await this.client.prediction.upsert({
      where: { id: entity.id },
      create: predictionDomainToCreateInput(entity),
      update: predictionDomainToCreateInput(entity),
      ...predictionInclude,
    });
    return predictionRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<PredictionEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.prediction.findUnique({
        where: { id },
        ...predictionInclude,
      }),
    );
    return record ? predictionRecordToDomain(record) : null;
  }

  async list(): Promise<PredictionEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.prediction.findMany({
        orderBy: { createdAt: "asc" },
        ...predictionInclude,
      }),
    );
    return records.map(predictionRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.prediction.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<PredictionEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.prediction.findMany({
        where: { fixtureId },
        orderBy: { createdAt: "asc" },
        ...predictionInclude,
      }),
    );
    return records.map(predictionRecordToDomain);
  }
}

export class PrismaParlayRepository implements ParlayRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ParlayEntity): Promise<ParlayEntity> {
    const record = await this.client.parlay.upsert({
      where: { id: entity.id },
      create: {
        ...parlayDomainToCreateInput(entity),
        legs: {
          create: entity.legs.map((leg, index) => ({
            id: `${entity.id}:leg:${index}`,
            index,
            predictionId: leg.predictionId,
            fixtureId: leg.fixtureId,
            market: leg.market,
            outcome: leg.outcome,
            price: leg.price,
            status: leg.status,
          })),
        },
      },
      update: {
        ...parlayDomainToCreateInput(entity),
        legs: {
          deleteMany: {},
          create: entity.legs.map((leg, index) => ({
            id: `${entity.id}:leg:${index}`,
            index,
            predictionId: leg.predictionId,
            fixtureId: leg.fixtureId,
            market: leg.market,
            outcome: leg.outcome,
            price: leg.price,
            status: leg.status,
          })),
        },
      },
      ...parlayInclude,
    });
    return parlayRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ParlayEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.parlay.findUnique({
        where: { id },
        ...parlayInclude,
      }),
    );
    return record ? parlayRecordToDomain(record) : null;
  }

  async list(): Promise<ParlayEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.parlay.findMany({
        orderBy: { createdAt: "asc" },
        ...parlayInclude,
      }),
    );
    return records.map(parlayRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.parlay.delete({ where: { id } });
  }

  async findByPredictionId(predictionId: EntityId): Promise<ParlayEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.parlay.findMany({
        where: { legs: { some: { predictionId } } },
        orderBy: { createdAt: "asc" },
        ...parlayInclude,
      }),
    );
    return records.map(parlayRecordToDomain);
  }
}

export class PrismaValidationRepository implements ValidationRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: ValidationEntity): Promise<ValidationEntity> {
    const record = await this.client.validation.upsert({
      where: { id: entity.id },
      create: validationDomainToCreateInput(entity),
      update: validationDomainToCreateInput(entity),
      ...validationInclude,
    });
    return validationRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<ValidationEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.validation.findUnique({
        where: { id },
        ...validationInclude,
      }),
    );
    return record ? validationRecordToDomain(record) : null;
  }

  async list(): Promise<ValidationEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.validation.findMany({
        orderBy: { createdAt: "asc" },
        ...validationInclude,
      }),
    );
    return records.map(validationRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.validation.delete({ where: { id } });
  }

  async findByTargetId(targetId: EntityId): Promise<ValidationEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.validation.findMany({
        where: { targetId },
        orderBy: { createdAt: "asc" },
        ...validationInclude,
      }),
    );
    return records.map(validationRecordToDomain);
  }
}

export class PrismaAuditEventRepository implements AuditEventRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: AuditEventEntity): Promise<AuditEventEntity> {
    const record = await this.client.auditEvent.upsert({
      where: { id: entity.id },
      create: auditEventDomainToCreateInput(entity),
      update: auditEventDomainToCreateInput(entity),
      ...auditEventInclude,
    });
    return auditEventRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<AuditEventEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.auditEvent.findUnique({
        where: { id },
        ...auditEventInclude,
      }),
    );
    return record ? auditEventRecordToDomain(record) : null;
  }

  async list(): Promise<AuditEventEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.auditEvent.findMany({
        orderBy: { occurredAt: "asc" },
        ...auditEventInclude,
      }),
    );
    return records.map(auditEventRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.auditEvent.delete({ where: { id } });
  }

  async findByAggregate(
    aggregateType: string,
    aggregateId: EntityId,
  ): Promise<AuditEventEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.auditEvent.findMany({
        where: { aggregateType, aggregateId },
        orderBy: { occurredAt: "asc" },
        ...auditEventInclude,
      }),
    );
    return records.map(auditEventRecordToDomain);
  }
}

export class PrismaSandboxCertificationRunRepository implements SandboxCertificationRunRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: SandboxCertificationRunEntity): Promise<SandboxCertificationRunEntity> {
    const record = await this.client.sandboxCertificationRun.upsert({
      where: { id: entity.id },
      create: sandboxCertificationRunDomainToCreateInput(entity),
      update: sandboxCertificationRunDomainToCreateInput(entity),
      ...sandboxCertificationRunInclude,
    });
    return sandboxCertificationRunRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<SandboxCertificationRunEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.sandboxCertificationRun.findUnique({
        where: { id },
        ...sandboxCertificationRunInclude,
      }),
    );
    return record ? sandboxCertificationRunRecordToDomain(record) : null;
  }

  async list(): Promise<SandboxCertificationRunEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.sandboxCertificationRun.findMany({
        orderBy: { generatedAt: "desc" },
        ...sandboxCertificationRunInclude,
      }),
    );
    return records.map(sandboxCertificationRunRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.sandboxCertificationRun.delete({ where: { id } });
  }

  async listByQuery(query: SandboxCertificationRunQuery = {}): Promise<SandboxCertificationRunEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.sandboxCertificationRun.findMany({
        where: {
          ...(query.profileName ? { profileName: query.profileName } : {}),
          ...(query.packId ? { packId: query.packId } : {}),
          ...(query.verificationKind
            ? { verificationKind: query.verificationKind.replaceAll("-", "_") as never }
            : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        orderBy: { generatedAt: "desc" },
        ...(query.limit ? { take: query.limit } : {}),
        ...sandboxCertificationRunInclude,
      }),
    );
    return records.map(sandboxCertificationRunRecordToDomain);
  }

  async findLatestByProfilePack(
    profileName: string,
    packId: string,
    verificationKind?: SandboxCertificationRunEntity["verificationKind"],
  ): Promise<SandboxCertificationRunEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.sandboxCertificationRun.findFirst({
        where: {
          profileName,
          packId,
          ...(verificationKind ? { verificationKind: verificationKind.replaceAll("-", "_") as never } : {}),
        },
        orderBy: { generatedAt: "desc" },
        ...sandboxCertificationRunInclude,
      }),
    );
    return record ? sandboxCertificationRunRecordToDomain(record) : null;
  }
}

export class PrismaOperationalTelemetryEventRepository implements OperationalTelemetryEventRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: OperationalTelemetryEventEntity): Promise<OperationalTelemetryEventEntity> {
    const record = await this.client.operationalTelemetryEvent.upsert({
      where: { id: entity.id },
      create: operationalTelemetryEventDomainToCreateInput(entity),
      update: operationalTelemetryEventDomainToCreateInput(entity),
      ...operationalTelemetryEventInclude,
    });
    return operationalTelemetryEventRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<OperationalTelemetryEventEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.operationalTelemetryEvent.findUnique({
        where: { id },
        ...operationalTelemetryEventInclude,
      }),
    );
    return record ? operationalTelemetryEventRecordToDomain(record) : null;
  }

  async list(): Promise<OperationalTelemetryEventEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.operationalTelemetryEvent.findMany({
        orderBy: { occurredAt: "desc" },
        ...operationalTelemetryEventInclude,
      }),
    );
    return records.map(operationalTelemetryEventRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.operationalTelemetryEvent.delete({ where: { id } });
  }

  async listByQuery(query: OperationalTelemetryEventQuery = {}): Promise<OperationalTelemetryEventEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.operationalTelemetryEvent.findMany({
        where: {
          ...(query.traceId ? { traceId: query.traceId } : {}),
          ...(query.taskId ? { taskId: query.taskId } : {}),
          ...(query.taskRunId ? { taskRunId: query.taskRunId } : {}),
          ...(query.automationCycleId ? { automationCycleId: query.automationCycleId } : {}),
          ...(query.sandboxCertificationRunId
            ? { sandboxCertificationRunId: query.sandboxCertificationRunId }
            : {}),
          ...(query.severity ? { severity: query.severity } : {}),
          ...(query.name ? { name: query.name } : {}),
          ...((query.occurredAfter || query.occurredBefore)
            ? {
                occurredAt: {
                  ...(query.occurredAfter ? { gte: new Date(query.occurredAfter) } : {}),
                  ...(query.occurredBefore ? { lte: new Date(query.occurredBefore) } : {}),
                },
              }
            : {}),
        },
        orderBy: { occurredAt: "desc" },
        ...(query.limit ? { take: query.limit } : {}),
        ...operationalTelemetryEventInclude,
      }),
    );
    return records.map(operationalTelemetryEventRecordToDomain);
  }
}

export class PrismaOperationalMetricSampleRepository implements OperationalMetricSampleRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: OperationalMetricSampleEntity): Promise<OperationalMetricSampleEntity> {
    const record = await this.client.operationalMetricSample.upsert({
      where: { id: entity.id },
      create: operationalMetricSampleDomainToCreateInput(entity),
      update: operationalMetricSampleDomainToCreateInput(entity),
      ...operationalMetricSampleInclude,
    });
    return operationalMetricSampleRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<OperationalMetricSampleEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.operationalMetricSample.findUnique({
        where: { id },
        ...operationalMetricSampleInclude,
      }),
    );
    return record ? operationalMetricSampleRecordToDomain(record) : null;
  }

  async list(): Promise<OperationalMetricSampleEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.operationalMetricSample.findMany({
        orderBy: { recordedAt: "desc" },
        ...operationalMetricSampleInclude,
      }),
    );
    return records.map(operationalMetricSampleRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.operationalMetricSample.delete({ where: { id } });
  }

  async listByQuery(query: OperationalMetricSampleQuery = {}): Promise<OperationalMetricSampleEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.operationalMetricSample.findMany({
        where: {
          ...(query.traceId ? { traceId: query.traceId } : {}),
          ...(query.taskId ? { taskId: query.taskId } : {}),
          ...(query.taskRunId ? { taskRunId: query.taskRunId } : {}),
          ...(query.automationCycleId ? { automationCycleId: query.automationCycleId } : {}),
          ...(query.sandboxCertificationRunId
            ? { sandboxCertificationRunId: query.sandboxCertificationRunId }
            : {}),
          ...(query.name ? { name: query.name } : {}),
          ...(query.type ? { type: query.type } : {}),
          ...((query.recordedAfter || query.recordedBefore)
            ? {
                recordedAt: {
                  ...(query.recordedAfter ? { gte: new Date(query.recordedAfter) } : {}),
                  ...(query.recordedBefore ? { lte: new Date(query.recordedBefore) } : {}),
                },
              }
            : {}),
        },
        orderBy: { recordedAt: "desc" },
        ...(query.limit ? { take: query.limit } : {}),
        ...operationalMetricSampleInclude,
      }),
    );
    return records.map(operationalMetricSampleRecordToDomain);
  }
}

export class PrismaLeagueCoveragePolicyRepository implements LeagueCoveragePolicyRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: LeagueCoveragePolicyEntity): Promise<LeagueCoveragePolicyEntity> {
    const record = await this.client.leagueCoveragePolicy.upsert({
      where: { id: entity.id },
      create: leagueCoveragePolicyDomainToCreateInput(entity),
      update: leagueCoveragePolicyDomainToCreateInput(entity),
      ...leagueCoveragePolicyInclude,
    });
    return leagueCoveragePolicyRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<LeagueCoveragePolicyEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.leagueCoveragePolicy.findUnique({
        where: { id },
        ...leagueCoveragePolicyInclude,
      }));
    return record ? leagueCoveragePolicyRecordToDomain(record) : null;
  }

  async list(): Promise<LeagueCoveragePolicyEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.leagueCoveragePolicy.findMany({
        orderBy: [{ priority: "desc" }, { leagueName: "asc" }],
        ...leagueCoveragePolicyInclude,
      }));
    return records.map(leagueCoveragePolicyRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.leagueCoveragePolicy.delete({ where: { id } });
  }

  async findEnabled(): Promise<LeagueCoveragePolicyEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.leagueCoveragePolicy.findMany({
        where: { enabled: true },
        orderBy: [{ priority: "desc" }, { leagueName: "asc" }],
        ...leagueCoveragePolicyInclude,
      }));
    return records.map(leagueCoveragePolicyRecordToDomain);
  }
}

export class PrismaTeamCoveragePolicyRepository implements TeamCoveragePolicyRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: TeamCoveragePolicyEntity): Promise<TeamCoveragePolicyEntity> {
    const record = await this.client.teamCoveragePolicy.upsert({
      where: { id: entity.id },
      create: teamCoveragePolicyDomainToCreateInput(entity),
      update: teamCoveragePolicyDomainToCreateInput(entity),
      ...teamCoveragePolicyInclude,
    });
    return teamCoveragePolicyRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<TeamCoveragePolicyEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.teamCoveragePolicy.findUnique({
        where: { id },
        ...teamCoveragePolicyInclude,
      }));
    return record ? teamCoveragePolicyRecordToDomain(record) : null;
  }

  async list(): Promise<TeamCoveragePolicyEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.teamCoveragePolicy.findMany({
        orderBy: [{ priority: "desc" }, { teamName: "asc" }],
        ...teamCoveragePolicyInclude,
      }));
    return records.map(teamCoveragePolicyRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.teamCoveragePolicy.delete({ where: { id } });
  }

  async findEnabled(): Promise<TeamCoveragePolicyEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.teamCoveragePolicy.findMany({
        where: { enabled: true },
        orderBy: [{ priority: "desc" }, { teamName: "asc" }],
        ...teamCoveragePolicyInclude,
      }));
    return records.map(teamCoveragePolicyRecordToDomain);
  }
}

export class PrismaDailyAutomationPolicyRepository implements DailyAutomationPolicyRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: DailyAutomationPolicyEntity): Promise<DailyAutomationPolicyEntity> {
    const record = await this.client.dailyAutomationPolicy.upsert({
      where: { id: entity.id },
      create: dailyAutomationPolicyDomainToCreateInput(entity),
      update: dailyAutomationPolicyDomainToCreateInput(entity),
      ...dailyAutomationPolicyInclude,
    });
    return dailyAutomationPolicyRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<DailyAutomationPolicyEntity | null> {
    const record = await retryPrismaReadOperation(() =>
      this.client.dailyAutomationPolicy.findUnique({
        where: { id },
        ...dailyAutomationPolicyInclude,
      }));
    return record ? dailyAutomationPolicyRecordToDomain(record) : null;
  }

  async list(): Promise<DailyAutomationPolicyEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.dailyAutomationPolicy.findMany({
        orderBy: { policyName: "asc" },
        ...dailyAutomationPolicyInclude,
      }));
    return records.map(dailyAutomationPolicyRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.dailyAutomationPolicy.delete({ where: { id } });
  }

  async findEnabled(): Promise<DailyAutomationPolicyEntity[]> {
    const records = await retryPrismaReadOperation(() =>
      this.client.dailyAutomationPolicy.findMany({
        where: { enabled: true },
        orderBy: { policyName: "asc" },
        ...dailyAutomationPolicyInclude,
      }));
    return records.map(dailyAutomationPolicyRecordToDomain);
  }
}

export class PrismaSandboxNamespaceRepository implements SandboxNamespaceRepository {
  constructor(private readonly client: PrismaClientLike) {}

  async save(entity: SandboxNamespace): Promise<SandboxNamespace> {
    const record = await this.client.sandboxNamespace.upsert({
      where: { id: entity.id },
      create: sandboxNamespaceDomainToCreateInput(entity),
      update: sandboxNamespaceDomainToCreateInput(entity),
      ...sandboxNamespaceInclude,
    });
    return sandboxNamespaceRecordToDomain(record);
  }

  async getById(id: EntityId): Promise<SandboxNamespace | null> {
    const record = await this.client.sandboxNamespace.findUnique({
      where: { id },
      ...sandboxNamespaceInclude,
    });
    return record ? sandboxNamespaceRecordToDomain(record) : null;
  }

  async list(): Promise<SandboxNamespace[]> {
    const records = await this.client.sandboxNamespace.findMany({
      orderBy: { createdAt: "asc" },
      ...sandboxNamespaceInclude,
    });
    return records.map(sandboxNamespaceRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.sandboxNamespace.delete({ where: { id } });
  }

  async findByEnvironment(
    environment: SandboxNamespace["environment"],
  ): Promise<SandboxNamespace[]> {
    const records = await this.client.sandboxNamespace.findMany({
      where: { environment },
      orderBy: { createdAt: "asc" },
      ...sandboxNamespaceInclude,
    });
    return records.map(sandboxNamespaceRecordToDomain);
  }
}
