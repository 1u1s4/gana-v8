export const workspaceInfo = {
  packageName: "@gana-v8/operator-console",
  workspaceName: "operator-console",
  category: "app",
  description: "Internal operations surface placeholder for dashboards, approvals, and incident review.",
  dependencies: [
    { name: "@gana-v8/authz", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
