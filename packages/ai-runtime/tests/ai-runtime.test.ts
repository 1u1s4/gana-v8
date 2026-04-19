import assert from "node:assert/strict";
import test from "node:test";

import {
  AiExecutionError,
  describeWorkspace,
  runHttpAi,
  streamHttpAi,
  workspaceInfo,
} from "../src/index.js";

test("ai-runtime exports workspace helpers and primary runtime symbols", async () => {
  assert.equal(workspaceInfo.packageName, "@gana-v8/ai-runtime");
  assert.equal(describeWorkspace(), "ai-runtime (package)");
  assert.equal(typeof runHttpAi, "function");
  assert.equal(typeof streamHttpAi, "function");
  assert.equal(new AiExecutionError("codex", "boom").provider, "codex");
});
