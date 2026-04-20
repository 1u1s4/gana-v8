import { PrismaClient } from "@prisma/client";

import { assertSchemaReadiness, type SchemaReadinessOptions } from "./schema-readiness.js";

let globalPrismaClient: PrismaClient | undefined;

export interface CreatePrismaClientOptions {
  readonly databaseUrl?: string | undefined;
  readonly verifySchemaReadiness?: boolean;
  readonly schemaReadiness?: Omit<SchemaReadinessOptions, "schemaPath" | "repoRoot">;
}

export const createPrismaClient = (databaseUrl?: string): PrismaClient =>
  databaseUrl
    ? new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      })
    : new PrismaClient();

export const createVerifiedPrismaClient = (options: CreatePrismaClientOptions = {}): PrismaClient => {
  if (options.verifySchemaReadiness !== false) {
    assertSchemaReadiness({
      ...(options.schemaReadiness ?? {}),
      ...(options.databaseUrl ? { env: { ...(options.schemaReadiness?.env ?? {}), DATABASE_URL: options.databaseUrl } } : {}),
    });
  }

  return createPrismaClient(options.databaseUrl);
};

export const getPrismaClient = (databaseUrl?: string): PrismaClient => {
  if (!globalPrismaClient) {
    globalPrismaClient = createPrismaClient(databaseUrl);
  }

  return globalPrismaClient;
};
