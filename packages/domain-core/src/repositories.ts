import type { EntityId, Repository } from './common.js';
import type { AiRunEntity } from './entities/ai-run.js';
import type { FixtureEntity } from './entities/fixture.js';
import type { ParlayEntity } from './entities/parlay.js';
import type { PredictionEntity } from './entities/prediction.js';
import type { SandboxNamespace } from './entities/sandbox.js';
import type { TaskEntity } from './entities/task.js';
import type { ValidationEntity } from './entities/validation.js';

export interface FixtureRepository extends Repository<FixtureEntity> {
  findByCompetition(competition: string): Promise<FixtureEntity[]>;
}

export interface TaskRepository extends Repository<TaskEntity> {
  findByStatus(status: TaskEntity['status']): Promise<TaskEntity[]>;
}

export interface AiRunRepository extends Repository<AiRunEntity> {
  findByTaskId(taskId: EntityId): Promise<AiRunEntity[]>;
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

export interface SandboxNamespaceRepository extends Repository<SandboxNamespace> {
  findByEnvironment(environment: SandboxNamespace['environment']): Promise<SandboxNamespace[]>;
}
