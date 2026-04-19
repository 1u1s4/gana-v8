import { type CodexHttpClient } from "../clients.js";
import type { AiProviderAdapter } from "../types.js";
export interface CreateCodexHttpProviderOptions {
    readonly client?: CodexHttpClient | undefined;
    readonly defaultInstructions?: string | undefined;
}
export declare function createCodexHttpProvider(options?: CreateCodexHttpProviderOptions): AiProviderAdapter;
//# sourceMappingURL=codex-http.d.ts.map