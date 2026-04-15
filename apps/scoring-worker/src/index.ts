export const workspaceInfo = {
  packageName: "@gana-v8/scoring-worker",
  workspaceName: "scoring-worker",
  category: "app",
  description: "Builds features and prediction artifacts for scheduled scoring runs.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/feature-store", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
