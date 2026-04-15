import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspacePath = resolve(process.argv[2] ?? ".");
const packageJson = JSON.parse(await readFile(resolve(workspacePath, "package.json"), "utf8"));
const requiredScripts = ["build", "lint", "test", "typecheck"];
const missingScripts = requiredScripts.filter((script) => !packageJson.scripts?.[script]);
if (missingScripts.length > 0) {
  throw new Error(`${packageJson.name} is missing scripts: ${missingScripts.join(", ")}`);
}
if (!packageJson.exports?.["."]?.import) {
  throw new Error(`${packageJson.name} is missing an ESM export target`);
}
if (!packageJson.files?.includes("dist")) {
  throw new Error(`${packageJson.name} should publish its dist directory`);
}
console.log(`lint ok: ${packageJson.name}`);
