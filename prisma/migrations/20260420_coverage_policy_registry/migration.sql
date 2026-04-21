CREATE TABLE `LeagueCoveragePolicy` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `leagueKey` VARCHAR(191) NOT NULL,
  `leagueName` VARCHAR(191) NOT NULL,
  `season` INTEGER NOT NULL,
  `enabled` BOOLEAN NOT NULL,
  `alwaysOn` BOOLEAN NOT NULL,
  `priority` INTEGER NOT NULL,
  `marketsAllowed` JSON NOT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `LeagueCoveragePolicy_provider_leagueKey_season_key`(`provider`, `leagueKey`, `season`),
  INDEX `LeagueCoveragePolicy_enabled_priority_leagueName_idx`(`enabled`, `priority`, `leagueName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TeamCoveragePolicy` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `teamKey` VARCHAR(191) NOT NULL,
  `teamName` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL,
  `alwaysTrack` BOOLEAN NOT NULL,
  `priority` INTEGER NOT NULL,
  `followHome` BOOLEAN NOT NULL,
  `followAway` BOOLEAN NOT NULL,
  `forceResearch` BOOLEAN NOT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `TeamCoveragePolicy_provider_teamKey_key`(`provider`, `teamKey`),
  INDEX `TeamCoveragePolicy_enabled_priority_teamName_idx`(`enabled`, `priority`, `teamName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DailyAutomationPolicy` (
  `id` VARCHAR(191) NOT NULL,
  `policyName` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL,
  `timezone` VARCHAR(191) NOT NULL,
  `minAllowedOdd` DOUBLE NOT NULL,
  `defaultMaxFixturesPerRun` INTEGER NOT NULL,
  `defaultLookaheadHours` INTEGER NOT NULL,
  `defaultLookbackHours` INTEGER NOT NULL,
  `requireTrackedLeagueOrTeam` BOOLEAN NOT NULL,
  `allowManualInclusionBypass` BOOLEAN NOT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `DailyAutomationPolicy_policyName_key`(`policyName`),
  INDEX `DailyAutomationPolicy_enabled_policyName_idx`(`enabled`, `policyName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
