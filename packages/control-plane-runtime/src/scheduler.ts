import {
  buildExampleCronSpecs,
  createTaskEnvelope,
  matchesCronSpec,
  type CronWorkflowSpec,
  type TaskEnvelope,
} from "@gana-v8/orchestration-sdk";
import { evaluateFixtureCoverageScope } from "@gana-v8/policy-engine";
import {
  createAutomationCycle,
  createSchedulerCursor,
  type AutomationCycleStageEntity,
  type DailyAutomationPolicyEntity,
  type FixtureEntity,
  type FixtureWorkflowEntity,
  type LeagueCoveragePolicyEntity,
  type SchedulerCursorEntity,
  type TeamCoveragePolicyEntity,
} from "@gana-v8/domain-core";
import type { PrismaClient } from "@prisma/client";
import {
  createPrismaUnitOfWork,
  createConnectedVerifiedPrismaClient,
} from "@gana-v8/storage-adapters";

import {
  createRuntimeQueue,
  cycleId,
  defaultLeaseOwner,
  loadAutomationCycleReadModelSafely,
  toIso,
  type RuntimeCycleResult,
  type SchedulerCycleOptions,
  updateCycle,
} from "./shared.js";
import {
  createObservabilityKit,
  createPrismaDurableObservabilitySink,
} from "@gana-v8/observability";

const floorToMinute = (date: Date): Date =>
  new Date(Math.floor(date.getTime() / 60_000) * 60_000);

const dedupeStrings = (values: readonly string[]): readonly string[] =>
  values.filter((value, index, current) => current.indexOf(value) === index);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const detectMinDetectedOdd = (
  selections: readonly { readonly priceDecimal: number }[],
): number | undefined => {
  const prices = selections
    .map((selection) => selection.priceDecimal)
    .filter((price): price is number => Number.isFinite(price));

  return prices.length > 0 ? Math.min(...prices) : undefined;
};

const currentManifestResearchWorkflowId = (manifestId: string): string =>
  `${manifestId}:research`;

const researchTaskIdForManifest = (manifestId: string, fixtureId: string): string =>
  `scheduler:${manifestId}:research:${fixtureId}`;

const schedulerCursorId = (specId: string): string =>
  `scheduler-cursor:${specId}`;

interface SchedulerPlanningSnapshot {
  readonly generatedAt: string;
  readonly fixtures: readonly FixtureEntity[];
  readonly fixtureWorkflows: readonly FixtureWorkflowEntity[];
  readonly dailyAutomationPolicies: readonly DailyAutomationPolicyEntity[];
  readonly leagueCoveragePolicies: readonly LeagueCoveragePolicyEntity[];
  readonly teamCoveragePolicies: readonly TeamCoveragePolicyEntity[];
}

const createRuntimeTaskPayload = (
  payload: Record<string, unknown>,
  input: {
    readonly manifestId: string;
    readonly workflowId: string;
    readonly traceId: string;
    readonly correlationId: string;
    readonly source: string;
  },
): Record<string, unknown> => ({
  ...payload,
  manifestId: input.manifestId,
  workflowId: input.workflowId,
  traceId: input.traceId,
  correlationId: input.correlationId,
  source: input.source,
});

const enqueueCronSpecTask = async (
  queue: ReturnType<typeof createRuntimeQueue>,
  manifestId: string,
  envelope: TaskEnvelope<Record<string, unknown>>,
  now: Date,
): Promise<string> =>
  (
    await queue.enqueue({
      id: envelope.id,
      kind: envelope.taskKind,
      manifestId,
      workflowId: envelope.workflowId,
      traceId: envelope.traceId,
      correlationId: envelope.metadata.correlationId ?? manifestId,
      source: envelope.metadata.source,
      payload: createRuntimeTaskPayload(envelope.payload, {
        manifestId,
        workflowId: envelope.workflowId,
        traceId: envelope.traceId,
        correlationId: envelope.metadata.correlationId ?? manifestId,
        source: envelope.metadata.source,
      }),
      priority: envelope.priority,
      scheduledFor: new Date(envelope.scheduledFor),
      now,
      ...(envelope.policy.maxAttempts !== undefined
        ? { maxAttempts: envelope.policy.maxAttempts }
        : {}),
    })
  ).id;

const buildTriggeredEnvelope = (
  spec: CronWorkflowSpec<Record<string, unknown>>,
  scheduledFor: string,
  manifestId: string,
): TaskEnvelope<Record<string, unknown>> =>
  createTaskEnvelope({
    workflowId: spec.id,
    traceId: `${manifestId}:${spec.id}:${scheduledFor}`,
    intent: spec.intent,
    taskKind: spec.taskKind,
    payload: spec.createPayload(scheduledFor),
    scheduledFor,
    priority: spec.priority,
    metadata: {
      source: spec.source,
      labels: [...(spec.labels ?? [])],
      correlationId: manifestId,
    },
    ...(spec.budgetPolicy ? { policy: spec.budgetPolicy } : {}),
    createdAt: scheduledFor,
  });

const shouldTriggerSpec = (
  spec: CronWorkflowSpec<Record<string, unknown>>,
  scheduledMinute: Date,
  cursor: SchedulerCursorEntity | null,
): boolean =>
  matchesCronSpec(spec.cron, scheduledMinute) &&
  cursor?.lastTriggeredAt !== scheduledMinute.toISOString();

const loadSchedulerPlanningSnapshot = async (
  unitOfWork: ReturnType<typeof createPrismaUnitOfWork>,
): Promise<SchedulerPlanningSnapshot> => {
  const [
    fixtures,
    fixtureWorkflows,
    dailyAutomationPolicies,
    leagueCoveragePolicies,
    teamCoveragePolicies,
  ] = await Promise.all([
    unitOfWork.fixtures.list(),
    unitOfWork.fixtureWorkflows.list(),
    unitOfWork.dailyAutomationPolicies.findEnabled(),
    unitOfWork.leagueCoveragePolicies.findEnabled(),
    unitOfWork.teamCoveragePolicies.findEnabled(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    fixtures,
    fixtureWorkflows,
    dailyAutomationPolicies,
    leagueCoveragePolicies,
    teamCoveragePolicies,
  };
};

const queueEligibleResearchTasks = async (
  client: PrismaClient,
  queue: ReturnType<typeof createRuntimeQueue>,
  snapshot: SchedulerPlanningSnapshot,
  manifestId: string,
  fixtureIds: readonly string[],
  now: Date,
): Promise<{
  readonly researchTaskIds: readonly string[];
  readonly includedFixtureIds: readonly string[];
  readonly skippedFixtures: readonly { fixtureId: string; reason: string }[];
}> => {
  const dailyPolicy = snapshot.dailyAutomationPolicies[0] ?? {
    id: "default-daily-policy",
    policyName: "default-daily-policy",
    enabled: true,
    timezone: "UTC",
    minAllowedOdd: 1.2,
    defaultMaxFixturesPerRun: 50,
    defaultLookaheadHours: 24,
    defaultLookbackHours: 6,
    requireTrackedLeagueOrTeam: false,
    allowManualInclusionBypass: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };

  const includedFixtureIds: string[] = [];
  const skippedFixtures: Array<{ fixtureId: string; reason: string }> = [];
  const researchTaskIds: string[] = [];

  for (const fixtureId of fixtureIds) {
    const fixture = snapshot.fixtures.find((candidate) => candidate.id === fixtureId);
    if (!fixture) {
      skippedFixtures.push({
        fixtureId,
        reason: "Fixture not found in the operational snapshot.",
      });
      continue;
    }
    const workflow = snapshot.fixtureWorkflows.find((candidate) => candidate.fixtureId === fixtureId);

    const fixtureMetadata = asRecord(fixture.metadata);
    const providerFixtureId =
      typeof fixtureMetadata?.providerFixtureId === "string"
        ? fixtureMetadata.providerFixtureId
        : undefined;
    const latestOddsSnapshot = await client.oddsSnapshot.findFirst({
      where: {
        marketKey: "h2h",
        OR: [
          { fixtureId },
          ...(providerFixtureId ? [{ providerFixtureId }] : []),
        ],
      },
      include: { selections: true },
      orderBy: [{ capturedAt: "desc" }],
    });
    if (!latestOddsSnapshot) {
      skippedFixtures.push({
        fixtureId,
        reason: "No latest h2h odds snapshot found for fixture.",
      });
      continue;
    }

    const selectionKeys = new Set(
      latestOddsSnapshot.selections.map((selection) => selection.selectionKey),
    );
    const hasCompleteH2h =
      selectionKeys.has("home") &&
      selectionKeys.has("draw") &&
      selectionKeys.has("away");
    if (!hasCompleteH2h) {
      skippedFixtures.push({
        fixtureId,
        reason: "Latest h2h odds snapshot is missing home/draw/away selections.",
      });
      continue;
    }

    const minDetectedOdd = detectMinDetectedOdd(latestOddsSnapshot.selections);
    const scopeDecision = evaluateFixtureCoverageScope({
      fixture,
      ...(workflow ? { workflow } : {}),
      leaguePolicies: snapshot.leagueCoveragePolicies,
      teamPolicies: snapshot.teamCoveragePolicies,
      dailyPolicy,
      ...(minDetectedOdd !== undefined ? { minDetectedOdd } : {}),
      now: snapshot.generatedAt,
    });

    if (!scopeDecision.eligibleForScoring) {
      skippedFixtures.push({
        fixtureId,
        reason: scopeDecision.excludedBy.length > 0
          ? scopeDecision.excludedBy.map((reason) => reason.message).join("; ")
          : "Coverage policy excluded fixture from scoring.",
      });
      continue;
    }

    const workflowId = currentManifestResearchWorkflowId(manifestId);
    const traceId = `${workflowId}:${fixtureId}`;
    const source = "hermes-scheduler";
    const taskId = researchTaskIdForManifest(manifestId, fixtureId);
    includedFixtureIds.push(fixtureId);
    researchTaskIds.push(
      (
        await queue.enqueue({
          id: taskId,
          kind: "research",
          manifestId,
          workflowId,
          traceId,
          correlationId: manifestId,
          source,
          payload: createRuntimeTaskPayload(
            {
              fixtureId,
              step: "automation-research",
            },
            {
              manifestId,
              workflowId,
              traceId,
              correlationId: manifestId,
              source,
            },
          ),
          priority: 60,
          scheduledFor: now,
          now,
        })
      ).id,
    );
  }

  return {
    researchTaskIds,
    includedFixtureIds,
    skippedFixtures,
  };
};

const summarizeCronSpecs = (
  specs: readonly CronWorkflowSpec<Record<string, unknown>>[],
): readonly string[] =>
  specs.map((spec) => `${spec.id}:${spec.intent}:${spec.cron}`);

const createInitialStages = (): readonly AutomationCycleStageEntity[] => ([
  {
    stage: "research",
    status: "pending",
    taskIds: [],
    taskRunIds: [],
    retryCount: 0,
  },
  {
    stage: "prediction",
    status: "blocked",
    taskIds: [],
    taskRunIds: [],
    retryCount: 0,
  },
  {
    stage: "validation",
    status: "blocked",
    taskIds: [],
    taskRunIds: [],
    retryCount: 0,
  },
]);

export const runSchedulerCycle = async (
  databaseUrl: string,
  options: SchedulerCycleOptions = {},
): Promise<RuntimeCycleResult> => {
  const now = options.now ?? new Date();
  const leaseOwner = options.leaseOwner ?? defaultLeaseOwner("scheduler");
  const client = await createConnectedVerifiedPrismaClient({ databaseUrl });
  let observability: ReturnType<typeof createObservabilityKit> | null = null;

  try {
    const unitOfWork = createPrismaUnitOfWork(client);
    const queue = createRuntimeQueue(client, unitOfWork);
    const snapshot = await loadSchedulerPlanningSnapshot(unitOfWork);
    const requestedFixtureIds = dedupeStrings(
      options.fixtureIds ?? snapshot.fixtures.map((fixture) => fixture.id),
    );
    const cycle = await unitOfWork.automationCycles.save(
      createAutomationCycle({
        id: cycleId("scheduler", now),
        kind: "scheduler",
        status: "running",
        leaseOwner,
        startedAt: toIso(now),
        metadata: {
          cronSpecs: summarizeCronSpecs(buildExampleCronSpecs()),
          requestedFixtureIds,
        },
        summary: {
          source: "hermes-scheduler",
          fixtureIds: requestedFixtureIds,
          taskIds: [],
          stages: createInitialStages(),
          counts: {
            researchTaskCount: 0,
            predictionTaskCount: 0,
            parlayCount: 0,
            validationTaskCount: 0,
          },
        },
      }),
    );
    observability = createObservabilityKit({
      context: {
        correlationId: cycle.id,
        traceId: `${cycle.id}:scheduler`,
        workspace: "hermes-scheduler",
        labels: {
          cycleKind: "scheduler",
          leaseOwner,
        },
      },
      refs: {
        automationCycleId: cycle.id,
      },
      sink: createPrismaDurableObservabilitySink(client),
    });
    observability.log("scheduler cycle started", {
      data: {
        requestedFixtureCount: requestedFixtureIds.length,
      },
      refs: {
        automationCycleId: cycle.id,
      },
      timestamp: toIso(now),
    });
    observability.setGauge("runtime.scheduler.requested_fixtures", requestedFixtureIds.length, {
      refs: {
        automationCycleId: cycle.id,
      },
      recordedAt: toIso(now),
    });

    const manifestId = cycle.id;
    const scheduledMinute = floorToMinute(now);
    const cronTaskIds: string[] = [];
    const triggeredCronTaskKinds: Array<"fixture-ingestion" | "odds-ingestion"> = [];
    const triggeredSpecIds: string[] = [];
    const cursorStates: Array<{ specId: string; lastTriggeredAt?: string }> = [];

    try {
      for (const spec of buildExampleCronSpecs()) {
        const cursor =
          (await unitOfWork.schedulerCursors.getById(schedulerCursorId(spec.id))) ??
          null;
        cursorStates.push({
          specId: spec.id,
          ...(cursor?.lastTriggeredAt ? { lastTriggeredAt: cursor.lastTriggeredAt } : {}),
        });

        if (!shouldTriggerSpec(spec, scheduledMinute, cursor)) {
          continue;
        }

        const envelope = buildTriggeredEnvelope(
          spec,
          scheduledMinute.toISOString(),
          manifestId,
        );
        cronTaskIds.push(
          await enqueueCronSpecTask(queue, manifestId, envelope, now),
        );
        if (spec.taskKind === "fixture-ingestion" || spec.taskKind === "odds-ingestion") {
          triggeredCronTaskKinds.push(spec.taskKind);
        }
        triggeredSpecIds.push(spec.id);
        await unitOfWork.schedulerCursors.save(
          createSchedulerCursor({
            id: schedulerCursorId(spec.id),
            specId: spec.id,
            lastTriggeredAt: scheduledMinute.toISOString(),
            metadata: {
              intent: spec.intent,
              taskKind: spec.taskKind,
              latestManifestId: manifestId,
              latestTaskId: envelope.id,
            },
          }),
        );
      }

      const {
        researchTaskIds,
        includedFixtureIds,
        skippedFixtures,
      } = await queueEligibleResearchTasks(
        client,
        queue,
        snapshot,
        manifestId,
        requestedFixtureIds,
        now,
      );
      observability.setGauge("runtime.scheduler.cron_tasks", cronTaskIds.length, {
        refs: {
          automationCycleId: cycle.id,
        },
        recordedAt: toIso(now),
      });
      observability.setGauge("runtime.scheduler.research_tasks", researchTaskIds.length, {
        refs: {
          automationCycleId: cycle.id,
        },
        recordedAt: toIso(now),
      });
      observability.setGauge("runtime.scheduler.skipped_fixtures", skippedFixtures.length, {
        refs: {
          automationCycleId: cycle.id,
        },
        recordedAt: toIso(now),
      });

      const finalTaskIds = [...cronTaskIds, ...researchTaskIds];
      const finishedCycle = await unitOfWork.automationCycles.save(
        updateCycle(cycle, {
          status: "succeeded",
          finishedAt: toIso(now),
          summary: {
            source: "hermes-scheduler",
            fixtureIds: includedFixtureIds,
            taskIds: finalTaskIds,
            stages: [
              {
                stage: "research",
                status: researchTaskIds.length > 0 ? "pending" : "blocked",
                taskIds: researchTaskIds,
                taskRunIds: [],
                retryCount: 0,
              },
              {
                stage: "prediction",
                status: researchTaskIds.length > 0 ? "pending" : "blocked",
                taskIds: [],
                taskRunIds: [],
                retryCount: 0,
              },
              {
                stage: "validation",
                status: researchTaskIds.length > 0 ? "pending" : "blocked",
                taskIds: [],
                taskRunIds: [],
                retryCount: 0,
              },
            ],
            counts: {
              researchTaskCount: researchTaskIds.length,
              predictionTaskCount: 0,
              parlayCount: 0,
              validationTaskCount: 0,
              fixtureIngestionTaskCount: triggeredCronTaskKinds.filter(
                (taskKind) => taskKind === "fixture-ingestion",
              ).length,
              oddsIngestionTaskCount: triggeredCronTaskKinds.filter(
                (taskKind) => taskKind === "odds-ingestion",
              ).length,
            },
          },
          metadata: {
            manifestId,
            requestedFixtureIds,
            includedFixtureIds,
            skippedFixtures,
            triggeredSpecIds,
            triggeredCronTaskKinds,
            cursorStates,
            cronTaskIds,
            observability: {
              durableEvents: observability.sinkCapabilities.eventsDurable,
              durableMetrics: observability.sinkCapabilities.metricsDurable,
            },
          },
        }),
      );
      observability.log("scheduler cycle completed", {
        data: {
          manifestId,
          includedFixtureCount: includedFixtureIds.length,
          researchTaskCount: researchTaskIds.length,
          cronTaskCount: cronTaskIds.length,
          skippedFixtureCount: skippedFixtures.length,
        },
        refs: {
          automationCycleId: finishedCycle.id,
        },
        timestamp: toIso(now),
      });
      await observability.flush();

      return {
        cycle: finishedCycle,
        readModel: await loadAutomationCycleReadModelSafely(databaseUrl, finishedCycle.id),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected scheduler cycle error";
      if (observability) {
        observability.log("scheduler cycle failed", {
          severity: "error",
          data: {
            error: message,
          },
          refs: {
            automationCycleId: cycle.id,
          },
          timestamp: toIso(now),
        });
      }
      const failedCycle = await unitOfWork.automationCycles.save(
        updateCycle(cycle, {
          status: "failed",
          finishedAt: toIso(now),
          error: message,
          metadata: {
            manifestId,
            triggeredSpecIds,
            triggeredCronTaskKinds,
            cursorStates,
            cronTaskIds,
          },
          summary: {
            source: "hermes-scheduler",
            fixtureIds: requestedFixtureIds,
            taskIds: cronTaskIds,
            stages: createInitialStages(),
            counts: {
              researchTaskCount: 0,
              predictionTaskCount: 0,
              parlayCount: 0,
              validationTaskCount: 0,
            },
          },
        }),
      );
      if (observability) {
        await observability.flush();
      }

      return {
        cycle: failedCycle,
        readModel: await loadAutomationCycleReadModelSafely(databaseUrl, failedCycle.id),
      };
    }
  } finally {
    await client.$disconnect();
  }
};
