import {
  createAiRun,
  createAuditEvent,
  createFeatureSnapshot as createFeatureSnapshotEntity,
  createFixtureWorkflow,
  createResearchAssignment as createResearchAssignmentEntity,
  createResearchBundle as createResearchBundleEntity,
  createResearchClaim as createResearchClaimEntity,
  createResearchClaimSource as createResearchClaimSourceEntity,
  createResearchConflict as createResearchConflictEntity,
  createResearchSource as createResearchSourceEntity,
  transitionFixtureWorkflowStage,
  type AiRunEntity,
  type AiRunUsage,
  type AvailabilitySnapshotEntity,
  type AuditEventEntity,
  type FeatureSnapshotEntity,
  type FixtureEntity,
  type FixtureWorkflowEntity,
  type LineupParticipantEntity,
  type LineupSnapshotEntity,
  type ResearchAssignmentEntity,
  type ResearchBundleEntity,
  type ResearchClaimEntity,
  type ResearchClaimSourceEntity,
  type ResearchConflictEntity,
  type ResearchSourceEntity,
  type TaskEntity,
} from "@gana-v8/domain-core";
import {
  buildFeatureVectorSnapshot,
  type FeatureVectorSnapshot,
  type ResearchTraceMetadata,
} from "@gana-v8/feature-store";
import { renderPrompt, type PromptRegistryKey } from "@gana-v8/model-registry";
import {
  applyResearchSynthesis,
  buildResearchBundle,
  buildResearchDossierFromBundle,
  type BuildResearchBundleOptions,
  type ResearchBrief,
  type ResearchBundle,
  type ResearchDossier,
  type ResearchLineupTeamSignal,
  type ResearchSignalSnapshot,
  type ResearchSynthesisHookInput,
} from "@gana-v8/research-engine";
import type {
  Claim as PersistableClaim,
  ClaimConflict as PersistableClaimConflict,
  ClaimCorroboration,
  FeatureSnapshot as PersistableFeatureSnapshot,
  ResearchAssignment as PersistableResearchAssignment,
  ResearchAssignmentDimension,
  ResearchBundle as PersistableResearchBundle,
  ResearchBundleStatus,
  ResearchGateReason as PersistableResearchGateReason,
  ResearchTraceMetadata as PersistableResearchTraceMetadata,
  SourceRecord as PersistableSourceRecord,
} from "@gana-v8/research-contracts";
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
const PLANNER_VERSION = "research-bundle-v1";
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
  readonly researchBundles?: {
    save(entity: ResearchBundleEntity): Promise<ResearchBundleEntity>;
  };
  readonly researchClaims?: {
    save(entity: ResearchClaimEntity): Promise<ResearchClaimEntity>;
  };
  readonly researchSources?: {
    save(entity: ResearchSourceEntity): Promise<ResearchSourceEntity>;
  };
  readonly researchClaimSources?: {
    save(entity: ResearchClaimSourceEntity): Promise<ResearchClaimSourceEntity>;
  };
  readonly researchConflicts?: {
    save(entity: ResearchConflictEntity): Promise<ResearchConflictEntity>;
  };
  readonly featureSnapshots?: {
    save(entity: FeatureSnapshotEntity): Promise<FeatureSnapshotEntity>;
  };
  readonly availabilitySnapshots?: {
    findByFixtureId(fixtureId: string): Promise<AvailabilitySnapshotEntity[]>;
  };
  readonly lineupSnapshots?: {
    findByFixtureId(fixtureId: string): Promise<LineupSnapshotEntity[]>;
  };
  readonly lineupParticipants?: {
    findByLineupSnapshotId(lineupSnapshotId: string): Promise<LineupParticipantEntity[]>;
  };
  readonly researchAssignments?: {
    save(entity: ResearchAssignmentEntity): Promise<ResearchAssignmentEntity>;
  };
  readonly auditEvents?: {
    save(entity: AuditEventEntity): Promise<AuditEventEntity>;
  };
}

export interface ResearchTaskInput
  extends Pick<BuildResearchBundleOptions, "evidence" | "synthesisHook"> {
  readonly fixture: FixtureEntity;
  readonly generatedAt?: string;
  readonly ai?: ResearchSynthesisAiConfig;
  readonly persistence?: ResearchWorkerPersistence;
}

export type PersistableResearchBundleArtifact = PersistableResearchBundle;
export type PersistableFeatureSnapshotArtifact = PersistableFeatureSnapshot;

export interface ProcessedResearchTaskResult {
  readonly status: "processed";
  readonly fixture: FixtureEntity;
  readonly bundle: ResearchBundle;
  readonly dossier: ResearchDossier;
  readonly featureSnapshot: FeatureVectorSnapshot;
  readonly persistableResearchBundle: PersistableResearchBundleArtifact;
  readonly persistableFeatureSnapshot: PersistableFeatureSnapshotArtifact;
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
const createFeatureSnapshotId = (bundleId: string): string => `${bundleId}:feature-snapshot`;

const LEGACY_METADATA_PREFIXES = ["research", "feature"] as const;

const isAiEnabled = (config?: ResearchSynthesisAiConfig): boolean => config?.enabled === true;

const round = (value: number): number => Number(value.toFixed(4));

const addHours = (iso: string, hours: number): string | undefined => {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return new Date(timestamp + hours * 3_600_000).toISOString();
};

const metadataNumber = (
  metadata: Readonly<Record<string, string>>,
  key: string,
): number | undefined => {
  const value = metadata[key];
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const metadataBoolean = (
  metadata: Readonly<Record<string, string>>,
  key: string,
): boolean | undefined => {
  const value = metadata[key]?.trim().toLowerCase();
  if (value === undefined) {
    return undefined;
  }
  return value === "true";
};

const metadataTimestamp = (
  metadata: Readonly<Record<string, string>>,
  keys: readonly string[],
): string | undefined => {
  for (const key of keys) {
    const value = metadata[key];
    if (value && Number.isFinite(Date.parse(value))) {
      return value;
    }
  }
  return undefined;
};

const sortByIsoDescending = <T>(
  items: readonly T[],
  selector: (item: T) => string | undefined,
): T[] =>
  [...items].sort((left, right) => (selector(right) ?? "").localeCompare(selector(left) ?? ""));

const buildFixtureMetadataSignals = (
  fixture: FixtureEntity,
): ResearchSignalSnapshot => {
  const metadata = fixture.metadata;
  const marketMove = metadataNumber(metadata, "marketMove");
  const oddsHomeImplied = metadataNumber(metadata, "oddsHomeImplied");
  const oddsDrawImplied = metadataNumber(metadata, "oddsDrawImplied");
  const oddsAwayImplied = metadataNumber(metadata, "oddsAwayImplied");
  const drawBias = metadataNumber(metadata, "drawBias");
  const formUpdatedAt = metadataTimestamp(metadata, ["formUpdatedAt"]);
  const scheduleUpdatedAt = metadataTimestamp(metadata, ["scheduleUpdatedAt"]);
  const availabilityUpdatedAt = metadataTimestamp(metadata, ["officialAvailabilityUpdatedAt", "injuriesUpdatedAt"]);
  const weatherUpdatedAt = metadataTimestamp(metadata, ["weatherUpdatedAt"]);
  const marketUpdatedAt = metadataTimestamp(metadata, ["marketUpdatedAt"]);
  const contextUpdatedAt = metadataTimestamp(metadata, ["contextUpdatedAt"]);
  const officialLineupUpdatedAt = metadataTimestamp(metadata, ["officialLineupUpdatedAt"]);
  const marketLean =
    metadata.marketLean === "home" || metadata.marketLean === "draw" || metadata.marketLean === "away"
      ? metadata.marketLean
      : undefined;
  return {
    ...(metadataNumber(metadata, "formHome") !== undefined || metadataNumber(metadata, "formAway") !== undefined
      ? {
          form: {
            home: metadataNumber(metadata, "formHome") ?? 0.5,
            away: metadataNumber(metadata, "formAway") ?? 0.5,
            ...(formUpdatedAt ? { updatedAt: formUpdatedAt } : {}),
          },
        }
      : {}),
    ...(metadataNumber(metadata, "restHomeDays") !== undefined || metadataNumber(metadata, "restAwayDays") !== undefined
      ? {
          schedule: {
            restHomeDays: metadataNumber(metadata, "restHomeDays") ?? 3,
            restAwayDays: metadataNumber(metadata, "restAwayDays") ?? 3,
            ...(scheduleUpdatedAt ? { updatedAt: scheduleUpdatedAt } : {}),
          },
        }
      : {}),
    ...(metadataNumber(metadata, "injuriesHome") !== undefined ||
    metadataNumber(metadata, "injuriesAway") !== undefined ||
    metadataBoolean(metadata, "officialAvailability") !== undefined
      ? {
          availability: {
            injuriesHome: metadataNumber(metadata, "injuriesHome") ?? 0,
            injuriesAway: metadataNumber(metadata, "injuriesAway") ?? 0,
            official: metadataBoolean(metadata, "officialAvailability") ?? false,
            ...(availabilityUpdatedAt ? { updatedAt: availabilityUpdatedAt } : {}),
          },
        }
      : {}),
    ...(metadataNumber(metadata, "weatherSeverity") !== undefined || metadataBoolean(metadata, "weatherRisk") !== undefined
      ? {
          weather: {
            severity: metadataNumber(metadata, "weatherSeverity") ?? ((metadataBoolean(metadata, "weatherRisk") ?? false) ? 0.45 : 0),
            elevatedRisk: metadataBoolean(metadata, "weatherRisk") ?? false,
            ...(weatherUpdatedAt ? { updatedAt: weatherUpdatedAt } : {}),
          },
        }
      : {}),
    ...(metadata[ "marketLean" ] !== undefined ||
    marketMove !== undefined ||
    oddsHomeImplied !== undefined ||
    oddsDrawImplied !== undefined ||
    oddsAwayImplied !== undefined
      ? {
          market: {
            ...(marketLean ? { lean: marketLean } : {}),
            ...(marketMove !== undefined ? { move: marketMove } : {}),
            ...(oddsHomeImplied !== undefined ? { oddsHomeImplied } : {}),
            ...(oddsDrawImplied !== undefined ? { oddsDrawImplied } : {}),
            ...(oddsAwayImplied !== undefined ? { oddsAwayImplied } : {}),
            ...(marketUpdatedAt ? { updatedAt: marketUpdatedAt } : {}),
          },
        }
      : {}),
    ...(metadataBoolean(metadata, "derby") !== undefined || drawBias !== undefined
      ? {
          context: {
            derby: metadataBoolean(metadata, "derby") ?? false,
            ...(drawBias !== undefined ? { drawBias } : {}),
            ...(contextUpdatedAt ? { updatedAt: contextUpdatedAt } : {}),
          },
        }
      : {}),
    ...(metadataBoolean(metadata, "officialLineup")
      ? {
          lineups: {
            official: true,
            ...(officialLineupUpdatedAt ? { updatedAt: officialLineupUpdatedAt } : {}),
          },
        }
      : {}),
  };
};

const buildAvailabilitySignals = (
  snapshots: readonly AvailabilitySnapshotEntity[],
): ResearchSignalSnapshot["availability"] | undefined => {
  if (snapshots.length === 0) {
    return undefined;
  }

  const latestBySubject = new Map<string, AvailabilitySnapshotEntity>();
  for (const snapshot of sortByIsoDescending(
    snapshots,
    (item) => item.sourceUpdatedAt ?? item.capturedAt,
  )) {
    const key = `${snapshot.teamSide ?? "unknown"}:${snapshot.subjectName}`;
    if (!latestBySubject.has(key)) {
      latestBySubject.set(key, snapshot);
    }
  }

  const latestSnapshots = [...latestBySubject.values()];
  const unavailableBySide = latestSnapshots.reduce(
    (accumulator, snapshot) => {
      if ((snapshot.status === "out" || snapshot.status === "questionable") && snapshot.teamSide) {
        accumulator[snapshot.teamSide].push(snapshot.subjectName);
      }
      return accumulator;
    },
    { home: [] as string[], away: [] as string[] },
  );
  const updatedAt = sortByIsoDescending(
    latestSnapshots,
    (item) => item.sourceUpdatedAt ?? item.capturedAt,
  )[0]?.sourceUpdatedAt ??
    sortByIsoDescending(latestSnapshots, (item) => item.capturedAt)[0]?.capturedAt;

  return {
    injuriesHome: unavailableBySide.home.length,
    injuriesAway: unavailableBySide.away.length,
    official: true,
    ...(updatedAt ? { updatedAt } : {}),
    homeUnavailableNames: unavailableBySide.home,
    awayUnavailableNames: unavailableBySide.away,
  };
};

const buildLineupSignals = async (
  persistence: ResearchWorkerPersistence,
  fixtureId: string,
): Promise<ResearchSignalSnapshot["lineups"] | undefined> => {
  if (!persistence.lineupSnapshots) {
    return undefined;
  }

  const snapshots = await persistence.lineupSnapshots.findByFixtureId(fixtureId);
  if (snapshots.length === 0) {
    return undefined;
  }

  const latestBySide = new Map<"home" | "away", LineupSnapshotEntity>();
  for (const snapshot of sortByIsoDescending(
    snapshots,
    (item) => `${item.lineupStatus === "confirmed" ? "1" : "0"}:${item.sourceUpdatedAt ?? item.capturedAt}`,
  )) {
    if (!latestBySide.has(snapshot.teamSide)) {
      latestBySide.set(snapshot.teamSide, snapshot);
    }
  }

  const toTeamSignal = async (
    snapshot: LineupSnapshotEntity | undefined,
  ): Promise<ResearchLineupTeamSignal | undefined> => {
    if (!snapshot) {
      return undefined;
    }
    const participants = persistence.lineupParticipants
      ? await persistence.lineupParticipants.findByLineupSnapshotId(snapshot.id)
      : [];
    return {
      status: snapshot.lineupStatus,
      ...(snapshot.formation ? { formation: snapshot.formation } : {}),
      starters: participants
        .filter((participant) => participant.role === "starting")
        .sort((left, right) => left.index - right.index)
        .map((participant) => participant.participantName),
      bench: participants
        .filter((participant) => participant.role === "bench")
        .sort((left, right) => left.index - right.index)
        .map((participant) => participant.participantName),
    };
  };

  const home = await toTeamSignal(latestBySide.get("home"));
  const away = await toTeamSignal(latestBySide.get("away"));
  const updatedAt = sortByIsoDescending(
    [...latestBySide.values()],
    (item) => item.sourceUpdatedAt ?? item.capturedAt,
  )[0]?.sourceUpdatedAt ??
    sortByIsoDescending([...latestBySide.values()], (item) => item.capturedAt)[0]?.capturedAt;
  const official = [...latestBySide.values()].some((snapshot) => snapshot.lineupStatus === "confirmed");

  return {
    official,
    ...(updatedAt ? { updatedAt } : {}),
    ...(home ? { home } : {}),
    ...(away ? { away } : {}),
  };
};

const mergeResearchSignals = (
  base: ResearchSignalSnapshot,
  overrides: Partial<ResearchSignalSnapshot>,
): ResearchSignalSnapshot => ({
  ...base,
  ...overrides,
  ...(base.form || overrides.form
    ? { form: { ...(base.form ?? {}), ...(overrides.form ?? {}) } as NonNullable<ResearchSignalSnapshot["form"]> }
    : {}),
  ...(base.schedule || overrides.schedule
    ? { schedule: { ...(base.schedule ?? {}), ...(overrides.schedule ?? {}) } as NonNullable<ResearchSignalSnapshot["schedule"]> }
    : {}),
  ...(base.availability || overrides.availability
    ? { availability: { ...(base.availability ?? {}), ...(overrides.availability ?? {}) } as NonNullable<ResearchSignalSnapshot["availability"]> }
    : {}),
  ...(base.weather || overrides.weather
    ? { weather: { ...(base.weather ?? {}), ...(overrides.weather ?? {}) } as NonNullable<ResearchSignalSnapshot["weather"]> }
    : {}),
  ...(base.market || overrides.market
    ? { market: { ...(base.market ?? {}), ...(overrides.market ?? {}) } as NonNullable<ResearchSignalSnapshot["market"]> }
    : {}),
  ...(base.context || overrides.context
    ? { context: { ...(base.context ?? {}), ...(overrides.context ?? {}) } as NonNullable<ResearchSignalSnapshot["context"]> }
    : {}),
  ...(base.lineups || overrides.lineups
    ? { lineups: { ...(base.lineups ?? {}), ...(overrides.lineups ?? {}) } as NonNullable<ResearchSignalSnapshot["lineups"]> }
    : {}),
});

const buildResearchSignals = async (
  fixture: FixtureEntity,
  persistence: ResearchWorkerPersistence | undefined,
): Promise<ResearchSignalSnapshot> => {
  const metadataSignals = buildFixtureMetadataSignals(fixture);
  if (!persistence) {
    return metadataSignals;
  }

  const availabilitySignals = persistence.availabilitySnapshots
    ? buildAvailabilitySignals(await persistence.availabilitySnapshots.findByFixtureId(fixture.id))
    : undefined;
  const lineupsSignals = await buildLineupSignals(persistence, fixture.id);

  return mergeResearchSignals(metadataSignals, {
    ...(availabilitySignals ? { availability: availabilitySignals } : {}),
    ...(lineupsSignals ? { lineups: lineupsSignals } : {}),
    ...(lineupsSignals?.official && !availabilitySignals
      ? {
          availability: {
            injuriesHome: metadataSignals.availability?.injuriesHome ?? 0,
            injuriesAway: metadataSignals.availability?.injuriesAway ?? 0,
            official: true,
            ...(lineupsSignals.updatedAt ? { updatedAt: lineupsSignals.updatedAt } : {}),
          },
        }
      : {}),
  });
};

const stripLegacyResearchMetadata = (
  metadata: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => !LEGACY_METADATA_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  );

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

  return persistence.tasks.save({
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
  });
};

const persistAiRun = async (
  persistence: ResearchWorkerPersistence | undefined,
  aiRun: AiRunEntity,
): Promise<AiRunEntity> => (persistence?.aiRuns ? persistence.aiRuns.save(aiRun) : aiRun);

const toBundleStatus = (
  status: ResearchBundle["publicationStatus"],
): ResearchBundleStatus => status;

const toGateCode = (
  gate: ResearchBundle["gates"][number]["gate"],
): PersistableResearchGateReason["code"] => {
  switch (gate) {
    case "canonical-fixture":
      return "fixture-resolution";
    case "source-admissibility":
      return "source-admissibility";
    case "freshness":
      return "freshness";
    case "corroboration":
      return "corroboration";
    case "contradictions":
      return "contradiction";
    case "actionability":
    case "audit-completeness":
      return "coverage";
  }
};

const toGateSeverity = (
  status: ResearchBundle["gates"][number]["status"],
): PersistableResearchGateReason["severity"] => {
  switch (status) {
    case "failed":
      return "block";
    case "warn":
      return "warn";
    case "passed":
      return "info";
  }
};

const uniqueReasons = (
  reasons: readonly PersistableResearchGateReason[],
): PersistableResearchGateReason[] => {
  const seen = new Set<string>();
  const normalized: PersistableResearchGateReason[] = [];
  for (const reason of reasons) {
    const key = `${reason.code}:${reason.severity}:${reason.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(reason);
  }
  return normalized;
};

const buildGateReasons = (
  bundle: ResearchBundle,
): PersistableResearchGateReason[] => {
  const reasons = bundle.gates.flatMap((gate) =>
    gate.reasons.map((message) => ({
      code: toGateCode(gate.gate),
      severity: toGateSeverity(gate.status),
      message,
    })),
  );

  if (reasons.length > 0) {
    return uniqueReasons(reasons);
  }

  if (bundle.publicationStatus === "publishable") {
    return [];
  }

  return [{
    code: "coverage",
    severity: bundle.publicationStatus === "hold" ? "block" : "warn",
    message: `Research bundle status is ${bundle.publicationStatus}.`,
  }];
};

const toSourceAdmissibility = (
  source: ResearchBundle["sources"][number],
): PersistableSourceRecord["admissibility"] => {
  if (source.official) {
    return "official";
  }
  if (!source.admissible) {
    return "blocked";
  }
  return source.sourceTier === "A" || source.sourceTier === "B" ? "trusted" : "unverified";
};

const toClaimKind = (
  claim: ResearchBundle["claims"][number],
): PersistableClaim["kind"] => {
  switch (claim.claimType) {
    case "form_edge":
      return "form";
    case "rest_edge":
      return "schedule";
    case "availability_shift":
      return "availability";
    case "market_move":
      return "market";
    case "external_signal":
      return "model-hook";
    case "draw_signal":
    case "volatility_alert":
    case "weather_risk":
      return "tactical";
  }
};

const toClaimStatus = (
  claim: ResearchBundle["claims"][number],
): PersistableClaim["status"] => {
  if (claim.status === "suppressed" || claim.status === "refuted" || claim.corroborationStatus === "conflicted") {
    return "conflicted";
  }
  if (claim.freshnessScore < 0.5) {
    return "stale";
  }
  if (
    claim.status === "accepted" &&
    (claim.corroborationStatus === "official" || claim.corroborationStatus === "corroborated")
  ) {
    return "corroborated";
  }
  return "draft";
};

const toCorroboration = (
  claim: ResearchBundle["claims"][number],
): ClaimCorroboration => ({
  status:
    claim.corroborationStatus === "official"
      ? "official"
      : claim.corroborationStatus === "corroborated"
        ? "corroborated"
        : claim.corroborationStatus === "single-source"
          ? "single-source"
          : "none",
  requiredSourceCount:
    claim.critical && toClaimKind(claim) === "availability"
      ? 2
      : claim.critical && claim.sourceIds.length > 0
        ? 2
        : Math.max(1, claim.sourceIds.length > 0 ? 1 : 0),
  matchedSourceIds: [...claim.sourceIds],
});

const toAssignmentDimension = (
  signalFamily: ResearchBundle["plan"]["assignments"][number]["signalFamily"],
): ResearchAssignmentDimension => {
  switch (signalFamily) {
    case "availability":
      return "availability";
    case "form":
      return "form";
    case "schedule":
      return "schedule";
    case "market":
      return "market";
    case "weather":
    case "context":
    case "discovery":
    case "governance":
    case "synthesis":
      return "tactical";
  }
};

const buildResearchTrace = (
  trace: PersistableResearchTraceMetadata,
  bundle: ResearchBundle,
): PersistableResearchTraceMetadata => ({
  ...trace,
  plannerVersion: PLANNER_VERSION,
  assignmentIds: bundle.assignments.map((assignment) => assignment.assignmentId),
});

const buildPersistableAssignments = (
  bundle: ResearchBundle,
): PersistableResearchAssignment[] => {
  const resultsById = new Map(bundle.assignments.map((assignment) => [assignment.assignmentId, assignment]));
  return bundle.plan.assignments.map((assignment) => {
    const result = resultsById.get(assignment.id);
    const summary = result?.note?.trim();
    return {
      id: assignment.id,
      fixtureId: bundle.fixtureId,
      bundleId: bundle.id,
      dimension: toAssignmentDimension(assignment.signalFamily),
      status: (result?.status ?? "queued") as PersistableResearchAssignment["status"],
      attemptNumber: 1,
      startedAt: bundle.generatedAt,
      ...(result ? { finishedAt: bundle.generatedAt } : {}),
      ...(result?.status === "skipped" && summary ? { error: summary } : {}),
      ...(summary ? { summary } : {}),
      metadata: {
        taskType: assignment.taskType,
        signalFamily: assignment.signalFamily,
        priority: assignment.priority,
        required: assignment.required,
        deadline: assignment.deadline,
        budgetTokens: assignment.budgetTokens,
        budgetToolCalls: assignment.budgetToolCalls,
        searchQueries: [...assignment.searchQueries],
        sourceHints: [...assignment.sourceHints],
        requiredConfidence: assignment.requiredConfidence,
        freshnessSlaMinutes: assignment.freshnessSlaMinutes,
        reason: assignment.reason,
        sourceIds: [...(result?.sourceIds ?? [])],
        evidenceIds: [...(result?.evidenceIds ?? [])],
        claimIds: [...(result?.claimIds ?? [])],
      },
    };
  });
};

const buildPersistableSources = (
  bundle: ResearchBundle,
): PersistableSourceRecord[] =>
  bundle.sources.map((source) => ({
    id: source.id,
    fixtureId: bundle.fixtureId,
    bundleId: bundle.id,
    provider: source.provider,
    reference: source.reference,
    sourceType: source.sourceType,
    admissibility: toSourceAdmissibility(source),
    independenceKey: source.independenceKey,
    capturedAt: source.fetchedAt,
    metadata: {
      sourceTier: source.sourceTier,
      baseAuthorityScore: source.baseAuthorityScore,
      admissible: source.admissible,
      official: source.official,
      ...source.metadata,
    },
  }));

const buildPersistableClaims = (
  bundle: ResearchBundle,
  assignments: readonly PersistableResearchAssignment[],
): PersistableClaim[] => {
  const assignmentIdByClaimId = new Map<string, string>();
  for (const assignment of assignments) {
    const claimIds = Array.isArray(assignment.metadata.claimIds)
      ? assignment.metadata.claimIds.filter((value): value is string => typeof value === "string")
      : [];
    for (const claimId of claimIds) {
      assignmentIdByClaimId.set(claimId, assignment.id);
    }
  }

  return bundle.claims.map((claim) => {
    const kind = toClaimKind(claim);
    const corroboration = toCorroboration(claim);
    const assignmentId = assignmentIdByClaimId.get(claim.id);
    const freshnessExpiresAt = addHours(claim.effectiveTime, claim.freshnessSlaMinutes / 60);
    return {
      id: claim.id,
      fixtureId: bundle.fixtureId,
      bundleId: bundle.id,
      ...(assignmentId ? { assignmentId } : {}),
      kind,
      title: claim.summary,
      summary: claim.summary,
      direction: claim.direction,
      confidence: round(claim.reliabilityScore),
      impact: round(claim.estimatedEffectSize),
      significance: claim.critical ? "critical" : "supporting",
      status: toClaimStatus(claim),
      corroboration,
      freshnessWindowHours: round(claim.freshnessSlaMinutes / 60),
      extractedAt: claim.effectiveTime,
      ...(freshnessExpiresAt ? { freshnessExpiresAt } : {}),
      sourceIds: [...claim.sourceIds],
      metadata: {
        claimType: claim.claimType,
        signalFamily: claim.signalFamily,
        subjectEntity: claim.subjectEntity,
        predicate: claim.predicate,
        objectValue: claim.objectValue,
        impactedMarkets: claim.impactedMarkets.join("|"),
        contradictionClaimIds: claim.contradictionClaimIds.join("|"),
        freshnessScore: String(claim.freshnessScore),
        actionabilityScore: String(claim.actionabilityScore),
        engineStatus: claim.status,
        engineCorroborationStatus: claim.corroborationStatus,
      },
    };
  });
};

const buildPersistableConflicts = (
  bundle: ResearchBundle,
): PersistableClaimConflict[] =>
  bundle.conflicts.map((conflict) => ({
    id: conflict.id,
    fixtureId: bundle.fixtureId,
    bundleId: bundle.id,
    claimIds: [...conflict.claimIds],
    summary: conflict.reason,
    severity: conflict.severity,
    status: conflict.resolution === "open" ? "open" : "resolved",
    ...(conflict.resolution !== "open" ? { resolutionNote: conflict.resolution } : {}),
  }));

const toPersistableResearchBundle = (
  bundle: ResearchBundle,
  trace: ResearchTraceMetadata,
): PersistableResearchBundle => {
  const assignments = buildPersistableAssignments(bundle);
  const sources = buildPersistableSources(bundle);
  const claims = buildPersistableClaims(bundle, assignments);
  const conflicts = buildPersistableConflicts(bundle);
  const gateResult = {
    status: toBundleStatus(bundle.publicationStatus),
    reasons: buildGateReasons(bundle),
    gatedAt: bundle.generatedAt,
  } as const;

  return {
    id: bundle.id,
    fixtureId: bundle.fixtureId,
    generatedAt: bundle.generatedAt,
    brief: bundle.brief,
    claims,
    sources,
    conflicts,
    directionalScore: bundle.directionalScore,
    gateResult,
    summary: bundle.summary,
    recommendedLean: bundle.recommendedLean,
    risks: [...bundle.risks],
    assignments,
    trace,
  };
};

const buildReadiness = (
  snapshot: FeatureVectorSnapshot,
  bundleStatus: ResearchBundleStatus,
  gateReasons: readonly PersistableResearchGateReason[],
): PersistableFeatureSnapshot["readiness"] => {
  const reasons = [
    ...snapshot.readiness.reasons,
    ...(bundleStatus === "publishable"
      ? []
      : [`Research bundle status ${bundleStatus} blocks downstream scoring/publication.`]),
    ...gateReasons.map((reason) => `[${reason.code}] ${reason.message}`),
  ];

  return {
    status:
      snapshot.readiness.status === "ready" && bundleStatus === "publishable"
        ? "ready"
        : "needs-review",
    reasons: [...new Set(reasons)],
  };
};

const toPersistableFeatureSnapshot = (
  bundle: PersistableResearchBundle,
  snapshot: FeatureVectorSnapshot,
): PersistableFeatureSnapshot => ({
  id: createFeatureSnapshotId(bundle.id),
  fixtureId: snapshot.fixtureId,
  bundleId: bundle.id,
  generatedAt: snapshot.generatedAt,
  bundleStatus: bundle.gateResult.status,
  gateReasons: [...bundle.gateResult.reasons],
  recommendedLean: snapshot.recommendedLean,
  evidenceCount: snapshot.evidenceCount,
  topEvidence: snapshot.topEvidence.map((item) => ({
    id: item.id,
    title: item.title,
    direction: item.direction as PersistableFeatureSnapshot["topEvidence"][number]["direction"],
    weightedScore: item.weightedScore,
  })),
  risks: [...snapshot.risks],
  features: snapshot.features,
  readiness: buildReadiness(snapshot, bundle.gateResult.status, bundle.gateResult.reasons),
  ...(snapshot.researchTrace ? { researchTrace: snapshot.researchTrace } : {}),
});

const toResearchBundleEntity = (
  bundle: PersistableResearchBundle,
  aiRun: AiRunEntity | undefined,
): ResearchBundleEntity =>
  createResearchBundleEntity({
    id: bundle.id,
    fixtureId: bundle.fixtureId,
    generatedAt: bundle.generatedAt,
    brief: {
      headline: bundle.brief.headline,
      context: bundle.brief.context,
      questions: [...bundle.brief.questions],
      assumptions: [...bundle.brief.assumptions],
    },
    summary: bundle.summary,
    recommendedLean: bundle.recommendedLean,
    directionalScore: bundle.directionalScore,
    risks: [...bundle.risks],
    gateResult: bundle.gateResult,
    ...(bundle.trace ? { trace: { ...bundle.trace } as Record<string, unknown> } : {}),
    ...(aiRun ? { aiRunId: aiRun.id } : {}),
    createdAt: bundle.generatedAt,
    updatedAt: bundle.generatedAt,
  });

const toResearchSourceEntity = (
  source: PersistableSourceRecord,
): ResearchSourceEntity =>
  createResearchSourceEntity({
    id: source.id,
    fixtureId: source.fixtureId,
    bundleId: source.bundleId,
    provider: source.provider,
    reference: source.reference,
    sourceType: source.sourceType,
    ...(source.title ? { title: source.title } : {}),
    ...(source.url ? { url: source.url } : {}),
    admissibility: source.admissibility,
    independenceKey: source.independenceKey,
    capturedAt: source.capturedAt,
    ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
    ...(source.freshnessExpiresAt ? { freshnessExpiresAt: source.freshnessExpiresAt } : {}),
    metadata: { ...source.metadata },
    createdAt: source.capturedAt,
    updatedAt: source.capturedAt,
  });

const toResearchClaimEntity = (
  claim: PersistableClaim,
): ResearchClaimEntity =>
  createResearchClaimEntity({
    id: claim.id,
    fixtureId: claim.fixtureId,
    bundleId: claim.bundleId,
    ...(claim.assignmentId ? { assignmentId: claim.assignmentId } : {}),
    kind: claim.kind,
    title: claim.title,
    summary: claim.summary,
    direction: claim.direction,
    confidence: claim.confidence,
    impact: claim.impact,
    significance: claim.significance,
    status: claim.status,
    corroborationStatus: claim.corroboration.status,
    requiredSourceCount: claim.corroboration.requiredSourceCount,
    matchedSourceIds: [...claim.corroboration.matchedSourceIds],
    freshnessWindowHours: claim.freshnessWindowHours,
    extractedAt: claim.extractedAt,
    ...(claim.freshnessExpiresAt ? { freshnessExpiresAt: claim.freshnessExpiresAt } : {}),
    metadata: { ...claim.metadata },
    createdAt: claim.extractedAt,
    updatedAt: claim.extractedAt,
  });

const toResearchClaimSourceEntities = (
  claim: PersistableClaim,
): ResearchClaimSourceEntity[] =>
  claim.sourceIds.map((sourceId, index) =>
    createResearchClaimSourceEntity({
      id: `${claim.id}:source:${index}`,
      claimId: claim.id,
      sourceId,
      orderIndex: index,
    }),
  );

const toResearchConflictEntity = (
  conflict: PersistableClaimConflict,
  generatedAt: string,
): ResearchConflictEntity =>
  createResearchConflictEntity({
    id: conflict.id,
    fixtureId: conflict.fixtureId,
    bundleId: conflict.bundleId,
    claimIds: [...conflict.claimIds],
    summary: conflict.summary,
    severity: conflict.severity,
    status: conflict.status,
    ...(conflict.resolutionNote ? { resolutionNote: conflict.resolutionNote } : {}),
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });

const toResearchAssignmentEntity = (
  assignment: PersistableResearchAssignment,
  generatedAt: string,
): ResearchAssignmentEntity =>
  createResearchAssignmentEntity({
    id: assignment.id,
    fixtureId: assignment.fixtureId,
    ...(assignment.bundleId ? { bundleId: assignment.bundleId } : {}),
    dimension: assignment.dimension,
    status: assignment.status,
    attemptNumber: assignment.attemptNumber,
    ...(assignment.startedAt ? { startedAt: assignment.startedAt } : {}),
    ...(assignment.finishedAt ? { finishedAt: assignment.finishedAt } : {}),
    ...(assignment.error ? { error: assignment.error } : {}),
    ...(assignment.summary ? { summary: assignment.summary } : {}),
    metadata: { ...assignment.metadata },
    createdAt: assignment.startedAt ?? generatedAt,
    updatedAt: assignment.finishedAt ?? assignment.startedAt ?? generatedAt,
  });

const toFeatureSnapshotEntity = (
  snapshot: PersistableFeatureSnapshot,
): FeatureSnapshotEntity =>
  createFeatureSnapshotEntity({
    id: snapshot.id,
    fixtureId: snapshot.fixtureId,
    bundleId: snapshot.bundleId,
    generatedAt: snapshot.generatedAt,
    bundleStatus: snapshot.bundleStatus,
    gateReasons: [...snapshot.gateReasons],
    recommendedLean: snapshot.recommendedLean,
    evidenceCount: snapshot.evidenceCount,
    topEvidence: snapshot.topEvidence.map((item) => ({
      id: item.id,
      title: item.title,
      direction: item.direction,
      weightedScore: item.weightedScore,
    })),
    risks: [...snapshot.risks],
    features: snapshot.features,
    readiness: snapshot.readiness,
    ...(snapshot.researchTrace ? { researchTrace: snapshot.researchTrace } : {}),
    createdAt: snapshot.generatedAt,
    updatedAt: snapshot.generatedAt,
  });

const persistResearchArtifacts = async (
  persistence: ResearchWorkerPersistence | undefined,
  bundle: PersistableResearchBundle,
  snapshot: PersistableFeatureSnapshot,
  aiRun: AiRunEntity | undefined,
): Promise<void> => {
  if (!persistence) {
    return;
  }

  if (persistence.researchBundles) {
    await persistence.researchBundles.save(toResearchBundleEntity(bundle, aiRun));
  }

  if (persistence.researchSources) {
    await Promise.all(bundle.sources.map((source) => persistence.researchSources!.save(toResearchSourceEntity(source))));
  }

  if (persistence.researchClaims) {
    await Promise.all(bundle.claims.map((claim) => persistence.researchClaims!.save(toResearchClaimEntity(claim))));
  }

  if (persistence.researchClaimSources) {
    const claimSources = bundle.claims.flatMap(toResearchClaimSourceEntities);
    await Promise.all(
      claimSources.map((claimSource) => persistence.researchClaimSources!.save(claimSource)),
    );
  }

  if (persistence.researchConflicts) {
    await Promise.all(
      bundle.conflicts.map((conflict) =>
        persistence.researchConflicts!.save(toResearchConflictEntity(conflict, bundle.generatedAt)),
      ),
    );
  }

  if (persistence.researchAssignments) {
    await Promise.all(
      bundle.assignments.map((assignment) =>
        persistence.researchAssignments!.save(
          toResearchAssignmentEntity(assignment, bundle.generatedAt),
        ),
      ),
    );
  }

  if (persistence.featureSnapshots) {
    await persistence.featureSnapshots.save(toFeatureSnapshotEntity(snapshot));
  }

  if (persistence.auditEvents) {
    await persistence.auditEvents.save(
      createAuditEvent({
        id: `audit:research-bundle:${bundle.fixtureId}:${bundle.generatedAt}`,
        aggregateType: "fixture",
        aggregateId: bundle.fixtureId,
        eventType: "research.bundle.persisted",
        actor: "research-worker",
        payload: {
          bundleId: bundle.id,
          featureSnapshotId: snapshot.id,
          status: bundle.gateResult.status,
          gateReasons: bundle.gateResult.reasons,
          recommendedLean: bundle.recommendedLean,
          aiRunId: aiRun?.id ?? null,
        },
        occurredAt: bundle.generatedAt,
      }),
    );
  }
};

const persistResearchWorkflow = async (
  persistence: ResearchWorkerPersistence | undefined,
  fixtureId: string,
  generatedAt: string,
  bundle: PersistableResearchBundle,
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

  const candidateStatus = bundle.gateResult.status === "publishable" ? "succeeded" : "blocked";
  const next = transitionFixtureWorkflowStage(
    transitionFixtureWorkflowStage(current, "enrichment", {
      status: "succeeded",
      occurredAt: generatedAt,
      diagnostics: {
        ...(current.diagnostics ?? {}),
        researchBundle: {
          bundleId: bundle.id,
          status: bundle.gateResult.status,
          gateReasons: bundle.gateResult.reasons,
        },
      },
    }),
    "candidate",
    {
      status: candidateStatus,
      occurredAt: generatedAt,
      isCandidate: bundle.gateResult.status === "publishable",
      diagnostics: {
        ...(current.diagnostics ?? {}),
        researchBundle: {
          bundleId: bundle.id,
          status: bundle.gateResult.status,
          gateReasons: bundle.gateResult.reasons,
        },
      },
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
  await ensureTask(input.persistence, input.fixture.id, generatedAt);
  const researchSignals = await buildResearchSignals(input.fixture, input.persistence);

  const baseBundleOptions: BuildResearchBundleOptions = {
    now: () => generatedAt,
    signals: researchSignals,
    ...(input.evidence ? { evidence: input.evidence } : {}),
    ...(input.synthesisHook ? { synthesisHook: input.synthesisHook } : {}),
  };

  const baselineBundle = buildResearchBundle(input.fixture, baseBundleOptions);
  let bundle = baselineBundle;
  let aiRun: AiRunEntity | undefined;
  let researchTrace: ResearchTraceMetadata = { synthesisMode: "deterministic" };

  if (isAiEnabled(input.ai)) {
    const promptVersion = renderResearchAiPrompt({
      fixture: input.fixture,
      brief: baselineBundle.brief,
      evidence: baselineBundle.evidence,
      directionalScore: baselineBundle.directionalScore,
      ...(input.ai ? { config: input.ai } : {}),
    }).version;

    try {
      const aiTrace = await runResearchSynthesisAi({
        fixture: input.fixture,
        brief: baselineBundle.brief,
        evidence: baselineBundle.evidence,
        directionalScore: baselineBundle.directionalScore,
        generatedAt,
        ...(input.ai ? { config: input.ai } : {}),
        ...(input.persistence ? { persistence: input.persistence } : {}),
      });
      aiRun = aiTrace.aiRun;
      researchTrace = aiTrace.metadata;
      bundle = applyResearchSynthesis(bundle, {
        summary: aiTrace.structuredOutput.summary,
        ...(aiTrace.structuredOutput.risks && aiTrace.structuredOutput.risks.length > 0
          ? { risks: aiTrace.structuredOutput.risks }
          : {}),
      });
    } catch (error) {
      const fallbackTrace = await createFallbackTrace(
        {
          fixture: input.fixture,
          brief: baselineBundle.brief,
          evidence: baselineBundle.evidence,
          directionalScore: baselineBundle.directionalScore,
          generatedAt,
          ...(input.ai ? { config: input.ai } : {}),
          ...(input.persistence ? { persistence: input.persistence } : {}),
        },
        promptVersion,
        error,
      );
      aiRun = fallbackTrace.aiRun;
      researchTrace = fallbackTrace.metadata;
      bundle = {
        ...baselineBundle,
        risks: [
          ...baselineBundle.risks,
          fallbackTrace.metadata.fallbackSummary ?? "AI synthesis fallback applied.",
        ],
      };
    }
  }

  const bundleTrace = buildResearchTrace(researchTrace, bundle);
  const dossier = buildResearchDossierFromBundle(bundle);
  const featureSnapshot = buildFeatureVectorSnapshot({
    fixture: input.fixture,
    dossier,
    generatedAt,
    researchTrace,
    signals: researchSignals,
  });
  const persistableResearchBundle = toPersistableResearchBundle(bundle, bundleTrace);
  const persistableFeatureSnapshot = toPersistableFeatureSnapshot(
    persistableResearchBundle,
    featureSnapshot,
  );
  const persistedFixtureCandidate: FixtureEntity = {
    ...input.fixture,
    metadata: stripLegacyResearchMetadata(input.fixture.metadata),
    updatedAt: generatedAt,
  };

  await persistResearchArtifacts(
    input.persistence,
    persistableResearchBundle,
    persistableFeatureSnapshot,
    aiRun,
  );

  const persistedFixture = input.persistence?.fixtures
    ? await input.persistence.fixtures.save(persistedFixtureCandidate)
    : persistedFixtureCandidate;
  const workflow = await persistResearchWorkflow(
    input.persistence,
    input.fixture.id,
    generatedAt,
    persistableResearchBundle,
  );

  return {
    status: "processed",
    fixture: persistedFixture,
    bundle,
    dossier,
    featureSnapshot,
    persistableResearchBundle,
    persistableFeatureSnapshot,
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
