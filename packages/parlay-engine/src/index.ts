export const workspaceInfo = {
  packageName: "@gana-v8/parlay-engine",
  workspaceName: "parlay-engine",
  category: "package",
  description: "Parlay composition, ranking, and correlation policy placeholders.",
  dependencies: [
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
