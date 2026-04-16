import { PrismaClient } from "@prisma/client";

let globalPrismaClient: PrismaClient | undefined;

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

export const getPrismaClient = (databaseUrl?: string): PrismaClient => {
  if (!globalPrismaClient) {
    globalPrismaClient = createPrismaClient(databaseUrl);
  }

  return globalPrismaClient;
};
