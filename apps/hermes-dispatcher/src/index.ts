import { pathToFileURL } from "node:url";

import { runDispatcherCycle } from "@gana-v8/control-plane-runtime";

export const workspaceInfo = {
  packageName: "@gana-v8/hermes-dispatcher",
  workspaceName: "hermes-dispatcher",
  category: "app",
  description: "Claims persisted tasks, executes workers, and records dispatcher cycles.",
  dependencies: [{ name: "@gana-v8/control-plane-runtime", category: "workspace" }],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export const runDispatcherService = runDispatcherCycle;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.GANA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("GANA_DATABASE_URL or DATABASE_URL is required");
  }

  const result = await runDispatcherService(databaseUrl);
  console.log(JSON.stringify(result.readModel ?? result.cycle, null, 2));
}
