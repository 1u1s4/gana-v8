export const workspaceInfo = {
  packageName: "@gana-v8/research-worker",
  workspaceName: "research-worker",
  category: "app",
  description: "Executes research swarms and evidence synthesis tasks.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/research-contracts", category: "workspace" },
    { name: "@gana-v8/research-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
