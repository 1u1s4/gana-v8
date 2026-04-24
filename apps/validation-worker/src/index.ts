import {
  createFixtureWorkflow,
  createValidation,
  finalizeValidation,
  transitionFixtureWorkflowStage,
  type FixtureEntity,
  type FixtureWorkflowEntity,
  type ISODateString,
  type ParlayEntity,
  type PredictionEntity,
  type PredictionMarket,
  type PredictionOutcome,
  type ValidationCheck,
  type ValidationEntity,
} from "@gana-v8/domain-core";
import { settleParlayTicket, type AtomicLegSettlement } from "@gana-v8/parlay-engine";
import {
  connectPrismaClientWithRetry,
  createPrismaClient,
  createPrismaUnitOfWork,
  createVerifiedPrismaClient,
  type StorageUnitOfWork,
} from "@gana-v8/storage-adapters";
import { settleAtomicTicket } from "@gana-v8/validation-engine";

export const workspaceInfo = {
  packageName: "@gana-v8/validation-worker",
  workspaceName: "validation-worker",
  category: "app",
  description: "Settles outcomes, calibration jobs, and retrospective validation workflows.",
  dependencies: [
    { name: "@gana-v8/audit-lineage", category: "workspace" },
    { name: "@gana-v8/config-runtime", category: "workspace" },
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/observability", category: "workspace" },
    { name: "@gana-v8/parlay-engine", category: "workspace" },
    { name: "@gana-v8/storage-adapters", category: "workspace" },
    { name: "@gana-v8/validation-engine", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export interface ValidationWorkerOptions {
  readonly executedAt?: ISODateString;
  readonly unitOfWork?: StorageUnitOfWork;
}

export interface PredictionValidationResult {
  readonly predictionId: string;
  readonly fixtureId: string;
  readonly status: "settled" | "skipped";
  readonly verdict?: "won" | "lost" | "voided";
  readonly validationId?: string;
  readonly reason?: string;
}

export interface ParlayValidationResult {
  readonly parlayId: string;
  readonly status: "settled" | "pending" | "skipped";
  readonly verdict?: "won" | "lost" | "voided";
  readonly validationId?: string;
  readonly reason?: string;
}

export interface ValidationWorkerRunResult {
  readonly executedAt: ISODateString;
  readonly settledPredictionCount: number;
  readonly skippedPredictionCount: number;
  readonly settledParlayCount: number;
  readonly pendingParlayCount: number;
  readonly predictionResults: readonly PredictionValidationResult[];
  readonly parlayResults: readonly ParlayValidationResult[];
}

type CornerPredictionMarket = "corners-total" | "corners-h2h";

type CornerStatisticSnapshotLike = {
  readonly id?: string;
  readonly batchId?: string;
  readonly fixtureId?: string;
  readonly statKey?: string;
  readonly scope?: string;
  readonly valueNumeric?: number | null;
  readonly capturedAt?: string | Date;
  readonly generatedAt?: string | Date;
  readonly createdAt?: string | Date;
  readonly updatedAt?: string | Date;
  readonly payload?: unknown;
  readonly statistics?: unknown;
  readonly stats?: unknown;
  readonly corners?: unknown;
  readonly homeCorners?: unknown;
  readonly awayCorners?: unknown;
  readonly totalCorners?: unknown;
};

type FixtureStatisticSnapshotRepositoryLike = {
  readonly list?: () => Promise<readonly CornerStatisticSnapshotLike[]>;
  readonly findByFixtureId?: (fixtureId: string) => Promise<CornerStatisticSnapshotLike | readonly CornerStatisticSnapshotLike[] | null>;
};

type StorageUnitOfWorkWithStatisticSnapshots = StorageUnitOfWork & {
  readonly fixtureStatisticSnapshots?: FixtureStatisticSnapshotRepositoryLike;
};

interface CornerSettlementStats {
  readonly home: number;
  readonly away: number;
  readonly total: number;
}

interface PredictionSettlementOutcome {
  readonly winningOutcomes: readonly PredictionOutcome[];
  readonly voided?: boolean;
  readonly observedSummary: string;
  readonly coverageCheck: ValidationCheck;
  readonly outcomeCheck: ValidationCheck;
}

const CORNERS_TOTAL_MARKET: CornerPredictionMarket = "corners-total";
const CORNERS_H2H_MARKET: CornerPredictionMarket = "corners-h2h";

const createManagedRuntime = (
  databaseUrl?: string,
  options: ValidationWorkerOptions = {},
): { client?: ReturnType<typeof createPrismaClient> | undefined; unitOfWork: StorageUnitOfWork; disconnect: () => Promise<void> } => {
  if (options.unitOfWork) {
    return {
      unitOfWork: options.unitOfWork,
      disconnect: async () => {},
    };
  }

  const client = createVerifiedPrismaClient({ databaseUrl });
  return {
    client,
    unitOfWork: createPrismaUnitOfWork(client),
    disconnect: async () => {
      await client.$disconnect();
    },
  };
};

const createPredictionValidationId = (predictionId: string): string =>
  `validation:prediction-settlement:${predictionId}`;

const createParlayValidationId = (parlayId: string): string =>
  `validation:parlay-settlement:${parlayId}`;

const persistValidationWorkflow = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
  executedAt: ISODateString,
): Promise<FixtureWorkflowEntity> => {
  const current =
    (await unitOfWork.fixtureWorkflows.findByFixtureId(fixtureId)) ??
    createFixtureWorkflow({
      fixtureId,
      ingestionStatus: "pending",
      oddsStatus: "pending",
      enrichmentStatus: "pending",
      candidateStatus: "pending",
      predictionStatus: "pending",
      parlayStatus: "pending",
      validationStatus: "pending",
      isCandidate: false,
    });

  return unitOfWork.fixtureWorkflows.save(
    transitionFixtureWorkflowStage(current, "validation", {
      status: "succeeded",
      occurredAt: executedAt,
    }),
  );
};

const toSettlementPrice = (prediction: PredictionEntity): number => {
  const implied = prediction.probabilities.implied;
  if (Number.isFinite(implied) && implied > 0) {
    return Math.max(1.000001, Number((1 / implied).toFixed(6)));
  }

  return 1.000001;
};

export const deriveMoneylineOutcomeFromFixture = (
  fixture: FixtureEntity,
): PredictionOutcome | null => {
  if (fixture.status !== "completed") {
    return null;
  }

  if (fixture.score === undefined) {
    return null;
  }

  if (fixture.score.home > fixture.score.away) {
    return "home";
  }

  if (fixture.score.home < fixture.score.away) {
    return "away";
  }

  return "draw";
};

export const deriveTotalsOutcomeFromFixture = (
  fixture: FixtureEntity,
  line: number,
): "over" | "under" | null => {
  if (fixture.status !== "completed" || fixture.score === undefined || !Number.isFinite(line)) {
    return null;
  }

  return fixture.score.home + fixture.score.away > line ? "over" : "under";
};

export const deriveBttsOutcomeFromFixture = (
  fixture: FixtureEntity,
): "yes" | "no" | null => {
  if (fixture.status !== "completed" || fixture.score === undefined) {
    return null;
  }

  return fixture.score.home > 0 && fixture.score.away > 0 ? "yes" : "no";
};

export const deriveDoubleChanceOutcomesFromFixture = (
  fixture: FixtureEntity,
): readonly PredictionOutcome[] | null => {
  const moneyline = deriveMoneylineOutcomeFromFixture(fixture);
  if (!moneyline) {
    return null;
  }

  if (moneyline === "home") {
    return ["home-draw", "home-away"];
  }
  if (moneyline === "draw") {
    return ["home-draw", "draw-away"];
  }

  return ["home-away", "draw-away"];
};

const isCornerPredictionMarket = (market: string): market is CornerPredictionMarket =>
  market === CORNERS_TOTAL_MARKET || market === CORNERS_H2H_MARKET;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0 || normalized === "-") {
      return null;
    }

    const parsed = Number(normalized.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeStatisticKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const isCornerStatisticKey = (key: string): boolean => {
  const normalized = normalizeStatisticKey(key);
  return normalized === "corners" || normalized === "cornerkicks" || normalized === "corner";
};

const readPropertyNumber = (value: unknown, keys: readonly string[]): number | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = toFiniteNumber(record[key]);
    if (direct !== null) {
      return direct;
    }
  }

  const normalizedKeys = new Set(keys.map(normalizeStatisticKey));
  for (const [key, entry] of Object.entries(record)) {
    if (!normalizedKeys.has(normalizeStatisticKey(key))) {
      continue;
    }

    const parsed = toFiniteNumber(entry);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const readCornerValue = (value: unknown): number | null => {
  const direct = toFiniteNumber(value);
  if (direct !== null) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const type = record.type ?? record.name ?? record.key ?? record.label;
      if (typeof type === "string" && isCornerStatisticKey(type)) {
        const parsed = toFiniteNumber(record.value ?? record.count ?? record.total);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }

  if (value && typeof value === "object") {
    return readPropertyNumber(value, ["corners", "cornerKicks", "corner_kicks", "corner-kicks", "value", "count", "total"]);
  }

  return null;
};

const readSideCorners = (
  snapshot: CornerStatisticSnapshotLike,
  side: "home" | "away",
): number | null => {
  const sideKeys = side === "home"
    ? ["homeCorners", "cornersHome", "home_corner_kicks", "homeCornerKicks"]
    : ["awayCorners", "cornersAway", "away_corner_kicks", "awayCornerKicks"];

  const direct = readPropertyNumber(snapshot, sideKeys);
  if (direct !== null) {
    return direct;
  }

  for (const source of [
    snapshot.corners,
    snapshot.stats,
    snapshot.statistics,
    snapshot.payload,
  ]) {
    if (!source || typeof source !== "object") {
      continue;
    }

    const sourceRecord = source as Record<string, unknown>;
    const sideValue = sourceRecord[side] ?? sourceRecord[`${side}Team`] ?? sourceRecord[`${side}_team`];
    const parsedSideValue = readCornerValue(sideValue);
    if (parsedSideValue !== null) {
      return parsedSideValue;
    }

    const parsedDirect = readPropertyNumber(source, sideKeys);
    if (parsedDirect !== null) {
      return parsedDirect;
    }

    const response = sourceRecord.response;
    if (Array.isArray(response)) {
      const index = side === "home" ? 0 : 1;
      const teamEntry = response[index] as Record<string, unknown> | undefined;
      const parsedTeamEntry = readCornerValue(teamEntry?.statistics ?? teamEntry?.stats);
      if (parsedTeamEntry !== null) {
        return parsedTeamEntry;
      }
    }
  }

  return null;
};

export const deriveHomeCornersFromStatisticSnapshot = (
  snapshot: CornerStatisticSnapshotLike,
): number | null => readSideCorners(snapshot, "home");

export const deriveAwayCornersFromStatisticSnapshot = (
  snapshot: CornerStatisticSnapshotLike,
): number | null => readSideCorners(snapshot, "away");

export const deriveTotalCornersFromStatisticSnapshot = (
  snapshot: CornerStatisticSnapshotLike,
): number | null => {
  const direct = readPropertyNumber(snapshot, ["totalCorners", "cornersTotal", "total_corner_kicks", "totalCornerKicks"]);
  if (direct !== null) {
    return direct;
  }

  const home = deriveHomeCornersFromStatisticSnapshot(snapshot);
  const away = deriveAwayCornersFromStatisticSnapshot(snapshot);
  if (home === null || away === null) {
    return null;
  }

  return home + away;
};

const getCornerStatsFromSnapshot = (
  snapshot: CornerStatisticSnapshotLike | null,
): CornerSettlementStats | null => {
  if (!snapshot) {
    return null;
  }

  const home = deriveHomeCornersFromStatisticSnapshot(snapshot);
  const away = deriveAwayCornersFromStatisticSnapshot(snapshot);
  const total = deriveTotalCornersFromStatisticSnapshot(snapshot);
  if (home === null || away === null || total === null) {
    return null;
  }

  return { home, away, total };
};

const latestRecordByScope = (
  records: readonly CornerStatisticSnapshotLike[],
  scope: "home" | "away" | "match",
): CornerStatisticSnapshotLike | null =>
  [...records]
    .filter((record) => record.scope === scope && isCornerStatisticKey(record.statKey ?? ""))
    .sort((left, right) => snapshotTimestamp(right) - snapshotTimestamp(left))[0] ?? null;

export const deriveCornerStatisticsSummary = (
  records: readonly CornerStatisticSnapshotLike[],
): CornerSettlementStats | null => {
  const homeRecord = latestRecordByScope(records, "home");
  const awayRecord = latestRecordByScope(records, "away");
  const matchRecord = latestRecordByScope(records, "match");

  const home = toFiniteNumber(homeRecord?.valueNumeric) ?? (homeRecord ? deriveHomeCornersFromStatisticSnapshot(homeRecord) : null);
  const away = toFiniteNumber(awayRecord?.valueNumeric) ?? (awayRecord ? deriveAwayCornersFromStatisticSnapshot(awayRecord) : null);
  const directTotal = toFiniteNumber(matchRecord?.valueNumeric) ?? (matchRecord ? deriveTotalCornersFromStatisticSnapshot(matchRecord) : null);

  if (home === null || away === null) {
    return null;
  }

  return { home, away, total: directTotal ?? home + away };
};

const snapshotTimestamp = (snapshot: CornerStatisticSnapshotLike): number => {
  const raw = snapshot.capturedAt ?? snapshot.generatedAt ?? snapshot.updatedAt ?? snapshot.createdAt;
  const timestamp = raw instanceof Date ? raw.getTime() : raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const findFixtureStatisticSnapshots = async (
  unitOfWork: StorageUnitOfWork,
  fixtureId: string,
): Promise<readonly CornerStatisticSnapshotLike[]> => {
  const repository = (unitOfWork as StorageUnitOfWorkWithStatisticSnapshots).fixtureStatisticSnapshots;
  if (!repository) {
    return [];
  }

  const byFixture = await repository.findByFixtureId?.(fixtureId);
  return Array.isArray(byFixture)
    ? byFixture
    : byFixture
      ? [byFixture]
      : repository.list
        ? (await repository.list()).filter((snapshot) => snapshot.fixtureId === fixtureId)
        : [];
};

const deriveWinningOutcomesForPrediction = (
  prediction: PredictionEntity,
  fixture: FixtureEntity,
): readonly PredictionOutcome[] | null => {
  if (prediction.market === "moneyline") {
    const outcome = deriveMoneylineOutcomeFromFixture(fixture);
    return outcome ? [outcome] : null;
  }

  if (prediction.market === "totals") {
    const outcome = deriveTotalsOutcomeFromFixture(fixture, prediction.probabilities.line ?? Number.NaN);
    return outcome ? [outcome] : null;
  }

  if (prediction.market === "both-teams-score") {
    const outcome = deriveBttsOutcomeFromFixture(fixture);
    return outcome ? [outcome] : null;
  }

  if (prediction.market === "double-chance") {
    return deriveDoubleChanceOutcomesFromFixture(fixture);
  }

  return null;
};

const deriveCornerSettlementOutcome = (
  prediction: PredictionEntity,
  snapshots: readonly CornerStatisticSnapshotLike[],
): PredictionSettlementOutcome | null => {
  const stats = deriveCornerStatisticsSummary(snapshots) ?? getCornerStatsFromSnapshot(
    [...snapshots].sort((left, right) => snapshotTimestamp(right) - snapshotTimestamp(left))[0] ?? null,
  );
  if (!stats) {
    return null;
  }

  const coverageCheck = {
    code: "CORNERS_STATS_AVAILABLE",
    message: `Corners stats were available: home ${stats.home}, away ${stats.away}, total ${stats.total}.`,
    passed: true,
  };

  if (prediction.market === CORNERS_TOTAL_MARKET) {
    const line = prediction.probabilities.line;
    if (typeof line !== "number" || !Number.isFinite(line)) {
      return null;
    }

    if (stats.total === line) {
      return {
        winningOutcomes: [],
        voided: true,
        observedSummary: `corner total ${stats.total} pushed line ${line}`,
        coverageCheck,
        outcomeCheck: {
          code: "CORNERS_TOTAL_OUTCOME",
          message: `Corner total ${stats.total} matched line ${line}; prediction voided.`,
          passed: true,
        },
      };
    }

    const outcome: PredictionOutcome = stats.total > line ? "over" : "under";
    return {
      winningOutcomes: [outcome],
      observedSummary: `corner total ${stats.total} vs line ${line}`,
      coverageCheck,
      outcomeCheck: {
        code: "CORNERS_TOTAL_OUTCOME",
        message: `Corner total ${stats.total} resolved to ${outcome} against line ${line}.`,
        passed: true,
      },
    };
  }

  if (prediction.market === CORNERS_H2H_MARKET) {
    const outcome: PredictionOutcome = stats.home > stats.away ? "home" : stats.home < stats.away ? "away" : "draw";
    return {
      winningOutcomes: [outcome],
      observedSummary: `corner h2h ${stats.home}-${stats.away}`,
      coverageCheck,
      outcomeCheck: {
        code: "CORNERS_H2H_OUTCOME",
        message: `Corner h2h ${stats.home}-${stats.away} resolved to ${outcome}.`,
        passed: true,
      },
    };
  }

  return null;
};

const deriveSettlementOutcomeForPrediction = async (
  unitOfWork: StorageUnitOfWork,
  prediction: PredictionEntity,
  fixture: FixtureEntity,
): Promise<PredictionSettlementOutcome | null> => {
  if (isCornerPredictionMarket(prediction.market)) {
    return deriveCornerSettlementOutcome(
      prediction,
      await findFixtureStatisticSnapshots(unitOfWork, prediction.fixtureId),
    );
  }

  const winningOutcomes = deriveWinningOutcomesForPrediction(prediction, fixture);
  if (!winningOutcomes) {
    return null;
  }

  const score = fixture.score;
  if (score === undefined) {
    return null;
  }

  return {
    winningOutcomes,
    observedSummary: `${fixture.homeTeam} ${score.home}-${score.away} ${fixture.awayTeam}`,
    coverageCheck: {
      code: "SCORE_AVAILABLE",
      message: `Fixture score ${score.home}-${score.away} was available.`,
      passed: true,
    },
    outcomeCheck: {
      code: marketOutcomeCheckCode(prediction.market),
      message: `Winning outcome resolved to ${winningOutcomes.join(", ")}.`,
      passed: true,
    },
  };
};

const marketOutcomeCheckCode = (market: PredictionMarket | CornerPredictionMarket | string): string => {
  if (market === CORNERS_TOTAL_MARKET) {
    return "CORNERS_TOTAL_OUTCOME";
  }

  if (market === CORNERS_H2H_MARKET) {
    return "CORNERS_H2H_OUTCOME";
  }

  if (market === "both-teams-score") {
    return "BTTS_OUTCOME";
  }

  return `${market.toUpperCase().replaceAll("-", "_")}_OUTCOME`;
};

const validationStatusFromVerdict = (
  verdict: "won" | "lost" | "voided",
): Exclude<ValidationEntity["status"], "pending"> => {
  if (verdict === "won") {
    return "passed";
  }

  if (verdict === "lost") {
    return "failed";
  }

  return "partial";
};

const createSettlementValidation = (input: {
  readonly id: string;
  readonly targetType: ValidationEntity["targetType"];
  readonly targetId: string;
  readonly kind: ValidationEntity["kind"];
  readonly verdict: "won" | "lost" | "voided";
  readonly summary: string;
  readonly checks: readonly ValidationCheck[];
  readonly executedAt: ISODateString;
}): ValidationEntity =>
  finalizeValidation(
    createValidation({
      id: input.id,
      targetType: input.targetType,
      targetId: input.targetId,
      kind: input.kind,
      status: "pending",
      checks: [],
      summary: "",
      createdAt: input.executedAt,
      updatedAt: input.executedAt,
    }),
    validationStatusFromVerdict(input.verdict),
    input.checks,
    input.summary,
    input.executedAt,
  );

const derivePredictionVerdict = (
  unitOfWork: StorageUnitOfWork,
  prediction: PredictionEntity,
  fixtureById: ReadonlyMap<string, FixtureEntity>,
): Promise<AtomicLegSettlement["status"] | null> => {
  if (prediction.status === "voided") {
    return Promise.resolve("voided");
  }

  const fixture = fixtureById.get(prediction.fixtureId);
  if (!fixture) {
    return Promise.resolve(null);
  }

  return deriveSettlementOutcomeForPrediction(unitOfWork, prediction, fixture).then((outcome) => {
    if (!outcome) {
      return null;
    }

    if (outcome.voided) {
      return "voided";
    }

    return outcome.winningOutcomes.includes(prediction.outcome) ? "won" : "lost";
  });
};

const skippedReasonForUngradeablePrediction = (prediction: PredictionEntity): string => {
  if (prediction.market === CORNERS_TOTAL_MARKET) {
    if (!Number.isFinite(prediction.probabilities.line)) {
      return "Corners-total prediction cannot be settled because the market line is missing.";
    }

    return "Corners-total prediction cannot be settled because fixture corners statistic coverage is missing.";
  }

  if (prediction.market === CORNERS_H2H_MARKET) {
    return "Corners-h2h prediction cannot be settled because fixture home/away corners statistic coverage is missing.";
  }

  return `Prediction ${prediction.market}:${prediction.outcome} cannot be settled from completed fixture score and market metadata.`;
};

const requireCompletedFixtureScore = (prediction: PredictionEntity): boolean =>
  !isCornerPredictionMarket(prediction.market);

const settlePredictionValidation = async (
  unitOfWork: StorageUnitOfWork,
  fixtureById: ReadonlyMap<string, FixtureEntity>,
  prediction: PredictionEntity,
  executedAt: ISODateString,
): Promise<PredictionValidationResult> => {
  const fixture = fixtureById.get(prediction.fixtureId);
  if (!fixture) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: "Fixture not found for prediction settlement.",
    };
  }

  if (fixture.status !== "completed") {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: `Fixture status ${fixture.status} is not eligible for settlement.`,
    };
  }

  if (requireCompletedFixtureScore(prediction) && fixture.score === undefined) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: "Fixture is completed but score coverage is missing.",
    };
  }

  const settlementOutcome = await deriveSettlementOutcomeForPrediction(unitOfWork, prediction, fixture);
  if (!settlementOutcome) {
    return {
      predictionId: prediction.id,
      fixtureId: prediction.fixtureId,
      status: "skipped",
      reason: skippedReasonForUngradeablePrediction(prediction),
    };
  }

  const settledTicket = settleAtomicTicket(
    {
      prediction,
      price: toSettlementPrice(prediction),
    },
    {
      fixtureId: prediction.fixtureId,
      market: prediction.market,
      winningOutcomes: settlementOutcome.winningOutcomes,
      ...(settlementOutcome.voided ? { voided: true } : {}),
    },
    executedAt,
  );

  await unitOfWork.predictions.save(settledTicket.prediction);

  const validation = createSettlementValidation({
    id: createPredictionValidationId(prediction.id),
    targetType: "prediction",
    targetId: prediction.id,
    kind: "prediction-settlement",
    verdict: settledTicket.verdict,
    summary: `Prediction ${prediction.id} settled ${settledTicket.verdict} from ${settlementOutcome.observedSummary}.`,
    checks: [
      {
        code: "FIXTURE_COMPLETED",
        message: `Fixture ${fixture.id} is completed.`,
        passed: true,
      },
      settlementOutcome.coverageCheck,
      settlementOutcome.outcomeCheck,
      {
        code: "PREDICTION_VERDICT",
        message: `Prediction verdict was ${settledTicket.verdict}.`,
        passed: settledTicket.verdict === "won",
      },
    ],
    executedAt,
  });

  await unitOfWork.validations.save(validation);
  await persistValidationWorkflow(unitOfWork, prediction.fixtureId, executedAt);

  return {
    predictionId: prediction.id,
    fixtureId: prediction.fixtureId,
    status: "settled",
    verdict: settledTicket.verdict,
    validationId: validation.id,
  };
};

const settleParlayValidation = async (
  unitOfWork: StorageUnitOfWork,
  fixtureById: ReadonlyMap<string, FixtureEntity>,
  parlay: ParlayEntity,
  executedAt: ISODateString,
): Promise<ParlayValidationResult> => {
  if (parlay.status === "settled" || parlay.status === "voided") {
    return {
      parlayId: parlay.id,
      status: "skipped",
      reason: `Parlay already ${parlay.status}.`,
    };
  }

  const predictions = await Promise.all(
    parlay.legs.map((leg) => unitOfWork.predictions.getById(leg.predictionId)),
  );

  const settlements = (await Promise.all(predictions.map(async (prediction) => {
    if (!prediction) {
      return null;
    }

    const verdict = await derivePredictionVerdict(unitOfWork, prediction, fixtureById);
    return verdict ? { predictionId: prediction.id, status: verdict } : null;
  }))).filter((settlement): settlement is AtomicLegSettlement => settlement !== null);

  const settledParlay = settleParlayTicket(parlay, settlements, executedAt);
  if (!settledParlay.finalized) {
    return {
      parlayId: parlay.id,
      status: "pending",
      reason: "Parlay still has unsettled legs.",
    };
  }

  const verdict =
    settledParlay.verdict === "pending" ? "voided" : settledParlay.verdict;

  await unitOfWork.parlays.save(settledParlay.parlay);

  const validation = createSettlementValidation({
    id: createParlayValidationId(parlay.id),
    targetType: "parlay",
    targetId: parlay.id,
    kind: "parlay-settlement",
    verdict,
    summary: `Parlay ${parlay.id} settled ${verdict} with ${settledParlay.gradedLegCount}/${parlay.legs.length} graded legs.`,
    checks: [
      {
        code: "PARLAY_LEG_COVERAGE",
        message: `Resolved ${settledParlay.gradedLegCount} of ${parlay.legs.length} legs.`,
        passed: settledParlay.gradedLegCount === parlay.legs.length,
      },
      {
        code: "PARLAY_VERDICT",
        message: `Parlay verdict was ${verdict}.`,
        passed: verdict === "won",
      },
    ],
    executedAt,
  });

  await unitOfWork.validations.save(validation);
  await Promise.all(
    [...new Set(parlay.legs.map((leg) => leg.fixtureId))].map((fixtureId) =>
      persistValidationWorkflow(unitOfWork, fixtureId, executedAt),
    ),
  );

  return {
    parlayId: parlay.id,
    status: "settled",
    verdict,
    validationId: validation.id,
  };
};

export const runValidationWorker = async (
  databaseUrl?: string,
  options: ValidationWorkerOptions = {},
): Promise<ValidationWorkerRunResult> => {
  const runtime = createManagedRuntime(databaseUrl, options);
  const executedAt = options.executedAt ?? new Date().toISOString();

  try {
    if (runtime.client) {
      await connectPrismaClientWithRetry(runtime.client);
    }

    const fixtures = await runtime.unitOfWork.fixtures.list();
    const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture] as const));
    const predictions = await runtime.unitOfWork.predictions.list();
    const predictionResults: PredictionValidationResult[] = [];

    for (const prediction of predictions) {
      if (prediction.status !== "published") {
        continue;
      }

      predictionResults.push(
        await settlePredictionValidation(
          runtime.unitOfWork,
          fixtureById,
          prediction,
          executedAt,
        ),
      );
    }

    const parlays = await runtime.unitOfWork.parlays.list();
    const parlayResults: ParlayValidationResult[] = [];

    for (const parlay of parlays) {
      parlayResults.push(
        await settleParlayValidation(runtime.unitOfWork, fixtureById, parlay, executedAt),
      );
    }

    return {
      executedAt,
      settledPredictionCount: predictionResults.filter((result) => result.status === "settled").length,
      skippedPredictionCount: predictionResults.filter((result) => result.status === "skipped").length,
      settledParlayCount: parlayResults.filter((result) => result.status === "settled").length,
      pendingParlayCount: parlayResults.filter((result) => result.status === "pending").length,
      predictionResults,
      parlayResults,
    };
  } finally {
    await runtime.disconnect();
  }
};
