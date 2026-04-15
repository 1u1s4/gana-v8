export const workspaceInfo = {
  packageName: "@gana-v8/testing-fixtures",
  workspaceName: "testing-fixtures",
  category: "package",
  description: "Shared fixture builders and deterministic test data placeholders.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
