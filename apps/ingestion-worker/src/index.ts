export const workspaceInfo = {
  packageName: "@gana-v8/ingestion-worker",
  workspaceName: "ingestion-worker",
  category: "app",
  description: "Runs connectors, landing jobs, and normalization checkpoints.",
  dependencies: [
    { name: "@gana-v8/canonical-pipeline", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/source-connectors", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
