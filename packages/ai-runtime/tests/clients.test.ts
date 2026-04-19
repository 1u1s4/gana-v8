import assert from "node:assert/strict";
import test from "node:test";

import { AiConfigurationError, createCodexHttpClient, createMockCodexClient } from "../src/index.js";

test("mock codex client returns deterministic response payload", async () => {
  const client = createMockCodexClient({ outputText: "hello world" });
  const response = await client.responses({ model: "gpt-5.4" });

  assert.equal(response.outputText, "hello world");
  assert.equal(response.responseState.status, "completed");
});

test("createCodexHttpClient requires credentials", () => {
  assert.throws(
    () => createCodexHttpClient({ apiKey: "" }),
    (error: unknown) => error instanceof AiConfigurationError,
  );
});
