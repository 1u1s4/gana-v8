import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ALLOWED_CODEX_MODEL,
  buildAiModelCatalog,
  describeWorkspace,
  getFallbackModelCatalog,
  renderPrompt,
  resolveModelSelection,
  resolvePromptDefinition,
  workspaceInfo,
} from "../src/index.js";

test("model registry exports workspace info", () => {
  assert.equal(workspaceInfo.packageName, "@gana-v8/model-registry");
  assert.equal(describeWorkspace(), "model-registry (package)");
});

test("fallback catalog is populated and stable", () => {
  const fallbackCatalog = getFallbackModelCatalog("codex");

  assert.ok(fallbackCatalog.length > 0);
  assert.equal(fallbackCatalog[0]?.id, DEFAULT_ALLOWED_CODEX_MODEL);
  assert.ok(fallbackCatalog.every((model) => model.provider === "codex"));
});

test("model selection resolves requested model and reasoning deterministically", () => {
  const catalog = buildAiModelCatalog();
  const selection = resolveModelSelection({
    provider: "codex",
    requestedModel: "gpt-5.4-mini",
    requestedReasoning: "high",
    catalog,
  });

  assert.equal(selection.resolvedModel, "gpt-5.4-mini");
  assert.equal(selection.resolvedReasoning, "high");
  assert.equal(selection.resolutionKind, "exact_match");
});

test("prompt registry resolves a known research prompt and renders it", () => {
  const prompt = resolvePromptDefinition("research.fixture-analysis");
  const rendered = renderPrompt(
    "research.fixture-analysis",
    {
      context: "Fixture: Team A vs Team B",
      outputContract: '{"summary": string}',
    },
    prompt.version,
  );

  assert.equal(prompt.scope, "research");
  assert.match(prompt.version, /^v/);
  assert.match(rendered.systemPrompt, /analista deportivo/i);
  assert.match(rendered.userPrompt, /Fixture: Team A vs Team B/);
});
