export type AiProviderName = "codex";

export const REASONING_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export type CodexModelAvailabilitySource = "upstream" | "bundled" | "probed";

export interface AiModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider: AiProviderName;
  readonly supportsWebSearch: boolean;
  readonly defaultReasoning?: ReasoningLevel;
  readonly supportedReasoningLevels: readonly ReasoningLevel[];
}

export interface AiModelOptionWithAvailability extends AiModelOption {
  readonly availabilitySource?: CodexModelAvailabilitySource;
}

export const ALLOWED_CODEX_MODEL_IDS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
] as const;

export type AllowedAiModelId = (typeof ALLOWED_CODEX_MODEL_IDS)[number];

export const DEFAULT_ALLOWED_CODEX_MODEL: AllowedAiModelId = "gpt-5.4";

const ALLOWED_CODEX_MODEL_LABELS: Record<AllowedAiModelId, string> = {
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 Mini",
  "gpt-5.3-codex-spark": "GPT-5.3 Codex Spark",
};

export function isAllowedAiModelId(
  value: string | null | undefined,
): value is AllowedAiModelId {
  if (typeof value !== "string") {
    return false;
  }

  return (ALLOWED_CODEX_MODEL_IDS as readonly string[]).includes(value.trim());
}

export function sanitizeAllowedAiModelId(
  value: string | null | undefined,
  fallback: AllowedAiModelId = DEFAULT_ALLOWED_CODEX_MODEL,
): AllowedAiModelId {
  return isAllowedAiModelId(value) ? (value.trim() as AllowedAiModelId) : fallback;
}

export function getAllowedCodexModelOptions(): AiModelOptionWithAvailability[] {
  return ALLOWED_CODEX_MODEL_IDS.map((id) => ({
    id,
    label: ALLOWED_CODEX_MODEL_LABELS[id],
    provider: "codex",
    supportsWebSearch: true,
    defaultReasoning: "medium",
    supportedReasoningLevels: [...REASONING_LEVELS],
    availabilitySource: "bundled",
  }));
}
