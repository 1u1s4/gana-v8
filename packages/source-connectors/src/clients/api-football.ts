import type {
  FetchFixturesWindowInput,
  FetchOddsWindowInput,
  FootballApiClient,
  RawFixtureRecord,
  RawOddsMarketRecord,
  RawOddsSelection,
} from "../models/raw.js";

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

interface ApiFootballTeamResponse {
  readonly code?: string;
  readonly country?: string;
  readonly id?: number | string;
  readonly name?: string;
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
const toMarketKey = (bet: ApiFootballBetResponse): string => {
  const name = bet.name?.trim();
  const id = bet.id === undefined ? undefined : String(bet.id);

  if (id === "1" || name?.toLowerCase() === "match winner") {
    return "h2h";
  }

  return slugify(id ? `${id}-${name ?? "market"}` : name ?? "market");
};

const matchesMarketFilter = (bet: ApiFootballBetResponse, marketKeys: ReadonlySet<string>): boolean => {
  if (marketKeys.size === 0) {
    return true;
  }

  const candidates = [
    toMarketKey(bet),
    bet.name?.trim().toLowerCase(),
    bet.id === undefined ? undefined : String(bet.id),
  ];

  return candidates.some((candidate) => candidate !== undefined && marketKeys.has(candidate));
};

const toSelectionKey = (
  value: string | undefined,
  homeTeamName: string,
  awayTeamName: string,
): string => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "unknown";
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
): readonly RawOddsSelection[] =>
  ensureArray(bet.values)
    .map((value) => {
      const priceDecimal = Number(value.odd);
      if (!Number.isFinite(priceDecimal) || !value.value) {
        return undefined;
      }

      return {
        key: toSelectionKey(value.value, homeTeamName, awayTeamName),
        label: value.value,
        priceDecimal,
      } satisfies RawOddsSelection;
    })
    .filter((selection): selection is RawOddsSelection => selection !== undefined);

const normalizeMarketKeys = (marketKeys: readonly string[] | undefined): ReadonlySet<string> =>
  new Set((marketKeys ?? []).map((marketKey) => marketKey.trim().toLowerCase()).filter(Boolean));

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

    return responses.map((fixture, index) => ({
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
      status: toStatus(fixture.fixture?.status?.short),
      ...(fixture.update ? { sourceUpdatedAt: fixture.update } : {}),
    }));
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
            if (!matchesMarketFilter(bet, marketKeys)) {
              return [];
            }

            const selections = toSelections(bet, homeTeamName, awayTeamName);
            if (selections.length === 0) {
              return [];
            }

            return [
              {
                bookmakerKey,
                marketKey: toMarketKey(bet),
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
        throw new Error(`API-Football request failed with status ${response.status} for ${url}`);
      }

      const body = (await response.json()) as ApiFootballEnvelope<TResponse>;
      const errors = body.errors;
      if (errors && ((Array.isArray(errors) && errors.length > 0) || Object.keys(errors).length > 0)) {
        throw new Error(`API-Football returned errors for ${url}: ${JSON.stringify(errors)}`);
      }

      return ensureArray(body.response);
    } finally {
      clearTimeout(timeout);
    }
  }
}
