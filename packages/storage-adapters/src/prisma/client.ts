import { PrismaClient } from "@prisma/client";

let globalPrismaClient: PrismaClient | undefined;

export const createPrismaClient = (): PrismaClient => new PrismaClient();

export const getPrismaClient = (): PrismaClient => {
  if (!globalPrismaClient) {
    globalPrismaClient = createPrismaClient();
  }

  return globalPrismaClient;
};
