import { setTimeout as sleep } from "node:timers/promises";

import prismaClientPkg from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

import { assertSchemaReadiness, type SchemaReadinessOptions } from "./schema-readiness.js";

const { PrismaClient } = prismaClientPkg as {
  PrismaClient: new (options?: object) => PrismaClientType;
};

let globalPrismaClient: PrismaClientType | undefined;

export interface CreatePrismaClientOptions {
  readonly databaseUrl?: string | undefined;
  readonly verifySchemaReadiness?: boolean;
  readonly schemaReadiness?: Omit<SchemaReadinessOptions, "schemaPath" | "repoRoot">;
}

export interface PrismaConnectRetryOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
}

export const createPrismaClient = (databaseUrl?: string): PrismaClientType =>
  databaseUrl
    ? new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      })
    : new PrismaClient();

export const createVerifiedPrismaClient = (options: CreatePrismaClientOptions = {}): PrismaClientType => {
  if (options.verifySchemaReadiness !== false) {
    assertSchemaReadiness({
      ...(options.schemaReadiness ?? {}),
      ...(options.databaseUrl ? { env: { ...(options.schemaReadiness?.env ?? {}), DATABASE_URL: options.databaseUrl } } : {}),
    });
  }

  return createPrismaClient(options.databaseUrl);
};

const retryableConnectionErrorFragments = [
  "Can't reach database server",
  "Timed out fetching a new connection from the connection pool",
  "Connection terminated unexpectedly",
  "Connection reset by peer",
  "read ECONNRESET",
  "socket hang up",
  "server has gone away",
  "Engine is not yet connected",
  "Response from the Engine was empty",
] as const;

const readErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;

export const isRetryablePrismaConnectionError = (error: unknown): boolean => {
  const code = readErrorCode(error);
  if (code === "P1001") {
    return true;
  }

  const message = error instanceof Error ? error.message : "";
  return retryableConnectionErrorFragments.some((fragment) => message.includes(fragment));
};

export const connectPrismaClientWithRetry = async <TClient extends Pick<PrismaClientType, "$connect" | "$disconnect">>(
  client: TClient,
  options: PrismaConnectRetryOptions = {},
): Promise<TClient> => {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 250);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.$connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.$disconnect().catch(() => undefined);

      if (!isRetryablePrismaConnectionError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to connect Prisma client.");
};

export interface CreateConnectedPrismaClientOptions extends CreatePrismaClientOptions {
  readonly connectRetry?: PrismaConnectRetryOptions;
}

export interface PrismaReadRetryOptions {
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
}

export const createConnectedVerifiedPrismaClient = async (
  options: CreateConnectedPrismaClientOptions = {},
): Promise<PrismaClientType> => {
  const client = createVerifiedPrismaClient(options);
  try {
    await connectPrismaClientWithRetry(client, options.connectRetry);
    await retryPrismaReadOperation(() => client.$queryRawUnsafe("SELECT 1"));
    return client;
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    throw error;
  }
};

export const retryPrismaReadOperation = async <T>(
  operation: () => Promise<T>,
  options: PrismaReadRetryOptions = {},
): Promise<T> => {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(50, options.baseDelayMs ?? 250);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryablePrismaConnectionError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to complete Prisma read operation.");
};

export const getPrismaClient = (databaseUrl?: string): PrismaClientType => {
  if (!globalPrismaClient) {
    globalPrismaClient = createPrismaClient(databaseUrl);
  }

  return globalPrismaClient;
};
