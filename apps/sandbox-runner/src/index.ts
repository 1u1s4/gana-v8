export const workspaceInfo = {
  packageName: "@gana-v8/sandbox-runner",
  workspaceName: "sandbox-runner",
  category: "app",
  description: "Isolated sandbox execution entrypoint for replay and experiment workflows.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/dev-cli", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/testing-fixtures", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
