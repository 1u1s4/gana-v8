export const workspaceInfo = {
  packageName: "@gana-v8/validation-worker",
  workspaceName: "validation-worker",
  category: "app",
  description: "Settles outcomes, calibration jobs, and retrospective validation workflows.",
  dependencies: [
    { name: "@gana-v8/audit-lineage", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/validation-engine", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
