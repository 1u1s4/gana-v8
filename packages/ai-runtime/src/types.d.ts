import type { AiProviderName, CodexModelAvailabilitySource, ModelResolutionKind, ReasoningLevel } from "@gana-v8/model-registry";
export type { AiProviderName, ReasoningLevel } from "@gana-v8/model-registry";
export type AiBackend = "http";
export type WebSearchMode = "disabled" | "auto" | "required";
export interface AiInputMessage {
    readonly role: "system" | "developer" | "user" | "assistant";
    readonly content: string;
}
export type AiRunInput = string | readonly AiInputMessage[];
export interface ProviderUsage {
    readonly inputTokens?: number | undefined;
    readonly outputTokens?: number | undefined;
    readonly totalTokens?: number | undefined;
    readonly [key: string]: unknown;
}
export interface NormalizedAiResponse {
    readonly provider: AiProviderName;
    readonly backend: AiBackend;
    readonly requestedModel?: string | undefined;
    readonly resolvedModel?: string | undefined;
    readonly requestedReasoning?: ReasoningLevel | undefined;
    readonly resolvedReasoning?: ReasoningLevel | undefined;
    readonly fallbackReason?: string | null | undefined;
    readonly resolutionKind?: ModelResolutionKind | undefined;
    readonly resolvedModelSource?: CodexModelAvailabilitySource | undefined;
    readonly webSearchMode: WebSearchMode;
    readonly outputText: string;
    readonly usage?: ProviderUsage | null | undefined;
    readonly providerRequestId?: string | undefined;
    readonly rawBody?: unknown;
    readonly rawEvents?: unknown[] | undefined;
}
export interface RunHttpAiInput {
    readonly provider: AiProviderName;
    readonly requestedModel?: string | undefined;
    readonly requestedReasoning?: ReasoningLevel | undefined;
    readonly webSearchMode: WebSearchMode;
    readonly instructions?: string | undefined;
    readonly input: AiRunInput;
    readonly includeEvents?: boolean | undefined;
}
export interface RunHttpAiResult {
    readonly provider: AiProviderName;
    readonly requestedModel?: string | undefined;
    readonly resolvedModel: string;
    readonly requestedReasoning?: ReasoningLevel | undefined;
    readonly resolvedReasoning?: ReasoningLevel | undefined;
    readonly fallbackReason?: string | null | undefined;
    readonly resolutionKind: ModelResolutionKind;
    readonly resolvedModelSource?: CodexModelAvailabilitySource | undefined;
    readonly webSearchMode: WebSearchMode;
    readonly outputText: string;
    readonly events?: unknown[] | undefined;
    readonly providerRequestId?: string | undefined;
    readonly usageJson?: ProviderUsage | undefined;
    readonly responseBody?: unknown;
    readonly latencyMs: number;
}
export type RunHttpAiStreamEvent = {
    readonly type: "selection";
    readonly provider: AiProviderName;
    readonly selection: {
        readonly requestedModel?: string | undefined;
        readonly requestedReasoning?: ReasoningLevel | undefined;
        readonly resolvedModel: string;
        readonly resolvedReasoning?: ReasoningLevel | undefined;
        readonly fallbackReason?: string | null | undefined;
        readonly resolutionKind: ModelResolutionKind;
        readonly resolvedModelSource?: CodexModelAvailabilitySource | undefined;
    };
} | {
    readonly type: "delta";
    readonly provider: AiProviderName;
    readonly text: string;
    readonly responseText: string;
    readonly event?: unknown;
} | {
    readonly type: "event";
    readonly provider: AiProviderName;
    readonly event?: unknown;
} | {
    readonly type: "complete";
    readonly provider: AiProviderName;
    readonly response: RunHttpAiResult;
} | {
    readonly type: "error";
    readonly provider: AiProviderName;
    readonly error: string;
};
export interface AiModelCatalogItem {
    readonly id: string;
    readonly label: string;
    readonly provider: AiProviderName;
    readonly defaultReasoningLevel?: ReasoningLevel | undefined;
    readonly supportedReasoningLevels?: readonly ReasoningLevel[] | undefined;
    readonly supportsReasoning: boolean;
    readonly supportsWebSearch: boolean;
    readonly availabilitySource?: CodexModelAvailabilitySource | undefined;
}
export interface AiProviderAdapter {
    readonly provider: AiProviderName;
    run(input: RunHttpAiInput): Promise<NormalizedAiResponse>;
    stream(input: RunHttpAiInput): AsyncGenerator<{
        readonly type: "delta";
        readonly provider: AiProviderName;
        readonly text?: string | undefined;
        readonly event?: unknown;
    } | {
        readonly type: "event";
        readonly provider: AiProviderName;
        readonly event?: unknown;
    } | {
        readonly type: "complete";
        readonly provider: AiProviderName;
        readonly response?: NormalizedAiResponse | undefined;
    } | {
        readonly type: "error";
        readonly provider: AiProviderName;
        readonly error?: string | undefined;
    }, NormalizedAiResponse, void>;
    listModels(): Promise<AiModelCatalogItem[]>;
}
//# sourceMappingURL=types.d.ts.map