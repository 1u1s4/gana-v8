import { z } from "zod";

import { runHttpAi, type RunHttpAiOptions } from "./run-http-ai.js";
import type { RunHttpAiInput, RunHttpAiResult } from "./types.js";

const LEADING_FENCED_JSON_BLOCK_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```/i;

export const STRICT_JSON_RESPONSE_INSTRUCTIONS =
  "Respond in Spanish when appropriate. Return only a valid JSON object. Do not add markdown fences, prose, or commentary before or after the JSON.";

function parseStructuredJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractLeadingJsonObject(text: string): string | null {
  const candidate = text.trimStart();
  if (!candidate.startsWith("{")) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(0, index + 1);
      }
    }
  }

  return null;
}

function extractCandidateJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("AI response is empty.");
  }

  const fencedMatch = trimmed.match(LEADING_FENCED_JSON_BLOCK_PATTERN);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

export function parseStructuredJsonObject(text: string): Record<string, unknown> {
  const candidate = extractCandidateJson(text);

  try {
    const parsed = parseStructuredJson(candidate);
    if (!isJsonObject(parsed)) {
      throw new Error("AI response did not return a valid JSON object.");
    }
    return parsed;
  } catch (error) {
    const leadingJsonObject = extractLeadingJsonObject(candidate);
    if (!leadingJsonObject || leadingJsonObject === candidate) {
      throw error;
    }

    const parsed = parseStructuredJson(leadingJsonObject);
    if (!isJsonObject(parsed)) {
      throw new Error("AI response did not return a valid JSON object.");
    }
    return parsed;
  }
}

export interface RunStructuredOutputInput<TSchema extends z.ZodTypeAny>
  extends Omit<RunHttpAiInput, "instructions"> {
  readonly schema: TSchema;
  readonly instructions?: string;
}

export interface RunStructuredOutputResult<TSchema extends z.ZodTypeAny>
  extends RunHttpAiResult {
  readonly structuredOutput: z.infer<TSchema>;
}

export async function runStructuredOutput<TSchema extends z.ZodTypeAny>(
  input: RunStructuredOutputInput<TSchema>,
  options: RunHttpAiOptions = {},
): Promise<RunStructuredOutputResult<TSchema>> {
  const result = await runHttpAi(
    {
      ...input,
      instructions: input.instructions
        ? `${input.instructions}\n\n${STRICT_JSON_RESPONSE_INSTRUCTIONS}`
        : STRICT_JSON_RESPONSE_INSTRUCTIONS,
    },
    options,
  );

  const parsed = parseStructuredJsonObject(result.outputText);
  return {
    ...result,
    structuredOutput: input.schema.parse(parsed),
  };
}
