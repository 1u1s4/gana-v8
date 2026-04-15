import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const workspacePath = resolve(process.argv[2] ?? ".");
const packageJson = JSON.parse(await readFile(resolve(workspacePath, "package.json"), "utf8"));
const distEntry = resolve(workspacePath, "dist", "index.js");
await access(distEntry);
const module = await import(pathToFileURL(distEntry).href);
if (module.workspaceInfo?.packageName !== packageJson.name) {
  throw new Error(`workspaceInfo.packageName mismatch for ${packageJson.name}`);
}
if (!Array.isArray(module.workspaceInfo?.dependencies)) {
  throw new Error(`workspaceInfo.dependencies should be an array for ${packageJson.name}`);
}
console.log(`test ok: ${packageJson.name}`);
