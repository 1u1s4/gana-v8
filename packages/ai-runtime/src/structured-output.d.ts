import { z } from "zod";
import { type RunHttpAiOptions } from "./run-http-ai.js";
import type { RunHttpAiInput, RunHttpAiResult } from "./types.js";
export declare const STRICT_JSON_RESPONSE_INSTRUCTIONS = "Respond in Spanish when appropriate. Return only a valid JSON object. Do not add markdown fences, prose, or commentary before or after the JSON.";
export declare function parseStructuredJsonObject(text: string): Record<string, unknown>;
export interface RunStructuredOutputInput<TSchema extends z.ZodTypeAny> extends Omit<RunHttpAiInput, "instructions"> {
    readonly schema: TSchema;
    readonly instructions?: string;
}
export interface RunStructuredOutputResult<TSchema extends z.ZodTypeAny> extends RunHttpAiResult {
    readonly structuredOutput: z.infer<TSchema>;
}
export declare function runStructuredOutput<TSchema extends z.ZodTypeAny>(input: RunStructuredOutputInput<TSchema>, options?: RunHttpAiOptions): Promise<RunStructuredOutputResult<TSchema>>;
//# sourceMappingURL=structured-output.d.ts.map