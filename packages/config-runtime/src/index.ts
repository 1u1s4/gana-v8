export const workspaceInfo = {
  packageName: "@gana-v8/config-runtime",
  workspaceName: "config-runtime",
  category: "package",
  description: "Runtime configuration loading and environment profile scaffolding.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
