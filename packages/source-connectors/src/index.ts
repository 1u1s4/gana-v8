export const workspaceInfo = {
  packageName: "@gana-v8/source-connectors",
  workspaceName: "source-connectors",
  category: "package",
  description: "Provider connector interface scaffolding for fixture, odds, and result feeds.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/contract-schemas", category: "workspace" }
  ]
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export * from "./models/raw.js";
export * from "./idempotency.js";
export * from "./clients/api-football.js";
export * from "./clients/football-api.js";
export * from "./jobs/ingest-availability-window.js";
export * from "./jobs/ingest-fixtures-window.js";
export * from "./jobs/ingest-lineups-window.js";
export * from "./jobs/ingest-odds-window.js";
export * from "./testing/fakes.js";
