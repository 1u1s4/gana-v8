import type { FixtureEntity } from "@gana-v8/domain-core";
import {
  applyFeatureSnapshotToFixture,
  buildFeatureVectorSnapshot,
  type FeatureVectorSnapshot,
} from "../../../packages/feature-store/dist/src/index.js";
import {
  buildResearchDossier,
  type BuildResearchDossierOptions,
  type ResearchDossier,
} from "../../../packages/research-engine/dist/index.js";

export const workspaceInfo = {
  packageName: "@gana-v8/research-worker",
  workspaceName: "research-worker",
  category: "app",
  description: "Executes deterministic research tasks and freezes feature snapshots for scoring.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/feature-store", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/research-contracts", category: "workspace" },
    { name: "@gana-v8/research-engine", category: "workspace" },
  ],
} as const;

export interface ResearchTaskInput extends Pick<BuildResearchDossierOptions, "evidence" | "synthesisHook"> {
  readonly fixture: FixtureEntity;
  readonly generatedAt?: string;
}

export interface ProcessedResearchTaskResult {
  readonly status: "processed";
  readonly fixture: FixtureEntity;
  readonly dossier: ResearchDossier;
  readonly featureSnapshot: FeatureVectorSnapshot;
}

export interface SkippedResearchTaskResult {
  readonly status: "skipped";
  readonly fixture: FixtureEntity;
  readonly reason: string;
}

export type ResearchWorkerResult = ProcessedResearchTaskResult | SkippedResearchTaskResult;

export interface RunResearchWorkerInput {
  readonly fixtures: readonly FixtureEntity[];
  readonly generatedAt?: string;
}

export interface RunResearchWorkerSummary {
  readonly generatedAt: string;
  readonly processedCount: number;
  readonly skippedCount: number;
  readonly results: readonly ResearchWorkerResult[];
}

const createGeneratedAt = (generatedAt?: string): string => generatedAt ?? new Date().toISOString();

export const runResearchTask = (
  input: ResearchTaskInput,
): ProcessedResearchTaskResult => {
  const generatedAt = createGeneratedAt(input.generatedAt);
  const dossierOptions: BuildResearchDossierOptions = {
    now: () => generatedAt,
    ...(input.evidence ? { evidence: input.evidence } : {}),
    ...(input.synthesisHook ? { synthesisHook: input.synthesisHook } : {}),
  };
  const dossier = buildResearchDossier(input.fixture, dossierOptions);
  const featureSnapshot = buildFeatureVectorSnapshot({
    fixture: input.fixture,
    dossier,
    generatedAt,
  });
  const enrichedFixture = applyFeatureSnapshotToFixture(input.fixture, featureSnapshot);

  return {
    status: "processed",
    fixture: enrichedFixture,
    dossier,
    featureSnapshot,
  };
};

export const runResearchWorker = (
  input: RunResearchWorkerInput,
): RunResearchWorkerSummary => {
  const generatedAt = createGeneratedAt(input.generatedAt);
  const results: ResearchWorkerResult[] = input.fixtures.map((fixture) => {
    if (fixture.status !== "scheduled") {
      return {
        status: "skipped",
        fixture,
        reason: `fixture must be scheduled for research processing, got ${fixture.status}`,
      };
    }

    return runResearchTask({
      fixture,
      generatedAt,
    });
  });

  return {
    generatedAt,
    processedCount: results.filter((result) => result.status === "processed").length,
    skippedCount: results.filter((result) => result.status === "skipped").length,
    results,
  };
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
