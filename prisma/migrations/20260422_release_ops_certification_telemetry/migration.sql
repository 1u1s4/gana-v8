ALTER TABLE `AuditEvent`
  ADD COLUMN `actorType` VARCHAR(191) NULL,
  ADD COLUMN `subjectType` VARCHAR(191) NULL,
  ADD COLUMN `subjectId` VARCHAR(191) NULL,
  ADD COLUMN `action` VARCHAR(191) NULL,
  ADD COLUMN `traceId` VARCHAR(191) NULL,
  ADD COLUMN `correlationId` VARCHAR(191) NULL,
  ADD COLUMN `lineageRefs` JSON NULL;

CREATE INDEX `AuditEvent_subjectType_subjectId_occurredAt_idx` ON `AuditEvent`(`subjectType`, `subjectId`, `occurredAt`);
CREATE INDEX `AuditEvent_traceId_idx` ON `AuditEvent`(`traceId`);
CREATE INDEX `AuditEvent_correlationId_idx` ON `AuditEvent`(`correlationId`);

CREATE TABLE `SandboxCertificationRun` (
  `id` VARCHAR(191) NOT NULL,
  `verificationKind` ENUM('synthetic-integrity', 'runtime-release') NOT NULL,
  `profileName` VARCHAR(191) NOT NULL,
  `packId` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(191) NOT NULL,
  `gitSha` VARCHAR(191) NOT NULL,
  `baselineRef` VARCHAR(191) NULL,
  `candidateRef` VARCHAR(191) NULL,
  `status` ENUM('passed', 'failed') NOT NULL,
  `promotionStatus` ENUM('blocked', 'review-required', 'promotable') NULL,
  `goldenFingerprint` VARCHAR(191) NULL,
  `evidenceFingerprint` VARCHAR(191) NULL,
  `artifactRef` TEXT NULL,
  `runtimeSignals` JSON NOT NULL,
  `diffEntries` JSON NOT NULL,
  `summary` JSON NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `scr_profile_pack_kind_gen_idx`(`profileName`, `packId`, `verificationKind`, `generatedAt`),
  INDEX `scr_kind_status_gen_idx`(`verificationKind`, `status`, `generatedAt`),
  INDEX `SandboxCertificationRun_generatedAt_idx`(`generatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalTelemetryEvent` (
  `id` VARCHAR(191) NOT NULL,
  `kind` ENUM('log', 'span') NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `severity` ENUM('debug', 'info', 'warn', 'error') NOT NULL,
  `traceId` VARCHAR(191) NULL,
  `correlationId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `taskRunId` VARCHAR(191) NULL,
  `automationCycleId` VARCHAR(191) NULL,
  `sandboxCertificationRunId` VARCHAR(191) NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `finishedAt` DATETIME(3) NULL,
  `durationMs` INTEGER NULL,
  `message` TEXT NULL,
  `attributes` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `OperationalTelemetryEvent_name_occurredAt_idx`(`name`, `occurredAt`),
  INDEX `OperationalTelemetryEvent_severity_occurredAt_idx`(`severity`, `occurredAt`),
  INDEX `OperationalTelemetryEvent_traceId_occurredAt_idx`(`traceId`, `occurredAt`),
  INDEX `OperationalTelemetryEvent_taskId_occurredAt_idx`(`taskId`, `occurredAt`),
  INDEX `OperationalTelemetryEvent_taskRunId_occurredAt_idx`(`taskRunId`, `occurredAt`),
  INDEX `OperationalTelemetryEvent_automationCycleId_occurredAt_idx`(`automationCycleId`, `occurredAt`),
  INDEX `ote_scrid_occ_idx`(`sandboxCertificationRunId`, `occurredAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalMetricSample` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('counter', 'gauge', 'histogram') NOT NULL,
  `value` DOUBLE NOT NULL,
  `labels` JSON NOT NULL,
  `traceId` VARCHAR(191) NULL,
  `correlationId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `taskRunId` VARCHAR(191) NULL,
  `automationCycleId` VARCHAR(191) NULL,
  `sandboxCertificationRunId` VARCHAR(191) NULL,
  `recordedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `OperationalMetricSample_name_type_recordedAt_idx`(`name`, `type`, `recordedAt`),
  INDEX `OperationalMetricSample_traceId_recordedAt_idx`(`traceId`, `recordedAt`),
  INDEX `OperationalMetricSample_taskId_recordedAt_idx`(`taskId`, `recordedAt`),
  INDEX `OperationalMetricSample_taskRunId_recordedAt_idx`(`taskRunId`, `recordedAt`),
  INDEX `OperationalMetricSample_automationCycleId_recordedAt_idx`(`automationCycleId`, `recordedAt`),
  INDEX `oms_scrid_rec_idx`(`sandboxCertificationRunId`, `recordedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
