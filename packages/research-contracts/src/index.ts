export const workspaceInfo = {
  packageName: "@gana-v8/research-contracts",
  workspaceName: "research-contracts",
  category: "package",
  description: "Explicit types for research prompts, evidence bundles, and synthesis outputs.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
