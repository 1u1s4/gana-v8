import assert from "node:assert/strict";
import test from "node:test";

import { describeWorkspace, evaluateOperationalPolicy } from "../src/index.ts";

test("policy-engine reports ready status when health, retries, and backfills are clean", () => {
  const report = evaluateOperationalPolicy({
    health: { status: "ok", checks: [] },
    retries: { retrying: 0, failed: 0, quarantined: 0, exhausted: 0 },
    backfills: [{ area: "fixtures", status: "ok", detail: "fresh" }],
    traceability: { taskTraceCoverageRate: 1, aiRunRequestCoverageRate: 1 },
  });

  assert.match(describeWorkspace(), /policy-engine/);
  assert.equal(report.status, "ready");
  assert.equal(report.publishAllowed, true);
});

test("policy-engine blocks publication when quarantines or backfills exist", () => {
  const report = evaluateOperationalPolicy({
    health: { status: "degraded", checks: [{ name: "live-fixtures-freshness", status: "warn", detail: "36h old" }] },
    retries: { retrying: 1, failed: 2, quarantined: 1, exhausted: 0 },
    backfills: [{ area: "fixtures", status: "needed", detail: "Latest fixtures batch is stale" }],
    traceability: { taskTraceCoverageRate: 0.9, aiRunRequestCoverageRate: 0.8 },
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.publishAllowed, false);
  assert.equal(report.backfillRequired, true);
  assert.equal(report.gates.some((gate) => gate.name === "retries" && gate.status === "block"), true);
});
