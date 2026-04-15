export const workspaceInfo = {
  packageName: "@gana-v8/feature-store",
  workspaceName: "feature-store",
  category: "package",
  description: "Feature vector contracts and snapshot assembly placeholders.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
