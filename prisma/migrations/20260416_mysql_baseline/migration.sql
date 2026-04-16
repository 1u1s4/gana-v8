-- CreateTable
CREATE TABLE `Fixture` (
    `id` VARCHAR(191) NOT NULL,
    `sport` VARCHAR(191) NOT NULL,
    `competition` VARCHAR(191) NOT NULL,
    `homeTeam` VARCHAR(191) NOT NULL,
    `awayTeam` VARCHAR(191) NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `status` ENUM('scheduled', 'live', 'completed', 'cancelled') NOT NULL,
    `scoreHome` INTEGER NULL,
    `scoreAway` INTEGER NULL,
    `metadata` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Fixture_competition_scheduledAt_idx`(`competition`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('fixture-ingestion', 'odds-ingestion', 'research', 'prediction', 'validation', 'sandbox-replay') NOT NULL,
    `status` ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled') NOT NULL,
    `priority` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `scheduledFor` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Task_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskRun` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `attemptNumber` INTEGER NOT NULL,
    `status` ENUM('running', 'succeeded', 'failed', 'cancelled') NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskRun_taskId_startedAt_idx`(`taskId`, `startedAt`),
    UNIQUE INDEX `TaskRun_taskId_attemptNumber_key`(`taskId`, `attemptNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiRun` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `promptVersion` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'running', 'completed', 'failed') NOT NULL,
    `usagePromptTokens` INTEGER NULL,
    `usageCompletionTokens` INTEGER NULL,
    `usageTotalTokens` INTEGER NULL,
    `outputRef` VARCHAR(191) NULL,
    `error` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiRun_taskId_createdAt_idx`(`taskId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Prediction` (
    `id` VARCHAR(191) NOT NULL,
    `fixtureId` VARCHAR(191) NOT NULL,
    `aiRunId` VARCHAR(191) NULL,
    `market` ENUM('moneyline', 'totals', 'spread', 'both-teams-score') NOT NULL,
    `outcome` ENUM('home', 'away', 'draw', 'over', 'under', 'yes', 'no') NOT NULL,
    `status` ENUM('draft', 'published', 'settled', 'voided') NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `probabilities` JSON NOT NULL,
    `rationale` JSON NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Prediction_fixtureId_createdAt_idx`(`fixtureId`, `createdAt`),
    INDEX `Prediction_aiRunId_idx`(`aiRunId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Parlay` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('draft', 'ready', 'submitted', 'settled', 'voided') NOT NULL,
    `stake` DOUBLE NOT NULL,
    `source` ENUM('manual', 'automatic') NOT NULL,
    `correlationScore` DOUBLE NOT NULL,
    `expectedPayout` DOUBLE NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParlayLeg` (
    `id` VARCHAR(191) NOT NULL,
    `parlayId` VARCHAR(191) NOT NULL,
    `predictionId` VARCHAR(191) NOT NULL,
    `fixtureId` VARCHAR(191) NOT NULL,
    `index` INTEGER NOT NULL,
    `market` VARCHAR(191) NOT NULL,
    `outcome` VARCHAR(191) NOT NULL,
    `price` DOUBLE NOT NULL,
    `status` ENUM('pending', 'won', 'lost', 'voided') NOT NULL,

    INDEX `ParlayLeg_predictionId_idx`(`predictionId`),
    INDEX `ParlayLeg_fixtureId_idx`(`fixtureId`),
    UNIQUE INDEX `ParlayLeg_parlayId_index_key`(`parlayId`, `index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Validation` (
    `id` VARCHAR(191) NOT NULL,
    `targetType` ENUM('fixture', 'task', 'task-run', 'ai-run', 'prediction', 'parlay', 'audit-event', 'sandbox-namespace') NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `kind` ENUM('fixture-result', 'prediction-settlement', 'parlay-settlement', 'sandbox-regression') NOT NULL,
    `status` ENUM('pending', 'passed', 'failed', 'partial') NOT NULL,
    `checks` JSON NOT NULL,
    `summary` VARCHAR(191) NOT NULL,
    `executedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Validation_targetType_targetId_createdAt_idx`(`targetType`, `targetId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `aggregateType` VARCHAR(191) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `actor` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AuditEvent_aggregateType_aggregateId_occurredAt_idx`(`aggregateType`, `aggregateId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SandboxNamespace` (
    `id` VARCHAR(191) NOT NULL,
    `environment` ENUM('prod', 'staging', 'sandbox') NOT NULL,
    `sandboxId` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NOT NULL,
    `storagePrefix` VARCHAR(191) NOT NULL,
    `queuePrefix` VARCHAR(191) NOT NULL,
    `metadata` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SandboxNamespace_environment_createdAt_idx`(`environment`, `createdAt`),
    UNIQUE INDEX `SandboxNamespace_environment_sandboxId_scope_key`(`environment`, `sandboxId`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaskRun` ADD CONSTRAINT `TaskRun_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiRun` ADD CONSTRAINT `AiRun_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prediction` ADD CONSTRAINT `Prediction_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prediction` ADD CONSTRAINT `Prediction_aiRunId_fkey` FOREIGN KEY (`aiRunId`) REFERENCES `AiRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParlayLeg` ADD CONSTRAINT `ParlayLeg_parlayId_fkey` FOREIGN KEY (`parlayId`) REFERENCES `Parlay`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParlayLeg` ADD CONSTRAINT `ParlayLeg_predictionId_fkey` FOREIGN KEY (`predictionId`) REFERENCES `Prediction`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParlayLeg` ADD CONSTRAINT `ParlayLeg_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `Fixture`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

