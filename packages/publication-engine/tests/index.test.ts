import assert from "node:assert/strict";
import test from "node:test";

import { automationActor, createAuthorizationActor, systemActor } from "@gana-v8/authz";

import {
  describeWorkspace,
  evaluatePublicationReadiness,
  isLivePublicationLineage,
} from "../src/index.ts";

const liveLineage = {
  environment: "production",
  profile: "production",
  providerSource: "live-readonly",
  demoMode: false,
  cohort: "live-main",
  source: "scoring-worker",
} as const;

test("publication-engine allows live publication for authorized actors with live lineage", () => {
  const decision = evaluatePublicationReadiness({
    actor: automationActor("automation:publisher"),
    channel: "parlay-store",
    lineage: liveLineage,
    sourceLineages: [liveLineage],
  });

  assert.match(describeWorkspace(), /publication-engine/);
  assert.equal(isLivePublicationLineage(liveLineage), true);
  assert.equal(decision.allowed, true);
  assert.equal(decision.reasons.length, 0);
});

test("publication-engine blocks paused channels independently of scoring lineage", () => {
  const decision = evaluatePublicationReadiness({
    actor: systemActor("system:publisher"),
    channel: "telegram",
    lineage: liveLineage,
    sourceLineages: [liveLineage],
    gateConfig: {
      channelStates: {
        telegram: "paused",
      },
    },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "channel-paused"), true);
});

test("publication-engine blocks non-live or mixed lineage for live channels", () => {
  const decision = evaluatePublicationReadiness({
    actor: systemActor("system:publisher"),
    channel: "discord",
    sourceLineages: [
      liveLineage,
      {
        environment: "test",
        profile: "ci-smoke",
        providerSource: "mock",
        demoMode: true,
        cohort: "demo-ci",
        source: "scoring-worker",
      },
    ],
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "mixed-lineage"), true);
  assert.equal(decision.reasons.some((reason) => reason.code === "non-live-lineage"), true);
});

test("publication-engine blocks actors without capability", () => {
  const decision = evaluatePublicationReadiness({
    actor: createAuthorizationActor({ id: "viewer:test", role: "viewer" }),
    channel: "preview-store",
    lineage: {
      environment: "development",
      profile: "local-dev",
      demoMode: true,
      cohort: "demo-local",
      source: "publisher-worker",
    },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "missing-capability"), true);
});
