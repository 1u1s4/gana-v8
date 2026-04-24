export type CanonicalOddsMarketKey =
  | "h2h"
  | "totals-goals"
  | "both-teams-score"
  | "double-chance"
  | "corners-total"
  | "corners-h2h";

export interface ProviderMarketDescriptor {
  readonly id?: string | number | undefined;
  readonly name?: string | undefined;
}

export const CANONICAL_ODDS_MARKET_KEYS = [
  "h2h",
  "totals-goals",
  "both-teams-score",
  "double-chance",
  "corners-total",
  "corners-h2h",
] as const satisfies readonly CanonicalOddsMarketKey[];

const normalize = (value: string | number | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "market";

interface ProviderMarketAliasGroup {
  readonly ids: readonly string[];
  readonly nameAliases: readonly string[];
}

const canonicalMarketAliases: Readonly<Record<CanonicalOddsMarketKey, ProviderMarketAliasGroup>> = {
  "both-teams-score": {
    ids: ["8"],
    nameAliases: ["both teams score", "both teams to score", "btts"],
  },
  "corners-h2h": {
    ids: [],
    nameAliases: ["corners match winner", "corners winner", "corners h2h"],
  },
  "corners-total": {
    ids: ["45"],
    nameAliases: [
      "corners over under",
      "corners over/under",
      "corner kicks over under",
      "corner kicks over/under",
      "total corners",
    ],
  },
  "double-chance": {
    ids: ["12"],
    nameAliases: ["double chance"],
  },
  h2h: {
    ids: ["1"],
    nameAliases: ["match winner", "full time result", "fulltime result", "1x2"],
  },
  "totals-goals": {
    ids: ["5"],
    nameAliases: ["goals over under", "goals over/under", "over under", "over/under", "total goals"],
  },
};

const knownMarketNameAliases: ReadonlyMap<string, CanonicalOddsMarketKey> = new Map(
  CANONICAL_ODDS_MARKET_KEYS.flatMap((canonicalKey) =>
    canonicalMarketAliases[canonicalKey].nameAliases.map((name) => [name, canonicalKey] as const),
  ),
);

const knownMarketIdAliases: ReadonlyMap<string, CanonicalOddsMarketKey> = new Map(
  CANONICAL_ODDS_MARKET_KEYS.flatMap((canonicalKey) =>
    canonicalMarketAliases[canonicalKey].ids.map((id) => [id, canonicalKey] as const),
  ),
);

export const toProviderMarketSlug = (market: ProviderMarketDescriptor): string => {
  const id = normalize(market.id);
  const name = normalize(market.name);

  return slugify(id ? `${id}-${name || "market"}` : name || "market");
};

export const toProviderMarketNameSlug = (market: ProviderMarketDescriptor): string | undefined => {
  const name = normalize(market.name);

  return name ? slugify(name) : undefined;
};

export const normalizeProviderMarketKey = (market: ProviderMarketDescriptor): string => {
  const id = normalize(market.id);
  const name = normalize(market.name);
  const nameAlias = knownMarketNameAliases.get(name);

  if (nameAlias) {
    return nameAlias;
  }

  const idAlias = knownMarketIdAliases.get(id);
  if (idAlias) {
    return idAlias;
  }

  return toProviderMarketSlug(market);
};
