import type {
  AiRunEntity,
  AiRunRepository,
  AuditEventEntity,
  AuditEventRepository,
  EntityId,
  FixtureEntity,
  FixtureRepository,
  FixtureWorkflowEntity,
  FixtureWorkflowRepository,
  ParlayEntity,
  ParlayRepository,
  PredictionEntity,
  PredictionRepository,
  SandboxNamespace,
  SandboxNamespaceRepository,
  TaskEntity,
  TaskRepository,
  TaskRunEntity,
  TaskRunRepository,
  ValidationEntity,
  ValidationRepository,
} from "@gana-v8/domain-core";
import type { PrismaClient } from "@prisma/client";

import {
  aiRunDomainToCreateInput,
  aiRunInclude,
  aiRunRecordToDomain,
  auditEventDomainToCreateInput,
  auditEventInclude,
  auditEventRecordToDomain,
  fixtureDomainToCreateInput,
  fixtureInclude,
  fixtureRecordToDomain,
  fixtureWorkflowDomainToCreateInput,
  fixtureWorkflowInclude,
  fixtureWorkflowRecordToDomain,
  parlayDomainToCreateInput,
  parlayInclude,
  parlayRecordToDomain,
  predictionDomainToCreateInput,
  predictionInclude,
  predictionRecordToDomain,
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
} from "./mappers.js";

export type PrismaClientLike = Pick<
  PrismaClient,
  | "fixture"
  | "fixtureWorkflow"
  | "task"
  | "taskRun"
  | "aiRun"
  | "prediction"
  | "parlay"
  | "parlayLeg"
  | "validation"
  | "auditEvent"
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
    const record = await this.client.fixture.findUnique({
      where: { id },
      ...fixtureInclude,
    });
    return record ? fixtureRecordToDomain(record) : null;
  }

  async list(): Promise<FixtureEntity[]> {
    const records = await this.client.fixture.findMany({
      orderBy: { scheduledAt: "asc" },
      ...fixtureInclude,
    });
    return records.map(fixtureRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.fixture.delete({ where: { id } });
  }

  async findByCompetition(competition: string): Promise<FixtureEntity[]> {
    const records = await this.client.fixture.findMany({
      where: { competition },
      orderBy: { scheduledAt: "asc" },
      ...fixtureInclude,
    });
    return records.map(fixtureRecordToDomain);
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
    const record = await this.client.task.findUnique({
      where: { id },
      ...taskInclude,
    });
    return record ? taskRecordToDomain(record) : null;
  }

  async list(): Promise<TaskEntity[]> {
    const records = await this.client.task.findMany({
      orderBy: { createdAt: "asc" },
      ...taskInclude,
    });
    return records.map(taskRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.task.delete({ where: { id } });
  }

  async findByStatus(status: TaskEntity["status"]): Promise<TaskEntity[]> {
    const records = await this.client.task.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      ...taskInclude,
    });
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
    const record = await this.client.fixtureWorkflow.findUnique({
      where: { id },
      ...fixtureWorkflowInclude,
    });
    return record ? fixtureWorkflowRecordToDomain(record) : null;
  }

  async list(): Promise<FixtureWorkflowEntity[]> {
    const records = await this.client.fixtureWorkflow.findMany({
      orderBy: { updatedAt: "asc" },
      ...fixtureWorkflowInclude,
    });
    return records.map(fixtureWorkflowRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.fixtureWorkflow.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<FixtureWorkflowEntity | null> {
    const record = await this.client.fixtureWorkflow.findUnique({
      where: { fixtureId },
      ...fixtureWorkflowInclude,
    });
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
    const record = await this.client.taskRun.findUnique({
      where: { id },
      ...taskRunInclude,
    });
    return record ? taskRunRecordToDomain(record) : null;
  }

  async list(): Promise<TaskRunEntity[]> {
    const records = await this.client.taskRun.findMany({
      orderBy: [{ taskId: "asc" }, { attemptNumber: "asc" }],
      ...taskRunInclude,
    });
    return records.map(taskRunRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.taskRun.delete({ where: { id } });
  }

  async findByTaskId(taskId: EntityId): Promise<TaskRunEntity[]> {
    const records = await this.client.taskRun.findMany({
      where: { taskId },
      orderBy: { attemptNumber: "asc" },
      ...taskRunInclude,
    });
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
    const record = await this.client.aiRun.findUnique({
      where: { id },
      ...aiRunInclude,
    });
    return record ? aiRunRecordToDomain(record) : null;
  }

  async list(): Promise<AiRunEntity[]> {
    const records = await this.client.aiRun.findMany({
      orderBy: { createdAt: "asc" },
      ...aiRunInclude,
    });
    return records.map(aiRunRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.aiRun.delete({ where: { id } });
  }

  async findByTaskId(taskId: EntityId): Promise<AiRunEntity[]> {
    const records = await this.client.aiRun.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      ...aiRunInclude,
    });
    return records.map(aiRunRecordToDomain);
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
    const record = await this.client.prediction.findUnique({
      where: { id },
      ...predictionInclude,
    });
    return record ? predictionRecordToDomain(record) : null;
  }

  async list(): Promise<PredictionEntity[]> {
    const records = await this.client.prediction.findMany({
      orderBy: { createdAt: "asc" },
      ...predictionInclude,
    });
    return records.map(predictionRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.prediction.delete({ where: { id } });
  }

  async findByFixtureId(fixtureId: EntityId): Promise<PredictionEntity[]> {
    const records = await this.client.prediction.findMany({
      where: { fixtureId },
      orderBy: { createdAt: "asc" },
      ...predictionInclude,
    });
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
    const record = await this.client.parlay.findUnique({
      where: { id },
      ...parlayInclude,
    });
    return record ? parlayRecordToDomain(record) : null;
  }

  async list(): Promise<ParlayEntity[]> {
    const records = await this.client.parlay.findMany({
      orderBy: { createdAt: "asc" },
      ...parlayInclude,
    });
    return records.map(parlayRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.parlay.delete({ where: { id } });
  }

  async findByPredictionId(predictionId: EntityId): Promise<ParlayEntity[]> {
    const records = await this.client.parlay.findMany({
      where: { legs: { some: { predictionId } } },
      orderBy: { createdAt: "asc" },
      ...parlayInclude,
    });
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
    const record = await this.client.validation.findUnique({
      where: { id },
      ...validationInclude,
    });
    return record ? validationRecordToDomain(record) : null;
  }

  async list(): Promise<ValidationEntity[]> {
    const records = await this.client.validation.findMany({
      orderBy: { createdAt: "asc" },
      ...validationInclude,
    });
    return records.map(validationRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.validation.delete({ where: { id } });
  }

  async findByTargetId(targetId: EntityId): Promise<ValidationEntity[]> {
    const records = await this.client.validation.findMany({
      where: { targetId },
      orderBy: { createdAt: "asc" },
      ...validationInclude,
    });
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
    const record = await this.client.auditEvent.findUnique({
      where: { id },
      ...auditEventInclude,
    });
    return record ? auditEventRecordToDomain(record) : null;
  }

  async list(): Promise<AuditEventEntity[]> {
    const records = await this.client.auditEvent.findMany({
      orderBy: { occurredAt: "asc" },
      ...auditEventInclude,
    });
    return records.map(auditEventRecordToDomain);
  }

  async delete(id: EntityId): Promise<void> {
    await this.client.auditEvent.delete({ where: { id } });
  }

  async findByAggregate(
    aggregateType: string,
    aggregateId: EntityId,
  ): Promise<AuditEventEntity[]> {
    const records = await this.client.auditEvent.findMany({
      where: { aggregateType, aggregateId },
      orderBy: { occurredAt: "asc" },
      ...auditEventInclude,
    });
    return records.map(auditEventRecordToDomain);
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
