export const workspaceInfo = {
  packageName: "@gana-v8/model-registry",
  workspaceName: "model-registry",
  category: "package",
  description: "Model metadata and release channel registry placeholders.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
