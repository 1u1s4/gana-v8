import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeProviderMarketKey,
  toProviderMarketNameSlug,
  toProviderMarketSlug,
  type CanonicalOddsMarketKey,
} from "../src/markets.js";

interface AliasCorpus {
  readonly markets: readonly {
    readonly aliases: readonly {
      readonly id?: string;
      readonly name?: string;
    }[];
    readonly canonicalKey: CanonicalOddsMarketKey;
  }[];
}

const aliasCorpus = JSON.parse(
  readFileSync(new URL("./fixtures/api-football-market-aliases.json", import.meta.url), "utf8"),
) as AliasCorpus;

test("normalizes the API-Football alias corpus to canonical keys", () => {
  for (const market of aliasCorpus.markets) {
    for (const alias of market.aliases) {
      assert.equal(
        normalizeProviderMarketKey(alias),
        market.canonicalKey,
        `${alias.id ?? "name-only"} ${alias.name ?? "id-only"}`,
      );
    }
  }
});

test("prefers recognized market names over fragile provider ids", () => {
  assert.equal(normalizeProviderMarketKey({ id: "5", name: "Full Time Result" }), "h2h");
  assert.equal(normalizeProviderMarketKey({ id: "1", name: "Total Goals" }), "totals-goals");
});

test("keeps compatible id fallback for id-only and unrecognized names", () => {
  assert.equal(normalizeProviderMarketKey({ id: "5" }), "totals-goals");
  assert.equal(normalizeProviderMarketKey({ id: "45", name: "Provider Renamed Corners Line" }), "corners-total");
});

test("recognizes name-only and changed-id aliases", () => {
  assert.equal(normalizeProviderMarketKey({ name: "Full Time Result" }), "h2h");
  assert.equal(normalizeProviderMarketKey({ id: "901", name: "Full Time Result" }), "h2h");
  assert.equal(normalizeProviderMarketKey({ name: "Corners Winner" }), "corners-h2h");
});

test("preserves provider slugs for unknown markets", () => {
  assert.equal(normalizeProviderMarketKey({ id: "99", name: "Half Time Odd/Even" }), "99-half-time-odd-even");
  assert.equal(toProviderMarketSlug({ id: "5", name: "Goals Over/Under" }), "5-goals-over-under");
  assert.equal(toProviderMarketNameSlug({ id: "99", name: "Half Time Odd/Even" }), "half-time-odd-even");
});
