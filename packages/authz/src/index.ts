export const workspaceInfo = {
  packageName: "@gana-v8/authz",
  workspaceName: "authz",
  category: "package",
  description: "Authorization surface scaffolding for internal and external consumers.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
