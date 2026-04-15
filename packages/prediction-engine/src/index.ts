export const workspaceInfo = {
  packageName: "@gana-v8/prediction-engine",
  workspaceName: "prediction-engine",
  category: "package",
  description: "Prediction artifact scaffolding and scoring surface contracts.",
  dependencies: [
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/feature-store", category: "workspace" },
    { name: "@gana-v8/model-registry", category: "workspace" }
  ],
};

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}
