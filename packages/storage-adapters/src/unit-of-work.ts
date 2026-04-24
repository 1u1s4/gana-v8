import type {
  AvailabilitySnapshotRepository,
  AiRunRepository,
  AutomationCycleRepository,
  AuditEventRepository,
  DailyAutomationPolicyRepository,
  FeatureSnapshotRepository,
  FixtureStatisticSnapshotRepository,
  FixtureRepository,
  FixtureWorkflowRepository,
  LeagueCoveragePolicyRepository,
  LineupParticipantRepository,
  LineupSnapshotRepository,
  OperationalMetricSampleRepository,
  OperationalTelemetryEventRepository,
  ParlayRepository,
  PredictionRepository,
  RuntimeReleaseSnapshotRepository,
  ResearchAssignmentRepository,
  ResearchBundleRepository,
  ResearchClaimRepository,
  ResearchClaimSourceRepository,
  ResearchConflictRepository,
  ResearchSourceRepository,
  SandboxCertificationRunRepository,
  SandboxNamespaceRepository,
  SchedulerCursorRepository,
  TaskRepository,
  TaskRunRepository,
  TeamCoveragePolicyRepository,
  ValidationRepository,
} from "@gana-v8/domain-core";

import {
  InMemoryAvailabilitySnapshotRepository,
  InMemoryAiRunRepository,
  InMemoryAutomationCycleRepository,
  InMemoryAuditEventRepository,
  InMemoryDailyAutomationPolicyRepository,
  InMemoryFeatureSnapshotRepository,
  InMemoryFixtureStatisticSnapshotRepository,
  InMemoryFixtureRepository,
  InMemoryFixtureWorkflowRepository,
  InMemoryLeagueCoveragePolicyRepository,
  InMemoryLineupParticipantRepository,
  InMemoryLineupSnapshotRepository,
  InMemoryOperationalMetricSampleRepository,
  InMemoryOperationalTelemetryEventRepository,
  InMemoryParlayRepository,
  InMemoryPredictionRepository,
  InMemoryRuntimeReleaseSnapshotRepository,
  InMemoryResearchAssignmentRepository,
  InMemoryResearchBundleRepository,
  InMemoryResearchClaimRepository,
  InMemoryResearchClaimSourceRepository,
  InMemoryResearchConflictRepository,
  InMemoryResearchSourceRepository,
  InMemorySandboxCertificationRunRepository,
  InMemorySandboxNamespaceRepository,
  InMemorySchedulerCursorRepository,
  InMemoryTaskRepository,
  InMemoryTaskRunRepository,
  InMemoryTeamCoveragePolicyRepository,
  InMemoryValidationRepository,
} from "./in-memory.js";
import {
  PrismaAvailabilitySnapshotRepository,
  PrismaAiRunRepository,
  PrismaAutomationCycleRepository,
  PrismaAuditEventRepository,
  PrismaDailyAutomationPolicyRepository,
  PrismaFeatureSnapshotRepository,
  PrismaFixtureStatisticSnapshotRepository,
  PrismaFixtureRepository,
  PrismaFixtureWorkflowRepository,
  PrismaLeagueCoveragePolicyRepository,
  PrismaLineupParticipantRepository,
  PrismaLineupSnapshotRepository,
  PrismaOperationalMetricSampleRepository,
  PrismaOperationalTelemetryEventRepository,
  PrismaParlayRepository,
  PrismaPredictionRepository,
  PrismaRuntimeReleaseSnapshotRepository,
  PrismaResearchAssignmentRepository,
  PrismaResearchBundleRepository,
  PrismaResearchClaimRepository,
  PrismaResearchClaimSourceRepository,
  PrismaResearchConflictRepository,
  PrismaResearchSourceRepository,
  PrismaSandboxCertificationRunRepository,
  PrismaSandboxNamespaceRepository,
  PrismaSchedulerCursorRepository,
  PrismaTaskRepository,
  PrismaTaskRunRepository,
  PrismaTeamCoveragePolicyRepository,
  PrismaValidationRepository,
  type PrismaClientLike,
} from "./prisma/index.js";

export interface StorageUnitOfWork {
  fixtures: FixtureRepository;
  automationCycles: AutomationCycleRepository;
  fixtureWorkflows: FixtureWorkflowRepository;
  schedulerCursors: SchedulerCursorRepository;
  tasks: TaskRepository;
  taskRuns: TaskRunRepository;
  aiRuns: AiRunRepository;
  researchBundles: ResearchBundleRepository;
  researchClaims: ResearchClaimRepository;
  researchSources: ResearchSourceRepository;
  researchClaimSources: ResearchClaimSourceRepository;
  researchConflicts: ResearchConflictRepository;
  featureSnapshots: FeatureSnapshotRepository;
  fixtureStatisticSnapshots: FixtureStatisticSnapshotRepository;
  availabilitySnapshots: AvailabilitySnapshotRepository;
  lineupSnapshots: LineupSnapshotRepository;
  lineupParticipants: LineupParticipantRepository;
  researchAssignments: ResearchAssignmentRepository;
  predictions: PredictionRepository;
  parlays: ParlayRepository;
  validations: ValidationRepository;
  auditEvents: AuditEventRepository;
  sandboxCertificationRuns: SandboxCertificationRunRepository;
  runtimeReleaseSnapshots: RuntimeReleaseSnapshotRepository;
  telemetryEvents: OperationalTelemetryEventRepository;
  metricSamples: OperationalMetricSampleRepository;
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
  automationCycles: new InMemoryAutomationCycleRepository(),
  fixtureWorkflows: new InMemoryFixtureWorkflowRepository(),
  schedulerCursors: new InMemorySchedulerCursorRepository(),
  tasks: new InMemoryTaskRepository(),
  taskRuns: new InMemoryTaskRunRepository(),
  aiRuns: new InMemoryAiRunRepository(),
  researchBundles: new InMemoryResearchBundleRepository(),
  researchClaims: new InMemoryResearchClaimRepository(),
  researchSources: new InMemoryResearchSourceRepository(),
  researchClaimSources: new InMemoryResearchClaimSourceRepository(),
  researchConflicts: new InMemoryResearchConflictRepository(),
  featureSnapshots: new InMemoryFeatureSnapshotRepository(),
  fixtureStatisticSnapshots: new InMemoryFixtureStatisticSnapshotRepository(),
  availabilitySnapshots: new InMemoryAvailabilitySnapshotRepository(),
  lineupSnapshots: new InMemoryLineupSnapshotRepository(),
  lineupParticipants: new InMemoryLineupParticipantRepository(),
  researchAssignments: new InMemoryResearchAssignmentRepository(),
  predictions: new InMemoryPredictionRepository(),
  parlays: new InMemoryParlayRepository(),
  validations: new InMemoryValidationRepository(),
  auditEvents: new InMemoryAuditEventRepository(),
  sandboxCertificationRuns: new InMemorySandboxCertificationRunRepository(),
  runtimeReleaseSnapshots: new InMemoryRuntimeReleaseSnapshotRepository(),
  telemetryEvents: new InMemoryOperationalTelemetryEventRepository(),
  metricSamples: new InMemoryOperationalMetricSampleRepository(),
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
  automationCycles: new PrismaAutomationCycleRepository(client),
  fixtureWorkflows: new PrismaFixtureWorkflowRepository(client),
  schedulerCursors: new PrismaSchedulerCursorRepository(client),
  tasks: new PrismaTaskRepository(client),
  taskRuns: new PrismaTaskRunRepository(client),
  aiRuns: new PrismaAiRunRepository(client),
  researchBundles: new PrismaResearchBundleRepository(client),
  researchClaims: new PrismaResearchClaimRepository(client),
  researchSources: new PrismaResearchSourceRepository(client),
  researchClaimSources: new PrismaResearchClaimSourceRepository(client),
  researchConflicts: new PrismaResearchConflictRepository(client),
  featureSnapshots: new PrismaFeatureSnapshotRepository(client),
  fixtureStatisticSnapshots: new PrismaFixtureStatisticSnapshotRepository(client),
  availabilitySnapshots: new PrismaAvailabilitySnapshotRepository(client),
  lineupSnapshots: new PrismaLineupSnapshotRepository(client),
  lineupParticipants: new PrismaLineupParticipantRepository(client),
  researchAssignments: new PrismaResearchAssignmentRepository(client),
  predictions: new PrismaPredictionRepository(client),
  parlays: new PrismaParlayRepository(client),
  validations: new PrismaValidationRepository(client),
  auditEvents: new PrismaAuditEventRepository(client),
  sandboxCertificationRuns: new PrismaSandboxCertificationRunRepository(client),
  runtimeReleaseSnapshots: new PrismaRuntimeReleaseSnapshotRepository(client),
  telemetryEvents: new PrismaOperationalTelemetryEventRepository(client),
  metricSamples: new PrismaOperationalMetricSampleRepository(client),
  leagueCoveragePolicies: new PrismaLeagueCoveragePolicyRepository(client),
  teamCoveragePolicies: new PrismaTeamCoveragePolicyRepository(client),
  dailyAutomationPolicies: new PrismaDailyAutomationPolicyRepository(client),
  sandboxNamespaces: new PrismaSandboxNamespaceRepository(client),
});
