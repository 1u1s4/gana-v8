import type {
  AiModelOptionWithAvailability,
  CodexModelAvailabilitySource,
  ReasoningLevel,
} from "./allowed-models.js";
import {
  DEFAULT_ALLOWED_CODEX_MODEL,
  REASONING_LEVELS,
  isAllowedAiModelId,
  type AiProviderName,
} from "./allowed-models.js";
import {
  buildAiModelCatalog,
  getFallbackModelCatalog,
  type AiModelCatalog,
} from "./model-catalog.js";

export type ModelResolutionKind =
  | "exact_match"
  | "exact_model_reasoning_adjusted"
  | "family_variant"
  | "cross_model_fallback";

export interface ModelSelectionResolution {
  readonly provider: AiProviderName;
  readonly requestedModel?: string;
  readonly requestedReasoning?: ReasoningLevel;
  readonly resolvedModel: string;
  readonly resolvedReasoning?: ReasoningLevel;
  readonly fallbackReason?: string | null;
  readonly resolutionKind: ModelResolutionKind;
  readonly resolvedModelSource?: CodexModelAvailabilitySource;
}

export interface CodexModelSummary {
  readonly id: string;
  readonly label: string;
  readonly defaultReasoningLevel?: ReasoningLevel;
  readonly supportedReasoningLevels: readonly ReasoningLevel[];
  readonly supportsWebSearch: boolean;
  readonly availabilitySource: CodexModelAvailabilitySource;
}

export interface ResolveModelSelectionInput {
  readonly provider: AiProviderName;
  readonly requestedModel?: string;
  readonly requestedReasoning?: ReasoningLevel;
  readonly catalog?: AiModelCatalog;
}

export function getReasoningRank(level: ReasoningLevel | null | undefined): number {
  return level ? REASONING_LEVELS.indexOf(level) : -1;
}

function getHighestReasoningLevel(
  levels: readonly ReasoningLevel[],
): ReasoningLevel | undefined {
  return [...levels].sort(
    (left, right) => getReasoningRank(right) - getReasoningRank(left),
  )[0];
}

function chooseBestReasoning(
  model: Pick<CodexModelSummary, "defaultReasoningLevel" | "supportedReasoningLevels">,
  preferred?: ReasoningLevel,
): ReasoningLevel | undefined {
  if (preferred && model.supportedReasoningLevels.includes(preferred)) {
    return preferred;
  }

  if (
    model.defaultReasoningLevel &&
    model.supportedReasoningLevels.includes(model.defaultReasoningLevel)
  ) {
    return model.defaultReasoningLevel;
  }

  return getHighestReasoningLevel(model.supportedReasoningLevels);
}

function matchesRequestedModel(modelId: string, requestedModel: string): boolean {
  return modelId === requestedModel || modelId.startsWith(`${requestedModel}-`);
}

function compactSelection(
  selection: ModelSelectionResolution,
): ModelSelectionResolution {
  return {
    provider: selection.provider,
    resolvedModel: selection.resolvedModel,
    resolutionKind: selection.resolutionKind,
    ...(selection.requestedModel ? { requestedModel: selection.requestedModel } : {}),
    ...(selection.requestedReasoning
      ? { requestedReasoning: selection.requestedReasoning }
      : {}),
    ...(selection.resolvedReasoning
      ? { resolvedReasoning: selection.resolvedReasoning }
      : {}),
    ...(selection.fallbackReason !== undefined
      ? { fallbackReason: selection.fallbackReason }
      : {}),
    ...(selection.resolvedModelSource
      ? { resolvedModelSource: selection.resolvedModelSource }
      : {}),
  };
}

export function inferResolutionKind(
  selection: Pick<
    ModelSelectionResolution,
    "requestedModel" | "requestedReasoning" | "resolvedModel" | "resolvedReasoning"
  >,
): ModelResolutionKind {
  if (!selection.requestedModel || selection.resolvedModel === selection.requestedModel) {
    return selection.resolvedReasoning === selection.requestedReasoning
      ? "exact_match"
      : "exact_model_reasoning_adjusted";
  }

  if (selection.resolvedModel.startsWith(`${selection.requestedModel}-`)) {
    return "family_variant";
  }

  return "cross_model_fallback";
}

export function toCodexModelSummary(
  model: AiModelOptionWithAvailability,
): CodexModelSummary {
  return {
    id: model.id,
    label: model.label,
    supportedReasoningLevels:
      model.supportedReasoningLevels.length > 0
        ? [...model.supportedReasoningLevels]
        : [...REASONING_LEVELS],
    supportsWebSearch: model.supportsWebSearch,
    availabilitySource: model.availabilitySource ?? "upstream",
    ...(model.defaultReasoning
      ? { defaultReasoningLevel: model.defaultReasoning }
      : {}),
  };
}

export function resolveCodexModelSelection(
  models: readonly CodexModelSummary[],
  requestedModel: string,
  requestedReasoning?: ReasoningLevel,
): ModelSelectionResolution | null {
  if (!requestedModel || models.length === 0) {
    return null;
  }

  const exactModel = models.find((model) => model.id === requestedModel) ?? null;
  if (exactModel) {
    const adjustedReasoning = chooseBestReasoning(exactModel, requestedReasoning);
    const isExactReasoning = adjustedReasoning === requestedReasoning;

    return compactSelection({
      provider: "codex",
      requestedModel,
      ...(requestedReasoning ? { requestedReasoning } : {}),
      resolvedModel: exactModel.id,
      ...(adjustedReasoning ? { resolvedReasoning: adjustedReasoning } : {}),
      fallbackReason: isExactReasoning
        ? null
        : requestedReasoning
          ? `${exactModel.id} does not support ${requestedReasoning}; using ${adjustedReasoning ?? "none"}.`
          : null,
      resolutionKind: isExactReasoning
        ? "exact_match"
        : "exact_model_reasoning_adjusted",
      resolvedModelSource: exactModel.availabilitySource,
    });
  }

  const familyVariant = models.find((model) =>
    matchesRequestedModel(model.id, requestedModel),
  );
  if (familyVariant) {
    const resolvedReasoning = chooseBestReasoning(familyVariant, requestedReasoning);
    return compactSelection({
      provider: "codex",
      requestedModel,
      ...(requestedReasoning ? { requestedReasoning } : {}),
      resolvedModel: familyVariant.id,
      ...(resolvedReasoning ? { resolvedReasoning } : {}),
      fallbackReason: `${requestedModel} is unavailable; using ${familyVariant.id} within the same family.`,
      resolutionKind: "family_variant",
      resolvedModelSource: familyVariant.availabilitySource,
    });
  }

  const crossModelCandidate =
    (requestedReasoning
      ? models.find((model) =>
          model.supportedReasoningLevels.includes(requestedReasoning),
        )
      : undefined) ?? models[0];
  if (!crossModelCandidate) {
    return null;
  }

  const resolvedReasoning = chooseBestReasoning(
    crossModelCandidate,
    requestedReasoning,
  );

  return compactSelection({
    provider: "codex",
    requestedModel,
    ...(requestedReasoning ? { requestedReasoning } : {}),
    resolvedModel: crossModelCandidate.id,
    ...(resolvedReasoning ? { resolvedReasoning } : {}),
    fallbackReason: `${requestedModel} is unavailable; using ${crossModelCandidate.id} as fallback.`,
    resolutionKind: "cross_model_fallback",
    resolvedModelSource: crossModelCandidate.availabilitySource,
  });
}

export function resolveModelSelection(
  input: ResolveModelSelectionInput,
): ModelSelectionResolution {
  if (input.provider !== "codex") {
    throw new Error(`Unsupported AI provider: ${input.provider}`);
  }

  const catalog = input.catalog ?? buildAiModelCatalog();
  const requestedModel =
    input.requestedModel && isAllowedAiModelId(input.requestedModel)
      ? input.requestedModel
      : DEFAULT_ALLOWED_CODEX_MODEL;

  const selection = resolveCodexModelSelection(
    catalog.providers.codex.map(toCodexModelSummary),
    requestedModel,
    input.requestedReasoning,
  );

  if (selection) {
    return selection;
  }

  const fallback = getFallbackModelCatalog("codex")[0];
  if (!fallback) {
    throw new Error("Codex fallback catalog is empty.");
  }

  return compactSelection({
    provider: "codex",
    requestedModel,
    ...(input.requestedReasoning
      ? { requestedReasoning: input.requestedReasoning }
      : {}),
    resolvedModel: fallback.id,
    ...(fallback.defaultReasoning
      ? { resolvedReasoning: fallback.defaultReasoning }
      : {}),
    fallbackReason: `${requestedModel} could not be resolved; using bundled fallback ${fallback.id}.`,
    resolutionKind: "cross_model_fallback",
    ...(fallback.availabilitySource
      ? { resolvedModelSource: fallback.availabilitySource }
      : {}),
  });
}
