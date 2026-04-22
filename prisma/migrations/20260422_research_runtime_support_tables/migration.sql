CREATE TABLE `ResearchBundle` (
  `id` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL,
  `gatedAt` DATETIME(3) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `briefHeadline` VARCHAR(191) NOT NULL,
  `briefContext` TEXT NOT NULL,
  `briefQuestions` JSON NOT NULL,
  `briefAssumptions` JSON NOT NULL,
  `summary` TEXT NOT NULL,
  `recommendedLean` VARCHAR(191) NOT NULL,
  `directionalScore` JSON NOT NULL,
  `risks` JSON NOT NULL,
  `gateReasons` JSON NOT NULL,
  `trace` JSON NULL,
  `aiRunId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ResearchBundle_fixtureId_generatedAt_idx`(`fixtureId`, `generatedAt`),
  INDEX `ResearchBundle_status_generatedAt_idx`(`status`, `generatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ResearchSource` (
  `id` VARCHAR(191) NOT NULL,
  `bundleId` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `reference` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NULL,
  `url` TEXT NULL,
  `admissibility` VARCHAR(191) NOT NULL,
  `independenceKey` VARCHAR(191) NOT NULL,
  `capturedAt` DATETIME(3) NOT NULL,
  `publishedAt` DATETIME(3) NULL,
  `freshnessExpiresAt` DATETIME(3) NULL,
  `metadata` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ResearchSource_bundleId_capturedAt_idx`(`bundleId`, `capturedAt`),
  INDEX `ResearchSource_fixtureId_admissibility_idx`(`fixtureId`, `admissibility`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ResearchClaim` (
  `id` VARCHAR(191) NOT NULL,
  `bundleId` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NOT NULL,
  `assignmentId` VARCHAR(191) NULL,
  `kind` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `summary` TEXT NOT NULL,
  `direction` VARCHAR(191) NOT NULL,
  `confidence` DOUBLE NOT NULL,
  `impact` DOUBLE NOT NULL,
  `significance` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `corroborationStatus` VARCHAR(191) NOT NULL,
  `requiredSourceCount` INTEGER NOT NULL,
  `matchedSourceIds` JSON NOT NULL,
  `freshnessWindowHours` INTEGER NOT NULL,
  `extractedAt` DATETIME(3) NOT NULL,
  `freshnessExpiresAt` DATETIME(3) NULL,
  `metadata` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ResearchClaim_bundleId_kind_idx`(`bundleId`, `kind`),
  INDEX `ResearchClaim_fixtureId_extractedAt_idx`(`fixtureId`, `extractedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ResearchClaimSource` (
  `id` VARCHAR(191) NOT NULL,
  `claimId` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `orderIndex` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ResearchClaimSource_sourceId_idx`(`sourceId`),
  UNIQUE INDEX `ResearchClaimSource_claimId_sourceId_key`(`claimId`, `sourceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ResearchConflict` (
  `id` VARCHAR(191) NOT NULL,
  `bundleId` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NOT NULL,
  `claimIds` JSON NOT NULL,
  `summary` TEXT NOT NULL,
  `severity` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `resolutionNote` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ResearchConflict_bundleId_severity_idx`(`bundleId`, `severity`),
  INDEX `ResearchConflict_fixtureId_status_idx`(`fixtureId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FeatureSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NOT NULL,
  `bundleId` VARCHAR(191) NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL,
  `bundleStatus` VARCHAR(191) NOT NULL,
  `gateReasons` JSON NOT NULL,
  `recommendedLean` VARCHAR(191) NOT NULL,
  `evidenceCount` INTEGER NOT NULL,
  `topEvidence` JSON NOT NULL,
  `risks` JSON NOT NULL,
  `features` JSON NOT NULL,
  `readinessStatus` VARCHAR(191) NOT NULL,
  `readinessReasons` JSON NOT NULL,
  `researchTrace` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `FeatureSnapshot_fixtureId_generatedAt_idx`(`fixtureId`, `generatedAt`),
  INDEX `FeatureSnapshot_bundleId_generatedAt_idx`(`bundleId`, `generatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AvailabilitySnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NULL,
  `providerFixtureId` VARCHAR(191) NOT NULL,
  `providerCode` VARCHAR(191) NOT NULL,
  `teamSide` VARCHAR(32) NULL,
  `subjectType` VARCHAR(32) NOT NULL,
  `subjectName` VARCHAR(128) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `capturedAt` DATETIME(3) NOT NULL,
  `sourceUpdatedAt` DATETIME(3) NULL,
  `summary` TEXT NOT NULL,
  `payload` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `AvailabilitySnapshot_fixtureId_capturedAt_idx`(`fixtureId`, `capturedAt`),
  UNIQUE INDEX `AvailabilitySnapshot_batchId_providerFixtureId_teamSide_subj_key`(`batchId`, `providerFixtureId`, `teamSide`, `subjectType`, `subjectName`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LineupSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NULL,
  `providerFixtureId` VARCHAR(191) NOT NULL,
  `providerCode` VARCHAR(191) NOT NULL,
  `teamSide` VARCHAR(32) NOT NULL,
  `lineupStatus` VARCHAR(64) NOT NULL,
  `formation` VARCHAR(191) NULL,
  `capturedAt` DATETIME(3) NOT NULL,
  `sourceUpdatedAt` DATETIME(3) NULL,
  `payload` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `LineupSnapshot_fixtureId_capturedAt_idx`(`fixtureId`, `capturedAt`),
  UNIQUE INDEX `LineupSnapshot_batchId_providerFixtureId_teamSide_lineupStat_key`(`batchId`, `providerFixtureId`, `teamSide`, `lineupStatus`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LineupParticipant` (
  `id` VARCHAR(191) NOT NULL,
  `lineupSnapshotId` VARCHAR(191) NOT NULL,
  `index` INTEGER NOT NULL,
  `participantName` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `position` VARCHAR(191) NULL,
  `jerseyNumber` INTEGER NULL,
  `availabilityStatus` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `LineupParticipant_participantName_idx`(`participantName`),
  UNIQUE INDEX `LineupParticipant_lineupSnapshotId_index_key`(`lineupSnapshotId`, `index`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ResearchAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `fixtureId` VARCHAR(191) NOT NULL,
  `bundleId` VARCHAR(191) NULL,
  `dimension` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `attemptNumber` INTEGER NOT NULL,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `error` TEXT NULL,
  `outputSummary` TEXT NULL,
  `metadata` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ResearchAssignment_fixtureId_createdAt_idx`(`fixtureId`, `createdAt`),
  INDEX `ResearchAssignment_bundleId_dimension_idx`(`bundleId`, `dimension`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ResearchBundle`
  ADD CONSTRAINT `ResearchBundle_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ResearchBundle_aiRunId_fkey`
  FOREIGN KEY (`aiRunId`) REFERENCES `AiRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ResearchSource`
  ADD CONSTRAINT `ResearchSource_bundleId_fkey`
  FOREIGN KEY (`bundleId`) REFERENCES `ResearchBundle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ResearchSource_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ResearchClaim`
  ADD CONSTRAINT `ResearchClaim_bundleId_fkey`
  FOREIGN KEY (`bundleId`) REFERENCES `ResearchBundle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ResearchClaim_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ResearchClaim_assignmentId_fkey`
  FOREIGN KEY (`assignmentId`) REFERENCES `ResearchAssignment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ResearchClaimSource`
  ADD CONSTRAINT `ResearchClaimSource_claimId_fkey`
  FOREIGN KEY (`claimId`) REFERENCES `ResearchClaim`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ResearchClaimSource_sourceId_fkey`
  FOREIGN KEY (`sourceId`) REFERENCES `ResearchSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ResearchConflict`
  ADD CONSTRAINT `ResearchConflict_bundleId_fkey`
  FOREIGN KEY (`bundleId`) REFERENCES `ResearchBundle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ResearchConflict_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `FeatureSnapshot`
  ADD CONSTRAINT `FeatureSnapshot_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `FeatureSnapshot_bundleId_fkey`
  FOREIGN KEY (`bundleId`) REFERENCES `ResearchBundle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AvailabilitySnapshot`
  ADD CONSTRAINT `AvailabilitySnapshot_batchId_fkey`
  FOREIGN KEY (`batchId`) REFERENCES `RawIngestionBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `AvailabilitySnapshot_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `LineupSnapshot`
  ADD CONSTRAINT `LineupSnapshot_batchId_fkey`
  FOREIGN KEY (`batchId`) REFERENCES `RawIngestionBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `LineupSnapshot_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `LineupParticipant`
  ADD CONSTRAINT `LineupParticipant_lineupSnapshotId_fkey`
  FOREIGN KEY (`lineupSnapshotId`) REFERENCES `LineupSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ResearchAssignment`
  ADD CONSTRAINT `ResearchAssignment_fixtureId_fkey`
  FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ResearchAssignment_bundleId_fkey`
  FOREIGN KEY (`bundleId`) REFERENCES `ResearchBundle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
