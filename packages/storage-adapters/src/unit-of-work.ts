import type {
  AvailabilitySnapshotRepository,
  AiRunRepository,
  AuditEventRepository,
  DailyAutomationPolicyRepository,
  FeatureSnapshotRepository,
  FixtureRepository,
  FixtureWorkflowRepository,
  LeagueCoveragePolicyRepository,
  LineupParticipantRepository,
  LineupSnapshotRepository,
  ParlayRepository,
  PredictionRepository,
  ResearchAssignmentRepository,
  ResearchBundleRepository,
  ResearchClaimRepository,
  ResearchClaimSourceRepository,
  ResearchConflictRepository,
  ResearchSourceRepository,
  SandboxNamespaceRepository,
  TaskRepository,
  TaskRunRepository,
  TeamCoveragePolicyRepository,
  ValidationRepository,
} from "@gana-v8/domain-core";

import {
  InMemoryAvailabilitySnapshotRepository,
  InMemoryAiRunRepository,
  InMemoryAuditEventRepository,
  InMemoryDailyAutomationPolicyRepository,
  InMemoryFeatureSnapshotRepository,
  InMemoryFixtureRepository,
  InMemoryFixtureWorkflowRepository,
  InMemoryLeagueCoveragePolicyRepository,
  InMemoryLineupParticipantRepository,
  InMemoryLineupSnapshotRepository,
  InMemoryParlayRepository,
  InMemoryPredictionRepository,
  InMemoryResearchAssignmentRepository,
  InMemoryResearchBundleRepository,
  InMemoryResearchClaimRepository,
  InMemoryResearchClaimSourceRepository,
  InMemoryResearchConflictRepository,
  InMemoryResearchSourceRepository,
  InMemorySandboxNamespaceRepository,
  InMemoryTaskRepository,
  InMemoryTaskRunRepository,
  InMemoryTeamCoveragePolicyRepository,
  InMemoryValidationRepository,
} from "./in-memory.js";
import {
  PrismaAvailabilitySnapshotRepository,
  PrismaAiRunRepository,
  PrismaAuditEventRepository,
  PrismaDailyAutomationPolicyRepository,
  PrismaFeatureSnapshotRepository,
  PrismaFixtureRepository,
  PrismaFixtureWorkflowRepository,
  PrismaLeagueCoveragePolicyRepository,
  PrismaLineupParticipantRepository,
  PrismaLineupSnapshotRepository,
  PrismaParlayRepository,
  PrismaPredictionRepository,
  PrismaResearchAssignmentRepository,
  PrismaResearchBundleRepository,
  PrismaResearchClaimRepository,
  PrismaResearchClaimSourceRepository,
  PrismaResearchConflictRepository,
  PrismaResearchSourceRepository,
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
  researchBundles: ResearchBundleRepository;
  researchClaims: ResearchClaimRepository;
  researchSources: ResearchSourceRepository;
  researchClaimSources: ResearchClaimSourceRepository;
  researchConflicts: ResearchConflictRepository;
  featureSnapshots: FeatureSnapshotRepository;
  availabilitySnapshots: AvailabilitySnapshotRepository;
  lineupSnapshots: LineupSnapshotRepository;
  lineupParticipants: LineupParticipantRepository;
  researchAssignments: ResearchAssignmentRepository;
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
  researchBundles: new InMemoryResearchBundleRepository(),
  researchClaims: new InMemoryResearchClaimRepository(),
  researchSources: new InMemoryResearchSourceRepository(),
  researchClaimSources: new InMemoryResearchClaimSourceRepository(),
  researchConflicts: new InMemoryResearchConflictRepository(),
  featureSnapshots: new InMemoryFeatureSnapshotRepository(),
  availabilitySnapshots: new InMemoryAvailabilitySnapshotRepository(),
  lineupSnapshots: new InMemoryLineupSnapshotRepository(),
  lineupParticipants: new InMemoryLineupParticipantRepository(),
  researchAssignments: new InMemoryResearchAssignmentRepository(),
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
  researchBundles: new PrismaResearchBundleRepository(client),
  researchClaims: new PrismaResearchClaimRepository(client),
  researchSources: new PrismaResearchSourceRepository(client),
  researchClaimSources: new PrismaResearchClaimSourceRepository(client),
  researchConflicts: new PrismaResearchConflictRepository(client),
  featureSnapshots: new PrismaFeatureSnapshotRepository(client),
  availabilitySnapshots: new PrismaAvailabilitySnapshotRepository(client),
  lineupSnapshots: new PrismaLineupSnapshotRepository(client),
  lineupParticipants: new PrismaLineupParticipantRepository(client),
  researchAssignments: new PrismaResearchAssignmentRepository(client),
  predictions: new PrismaPredictionRepository(client),
  parlays: new PrismaParlayRepository(client),
  validations: new PrismaValidationRepository(client),
  auditEvents: new PrismaAuditEventRepository(client),
  leagueCoveragePolicies: new PrismaLeagueCoveragePolicyRepository(client),
  teamCoveragePolicies: new PrismaTeamCoveragePolicyRepository(client),
  dailyAutomationPolicies: new PrismaDailyAutomationPolicyRepository(client),
  sandboxNamespaces: new PrismaSandboxNamespaceRepository(client),
});
