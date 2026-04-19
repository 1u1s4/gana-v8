import { buildAiModelCatalog, getFallbackModelCatalog, resolveModelSelection, } from "@gana-v8/model-registry";
import { AiExecutionError } from "./errors.js";
import { getAiProviderAdapter } from "./provider-registry.js";
function toCatalogModel(model) {
    return {
        id: model.id,
        label: model.label,
        provider: model.provider,
        supportsWebSearch: model.supportsWebSearch,
        supportedReasoningLevels: model.supportedReasoningLevels ?? [],
        ...(model.defaultReasoningLevel
            ? { defaultReasoning: model.defaultReasoningLevel }
            : {}),
        ...(model.availabilitySource
            ? { availabilitySource: model.availabilitySource }
            : {}),
    };
}
async function resolveCatalog(input, options) {
    if (options.modelCatalog) {
        return options.modelCatalog;
    }
    const adapter = getAiProviderAdapter(input.provider, options);
    try {
        return await adapter.listModels();
    }
    catch {
        return getFallbackModelCatalog(input.provider).map((model) => ({
            id: model.id,
            label: model.label,
            provider: model.provider,
            defaultReasoningLevel: model.defaultReasoning,
            supportedReasoningLevels: [...model.supportedReasoningLevels],
            supportsReasoning: true,
            supportsWebSearch: model.supportsWebSearch,
            availabilitySource: model.availabilitySource,
        }));
    }
}
function normalizeRunResult(input, response, latencyMs, selection) {
    return {
        provider: input.provider,
        requestedModel: selection.requestedModel,
        resolvedModel: response.resolvedModel ?? selection.resolvedModel,
        requestedReasoning: selection.requestedReasoning,
        resolvedReasoning: response.resolvedReasoning ?? selection.resolvedReasoning,
        fallbackReason: response.fallbackReason ?? selection.fallbackReason,
        resolutionKind: response.resolutionKind ?? selection.resolutionKind,
        resolvedModelSource: response.resolvedModelSource ?? selection.resolvedModelSource,
        webSearchMode: input.webSearchMode,
        outputText: response.outputText,
        events: response.rawEvents,
        providerRequestId: response.providerRequestId,
        usageJson: response.usage ?? undefined,
        responseBody: response.rawBody,
        latencyMs,
    };
}
async function resolveSelection(input, options) {
    const catalogModels = await resolveCatalog(input, options);
    const catalog = buildAiModelCatalog({
        upstream: {
            codex: catalogModels.map(toCatalogModel),
        },
    });
    return resolveModelSelection({
        provider: input.provider,
        ...(input.requestedModel ? { requestedModel: input.requestedModel } : {}),
        ...(input.requestedReasoning
            ? { requestedReasoning: input.requestedReasoning }
            : {}),
        catalog,
    });
}
export async function listAiModels(provider = "codex", options = {}) {
    return resolveCatalog({
        provider,
        webSearchMode: "disabled",
        input: "",
    }, options);
}
export async function runHttpAi(input, options = {}) {
    const startedAt = Date.now();
    const adapter = getAiProviderAdapter(input.provider, options);
    try {
        const selection = await resolveSelection(input, options);
        const response = await adapter.run({
            ...input,
            requestedModel: selection.resolvedModel,
            requestedReasoning: selection.resolvedReasoning,
        });
        return normalizeRunResult(input, response, Date.now() - startedAt, selection);
    }
    catch (error) {
        throw new AiExecutionError(input.provider, error instanceof Error ? error.message : `${input.provider} execution failed.`, { cause: error });
    }
}
export async function* streamHttpAi(input, options = {}) {
    const startedAt = Date.now();
    const adapter = getAiProviderAdapter(input.provider, options);
    let responseText = "";
    let emittedError = false;
    try {
        const selection = await resolveSelection(input, options);
        yield {
            type: "selection",
            provider: input.provider,
            selection,
        };
        for await (const event of adapter.stream({
            ...input,
            requestedModel: selection.resolvedModel,
            requestedReasoning: selection.resolvedReasoning,
        })) {
            if (event.type === "delta" && event.text) {
                responseText += event.text;
                yield {
                    type: "delta",
                    provider: input.provider,
                    text: event.text,
                    responseText,
                    event: event.event,
                };
                continue;
            }
            if (event.type === "event") {
                yield {
                    type: "event",
                    provider: input.provider,
                    event: event.event,
                };
                continue;
            }
            if (event.type === "complete" && event.response) {
                const response = normalizeRunResult(input, {
                    ...event.response,
                    outputText: event.response.outputText || responseText,
                }, Date.now() - startedAt, selection);
                yield {
                    type: "complete",
                    provider: input.provider,
                    response,
                };
                return response;
            }
            if (event.type === "error") {
                emittedError = true;
                yield {
                    type: "error",
                    provider: input.provider,
                    error: event.error ?? `${input.provider} execution failed.`,
                };
            }
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : `${input.provider} execution failed.`;
        if (!emittedError) {
            yield {
                type: "error",
                provider: input.provider,
                error: message,
            };
        }
        throw new AiExecutionError(input.provider, message, { cause: error });
    }
    throw new AiExecutionError(input.provider, `${input.provider} stream ended without a complete event.`);
}
//# sourceMappingURL=run-http-ai.js.map