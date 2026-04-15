export const workspaceInfo = {
  packageName: "@gana-v8/research-engine",
  workspaceName: "research-engine",
  category: "package",
  description: "Research orchestration and evidence scoring primitives.",
  dependencies: [
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/research-contracts", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
