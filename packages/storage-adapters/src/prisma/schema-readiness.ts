import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface SchemaReadinessOptions {
  readonly repoRoot?: string;
  readonly schemaPath?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly execFileSyncImpl?: typeof execFileSync;
}

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

export const assertSchemaReadiness = (options: SchemaReadinessOptions = {}): void => {
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const schemaPath = options.schemaPath ?? join(repoRoot, "prisma", "schema.prisma");
  const execImpl = options.execFileSyncImpl ?? execFileSync;

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
  } catch (error) {
    const output = toOutputText(error);
    throw new Error(
      [
        "Database schema is not ready for gana-v8",
        "Run `pnpm db:migrate:deploy` from the repository root and verify `pnpm prisma migrate status --schema prisma/schema.prisma` returns up to date",
        output,
      ].join("\n\n"),
    );
  }
};
