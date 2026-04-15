import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOperatorConsoleModel,
  createOperatorConsoleSnapshot,
  renderOperatorConsole,
  renderSnapshotConsole,
} from "../src/index.js";

test("operator console builds panels and alerts from the snapshot", () => {
  const snapshot = createOperatorConsoleSnapshot();
  const model = buildOperatorConsoleModel(snapshot);

  assert.equal(model.panels.length, 6);
  assert.equal(model.health.status, "ok");
  assert.equal(model.validationSummary.partial, 1);
  assert.equal(model.alerts.length, 0);
  assert.equal(model.panels[1]?.title, "Fixtures");
});

test("operator console renderer prints a useful CLI view", () => {
  const snapshot = createOperatorConsoleSnapshot();
  const output = renderOperatorConsole(buildOperatorConsoleModel(snapshot));

  assert.match(output, /Gana V8 Operator Console/);
  assert.match(output, /Boca Juniors vs River Plate/);
  assert.match(output, /Predictions/);
  assert.match(renderSnapshotConsole(snapshot), /Health: OK/);
});
