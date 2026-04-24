ALTER TABLE `Prediction`
  MODIFY `market` ENUM('moneyline', 'totals', 'spread', 'both-teams-score', 'double-chance', 'corners-total', 'corners-h2h') NOT NULL;

CREATE TABLE `FixtureStatisticSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `fixtureId` VARCHAR(191) NULL,
    `providerFixtureId` VARCHAR(191) NOT NULL,
    `providerCode` VARCHAR(191) NOT NULL,
    `statKey` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(32) NOT NULL,
    `valueNumeric` DOUBLE NULL,
    `capturedAt` DATETIME(3) NOT NULL,
    `sourceUpdatedAt` DATETIME(3) NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FixtureStatisticSnapshot_batchId_providerFixtureId_statKey_s_key`(`batchId`, `providerFixtureId`, `statKey`, `scope`),
    INDEX `FixtureStatisticSnapshot_fixtureId_statKey_capturedAt_idx`(`fixtureId`, `statKey`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FixtureStatisticSnapshot` ADD CONSTRAINT `FixtureStatisticSnapshot_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `RawIngestionBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FixtureStatisticSnapshot` ADD CONSTRAINT `FixtureStatisticSnapshot_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
