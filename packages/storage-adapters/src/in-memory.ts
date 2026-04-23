import type {
  AvailabilitySnapshotEntity,
  AvailabilitySnapshotRepository,
  AutomationCycleEntity,
  AutomationCycleRepository,
  AiRunEntity,
  AiRunRepository,
  AuditEventEntity,
  AuditEventRepository,
  AuditableEntity,
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
  SandboxCertificationRunPruneResult,
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
  RepositoryPruneOptions,
  RepositoryPruneResult,
  ValidationEntity,
  ValidationRepository,
} from "@gana-v8/domain-core";

const sortByIsoDescending = <T>(
  items: readonly T[],
  selector: (item: T) => string,
): T[] => [...items].sort((left, right) => selector(right).localeCompare(selector(left)));

const buildSandboxCertificationRunKey = (
  item: Pick<SandboxCertificationRunEntity, "profileName" | "packId" | "verificationKind">,
): string => `${item.profileName}::${item.packId}::${item.verificationKind}`;

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

  protected deleteIds(ids: readonly EntityId[]): number {
    let deletedCount = 0;

    for (const id of ids) {
      if (this.items.delete(id)) {
        deletedCount += 1;
      }
    }

    return deletedCount;
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

export class InMemoryAutomationCycleRepository
  extends InMemoryRepository<AutomationCycleEntity>
  implements AutomationCycleRepository {}

export class InMemorySchedulerCursorRepository
  extends InMemoryRepository<SchedulerCursorEntity>
  implements SchedulerCursorRepository {}

export class InMemoryTaskRepository
  extends InMemoryRepository<TaskEntity>
  implements TaskRepository
{
  async findByStatus(status: TaskEntity["status"]): Promise<TaskEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.status === status);
  }
}

export class InMemoryFixtureWorkflowRepository
  extends InMemoryRepository<FixtureWorkflowEntity>
  implements FixtureWorkflowRepository
{
  async findByFixtureId(fixtureId: EntityId): Promise<FixtureWorkflowEntity | null> {
    const items = await this.list();
    return items.find((item) => item.fixtureId === fixtureId) ?? null;
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

export class InMemorySandboxCertificationRunRepository
  extends InMemoryRepository<SandboxCertificationRunEntity>
  implements SandboxCertificationRunRepository
{
  async listByQuery(query: SandboxCertificationRunQuery = {}): Promise<SandboxCertificationRunEntity[]> {
    const items = sortByIsoDescending(await this.list(), (item) => item.generatedAt).filter((item) =>
      (query.profileName ? item.profileName === query.profileName : true) &&
      (query.packId ? item.packId === query.packId : true) &&
      (query.verificationKind ? item.verificationKind === query.verificationKind : true) &&
      (query.status ? item.status === query.status : true),
    );

    return query.limit ? items.slice(0, query.limit) : items;
  }

  async findLatestByProfilePack(
    profileName: string,
    packId: string,
    verificationKind?: SandboxCertificationRunEntity["verificationKind"],
  ): Promise<SandboxCertificationRunEntity | null> {
    return (
      (
        await this.listByQuery({
          profileName,
          packId,
          ...(verificationKind ? { verificationKind } : {}),
          limit: 1,
        })
      )[0] ?? null
    );
  }

  async pruneBefore(options: RepositoryPruneOptions): Promise<SandboxCertificationRunPruneResult> {
    const dryRun = options.dryRun ?? false;
    const items = await this.list();
    const latestGeneratedAtByKey = new Map<string, string>();

    for (const item of items) {
      const key = buildSandboxCertificationRunKey(item);
      const currentLatest = latestGeneratedAtByKey.get(key);
      if (!currentLatest || item.generatedAt > currentLatest) {
        latestGeneratedAtByKey.set(key, item.generatedAt);
      }
    }

    const preservedLatestIds = new Set<EntityId>();
    for (const item of items) {
      if (item.generatedAt >= options.cutoff) {
        continue;
      }

      if (latestGeneratedAtByKey.get(buildSandboxCertificationRunKey(item)) === item.generatedAt) {
        preservedLatestIds.add(item.id);
      }
    }

    const idsToDelete = items
      .filter((item) => item.generatedAt < options.cutoff && !preservedLatestIds.has(item.id))
      .map((item) => item.id);

    return {
      cutoff: options.cutoff,
      dryRun,
      prunableCount: idsToDelete.length,
      deletedCount: dryRun ? 0 : this.deleteIds(idsToDelete),
      preservedLatestCount: preservedLatestIds.size,
    };
  }
}

export class InMemoryOperationalTelemetryEventRepository
  extends InMemoryRepository<OperationalTelemetryEventEntity>
  implements OperationalTelemetryEventRepository
{
  async listByQuery(query: OperationalTelemetryEventQuery = {}): Promise<OperationalTelemetryEventEntity[]> {
    const items = sortByIsoDescending(await this.list(), (item) => item.occurredAt).filter((item) =>
      (query.traceId ? item.traceId === query.traceId : true) &&
      (query.taskId ? item.taskId === query.taskId : true) &&
      (query.taskRunId ? item.taskRunId === query.taskRunId : true) &&
      (query.automationCycleId ? item.automationCycleId === query.automationCycleId : true) &&
      (query.sandboxCertificationRunId ? item.sandboxCertificationRunId === query.sandboxCertificationRunId : true) &&
      (query.severity ? item.severity === query.severity : true) &&
      (query.name ? item.name === query.name : true) &&
      (query.occurredAfter ? item.occurredAt >= query.occurredAfter : true) &&
      (query.occurredBefore ? item.occurredAt <= query.occurredBefore : true),
    );

    return query.limit ? items.slice(0, query.limit) : items;
  }

  async pruneBefore(options: RepositoryPruneOptions): Promise<RepositoryPruneResult> {
    const dryRun = options.dryRun ?? false;
    const idsToDelete = (await this.list())
      .filter((item) => item.occurredAt < options.cutoff)
      .map((item) => item.id);

    return {
      cutoff: options.cutoff,
      dryRun,
      prunableCount: idsToDelete.length,
      deletedCount: dryRun ? 0 : this.deleteIds(idsToDelete),
    };
  }
}

export class InMemoryOperationalMetricSampleRepository
  extends InMemoryRepository<OperationalMetricSampleEntity>
  implements OperationalMetricSampleRepository
{
  async listByQuery(query: OperationalMetricSampleQuery = {}): Promise<OperationalMetricSampleEntity[]> {
    const items = sortByIsoDescending(await this.list(), (item) => item.recordedAt).filter((item) =>
      (query.traceId ? item.traceId === query.traceId : true) &&
      (query.taskId ? item.taskId === query.taskId : true) &&
      (query.taskRunId ? item.taskRunId === query.taskRunId : true) &&
      (query.automationCycleId ? item.automationCycleId === query.automationCycleId : true) &&
      (query.sandboxCertificationRunId ? item.sandboxCertificationRunId === query.sandboxCertificationRunId : true) &&
      (query.name ? item.name === query.name : true) &&
      (query.type ? item.type === query.type : true) &&
      (query.recordedAfter ? item.recordedAt >= query.recordedAfter : true) &&
      (query.recordedBefore ? item.recordedAt <= query.recordedBefore : true),
    );

    return query.limit ? items.slice(0, query.limit) : items;
  }

  async pruneBefore(options: RepositoryPruneOptions): Promise<RepositoryPruneResult> {
    const dryRun = options.dryRun ?? false;
    const idsToDelete = (await this.list())
      .filter((item) => item.recordedAt < options.cutoff)
      .map((item) => item.id);

    return {
      cutoff: options.cutoff,
      dryRun,
      prunableCount: idsToDelete.length,
      deletedCount: dryRun ? 0 : this.deleteIds(idsToDelete),
    };
  }
}

export class InMemoryLeagueCoveragePolicyRepository
  extends InMemoryRepository<LeagueCoveragePolicyEntity>
  implements LeagueCoveragePolicyRepository
{
  async findEnabled(): Promise<LeagueCoveragePolicyEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.enabled);
  }
}

export class InMemoryTeamCoveragePolicyRepository
  extends InMemoryRepository<TeamCoveragePolicyEntity>
  implements TeamCoveragePolicyRepository
{
  async findEnabled(): Promise<TeamCoveragePolicyEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.enabled);
  }
}

export class InMemoryDailyAutomationPolicyRepository
  extends InMemoryRepository<DailyAutomationPolicyEntity>
  implements DailyAutomationPolicyRepository
{
  async findEnabled(): Promise<DailyAutomationPolicyEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.enabled);
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

export class InMemoryResearchBundleRepository
  extends InMemoryRepository<ResearchBundleEntity>
  implements ResearchBundleRepository
{
  async findByFixtureId(fixtureId: EntityId): Promise<ResearchBundleEntity[]> {
    const items = await this.list();
    return items
      .filter((item) => item.fixtureId === fixtureId)
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
  }

  async findLatestByFixtureId(fixtureId: EntityId): Promise<ResearchBundleEntity | null> {
    const items = await this.findByFixtureId(fixtureId);
    return items.at(-1) ?? null;
  }
}

export class InMemoryResearchClaimRepository
  extends InMemoryRepository<ResearchClaimEntity>
  implements ResearchClaimRepository
{
  async findByBundleId(bundleId: EntityId): Promise<ResearchClaimEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.bundleId === bundleId);
  }

  async findByFixtureId(fixtureId: EntityId): Promise<ResearchClaimEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.fixtureId === fixtureId);
  }
}

export class InMemoryResearchSourceRepository
  extends InMemoryRepository<ResearchSourceEntity>
  implements ResearchSourceRepository
{
  async findByBundleId(bundleId: EntityId): Promise<ResearchSourceEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.bundleId === bundleId);
  }

  async findByFixtureId(fixtureId: EntityId): Promise<ResearchSourceEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.fixtureId === fixtureId);
  }
}

export class InMemoryResearchClaimSourceRepository
  extends InMemoryRepository<ResearchClaimSourceEntity>
  implements ResearchClaimSourceRepository
{
  async findByClaimId(claimId: EntityId): Promise<ResearchClaimSourceEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.claimId === claimId);
  }

  async findBySourceId(sourceId: EntityId): Promise<ResearchClaimSourceEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.sourceId === sourceId);
  }
}

export class InMemoryResearchConflictRepository
  extends InMemoryRepository<ResearchConflictEntity>
  implements ResearchConflictRepository
{
  async findByBundleId(bundleId: EntityId): Promise<ResearchConflictEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.bundleId === bundleId);
  }
}

export class InMemoryFeatureSnapshotRepository
  extends InMemoryRepository<FeatureSnapshotEntity>
  implements FeatureSnapshotRepository
{
  async findByFixtureId(fixtureId: EntityId): Promise<FeatureSnapshotEntity[]> {
    const items = await this.list();
    return items
      .filter((item) => item.fixtureId === fixtureId)
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
  }

  async findByBundleId(bundleId: EntityId): Promise<FeatureSnapshotEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.bundleId === bundleId);
  }

  async findLatestByFixtureId(fixtureId: EntityId): Promise<FeatureSnapshotEntity | null> {
    const items = await this.findByFixtureId(fixtureId);
    return items.at(-1) ?? null;
  }
}

export class InMemoryAvailabilitySnapshotRepository
  extends InMemoryRepository<AvailabilitySnapshotEntity>
  implements AvailabilitySnapshotRepository
{
  async findByFixtureId(fixtureId: EntityId): Promise<AvailabilitySnapshotEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.fixtureId === fixtureId);
  }

  async findByBatchId(batchId: EntityId): Promise<AvailabilitySnapshotEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.batchId === batchId);
  }
}

export class InMemoryLineupSnapshotRepository
  extends InMemoryRepository<LineupSnapshotEntity>
  implements LineupSnapshotRepository
{
  async findByFixtureId(fixtureId: EntityId): Promise<LineupSnapshotEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.fixtureId === fixtureId);
  }

  async findByBatchId(batchId: EntityId): Promise<LineupSnapshotEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.batchId === batchId);
  }
}

export class InMemoryLineupParticipantRepository
  extends InMemoryRepository<LineupParticipantEntity>
  implements LineupParticipantRepository
{
  async findByLineupSnapshotId(lineupSnapshotId: EntityId): Promise<LineupParticipantEntity[]> {
    const items = await this.list();
    return items
      .filter((item) => item.lineupSnapshotId === lineupSnapshotId)
      .sort((left, right) => left.index - right.index);
  }
}

export class InMemoryResearchAssignmentRepository
  extends InMemoryRepository<ResearchAssignmentEntity>
  implements ResearchAssignmentRepository
{
  async findByFixtureId(fixtureId: EntityId): Promise<ResearchAssignmentEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.fixtureId === fixtureId);
  }

  async findByBundleId(bundleId: EntityId): Promise<ResearchAssignmentEntity[]> {
    const items = await this.list();
    return items.filter((item) => item.bundleId === bundleId);
  }
}
