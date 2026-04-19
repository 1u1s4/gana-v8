export * from "./clients.js";
export * from "./errors.js";
export * from "./provider-registry.js";
export * from "./run-http-ai.js";
export * from "./structured-output.js";
export * from "./types.js";
export * from "./providers/codex-http.js";

export const workspaceInfo = {
  packageName: "@gana-v8/ai-runtime",
  workspaceName: "ai-runtime",
  category: "package",
  description: "Reusable HTTP AI runtime with provider registry, model selection, streaming, and structured output.",
  dependencies: [{ name: "@gana-v8/model-registry", category: "workspace" }],
};

export function describeWorkspace(): string {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
