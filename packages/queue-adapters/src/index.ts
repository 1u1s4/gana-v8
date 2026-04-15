export const workspaceInfo = {
  packageName: "@gana-v8/queue-adapters",
  workspaceName: "queue-adapters",
  category: "package",
  description: "Queue transport placeholders for background workflow dispatch.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
