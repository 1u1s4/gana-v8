import { pathToFileURL } from "node:url";

import { runSchedulerCycle } from "@gana-v8/control-plane-runtime";

export const workspaceInfo = {
  packageName: "@gana-v8/hermes-scheduler",
  workspaceName: "hermes-scheduler",
  category: "app",
  description: "Persists scheduler automation cycles and enqueues runtime work.",
  dependencies: [{ name: "@gana-v8/control-plane-runtime", category: "workspace" }],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export const runSchedulerService = runSchedulerCycle;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.GANA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("GANA_DATABASE_URL or DATABASE_URL is required");
  }

  const result = await runSchedulerService(databaseUrl);
  console.log(JSON.stringify(result.readModel ?? result.cycle, null, 2));
}
