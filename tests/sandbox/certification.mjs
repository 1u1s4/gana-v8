import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const goldensRoot = resolve(rootDir, "fixtures/replays/goldens");
const artifactsRoot = resolve(rootDir, ".artifacts/sandbox-certification");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const listJsonFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolutePath);
    }
  }

  return files;
};

await mkdir(artifactsRoot, { recursive: true });

execFileSync(
  pnpmBin,
  ["--filter", "@gana-v8/sandbox-runner", "build"],
  {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  },
);

const sandboxRunnerModule = await import(
  pathToFileURL(resolve(rootDir, "apps/sandbox-runner/dist/index.js")).href
);

const goldenPaths = (await listJsonFiles(goldensRoot)).sort();
if (goldenPaths.length === 0) {
  throw new Error(`No sandbox goldens found under ${goldensRoot}`);
}

const gitSha = process.env.SANDBOX_CERT_GIT_SHA ?? process.env.GITHUB_SHA ?? "local-cert-sha";
const certificationNow = process.env.SANDBOX_CERT_NOW
  ? new Date(process.env.SANDBOX_CERT_NOW)
  : undefined;

const failures = [];

for (const goldenPath of goldenPaths) {
  const golden = JSON.parse(await readFile(goldenPath, "utf8"));
  if (golden.schemaVersion !== "sandbox-golden-v1") {
    throw new Error(`Unsupported sandbox golden schema in ${goldenPath}`);
  }

  const artifactPath = resolve(
    artifactsRoot,
    golden.profileName,
    `${golden.fixturePackId}.evidence.json`,
  );
  await mkdir(dirname(artifactPath), { recursive: true });

  const result = await sandboxRunnerModule.certifySandboxRun({
    mode: golden.mode,
    profileName: golden.profileName,
    packId: golden.fixturePackId,
    gitSha,
    ...(certificationNow ? { now: certificationNow } : {}),
    goldenPath,
    artifactPath,
  });

  const goldenLabel = relative(rootDir, goldenPath);
  console.log(
    `[sandbox-certification] ${result.status.toUpperCase()} ${goldenLabel} (${result.diff.entryCount} diff entr${result.diff.entryCount === 1 ? "y" : "ies"})`,
  );

  if (result.status === "failed") {
    for (const entry of result.diff.entries.slice(0, 10)) {
      console.log(
        `  - ${entry.kind.toUpperCase()} ${entry.path}: expected=${JSON.stringify(entry.expected)} actual=${JSON.stringify(entry.actual)}`,
      );
    }
    failures.push(goldenLabel);
  }
}

if (failures.length > 0) {
  throw new Error(
    `Sandbox certification failed for ${failures.length} golden pack(s): ${failures.join(", ")}`,
  );
}

console.log(`[sandbox-certification] Passed ${goldenPaths.length} golden certification run(s).`);
