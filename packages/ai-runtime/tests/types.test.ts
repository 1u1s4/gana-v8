import assert from "node:assert/strict";
import test from "node:test";

import { AiExecutionError } from "../src/errors.js";
import type {
  AiProviderAdapter,
  NormalizedAiResponse,
  RunHttpAiInput,
  RunHttpAiResult,
  RunHttpAiStreamEvent,
} from "../src/types.js";

test("runtime type exports are consumable", () => {
  const input: RunHttpAiInput = {
    provider: "codex",
    webSearchMode: "disabled",
    input: "hola",
  };

  const response: NormalizedAiResponse = {
    provider: "codex",
    backend: "http",
    webSearchMode: "disabled",
    outputText: "ok",
  };

  const result: RunHttpAiResult = {
    provider: "codex",
    resolvedModel: "gpt-5.4",
    resolutionKind: "exact_match",
    webSearchMode: "disabled",
    outputText: "ok",
    latencyMs: 1,
  };

  const event: RunHttpAiStreamEvent = {
    type: "complete",
    provider: "codex",
    response: result,
  };

  const adapter: AiProviderAdapter = {
    provider: "codex",
    async run() {
      return response;
    },
    async *stream() {
      yield event.type === "complete"
        ? { type: "complete", provider: "codex", response }
        : { type: "event", provider: "codex" };
      return response;
    },
    async listModels() {
      return [];
    },
  };

  assert.equal(input.provider, "codex");
  assert.equal(adapter.provider, "codex");
  assert.equal(new AiExecutionError("codex", "x").name, "AiExecutionError");
});
