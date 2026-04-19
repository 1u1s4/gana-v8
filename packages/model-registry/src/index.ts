export * from "./allowed-models.js";
export * from "./allowed-models-schema.js";
export * from "./model-catalog.js";
export * from "./model-selection.js";
export * from "./prompt-registry.js";
export * from "./template-catalog.js";

export const workspaceInfo = {
  packageName: "@gana-v8/model-registry",
  workspaceName: "model-registry",
  category: "package",
  description: "Operational AI model registry, selection logic, prompt registry, and template catalog.",
  dependencies: [],
};

export function describeWorkspace(): string {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
