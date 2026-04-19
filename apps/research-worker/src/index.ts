import {
  createAiRun,
  createFixtureWorkflow,
  createTask,
  transitionFixtureWorkflowStage,
  type AiRunEntity,
  type AiRunUsage,
  type FixtureEntity,
  type FixtureWorkflowEntity,
  type TaskEntity,
} from "@gana-v8/domain-core";
import {
  applyFeatureSnapshotToFixture,
  buildFeatureVectorSnapshot,
  type FeatureVectorSnapshot,
  type ResearchTraceMetadata,
} from "@gana-v8/feature-store";
import { renderPrompt, type PromptRegistryKey } from "@gana-v8/model-registry";
import {
  buildResearchDossier,
  type BuildResearchDossierOptions,
  type ResearchBrief,
  type ResearchDossier,
  type ResearchSynthesisHookInput,
} from "@gana-v8/research-engine";
import {
  runStructuredOutput,
  type GetAiProviderAdapterOptions,
  type ReasoningLevel,
  type RunStructuredOutputResult,
} from "@gana-v8/ai-runtime";
import { z } from "zod";

export const workspaceInfo = {
  packageName: "@gana-v8/research-worker",
  workspaceName: "research-worker",
  category: "app",
  description: "Executes deterministic research tasks, optional AI synthesis, and freezes feature snapshots for scoring.",
  dependencies: [
    { name: "@gana-v8/ai-runtime", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/feature-store", category: "workspace" },
    { name: "@gana-v8/model-registry", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/research-contracts", category: "workspace" },
    { name: "@gana-v8/research-engine", category: "workspace" },
  ],
} as const;

const RESEARCH_TASK_PREFIX = "task:research-worker";
const RESEARCH_AI_RUN_PREFIX = "airun:research-worker";
const DEFAULT_AI_PROMPT_KEY: PromptRegistryKey = "research.fixture-analysis";
const DEFAULT_AI_PROVIDER = "codex";
const DEFAULT_AI_REQUESTED_MODEL = "gpt-5.4";
const DEFAULT_AI_REQUESTED_REASONING: ReasoningLevel = "medium";
const RESEARCH_OUTPUT_CONTRACT = '{"summary":"string","risks":["string"]}';

const researchStructuredOutputSchema = z.object({
  summary: z.string().min(1),
  risks: z.array(z.string().min(1)).max(8).optional(),
});

type ResearchStructuredOutput = z.infer<typeof researchStructuredOutputSchema>;

export interface ResearchSynthesisAiConfig extends GetAiProviderAdapterOptions {
  readonly enabled?: boolean;
  readonly provider?: "codex";
  readonly requestedModel?: string;
  readonly requestedReasoning?: ReasoningLevel;
  readonly promptKey?: PromptRegistryKey;
  readonly promptVersion?: string;
  readonly webSearchMode?: "disabled" | "auto" | "required";
}

export interface ResearchWorkerPersistence {
  readonly fixtures?: {
    save(entity: FixtureEntity): Promise<FixtureEntity>;
  };
  readonly fixtureWorkflows?: {
    getById(id: string): Promise<FixtureWorkflowEntity | null>;
    findByFixtureId(fixtureId: string): Promise<FixtureWorkflowEntity | null>;
    save(entity: FixtureWorkflowEntity): Promise<FixtureWorkflowEntity>;
  };
  readonly tasks?: {
    getById(id: string): Promise<TaskEntity | null>;
    save(entity: TaskEntity): Promise<TaskEntity>;
  };
  readonly aiRuns?: {
    save(entity: AiRunEntity): Promise<AiRunEntity>;
  };
}

export interface ResearchTaskInput extends Pick<BuildResearchDossierOptions, "evidence" | "synthesisHook"> {
  readonly fixture: FixtureEntity;
  readonly generatedAt?: string;
  readonly ai?: ResearchSynthesisAiConfig;
  readonly persistence?: ResearchWorkerPersistence;
}

export interface ProcessedResearchTaskResult {
  readonly status: "processed";
  readonly fixture: FixtureEntity;
  readonly dossier: ResearchDossier;
  readonly featureSnapshot: FeatureVectorSnapshot;
  readonly workflow?: FixtureWorkflowEntity;
  readonly aiRun?: AiRunEntity;
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
  readonly ai?: ResearchSynthesisAiConfig;
  readonly persistence?: ResearchWorkerPersistence;
}

export interface RunResearchWorkerSummary {
  readonly generatedAt: string;
  readonly processedCount: number;
  readonly skippedCount: number;
  readonly results: readonly ResearchWorkerResult[];
}

export interface RunResearchSynthesisAiInput {
  readonly fixture: FixtureEntity;
  readonly brief: ResearchBrief;
  readonly evidence: ResearchSynthesisHookInput["evidence"];
  readonly directionalScore: ResearchSynthesisHookInput["directionalScore"];
  readonly generatedAt: string;
  readonly config?: ResearchSynthesisAiConfig;
  readonly persistence?: ResearchWorkerPersistence;
}

export interface ResearchAiTrace {
  readonly aiRun: AiRunEntity;
  readonly metadata: ResearchTraceMetadata;
  readonly structuredOutput: ResearchStructuredOutput;
}

const createGeneratedAt = (generatedAt?: string): string => generatedAt ?? new Date().toISOString();
const createResearchTaskId = (fixtureId: string): string => `${RESEARCH_TASK_PREFIX}:${fixtureId}`;
const createResearchAiRunId = (fixtureId: string, generatedAt: string): string =>
  `${RESEARCH_AI_RUN_PREFIX}:${fixtureId}:${generatedAt}`;
const createResearchOutputRef = (fixtureId: string, generatedAt: string, suffix: string): string =>
  `research-worker://${fixtureId}/${generatedAt}/${suffix}`;

const isAiEnabled = (config?: ResearchSynthesisAiConfig): boolean => config?.enabled === true;

const toUsage = (
  result: Pick<RunStructuredOutputResult<typeof researchStructuredOutputSchema>, "usageJson">,
): AiRunUsage | undefined => {
  const inputTokens = result.usageJson?.inputTokens;
  const outputTokens = result.usageJson?.outputTokens;
  const totalTokens = result.usageJson?.totalTokens;

  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
  };
};

const createAiContext = (
  fixture: FixtureEntity,
  brief: ResearchBrief,
  evidence: ResearchSynthesisHookInput["evidence"],
  directionalScore: ResearchSynthesisHookInput["directionalScore"],
): string => {
  const evidenceLines = evidence.map((item, index) => {
    const weightedScore = Number((item.confidence * item.impact).toFixed(4));
    return [
      `${index + 1}. ${item.title}`,
      `kind=${item.kind}`,
      `direction=${item.direction}`,
      `confidence=${item.confidence}`,
      `impact=${item.impact}`,
      `weightedScore=${weightedScore}`,
      `summary=${item.summary}`,
      `source=${item.source.provider}:${item.source.reference}`,
      item.tags.length > 0 ? `tags=${item.tags.join(", ")}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | ");
  });

  return [
    `FixtureId: ${fixture.id}`,
    `Competition: ${fixture.competition}`,
    `Match: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
    `ScheduledAt: ${fixture.scheduledAt}`,
    `Brief headline: ${brief.headline}`,
    `Brief context: ${brief.context}`,
    `Questions: ${brief.questions.join(" | ")}`,
    `Assumptions: ${brief.assumptions.join(" | ")}`,
    `Directional score: home=${directionalScore.home}, draw=${directionalScore.draw}, away=${directionalScore.away}`,
    "Evidence:",
    evidenceLines.length > 0 ? evidenceLines.join("\n") : "No evidence available.",
  ].join("\n");
};

const renderResearchAiPrompt = (
  input: Pick<RunResearchSynthesisAiInput, "fixture" | "brief" | "evidence" | "directionalScore" | "config">,
): { systemPrompt: string; userPrompt: string; version: string } =>
  renderPrompt(
    input.config?.promptKey ?? DEFAULT_AI_PROMPT_KEY,
    {
      context: createAiContext(
        input.fixture,
        input.brief,
        input.evidence,
        input.directionalScore,
      ),
      outputContract: RESEARCH_OUTPUT_CONTRACT,
    },
    input.config?.promptVersion,
  );

const ensureTask = async (
  persistence: ResearchWorkerPersistence | undefined,
  fixtureId: string,
  generatedAt: string,
): Promise<TaskEntity | null> => {
  if (!persistence?.tasks) {
    return null;
  }

  const taskId = createResearchTaskId(fixtureId);
  const existing = await persistence.tasks.getById(taskId);
  if (existing) {
    return existing;
  }

  return persistence.tasks.save(
    createTask({
      id: taskId,
      kind: "research",
      status: "succeeded",
      triggerKind: "system",
      priority: 40,
      payload: { fixtureId, source: "research-worker" },
      attempts: [{ startedAt: generatedAt, finishedAt: generatedAt }],
      scheduledFor: generatedAt,
      maxAttempts: 3,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }),
  );
};

const persistAiRun = async (
  persistence: ResearchWorkerPersistence | undefined,
  aiRun: AiRunEntity,
): Promise<AiRunEntity> => (persistence?.aiRuns ? persistence.aiRuns.save(aiRun) : aiRun);

const persistResearchWorkflow = async (
  persistence: ResearchWorkerPersistence | undefined,
  fixtureId: string,
  generatedAt: string,
): Promise<FixtureWorkflowEntity> => {
  const current =
    (await persistence?.fixtureWorkflows?.findByFixtureId(fixtureId)) ??
    createFixtureWorkflow({
      fixtureId,
      ingestionStatus: "pending",
      oddsStatus: "pending",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
    });

  const next = transitionFixtureWorkflowStage(
    transitionFixtureWorkflowStage(current, "enrichment", {
      status: "succeeded",
      occurredAt: generatedAt,
    }),
    "candidate",
    {
      status: "succeeded",
      occurredAt: generatedAt,
      isCandidate: true,
    },
  );

  return persistence?.fixtureWorkflows ? persistence.fixtureWorkflows.save(next) : next;
};

export const resolveResearchAiConfig = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResearchSynthesisAiConfig => {
  const mode = env.GANA_RESEARCH_SYNTHESIS_MODE?.trim().toLowerCase();
  const enabled = mode === "ai-assisted" || env.GANA_ENABLE_RESEARCH_AI?.trim() === "1";
  const reasoning = env.GANA_RESEARCH_AI_REASONING?.trim().toLowerCase();

  return {
    enabled,
    provider: DEFAULT_AI_PROVIDER,
    requestedModel: env.GANA_RESEARCH_AI_MODEL?.trim() || DEFAULT_AI_REQUESTED_MODEL,
    requestedReasoning:
      reasoning === "low" || reasoning === "medium" || reasoning === "high"
        ? reasoning
        : DEFAULT_AI_REQUESTED_REASONING,
    promptKey: DEFAULT_AI_PROMPT_KEY,
    ...(env.GANA_RESEARCH_AI_PROMPT_VERSION?.trim()
      ? { promptVersion: env.GANA_RESEARCH_AI_PROMPT_VERSION.trim() }
      : {}),
    webSearchMode: "disabled",
  };
};

export const runResearchSynthesisAi = async (
  input: RunResearchSynthesisAiInput,
): Promise<ResearchAiTrace> => {
  const renderedPrompt = renderResearchAiPrompt(input);
  const result = await runStructuredOutput(
    {
      provider: input.config?.provider ?? DEFAULT_AI_PROVIDER,
      requestedModel: input.config?.requestedModel ?? DEFAULT_AI_REQUESTED_MODEL,
      requestedReasoning: input.config?.requestedReasoning ?? DEFAULT_AI_REQUESTED_REASONING,
      webSearchMode: input.config?.webSearchMode ?? "disabled",
      schema: researchStructuredOutputSchema,
      instructions: renderedPrompt.systemPrompt,
      input: renderedPrompt.userPrompt,
      includeEvents: true,
    },
    input.config,
  );

  const task = await ensureTask(input.persistence, input.fixture.id, input.generatedAt);
  const usage = toUsage(result);
  const aiRun = await persistAiRun(
    input.persistence,
    createAiRun({
      id: createResearchAiRunId(input.fixture.id, input.generatedAt),
      taskId: task?.id ?? createResearchTaskId(input.fixture.id),
      provider: result.provider,
      model: result.resolvedModel,
      promptVersion: renderedPrompt.version,
      ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
      ...(usage ? { usage } : {}),
      outputRef: createResearchOutputRef(input.fixture.id, input.generatedAt, "ai-synthesis.json"),
      status: "completed",
      createdAt: input.generatedAt,
      updatedAt: input.generatedAt,
    }),
  );

  return {
    aiRun,
    structuredOutput: result.structuredOutput,
    metadata: {
      synthesisMode: "ai-assisted",
      aiRunId: aiRun.id,
      aiProvider: aiRun.provider,
      aiModel: aiRun.model,
      aiPromptVersion: aiRun.promptVersion,
      ...(aiRun.providerRequestId ? { providerRequestId: aiRun.providerRequestId } : {}),
    },
  };
};

const createFallbackTrace = async (
  input: RunResearchSynthesisAiInput,
  promptVersion: string,
  error: unknown,
): Promise<ResearchAiTrace> => {
  const message = error instanceof Error ? error.message : "Unknown AI synthesis failure.";
  const task = await ensureTask(input.persistence, input.fixture.id, input.generatedAt);
  const aiRun = await persistAiRun(
    input.persistence,
    createAiRun({
      id: createResearchAiRunId(input.fixture.id, input.generatedAt),
      taskId: task?.id ?? createResearchTaskId(input.fixture.id),
      provider: input.config?.provider ?? DEFAULT_AI_PROVIDER,
      model: input.config?.requestedModel ?? DEFAULT_AI_REQUESTED_MODEL,
      promptVersion,
      outputRef: createResearchOutputRef(input.fixture.id, input.generatedAt, "deterministic-fallback.json"),
      error: message,
      status: "failed",
      createdAt: input.generatedAt,
      updatedAt: input.generatedAt,
    }),
  );

  return {
    aiRun,
    structuredOutput: {
      summary: "",
      risks: [],
    },
    metadata: {
      synthesisMode: "ai-fallback",
      aiRunId: aiRun.id,
      aiProvider: aiRun.provider,
      aiModel: aiRun.model,
      aiPromptVersion: aiRun.promptVersion,
      fallbackSummary: `AI synthesis fallback to deterministic baseline: ${message}`,
    },
  };
};

export const runResearchTask = async (
  input: ResearchTaskInput,
): Promise<ProcessedResearchTaskResult> => {
  const generatedAt = createGeneratedAt(input.generatedAt);
  const baseDossierOptions: BuildResearchDossierOptions = {
    now: () => generatedAt,
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };
  const baselineDossier = buildResearchDossier(input.fixture, baseDossierOptions);

  let dossier = input.synthesisHook
    ? buildResearchDossier(input.fixture, {
        ...baseDossierOptions,
        synthesisHook: input.synthesisHook,
      })
    : baselineDossier;
  let aiRun: AiRunEntity | undefined;
  let researchTrace: ResearchTraceMetadata = { synthesisMode: "deterministic" };

  if (isAiEnabled(input.ai)) {
    const promptVersion = renderResearchAiPrompt({
      fixture: input.fixture,
      brief: baselineDossier.brief,
      evidence: baselineDossier.evidence,
      directionalScore: baselineDossier.directionalScore,
      ...(input.ai ? { config: input.ai } : {}),
    }).version;

    try {
      const aiTrace = await runResearchSynthesisAi({
        fixture: input.fixture,
        brief: baselineDossier.brief,
        evidence: baselineDossier.evidence,
        directionalScore: baselineDossier.directionalScore,
        generatedAt,
        ...(input.ai ? { config: input.ai } : {}),
        ...(input.persistence ? { persistence: input.persistence } : {}),
      });
      aiRun = aiTrace.aiRun;
      researchTrace = aiTrace.metadata;
      dossier = {
        ...dossier,
        summary: aiTrace.structuredOutput.summary,
        risks:
          aiTrace.structuredOutput.risks && aiTrace.structuredOutput.risks.length > 0
            ? [...aiTrace.structuredOutput.risks]
            : [...dossier.risks],
      };
    } catch (error) {
      const fallbackTrace = await createFallbackTrace(
        {
          fixture: input.fixture,
          brief: baselineDossier.brief,
          evidence: baselineDossier.evidence,
          directionalScore: baselineDossier.directionalScore,
          generatedAt,
          ...(input.ai ? { config: input.ai } : {}),
          ...(input.persistence ? { persistence: input.persistence } : {}),
        },
        promptVersion,
        error,
      );
      aiRun = fallbackTrace.aiRun;
      researchTrace = fallbackTrace.metadata;
      dossier = {
        ...baselineDossier,
        risks: [
          ...baselineDossier.risks,
          fallbackTrace.metadata.fallbackSummary ?? "AI synthesis fallback applied.",
        ],
      };
    }
  }

  const featureSnapshot = buildFeatureVectorSnapshot({
    fixture: input.fixture,
    dossier,
    generatedAt,
    researchTrace,
  });
  const enrichedFixture = applyFeatureSnapshotToFixture(input.fixture, featureSnapshot);
  const persistedFixture = input.persistence?.fixtures
    ? await input.persistence.fixtures.save(enrichedFixture)
    : enrichedFixture;
  const workflow = await persistResearchWorkflow(input.persistence, input.fixture.id, generatedAt);

  return {
    status: "processed",
    fixture: persistedFixture,
    dossier,
    featureSnapshot,
    ...(workflow ? { workflow } : {}),
    ...(aiRun ? { aiRun } : {}),
  };
};

export const runResearchWorker = async (
  input: RunResearchWorkerInput,
): Promise<RunResearchWorkerSummary> => {
  const generatedAt = createGeneratedAt(input.generatedAt);
  const results: ResearchWorkerResult[] = [];

  for (const fixture of input.fixtures) {
    if (fixture.status !== "scheduled") {
      results.push({
        status: "skipped",
        fixture,
        reason: `fixture must be scheduled for research processing, got ${fixture.status}`,
      });
      continue;
    }

    results.push(
      await runResearchTask({
        fixture,
        generatedAt,
        ...(input.ai ? { ai: input.ai } : {}),
        ...(input.persistence ? { persistence: input.persistence } : {}),
      }),
    );
  }

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
