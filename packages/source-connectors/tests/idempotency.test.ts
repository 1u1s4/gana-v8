import assert from "node:assert/strict";
import test from "node:test";

import { buildIdempotencyKey } from "../src/idempotency.js";

test("buildIdempotencyKey is stable across param order", () => {
  const left = buildIdempotencyKey({
    endpointFamily: "fixtures",
    params: { league: "PL", season: 2026 },
    providerCode: "api-football",
    windowEnd: "2026-04-16T00:00:00.000Z",
    windowStart: "2026-04-15T00:00:00.000Z",
  });

  const right = buildIdempotencyKey({
    endpointFamily: "fixtures",
    params: { season: 2026, league: "PL" },
    providerCode: "api-football",
    windowEnd: "2026-04-16T00:00:00.000Z",
    windowStart: "2026-04-15T00:00:00.000Z",
  });

  assert.equal(left, right);
});
