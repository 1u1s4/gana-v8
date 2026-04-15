-- CreateEnum
CREATE TYPE "public"."Environment" AS ENUM ('prod', 'staging', 'sandbox');

-- CreateTable
CREATE TABLE "public"."SandboxNamespace" (
    "id" TEXT NOT NULL,
    "environment" "public"."Environment" NOT NULL,
    "sandboxId" TEXT,
    "scope" TEXT NOT NULL,
    "storagePrefix" TEXT NOT NULL,
    "queuePrefix" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxNamespace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SandboxNamespace_environment_sandboxId_scope_key" ON "public"."SandboxNamespace"("environment", "sandboxId", "scope");

-- CreateIndex
CREATE INDEX "SandboxNamespace_environment_createdAt_idx" ON "public"."SandboxNamespace"("environment", "createdAt");
