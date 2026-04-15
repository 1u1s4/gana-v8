export const workspaceInfo = {
  packageName: "@gana-v8/domain-core",
  workspaceName: "domain-core",
  category: "package",
  description: "Foundational domain types shared across gains workflows.",
  dependencies: [
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
