import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProviderMarketKey, toProviderMarketSlug } from "../src/markets.js";

test("normalizes API-Football market names to canonical keys", () => {
  assert.equal(normalizeProviderMarketKey({ id: "1", name: "Match Winner" }), "h2h");
  assert.equal(normalizeProviderMarketKey({ id: "5", name: "Goals Over/Under" }), "totals-goals");
  assert.equal(normalizeProviderMarketKey({ id: "8", name: "Both Teams Score" }), "both-teams-score");
  assert.equal(normalizeProviderMarketKey({ id: "12", name: "Double Chance" }), "double-chance");
  assert.equal(normalizeProviderMarketKey({ id: "45", name: "Corners Over Under" }), "corners-total");
});

test("preserves provider slugs for unknown markets", () => {
  assert.equal(normalizeProviderMarketKey({ id: "99", name: "Half Time Odd/Even" }), "99-half-time-odd-even");
  assert.equal(toProviderMarketSlug({ id: "5", name: "Goals Over/Under" }), "5-goals-over-under");
});
