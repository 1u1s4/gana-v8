import type { AiProviderAdapter } from "./types.js";
export declare const DEFAULT_AI_PROVIDER = "codex";
export interface GetAiProviderAdapterOptions {
    readonly codexAdapter?: AiProviderAdapter;
}
export declare function getAiProviderAdapter(provider?: "codex", options?: GetAiProviderAdapterOptions): AiProviderAdapter;
//# sourceMappingURL=provider-registry.d.ts.map