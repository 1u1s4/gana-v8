import type { EntityId, Repository } from './common.js';
import type { AuditEventEntity } from './entities/audit-event.js';
import type { AiRunEntity } from './entities/ai-run.js';
import type { DailyAutomationPolicyEntity } from './entities/daily-automation-policy.js';
import type { AvailabilitySnapshotEntity } from './entities/availability-snapshot.js';
import type { FeatureSnapshotEntity } from './entities/feature-snapshot.js';
import type { FixtureEntity } from './entities/fixture.js';
import type { FixtureWorkflowEntity } from './entities/fixture-workflow.js';
import type { LeagueCoveragePolicyEntity } from './entities/league-coverage-policy.js';
import type { LineupParticipantEntity, LineupSnapshotEntity } from './entities/lineup-snapshot.js';
import type { ParlayEntity } from './entities/parlay.js';
import type { PredictionEntity } from './entities/prediction.js';
import type {
  ResearchAssignmentEntity,
  ResearchBundleEntity,
  ResearchClaimEntity,
  ResearchClaimSourceEntity,
  ResearchConflictEntity,
  ResearchSourceEntity,
} from './entities/research.js';
import type { SandboxNamespace } from './entities/sandbox.js';
import type { TaskEntity } from './entities/task.js';
import type { TaskRunEntity } from './entities/task-run.js';
import type { TeamCoveragePolicyEntity } from './entities/team-coverage-policy.js';
import type { ValidationEntity } from './entities/validation.js';

export interface FixtureRepository extends Repository<FixtureEntity> {
  findByCompetition(competition: string): Promise<FixtureEntity[]>;
}

export interface TaskRepository extends Repository<TaskEntity> {
  findByStatus(status: TaskEntity['status']): Promise<TaskEntity[]>;
}

export interface FixtureWorkflowRepository extends Repository<FixtureWorkflowEntity> {
  findByFixtureId(fixtureId: EntityId): Promise<FixtureWorkflowEntity | null>;
}

export interface AiRunRepository extends Repository<AiRunEntity> {
  findByTaskId(taskId: EntityId): Promise<AiRunEntity[]>;
}

export interface TaskRunRepository extends Repository<TaskRunEntity> {
  findByTaskId(taskId: EntityId): Promise<TaskRunEntity[]>;
}

export interface PredictionRepository extends Repository<PredictionEntity> {
  findByFixtureId(fixtureId: EntityId): Promise<PredictionEntity[]>;
}

export interface ParlayRepository extends Repository<ParlayEntity> {
  findByPredictionId(predictionId: EntityId): Promise<ParlayEntity[]>;
}

export interface ValidationRepository extends Repository<ValidationEntity> {
  findByTargetId(targetId: EntityId): Promise<ValidationEntity[]>;
}

export interface AuditEventRepository extends Repository<AuditEventEntity> {
  findByAggregate(aggregateType: string, aggregateId: EntityId): Promise<AuditEventEntity[]>;
}

export interface LeagueCoveragePolicyRepository extends Repository<LeagueCoveragePolicyEntity> {
  findEnabled(): Promise<LeagueCoveragePolicyEntity[]>;
}

export interface TeamCoveragePolicyRepository extends Repository<TeamCoveragePolicyEntity> {
  findEnabled(): Promise<TeamCoveragePolicyEntity[]>;
}

export interface DailyAutomationPolicyRepository extends Repository<DailyAutomationPolicyEntity> {
  findEnabled(): Promise<DailyAutomationPolicyEntity[]>;
}

export interface SandboxNamespaceRepository extends Repository<SandboxNamespace> {
  findByEnvironment(environment: SandboxNamespace['environment']): Promise<SandboxNamespace[]>;
}

export interface ResearchBundleRepository extends Repository<ResearchBundleEntity> {
  findByFixtureId(fixtureId: EntityId): Promise<ResearchBundleEntity[]>;
  findLatestByFixtureId(fixtureId: EntityId): Promise<ResearchBundleEntity | null>;
}

export interface ResearchClaimRepository extends Repository<ResearchClaimEntity> {
  findByBundleId(bundleId: EntityId): Promise<ResearchClaimEntity[]>;
  findByFixtureId(fixtureId: EntityId): Promise<ResearchClaimEntity[]>;
}

export interface ResearchSourceRepository extends Repository<ResearchSourceEntity> {
  findByBundleId(bundleId: EntityId): Promise<ResearchSourceEntity[]>;
  findByFixtureId(fixtureId: EntityId): Promise<ResearchSourceEntity[]>;
}

export interface ResearchClaimSourceRepository extends Repository<ResearchClaimSourceEntity> {
  findByClaimId(claimId: EntityId): Promise<ResearchClaimSourceEntity[]>;
  findBySourceId(sourceId: EntityId): Promise<ResearchClaimSourceEntity[]>;
}

export interface ResearchConflictRepository extends Repository<ResearchConflictEntity> {
  findByBundleId(bundleId: EntityId): Promise<ResearchConflictEntity[]>;
}

export interface FeatureSnapshotRepository extends Repository<FeatureSnapshotEntity> {
  findByFixtureId(fixtureId: EntityId): Promise<FeatureSnapshotEntity[]>;
  findByBundleId(bundleId: EntityId): Promise<FeatureSnapshotEntity[]>;
  findLatestByFixtureId(fixtureId: EntityId): Promise<FeatureSnapshotEntity | null>;
}

export interface AvailabilitySnapshotRepository extends Repository<AvailabilitySnapshotEntity> {
  findByFixtureId(fixtureId: EntityId): Promise<AvailabilitySnapshotEntity[]>;
  findByBatchId(batchId: EntityId): Promise<AvailabilitySnapshotEntity[]>;
}

export interface LineupSnapshotRepository extends Repository<LineupSnapshotEntity> {
  findByFixtureId(fixtureId: EntityId): Promise<LineupSnapshotEntity[]>;
  findByBatchId(batchId: EntityId): Promise<LineupSnapshotEntity[]>;
}

export interface LineupParticipantRepository extends Repository<LineupParticipantEntity> {
  findByLineupSnapshotId(lineupSnapshotId: EntityId): Promise<LineupParticipantEntity[]>;
}

export interface ResearchAssignmentRepository extends Repository<ResearchAssignmentEntity> {
  findByFixtureId(fixtureId: EntityId): Promise<ResearchAssignmentEntity[]>;
  findByBundleId(bundleId: EntityId): Promise<ResearchAssignmentEntity[]>;
}
