import assert from "node:assert/strict";
import test from "node:test";

import {
  describeWorkspace,
  loadRuntimeConfig,
} from "../src/index.ts";

test("loadRuntimeConfig resolves gana-v8 defaults for local development", () => {
  const config = loadRuntimeConfig({
    appName: "hermes-control-plane",
    env: {},
  });

  assert.equal(config.app.name, "hermes-control-plane");
  assert.equal(config.app.env, "development");
  assert.equal(config.app.profile, "local-dev");
  assert.equal(config.database.url, "postgresql://gana:gana@localhost:5432/gana_v8_local_dev");
  assert.equal(config.provider.source, "mock");
  assert.equal(config.provider.baseUrl, "mock://api-football");
  assert.equal(config.logging.level, "debug");
  assert.equal(config.flags.dryRun, true);
  assert.equal(config.flags.demoMode, true);
  assert.match(describeWorkspace(), /config-runtime/);
});

test("loadRuntimeConfig honors explicit environment overrides", () => {
  const config = loadRuntimeConfig({
    appName: "hermes-control-plane",
    env: {
      DATABASE_URL: "postgresql://ci:ci@localhost:5432/gana_v8_ci",
      GANA_DEMO_MODE: "false",
      GANA_DRY_RUN: "false",
      GANA_LOG_LEVEL: "warn",
      GANA_PROVIDER_BASE_URL: "https://replay.gana.test/v1",
      GANA_RUNTIME_PROFILE: "ci-regression",
      NODE_ENV: "test",
    },
  });

  assert.equal(config.app.env, "test");
  assert.equal(config.app.profile, "ci-regression");
  assert.equal(config.database.url, "postgresql://ci:ci@localhost:5432/gana_v8_ci");
  assert.equal(config.provider.source, "replay");
  assert.equal(config.provider.baseUrl, "https://replay.gana.test/v1");
  assert.equal(config.logging.level, "warn");
  assert.equal(config.flags.dryRun, false);
  assert.equal(config.flags.demoMode, false);
});

test("loadRuntimeConfig rejects unsupported enum values", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          GANA_APP_ENV: "qa",
        },
      }),
    /Unsupported GANA_APP_ENV/,
  );

  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          GANA_RUNTIME_PROFILE: "nightly",
        },
      }),
    /Unsupported GANA_RUNTIME_PROFILE/,
  );

  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          GANA_DRY_RUN: "sometimes",
        },
      }),
    /Unsupported boolean value/,
  );
});
