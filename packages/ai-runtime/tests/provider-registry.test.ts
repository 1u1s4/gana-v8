import assert from "node:assert/strict";
import test from "node:test";

import {
  createMockCodexClient,
  getAiProviderAdapter,
} from "../src/index.js";
import { createCodexHttpProvider } from "../src/providers/codex-http.js";

test("provider registry resolves codex adapter", () => {
  const adapter = getAiProviderAdapter("codex", {
    codexAdapter: createCodexHttpProvider({
      client: createMockCodexClient(),
    }),
  });
  assert.equal(adapter.provider, "codex");
});

test("mock client supports offline execution", async () => {
  const adapter = createCodexHttpProvider({
    client: createMockCodexClient({ outputText: "offline ok" }),
  });

  const response = await adapter.run({
    provider: "codex",
    webSearchMode: "disabled",
    input: "ping",
  });

  assert.equal(response.outputText, "offline ok");
  assert.equal(response.provider, "codex");
});

test("provider adapter falls back to bundled models when model listing fails", async () => {
  const adapter = createCodexHttpProvider({
    client: {
      ...createMockCodexClient(),
      async listModels() {
        throw new Error("models unavailable");
      },
    },
  });

  const models = await adapter.listModels();
  assert.ok(models.length > 0);
  assert.equal(models[0]?.provider, "codex");
});
