export const workspaceInfo = {
  packageName: "@gana-v8/orchestration-sdk",
  workspaceName: "orchestration-sdk",
  category: "package",
  description: "Shared orchestration contract helpers for control-plane to worker communication.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
