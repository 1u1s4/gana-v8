export const workspaceInfo = {
  packageName: "@gana-v8/publisher-worker",
  workspaceName: "publisher-worker",
  category: "app",
  description: "Applies publication policy and fan-out distribution adapters.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/publication-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
