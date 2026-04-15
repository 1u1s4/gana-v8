export const workspaceInfo = {
  packageName: "@gana-v8/source-connectors",
  workspaceName: "source-connectors",
  category: "package",
  description: "Provider connector interface scaffolding for fixture, odds, and result feeds.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
