import { execFileSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run tests/e2e/hermes-smoke.mjs");
}

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const runtimeEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "test",
  GANA_RUNTIME_PROFILE: process.env.GANA_RUNTIME_PROFILE ?? "ci-smoke",
};

const runPnpm = (...args) => {
  execFileSync(
    pnpmBin,
    args,
    {
      cwd: process.cwd(),
      env: runtimeEnv,
      stdio: "inherit",
    },
  );
};

runPnpm("--filter", "@gana-v8/control-plane-runtime", "test");

const hermesApps = [
  ["hermes-scheduler", "@gana-v8/hermes-scheduler"],
  ["hermes-dispatcher", "@gana-v8/hermes-dispatcher"],
  ["hermes-recovery", "@gana-v8/hermes-recovery"],
];

for (const [workspaceName, packageName] of hermesApps) {
  runPnpm("exec", "tsc", "-p", `apps/${workspaceName}/tsconfig.build.json`);
  runPnpm(
    "exec",
    "tsx",
    "--tsconfig",
    "tsconfig.base.json",
    "--eval",
    `import('./apps/${workspaceName}/src/index.ts').then((module) => {
      if (module.workspaceInfo?.packageName !== '${packageName}') throw new Error('workspaceInfo.packageName mismatch');
      if (!Array.isArray(module.workspaceInfo?.dependencies)) throw new Error('workspaceInfo.dependencies should be an array');
      console.log('test ok: ${packageName}');
    })`,
  );
}
