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

const smokeTargets = [
  "@gana-v8/control-plane-runtime",
  "@gana-v8/hermes-scheduler",
  "@gana-v8/hermes-dispatcher",
  "@gana-v8/hermes-recovery",
];

for (const target of smokeTargets) {
  execFileSync(
    pnpmBin,
    [
      "--filter",
      target,
      "test",
    ],
    {
      cwd: process.cwd(),
      env: runtimeEnv,
      stdio: "inherit",
    },
  );
}
