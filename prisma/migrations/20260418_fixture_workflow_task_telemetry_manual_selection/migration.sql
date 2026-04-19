-- AlterTable
ALTER TABLE `Task`
    ADD COLUMN `triggerKind` ENUM('cron', 'manual', 'retry', 'system') NOT NULL DEFAULT 'system',
    ADD COLUMN `dedupeKey` VARCHAR(191) NULL,
    ADD COLUMN `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `lastErrorMessage` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TaskRun`
    ADD COLUMN `workerName` VARCHAR(191) NULL,
    ADD COLUMN `result` JSON NULL,
    ADD COLUMN `retryScheduledFor` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `FixtureWorkflow` (
    `id` VARCHAR(191) NOT NULL,
    `fixtureId` VARCHAR(191) NOT NULL,
    `ingestionStatus` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'blocked') NOT NULL,
    `oddsStatus` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'blocked') NOT NULL,
    `enrichmentStatus` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'blocked') NOT NULL,
    `candidateStatus` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'blocked') NOT NULL,
    `predictionStatus` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'blocked') NOT NULL,
    `parlayStatus` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'blocked') NOT NULL,
    `validationStatus` ENUM('pending', 'running', 'succeeded', 'failed', 'skipped', 'blocked') NOT NULL,
    `isCandidate` BOOLEAN NOT NULL,
    `minDetectedOdd` DOUBLE NULL,
    `qualityScore` DOUBLE NULL,
    `selectionScore` DOUBLE NULL,
    `lastIngestedAt` DATETIME(3) NULL,
    `lastEnrichedAt` DATETIME(3) NULL,
    `lastPredictedAt` DATETIME(3) NULL,
    `lastParlayAt` DATETIME(3) NULL,
    `lastValidatedAt` DATETIME(3) NULL,
    `manualSelectionStatus` ENUM('none', 'selected', 'rejected') NOT NULL DEFAULT 'none',
    `manualSelectionBy` VARCHAR(191) NULL,
    `manualSelectionReason` VARCHAR(191) NULL,
    `manuallySelectedAt` DATETIME(3) NULL,
    `selectionOverride` ENUM('none', 'force-include', 'force-exclude') NOT NULL DEFAULT 'none',
    `overrideReason` VARCHAR(191) NULL,
    `overriddenAt` DATETIME(3) NULL,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `lastErrorMessage` VARCHAR(191) NULL,
    `diagnostics` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FixtureWorkflow_fixtureId_key`(`fixtureId`),
    INDEX `FixtureWorkflow_fixtureId_updatedAt_idx`(`fixtureId`, `updatedAt`),
    INDEX `FixtureWorkflow_predictionStatus_idx`(`predictionStatus`),
    INDEX `FixtureWorkflow_validationStatus_idx`(`validationStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Task_dedupeKey_idx` ON `Task`(`dedupeKey`);

-- AddForeignKey
ALTER TABLE `FixtureWorkflow` ADD CONSTRAINT `FixtureWorkflow_fixtureId_fkey`
FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
