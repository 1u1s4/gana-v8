export const workspaceInfo = {
  packageName: "@gana-v8/policy-engine",
  workspaceName: "policy-engine",
  category: "package",
  description: "Risk gates, approval states, and publication policy contracts.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
