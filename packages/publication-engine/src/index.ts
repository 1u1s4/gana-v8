export const workspaceInfo = {
  packageName: "@gana-v8/publication-engine",
  workspaceName: "publication-engine",
  category: "package",
  description: "Formatting and publication readiness placeholders for downstream channels.",
  dependencies: [
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
