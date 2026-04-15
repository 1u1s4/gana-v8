export const workspaceInfo = {
  packageName: "@gana-v8/audit-lineage",
  workspaceName: "audit-lineage",
  category: "package",
  description: "Traceability primitives for workflows, artifacts, and operator actions.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
