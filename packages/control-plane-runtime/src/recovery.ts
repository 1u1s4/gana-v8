import { createAutomationCycle } from "@gana-v8/domain-core";
import {
  createPrismaUnitOfWork,
  createConnectedVerifiedPrismaClient,
} from "@gana-v8/storage-adapters";

import {
  assessQueueHealth,
  createRuntimeQueue,
  cycleId,
  DEFAULT_RECOVERY_LEASE_RECOVERY_LIMIT,
  DEFAULT_RECOVERY_RENEW_LEASE_MS,
  dedupeStrings,
  defaultLeaseOwner,
  fixtureIdFromTask,
  hasExpiredTaskLease,
  loadAutomationCycleReadModelSafely,
  taskLeaseDeadline,
  toIso,
  type RecoveryCycleOptions,
  type RuntimeCycleResult,
  updateCycle,
} from "./shared.js";

export const runRecoveryCycle = async (
  databaseUrl: string,
  options: RecoveryCycleOptions = {},
): Promise<RuntimeCycleResult> => {
  const now = options.now ?? new Date();
  const leaseOwner = options.leaseOwner ?? defaultLeaseOwner("recovery");
  const redriveLimit = Math.max(0, options.redriveLimit ?? 3);
  const leaseRecoveryLimit = Math.max(
    0,
    options.leaseRecoveryLimit ?? Math.max(redriveLimit, DEFAULT_RECOVERY_LEASE_RECOVERY_LIMIT),
  );
  const renewLeaseMs = Math.max(30_000, options.renewLeaseMs ?? DEFAULT_RECOVERY_RENEW_LEASE_MS);
  const client = await createConnectedVerifiedPrismaClient({ databaseUrl });
  let recoveryCycle: ReturnType<typeof createAutomationCycle> | null = null;
  let partialSummary: ReturnType<typeof createAutomationCycle>["summary"] | undefined;
  let partialMetadata: Record<string, unknown> | undefined;

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const queue = createRuntimeQueue(client, unitOfWork);
    recoveryCycle = await unitOfWork.automationCycles.save(
      createAutomationCycle({
        id: cycleId("recovery", now),
        kind: "recovery",
        status: "running",
        leaseOwner,
        startedAt: toIso(now),
        summary: {
          source: "hermes-recovery",
          fixtureIds: [],
          taskIds: [],
          stages: [],
        },
      }),
    );

    const tasksBefore = await unitOfWork.tasks.list();
    const queueSummaryBefore = await queue.summary();
    const queueHealthBefore = assessQueueHealth(queueSummaryBefore, tasksBefore, now);
    const expiredLeaseCandidates = tasksBefore
      .filter((task) => hasExpiredTaskLease(task, now))
      .sort((left, right) => {
        const leftDeadline = taskLeaseDeadline(left) ?? left.updatedAt;
        const rightDeadline = taskLeaseDeadline(right) ?? right.updatedAt;
        return leftDeadline.localeCompare(rightDeadline);
      })
      .slice(0, leaseRecoveryLimit);

    const recoveredLeaseTaskIds: string[] = [];
    const renewedLeaseTaskIds: string[] = [];
    const redrivenTaskIds: string[] = [];
    const quarantinedTaskIds: string[] = [];
    const manualReviewTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];
    const recoveryErrors: string[] = [];
    const recoveryActions: Array<Record<string, unknown>> = [];

    for (const expiredTask of expiredLeaseCandidates) {
      try {
        const claim = await queue.claim(expiredTask.id, now);
        if (!claim) {
          skippedTaskIds.push(expiredTask.id);
          recoveryActions.push({
            action: "skip-expired-lease",
            taskId: expiredTask.id,
            reason: "Task could not be reclaimed because its status changed during recovery.",
          });
          continue;
        }

        recoveredLeaseTaskIds.push(claim.task.id);
        const renewedClaim = await queue.renewLease(
          claim.task.id,
          claim.taskRun.id,
          now,
          renewLeaseMs,
        );
        renewedLeaseTaskIds.push(renewedClaim.task.id);

        if (renewedClaim.task.attempts.length >= renewedClaim.task.maxAttempts) {
          const reason = `Recovered expired lease after ${renewedClaim.task.attempts.length} attempts; manual review required.`;
          const quarantined = await queue.quarantine(
            renewedClaim.task.id,
            renewedClaim.taskRun.id,
            reason,
            now,
          );
          quarantinedTaskIds.push(quarantined.task.id);
          manualReviewTaskIds.push(quarantined.task.id);
          recoveryActions.push({
            action: "quarantine-expired-lease",
            taskId: quarantined.task.id,
            taskRunId: quarantined.taskRun.id,
            reason,
          });
          continue;
        }

        const redriven = await queue.fail(
          renewedClaim.task.id,
          renewedClaim.taskRun.id,
          "Recovered expired lease; scheduling redrive.",
          now,
        );
        if (redriven.task.status === "quarantined") {
          quarantinedTaskIds.push(redriven.task.id);
          manualReviewTaskIds.push(redriven.task.id);
          recoveryActions.push({
            action: "quarantine-expired-lease",
            taskId: redriven.task.id,
            taskRunId: redriven.taskRun.id,
            reason: redriven.task.lastErrorMessage ?? "Recovered expired lease exhausted retries.",
          });
        } else {
          redrivenTaskIds.push(redriven.task.id);
          recoveryActions.push({
            action: "redrive-expired-lease",
            taskId: redriven.task.id,
            taskRunId: redriven.taskRun.id,
            retryScheduledFor: redriven.task.scheduledFor ?? null,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Unexpected lease recovery error for task ${expiredTask.id}`;
        recoveryErrors.push(message);
        recoveryActions.push({
          action: "error-expired-lease",
          taskId: expiredTask.id,
          error: message,
        });
      }
    }

    if (redriveLimit > 0) {
      const terminalTasks = (await unitOfWork.tasks.list())
        .filter((task) => {
          if (redrivenTaskIds.includes(task.id) || quarantinedTaskIds.includes(task.id)) {
            return false;
          }

          if (task.status === "failed" || task.status === "cancelled") {
            return true;
          }

          return (
            task.status === "quarantined" &&
            task.attempts.length < task.maxAttempts &&
            typeof task.lastErrorMessage === "string" &&
            task.lastErrorMessage.includes("expired lease")
          );
        })
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
        .slice(0, redriveLimit);

      for (const task of terminalTasks) {
        try {
          const requeued = await queue.requeue(task.id, now);
          redrivenTaskIds.push(requeued.id);
          recoveryActions.push({
            action: "requeue-terminal-task",
            taskId: requeued.id,
            previousStatus: task.status,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : `Unexpected requeue error for task ${task.id}`;
          recoveryErrors.push(message);
          recoveryActions.push({
            action: "error-requeue-terminal-task",
            taskId: task.id,
            error: message,
          });
        }
      }
    }

    const tasksAfter = await unitOfWork.tasks.list();
    const queueSummaryAfter = await queue.summary();
    const queueHealthAfter = assessQueueHealth(queueSummaryAfter, tasksAfter, now);
    const affectedTaskIds = dedupeStrings([
      ...expiredLeaseCandidates.map((task) => task.id),
      ...redrivenTaskIds,
      ...quarantinedTaskIds,
      ...skippedTaskIds,
    ]);
    const affectedFixtureIds = dedupeStrings(
      tasksAfter
        .filter((task) => affectedTaskIds.includes(task.id))
        .flatMap((task) => {
          const fixtureId = fixtureIdFromTask(task);
          return fixtureId ? [fixtureId] : [];
        }),
    );
    const finalError = recoveryErrors[0];

    partialSummary = {
      source: "hermes-recovery",
      fixtureIds: affectedFixtureIds,
      taskIds: affectedTaskIds,
      stages: [],
      counts: {
        researchTaskCount: 0,
        predictionTaskCount: 0,
        parlayCount: 0,
        validationTaskCount: 0,
        expiredLeaseCount: expiredLeaseCandidates.length,
        recoveredLeaseCount: dedupeStrings(recoveredLeaseTaskIds).length,
        renewedLeaseCount: dedupeStrings(renewedLeaseTaskIds).length,
        redrivenTaskCount: dedupeStrings(redrivenTaskIds).length,
        quarantinedTaskCount: dedupeStrings(quarantinedTaskIds).length,
        manualReviewTaskCount: dedupeStrings(manualReviewTaskIds).length,
      },
    };
    partialMetadata = {
      queueSummaryBefore,
      queueSummaryAfter,
      queueHealthBefore,
      queueHealthAfter,
      expiredLeaseTaskIds: expiredLeaseCandidates.map((task) => task.id),
      nearExpiryTaskIds: queueHealthBefore.nearExpiryTaskIds,
      recoveredLeaseTaskIds: dedupeStrings(recoveredLeaseTaskIds),
      renewedLeaseTaskIds: dedupeStrings(renewedLeaseTaskIds),
      redrivenTaskIds: dedupeStrings(redrivenTaskIds),
      quarantinedTaskIds: dedupeStrings(quarantinedTaskIds),
      manualReviewTaskIds: dedupeStrings(manualReviewTaskIds),
      skippedTaskIds: dedupeStrings(skippedTaskIds),
      recoveryActions,
      ...(recoveryErrors.length > 0 ? { recoveryErrors } : {}),
    };

    const finalCycle = await unitOfWork.automationCycles.save(
      updateCycle(recoveryCycle, {
        status: recoveryErrors.length > 0 ? "failed" : "succeeded",
        finishedAt: toIso(now),
        ...(finalError ? { error: finalError } : {}),
        summary: partialSummary,
        metadata: partialMetadata,
      }),
    );

    return {
      cycle: finalCycle,
      readModel: await loadAutomationCycleReadModelSafely(databaseUrl, finalCycle.id),
    };
  } catch (error) {
    if (!recoveryCycle) {
      throw error;
    }

    const finishedAt = toIso(new Date());
    const message = error instanceof Error ? error.message : "Unexpected recovery error";
    const failedCycle = await createPrismaUnitOfWork(client).automationCycles.save(
      updateCycle(recoveryCycle, {
        status: "failed",
        finishedAt,
        ...(partialSummary ? { summary: partialSummary } : {}),
        ...(partialMetadata ? { metadata: partialMetadata } : {}),
        error: message,
      }),
    );

    return {
      cycle: failedCycle,
      readModel: await loadAutomationCycleReadModelSafely(databaseUrl, failedCycle.id),
    };
  } finally {
    await client.$disconnect();
  }
};
