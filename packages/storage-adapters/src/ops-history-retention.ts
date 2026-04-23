import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createAuditEvent } from "@gana-v8/domain-core";

import { createConnectedVerifiedPrismaClient } from "./prisma/client.js";
import { createPrismaUnitOfWork, type StorageUnitOfWork } from "./unit-of-work.js";

export const OPS_HISTORY_RETENTION_DAYS = 90;
export const OPS_HISTORY_RETENTION_REPORT_DIR = ".artifacts/ops-history-retention";

export type OpsHistoryRetentionMode = "dry-run" | "apply";

export interface OpsHistoryRetentionReport {
  readonly schemaVersion: 1;
  readonly mode: OpsHistoryRetentionMode;
  readonly generatedAt: string;
  readonly cutoff: string;
  readonly retentionDays: number;
  readonly sandboxCertificationRuns: Awaited<
    ReturnType<StorageUnitOfWork["sandboxCertificationRuns"]["pruneBefore"]>
  >;
  readonly telemetryEvents: Awaited<
    ReturnType<StorageUnitOfWork["telemetryEvents"]["pruneBefore"]>
  >;
  readonly metricSamples: Awaited<
    ReturnType<StorageUnitOfWork["metricSamples"]["pruneBefore"]>
  >;
  readonly totals: {
    readonly prunableCount: number;
    readonly deletedCount: number;
  };
  readonly auditEventId?: string;
  readonly reportPath?: string;
}

export interface RunOpsHistoryRetentionOptions {
  readonly unitOfWork: Pick<
    StorageUnitOfWork,
    "auditEvents" | "sandboxCertificationRuns" | "telemetryEvents" | "metricSamples"
  >;
  readonly mode: OpsHistoryRetentionMode;
  readonly now?: Date;
  readonly retentionDays?: number;
  readonly reportDirectory?: string;
  readonly mkdirImpl?: typeof mkdir;
  readonly writeFileImpl?: typeof writeFile;
  readonly auditEventIdFactory?: () => string;
}

const sanitizeTimestampForFilename = (value: string): string =>
  value.replaceAll(":", "-");

export const createOpsHistoryRetentionCutoff = (
  now: Date,
  retentionDays = OPS_HISTORY_RETENTION_DAYS,
): string => new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

export const parseOpsHistoryRetentionMode = (
  args: readonly string[],
): OpsHistoryRetentionMode => {
  const supportedArgs = new Set(["--apply", "--dry-run"]);
  const unexpectedArgs = args.filter((arg) => !supportedArgs.has(arg));
  if (unexpectedArgs.length > 0) {
    throw new Error(`Unsupported arguments: ${unexpectedArgs.join(", ")}`);
  }

  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  if (apply && dryRun) {
    throw new Error("Choose either --dry-run or --apply, not both.");
  }

  return apply ? "apply" : "dry-run";
};

export const runOpsHistoryRetention = async (
  options: RunOpsHistoryRetentionOptions,
): Promise<OpsHistoryRetentionReport> => {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const retentionDays = options.retentionDays ?? OPS_HISTORY_RETENTION_DAYS;
  const cutoff = createOpsHistoryRetentionCutoff(now, retentionDays);
  const dryRun = options.mode !== "apply";

  const [sandboxCertificationRuns, telemetryEvents, metricSamples] = await Promise.all([
    options.unitOfWork.sandboxCertificationRuns.pruneBefore({ cutoff, dryRun }),
    options.unitOfWork.telemetryEvents.pruneBefore({ cutoff, dryRun }),
    options.unitOfWork.metricSamples.pruneBefore({ cutoff, dryRun }),
  ]);

  const totals = {
    prunableCount:
      sandboxCertificationRuns.prunableCount +
      telemetryEvents.prunableCount +
      metricSamples.prunableCount,
    deletedCount:
      sandboxCertificationRuns.deletedCount +
      telemetryEvents.deletedCount +
      metricSamples.deletedCount,
  };

  if (dryRun) {
    return {
      schemaVersion: 1,
      mode: "dry-run",
      generatedAt,
      cutoff,
      retentionDays,
      sandboxCertificationRuns,
      telemetryEvents,
      metricSamples,
      totals,
    };
  }

  const reportDirectory =
    options.reportDirectory ??
    path.join(process.cwd(), OPS_HISTORY_RETENTION_REPORT_DIR);
  const reportPath = path.join(
    reportDirectory,
    `${sanitizeTimestampForFilename(generatedAt)}.json`,
  );
  const auditEventId =
    options.auditEventIdFactory?.() ??
    `audit:ops-history-retention:${generatedAt}:${randomUUID()}`;

  await options.unitOfWork.auditEvents.save(
    createAuditEvent({
      id: auditEventId,
      aggregateType: "ops-history-retention",
      aggregateId: generatedAt,
      eventType: "ops-history-retention.applied",
      actor: "ops-history-retention",
      actorType: "system",
      subjectType: "ops-history-retention",
      subjectId: generatedAt,
      action: "prune",
      payload: {
        cutoff,
        retentionDays,
        reportPath,
        deletedCounts: {
          sandboxCertificationRuns: sandboxCertificationRuns.deletedCount,
          telemetryEvents: telemetryEvents.deletedCount,
          metricSamples: metricSamples.deletedCount,
        },
        prunableCounts: {
          sandboxCertificationRuns: sandboxCertificationRuns.prunableCount,
          telemetryEvents: telemetryEvents.prunableCount,
          metricSamples: metricSamples.prunableCount,
        },
        preservedLatestSandboxCertificationRuns:
          sandboxCertificationRuns.preservedLatestCount,
      },
      occurredAt: generatedAt,
    }),
  );

  const report: OpsHistoryRetentionReport = {
    schemaVersion: 1,
    mode: "apply",
    generatedAt,
    cutoff,
    retentionDays,
    sandboxCertificationRuns,
    telemetryEvents,
    metricSamples,
    totals,
    auditEventId,
    reportPath,
  };

  await (options.mkdirImpl ?? mkdir)(reportDirectory, { recursive: true });
  await (options.writeFileImpl ?? writeFile)(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  return report;
};

export const runOpsHistoryRetentionCli = async (
  args: readonly string[] = process.argv.slice(2),
): Promise<OpsHistoryRetentionReport> => {
  const mode = parseOpsHistoryRetentionMode(args);
  const client = await createConnectedVerifiedPrismaClient();

  try {
    const report = await runOpsHistoryRetention({
      unitOfWork: createPrismaUnitOfWork(client),
      mode,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await client.$disconnect();
  }
};
