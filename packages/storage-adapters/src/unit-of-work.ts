import type {
  AiRunRepository,
  AuditEventRepository,
  FixtureRepository,
  ParlayRepository,
  PredictionRepository,
  SandboxNamespaceRepository,
  TaskRepository,
  TaskRunRepository,
  ValidationRepository,
} from "@gana-v8/domain-core";

import {
  InMemoryAiRunRepository,
  InMemoryAuditEventRepository,
  InMemoryFixtureRepository,
  InMemoryParlayRepository,
  InMemoryPredictionRepository,
  InMemorySandboxNamespaceRepository,
  InMemoryTaskRepository,
  InMemoryTaskRunRepository,
  InMemoryValidationRepository,
} from "./in-memory.js";
import {
  PrismaAiRunRepository,
  PrismaAuditEventRepository,
  PrismaFixtureRepository,
  PrismaParlayRepository,
  PrismaPredictionRepository,
  PrismaSandboxNamespaceRepository,
  PrismaTaskRepository,
  PrismaTaskRunRepository,
  PrismaValidationRepository,
  type PrismaClientLike,
} from "./prisma/index.js";

export interface StorageUnitOfWork {
  fixtures: FixtureRepository;
  tasks: TaskRepository;
  taskRuns: TaskRunRepository;
  aiRuns: AiRunRepository;
  predictions: PredictionRepository;
  parlays: ParlayRepository;
  validations: ValidationRepository;
  auditEvents: AuditEventRepository;
  sandboxNamespaces: SandboxNamespaceRepository;
}

export type InMemoryUnitOfWork = StorageUnitOfWork;

export interface PrismaUnitOfWork extends StorageUnitOfWork {
  client: PrismaClientLike;
}

export const createInMemoryUnitOfWork = (): InMemoryUnitOfWork => ({
  fixtures: new InMemoryFixtureRepository(),
  tasks: new InMemoryTaskRepository(),
  taskRuns: new InMemoryTaskRunRepository(),
  aiRuns: new InMemoryAiRunRepository(),
  predictions: new InMemoryPredictionRepository(),
  parlays: new InMemoryParlayRepository(),
  validations: new InMemoryValidationRepository(),
  auditEvents: new InMemoryAuditEventRepository(),
  sandboxNamespaces: new InMemorySandboxNamespaceRepository(),
});

export const createPrismaUnitOfWork = (
  client: PrismaClientLike,
): PrismaUnitOfWork => ({
  client,
  fixtures: new PrismaFixtureRepository(client),
  tasks: new PrismaTaskRepository(client),
  taskRuns: new PrismaTaskRunRepository(client),
  aiRuns: new PrismaAiRunRepository(client),
  predictions: new PrismaPredictionRepository(client),
  parlays: new PrismaParlayRepository(client),
  validations: new PrismaValidationRepository(client),
  auditEvents: new PrismaAuditEventRepository(client),
  sandboxNamespaces: new PrismaSandboxNamespaceRepository(client),
});
