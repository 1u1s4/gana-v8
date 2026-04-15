export const workspaceInfo = {
  packageName: "@gana-v8/storage-adapters",
  workspaceName: "storage-adapters",
  category: "package",
  description: "Storage interface placeholders for object stores and databases.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
