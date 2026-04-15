export const workspaceInfo = {
  packageName: "@gana-v8/contract-schemas",
  workspaceName: "contract-schemas",
  category: "package",
  description: "Versioned schema placeholders for events, commands, entities, and views.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
