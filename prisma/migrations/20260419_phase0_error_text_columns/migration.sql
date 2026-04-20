-- AlterTable
ALTER TABLE `FixtureWorkflow`
  MODIFY COLUMN `lastErrorMessage` TEXT NULL;

-- AlterTable
ALTER TABLE `Task`
  MODIFY COLUMN `lastErrorMessage` TEXT NULL;

-- AlterTable
ALTER TABLE `TaskRun`
  MODIFY COLUMN `error` TEXT NULL;

-- AlterTable
ALTER TABLE `AiRun`
  MODIFY COLUMN `error` TEXT NULL,
  MODIFY COLUMN `fallbackReason` TEXT NULL;

-- AlterTable
ALTER TABLE `Validation`
  MODIFY COLUMN `summary` TEXT NOT NULL;
