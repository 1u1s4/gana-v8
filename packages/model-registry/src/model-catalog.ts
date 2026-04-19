import {
  ALLOWED_CODEX_MODEL_IDS,
  getAllowedCodexModelOptions,
  type AiModelOptionWithAvailability,
  type AiProviderName,
  type AllowedAiModelId,
} from "./allowed-models.js";

export interface AiModelCatalog {
  readonly defaultProvider: AiProviderName;
  readonly providers: Record<AiProviderName, AiModelOptionWithAvailability[]>;
}

export interface BuildAiModelCatalogOptions {
  readonly upstream?: Partial<
    Record<AiProviderName, readonly AiModelOptionWithAvailability[] | undefined>
  >;
}

const FALLBACK_MODELS = getAllowedCodexModelOptions();

export function getFallbackModelCatalog(
  provider?: AiProviderName,
): AiModelOptionWithAvailability[] {
  return provider
    ? FALLBACK_MODELS.filter((model) => model.provider === provider)
    : [...FALLBACK_MODELS];
}

function mergeAllowedProviderCatalog(
  fallbackModels: readonly AiModelOptionWithAvailability[],
  upstreamModels: readonly AiModelOptionWithAvailability[] | undefined,
): AiModelOptionWithAvailability[] {
  const upstreamById = new Map(
    (upstreamModels ?? []).map((model) => [model.id, model]),
  );

  return ALLOWED_CODEX_MODEL_IDS.map((id) => {
    const fallbackModel = fallbackModels.find(
      (model) => model.id === id,
    ) as (typeof fallbackModels)[number] | undefined;
    if (!fallbackModel) {
      throw new Error(`Missing fallback catalog entry for ${id}.`);
    }

    const upstreamModel = upstreamById.get(id);
    if (!upstreamModel) {
      return fallbackModel;
    }

    const merged: AiModelOptionWithAvailability = {
      ...fallbackModel,
      ...upstreamModel,
      id: id as AllowedAiModelId,
      label: fallbackModel.label,
      provider: "codex",
      supportedReasoningLevels:
        upstreamModel.supportedReasoningLevels.length > 0
          ? [...upstreamModel.supportedReasoningLevels]
          : [...fallbackModel.supportedReasoningLevels],
      ...(upstreamModel.defaultReasoning
        ? { defaultReasoning: upstreamModel.defaultReasoning }
        : fallbackModel.defaultReasoning
          ? { defaultReasoning: fallbackModel.defaultReasoning }
          : {}),
      ...(upstreamModel.availabilitySource
        ? { availabilitySource: upstreamModel.availabilitySource }
        : fallbackModel.availabilitySource
          ? { availabilitySource: fallbackModel.availabilitySource }
          : {}),
    };

    return merged;
  });
}

export function buildAiModelCatalog(
  options: BuildAiModelCatalogOptions = {},
): AiModelCatalog {
  const codexFallback = getFallbackModelCatalog("codex");

  return {
    defaultProvider: "codex",
    providers: {
      codex: mergeAllowedProviderCatalog(codexFallback, options.upstream?.codex),
    },
  };
}

export async function getAiModelCatalog(
  options: BuildAiModelCatalogOptions = {},
): Promise<AiModelCatalog> {
  return buildAiModelCatalog(options);
}
