export const workspaceInfo = {
  packageName: "@gana-v8/dev-cli",
  workspaceName: "dev-cli",
  category: "package",
  description: "Developer utility entrypoints for local bootstrap, replay, and smoke commands.",
  dependencies: [
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/testing-fixtures", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
