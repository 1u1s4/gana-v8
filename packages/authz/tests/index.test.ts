import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCapability,
  automationActor,
  createAuthorizationActor,
  describeWorkspace,
  hasCapability,
  listActorCapabilities,
  systemActor,
} from "../src/index.ts";

test("authz grants default automation publish capabilities", () => {
  const actor = automationActor("automation:publisher");

  assert.match(describeWorkspace(), /authz/);
  assert.equal(hasCapability(actor, "publish:parlay-store"), true);
  assert.equal(hasCapability(actor, "queue:operate"), false);
  assert.deepEqual(listActorCapabilities(actor).includes("publish:telegram"), true);
});

test("authz lets system actors bypass specific capability checks", () => {
  const actor = systemActor("system:test");

  assert.equal(hasCapability(actor, "workflow:override"), true);
  assert.doesNotThrow(() => assertCapability(actor, "publish:webhook"));
});

test("authz rejects actors without the requested capability", () => {
  const actor = createAuthorizationActor({ id: "viewer:luis", role: "viewer" });

  assert.equal(hasCapability(actor, "publish:preview"), false);
  assert.throws(() => assertCapability(actor, "publish:preview"), /viewer:luis|anonymous/);
});
