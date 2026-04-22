ALTER TABLE `Task`
  ADD COLUMN `manifestId` VARCHAR(191) NULL,
  ADD COLUMN `workflowId` VARCHAR(191) NULL,
  ADD COLUMN `traceId` VARCHAR(191) NULL,
  ADD COLUMN `correlationId` VARCHAR(191) NULL,
  ADD COLUMN `source` VARCHAR(191) NULL,
  ADD COLUMN `leaseOwner` VARCHAR(191) NULL,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `claimedAt` DATETIME(3) NULL,
  ADD COLUMN `lastHeartbeatAt` DATETIME(3) NULL,
  ADD COLUMN `activeTaskRunId` VARCHAR(191) NULL;

UPDATE `Task`
SET
  `manifestId` = COALESCE(`manifestId`, JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.manifestId'))),
  `workflowId` = COALESCE(`workflowId`, JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.workflowId'))),
  `traceId` = COALESCE(`traceId`, JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.traceId'))),
  `correlationId` = COALESCE(`correlationId`, JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.correlationId'))),
  `source` = COALESCE(`source`, JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.source')));

UPDATE `Task`
SET
  `activeTaskRunId` = COALESCE(
    `activeTaskRunId`,
    (
      SELECT `tr`.`id`
      FROM `TaskRun` AS `tr`
      WHERE `tr`.`taskId` = `Task`.`id`
      ORDER BY `tr`.`attemptNumber` DESC
      LIMIT 1
    )
  ),
  `claimedAt` = COALESCE(
    `claimedAt`,
    (
      SELECT `tr`.`startedAt`
      FROM `TaskRun` AS `tr`
      WHERE `tr`.`taskId` = `Task`.`id`
      ORDER BY `tr`.`attemptNumber` DESC
      LIMIT 1
    ),
    `updatedAt`
  ),
  `lastHeartbeatAt` = COALESCE(
    `lastHeartbeatAt`,
    (
      SELECT `tr`.`updatedAt`
      FROM `TaskRun` AS `tr`
      WHERE `tr`.`taskId` = `Task`.`id`
      ORDER BY `tr`.`attemptNumber` DESC
      LIMIT 1
    ),
    `updatedAt`
  ),
  `leaseOwner` = COALESCE(`leaseOwner`, 'migration:legacy-running'),
  `leaseExpiresAt` = COALESCE(
    `leaseExpiresAt`,
    DATE_ADD(
      COALESCE(
        (
          SELECT `tr`.`updatedAt`
          FROM `TaskRun` AS `tr`
          WHERE `tr`.`taskId` = `Task`.`id`
          ORDER BY `tr`.`attemptNumber` DESC
          LIMIT 1
        ),
        `updatedAt`
      ),
      INTERVAL 5 MINUTE
    )
  )
WHERE `status` = 'running';

CREATE INDEX `Task_status_leaseExpiresAt_idx` ON `Task`(`status`, `leaseExpiresAt`);
CREATE INDEX `Task_manifestId_createdAt_idx` ON `Task`(`manifestId`, `createdAt`);
CREATE INDEX `Task_workflowId_createdAt_idx` ON `Task`(`workflowId`, `createdAt`);
CREATE INDEX `Task_traceId_idx` ON `Task`(`traceId`);
CREATE INDEX `Task_correlationId_idx` ON `Task`(`correlationId`);
CREATE INDEX `Task_activeTaskRunId_idx` ON `Task`(`activeTaskRunId`);

CREATE TABLE `SchedulerCursor` (
  `id` VARCHAR(191) NOT NULL,
  `specId` VARCHAR(191) NOT NULL,
  `lastTriggeredAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SchedulerCursor_specId_key`(`specId`),
  INDEX `SchedulerCursor_lastTriggeredAt_idx`(`lastTriggeredAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
