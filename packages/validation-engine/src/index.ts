export const workspaceInfo = {
  packageName: "@gana-v8/validation-engine",
  workspaceName: "validation-engine",
  category: "package",
  description: "Outcome settlement, scorecards, and retrospective validation primitives.",
  dependencies: [
    { name: "@gana-v8/audit-lineage", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
