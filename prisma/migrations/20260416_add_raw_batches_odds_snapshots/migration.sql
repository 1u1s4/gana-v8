-- CreateTable
CREATE TABLE `RawIngestionBatch` (
    `id` VARCHAR(191) NOT NULL,
    `providerCode` VARCHAR(191) NOT NULL,
    `endpointFamily` VARCHAR(191) NOT NULL,
    `sourceName` VARCHAR(191) NOT NULL,
    `sourceEndpoint` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NOT NULL,
    `schemaVersion` VARCHAR(191) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL,
    `extractionTime` DATETIME(3) NOT NULL,
    `coverageWindowStart` DATETIME(3) NOT NULL,
    `coverageWindowEnd` DATETIME(3) NOT NULL,
    `coverageGranularity` VARCHAR(191) NOT NULL,
    `checksum` VARCHAR(191) NOT NULL,
    `extractionStatus` VARCHAR(191) NOT NULL,
    `warnings` JSON NOT NULL,
    `sourceQualityScore` DOUBLE NOT NULL,
    `recordCount` INTEGER NOT NULL,
    `rawObjectRefs` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RawIngestionBatch_providerCode_endpointFamily_extractionTime_idx`(`providerCode`, `endpointFamily`, `extractionTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OddsSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `fixtureId` VARCHAR(191) NULL,
    `providerFixtureId` VARCHAR(191) NOT NULL,
    `providerCode` VARCHAR(191) NOT NULL,
    `bookmakerKey` VARCHAR(191) NOT NULL,
    `marketKey` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OddsSnapshot_fixtureId_capturedAt_idx`(`fixtureId`, `capturedAt`),
    UNIQUE INDEX `OddsSnapshot_batchId_providerFixtureId_bookmakerKey_marketKe_key`(`batchId`, `providerFixtureId`, `bookmakerKey`, `marketKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OddsSelectionSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `oddsSnapshotId` VARCHAR(191) NOT NULL,
    `index` INTEGER NOT NULL,
    `selectionKey` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `priceDecimal` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OddsSelectionSnapshot_selectionKey_idx`(`selectionKey`),
    UNIQUE INDEX `OddsSelectionSnapshot_oddsSnapshotId_index_key`(`oddsSnapshotId`, `index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OddsSnapshot` ADD CONSTRAINT `OddsSnapshot_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `RawIngestionBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OddsSnapshot` ADD CONSTRAINT `OddsSnapshot_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OddsSelectionSnapshot` ADD CONSTRAINT `OddsSelectionSnapshot_oddsSnapshotId_fkey` FOREIGN KEY (`oddsSnapshotId`) REFERENCES `OddsSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

