import { type GetAiProviderAdapterOptions } from "./provider-registry.js";
import type { AiModelCatalogItem, RunHttpAiInput, RunHttpAiResult, RunHttpAiStreamEvent } from "./types.js";
export interface RunHttpAiOptions extends GetAiProviderAdapterOptions {
    readonly modelCatalog?: readonly AiModelCatalogItem[];
}
export declare function listAiModels(provider?: RunHttpAiInput["provider"], options?: RunHttpAiOptions): Promise<readonly AiModelCatalogItem[]>;
export declare function runHttpAi(input: RunHttpAiInput, options?: RunHttpAiOptions): Promise<RunHttpAiResult>;
export declare function streamHttpAi(input: RunHttpAiInput, options?: RunHttpAiOptions): AsyncGenerator<RunHttpAiStreamEvent, RunHttpAiResult, void>;
//# sourceMappingURL=run-http-ai.d.ts.map