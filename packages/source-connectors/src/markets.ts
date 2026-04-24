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

const includesAll = (value: string, tokens: readonly string[]): boolean =>
  tokens.every((token) => value.includes(token));

const knownMarketIdAliases: Readonly<Record<string, CanonicalOddsMarketKey>> = {
  "1": "h2h",
  "5": "totals-goals",
  "8": "both-teams-score",
  "12": "double-chance",
  "45": "corners-total",
};

export const toProviderMarketSlug = (market: ProviderMarketDescriptor): string => {
  const id = normalize(market.id);
  const name = normalize(market.name);

  return slugify(id ? `${id}-${name || "market"}` : name || "market");
};

export const normalizeProviderMarketKey = (market: ProviderMarketDescriptor): string => {
  const id = normalize(market.id);
  const name = normalize(market.name);
  const idAlias = knownMarketIdAliases[id];

  if (idAlias) {
    return idAlias;
  }

  if (name === "match winner") {
    return "h2h";
  }

  if (includesAll(name, ["both", "teams", "score"])) {
    return "both-teams-score";
  }

  if (includesAll(name, ["double", "chance"])) {
    return "double-chance";
  }

  if (name.includes("corner") && (name.includes("over") || name.includes("under"))) {
    return "corners-total";
  }

  if (name.includes("corner") && (name.includes("winner") || name.includes("match"))) {
    return "corners-h2h";
  }

  if (name.includes("goal") && (name.includes("over") || name.includes("under"))) {
    return "totals-goals";
  }

  return toProviderMarketSlug(market);
};
