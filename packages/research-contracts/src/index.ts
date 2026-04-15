export const workspaceInfo = {
  packageName: "@gana-v8/research-contracts",
  workspaceName: "research-contracts",
  category: "package",
  description: "Explicit types for research prompts, evidence bundles, and synthesis outputs.",
  dependencies: [{ name: "@gana-v8/domain-core", category: "workspace" }],
} as const;

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

export interface EvidenceSourceRef {
  readonly provider: string;
  readonly reference: string;
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
  readonly source: EvidenceSourceRef;
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

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
