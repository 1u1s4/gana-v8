import type { AiProviderAdapter } from "./types.js";
import { createCodexHttpProvider } from "./providers/codex-http.js";

export const DEFAULT_AI_PROVIDER = "codex";

export interface GetAiProviderAdapterOptions {
  readonly codexAdapter?: AiProviderAdapter;
}

export function getAiProviderAdapter(
  provider: "codex" = DEFAULT_AI_PROVIDER,
  options: GetAiProviderAdapterOptions = {},
): AiProviderAdapter {
  if (provider === "codex") {
    return options.codexAdapter ?? createCodexHttpProvider();
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}
