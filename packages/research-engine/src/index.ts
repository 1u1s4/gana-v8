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

export interface FixtureLike {
  readonly id: string;
  readonly competition: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly scheduledAt: string;
  readonly status: "scheduled" | "live" | "completed" | "cancelled";
  readonly metadata: Record<string, string>;
}

export type ResearchQuestion = string;
export type EvidenceDirection = "home" | "away" | "draw" | "neutral";
export type EvidenceKind =
  | "form"
  | "schedule"
  | "availability"
  | "motivation"
  | "market"
  | "tactical"
  | "model-hook";

export interface ResearchBrief {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly headline: string;
  readonly context: string;
  readonly questions: readonly ResearchQuestion[];
  readonly assumptions: readonly string[];
}

export interface EvidenceItem {
  readonly id: string;
  readonly fixtureId: string;
  readonly kind: EvidenceKind;
  readonly title: string;
  readonly summary: string;
  readonly direction: EvidenceDirection;
  readonly confidence: number;
  readonly impact: number;
  readonly source: {
    readonly provider: string;
    readonly reference: string;
  };
  readonly tags: readonly string[];
  readonly extractedAt: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface DirectionalResearchScore {
  readonly home: number;
  readonly away: number;
  readonly draw: number;
}

export interface ResearchDossier {
  readonly fixtureId: string;
  readonly generatedAt: string;
  readonly brief: ResearchBrief;
  readonly evidence: readonly EvidenceItem[];
  readonly directionalScore: DirectionalResearchScore;
  readonly summary: string;
  readonly recommendedLean: Exclude<EvidenceDirection, "neutral">;
  readonly risks: readonly string[];
}

export interface ResearchSynthesisHookInput {
  readonly brief: ResearchBrief;
  readonly evidence: readonly EvidenceItem[];
  readonly directionalScore: DirectionalResearchScore;
}

export interface ResearchSynthesisHookOutput {
  readonly summary: string;
  readonly risks?: readonly string[];
}

export interface ResearchSynthesisHook {
  synthesize(input: ResearchSynthesisHookInput): ResearchSynthesisHookOutput;
}

export interface ResearchEngineOptions {
  readonly now?: () => string;
  readonly synthesisHook?: ResearchSynthesisHook;
}

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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const createEvidenceId = (fixtureId: string, suffix: string): string =>
  `${fixtureId}:${suffix}`;

const scoreBucket = (value: number): number => Number(value.toFixed(4));

const baseQuestions = (fixture: FixtureLike): string[] => [
  `¿Llega ${fixture.homeTeam} con ventaja real de forma o contexto?`,
  `¿Existe alguna señal de calendario o bajas que empuje a ${fixture.awayTeam}?`,
  `¿El partido ${fixture.homeTeam} vs ${fixture.awayTeam} tiene argumentos para un empate por equilibrio?`,
];

export const buildResearchBrief = (
  fixture: FixtureLike,
  options: Pick<ResearchEngineOptions, "now"> = {},
): ResearchBrief => {
  const now = options.now ?? nowIso;
  const derby = fixture.metadata.derby === "true";
  return {
    fixtureId: fixture.id,
    generatedAt: now(),
    headline: `Research brief ${fixture.homeTeam} vs ${fixture.awayTeam}`,
    context: [
      `${fixture.competition} · ${fixture.homeTeam} vs ${fixture.awayTeam}`,
      derby ? "contexto derby" : "contexto regular",
      `status ${fixture.status}`,
    ].join(" | "),
    questions: baseQuestions(fixture),
    assumptions: [
      "Deterministic-first synthesis enabled.",
      "Fixture metadata may come from ETL-enriched feeds.",
      "LLM synthesis can be plugged in later via hooks.",
    ],
  };
};

export const createBaselineEvidence = (
  fixture: FixtureLike,
  options: ResearchEngineOptions = {},
): EvidenceItem[] => {
  const now = options.now ?? nowIso;
  const extractedAt = now();
  const metadata = fixture.metadata;
  const evidence: EvidenceItem[] = [];

  const homeForm = metadataNumber(metadata, "formHome", 0.5);
  const awayForm = metadataNumber(metadata, "formAway", 0.5);
  const formDiff = homeForm - awayForm;
  if (Math.abs(formDiff) >= 0.05) {
    const direction: EvidenceDirection = formDiff >= 0 ? "home" : "away";
    evidence.push({
      id: createEvidenceId(fixture.id, "form"),
      fixtureId: fixture.id,
      kind: "form",
      title: "Current form delta",
      summary: `${fixture.homeTeam} ${formDiff >= 0 ? "arrives stronger" : "trails"} on recent form window (${homeForm.toFixed(2)} vs ${awayForm.toFixed(2)}).`,
      direction,
      confidence: 0.68,
      impact: clamp(Math.abs(formDiff) * 1.35, 0.08, 0.28),
      source: { provider: "fixture-metadata", reference: "formHome/formAway" },
      tags: ["form", fixture.competition],
      extractedAt,
      metadata: { homeForm: String(homeForm), awayForm: String(awayForm) },
    });
  }

  const restHomeDays = metadataNumber(metadata, "restHomeDays", 3);
  const restAwayDays = metadataNumber(metadata, "restAwayDays", 3);
  const restDiff = restHomeDays - restAwayDays;
  if (Math.abs(restDiff) >= 1) {
    const direction: EvidenceDirection = restDiff >= 0 ? "home" : "away";
    evidence.push({
      id: createEvidenceId(fixture.id, "schedule"),
      fixtureId: fixture.id,
      kind: "schedule",
      title: "Schedule and rest edge",
      summary: `${direction === "home" ? fixture.homeTeam : fixture.awayTeam} has the fresher turnaround (${restHomeDays}d vs ${restAwayDays}d).`,
      direction,
      confidence: 0.62,
      impact: clamp(Math.abs(restDiff) * 0.05, 0.05, 0.2),
      source: { provider: "fixture-metadata", reference: "restHomeDays/restAwayDays" },
      tags: ["rest", "schedule"],
      extractedAt,
      metadata: { restHomeDays: String(restHomeDays), restAwayDays: String(restAwayDays) },
    });
  }

  const injuriesHome = metadataNumber(metadata, "injuriesHome", 0);
  const injuriesAway = metadataNumber(metadata, "injuriesAway", 0);
  const injuryDiff = injuriesAway - injuriesHome;
  if (injuriesHome > 0 || injuriesAway > 0) {
    const direction: EvidenceDirection = injuryDiff >= 0 ? "home" : "away";
    evidence.push({
      id: createEvidenceId(fixture.id, "availability"),
      fixtureId: fixture.id,
      kind: "availability",
      title: "Availability pressure",
      summary: `${fixture.homeTeam} injuries ${injuriesHome}, ${fixture.awayTeam} injuries ${injuriesAway}.`,
      direction,
      confidence: 0.7,
      impact: clamp(Math.abs(injuryDiff) * 0.06, 0.05, 0.22),
      source: { provider: "fixture-metadata", reference: "injuriesHome/injuriesAway" },
      tags: ["availability"],
      extractedAt,
      metadata: { injuriesHome: String(injuriesHome), injuriesAway: String(injuriesAway) },
    });
  }

  const drawBias = metadataNumber(metadata, "drawBias", 0);
  if (drawBias >= 0.08) {
    evidence.push({
      id: createEvidenceId(fixture.id, "draw-bias"),
      fixtureId: fixture.id,
      kind: "tactical",
      title: "Game-state compression",
      summary: "Metadata suggests a slow-tempo or low-separation matchup that can support draw outcomes.",
      direction: "draw",
      confidence: 0.58,
      impact: clamp(drawBias * 0.8, 0.05, 0.18),
      source: { provider: "fixture-metadata", reference: "drawBias" },
      tags: ["draw", "tempo"],
      extractedAt,
      metadata: { drawBias: String(drawBias) },
    });
  }

  if (fixture.metadata.derby === "true") {
    evidence.push({
      id: createEvidenceId(fixture.id, "motivation"),
      fixtureId: fixture.id,
      kind: "motivation",
      title: "Derby volatility",
      summary: "Derby context raises variance and typically trims confidence in extreme outcomes.",
      direction: "draw",
      confidence: 0.55,
      impact: 0.08,
      source: { provider: "fixture-metadata", reference: "derby" },
      tags: ["derby", "motivation"],
      extractedAt,
      metadata: { derby: fixture.metadata.derby },
    });
  }

  return evidence;
};

export const scoreEvidence = (
  evidence: readonly EvidenceItem[],
): DirectionalResearchScore => {
  const score = { home: 0, away: 0, draw: 0 };

  for (const item of evidence) {
    const weighted = item.impact * item.confidence;
    if (item.direction === "home") {
      score.home += weighted;
    } else if (item.direction === "away") {
      score.away += weighted;
    } else if (item.direction === "draw") {
      score.draw += weighted;
    }
  }

  return {
    home: scoreBucket(score.home),
    away: scoreBucket(score.away),
    draw: scoreBucket(score.draw),
  };
};

export const pickTopEvidence = (
  evidence: readonly EvidenceItem[],
  limit = 3,
): EvidenceItem[] =>
  [...evidence]
    .sort((left, right) => right.impact * right.confidence - left.impact * left.confidence)
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

const defaultSummary = (
  fixture: FixtureLike,
  score: DirectionalResearchScore,
  evidence: readonly EvidenceItem[],
): string => {
  const lean = determineRecommendedLean(score);
  const topTitles = pickTopEvidence(evidence)
    .map((item) => item.title)
    .join(", ");
  return `${fixture.homeTeam} vs ${fixture.awayTeam}: lean ${lean} with research score H ${score.home.toFixed(2)} / D ${score.draw.toFixed(2)} / A ${score.away.toFixed(2)}. Top evidence: ${topTitles || "none"}.`;
};

const defaultRisks = (
  fixture: FixtureLike,
  score: DirectionalResearchScore,
): string[] => {
  const scoreGap = Math.abs(score.home - score.away);
  const risks = [
    scoreGap <= 0.08 ? "Small separation between home and away research scores." : "",
    fixture.metadata.derby === "true" ? "Derby context can compress certainty and inflate variance." : "",
    fixture.status !== "scheduled" ? `Fixture status is ${fixture.status}, requiring live-ops review before publishing.` : "",
  ].filter((value) => value.length > 0);
  return risks.length > 0 ? risks : ["No major structural risks flagged by the deterministic baseline."];
};

export interface BuildResearchDossierOptions extends ResearchEngineOptions {
  readonly evidence?: readonly EvidenceItem[];
}

export const buildResearchDossier = (
  fixture: FixtureLike,
  options: BuildResearchDossierOptions = {},
): ResearchDossier => {
  const now = options.now ?? nowIso;
  const brief = buildResearchBrief(fixture, { now });
  const evidence = options.evidence ? [...options.evidence] : createBaselineEvidence(fixture, { now });
  const directionalScore = scoreEvidence(evidence);
  const synthesized = options.synthesisHook?.synthesize({
    brief,
    evidence,
    directionalScore,
  });

  return {
    fixtureId: fixture.id,
    generatedAt: now(),
    brief,
    evidence,
    directionalScore,
    summary: synthesized?.summary ?? defaultSummary(fixture, directionalScore, evidence),
    recommendedLean: determineRecommendedLean(directionalScore),
    risks: [...(synthesized?.risks ?? defaultRisks(fixture, directionalScore))],
  };
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
