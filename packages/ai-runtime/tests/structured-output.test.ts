import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  STRICT_JSON_RESPONSE_INSTRUCTIONS,
  parseStructuredJsonObject,
  runStructuredOutput,
} from "../src/structured-output.js";
import { createCodexHttpProvider } from "../src/providers/codex-http.js";
import { createMockCodexClient } from "../src/clients.js";

test("parseStructuredJsonObject handles fenced and trailing JSON text", () => {
  const fenced = parseStructuredJsonObject("```json\n{\"foo\":1}\n```");
  const trailing = parseStructuredJsonObject('{"foo":1}\nextra text');

  assert.deepEqual(fenced, { foo: 1 });
  assert.deepEqual(trailing, { foo: 1 });
});

test("runStructuredOutput parses and validates structured payload", async () => {
  const schema = z.object({
    summary: z.string(),
    confidence: z.number(),
  });

  const result = await runStructuredOutput(
    {
      provider: "codex",
      requestedModel: "gpt-5.4",
      webSearchMode: "disabled",
      input: "return json",
      schema,
      instructions: "Devolvé un resumen.",
    },
    {
      codexAdapter: createCodexHttpProvider({
        client: createMockCodexClient({
          outputText: '```json\n{"summary":"ok","confidence":0.8}\n```',
        }),
      }),
    },
  );

  assert.equal(result.structuredOutput.summary, "ok");
  assert.equal(result.structuredOutput.confidence, 0.8);
  assert.match(STRICT_JSON_RESPONSE_INSTRUCTIONS, /valid JSON object/i);
});
