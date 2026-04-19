import assert from "node:assert/strict";
import test from "node:test";

import { runHttpAi, streamHttpAi } from "../src/run-http-ai.js";
import { createCodexHttpProvider } from "../src/providers/codex-http.js";
import { createMockCodexClient } from "../src/clients.js";

test("runHttpAi resolves model selection using model-registry", async () => {
  const result = await runHttpAi(
    {
      provider: "codex",
      requestedModel: "gpt-5.4-mini",
      requestedReasoning: "high",
      webSearchMode: "disabled",
      input: "decime hola",
    },
    {
      codexAdapter: createCodexHttpProvider({
        client: createMockCodexClient({ outputText: "hola" }),
      }),
    },
  );

  assert.equal(result.requestedModel, "gpt-5.4-mini");
  assert.equal(result.resolvedModel, "gpt-5.4-mini");
  assert.equal(result.outputText, "hola");
  assert.equal(result.resolutionKind, "exact_match");
});

test("runHttpAi falls back to bundled catalog when provider model listing fails", async () => {
  const adapter = createCodexHttpProvider({
    client: {
      ...createMockCodexClient({ outputText: "fallback ok" }),
      async listModels() {
        throw new Error("upstream unavailable");
      },
    },
  });

  const result = await runHttpAi(
    {
      provider: "codex",
      requestedModel: "not-allowed-model",
      requestedReasoning: "medium",
      webSearchMode: "disabled",
      input: "ping",
    },
    { codexAdapter: adapter },
  );

  assert.equal(result.resolvedModel, "gpt-5.4");
  assert.equal(result.outputText, "fallback ok");
});

test("streamHttpAi emits selection, delta, event and complete", async () => {
  const events: string[] = [];
  const stream = streamHttpAi(
    {
      provider: "codex",
      requestedModel: "gpt-5.4",
      webSearchMode: "disabled",
      input: "stream",
    },
    {
      codexAdapter: createCodexHttpProvider({
        client: createMockCodexClient({
          eventSequence: [
            { type: "response.output_text.delta", delta: "ho" },
            { type: "custom.telemetry", foo: "bar" },
            {
              type: "response.output_text.delta",
              delta: "la",
              response: { id: "resp_1", status: "in_progress", model: "gpt-5.4" },
            },
            {
              type: "response.completed",
              response: { id: "resp_1", status: "completed", model: "gpt-5.4" },
            },
          ],
        }),
      }),
    },
  );

  let completedText = "";
  for await (const event of stream) {
    events.push(event.type);
    if (event.type === "complete") {
      completedText = event.response.outputText;
    }
  }

  assert.deepEqual(events, ["selection", "delta", "event", "delta", "event", "complete"]);
  assert.equal(completedText, "hola");
});
