import type {
  AiRunEntity,
  AiRunRepository,
  AuditEventEntity,
  AuditEventRepository,
  AuditableEntity,
  EntityId,
  FixtureEntity,
  FixtureRepository,
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

class InMemoryRepository<T extends AuditableEntity> {
  protected readonly items = new Map<EntityId, T>();

  async save(entity: T): Promise<T> {
    this.items.set(entity.id, structuredClone(entity));
    return structuredClone(entity);
  }

  async getById(id: EntityId): Promise<T | null> {
    const item = this.items.get(id);
    return item ? structuredClone(item) : null;
  }

  async list(): Promise<T[]> {
    return Array.from(this.items.values(), (item) => structuredClone(item));
  }

  async delete(id: EntityId): Promise<void> {
    this.items.delete(id);
  }
}

export class InMemoryFixtureRepository
  extends InMemoryRepository<FixtureEntity>
  implements FixtureRepository
{
  async findByCompetition(competition: string): Promise<FixtureEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.competition === competition);
  }
}

export class InMemoryTaskRepository
  extends InMemoryRepository<TaskEntity>
  implements TaskRepository
{
  async findByStatus(status: TaskEntity["status"]): Promise<TaskEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.status === status);
  }
}

export class InMemoryTaskRunRepository
  extends InMemoryRepository<TaskRunEntity>
  implements TaskRunRepository
{
  async findByTaskId(taskId: EntityId): Promise<TaskRunEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.taskId === taskId);
  }
}

export class InMemoryAiRunRepository
  extends InMemoryRepository<AiRunEntity>
  implements AiRunRepository
{
  async findByTaskId(taskId: EntityId): Promise<AiRunEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.taskId === taskId);
  }
}

export class InMemoryPredictionRepository
  extends InMemoryRepository<PredictionEntity>
  implements PredictionRepository
{
  async findByFixtureId(fixtureId: EntityId): Promise<PredictionEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.fixtureId === fixtureId);
  }
}

export class InMemoryParlayRepository
  extends InMemoryRepository<ParlayEntity>
  implements ParlayRepository
{
  async findByPredictionId(predictionId: EntityId): Promise<ParlayEntity[]> {
    const items = await this.list();
    return items.filter((item) =>
      item.legs.some((leg) => leg.predictionId === predictionId),
    );
  }
}

export class InMemoryValidationRepository
  extends InMemoryRepository<ValidationEntity>
  implements ValidationRepository
{
  async findByTargetId(targetId: EntityId): Promise<ValidationEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.targetId === targetId);
  }
}

export class InMemoryAuditEventRepository
  extends InMemoryRepository<AuditEventEntity>
  implements AuditEventRepository
{
  async findByAggregate(
    aggregateType: string,
    aggregateId: EntityId,
  ): Promise<AuditEventEntity[]> {
    const items = await this.list();
    return items.filter(
      (item) =>
        item.aggregateType === aggregateType && item.aggregateId === aggregateId,
    );
  }
}

export class InMemorySandboxNamespaceRepository
  extends InMemoryRepository<SandboxNamespace>
  implements SandboxNamespaceRepository
{
  async findByEnvironment(
    environment: SandboxNamespace["environment"],
  ): Promise<SandboxNamespace[]> {
    const items = await this.list();
    return items.filter((item) => item.environment === environment);
  }
}
