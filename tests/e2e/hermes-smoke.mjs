import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = process.cwd();

const loadDotEnv = async () => {
  try {
    const envFile = await readFile(resolve(rootDir, ".env"), "utf8");
    for (const line of envFile.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
};

await loadDotEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run tests/e2e/hermes-smoke.mjs");
}

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const smokeRunId = `hermes-smoke-${process.pid}-${Date.now()}`;
const smokeNow = "2100-01-02T00:01:00.000Z";
const serviceCycleCount = 2;
const serviceDeadlineMs = 45_000;
const stopDeadlineMs = 7_500;
const maxLogLines = 160;
const runtimeEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "test",
  GANA_RUNTIME_PROFILE: process.env.GANA_RUNTIME_PROFILE ?? "ci-smoke",
  GANA_DATABASE_URL: process.env.GANA_DATABASE_URL ?? process.env.DATABASE_URL,
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

const quoteCommand = (command, args) =>
  [command, ...args].map((part) => (part.includes(" ") ? JSON.stringify(part) : part)).join(" ");

class HermesServiceProcess {
  constructor(spec) {
    this.spec = spec;
    this.events = [];
    this.stdoutRemainder = "";
    this.stderrRemainder = "";
    this.logs = [];
    this.waiters = [];
    this.exited = false;
    this.exitCode = null;
    this.exitSignal = null;
    this.child = spawn(pnpmBin, spec.args, {
      cwd: process.cwd(),
      env: runtimeEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.exitPromise = new Promise((resolve) => {
      this.child.once("exit", (code, signal) => {
        this.exited = true;
        this.exitCode = code;
        this.exitSignal = signal;
        this.flushRemainders();
        this.resolveWaiters();
        resolve({ code, signal });
      });
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.stdoutRemainder = this.consumeLines("stdout", this.stdoutRemainder + chunk);
    });
    this.child.stderr.on("data", (chunk) => {
      this.stderrRemainder = this.consumeLines("stderr", this.stderrRemainder + chunk);
    });
  }

  consumeLines(stream, text) {
    const lines = text.split(/\r?\n/);
    const remainder = lines.pop() ?? "";
    for (const line of lines) {
      this.recordLine(stream, line);
    }

    return remainder;
  }

  flushRemainders() {
    if (this.stdoutRemainder.length > 0) {
      this.recordLine("stdout", this.stdoutRemainder);
      this.stdoutRemainder = "";
    }
    if (this.stderrRemainder.length > 0) {
      this.recordLine("stderr", this.stderrRemainder);
      this.stderrRemainder = "";
    }
  }

  recordLine(stream, line) {
    if (line.length === 0) {
      return;
    }

    this.logs.push({ stream, line });
    if (this.logs.length > maxLogLines) {
      this.logs.shift();
    }

    if (stream !== "stdout") {
      return;
    }

    try {
      const event = JSON.parse(line);
      if (event && event.service === this.spec.service && typeof event.event === "string") {
        this.events.push(event);
        this.resolveWaiters();
      }
    } catch {
      // Keep non-JSON stdout in diagnostics; service evidence is JSONL.
    }
  }

  waitFor(predicate, description, timeoutMs = serviceDeadlineMs) {
    const existing = predicate(this.events);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.reject !== reject);
        reject(new Error(`Timed out waiting for ${this.spec.service} ${description}\n${this.diagnostics()}`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timeout });
      this.resolveWaiters();
    });
  }

  resolveWaiters() {
    const pending = [];
    for (const waiter of this.waiters) {
      const result = waiter.predicate(this.events);
      if (result) {
        clearTimeout(waiter.timeout);
        waiter.resolve(result);
      } else if (this.exited) {
        clearTimeout(waiter.timeout);
        waiter.reject(
          new Error(
            `${this.spec.service} exited before expected evidence was observed\n${this.diagnostics()}`,
          ),
        );
      } else {
        pending.push(waiter);
      }
    }
    this.waiters = pending;
  }

  diagnostics() {
    const header = [
      `service=${this.spec.service}`,
      `command=${quoteCommand(pnpmBin, this.spec.args)}`,
      `pid=${this.child.pid ?? "unknown"}`,
      `exitCode=${this.exitCode ?? "running"}`,
      `exitSignal=${this.exitSignal ?? "none"}`,
    ].join(" ");
    const logLines = this.logs
      .map((entry) => `[${entry.stream}] ${entry.line}`)
      .join("\n");

    return `${header}\n${logLines || "(no output captured)"}`;
  }

  async stop() {
    if (this.exited) {
      return await this.exitPromise;
    }

    this.child.kill("SIGTERM");
    const stopped = await Promise.race([
      this.exitPromise,
      new Promise((resolve) => {
        setTimeout(() => resolve(null), stopDeadlineMs);
      }),
    ]);

    if (stopped) {
      return stopped;
    }

    this.child.kill("SIGKILL");
    return await this.exitPromise;
  }
}

const completedCycles = (events) =>
  events.filter((event) => event.event === "hermes.cycle.completed");

const eventNamed = (name) => (events) =>
  events.find((event) => event.event === name);

const atLeastCompletedCycles = (count) => (events) => {
  const cycles = completedCycles(events);
  return cycles.length >= count ? cycles : undefined;
};

const validateCycleEvidence = (service, cycles) => {
  if (cycles.length < serviceCycleCount) {
    throw new Error(`${service} observed ${cycles.length} completed cycle(s), expected ${serviceCycleCount}`);
  }

  for (const cycle of cycles) {
    if (typeof cycle.cycleId !== "string" || !cycle.cycleId.startsWith(`automation-cycle:${service.split("-")[1]}:`)) {
      throw new Error(`${service} emitted invalid cycle evidence: ${JSON.stringify(cycle)}`);
    }
    if (cycle.status !== "succeeded" && cycle.status !== "failed") {
      throw new Error(`${service} emitted invalid cycle status: ${JSON.stringify(cycle)}`);
    }
  }
};

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

const serviceSpecs = [
  {
    service: "hermes-scheduler",
    args: [
      "exec",
      "tsx",
      "--tsconfig",
      "tsconfig.base.json",
      "apps/hermes-scheduler/src/index.ts",
      "--service",
      "--interval-ms",
      "250",
      "--max-cycles",
      String(serviceCycleCount),
      "--cycle-timeout-ms",
      "20000",
      "--now",
      smokeNow,
      "--fixture-id",
      `${smokeRunId}:no-fixture`,
    ],
  },
  {
    service: "hermes-dispatcher",
    args: [
      "exec",
      "tsx",
      "--tsconfig",
      "tsconfig.base.json",
      "apps/hermes-dispatcher/src/index.ts",
      "--service",
      "--interval-ms",
      "250",
      "--max-cycles",
      String(serviceCycleCount),
      "--cycle-timeout-ms",
      "20000",
      "--now",
      smokeNow,
      "--manifest-id",
      `${smokeRunId}:empty-manifest`,
      "--max-claims",
      "1",
    ],
  },
  {
    service: "hermes-recovery",
    args: [
      "exec",
      "tsx",
      "--tsconfig",
      "tsconfig.base.json",
      "apps/hermes-recovery/src/index.ts",
      "--service",
      "--interval-ms",
      "250",
      "--max-cycles",
      String(serviceCycleCount),
      "--cycle-timeout-ms",
      "20000",
      "--now",
      smokeNow,
      "--redrive-limit",
      "0",
      "--lease-recovery-limit",
      "0",
    ],
  },
];

const services = serviceSpecs.map((spec) => new HermesServiceProcess(spec));

try {
  await Promise.all(
    services.map((service) =>
      service.waitFor(eventNamed("hermes.service.ready"), "readiness"),
    ),
  );

  const cyclesByService = await Promise.all(
    services.map((service) =>
      service.waitFor(
        atLeastCompletedCycles(serviceCycleCount),
        `${serviceCycleCount} completed cycles`,
      ),
    ),
  );

  for (const [index, cycles] of cyclesByService.entries()) {
    validateCycleEvidence(services[index].spec.service, cycles);
  }

  await Promise.all(
    services.map((service) =>
      service.waitFor(eventNamed("hermes.service.stopped"), "clean stop event"),
    ),
  );

  const exits = await Promise.all(services.map((service) => service.exitPromise));
  for (const [index, exit] of exits.entries()) {
    if (exit.code !== 0) {
      throw new Error(`${services[index].spec.service} exited non-zero\n${services[index].diagnostics()}`);
    }
  }

  for (const service of services) {
    const cycles = completedCycles(service.events);
    console.log(
      `live smoke ok: ${service.spec.service} cycles=${cycles.length} ids=${cycles
        .map((cycle) => cycle.cycleId)
        .join(",")}`,
    );
  }
} finally {
  await Promise.allSettled(services.map((service) => service.stop()));
}
