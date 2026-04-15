export const workspaceInfo = {
  packageName: "@gana-v8/canonical-pipeline",
  workspaceName: "canonical-pipeline",
  category: "package",
  description: "Normalization scaffolding from raw provider payloads to canonical entities.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/contract-schemas", category: "workspace" },
    { name: "@gana-v8/source-connectors", category: "workspace" }
  ]
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export * from "./models/canonical.js";
export * from "./repositories/in-memory.js";
export * from "./canonicalize.js";
export * from "./smoke-runner.js";
