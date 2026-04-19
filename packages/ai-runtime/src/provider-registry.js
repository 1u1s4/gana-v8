import { createCodexHttpProvider } from "./providers/codex-http.js";
export const DEFAULT_AI_PROVIDER = "codex";
export function getAiProviderAdapter(provider = DEFAULT_AI_PROVIDER, options = {}) {
    if (provider === "codex") {
        return options.codexAdapter ?? createCodexHttpProvider();
    }
    throw new Error(`Unsupported AI provider: ${provider}`);
}
//# sourceMappingURL=provider-registry.js.map