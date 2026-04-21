import type { EntityId, Repository } from './common.js';
import type { AuditEventEntity } from './entities/audit-event.js';
import type { AiRunEntity } from './entities/ai-run.js';
import type { DailyAutomationPolicyEntity } from './entities/daily-automation-policy.js';
import type { FixtureEntity } from './entities/fixture.js';
import type { FixtureWorkflowEntity } from './entities/fixture-workflow.js';
import type { LeagueCoveragePolicyEntity } from './entities/league-coverage-policy.js';
import type { ParlayEntity } from './entities/parlay.js';
import type { PredictionEntity } from './entities/prediction.js';
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
