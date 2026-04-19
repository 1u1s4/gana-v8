-- AlterTable
ALTER TABLE `AiRun`
  ADD COLUMN `providerRequestId` VARCHAR(191) NULL,
  ADD COLUMN `fallbackReason` VARCHAR(191) NULL,
  ADD COLUMN `degraded` BOOLEAN NULL;
