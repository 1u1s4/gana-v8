import type { AiModelCatalogItem, ProviderUsage, ReasoningLevel } from "./types.js";
export interface CodexResponsesRequest {
    readonly model?: string | undefined;
    readonly instructions?: string | undefined;
    readonly input?: string | undefined;
    readonly reasoning?: ReasoningLevel | undefined;
    readonly includeEvents?: boolean | undefined;
    readonly tools?: Array<Record<string, unknown>> | undefined;
    readonly toolChoice?: "auto" | "none" | "required" | undefined;
}
export interface CodexResponseEvent {
    readonly type?: string | undefined;
    readonly delta?: string | undefined;
    readonly response?: {
        readonly id?: string | undefined;
        readonly status?: string | undefined;
        readonly model?: string | undefined;
    } | undefined;
    readonly [key: string]: unknown;
}
export interface CodexResponsesResult {
    readonly model?: string | undefined;
    readonly outputText: string;
    readonly body: Record<string, unknown>;
    readonly events: CodexResponseEvent[];
    readonly responseState: {
        readonly id?: string | undefined;
        readonly status?: string | undefined;
        readonly model?: string | undefined;
    };
}
export interface CodexStreamResult {
    readonly model?: string | undefined;
    readonly events: AsyncIterable<CodexResponseEvent>;
}
export interface CodexHttpClient {
    responses(args: CodexResponsesRequest): Promise<CodexResponsesResult>;
    streamResponses(args: CodexResponsesRequest): Promise<CodexStreamResult>;
    listModels(): Promise<{
        models: AiModelCatalogItem[];
    }>;
}
export interface CreateCodexHttpClientOptions {
    readonly apiKey?: string | undefined;
    readonly baseUrl?: string | undefined;
    readonly fetchImpl?: typeof fetch | undefined;
    readonly timeoutMs?: number | undefined;
}
export interface CreateMockCodexClientOptions {
    readonly model?: string | undefined;
    readonly outputText?: string | undefined;
    readonly usage?: ProviderUsage | undefined;
    readonly eventSequence?: readonly CodexResponseEvent[] | undefined;
    readonly listModels?: readonly AiModelCatalogItem[] | undefined;
}
export declare function createMockCodexClient(options?: CreateMockCodexClientOptions): CodexHttpClient;
export declare function createCodexHttpClient(options?: CreateCodexHttpClientOptions): CodexHttpClient;
export type AiClientMap = {
    codex: CodexHttpClient;
};
export declare function getAiClient(provider: "codex", options?: CreateCodexHttpClientOptions): CodexHttpClient;
export declare function normalizeProviderUsage(body: Record<string, unknown>): ProviderUsage | undefined;
//# sourceMappingURL=clients.d.ts.map