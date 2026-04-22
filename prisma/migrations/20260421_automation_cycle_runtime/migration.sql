CREATE TABLE `AutomationCycle` (
  `id` VARCHAR(191) NOT NULL,
  `kind` ENUM('scheduler', 'dispatcher', 'recovery') NOT NULL,
  `status` ENUM('running', 'succeeded', 'failed') NOT NULL,
  `leaseOwner` VARCHAR(191) NOT NULL,
  `summary` JSON NULL,
  `metadata` JSON NULL,
  `error` TEXT NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AutomationCycle_kind_startedAt_idx`(`kind`, `startedAt`),
  INDEX `AutomationCycle_status_startedAt_idx`(`status`, `startedAt`),
  INDEX `AutomationCycle_leaseOwner_startedAt_idx`(`leaseOwner`, `startedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
