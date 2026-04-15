export const workspaceInfo = {
  packageName: "@gana-v8/canonical-pipeline",
  workspaceName: "canonical-pipeline",
  category: "package",
  description: "Normalization scaffolding from raw provider payloads to canonical entities.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/source-connectors", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
