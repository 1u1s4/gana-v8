-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."FixtureStatus" AS ENUM ('scheduled', 'live', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."TaskKind" AS ENUM ('fixture-ingestion', 'odds-ingestion', 'research', 'prediction', 'validation', 'sandbox-replay');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."TaskRunStatus" AS ENUM ('running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."AiRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "public"."PredictionStatus" AS ENUM ('draft', 'published', 'settled', 'voided');

-- CreateEnum
CREATE TYPE "public"."PredictionMarket" AS ENUM ('moneyline', 'totals', 'spread', 'both-teams-score');

-- CreateEnum
CREATE TYPE "public"."PredictionOutcome" AS ENUM ('home', 'away', 'draw', 'over', 'under', 'yes', 'no');

-- CreateEnum
CREATE TYPE "public"."ParlayStatus" AS ENUM ('draft', 'ready', 'submitted', 'settled', 'voided');

-- CreateEnum
CREATE TYPE "public"."ParlaySource" AS ENUM ('manual', 'automatic');

-- CreateEnum
CREATE TYPE "public"."ParlayLegStatus" AS ENUM ('pending', 'won', 'lost', 'voided');

-- CreateEnum
CREATE TYPE "public"."ValidationStatus" AS ENUM ('pending', 'passed', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "public"."ValidationKind" AS ENUM ('fixture-result', 'prediction-settlement', 'parlay-settlement', 'sandbox-regression');

-- CreateEnum
CREATE TYPE "public"."ValidationTargetType" AS ENUM ('fixture', 'task', 'task-run', 'ai-run', 'prediction', 'parlay', 'audit-event', 'sandbox-namespace');

-- CreateTable
CREATE TABLE "public"."Fixture" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."FixtureStatus" NOT NULL,
    "scoreHome" INTEGER,
    "scoreAway" INTEGER,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "kind" "public"."TaskKind" NOT NULL,
    "status" "public"."TaskStatus" NOT NULL,
    "priority" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "public"."TaskRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "public"."AiRunStatus" NOT NULL,
    "usagePromptTokens" INTEGER,
    "usageCompletionTokens" INTEGER,
    "usageTotalTokens" INTEGER,
    "outputRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Prediction" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "aiRunId" TEXT,
    "market" "public"."PredictionMarket" NOT NULL,
    "outcome" "public"."PredictionOutcome" NOT NULL,
    "status" "public"."PredictionStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "probabilities" JSONB NOT NULL,
    "rationale" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Parlay" (
    "id" TEXT NOT NULL,
    "status" "public"."ParlayStatus" NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL,
    "source" "public"."ParlaySource" NOT NULL,
    "correlationScore" DOUBLE PRECISION NOT NULL,
    "expectedPayout" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ParlayLeg" (
    "id" TEXT NOT NULL,
    "parlayId" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "market" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "status" "public"."ParlayLegStatus" NOT NULL,

    CONSTRAINT "ParlayLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Validation" (
    "id" TEXT NOT NULL,
    "targetType" "public"."ValidationTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" "public"."ValidationKind" NOT NULL,
    "status" "public"."ValidationStatus" NOT NULL,
    "checks" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fixture_competition_scheduledAt_idx" ON "public"."Fixture"("competition", "scheduledAt");

-- CreateIndex
CREATE INDEX "Task_status_createdAt_idx" ON "public"."Task"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TaskRun_taskId_startedAt_idx" ON "public"."TaskRun"("taskId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRun_taskId_attemptNumber_key" ON "public"."TaskRun"("taskId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AiRun_taskId_createdAt_idx" ON "public"."AiRun"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Prediction_fixtureId_createdAt_idx" ON "public"."Prediction"("fixtureId", "createdAt");

-- CreateIndex
CREATE INDEX "Prediction_aiRunId_idx" ON "public"."Prediction"("aiRunId");

-- CreateIndex
CREATE INDEX "ParlayLeg_predictionId_idx" ON "public"."ParlayLeg"("predictionId");

-- CreateIndex
CREATE INDEX "ParlayLeg_fixtureId_idx" ON "public"."ParlayLeg"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "ParlayLeg_parlayId_index_key" ON "public"."ParlayLeg"("parlayId", "index");

-- CreateIndex
CREATE INDEX "Validation_targetType_targetId_createdAt_idx" ON "public"."Validation"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_aggregateType_aggregateId_occurredAt_idx" ON "public"."AuditEvent"("aggregateType", "aggregateId", "occurredAt");

-- AddForeignKey
ALTER TABLE "public"."TaskRun" ADD CONSTRAINT "TaskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiRun" ADD CONSTRAINT "AiRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Prediction" ADD CONSTRAINT "Prediction_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "public"."Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Prediction" ADD CONSTRAINT "Prediction_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "public"."AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParlayLeg" ADD CONSTRAINT "ParlayLeg_parlayId_fkey" FOREIGN KEY ("parlayId") REFERENCES "public"."Parlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParlayLeg" ADD CONSTRAINT "ParlayLeg_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "public"."Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParlayLeg" ADD CONSTRAINT "ParlayLeg_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "public"."Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

