import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuditTrailSummary,
  collectLineageIds,
  createAuditEntry,
  createLineageRef,
  InMemoryAuditTrail,
  linkLineage,
} from "../src/index.js";

test("audit trail records append-only entries with observability events", () => {
  const raw = createLineageRef({
    capturedAt: "2026-04-15T00:00:00.000Z",
    kind: "raw-fixtures-batch",
    runId: "run-1",
    schemaVersion: "v1",
    source: "api-football",
  });
  const canonical = linkLineage(
    createLineageRef({
      capturedAt: "2026-04-15T00:01:00.000Z",
      kind: "canonical-fixture-snapshot",
      runId: "run-1",
      schemaVersion: "v1",
      source: "canonical-pipeline",
    }),
    [raw],
  );

  const trail = new InMemoryAuditTrail();
  const record = trail.record({
    action: "created",
    actor: { displayName: "canonical-worker", id: "svc-canonical", type: "service" },
    context: { correlationId: "corr-1", traceId: "trace-1" },
    details: { insertedFixtures: 42 },
    lineage: [raw, canonical],
    subject: { id: "fx-100", type: "artifact" },
    summary: "canonical snapshot generated",
    tags: ["canonical", "fixtures"],
  });

  assert.equal(record.entry.subject.id, "fx-100");
  assert.equal(record.event.context.traceId, "trace-1");
  assert.equal(trail.listBySubject({ id: "fx-100", type: "artifact" }).length, 1);
  assert.equal(trail.listByLineageRef(raw.id).length, 1);
  assert.deepEqual(collectLineageIds(record.entry), [raw.id, canonical.id]);
});

test("audit entry builder generates consistent summaries across entries", () => {
  const lineage = createLineageRef({
    capturedAt: "2026-04-15T00:00:00.000Z",
    kind: "prompt-version",
    metadata: { model: "gpt-5.4" },
    runId: "run-55",
    schemaVersion: "v2",
    source: "research-worker",
  });

  const first = createAuditEntry({
    action: "approved",
    actor: { displayName: "ops", id: "user-1", type: "operator" },
    lineage: [lineage],
    subject: { id: "approval-9", type: "approval" },
    summary: "approval granted",
  });
  const second = createAuditEntry({
    action: "attached",
    actor: { displayName: "research-worker", id: "svc-research", type: "service" },
    lineage: [lineage],
    subject: { id: "prompt-9", type: "prompt" },
    summary: "prompt linked to approval",
  });

  assert.deepEqual(buildAuditTrailSummary([first.entry, second.entry]), {
    actors: 2,
    entries: 2,
    lineageRefs: 1,
    subjects: 2,
  });
  assert.equal(first.event.message, "audit:approval:approved");
  assert.equal(second.event.data.subjectType, "prompt");
});
