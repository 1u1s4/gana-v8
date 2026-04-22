import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface SchemaReadinessOptions {
  readonly repoRoot?: string;
  readonly schemaPath?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly execFileSyncImpl?: typeof execFileSync;
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
}

const successfulReadinessChecks = new Set<string>();

const resolveRepoRoot = (): string => {
  let current = dirname(fileURLToPath(import.meta.url));

  for (let index = 0; index < 8; index += 1) {
    if (existsSync(join(current, "prisma", "schema.prisma"))) {
      return current;
    }
    current = dirname(current);
  }

  throw new Error("Could not resolve gana-v8 repository root for schema readiness checks");
};

const toOutputText = (error: unknown): string => {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }

  const stdout = "stdout" in error && Buffer.isBuffer(error.stdout) ? error.stdout.toString("utf8") : "";
  const stderr = "stderr" in error && Buffer.isBuffer(error.stderr) ? error.stderr.toString("utf8") : "";
  const message = error instanceof Error ? error.message : String(error);
  return [message, stdout, stderr].filter((part) => part.trim().length > 0).join("\n");
};

const retryableReadinessFragments = [
  "P1001",
  "Can't reach database server",
  "Timed out fetching a new connection from the connection pool",
  "Connection terminated unexpectedly",
  "Connection reset by peer",
  "read ECONNRESET",
  "socket hang up",
  "server has gone away",
] as const;

const isRetryableSchemaReadinessError = (output: string): boolean =>
  retryableReadinessFragments.some((fragment) => output.includes(fragment));

const sleepSync = (delayMs: number): void => {
  if (delayMs <= 0) {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
};

export const assertSchemaReadiness = (options: SchemaReadinessOptions = {}): void => {
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const schemaPath = options.schemaPath ?? join(repoRoot, "prisma", "schema.prisma");
  const execImpl = options.execFileSyncImpl ?? execFileSync;
  const databaseUrl = options.env?.DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  const readinessKey = JSON.stringify([repoRoot, schemaPath, databaseUrl]);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 250);

  if (successfulReadinessChecks.has(readinessKey)) {
    return;
  }

  let lastOutput = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      execImpl(
        "pnpm",
        ["prisma", "migrate", "status", "--schema", schemaPath],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            ...options.env,
          },
          stdio: "pipe",
        },
      );
      successfulReadinessChecks.add(readinessKey);
      return;
    } catch (error) {
      lastOutput = toOutputText(error);
      if (!isRetryableSchemaReadinessError(lastOutput) || attempt >= maxAttempts) {
        break;
      }

      sleepSync(baseDelayMs * attempt);
    }
  }

  throw new Error(
    [
      "Database schema is not ready for gana-v8",
      "Run `pnpm db:migrate:deploy` from the repository root and verify `pnpm prisma migrate status --schema prisma/schema.prisma` returns up to date",
      lastOutput,
    ].join("\n\n"),
  );
};
