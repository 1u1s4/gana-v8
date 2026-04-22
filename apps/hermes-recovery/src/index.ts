import { pathToFileURL } from "node:url";

import { runRecoveryCycle } from "@gana-v8/control-plane-runtime";

export const workspaceInfo = {
  packageName: "@gana-v8/hermes-recovery",
  workspaceName: "hermes-recovery",
  category: "app",
  description: "Summarizes queue health, redrives failed work, and records recovery cycles.",
  dependencies: [{ name: "@gana-v8/control-plane-runtime", category: "workspace" }],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export const runRecoveryService = runRecoveryCycle;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.GANA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("GANA_DATABASE_URL or DATABASE_URL is required");
  }

  const result = await runRecoveryService(databaseUrl);
  console.log(JSON.stringify(result.readModel ?? result.cycle, null, 2));
}
