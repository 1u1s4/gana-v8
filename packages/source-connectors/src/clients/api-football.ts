import type {
  FetchAvailabilityWindowInput,
  FetchFixtureStatisticsInput,
  FetchFixturesWindowInput,
  FetchLineupsWindowInput,
  FetchOddsWindowInput,
  FootballApiClient,
  RawAvailabilityRecord,
  RawFixtureStatisticRecord,
  RawFixtureRecord,
  RawLineupPlayer,
  RawLineupRecord,
  RawOddsMarketRecord,
  RawOddsSelection,
  RawPlayer,
} from "../models/raw.js";
import {
  normalizeProviderMarketKey,
  toProviderMarketNameSlug,
  toProviderMarketSlug,
} from "../markets.js";

export interface ApiFootballFetchRequest {
  readonly url: string;
  readonly init?: RequestInit;
}

export type ApiFootballFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiFootballHttpClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: ApiFootballFetch;
  readonly host?: string;
  readonly providerCode?: string;
  readonly timeoutMs?: number;
}

export type ApiFootballProviderErrorCategory = "http" | "provider-envelope" | "timeout";

export class ApiFootballProviderError extends Error {
  readonly provider: string;
  readonly endpoint: string;
  readonly url: string;
  readonly category: ApiFootballProviderErrorCategory;
  readonly retriable: boolean;
  readonly httpStatus?: number;
  readonly providerErrors?: Record<string, unknown> | readonly unknown[];

  constructor(input: {
    endpoint: string;
    url: string;
    category: ApiFootballProviderErrorCategory;
    retriable: boolean;
    message: string;
    httpStatus?: number;
    providerErrors?: Record<string, unknown> | readonly unknown[];
    provider?: string;
  }) {
    super(input.message);
    this.name = "ApiFootballProviderError";
    this.provider = input.provider ?? defaultProviderCode;
    this.endpoint = input.endpoint;
    this.url = input.url;
    this.category = input.category;
    this.retriable = input.retriable;
    if (input.httpStatus !== undefined) {
      this.httpStatus = input.httpStatus;
    }
    if (input.providerErrors !== undefined) {
      this.providerErrors = input.providerErrors;
    }
  }
}

interface ApiFootballEnvelope<TResponse> {
  readonly errors?: Record<string, unknown> | readonly unknown[];
  readonly get?: string;
  readonly parameters?: Record<string, unknown>;
  readonly response?: readonly TResponse[];
  readonly results?: number;
}

interface ApiFootballFixtureResponse {
  readonly fixture?: {
    readonly date?: string;
    readonly id?: number | string;
    readonly status?: {
      readonly long?: string;
      readonly short?: string;
    };
    readonly timestamp?: number;
  };
  readonly goals?: {
    readonly home?: number | null;
    readonly away?: number | null;
  };
  readonly league?: {
    readonly country?: string;
    readonly id?: number | string;
    readonly name?: string;
    readonly season?: number | string;
  };
  readonly teams?: {
    readonly away?: ApiFootballTeamResponse;
    readonly home?: ApiFootballTeamResponse;
  };
  readonly score?: {
    readonly fulltime?: {
      readonly home?: number | null;
      readonly away?: number | null;
    };
  };
  readonly update?: string;
}

interface ApiFootballTeamResponse {
  readonly code?: string;
  readonly country?: string;
  readonly id?: number | string;
  readonly name?: string;
}

interface ApiFootballPlayerResponse {
  readonly id?: number | string;
  readonly name?: string;
  readonly nationality?: string;
  readonly number?: number | string;
  readonly photo?: string;
  readonly pos?: string;
  readonly grid?: string;
}

interface ApiFootballOddsResponse {
  readonly bookmakers?: readonly ApiFootballBookmakerResponse[];
  readonly fixture?: {
    readonly id?: number | string;
  };
  readonly league?: {
    readonly country?: string;
    readonly id?: number | string;
    readonly name?: string;
    readonly season?: number | string;
  };
  readonly teams?: {
    readonly away?: ApiFootballTeamResponse;
    readonly home?: ApiFootballTeamResponse;
  };
  readonly update?: string;
}

interface ApiFootballInjuriesResponse {
  readonly fixture?: {
    readonly id?: number | string;
  };
  readonly player?: ApiFootballPlayerResponse;
  readonly team?: ApiFootballTeamResponse;
  readonly type?: string;
  readonly reason?: string;
  readonly fixtureUpdate?: string;
  readonly update?: string;
}

interface ApiFootballLineupsResponse {
  readonly coach?: {
    readonly id?: number | string;
    readonly name?: string;
  };
  readonly formation?: string;
  readonly startXI?: readonly ApiFootballLineupPlayerResponse[];
  readonly substitutes?: readonly ApiFootballLineupPlayerResponse[];
  readonly team?: ApiFootballTeamResponse;
  readonly update?: string;
}

interface ApiFootballFixtureStatisticsResponse {
  readonly statistics?: readonly ApiFootballFixtureStatisticResponse[];
  readonly team?: ApiFootballTeamResponse;
  readonly update?: string;
}

interface ApiFootballFixtureStatisticResponse {
  readonly type?: string;
  readonly value?: number | string | null;
}

interface ApiFootballLineupPlayerResponse {
  readonly player?: ApiFootballPlayerResponse;
}

interface ApiFootballBookmakerResponse {
  readonly bets?: readonly ApiFootballBetResponse[];
  readonly id?: number | string;
  readonly name?: string;
}

interface ApiFootballBetResponse {
  readonly id?: number | string;
  readonly name?: string;
  readonly values?: readonly ApiFootballBetValueResponse[];
}

interface ApiFootballBetValueResponse {
  readonly odd?: number | string;
  readonly value?: string;
}

const defaultBaseUrl = "https://api-football-v1.p.rapidapi.com/v3";
const defaultHost = "api-football-v1.p.rapidapi.com";
const defaultProviderCode = "api-football";
const defaultTimeoutMs = 15_000;

const ensureArray = <TValue>(value: readonly TValue[] | undefined): readonly TValue[] => value ?? [];

const toDateOnly = (value: string): string => value.slice(0, 10);

const toUrl = (baseUrl: string, path: string, query: Readonly<Record<string, string | undefined>>): string => {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue && rawValue.length > 0) {
      url.searchParams.set(key, rawValue);
    }
  }

  return url.toString();
};

const toProviderId = (value: string | number | undefined, fallback: string): string =>
  value === undefined ? fallback : String(value);

const toOptionalNumber = (value: string | number | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toStatus = (rawShortStatus: string | undefined): RawFixtureRecord["status"] => {
  const status = rawShortStatus?.trim().toUpperCase();

  switch (status) {
    case "1H":
    case "2H":
    case "HT":
    case "ET":
    case "BT":
    case "LIVE":
    case "INT":
    case "SUSP":
      return "live";
    case "FT":
    case "AET":
    case "PEN":
      return "finished";
    case "PST":
      return "postponed";
    case "CANC":
    case "ABD":
    case "AWD":
    case "WO":
      return "cancelled";
    case "NS":
    case "TBD":
    default:
      return "scheduled";
  }
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";

const toCompetition = (response: ApiFootballFixtureResponse | ApiFootballOddsResponse) => ({
  name: response.league?.name ?? "Unknown league",
  providerCompetitionId: toProviderId(response.league?.id, "unknown-league"),
  ...(response.league?.country ? { country: response.league.country } : {}),
  ...(response.league?.season === undefined ? {} : { season: String(response.league.season) }),
});

const toTeam = (team: ApiFootballTeamResponse | undefined, fallbackLabel: string) => ({
  name: team?.name ?? fallbackLabel,
  providerTeamId: toProviderId(team?.id, slugify(team?.name ?? fallbackLabel)),
  ...(team?.country ? { country: team.country } : {}),
  ...(team?.code ? { shortName: team.code } : {}),
});

const toPlayer = (player: ApiFootballPlayerResponse | undefined, fallbackLabel: string): RawPlayer => {
  const shirtNumber = toOptionalNumber(player?.number);

  return {
    name: player?.name ?? fallbackLabel,
    providerPlayerId: toProviderId(player?.id, slugify(player?.name ?? fallbackLabel)),
    ...(player?.nationality ? { country: player.nationality } : {}),
    ...(player?.pos ? { position: player.pos } : {}),
    ...(player?.name ? { shortName: player.name } : {}),
    ...(shirtNumber !== undefined ? { shirtNumber } : {}),
  };
};

const toFixtureScore = (fixture: ApiFootballFixtureResponse): RawFixtureRecord["score"] => {
  const home = fixture.goals?.home ?? fixture.score?.fulltime?.home;
  const away = fixture.goals?.away ?? fixture.score?.fulltime?.away;

  return home !== undefined || away !== undefined ? { home: home ?? null, away: away ?? null } : undefined;
};
const toMarketKey = (bet: ApiFootballBetResponse): string => {
  return normalizeProviderMarketKey({ id: bet.id, name: bet.name });
};

const matchesMarketFilter = (
  bet: ApiFootballBetResponse,
  marketKey: string,
  marketKeys: ReadonlySet<string>,
): boolean => {
  if (marketKeys.size === 0) {
    return true;
  }

  const candidates = [
    marketKey,
    toProviderMarketSlug({ id: bet.id, name: bet.name }),
    toProviderMarketNameSlug({ id: bet.id, name: bet.name }),
    bet.name?.trim().toLowerCase(),
    bet.id === undefined ? undefined : String(bet.id),
  ];

  return candidates.some((candidate) => candidate !== undefined && marketKeys.has(candidate));
};

const toSelectionKey = (
  value: string | undefined,
  homeTeamName: string,
  awayTeamName: string,
  marketKey = "h2h",
): string => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (marketKey === "both-teams-score") {
    if (["yes", "y", "si", "sí"].includes(normalized)) {
      return "yes";
    }
    if (["no", "n"].includes(normalized)) {
      return "no";
    }
  }

  if (marketKey === "double-chance") {
    const home = homeTeamName.trim().toLowerCase();
    const away = awayTeamName.trim().toLowerCase();
    const compact = normalized.replace(/\s+/g, " ");
    const hasHome = compact.includes(home) || compact.includes("home") || compact.includes("1");
    const hasAway = compact.includes(away) || compact.includes("away") || compact.includes("2");
    const hasDraw = compact.includes("draw") || compact.includes("x");

    if (["home/draw", "home or draw", "1x", "1/x"].includes(compact) || (hasHome && hasDraw && !hasAway)) {
      return "home-draw";
    }
    if (["home/away", "home or away", "12", "1/2"].includes(compact) || (hasHome && hasAway && !hasDraw)) {
      return "home-away";
    }
    if (["draw/away", "draw or away", "x2", "x/2"].includes(compact) || (hasDraw && hasAway && !hasHome)) {
      return "draw-away";
    }
  }

  if (marketKey === "totals-goals" || marketKey === "corners-total") {
    if (normalized.startsWith("over")) {
      return "over";
    }
    if (normalized.startsWith("under")) {
      return "under";
    }
  }

  if (normalized === "home" || normalized === homeTeamName.trim().toLowerCase()) {
    return "home";
  }

  if (normalized === "away" || normalized === awayTeamName.trim().toLowerCase()) {
    return "away";
  }

  if (normalized === "draw") {
    return "draw";
  }

  return slugify(normalized);
};

const toSelections = (
  bet: ApiFootballBetResponse,
  homeTeamName: string,
  awayTeamName: string,
  marketKey: string,
): readonly RawOddsSelection[] =>
  ensureArray(bet.values)
    .map((value) => {
      const priceDecimal = Number(value.odd);
      if (!Number.isFinite(priceDecimal) || !value.value) {
        return undefined;
      }

      return {
        key: toSelectionKey(value.value, homeTeamName, awayTeamName, marketKey),
        label: value.value,
        priceDecimal,
      } satisfies RawOddsSelection;
    })
    .filter((selection): selection is RawOddsSelection => selection !== undefined);

const normalizeMarketKeys = (marketKeys: readonly string[] | undefined): ReadonlySet<string> =>
  new Set((marketKeys ?? []).map((marketKey) => marketKey.trim().toLowerCase()).filter(Boolean));

const normalizeIds = (ids: readonly string[] | undefined): readonly string[] =>
  (ids ?? []).map((id) => id.trim()).filter(Boolean);

const matchesIdFilter = (candidate: string, allowedIds: readonly string[]): boolean =>
  allowedIds.length === 0 || allowedIds.includes(candidate);

const normalizeStatisticKey = (type: string | undefined): string => {
  const normalized = String(type ?? "").trim().toLowerCase();

  if (normalized === "corner kicks" || normalized.includes("corner")) {
    return "corners";
  }

  return (
    normalized
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
};

const toStatisticValueNumeric = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const numericValue =
    typeof value === "number" ? value : Number(value.trim().replace(/%$/, ""));

  return Number.isFinite(numericValue) ? numericValue : undefined;
};

const toStatisticScope = (
  index: number,
  responseCount: number,
): RawFixtureStatisticRecord["scope"] => {
  if (responseCount < 2) {
    return "match";
  }

  return index === 0 ? "home" : index === 1 ? "away" : "match";
};

const toAvailabilityStatus = (
  type: string | undefined,
  reason: string | undefined,
): RawAvailabilityRecord["status"] => {
  const normalized = `${type ?? ""} ${reason ?? ""}`.trim().toLowerCase();

  if (normalized.includes("susp")) {
    return "suspended";
  }

  if (normalized.includes("doubt") || normalized.includes("question")) {
    return "doubtful";
  }

  if (normalized.includes("probable")) {
    return "probable";
  }

  if (normalized.includes("confirmed out") || normalized.includes("ruled out")) {
    return "confirmed_out";
  }

  if (normalized.includes("available") || normalized.includes("fit")) {
    return "available";
  }

  return "injured";
};

const toReasonCode = (reason: string | undefined): string | undefined => {
  const normalized = reason?.trim();
  return normalized ? slugify(normalized) : undefined;
};

const toLineupPlayer = (
  entry: ApiFootballLineupPlayerResponse,
  role: RawLineupPlayer["role"],
  fallbackLabel: string,
): RawLineupPlayer => ({
  player: toPlayer(entry.player, fallbackLabel),
  ...(entry.player?.grid ? { positionSlot: entry.player.grid } : {}),
  ...(entry.player?.pos ? { position: entry.player.pos } : {}),
  role,
});

const uniqueDateWindow = (start: string, end: string): readonly string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${toDateOnly(start)}T00:00:00.000Z`);
  const endDate = new Date(`${toDateOnly(end)}T00:00:00.000Z`);

  while (cursor.getTime() <= endDate.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

export class ApiFootballHttpClient implements FootballApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: ApiFootballFetch;
  private readonly host: string;
  private readonly providerCode: string;
  private readonly timeoutMs: number;

  constructor(options: ApiFootballHttpClientOptions) {
    this.apiKey = options.apiKey.trim();
    this.baseUrl = options.baseUrl?.trim() || defaultBaseUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.host = options.host?.trim() || defaultHost;
    this.providerCode = options.providerCode?.trim() || defaultProviderCode;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

    if (!this.apiKey) {
      throw new Error("ApiFootballHttpClient requires a non-empty apiKey");
    }
  }

  async fetchFixturesWindow(input: FetchFixturesWindowInput): Promise<readonly RawFixtureRecord[]> {
    const responses = input.league
      ? await this.request<ApiFootballFixtureResponse>("fixtures", {
          from: toDateOnly(input.window.start),
          league: input.league,
          ...(input.season !== undefined ? { season: String(input.season) } : {}),
          timezone: "UTC",
          to: toDateOnly(input.window.end),
        })
      : (
          await Promise.all(
            uniqueDateWindow(input.window.start, input.window.end).map(async (date) =>
              this.request<ApiFootballFixtureResponse>("fixtures", {
                date,
                timezone: "UTC",
              }),
            ),
          )
        ).flat();

    return responses.map((fixture, index) => {
      const score = toFixtureScore(fixture);

      return {
        awayTeam: toTeam(fixture.teams?.away, `away-team-${index}`),
        competition: toCompetition(fixture),
        homeTeam: toTeam(fixture.teams?.home, `home-team-${index}`),
        payload: fixture as Record<string, unknown>,
        providerCode: this.providerCode,
        providerFixtureId: toProviderId(fixture.fixture?.id, `fixture-${index}`),
        recordType: "fixture",
        scheduledAt:
          fixture.fixture?.date ??
          (fixture.fixture?.timestamp !== undefined
            ? new Date(fixture.fixture.timestamp * 1000).toISOString()
            : input.window.start),
        ...(score ? { score } : {}),
        status: toStatus(fixture.fixture?.status?.short),
        ...(fixture.update ? { sourceUpdatedAt: fixture.update } : {}),
      };
    });
  }

  async fetchOddsWindow(input: FetchOddsWindowInput): Promise<readonly RawOddsMarketRecord[]> {
    const responses = input.fixtureIds?.length
      ? await Promise.all(
          input.fixtureIds.map(async (fixtureId) =>
            this.request<ApiFootballOddsResponse>("odds", {
              fixture: fixtureId,
              timezone: "UTC",
            }),
          ),
        )
      : await Promise.all(
          uniqueDateWindow(input.window.start, input.window.end).map(async (date) =>
            this.request<ApiFootballOddsResponse>("odds", {
              date,
              timezone: "UTC",
            }),
          ),
        );

    const marketKeys = normalizeMarketKeys(input.marketKeys);

    return responses.flatMap((items) =>
      items.flatMap((entry, entryIndex) => {
        const homeTeamName = entry.teams?.home?.name ?? "Home";
        const awayTeamName = entry.teams?.away?.name ?? "Away";
        const providerFixtureId = toProviderId(entry.fixture?.id, `fixture-${entryIndex}`);

        return ensureArray(entry.bookmakers).flatMap((bookmaker, bookmakerIndex) => {
          const bookmakerKey = slugify(
            bookmaker.name ??
              (bookmaker.id === undefined ? `bookmaker-${bookmakerIndex}` : String(bookmaker.id)),
          );

          return ensureArray(bookmaker.bets).flatMap((bet, betIndex) => {
            const marketKey = toMarketKey(bet);

            if (!matchesMarketFilter(bet, marketKey, marketKeys)) {
              return [];
            }

            const selections = toSelections(bet, homeTeamName, awayTeamName, marketKey);
            if (selections.length === 0) {
              return [];
            }

            return [
              {
                bookmakerKey,
                marketKey,
                payload: {
                  bet,
                  bookmaker,
                  entry,
                },
                providerCode: this.providerCode,
                providerFixtureId,
                recordType: "odds",
                selections,
                ...(entry.update ? { sourceUpdatedAt: entry.update } : {}),
              } satisfies RawOddsMarketRecord,
            ];
          });
        });
      }),
    );
  }

  async fetchAvailabilityWindow(input: FetchAvailabilityWindowInput): Promise<readonly RawAvailabilityRecord[]> {
    const fixtureIds = normalizeIds(input.fixtureIds);
    const teamIds = normalizeIds(input.teamIds);
    const responses = fixtureIds.length > 0
      ? (
          await Promise.all(
            fixtureIds.map(async (fixtureId) =>
              this.request<ApiFootballInjuriesResponse>("injuries", {
                fixture: fixtureId,
                timezone: "UTC",
              }),
            ),
          )
        ).flat()
      : (
          await Promise.all(
            uniqueDateWindow(input.window.start, input.window.end).map(async (date) =>
              this.request<ApiFootballInjuriesResponse>("injuries", {
                date,
                timezone: "UTC",
              }),
            ),
          )
        ).flat();

    return responses.flatMap((entry, index) => {
      const providerFixtureId = toProviderId(entry.fixture?.id, `fixture-${index}`);
      const team = toTeam(entry.team, `team-${index}`);
      const reasonCode = toReasonCode(entry.reason);
      const sourceUpdatedAt = entry.update ?? entry.fixtureUpdate;

      if (!matchesIdFilter(providerFixtureId, fixtureIds) || !matchesIdFilter(team.providerTeamId, teamIds)) {
        return [];
      }

      return [
        {
          payload: entry as Record<string, unknown>,
          player: toPlayer(entry.player, `player-${index}`),
          providerCode: this.providerCode,
          providerFixtureId,
          recordType: "availability",
          ...(reasonCode ? { reasonCode } : {}),
          ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
          status: toAvailabilityStatus(entry.type, entry.reason),
          team,
        } satisfies RawAvailabilityRecord,
      ];
    });
  }

  async fetchLineupsWindow(input: FetchLineupsWindowInput): Promise<readonly RawLineupRecord[]> {
    const fixtureIds = normalizeIds(input.fixtureIds);
    const teamIds = normalizeIds(input.teamIds);

    if (fixtureIds.length === 0) {
      return [];
    }

    const responses = await Promise.all(
      fixtureIds.map(async (fixtureId) =>
        this.request<ApiFootballLineupsResponse>("fixtures/lineups", {
          fixture: fixtureId,
          timezone: "UTC",
        }),
      ),
    );

    return responses.flatMap((items, responseIndex) => {
      const providerFixtureId = fixtureIds[responseIndex] ?? `fixture-${responseIndex}`;

      return items.flatMap((entry, entryIndex) => {
        const team = toTeam(entry.team, `team-${entryIndex}`);
        if (!matchesIdFilter(team.providerTeamId, teamIds)) {
          return [];
        }

        const players = [
          ...ensureArray(entry.startXI).map((player, playerIndex) =>
            toLineupPlayer(player, "starter", `starter-${responseIndex}-${entryIndex}-${playerIndex}`),
          ),
          ...ensureArray(entry.substitutes).map((player, playerIndex) =>
            toLineupPlayer(player, "bench", `bench-${responseIndex}-${entryIndex}-${playerIndex}`),
          ),
        ];

        if (players.length === 0) {
          return [];
        }

        return [
          {
            ...(entry.formation ? { formation: entry.formation } : {}),
            payload: entry as Record<string, unknown>,
            players,
            providerCode: this.providerCode,
            providerFixtureId,
            recordType: "lineup",
            ...(entry.update ? { sourceUpdatedAt: entry.update } : {}),
            sourceConfidence: 1,
            status: "confirmed",
            team,
          } satisfies RawLineupRecord,
        ];
      });
    });
  }

  async fetchFixtureStatistics(
    input: FetchFixtureStatisticsInput,
  ): Promise<readonly RawFixtureStatisticRecord[]> {
    const fixtureIds = normalizeIds(input.fixtureIds);

    if (fixtureIds.length === 0) {
      return [];
    }

    const responses = await Promise.all(
      fixtureIds.map(async (fixtureId) =>
        this.request<ApiFootballFixtureStatisticsResponse>("fixtures/statistics", {
          fixture: fixtureId,
        }),
      ),
    );

    return responses.flatMap((items, responseIndex) => {
      const providerFixtureId = fixtureIds[responseIndex] ?? `fixture-${responseIndex}`;
      const teamRecords = items.flatMap((entry, entryIndex) => {
        const scope = toStatisticScope(entryIndex, items.length);
        const team = toTeam(entry.team, `team-${responseIndex}-${entryIndex}`);

        return ensureArray(entry.statistics).map((statistic) => {
          const valueNumeric = toStatisticValueNumeric(statistic.value);

          return {
            payload: {
              fixtureId: providerFixtureId,
              statistic,
              team,
            },
            providerCode: this.providerCode,
            providerFixtureId,
            recordType: "fixture-statistic",
            scope,
            ...(entry.update ? { sourceUpdatedAt: entry.update } : {}),
            statKey: normalizeStatisticKey(statistic.type),
            ...(valueNumeric !== undefined ? { valueNumeric } : {}),
          } satisfies RawFixtureStatisticRecord;
        });
      });

      const homeCorners = teamRecords.find(
        (record) => record.statKey === "corners" && record.scope === "home",
      );
      const awayCorners = teamRecords.find(
        (record) => record.statKey === "corners" && record.scope === "away",
      );
      const hasMatchCorners = teamRecords.some(
        (record) => record.statKey === "corners" && record.scope === "match",
      );

      if (
        homeCorners?.valueNumeric === undefined ||
        awayCorners?.valueNumeric === undefined ||
        hasMatchCorners
      ) {
        return teamRecords;
      }

      return [
        ...teamRecords,
        {
          payload: {
            derivedFrom: [homeCorners.payload, awayCorners.payload],
            fixtureId: providerFixtureId,
          },
          providerCode: this.providerCode,
          providerFixtureId,
          recordType: "fixture-statistic",
          scope: "match",
          statKey: "corners",
          valueNumeric: homeCorners.valueNumeric + awayCorners.valueNumeric,
        } satisfies RawFixtureStatisticRecord,
      ];
    });
  }

  private async request<TResponse>(
    path: string,
    query: Readonly<Record<string, string | undefined>>,
  ): Promise<readonly TResponse[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = toUrl(this.baseUrl, path, query);

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          "x-apisports-key": this.apiKey,
          "x-rapidapi-host": this.host,
        },
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ApiFootballProviderError({
          category: "http",
          endpoint: path,
          httpStatus: response.status,
          message: `API-Football request failed with status ${response.status} for ${url}`,
          retriable: response.status >= 500 || response.status === 429,
          url,
        });
      }

      const body = (await response.json()) as ApiFootballEnvelope<TResponse>;
      const errors = body.errors;
      if (errors && ((Array.isArray(errors) && errors.length > 0) || Object.keys(errors).length > 0)) {
        throw new ApiFootballProviderError({
          category: "provider-envelope",
          endpoint: path,
          message: `API-Football returned errors for ${url}: ${JSON.stringify(errors)}`,
          providerErrors: errors,
          retriable: false,
          url,
        });
      }

      return ensureArray(body.response);
    } catch (error) {
      if (error instanceof ApiFootballProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiFootballProviderError({
          category: "timeout",
          endpoint: path,
          message: `API-Football request timed out after ${this.timeoutMs}ms for ${url}`,
          retriable: true,
          url,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
