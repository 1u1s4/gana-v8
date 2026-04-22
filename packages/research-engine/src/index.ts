import type {
  DirectionalResearchScore,
  EvidenceDirection,
  EvidenceItem,
  EvidenceKind,
  ResearchBrief,
  ResearchDossier,
  ResearchQuestion,
  ResearchSynthesisHook,
  ResearchSynthesisHookInput,
  ResearchSynthesisHookOutput,
} from "@gana-v8/research-contracts";

export const workspaceInfo = {
  packageName: "@gana-v8/research-engine",
  workspaceName: "research-engine",
  category: "package",
  description: "Research orchestration and evidence scoring primitives.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/research-contracts", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
  ],
} as const;

export type {
  DirectionalResearchScore,
  EvidenceDirection,
  EvidenceItem,
  EvidenceKind,
  ResearchBrief,
  ResearchDossier,
  ResearchQuestion,
  ResearchSynthesisHook,
  ResearchSynthesisHookInput,
  ResearchSynthesisHookOutput,
} from "@gana-v8/research-contracts";

export interface FixtureLike {
  readonly id: string;
  readonly competition: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly scheduledAt: string;
  readonly status: "scheduled" | "live" | "completed" | "cancelled";
  readonly metadata: Record<string, string>;
}

export interface ResearchFormSignal {
  readonly home: number;
  readonly away: number;
  readonly updatedAt?: string;
}

export interface ResearchScheduleSignal {
  readonly restHomeDays: number;
  readonly restAwayDays: number;
  readonly updatedAt?: string;
}

export interface ResearchAvailabilitySignal {
  readonly injuriesHome: number;
  readonly injuriesAway: number;
  readonly official: boolean;
  readonly updatedAt?: string;
  readonly homeUnavailableNames?: readonly string[];
  readonly awayUnavailableNames?: readonly string[];
}

export interface ResearchWeatherSignal {
  readonly severity: number;
  readonly elevatedRisk?: boolean;
  readonly updatedAt?: string;
}

export interface ResearchMarketSignal {
  readonly lean?: Exclude<EvidenceDirection, "neutral">;
  readonly move?: number;
  readonly oddsHomeImplied?: number;
  readonly oddsDrawImplied?: number;
  readonly oddsAwayImplied?: number;
  readonly updatedAt?: string;
}

export interface ResearchContextSignal {
  readonly derby: boolean;
  readonly drawBias?: number;
  readonly updatedAt?: string;
}

export interface ResearchLineupTeamSignal {
  readonly status: "projected" | "confirmed";
  readonly formation?: string;
  readonly starters?: readonly string[];
  readonly bench?: readonly string[];
}

export interface ResearchLineupsSignal {
  readonly official: boolean;
  readonly updatedAt?: string;
  readonly home?: ResearchLineupTeamSignal;
  readonly away?: ResearchLineupTeamSignal;
}

export interface ResearchSignalSnapshot {
  readonly form?: ResearchFormSignal;
  readonly schedule?: ResearchScheduleSignal;
  readonly availability?: ResearchAvailabilitySignal;
  readonly weather?: ResearchWeatherSignal;
  readonly market?: ResearchMarketSignal;
  readonly context?: ResearchContextSignal;
  readonly lineups?: ResearchLineupsSignal;
}

export type ResearchKickoffPhase =
  | "precheck"
  | "midcycle"
  | "final-hour"
  | "locked";

export type ResearchSignalFamily =
  | "discovery"
  | "form"
  | "schedule"
  | "availability"
  | "weather"
  | "market"
  | "context"
  | "governance"
  | "synthesis";

export type ResearchTaskType =
  | "source_discovery"
  | "news_scan"
  | "lineup_projection"
  | "weather_check"
  | "market_crosscheck"
  | "claim_normalization"
  | "reliability_scoring"
  | "fixture_synthesis"
  | "quality_gate";

export interface ResearchCoverageMap {
  readonly form: boolean;
  readonly schedule: boolean;
  readonly availability: boolean;
  readonly weather: boolean;
  readonly market: boolean;
  readonly context: boolean;
}

export interface ResearchCoverageSummary {
  readonly requiredFamilies: readonly ResearchSignalFamily[];
  readonly coveredFamilies: readonly ResearchSignalFamily[];
  readonly missingFamilies: readonly ResearchSignalFamily[];
  readonly score: number;
}

export interface ResearchAssignment {
  readonly id: string;
  readonly fixtureId: string;
  readonly taskType: ResearchTaskType;
  readonly signalFamily: ResearchSignalFamily;
  readonly priority: number;
  readonly required: boolean;
  readonly deadline: string;
  readonly budgetTokens: number;
  readonly budgetToolCalls: number;
  readonly searchQueries: readonly string[];
  readonly sourceHints: readonly string[];
  readonly requiredConfidence: number;
  readonly freshnessSlaMinutes: number;
  readonly reason: string;
}

export interface ResearchPlan {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly kickoffPhase: ResearchKickoffPhase;
  readonly coverageScore: number;
  readonly focus: readonly string[];
  readonly assignments: readonly ResearchAssignment[];
  readonly requiredFamilies: readonly ResearchSignalFamily[];
  readonly coverage: ResearchCoverageMap;
  readonly alerts: readonly string[];
}

export interface ResearchAssignmentResult {
  readonly assignmentId: string;
  readonly taskType: ResearchTaskType;
  readonly signalFamily: ResearchSignalFamily;
  readonly status: "completed" | "skipped";
  readonly sourceIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly note: string;
}

export type SourceTier = "A" | "B" | "C" | "D";
export type SourceType =
  | "metadata"
  | "official"
  | "market"
  | "weather"
  | "manual"
  | "media";

export interface SourceRecord {
  readonly id: string;
  readonly fixtureId: string;
  readonly provider: string;
  readonly reference: string;
  readonly sourceType: SourceType;
  readonly sourceTier: SourceTier;
  readonly baseAuthorityScore: number;
  readonly independenceKey: string;
  readonly admissible: boolean;
  readonly official: boolean;
  readonly fetchedAt: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export type ResearchClaimType =
  | "form_edge"
  | "rest_edge"
  | "availability_shift"
  | "draw_signal"
  | "volatility_alert"
  | "weather_risk"
  | "market_move"
  | "external_signal";

export type ResearchClaimStatus =
  | "accepted"
  | "uncertain"
  | "suppressed"
  | "refuted";

export type ResearchCorroborationStatus =
  | "not-required"
  | "official"
  | "corroborated"
  | "single-source"
  | "conflicted";

export interface ResearchClaim {
  readonly id: string;
  readonly fixtureId: string;
  readonly claimType: ResearchClaimType;
  readonly signalFamily: ResearchSignalFamily;
  readonly subjectEntity: string;
  readonly predicate: string;
  readonly objectValue: string;
  readonly status: ResearchClaimStatus;
  readonly direction: EvidenceDirection;
  readonly critical: boolean;
  readonly effectiveTime: string;
  readonly extractedFromEvidenceIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly contradictionClaimIds: readonly string[];
  readonly impactedMarkets: readonly string[];
  readonly estimatedEffectSize: number;
  readonly freshnessSlaMinutes: number;
  readonly freshnessScore: number;
  readonly corroborationStatus: ResearchCorroborationStatus;
  readonly reliabilityScore: number;
  readonly actionabilityScore: number;
  readonly summary: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export type ResearchConflictSeverity = "low" | "medium" | "high";

export interface ResearchConflictRecord {
  readonly id: string;
  readonly fixtureId: string;
  readonly claimIds: readonly string[];
  readonly severity: ResearchConflictSeverity;
  readonly reason: string;
  readonly resolution: "open" | "resolved-official" | "suppressed";
  readonly metadata: Readonly<Record<string, string>>;
}

export type ResearchGateName =
  | "canonical-fixture"
  | "source-admissibility"
  | "freshness"
  | "corroboration"
  | "contradictions"
  | "actionability"
  | "audit-completeness";

export type ResearchGateStatus = "passed" | "warn" | "failed";
export type ResearchPublicationStatus = "publishable" | "degraded" | "hold";

export interface ResearchGateResult {
  readonly gate: ResearchGateName;
  readonly status: ResearchGateStatus;
  readonly reasons: readonly string[];
  readonly affectedClaimIds: readonly string[];
}

export interface ResearchFeatureUpdate {
  readonly key: string;
  readonly direction: EvidenceDirection;
  readonly score: number;
  readonly reason: string;
  readonly claimIds: readonly string[];
}

export interface ResearchBundle {
  readonly id: string;
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly brief: ResearchBrief;
  readonly plan: ResearchPlan;
  readonly assignments: readonly ResearchAssignmentResult[];
  readonly coverage: ResearchCoverageSummary;
  readonly sources: readonly SourceRecord[];
  readonly evidence: readonly EvidenceItem[];
  readonly claims: readonly ResearchClaim[];
  readonly conflicts: readonly ResearchConflictRecord[];
  readonly gates: readonly ResearchGateResult[];
  readonly directionalScore: DirectionalResearchScore;
  readonly recommendedLean: Exclude<EvidenceDirection, "neutral">;
  readonly summary: string;
  readonly risks: readonly string[];
  readonly topClaims: readonly ResearchClaim[];
  readonly suppressedClaims: readonly ResearchClaim[];
  readonly criticalAlerts: readonly string[];
  readonly evidenceIndex: readonly EvidenceItem[];
  readonly recommendedFeatureUpdates: readonly ResearchFeatureUpdate[];
  readonly publicationStatus: ResearchPublicationStatus;
  readonly coverageScore: number;
  readonly freshnessScore: number;
  readonly contradictionScore: number;
  readonly bundleReliabilityScore: number;
}

export interface ResearchEngineOptions {
  readonly now?: () => string;
  readonly synthesisHook?: ResearchSynthesisHook;
  readonly signals?: ResearchSignalSnapshot;
}

export interface BuildResearchBundleOptions extends ResearchEngineOptions {
  readonly evidence?: readonly EvidenceItem[];
}

export interface BuildResearchDossierOptions extends ResearchEngineOptions {
  readonly evidence?: readonly EvidenceItem[];
}

interface ResearchExecutionArtifacts {
  readonly assignments: readonly ResearchAssignmentResult[];
  readonly sources: readonly SourceRecord[];
  readonly evidence: readonly EvidenceItem[];
}

interface ResolvedResearchSignals {
  readonly form: {
    readonly available: boolean;
    readonly home: number;
    readonly away: number;
    readonly updatedAt: string;
  };
  readonly schedule: {
    readonly available: boolean;
    readonly restHomeDays: number;
    readonly restAwayDays: number;
    readonly updatedAt: string;
  };
  readonly availability: {
    readonly available: boolean;
    readonly injuriesHome: number;
    readonly injuriesAway: number;
    readonly official: boolean;
    readonly updatedAt: string;
    readonly sourceProvider: string;
    readonly sourceReference: string;
    readonly homeUnavailableNames: readonly string[];
    readonly awayUnavailableNames: readonly string[];
  };
  readonly weather: {
    readonly available: boolean;
    readonly severity: number;
    readonly elevatedRisk: boolean;
    readonly updatedAt: string;
  };
  readonly market: {
    readonly available: boolean;
    readonly lean?: Exclude<EvidenceDirection, "neutral">;
    readonly move: number;
    readonly oddsHomeImplied?: number;
    readonly oddsDrawImplied?: number;
    readonly oddsAwayImplied?: number;
    readonly updatedAt: string;
  };
  readonly context: {
    readonly available: boolean;
    readonly derby: boolean;
    readonly drawBias: number;
    readonly updatedAt: string;
  };
  readonly lineups: {
    readonly available: boolean;
    readonly official: boolean;
    readonly updatedAt: string;
    readonly home?: ResearchLineupTeamSignal;
    readonly away?: ResearchLineupTeamSignal;
  };
}

interface ClaimSeed {
  readonly claimType: ResearchClaimType;
  readonly signalFamily: ResearchSignalFamily;
  readonly subjectEntity: string;
  readonly predicate: string;
  readonly direction: EvidenceDirection;
  readonly impactedMarkets: readonly string[];
  readonly critical: boolean;
  readonly freshnessSlaMinutes: number;
}

const CLAIM_STATUS_WEIGHT: Record<ResearchClaimStatus, number> = {
  accepted: 1,
  uncertain: 0.7,
  suppressed: 0.2,
  refuted: 0.05,
};

const SOURCE_CONFLICT_RESOLUTION_WEIGHT: Record<
  ResearchConflictRecord["resolution"],
  number
> = {
  open: 1,
  "resolved-official": 0.35,
  suppressed: 0.2,
};

const SOURCE_AUTHORITY: Record<
  string,
  { readonly sourceType: SourceType; readonly tier: SourceTier; readonly authority: number; readonly official: boolean }
> = {
  "canonical-fixture": {
    sourceType: "metadata",
    tier: "B",
    authority: 0.78,
    official: false,
  },
  "fixture-metadata": {
    sourceType: "metadata",
    tier: "C",
    authority: 0.62,
    official: false,
  },
  "official-team-feed": {
    sourceType: "official",
    tier: "A",
    authority: 0.95,
    official: true,
  },
  "availability-snapshot": {
    sourceType: "official",
    tier: "A",
    authority: 0.92,
    official: true,
  },
  "lineup-snapshot": {
    sourceType: "official",
    tier: "A",
    authority: 0.94,
    official: true,
  },
  "weather-feed": {
    sourceType: "weather",
    tier: "A",
    authority: 0.88,
    official: true,
  },
  "market-feed": {
    sourceType: "market",
    tier: "B",
    authority: 0.8,
    official: false,
  },
  "manual-upload": {
    sourceType: "manual",
    tier: "B",
    authority: 0.76,
    official: false,
  },
};

const nowIso = (): string => new Date().toISOString();

const metadataNumber = (
  metadata: Record<string, string>,
  key: string,
  fallback = 0,
): number => {
  const raw = metadata[key];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const metadataBoolean = (
  metadata: Record<string, string>,
  key: string,
): boolean => metadata[key]?.trim().toLowerCase() === "true";

const metadataString = (
  metadata: Record<string, string>,
  key: string,
): string | undefined => {
  const value = metadata[key]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const metadataTimestamp = (
  metadata: Record<string, string>,
  keys: readonly string[],
  fallback: string,
): string => {
  for (const key of keys) {
    const value = metadataString(metadata, key);
    if (value !== undefined && Number.isFinite(Date.parse(value))) {
      return value;
    }
  }

  return fallback;
};

const maybeNumber = (value: number | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const maybeTimestamp = (value: string | undefined, fallback: string): string =>
  value && Number.isFinite(Date.parse(value)) ? value : fallback;

const resolveResearchSignals = (
  fixture: FixtureLike,
  input: ResearchSignalSnapshot | undefined,
  generatedAt: string,
): ResolvedResearchSignals => {
  const metadata = fixture.metadata;
  const formHomeFromMetadata = metadataString(metadata, "formHome");
  const formAwayFromMetadata = metadataString(metadata, "formAway");
  const restHomeFromMetadata = metadataString(metadata, "restHomeDays");
  const restAwayFromMetadata = metadataString(metadata, "restAwayDays");
  const injuriesHomeFromMetadata = metadataString(metadata, "injuriesHome");
  const injuriesAwayFromMetadata = metadataString(metadata, "injuriesAway");
  const weatherSeverityFromMetadata = metadataString(metadata, "weatherSeverity");
  const marketLeanFromMetadata = metadataString(metadata, "marketLean");
  const marketMoveFromMetadata = metadataString(metadata, "marketMove");
  const drawBiasFromMetadata = metadataString(metadata, "drawBias");
  const officialAvailabilityFromMetadata = metadataBoolean(metadata, "officialAvailability");
  const officialLineupFromMetadata = metadataBoolean(metadata, "officialLineup");
  const homeImpliedFromMetadata = maybeNumber(metadataNumber(metadata, "oddsHomeImplied", Number.NaN));
  const drawImpliedFromMetadata = maybeNumber(metadataNumber(metadata, "oddsDrawImplied", Number.NaN));
  const awayImpliedFromMetadata = maybeNumber(metadataNumber(metadata, "oddsAwayImplied", Number.NaN));

  const lineupsAvailable =
    input?.lineups !== undefined ||
    officialLineupFromMetadata;
  const lineupsOfficial =
    input?.lineups?.official ??
    officialLineupFromMetadata;
  const lineupsUpdatedAt =
    maybeTimestamp(
      input?.lineups?.updatedAt,
      metadataTimestamp(metadata, ["officialLineupUpdatedAt"], generatedAt),
    );
  const availabilityOfficial =
    input?.availability?.official ??
    (officialAvailabilityFromMetadata || lineupsOfficial);
  const marketHomeImplied = maybeNumber(input?.market?.oddsHomeImplied) ?? homeImpliedFromMetadata;
  const marketDrawImplied = maybeNumber(input?.market?.oddsDrawImplied) ?? drawImpliedFromMetadata;
  const marketAwayImplied = maybeNumber(input?.market?.oddsAwayImplied) ?? awayImpliedFromMetadata;

  return {
    form: {
      available: input?.form !== undefined || formHomeFromMetadata !== undefined || formAwayFromMetadata !== undefined,
      home: input?.form?.home ?? metadataNumber(metadata, "formHome", 0.5),
      away: input?.form?.away ?? metadataNumber(metadata, "formAway", 0.5),
      updatedAt: maybeTimestamp(input?.form?.updatedAt, metadataTimestamp(metadata, ["formUpdatedAt"], generatedAt)),
    },
    schedule: {
      available:
        input?.schedule !== undefined ||
        restHomeFromMetadata !== undefined ||
        restAwayFromMetadata !== undefined,
      restHomeDays: input?.schedule?.restHomeDays ?? metadataNumber(metadata, "restHomeDays", 3),
      restAwayDays: input?.schedule?.restAwayDays ?? metadataNumber(metadata, "restAwayDays", 3),
      updatedAt: maybeTimestamp(
        input?.schedule?.updatedAt,
        metadataTimestamp(metadata, ["scheduleUpdatedAt"], generatedAt),
      ),
    },
    availability: {
      available:
        input?.availability !== undefined ||
        injuriesHomeFromMetadata !== undefined ||
        injuriesAwayFromMetadata !== undefined ||
        officialAvailabilityFromMetadata ||
        lineupsAvailable,
      injuriesHome: input?.availability?.injuriesHome ?? metadataNumber(metadata, "injuriesHome", 0),
      injuriesAway: input?.availability?.injuriesAway ?? metadataNumber(metadata, "injuriesAway", 0),
      official: availabilityOfficial,
      updatedAt: maybeTimestamp(
        input?.availability?.updatedAt,
        metadataTimestamp(
          metadata,
          ["officialAvailabilityUpdatedAt", "injuriesUpdatedAt", "officialLineupUpdatedAt"],
          generatedAt,
        ),
      ),
      sourceProvider:
        input?.availability !== undefined
          ? "availability-snapshot"
          : lineupsAvailable
            ? "lineup-snapshot"
            : "canonical-fixture",
      sourceReference:
        input?.availability !== undefined
          ? "availability-snapshot"
          : lineupsAvailable
            ? "lineup-snapshot"
            : "fixture-context",
      homeUnavailableNames: [...(input?.availability?.homeUnavailableNames ?? [])],
      awayUnavailableNames: [...(input?.availability?.awayUnavailableNames ?? [])],
    },
    weather: {
      available:
        input?.weather !== undefined ||
        weatherSeverityFromMetadata !== undefined ||
        metadataString(metadata, "weatherRisk") !== undefined ||
        metadataString(metadata, "weatherUpdatedAt") !== undefined,
      severity:
        input?.weather?.severity ??
        clamp(
          Math.max(
            metadataNumber(metadata, "weatherSeverity", 0),
            metadataBoolean(metadata, "weatherRisk") ? 0.45 : 0,
          ),
          0,
          1,
        ),
      elevatedRisk:
        input?.weather?.elevatedRisk ??
        metadataBoolean(metadata, "weatherRisk"),
      updatedAt: maybeTimestamp(
        input?.weather?.updatedAt,
        metadataTimestamp(metadata, ["weatherUpdatedAt"], generatedAt),
      ),
    },
    market: {
      available:
        input?.market !== undefined ||
        marketLeanFromMetadata !== undefined ||
        marketMoveFromMetadata !== undefined ||
        homeImpliedFromMetadata !== undefined ||
        awayImpliedFromMetadata !== undefined,
      ...(input?.market?.lean ? { lean: input.market.lean } : {}),
      move: maybeNumber(input?.market?.move) ?? Math.abs(metadataNumber(metadata, "marketMove", 0)),
      ...(marketHomeImplied !== undefined ? { oddsHomeImplied: marketHomeImplied } : {}),
      ...(marketDrawImplied !== undefined ? { oddsDrawImplied: marketDrawImplied } : {}),
      ...(marketAwayImplied !== undefined ? { oddsAwayImplied: marketAwayImplied } : {}),
      updatedAt: maybeTimestamp(
        input?.market?.updatedAt,
        metadataTimestamp(metadata, ["marketUpdatedAt"], generatedAt),
      ),
    },
    context: {
      available:
        input?.context !== undefined ||
        metadataBoolean(metadata, "derby") ||
        drawBiasFromMetadata !== undefined,
      derby: input?.context?.derby ?? metadataBoolean(metadata, "derby"),
      drawBias: maybeNumber(input?.context?.drawBias) ?? metadataNumber(metadata, "drawBias", 0),
      updatedAt: maybeTimestamp(
        input?.context?.updatedAt,
        metadataTimestamp(metadata, ["contextUpdatedAt"], generatedAt),
      ),
    },
    lineups: {
      available: lineupsAvailable,
      official: lineupsOfficial,
      updatedAt: lineupsUpdatedAt,
      ...(input?.lineups?.home ? { home: input.lineups.home } : {}),
      ...(input?.lineups?.away ? { away: input.lineups.away } : {}),
    },
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number): number => Number(value.toFixed(4));

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createEvidenceId = (fixtureId: string, suffix: string): string =>
  `${fixtureId}:${suffix}`;

const createAssignmentId = (
  fixtureId: string,
  taskType: ResearchTaskType,
): string => `${fixtureId}:assignment:${taskType}`;

const createBundleId = (fixtureId: string, generatedAt: string): string =>
  `${fixtureId}:bundle:${generatedAt}`;

const createSourceId = (
  fixtureId: string,
  provider: string,
  reference: string,
): string => `${fixtureId}:source:${slugify(`${provider}-${reference}`)}`;

const createConflictId = (fixtureId: string, suffix: string): string =>
  `${fixtureId}:conflict:${suffix}`;

const minutesBetween = (earlier: string, later: string): number => {
  const earlierMs = Date.parse(earlier);
  const laterMs = Date.parse(later);
  if (!Number.isFinite(earlierMs) || !Number.isFinite(laterMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((laterMs - earlierMs) / 60_000));
};

const hoursUntilKickoff = (scheduledAt: string, generatedAt: string): number => {
  const scheduledAtMs = Date.parse(scheduledAt);
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(scheduledAtMs) || !Number.isFinite(generatedAtMs)) {
    return 0;
  }

  return round((scheduledAtMs - generatedAtMs) / 3_600_000);
};

const addMinutes = (iso: string, minutes: number, fallback: string): string => {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }

  return new Date(timestamp + minutes * 60_000).toISOString();
};

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const uniqueStrings = (values: readonly string[]): string[] =>
  [...new Set(values.filter((value) => value.length > 0))];

const baseQuestions = (fixture: FixtureLike): ResearchQuestion[] => [
  `Llega ${fixture.homeTeam} con ventaja real de forma o contexto?`,
  `Existe alguna senal de calendario o bajas que empuje a ${fixture.awayTeam}?`,
  `El partido ${fixture.homeTeam} vs ${fixture.awayTeam} tiene argumentos para un empate por equilibrio?`,
];

const resolveKickoffPhase = (
  fixture: FixtureLike,
  generatedAt: string,
): ResearchKickoffPhase => {
  if (fixture.status !== "scheduled") {
    return "locked";
  }

  const leadHours = hoursUntilKickoff(fixture.scheduledAt, generatedAt);
  if (leadHours <= 0) {
    return "locked";
  }
  if (leadHours <= 1) {
    return "final-hour";
  }
  if (leadHours <= 6) {
    return "midcycle";
  }
  return "precheck";
};

const estimateCoverageMap = (
  signals: ResolvedResearchSignals,
): ResearchCoverageMap => {
  return {
    form: signals.form.available,
    schedule: signals.schedule.available,
    availability: signals.availability.available || signals.lineups.available,
    weather: signals.weather.available,
    market: signals.market.available,
    context: signals.context.available,
  };
};

const resolveRequiredFamilies = (
  kickoffPhase: ResearchKickoffPhase,
  coverage: ResearchCoverageMap,
): ResearchSignalFamily[] => {
  const families: ResearchSignalFamily[] = ["form", "schedule", "context"];

  if (
    kickoffPhase === "midcycle" ||
    kickoffPhase === "final-hour" ||
    coverage.availability
  ) {
    families.push("availability");
  }

  if (
    kickoffPhase === "midcycle" ||
    kickoffPhase === "final-hour" ||
    coverage.weather
  ) {
    families.push("weather");
  }

  if (kickoffPhase !== "locked" || coverage.market) {
    families.push("market");
  }

  return families;
};

const scoreCoverage = (
  coverage: ResearchCoverageMap,
  requiredFamilies: readonly ResearchSignalFamily[],
): number => {
  const coverageFlags: Record<ResearchSignalFamily, boolean> = {
    discovery: true,
    form: coverage.form,
    schedule: coverage.schedule,
    availability: coverage.availability,
    weather: coverage.weather,
    market: coverage.market,
    context: coverage.context,
    governance: true,
    synthesis: true,
  };

  const required = requiredFamilies.filter((family) => family !== "discovery" && family !== "governance" && family !== "synthesis");
  if (required.length === 0) {
    return 1;
  }

  const covered = required.filter((family) => coverageFlags[family]).length;
  return round(covered / required.length);
};

const buildPlanFocus = (
  kickoffPhase: ResearchKickoffPhase,
  coverage: ResearchCoverageMap,
  signals: ResolvedResearchSignals,
): string[] => {
  const focus: string[] = [];

  if (kickoffPhase === "final-hour") {
    focus.push("Prioritize availability, weather, and late market changes.");
  } else if (kickoffPhase === "midcycle") {
    focus.push("Refresh injury, weather, and market context before kickoff.");
  } else if (kickoffPhase === "precheck") {
    focus.push("Build broad context and identify gaps that need corroboration.");
  } else {
    focus.push("Freeze pregame research and keep the bundle audit-safe.");
  }

  if (!coverage.availability) {
    focus.push("Availability coverage is missing and should be escalated.");
  }
  if (!coverage.weather && kickoffPhase !== "precheck") {
    focus.push("Weather coverage is missing close to kickoff.");
  }
  if (signals.context.derby) {
    focus.push("Derby context should keep volatility and draw scenarios in view.");
  }

  return focus;
};

const createAssignment = (
  fixture: FixtureLike,
  generatedAt: string,
  taskType: ResearchTaskType,
  signalFamily: ResearchSignalFamily,
  priority: number,
  required: boolean,
  freshnessSlaMinutes: number,
  reason: string,
): ResearchAssignment => {
  const budgetTokens =
    taskType === "source_discovery"
      ? 400
      : taskType === "quality_gate"
        ? 200
        : taskType === "fixture_synthesis"
          ? 250
          : 300;
  const budgetToolCalls =
    taskType === "source_discovery" ? 4 : taskType === "weather_check" ? 2 : 1;

  const defaultDeadline = addMinutes(generatedAt, freshnessSlaMinutes, generatedAt);
  const scheduledAtMs = Date.parse(fixture.scheduledAt);
  const deadline =
    Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.parse(generatedAt)
      ? new Date(
          Math.min(
            scheduledAtMs,
            Date.parse(defaultDeadline),
          ),
        ).toISOString()
      : defaultDeadline;

  return {
    id: createAssignmentId(fixture.id, taskType),
    fixtureId: fixture.id,
    taskType,
    signalFamily,
    priority,
    required,
    deadline,
    budgetTokens,
    budgetToolCalls,
    searchQueries: uniqueStrings([
      `${fixture.homeTeam} ${fixture.awayTeam} ${fixture.competition}`,
      taskType === "lineup_projection"
        ? `${fixture.homeTeam} ${fixture.awayTeam} lineups injuries`
        : "",
      taskType === "weather_check"
        ? `${fixture.homeTeam} ${fixture.awayTeam} weather`
        : "",
      taskType === "market_crosscheck"
        ? `${fixture.homeTeam} ${fixture.awayTeam} odds move`
        : "",
    ]),
    sourceHints: uniqueStrings([
      "canonical-fixture",
      taskType === "lineup_projection" ? "availability-snapshot" : "",
      taskType === "lineup_projection" ? "lineup-snapshot" : "",
      taskType === "weather_check" ? "weather-feed" : "",
      taskType === "market_crosscheck" ? "market-feed" : "",
    ]),
    requiredConfidence: required ? 0.62 : 0.5,
    freshnessSlaMinutes,
    reason,
  };
};

const discoverSourcesFromFixture = (
  fixture: FixtureLike,
  signals: ResolvedResearchSignals,
  generatedAt: string,
): SourceRecord[] => {
  const sources: SourceRecord[] = [
    createSourceRecord(fixture, "canonical-fixture", "fixture-context", generatedAt),
  ];

  if (signals.availability.available) {
    sources.push(
      createSourceRecord(
        fixture,
        signals.availability.sourceProvider,
        signals.availability.sourceReference,
        signals.availability.updatedAt,
        {
          homeUnavailableCount: String(signals.availability.homeUnavailableNames.length),
          awayUnavailableCount: String(signals.availability.awayUnavailableNames.length),
        },
      ),
    );
  }

  if (signals.lineups.available) {
    sources.push(
      createSourceRecord(
        fixture,
        "lineup-snapshot",
        "lineup-snapshot",
        signals.lineups.updatedAt,
        {
          official: String(signals.lineups.official),
          homeStatus: signals.lineups.home?.status ?? "",
          awayStatus: signals.lineups.away?.status ?? "",
        },
      ),
    );
  }

  if (signals.weather.available) {
    sources.push(
      createSourceRecord(
        fixture,
        "weather-feed",
        "pregame-weather",
        signals.weather.updatedAt,
      ),
    );
  }

  if (signals.market.available) {
    sources.push(
      createSourceRecord(
        fixture,
        "market-feed",
        "odds-snapshot",
        signals.market.updatedAt,
      ),
    );
  }

  return dedupeSources(sources);
};

const createSourceRecord = (
  fixture: FixtureLike,
  provider: string,
  reference: string,
  fetchedAt: string,
  metadata: Readonly<Record<string, string>> = {},
): SourceRecord => {
  const authority = SOURCE_AUTHORITY[provider] ?? {
    sourceType: "media" as const,
    tier: "C" as const,
    authority: 0.6,
    official: false,
  };

  return {
    id: createSourceId(fixture.id, provider, reference),
    fixtureId: fixture.id,
    provider,
    reference,
    sourceType: authority.sourceType,
    sourceTier: authority.tier,
    baseAuthorityScore: authority.authority,
    independenceKey: slugify(provider),
    admissible: authority.tier !== "D",
    official: authority.official,
    fetchedAt,
    metadata,
  };
};

const dedupeSources = (sources: readonly SourceRecord[]): SourceRecord[] => {
  const map = new Map<string, SourceRecord>();
  for (const source of sources) {
    map.set(source.id, source);
  }
  return [...map.values()];
};

const dedupeEvidence = (evidence: readonly EvidenceItem[]): EvidenceItem[] => {
  const map = new Map<string, EvidenceItem>();
  for (const item of evidence) {
    map.set(item.id, item);
  }
  return [...map.values()];
};

const createFormAndContextEvidence = (
  fixture: FixtureLike,
  signals: ResolvedResearchSignals,
  generatedAt: string,
): EvidenceItem[] => {
  const evidence: EvidenceItem[] = [];

  const homeForm = signals.form.home;
  const awayForm = signals.form.away;
  const formDiff = homeForm - awayForm;
  if (signals.form.available && Math.abs(formDiff) >= 0.05) {
    evidence.push({
      id: createEvidenceId(fixture.id, "form"),
      fixtureId: fixture.id,
      kind: "form",
      title: "Current form delta",
      summary: `${fixture.homeTeam} ${formDiff >= 0 ? "arrives stronger" : "trails"} on recent form window (${homeForm.toFixed(2)} vs ${awayForm.toFixed(2)}).`,
      direction: formDiff >= 0 ? "home" : "away",
      confidence: 0.68,
      impact: clamp(Math.abs(formDiff) * 1.35, 0.08, 0.28),
      source: { provider: "canonical-fixture", reference: "form-window" },
      tags: ["form", fixture.competition],
      extractedAt: signals.form.updatedAt,
      metadata: { homeForm: String(homeForm), awayForm: String(awayForm) },
    });
  }

  const restHomeDays = signals.schedule.restHomeDays;
  const restAwayDays = signals.schedule.restAwayDays;
  const restDiff = restHomeDays - restAwayDays;
  if (signals.schedule.available && Math.abs(restDiff) >= 1) {
    evidence.push({
      id: createEvidenceId(fixture.id, "schedule"),
      fixtureId: fixture.id,
      kind: "schedule",
      title: "Schedule and rest edge",
      summary: `${restDiff >= 0 ? fixture.homeTeam : fixture.awayTeam} has the fresher turnaround (${restHomeDays}d vs ${restAwayDays}d).`,
      direction: restDiff >= 0 ? "home" : "away",
      confidence: 0.62,
      impact: clamp(Math.abs(restDiff) * 0.05, 0.05, 0.2),
      source: {
        provider: "canonical-fixture",
        reference: "rest-window",
      },
      tags: ["rest", "schedule"],
      extractedAt: signals.schedule.updatedAt,
      metadata: {
        restHomeDays: String(restHomeDays),
        restAwayDays: String(restAwayDays),
      },
    });
  }

  const drawBias = signals.context.drawBias;
  if (signals.context.available && drawBias >= 0.08) {
    evidence.push({
      id: createEvidenceId(fixture.id, "draw-bias"),
      fixtureId: fixture.id,
      kind: "tactical",
      title: "Game-state compression",
      summary: "Context signals suggest a slow-tempo or low-separation matchup that can support draw outcomes.",
      direction: "draw",
      confidence: 0.58,
      impact: clamp(drawBias * 0.8, 0.05, 0.18),
      source: { provider: "canonical-fixture", reference: "context-draw-bias" },
      tags: ["draw", "tempo"],
      extractedAt: signals.context.updatedAt,
      metadata: { drawBias: String(drawBias) },
    });
  }

  if (signals.context.derby) {
    evidence.push({
      id: createEvidenceId(fixture.id, "derby"),
      fixtureId: fixture.id,
      kind: "motivation",
      title: "Derby volatility",
      summary: "Derby context raises variance and trims certainty in extreme outcomes.",
      direction: "draw",
      confidence: 0.55,
      impact: 0.08,
      source: { provider: "canonical-fixture", reference: "context-derby" },
      tags: ["derby", "motivation"],
      extractedAt: signals.context.updatedAt,
      metadata: { derby: "true" },
    });
  }

  return evidence;
};

const createAvailabilityEvidence = (
  fixture: FixtureLike,
  signals: ResolvedResearchSignals,
  generatedAt: string,
): EvidenceItem[] => {
  const injuriesHome = signals.availability.injuriesHome;
  const injuriesAway = signals.availability.injuriesAway;
  const lineupDirection =
    signals.lineups.home?.status === "confirmed" && signals.lineups.away?.status !== "confirmed"
      ? "home"
      : signals.lineups.away?.status === "confirmed" && signals.lineups.home?.status !== "confirmed"
        ? "away"
        : null;

  if (
    injuriesHome === 0 &&
    injuriesAway === 0 &&
    !signals.availability.official &&
    lineupDirection === null
  ) {
    return [];
  }

  const injuryDiff = injuriesAway - injuriesHome;
  const direction = injuryDiff !== 0 ? (injuryDiff >= 0 ? "home" : "away") : lineupDirection;
  if (direction === null) {
    return [];
  }

  const provider =
    lineupDirection !== null
      ? "lineup-snapshot"
      : signals.availability.sourceProvider;
  const extractedAt =
    lineupDirection !== null
      ? signals.lineups.updatedAt
      : signals.availability.updatedAt;
  const impact =
    injuryDiff !== 0
      ? clamp(Math.abs(injuryDiff) * 0.06, 0.05, 0.22)
      : 0.08;
  const title =
    lineupDirection !== null && injuryDiff === 0
      ? "Confirmed lineup edge"
      : signals.availability.official
        ? "Confirmed availability shift"
        : "Availability pressure";
  const summaryParts = [`${fixture.homeTeam} injuries ${injuriesHome}, ${fixture.awayTeam} injuries ${injuriesAway}.`];
  if (signals.lineups.available) {
    summaryParts.push(
      `Lineups ${fixture.homeTeam} ${signals.lineups.home?.status ?? "unknown"}${signals.lineups.home?.formation ? ` (${signals.lineups.home.formation})` : ""}, ` +
      `${fixture.awayTeam} ${signals.lineups.away?.status ?? "unknown"}${signals.lineups.away?.formation ? ` (${signals.lineups.away.formation})` : ""}.`,
    );
  }

  return [
    {
      id: createEvidenceId(fixture.id, "availability"),
      fixtureId: fixture.id,
      kind: "availability",
      title,
      summary: summaryParts.join(" "),
      direction,
      confidence: provider === "availability-snapshot" || provider === "lineup-snapshot" ? 0.82 : 0.7,
      impact,
      source: {
        provider,
        reference: provider === "lineup-snapshot" ? "lineup-snapshot" : signals.availability.sourceReference,
      },
      tags: [
        "availability",
        signals.availability.official || signals.lineups.official ? "official" : "baseline",
        ...(lineupDirection !== null ? ["lineups"] : []),
      ],
      extractedAt,
      metadata: {
        injuriesHome: String(injuriesHome),
        injuriesAway: String(injuriesAway),
        ...(signals.lineups.home?.status ? { lineupStatusHome: signals.lineups.home.status } : {}),
        ...(signals.lineups.away?.status ? { lineupStatusAway: signals.lineups.away.status } : {}),
      },
    },
  ];
};

const createWeatherEvidence = (
  fixture: FixtureLike,
  signals: ResolvedResearchSignals,
  generatedAt: string,
): EvidenceItem[] => {
  const weatherSeverity = signals.weather.severity;

  if (!signals.weather.available || weatherSeverity < 0.35) {
    return [];
  }

  const extractedAt = signals.weather.updatedAt;
  return [
    {
      id: createEvidenceId(fixture.id, "weather"),
      fixtureId: fixture.id,
      kind: "tactical",
      title: "Weather disruption risk",
      summary: `Weather risk index ${weatherSeverity.toFixed(2)} can compress the game state and increase late volatility.`,
      direction: "draw",
      confidence: 0.69,
      impact: clamp(weatherSeverity * 0.2, 0.05, 0.18),
      source: { provider: "weather-feed", reference: "pregame-weather" },
      tags: ["weather", "volatility"],
      extractedAt,
      metadata: {
        weatherSeverity: String(weatherSeverity),
      },
    },
  ];
};

const createMarketEvidence = (
  fixture: FixtureLike,
  signals: ResolvedResearchSignals,
  generatedAt: string,
): EvidenceItem[] => {
  const marketLean = signals.market.lean;
  const homeImplied = signals.market.oddsHomeImplied ?? Number.NaN;
  const drawImplied = signals.market.oddsDrawImplied ?? Number.NaN;
  const awayImplied = signals.market.oddsAwayImplied ?? Number.NaN;
  const marketMove = Math.abs(signals.market.move);

  let direction: EvidenceDirection | null = null;
  let separation = marketMove;
  if (marketLean === "home" || marketLean === "draw" || marketLean === "away") {
    direction = marketLean;
  } else {
    const candidates: Array<{
      readonly direction: Exclude<EvidenceDirection, "neutral">;
      readonly value: number;
    }> = [
      { direction: "home", value: homeImplied },
      { direction: "draw", value: drawImplied },
      { direction: "away", value: awayImplied },
    ].filter(
      (
        candidate,
      ): candidate is {
        readonly direction: Exclude<EvidenceDirection, "neutral">;
        readonly value: number;
      } => Number.isFinite(candidate.value),
    );
    const ordered = [...candidates].sort((left, right) => right.value - left.value);
    if (ordered.length >= 2) {
      direction = ordered[0]?.direction ?? null;
      separation = Math.max(separation, (ordered[0]?.value ?? 0) - (ordered[1]?.value ?? 0));
    }
  }

  if (direction === null || separation < 0.05) {
    return [];
  }

  const extractedAt = signals.market.updatedAt;
  return [
    {
      id: createEvidenceId(fixture.id, "market"),
      fixtureId: fixture.id,
      kind: "market",
      title: "Market consensus",
      summary: `Market context leans ${direction} with separation ${separation.toFixed(2)} in the latest implied snapshot.`,
      direction,
      confidence: 0.64,
      impact: clamp(separation * 0.85, 0.05, 0.18),
      source: { provider: "market-feed", reference: "odds-snapshot" },
      tags: ["market", "consensus"],
      extractedAt,
      metadata: {
        marketMove: String(marketMove),
      },
    },
  ];
};

const createInjectedSource = (
  fixture: FixtureLike,
  evidence: EvidenceItem,
): SourceRecord =>
  createSourceRecord(
    fixture,
    evidence.source.provider,
    evidence.source.reference,
    evidence.extractedAt,
    { injected: "true" },
  );

const runResearchAssignments = (
  fixture: FixtureLike,
  signals: ResolvedResearchSignals,
  plan: ResearchPlan,
  generatedAt: string,
  extraEvidence: readonly EvidenceItem[] = [],
): ResearchExecutionArtifacts => {
  const sourceRecords = new Map<string, SourceRecord>();
  const evidenceRecords = new Map<string, EvidenceItem>();
  const assignmentResults: ResearchAssignmentResult[] = [];

  const registerSources = (sources: readonly SourceRecord[]): string[] => {
    for (const source of sources) {
      sourceRecords.set(source.id, source);
    }
    return sources.map((source) => source.id);
  };

  const registerEvidence = (items: readonly EvidenceItem[]): string[] => {
    for (const item of items) {
      evidenceRecords.set(item.id, item);
      const source = createInjectedSource(fixture, item);
      sourceRecords.set(source.id, source);
    }
    return items.map((item) => item.id);
  };

  for (const assignment of plan.assignments) {
    if (assignment.taskType === "source_discovery") {
      const sources = discoverSourcesFromFixture(fixture, signals, generatedAt);
      assignmentResults.push({
        assignmentId: assignment.id,
        taskType: assignment.taskType,
        signalFamily: assignment.signalFamily,
        status: "completed",
        sourceIds: registerSources(sources),
        evidenceIds: [],
        claimIds: [],
        note: `Discovered ${sources.length} source records for baseline research.`,
      });
      continue;
    }

    if (assignment.taskType === "news_scan") {
      const items = createFormAndContextEvidence(fixture, signals, generatedAt);
      assignmentResults.push({
        assignmentId: assignment.id,
        taskType: assignment.taskType,
        signalFamily: assignment.signalFamily,
        status: items.length > 0 ? "completed" : "skipped",
        sourceIds: items.length > 0 ? registerSources(items.map((item) => createInjectedSource(fixture, item))) : [],
        evidenceIds: items.length > 0 ? registerEvidence(items) : [],
        claimIds: [],
        note:
          items.length > 0
            ? `Materialized ${items.length} form/context evidence items.`
            : "No news/context signals crossed the deterministic baseline.",
      });
      continue;
    }

    if (assignment.taskType === "lineup_projection") {
      const items = createAvailabilityEvidence(fixture, signals, generatedAt);
      assignmentResults.push({
        assignmentId: assignment.id,
        taskType: assignment.taskType,
        signalFamily: assignment.signalFamily,
        status: items.length > 0 ? "completed" : "skipped",
        sourceIds: items.length > 0 ? registerSources(items.map((item) => createInjectedSource(fixture, item))) : [],
        evidenceIds: items.length > 0 ? registerEvidence(items) : [],
        claimIds: [],
        note:
          items.length > 0
            ? "Availability assignment produced actionable evidence."
            : "Availability assignment found no deterministic deltas.",
      });
      continue;
    }

    if (assignment.taskType === "weather_check") {
      const items = createWeatherEvidence(fixture, signals, generatedAt);
      assignmentResults.push({
        assignmentId: assignment.id,
        taskType: assignment.taskType,
        signalFamily: assignment.signalFamily,
        status: items.length > 0 ? "completed" : "skipped",
        sourceIds: items.length > 0 ? registerSources(items.map((item) => createInjectedSource(fixture, item))) : [],
        evidenceIds: items.length > 0 ? registerEvidence(items) : [],
        claimIds: [],
        note:
          items.length > 0
            ? "Weather assignment raised pregame volatility context."
            : "Weather assignment found no elevated pregame risk.",
      });
      continue;
    }

    if (assignment.taskType === "market_crosscheck") {
      const items = createMarketEvidence(fixture, signals, generatedAt);
      assignmentResults.push({
        assignmentId: assignment.id,
        taskType: assignment.taskType,
        signalFamily: assignment.signalFamily,
        status: items.length > 0 ? "completed" : "skipped",
        sourceIds: items.length > 0 ? registerSources(items.map((item) => createInjectedSource(fixture, item))) : [],
        evidenceIds: items.length > 0 ? registerEvidence(items) : [],
        claimIds: [],
        note:
          items.length > 0
            ? "Market assignment added an implied consensus signal."
            : "Market assignment found no meaningful separation.",
      });
      continue;
    }

    if (assignment.taskType === "claim_normalization") {
      assignmentResults.push({
        assignmentId: assignment.id,
        taskType: assignment.taskType,
        signalFamily: assignment.signalFamily,
        status: "completed",
        sourceIds:
          extraEvidence.length > 0
            ? registerSources(extraEvidence.map((item) => createInjectedSource(fixture, item)))
            : [],
        evidenceIds: extraEvidence.length > 0 ? registerEvidence(extraEvidence) : [],
        claimIds: [],
        note:
          extraEvidence.length > 0
            ? `Injected ${extraEvidence.length} external evidence items into normalization.`
            : "Prepared deterministic evidence for claim normalization.",
      });
      continue;
    }

    assignmentResults.push({
      assignmentId: assignment.id,
      taskType: assignment.taskType,
      signalFamily: assignment.signalFamily,
      status: "completed",
      sourceIds: [],
      evidenceIds: [],
      claimIds: [],
      note:
        assignment.taskType === "reliability_scoring"
          ? "Reliability scoring reserved for consolidation."
          : assignment.taskType === "fixture_synthesis"
            ? "Bundle synthesis reserved for consolidation."
            : "Quality gate evaluation reserved for consolidation.",
    });
  }

  return {
    assignments: assignmentResults,
    sources: dedupeSources([...sourceRecords.values()]),
    evidence: dedupeEvidence([...evidenceRecords.values()]),
  };
};

const signalFamilyFromEvidence = (kind: EvidenceKind, evidence: EvidenceItem): ResearchSignalFamily => {
  if (kind === "form") {
    return "form";
  }
  if (kind === "schedule") {
    return evidence.tags.includes("weather") ? "weather" : "schedule";
  }
  if (kind === "availability") {
    return "availability";
  }
  if (kind === "market") {
    return "market";
  }
  if (kind === "motivation") {
    return "context";
  }
  if (kind === "tactical") {
    return evidence.tags.includes("weather") ? "weather" : "context";
  }
  return "context";
};

const createClaimSeed = (
  fixture: FixtureLike,
  evidence: EvidenceItem,
): ClaimSeed => {
  const signalFamily = signalFamilyFromEvidence(evidence.kind, evidence);
  if (evidence.kind === "availability") {
    return {
      claimType: "availability_shift",
      signalFamily,
      subjectEntity: evidence.direction === "away" ? fixture.awayTeam : fixture.homeTeam,
      predicate: "availability-edge",
      direction: evidence.direction,
      impactedMarkets: ["moneyline"],
      critical: evidence.impact >= 0.14,
      freshnessSlaMinutes: 120,
    };
  }

  if (evidence.kind === "market") {
    return {
      claimType: "market_move",
      signalFamily,
      subjectEntity: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      predicate: "market-lean",
      direction: evidence.direction,
      impactedMarkets: ["moneyline"],
      critical: evidence.impact >= 0.12,
      freshnessSlaMinutes: 90,
    };
  }

  if (evidence.kind === "tactical" && evidence.tags.includes("weather")) {
    return {
      claimType: "weather_risk",
      signalFamily,
      subjectEntity: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      predicate: "weather-volatility",
      direction: evidence.direction,
      impactedMarkets: ["moneyline", "totals"],
      critical: evidence.impact >= 0.12,
      freshnessSlaMinutes: 60,
    };
  }

  if (evidence.kind === "schedule") {
    return {
      claimType: "rest_edge",
      signalFamily,
      subjectEntity: evidence.direction === "away" ? fixture.awayTeam : fixture.homeTeam,
      predicate: "rest-edge",
      direction: evidence.direction,
      impactedMarkets: ["moneyline"],
      critical: false,
      freshnessSlaMinutes: 720,
    };
  }

  if (evidence.kind === "form") {
    return {
      claimType: "form_edge",
      signalFamily,
      subjectEntity: evidence.direction === "away" ? fixture.awayTeam : fixture.homeTeam,
      predicate: "form-edge",
      direction: evidence.direction,
      impactedMarkets: ["moneyline"],
      critical: false,
      freshnessSlaMinutes: 720,
    };
  }

  if (evidence.kind === "motivation") {
    return {
      claimType: "volatility_alert",
      signalFamily,
      subjectEntity: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      predicate: "volatility",
      direction: evidence.direction,
      impactedMarkets: ["moneyline"],
      critical: false,
      freshnessSlaMinutes: 360,
    };
  }

  return {
    claimType: evidence.kind === "model-hook" ? "external_signal" : "draw_signal",
    signalFamily,
    subjectEntity: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
    predicate: evidence.direction === "draw" ? "draw-pressure" : "match-context",
    direction: evidence.direction,
    impactedMarkets: ["moneyline"],
    critical: false,
    freshnessSlaMinutes: 360,
  };
};

const createClaimGroupKey = (fixture: FixtureLike, evidence: EvidenceItem): string => {
  const seed = createClaimSeed(fixture, evidence);
  return `${seed.claimType}:${seed.direction}:${slugify(seed.subjectEntity)}`;
};

const normalizeClaims = (
  fixture: FixtureLike,
  generatedAt: string,
  evidence: readonly EvidenceItem[],
  sources: readonly SourceRecord[],
): ResearchClaim[] => {
  const sourceByKey = new Map<string, SourceRecord>();
  for (const source of sources) {
    sourceByKey.set(`${source.provider}:${source.reference}`, source);
  }

  const grouped = new Map<string, EvidenceItem[]>();
  for (const item of evidence) {
    const groupKey = createClaimGroupKey(fixture, item);
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(groupKey, [item]);
    }
  }

  const claims: ResearchClaim[] = [];
  for (const [groupKey, items] of grouped.entries()) {
    const firstItem = items[0];
    if (!firstItem) {
      continue;
    }

    const seed = createClaimSeed(fixture, firstItem);
    const sourceIds = uniqueStrings(
      items
        .map((item) => sourceByKey.get(`${item.source.provider}:${item.source.reference}`)?.id ?? "")
        .filter((value) => value.length > 0),
    );
    const claimSources = sourceIds
      .map((sourceId) => sources.find((source) => source.id === sourceId))
      .filter((source): source is SourceRecord => source !== undefined);
    const officialSupport = claimSources.some((source) => source.official);
    const independentSources = uniqueStrings(claimSources.map((source) => source.independenceKey));
    const corroborationStatus: ResearchCorroborationStatus = officialSupport
      ? "official"
      : independentSources.length >= 2
        ? "corroborated"
        : sourceIds.length > 0
          ? "single-source"
          : "conflicted";
    const freshnessScores = items.map((item) =>
      clamp(
        1 - minutesBetween(item.extractedAt, generatedAt) / seed.freshnessSlaMinutes,
        0,
        1,
      ),
    );
    const freshnessScore = average(freshnessScores);
    const supportScores = items.map((item) => clamp((item.confidence * item.impact) / 0.22, 0, 1));
    const sourceScore = average(claimSources.map((source) => source.baseAuthorityScore));
    const corroborationScore =
      corroborationStatus === "official"
        ? 1
        : corroborationStatus === "corroborated"
          ? 0.85
          : corroborationStatus === "single-source"
            ? seed.critical
              ? 0.4
              : 0.65
            : 0.2;
    const reliabilityScore = round(
      0.35 * average(supportScores) +
        0.25 * corroborationScore +
        0.2 * freshnessScore +
        0.2 * sourceScore,
    );
    const estimatedEffectSize = average(items.map((item) => item.impact));
    const actionabilityScore = round(
      clamp(
        estimatedEffectSize *
          (seed.critical ? 3.2 : 2.4) *
          Math.max(reliabilityScore, 0.2),
        0,
        1,
      ),
    );
    const baseStatus: ResearchClaimStatus =
      freshnessScore < 0.2
        ? "suppressed"
        : seed.critical && corroborationStatus === "single-source"
          ? "uncertain"
          : reliabilityScore >= 0.55
            ? "accepted"
            : reliabilityScore >= 0.35
              ? "uncertain"
              : "suppressed";

    claims.push({
      id: `${fixture.id}:claim:${slugify(groupKey)}`,
      fixtureId: fixture.id,
      claimType: seed.claimType,
      signalFamily: seed.signalFamily,
      subjectEntity: seed.subjectEntity,
      predicate: seed.predicate,
      objectValue: items.map((item) => item.summary).join(" "),
      status: baseStatus,
      direction: seed.direction,
      critical: seed.critical,
      effectiveTime: firstItem.extractedAt,
      extractedFromEvidenceIds: items.map((item) => item.id),
      sourceIds,
      contradictionClaimIds: [],
      impactedMarkets: seed.impactedMarkets,
      estimatedEffectSize,
      freshnessSlaMinutes: seed.freshnessSlaMinutes,
      freshnessScore,
      corroborationStatus,
      reliabilityScore,
      actionabilityScore,
      summary: firstItem.summary,
      metadata: {
        evidenceCount: String(items.length),
        sourceCount: String(sourceIds.length),
      },
    });
  }

  return claims;
};

const detectConflicts = (
  fixtureId: string,
  claims: readonly ResearchClaim[],
): ResearchConflictRecord[] => {
  const conflicts: ResearchConflictRecord[] = [];
  const byFamily = new Map<ResearchSignalFamily, ResearchClaim[]>();

  for (const claim of claims) {
    if (claim.direction === "neutral") {
      continue;
    }
    const familyClaims = byFamily.get(claim.signalFamily);
    if (familyClaims) {
      familyClaims.push(claim);
    } else {
      byFamily.set(claim.signalFamily, [claim]);
    }
  }

  for (const [signalFamily, familyClaims] of byFamily.entries()) {
    for (let index = 0; index < familyClaims.length; index += 1) {
      const left = familyClaims[index];
      if (!left) {
        continue;
      }

      for (let next = index + 1; next < familyClaims.length; next += 1) {
        const right = familyClaims[next];
        if (!right || left.direction === right.direction) {
          continue;
        }

        const peakActionability = Math.max(
          left.actionabilityScore,
          right.actionabilityScore,
        );
        if (peakActionability < 0.18) {
          continue;
        }

        const severity: ResearchConflictSeverity =
          left.critical || right.critical || peakActionability >= 0.4
            ? "high"
            : peakActionability >= 0.28
              ? "medium"
              : "low";
        const officialSupport =
          left.corroborationStatus === "official" ||
          right.corroborationStatus === "official";

        conflicts.push({
          id: createConflictId(
            fixtureId,
            slugify(`${signalFamily}-${left.id}-${right.id}`),
          ),
          fixtureId,
          claimIds: [left.id, right.id],
          severity,
          reason: `${signalFamily} claims disagree on direction (${left.direction} vs ${right.direction}).`,
          resolution: officialSupport ? "resolved-official" : "open",
          metadata: {
            signalFamily,
          },
        });
      }
    }
  }

  return conflicts;
};

const applyConflictStatus = (
  claims: readonly ResearchClaim[],
  conflicts: readonly ResearchConflictRecord[],
): ResearchClaim[] => {
  const conflictsByClaim = new Map<string, ResearchConflictRecord[]>();
  for (const conflict of conflicts) {
    for (const claimId of conflict.claimIds) {
      const current = conflictsByClaim.get(claimId);
      if (current) {
        current.push(conflict);
      } else {
        conflictsByClaim.set(claimId, [conflict]);
      }
    }
  }

  return claims.map((claim) => {
    const claimConflicts = conflictsByClaim.get(claim.id) ?? [];
    const contradictionClaimIds = uniqueStrings(
      claimConflicts.flatMap((conflict) => conflict.claimIds.filter((claimId) => claimId !== claim.id)),
    );
    const hasOpenHighConflict = claimConflicts.some(
      (conflict) =>
        conflict.severity === "high" && conflict.resolution === "open",
    );

    let status = claim.status;
    if (hasOpenHighConflict && claim.corroborationStatus !== "official") {
      status = claim.critical ? "suppressed" : "uncertain";
    }

    return {
      ...claim,
      status,
      corroborationStatus:
        hasOpenHighConflict && claim.corroborationStatus !== "official"
          ? "conflicted"
          : claim.corroborationStatus,
      contradictionClaimIds,
    };
  });
};

const scoreEvidence = (
  evidence: readonly EvidenceItem[],
  claims: readonly ResearchClaim[] = [],
): DirectionalResearchScore => {
  const score = { home: 0, away: 0, draw: 0 };
  const claimByEvidenceId = new Map<string, ResearchClaim>();
  for (const claim of claims) {
    for (const evidenceId of claim.extractedFromEvidenceIds) {
      claimByEvidenceId.set(evidenceId, claim);
    }
  }

  for (const item of evidence) {
    const claim = claimByEvidenceId.get(item.id);
    const statusWeight = claim ? CLAIM_STATUS_WEIGHT[claim.status] : 1;
    const reliabilityWeight = claim ? clamp(0.45 + claim.reliabilityScore * 0.55, 0.25, 1) : 1;
    const weighted = item.impact * item.confidence * statusWeight * reliabilityWeight;
    if (item.direction === "home") {
      score.home += weighted;
    } else if (item.direction === "away") {
      score.away += weighted;
    } else if (item.direction === "draw") {
      score.draw += weighted;
    }
  }

  return {
    home: round(score.home),
    away: round(score.away),
    draw: round(score.draw),
  };
};

export const pickTopEvidence = (
  evidence: readonly EvidenceItem[],
  limit = 3,
): EvidenceItem[] =>
  [...evidence]
    .sort(
      (left, right) => right.impact * right.confidence - left.impact * left.confidence,
    )
    .slice(0, limit);

export const determineRecommendedLean = (
  directionalScore: DirectionalResearchScore,
): ResearchDossier["recommendedLean"] => {
  if (
    directionalScore.home >= directionalScore.away &&
    directionalScore.home >= directionalScore.draw
  ) {
    return "home";
  }

  if (
    directionalScore.away >= directionalScore.home &&
    directionalScore.away >= directionalScore.draw
  ) {
    return "away";
  }

  return "draw";
};

const buildCoverageSummary = (
  plan: ResearchPlan,
  evidence: readonly EvidenceItem[],
): ResearchCoverageSummary => {
  const covered = new Set<ResearchSignalFamily>();
  for (const item of evidence) {
    covered.add(signalFamilyFromEvidence(item.kind, item));
  }

  const coveredFamilies = plan.requiredFamilies.filter((family) => covered.has(family));
  const missingFamilies = plan.requiredFamilies.filter((family) => !covered.has(family));

  return {
    requiredFamilies: [...plan.requiredFamilies],
    coveredFamilies,
    missingFamilies,
    score:
      plan.requiredFamilies.length === 0
        ? 1
        : round(coveredFamilies.length / plan.requiredFamilies.length),
  };
};

const scoreContradictions = (
  claims: readonly ResearchClaim[],
  conflicts: readonly ResearchConflictRecord[],
): number => {
  if (claims.length === 0) {
    return 1;
  }

  const penalty = conflicts.reduce((sum, conflict) => {
    const severityPenalty =
      conflict.severity === "high"
        ? 0.9
        : conflict.severity === "medium"
          ? 0.55
          : 0.25;
    return sum + severityPenalty * SOURCE_CONFLICT_RESOLUTION_WEIGHT[conflict.resolution];
  }, 0);

  return round(clamp(1 - penalty / claims.length, 0, 1));
};

const createGates = (
  fixture: FixtureLike,
  coverage: ResearchCoverageSummary,
  sources: readonly SourceRecord[],
  claims: readonly ResearchClaim[],
  conflicts: readonly ResearchConflictRecord[],
  recommendedFeatureUpdates: readonly ResearchFeatureUpdate[],
): ResearchGateResult[] => {
  const gates: ResearchGateResult[] = [];

  const canonicalReasons: string[] = [];
  if (fixture.id.trim().length === 0) {
    canonicalReasons.push("fixture id is missing");
  }
  if (fixture.homeTeam.trim().length === 0 || fixture.awayTeam.trim().length === 0) {
    canonicalReasons.push("fixture teams are incomplete");
  }
  if (!Number.isFinite(Date.parse(fixture.scheduledAt))) {
    canonicalReasons.push("fixture kickoff is invalid");
  }
  if (fixture.status !== "scheduled") {
    canonicalReasons.push(`fixture status is ${fixture.status}`);
  }
  gates.push({
    gate: "canonical-fixture",
    status: canonicalReasons.length === 0 ? "passed" : fixture.status === "scheduled" ? "failed" : "warn",
    reasons: canonicalReasons,
    affectedClaimIds: [],
  });

  const inadmissibleClaims = claims.filter((claim) =>
    claim.sourceIds.some((sourceId) => {
      const source = sources.find((candidate) => candidate.id === sourceId);
      return source !== undefined && !source.admissible;
    }),
  );
  const tierCOnlyClaims = claims.filter((claim) => {
    const claimSources = claim.sourceIds
      .map((sourceId) => sources.find((candidate) => candidate.id === sourceId))
      .filter((source): source is SourceRecord => source !== undefined);
    return (
      claimSources.length > 0 &&
      claimSources.every((source) => source.sourceTier === "C")
    );
  });
  gates.push({
    gate: "source-admissibility",
    status:
      inadmissibleClaims.length > 0
        ? "failed"
        : tierCOnlyClaims.some((claim) => claim.critical)
          ? "warn"
          : "passed",
    reasons:
      inadmissibleClaims.length > 0
        ? ["Some claims are backed by inadmissible sources."]
        : tierCOnlyClaims.some((claim) => claim.critical)
          ? ["Critical claims are backed only by low-authority sources."]
          : [],
    affectedClaimIds: [
      ...inadmissibleClaims.map((claim) => claim.id),
      ...tierCOnlyClaims.filter((claim) => claim.critical).map((claim) => claim.id),
    ],
  });

  const staleCriticalClaims = claims.filter(
    (claim) => claim.critical && claim.freshnessScore < 0.25,
  );
  const staleClaims = claims.filter((claim) => claim.freshnessScore < 0.45);
  gates.push({
    gate: "freshness",
    status:
      staleCriticalClaims.length > 0
        ? "failed"
        : staleClaims.length > 0
          ? "warn"
          : "passed",
    reasons:
      staleCriticalClaims.length > 0
        ? ["Critical claims are stale for their freshness SLA."]
        : staleClaims.length > 0
          ? ["Some claims are aging out of their preferred freshness window."]
          : [],
    affectedClaimIds: [
      ...staleCriticalClaims.map((claim) => claim.id),
      ...staleClaims.map((claim) => claim.id),
    ],
  });

  const uncorroboratedCriticalClaims = claims.filter(
    (claim) =>
      claim.critical &&
      claim.corroborationStatus !== "official" &&
      claim.corroborationStatus !== "corroborated",
  );
  const uncorroboratedAcceptedClaims = claims.filter(
    (claim) =>
      !claim.critical &&
      claim.status === "accepted" &&
      claim.corroborationStatus === "single-source",
  );
  gates.push({
    gate: "corroboration",
    status:
      uncorroboratedCriticalClaims.length > 0
        ? "failed"
        : uncorroboratedAcceptedClaims.length > 0
          ? "warn"
          : "passed",
    reasons:
      uncorroboratedCriticalClaims.length > 0
        ? ["Critical non-official claims need corroboration before the bundle is promotable."]
        : uncorroboratedAcceptedClaims.length > 0
          ? ["Accepted non-critical claims still rely on single-source support."]
          : [],
    affectedClaimIds: [
      ...uncorroboratedCriticalClaims.map((claim) => claim.id),
      ...uncorroboratedAcceptedClaims.map((claim) => claim.id),
    ],
  });

  const openHighConflicts = conflicts.filter(
    (conflict) =>
      conflict.severity === "high" && conflict.resolution === "open",
  );
  const openConflicts = conflicts.filter((conflict) => conflict.resolution === "open");
  gates.push({
    gate: "contradictions",
    status:
      openHighConflicts.length > 0
        ? "failed"
        : openConflicts.length > 0
          ? "warn"
          : "passed",
    reasons:
      openHighConflicts.length > 0
        ? ["High-severity directional contradictions remain unresolved."]
        : openConflicts.length > 0
          ? ["Open contradictions reduce bundle confidence."]
          : [],
    affectedClaimIds: uniqueStrings(
      openConflicts.flatMap((conflict) => [...conflict.claimIds]),
    ),
  });

  gates.push({
    gate: "actionability",
    status:
      recommendedFeatureUpdates.length === 0
        ? claims.length === 0 || coverage.score < 0.5
          ? "failed"
          : "warn"
        : "passed",
    reasons:
      recommendedFeatureUpdates.length === 0
        ? claims.length === 0
          ? ["No actionable claims were produced."]
          : ["No claim cleared the actionability threshold for features."]
        : [],
    affectedClaimIds: claims
      .filter((claim) => claim.actionabilityScore >= 0.08)
      .map((claim) => claim.id),
  });

  const incompleteClaims = claims.filter(
    (claim) =>
      claim.extractedFromEvidenceIds.length === 0 || claim.sourceIds.length === 0,
  );
  const incompleteSources = sources.filter(
    (source) => source.fetchedAt.trim().length === 0,
  );
  gates.push({
    gate: "audit-completeness",
    status:
      incompleteClaims.length > 0 || incompleteSources.length > 0
        ? "failed"
        : "passed",
    reasons:
      incompleteClaims.length > 0 || incompleteSources.length > 0
        ? ["Claims or sources are missing provenance metadata."]
        : [],
    affectedClaimIds: incompleteClaims.map((claim) => claim.id),
  });

  return gates;
};

const defaultSummary = (
  fixture: FixtureLike,
  publicationStatus: ResearchPublicationStatus,
  score: DirectionalResearchScore,
  topClaims: readonly ResearchClaim[],
): string => {
  const lean = determineRecommendedLean(score);
  const topClaimSummary = topClaims
    .slice(0, 2)
    .map((claim) => claim.summary)
    .join(" ");

  return `${fixture.homeTeam} vs ${fixture.awayTeam}: bundle ${publicationStatus}, lean ${lean} with research score H ${score.home.toFixed(2)} / D ${score.draw.toFixed(2)} / A ${score.away.toFixed(2)}. Top claims: ${topClaimSummary || "none"}.`;
};

const defaultRisks = (
  publicationStatus: ResearchPublicationStatus,
  score: DirectionalResearchScore,
  gates: readonly ResearchGateResult[],
  conflicts: readonly ResearchConflictRecord[],
): string[] => {
  const risks = [
    ...gates
      .filter((gate) => gate.status !== "passed")
      .flatMap((gate) => gate.reasons),
    Math.abs(score.home - score.away) <= 0.08
      ? "Small separation between home and away research scores."
      : "",
    conflicts.some((conflict) => conflict.resolution === "open")
      ? "Open contradictions still require manual review."
      : "",
    publicationStatus !== "publishable"
      ? `Bundle status ${publicationStatus} requires review before promotion.`
      : "",
  ].filter((risk) => risk.length > 0);

  return risks.length > 0
    ? risks
    : ["No major structural risks flagged by the deterministic bundle."];
};

const createRecommendedFeatureUpdates = (
  claims: readonly ResearchClaim[],
): ResearchFeatureUpdate[] =>
  claims
    .filter(
      (claim) =>
        claim.status === "accepted" &&
        claim.direction !== "neutral" &&
        claim.actionabilityScore >= 0.14,
    )
    .sort((left, right) => right.actionabilityScore - left.actionabilityScore)
    .slice(0, 4)
    .map((claim) => ({
      key: `${claim.signalFamily}:${claim.direction}`,
      direction: claim.direction,
      score: claim.actionabilityScore,
      reason: claim.summary,
      claimIds: [claim.id],
    }));

const createCriticalAlerts = (
  gates: readonly ResearchGateResult[],
  claims: readonly ResearchClaim[],
  conflicts: readonly ResearchConflictRecord[],
): string[] =>
  uniqueStrings([
    ...gates
      .filter((gate) => gate.status === "failed")
      .map((gate) => `${gate.gate} failed`),
    ...claims
      .filter((claim) => claim.critical && claim.status !== "accepted")
      .map((claim) => `${claim.claimType} remains ${claim.status}`),
    ...conflicts
      .filter((conflict) => conflict.severity === "high" && conflict.resolution === "open")
      .map((conflict) => conflict.reason),
  ]);

const applyClaimIdsToAssignments = (
  assignments: readonly ResearchAssignmentResult[],
  claims: readonly ResearchClaim[],
): ResearchAssignmentResult[] => {
  const claimIds = claims.map((claim) => claim.id);
  return assignments.map((assignment) =>
    assignment.taskType === "claim_normalization"
      ? {
          ...assignment,
          claimIds,
          note: `Normalized ${claimIds.length} claims from ${assignment.evidenceIds.length} evidence items.`,
        }
      : assignment,
  );
};

const determinePublicationStatus = (
  evidence: readonly EvidenceItem[],
  gates: readonly ResearchGateResult[],
  bundleReliabilityScore: number,
): ResearchPublicationStatus => {
  const failedGates = gates.filter((gate) => gate.status === "failed");
  const warnedGates = gates.filter((gate) => gate.status === "warn");

  if (evidence.length === 0) {
    return "hold";
  }

  if (
    failedGates.some((gate) =>
      gate.gate === "canonical-fixture" ||
      gate.gate === "source-admissibility" ||
      gate.gate === "corroboration" ||
      gate.gate === "contradictions" ||
      gate.gate === "audit-completeness",
    )
  ) {
    return "hold";
  }

  if (failedGates.length > 0 || warnedGates.length > 0 || bundleReliabilityScore < 0.7) {
    return "degraded";
  }

  return "publishable";
};

export const buildResearchBrief = (
  fixture: FixtureLike,
  options: Pick<ResearchEngineOptions, "now" | "signals"> = {},
): ResearchBrief => {
  const now = options.now ?? nowIso;
  const generatedAt = now();
  const signals = resolveResearchSignals(fixture, options.signals, generatedAt);
  return {
    fixtureId: fixture.id,
    generatedAt,
    headline: `Research brief ${fixture.homeTeam} vs ${fixture.awayTeam}`,
    context: [
      `${fixture.competition} | ${fixture.homeTeam} vs ${fixture.awayTeam}`,
      signals.context.derby ? "derby context" : "regular context",
      `status ${fixture.status}`,
    ].join(" | "),
    questions: baseQuestions(fixture),
    assumptions: [
      "Deterministic-first bundle generation enabled.",
      "Structured research signals are preferred over fixture metadata fallbacks.",
      "AI can only rewrite summary and risks after bundle consolidation.",
    ],
  };
};

export const buildResearchPlan = (
  fixture: FixtureLike,
  options: Pick<ResearchEngineOptions, "now" | "signals"> = {},
): ResearchPlan => {
  const now = options.now ?? nowIso;
  const generatedAt = now();
  const signals = resolveResearchSignals(fixture, options.signals, generatedAt);
  const coverage = estimateCoverageMap(signals);
  const kickoffPhase = resolveKickoffPhase(fixture, generatedAt);
  const requiredFamilies = resolveRequiredFamilies(kickoffPhase, coverage);
  const coverageScore = scoreCoverage(coverage, requiredFamilies);
  const assignments: ResearchAssignment[] = [
    createAssignment(
      fixture,
      generatedAt,
      "source_discovery",
      "discovery",
      100,
      true,
      120,
      "Bootstrap admissible sources and baseline provenance.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "news_scan",
      "context",
      kickoffPhase === "precheck" ? 92 : 84,
      true,
      360,
      "Collect baseline form, rest, and context signals.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "lineup_projection",
      "availability",
      kickoffPhase === "final-hour" ? 98 : 90,
      requiredFamilies.includes("availability"),
      kickoffPhase === "final-hour" ? 60 : 180,
      "Refresh injuries, lineup status, and late availability shifts.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "weather_check",
      "weather",
      kickoffPhase === "final-hour" ? 95 : 82,
      requiredFamilies.includes("weather"),
      kickoffPhase === "final-hour" ? 45 : 120,
      "Validate near-kickoff weather volatility.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "market_crosscheck",
      "market",
      kickoffPhase === "final-hour" ? 93 : 80,
      requiredFamilies.includes("market"),
      kickoffPhase === "final-hour" ? 45 : 120,
      "Cross-check baseline research against late market movement.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "claim_normalization",
      "governance",
      75,
      true,
      240,
      "Normalize evidence into claim-first records.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "reliability_scoring",
      "governance",
      70,
      true,
      240,
      "Score corroboration, freshness, and source support.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "fixture_synthesis",
      "synthesis",
      65,
      true,
      240,
      "Consolidate accepted claims into a bundle-level readout.",
    ),
    createAssignment(
      fixture,
      generatedAt,
      "quality_gate",
      "governance",
      60,
      true,
      240,
      "Run quality gates before deriving feature snapshots.",
    ),
  ];

  const alerts = uniqueStrings([
    coverageScore < 0.5 ? "Coverage below 0.50; planner should expand discovery." : "",
    kickoffPhase === "final-hour" && !coverage.availability
      ? "Availability coverage missing inside the final hour."
      : "",
    kickoffPhase !== "precheck" && !coverage.weather
      ? "Weather coverage missing close to kickoff."
      : "",
  ]);

  return {
    fixtureId: fixture.id,
    generatedAt,
    kickoffPhase,
    coverageScore,
    focus: buildPlanFocus(kickoffPhase, coverage, signals),
    assignments,
    requiredFamilies,
    coverage,
    alerts,
  };
};

export const createBaselineEvidence = (
  fixture: FixtureLike,
  options: ResearchEngineOptions = {},
): EvidenceItem[] => {
  const now = options.now ?? nowIso;
  const generatedAt = now();
  const signals = resolveResearchSignals(fixture, options.signals, generatedAt);
  const plan = buildResearchPlan(fixture, {
    now: () => generatedAt,
    ...(options.signals ? { signals: options.signals } : {}),
  });
  const execution = runResearchAssignments(fixture, signals, plan, generatedAt);
  return [...execution.evidence];
};

export const buildResearchBundle = (
  fixture: FixtureLike,
  options: BuildResearchBundleOptions = {},
): ResearchBundle => {
  const now = options.now ?? nowIso;
  const generatedAt = now();
  const signals = resolveResearchSignals(fixture, options.signals, generatedAt);
  const brief = buildResearchBrief(fixture, {
    now: () => generatedAt,
    ...(options.signals ? { signals: options.signals } : {}),
  });
  const plan = buildResearchPlan(fixture, {
    now: () => generatedAt,
    ...(options.signals ? { signals: options.signals } : {}),
  });
  const execution = runResearchAssignments(
    fixture,
    signals,
    plan,
    generatedAt,
    options.evidence ?? [],
  );
  const normalizedClaims = normalizeClaims(
    fixture,
    generatedAt,
    execution.evidence,
    execution.sources,
  );
  const conflicts = detectConflicts(fixture.id, normalizedClaims);
  const claims = applyConflictStatus(normalizedClaims, conflicts);
  const directionalScore = scoreEvidence(execution.evidence, claims);
  const recommendedLean = determineRecommendedLean(directionalScore);
  const coverage = buildCoverageSummary(plan, execution.evidence);
  const recommendedFeatureUpdates = createRecommendedFeatureUpdates(claims);
  const freshnessScore = average(claims.map((claim) => claim.freshnessScore));
  const contradictionScore = scoreContradictions(claims, conflicts);
  const avgTopClaimScore = average(
    [...claims]
      .sort((left, right) => right.actionabilityScore - left.actionabilityScore)
      .slice(0, 3)
      .map((claim) => claim.reliabilityScore),
  );
  const criticalClaims = claims.filter((claim) => claim.critical);
  const criticalResolvedScore =
    criticalClaims.length === 0
      ? 1
      : round(
          criticalClaims.filter(
            (claim) =>
              claim.status === "accepted" &&
              (claim.corroborationStatus === "official" ||
                claim.corroborationStatus === "corroborated"),
          ).length / criticalClaims.length,
        );
  const sourceDiversityScore = round(
    clamp(
      uniqueStrings(execution.sources.map((source) => source.independenceKey)).length / 4,
      0,
      1,
    ),
  );
  const bundleReliabilityScore = round(
    0.25 * coverage.score +
      0.25 * avgTopClaimScore +
      0.2 * criticalResolvedScore +
      0.15 * freshnessScore +
      0.1 * sourceDiversityScore +
      0.05 * contradictionScore,
  );
  const gates = createGates(
    fixture,
    coverage,
    execution.sources,
    claims,
    conflicts,
    recommendedFeatureUpdates,
  );
  const publicationStatus = determinePublicationStatus(
    execution.evidence,
    gates,
    bundleReliabilityScore,
  );
  const topClaims = [...claims]
    .filter((claim) => claim.status !== "suppressed")
    .sort((left, right) => right.actionabilityScore - left.actionabilityScore)
    .slice(0, 4);
  const suppressedClaims = claims.filter((claim) => claim.status === "suppressed");
  const criticalAlerts = createCriticalAlerts(gates, claims, conflicts);

  const synthesized = options.synthesisHook?.synthesize({
    brief,
    evidence: execution.evidence,
    directionalScore,
  });
  const summary = synthesized?.summary ?? defaultSummary(fixture, publicationStatus, directionalScore, topClaims);
  const risks = [
    ...(synthesized?.risks ?? defaultRisks(publicationStatus, directionalScore, gates, conflicts)),
  ];

  return {
    id: createBundleId(fixture.id, generatedAt),
    fixtureId: fixture.id,
    generatedAt,
    brief,
    plan,
    assignments: applyClaimIdsToAssignments(execution.assignments, claims),
    coverage,
    sources: execution.sources,
    evidence: execution.evidence,
    claims,
    conflicts,
    gates,
    directionalScore,
    recommendedLean,
    summary,
    risks,
    topClaims,
    suppressedClaims,
    criticalAlerts,
    evidenceIndex: execution.evidence,
    recommendedFeatureUpdates,
    publicationStatus,
    coverageScore: coverage.score,
    freshnessScore,
    contradictionScore,
    bundleReliabilityScore,
  };
};

export const applyResearchSynthesis = (
  bundle: ResearchBundle,
  output: ResearchSynthesisHookOutput,
): ResearchBundle => ({
  ...bundle,
  summary: output.summary,
  risks:
    output.risks && output.risks.length > 0 ? [...output.risks] : [...bundle.risks],
});

export const buildResearchDossierFromBundle = (
  bundle: ResearchBundle,
): ResearchDossier => ({
  fixtureId: bundle.fixtureId,
  generatedAt: bundle.generatedAt,
  brief: bundle.brief,
  evidence: bundle.evidence,
  directionalScore: bundle.directionalScore,
  summary: bundle.summary,
  recommendedLean: bundle.recommendedLean,
  risks: bundle.risks,
});

export const buildResearchDossier = (
  fixture: FixtureLike,
  options: BuildResearchDossierOptions = {},
): ResearchDossier =>
  buildResearchDossierFromBundle(buildResearchBundle(fixture, options));

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
