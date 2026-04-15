export const workspaceInfo = {
  packageName: "@gana-v8/public-api",
  workspaceName: "public-api",
  category: "app",
  description: "Stable API boundary for picks, fixtures, and readiness data.",
  dependencies: [
    { name: "@gana-v8/authz", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
