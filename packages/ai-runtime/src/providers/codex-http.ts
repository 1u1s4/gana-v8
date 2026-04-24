import type { ModelSelectionResolution } from "@gana-v8/model-registry";

import {
  createMockCodexClient,
  getAiClient,
  normalizeProviderUsage,
  type CodexHttpClient,
  type CodexResponsesResult,
} from "../clients.js";
import { AiExecutionError } from "../errors.js";
import type {
  AiModelCatalogItem,
  AiProviderAdapter,
  NormalizedAiResponse,
  RunHttpAiInput,
  WebSearchMode,
} from "../types.js";

export interface CreateCodexHttpProviderOptions {
  readonly client?: CodexHttpClient | undefined;
  readonly defaultInstructions?: string | undefined;
}

const DEFAULT_CODEX_INSTRUCTIONS =
  "Respond in Spanish when the prompt is in Spanish and return strict JSON when explicitly requested.";

const CODEX_WEB_SEARCH_TOOL = { type: "web_search_preview" } as const;

function toProviderInput(input: RunHttpAiInput["input"]): string {
  if (typeof input === "string") {
    return input;
  }

  return input.map((message) => `[${message.role}] ${message.content}`).join("\n\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function extractProviderRequestId(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  if (typeof record.id === "string") {
    return record.id;
  }

  const response = asRecord(record.response);
  return typeof response?.id === "string" ? response.id : undefined;
}

function extractOutputTextDelta(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record || record.type !== "response.output_text.delta") {
    return undefined;
  }

  return typeof record.delta === "string" ? record.delta : undefined;
}

function buildCodexRequest(input: RunHttpAiInput, defaultInstructions?: string) {
  const webSearch = toCodexWebSearchOptions(input.webSearchMode);
  return {
    ...(input.requestedModel ? { model: input.requestedModel } : {}),
    instructions: input.instructions ?? defaultInstructions ?? DEFAULT_CODEX_INSTRUCTIONS,
    input: toProviderInput(input.input),
    ...(input.requestedReasoning ? { reasoning: input.requestedReasoning } : {}),
    ...(input.includeEvents !== undefined ? { includeEvents: input.includeEvents } : {}),
    ...webSearch,
  };
}

function toCodexWebSearchOptions(
  mode: WebSearchMode,
): { readonly tools?: Array<Record<string, unknown>>; readonly toolChoice?: "auto" | "required" } {
  if (mode === "disabled") {
    return {};
  }

  return {
    tools: [{ ...CODEX_WEB_SEARCH_TOOL }],
    toolChoice: mode === "required" ? "required" : "auto",
  };
}

function normalizeResponse(
  input: RunHttpAiInput,
  result: CodexResponsesResult,
  selection?: ModelSelectionResolution,
): NormalizedAiResponse {
  const body = asRecord(result.body) ?? {};

  return {
    provider: "codex",
    backend: "http",
    ...(selection?.requestedModel
      ? { requestedModel: selection.requestedModel }
      : input.requestedModel
        ? { requestedModel: input.requestedModel }
        : {}),
    ...(result.responseState.model ?? result.model ?? selection?.resolvedModel ?? input.requestedModel
      ? {
          resolvedModel:
            result.responseState.model ??
            result.model ??
            selection?.resolvedModel ??
            input.requestedModel,
        }
      : {}),
    ...(selection?.requestedReasoning
      ? { requestedReasoning: selection.requestedReasoning }
      : input.requestedReasoning
        ? { requestedReasoning: input.requestedReasoning }
        : {}),
    ...(selection?.resolvedReasoning
      ? { resolvedReasoning: selection.resolvedReasoning }
      : input.requestedReasoning
        ? { resolvedReasoning: input.requestedReasoning }
        : {}),
    ...(selection?.fallbackReason !== undefined
      ? { fallbackReason: selection.fallbackReason }
      : {}),
    ...(selection?.resolutionKind ? { resolutionKind: selection.resolutionKind } : {}),
    ...(selection?.resolvedModelSource
      ? { resolvedModelSource: selection.resolvedModelSource }
      : {}),
    webSearchMode: input.webSearchMode,
    outputText: result.outputText,
    ...(normalizeProviderUsage(body) ? { usage: normalizeProviderUsage(body) } : { usage: null }),
    ...(result.responseState.id ?? extractProviderRequestId(result.body)
      ? { providerRequestId: result.responseState.id ?? extractProviderRequestId(result.body) }
      : {}),
    rawBody: result.body,
    rawEvents: result.events,
  };
}

function toFallbackModelItem(item: AiModelCatalogItem): AiModelCatalogItem {
  return { ...item };
}

export function createCodexHttpProvider(
  options: CreateCodexHttpProviderOptions = {},
): AiProviderAdapter {
  const client = options.client ?? getAiClient("codex");

  return {
    provider: "codex",
    async run(input) {
      try {
        const result = await client.responses(
          buildCodexRequest(input, options.defaultInstructions),
        );

        return normalizeResponse(input, result);
      } catch (error) {
        throw new AiExecutionError(
          "codex",
          error instanceof Error ? error.message : "Codex HTTP execution failed.",
          { cause: error },
        );
      }
    },
    async *stream(input) {
      try {
        const streamResult = await client.streamResponses(
          buildCodexRequest(input, options.defaultInstructions),
        );

        const events: unknown[] = [];
        let outputText = "";
        let providerRequestId: string | undefined;

        for await (const event of streamResult.events) {
          events.push(event);
          providerRequestId ||= extractProviderRequestId(event);

          const text = extractOutputTextDelta(event);
          if (text) {
            outputText += text;
            yield {
              type: "delta",
              provider: "codex",
              text,
              event,
            } as const;
            continue;
          }

          yield {
            type: "event",
            provider: "codex",
            event,
          } as const;
        }

        const response: NormalizedAiResponse = {
          provider: "codex",
          backend: "http",
          ...(input.requestedModel ? { requestedModel: input.requestedModel } : {}),
          ...(streamResult.model ?? input.requestedModel
            ? { resolvedModel: streamResult.model ?? input.requestedModel }
            : {}),
          ...(input.requestedReasoning
            ? {
                requestedReasoning: input.requestedReasoning,
                resolvedReasoning: input.requestedReasoning,
              }
            : {}),
          webSearchMode: input.webSearchMode,
          outputText,
          ...(providerRequestId ? { providerRequestId } : {}),
          rawEvents: events,
        };

        yield {
          type: "complete",
          provider: "codex",
          response,
        } as const;

        return response;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Codex HTTP streaming failed.";
        yield {
          type: "error",
          provider: "codex",
          error: message,
        } as const;
        throw new AiExecutionError("codex", message, { cause: error });
      }
    },
    async listModels(): Promise<AiModelCatalogItem[]> {
      try {
        const catalog = await client.listModels();
        return catalog.models.map(toFallbackModelItem);
      } catch {
        const fallback = await createMockCodexClient().listModels();
        return fallback.models.map(toFallbackModelItem);
      }
    },
  };
}
