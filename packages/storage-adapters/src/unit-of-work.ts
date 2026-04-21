import type {
  AiRunRepository,
  AuditEventRepository,
  DailyAutomationPolicyRepository,
  FixtureRepository,
  FixtureWorkflowRepository,
  LeagueCoveragePolicyRepository,
  ParlayRepository,
  PredictionRepository,
  SandboxNamespaceRepository,
  TaskRepository,
  TaskRunRepository,
  TeamCoveragePolicyRepository,
  ValidationRepository,
} from "@gana-v8/domain-core";

import {
  InMemoryAiRunRepository,
  InMemoryAuditEventRepository,
  InMemoryDailyAutomationPolicyRepository,
  InMemoryFixtureRepository,
  InMemoryFixtureWorkflowRepository,
  InMemoryLeagueCoveragePolicyRepository,
  InMemoryParlayRepository,
  InMemoryPredictionRepository,
  InMemorySandboxNamespaceRepository,
  InMemoryTaskRepository,
  InMemoryTaskRunRepository,
  InMemoryTeamCoveragePolicyRepository,
  InMemoryValidationRepository,
} from "./in-memory.js";
import {
  PrismaAiRunRepository,
  PrismaAuditEventRepository,
  PrismaDailyAutomationPolicyRepository,
  PrismaFixtureRepository,
  PrismaFixtureWorkflowRepository,
  PrismaLeagueCoveragePolicyRepository,
  PrismaParlayRepository,
  PrismaPredictionRepository,
  PrismaSandboxNamespaceRepository,
  PrismaTaskRepository,
  PrismaTaskRunRepository,
  PrismaTeamCoveragePolicyRepository,
  PrismaValidationRepository,
  type PrismaClientLike,
} from "./prisma/index.js";

export interface StorageUnitOfWork {
  fixtures: FixtureRepository;
  fixtureWorkflows: FixtureWorkflowRepository;
  tasks: TaskRepository;
  taskRuns: TaskRunRepository;
  aiRuns: AiRunRepository;
  predictions: PredictionRepository;
  parlays: ParlayRepository;
  validations: ValidationRepository;
  auditEvents: AuditEventRepository;
  leagueCoveragePolicies: LeagueCoveragePolicyRepository;
  teamCoveragePolicies: TeamCoveragePolicyRepository;
  dailyAutomationPolicies: DailyAutomationPolicyRepository;
  sandboxNamespaces: SandboxNamespaceRepository;
}

export type InMemoryUnitOfWork = StorageUnitOfWork;

export interface PrismaUnitOfWork extends StorageUnitOfWork {
  client: PrismaClientLike;
}

export const createInMemoryUnitOfWork = (): InMemoryUnitOfWork => ({
  fixtures: new InMemoryFixtureRepository(),
  fixtureWorkflows: new InMemoryFixtureWorkflowRepository(),
  tasks: new InMemoryTaskRepository(),
  taskRuns: new InMemoryTaskRunRepository(),
  aiRuns: new InMemoryAiRunRepository(),
  predictions: new InMemoryPredictionRepository(),
  parlays: new InMemoryParlayRepository(),
  validations: new InMemoryValidationRepository(),
  auditEvents: new InMemoryAuditEventRepository(),
  leagueCoveragePolicies: new InMemoryLeagueCoveragePolicyRepository(),
  teamCoveragePolicies: new InMemoryTeamCoveragePolicyRepository(),
  dailyAutomationPolicies: new InMemoryDailyAutomationPolicyRepository(),
  sandboxNamespaces: new InMemorySandboxNamespaceRepository(),
});

export const createPrismaUnitOfWork = (
  client: PrismaClientLike,
): PrismaUnitOfWork => ({
  client,
  fixtures: new PrismaFixtureRepository(client),
  fixtureWorkflows: new PrismaFixtureWorkflowRepository(client),
  tasks: new PrismaTaskRepository(client),
  taskRuns: new PrismaTaskRunRepository(client),
  aiRuns: new PrismaAiRunRepository(client),
  predictions: new PrismaPredictionRepository(client),
  parlays: new PrismaParlayRepository(client),
  validations: new PrismaValidationRepository(client),
  auditEvents: new PrismaAuditEventRepository(client),
  leagueCoveragePolicies: new PrismaLeagueCoveragePolicyRepository(client),
  teamCoveragePolicies: new PrismaTeamCoveragePolicyRepository(client),
  dailyAutomationPolicies: new PrismaDailyAutomationPolicyRepository(client),
  sandboxNamespaces: new PrismaSandboxNamespaceRepository(client),
});
