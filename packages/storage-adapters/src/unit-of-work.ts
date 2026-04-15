import type {
  AiRunRepository,
  FixtureRepository,
  ParlayRepository,
  PredictionRepository,
  SandboxNamespaceRepository,
  TaskRepository,
  ValidationRepository,
} from "@gana-v8/domain-core";

import {
  InMemoryAiRunRepository,
  InMemoryFixtureRepository,
  InMemoryParlayRepository,
  InMemoryPredictionRepository,
  InMemorySandboxNamespaceRepository,
  InMemoryTaskRepository,
  InMemoryValidationRepository,
} from "./in-memory.js";

export interface InMemoryUnitOfWork {
  fixtures: FixtureRepository;
  tasks: TaskRepository;
  aiRuns: AiRunRepository;
  predictions: PredictionRepository;
  parlays: ParlayRepository;
  validations: ValidationRepository;
  sandboxNamespaces: SandboxNamespaceRepository;
}

export const createInMemoryUnitOfWork = (): InMemoryUnitOfWork => ({
  fixtures: new InMemoryFixtureRepository(),
  tasks: new InMemoryTaskRepository(),
  aiRuns: new InMemoryAiRunRepository(),
  predictions: new InMemoryPredictionRepository(),
  parlays: new InMemoryParlayRepository(),
  validations: new InMemoryValidationRepository(),
  sandboxNamespaces: new InMemorySandboxNamespaceRepository(),
});
