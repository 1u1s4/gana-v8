export const workspaceInfo = {
  packageName: "@gana-v8/observability",
  workspaceName: "observability",
  category: "package",
  description: "Structured logging and telemetry scaffolding.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
