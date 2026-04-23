CREATE TABLE `RuntimeReleaseSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `refName` VARCHAR(191) NOT NULL,
  `refRole` ENUM('baseline', 'candidate') NOT NULL,
  `evidenceProfile` VARCHAR(191) NOT NULL,
  `gitSha` VARCHAR(191) NOT NULL,
  `baselineRef` VARCHAR(191) NULL,
  `candidateRef` VARCHAR(191) NULL,
  `lookbackHours` INTEGER NOT NULL,
  `lookbackStart` DATETIME(3) NOT NULL,
  `lookbackEnd` DATETIME(3) NOT NULL,
  `fingerprint` VARCHAR(191) NOT NULL,
  `runtimeSignals` JSON NOT NULL,
  `coverage` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `rrs_profile_role_ref_created_idx`
  ON `RuntimeReleaseSnapshot`(`evidenceProfile`, `refRole`, `refName`, `createdAt`);

CREATE INDEX `rrs_profile_role_fingerprint_idx`
  ON `RuntimeReleaseSnapshot`(`evidenceProfile`, `refRole`, `fingerprint`);

CREATE INDEX `rrs_baseline_profile_created_idx`
  ON `RuntimeReleaseSnapshot`(`baselineRef`, `evidenceProfile`, `createdAt`);

CREATE INDEX `rrs_candidate_profile_created_idx`
  ON `RuntimeReleaseSnapshot`(`candidateRef`, `evidenceProfile`, `createdAt`);

CREATE INDEX `RuntimeReleaseSnapshot_createdAt_idx`
  ON `RuntimeReleaseSnapshot`(`createdAt`);
