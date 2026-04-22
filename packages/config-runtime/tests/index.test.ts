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
  assert.equal(config.database.url, "mysql://gana:***@localhost:3306/gana_v8_local_dev");
  assert.equal(config.provider.source, "mock");
  assert.equal(config.provider.baseUrl, "mock://api-football");
  assert.equal(config.logging.level, "debug");
  assert.equal(config.flags.dryRun, true);
  assert.equal(config.flags.demoMode, false);
  assert.match(describeWorkspace(), /config-runtime/);
});

test("loadRuntimeConfig honors explicit environment overrides", () => {
  const config = loadRuntimeConfig({
    appName: "hermes-control-plane",
    env: {
      DATABASE_URL: "mysql://ci:***@localhost:3306/gana_v8_ci",
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
  assert.equal(config.database.url, "mysql://ci:***@localhost:3306/gana_v8_ci");
  assert.equal(config.provider.source, "replay");
  assert.equal(config.provider.baseUrl, "https://replay.gana.test/v1");
  assert.equal(config.logging.level, "warn");
  assert.equal(config.flags.dryRun, false);
  assert.equal(config.flags.demoMode, false);
});

test("loadRuntimeConfig supports the new sandbox-aligned runtime profiles", () => {
  const hybrid = loadRuntimeConfig({
    env: {
      GANA_RUNTIME_PROFILE: "hybrid",
    },
  });
  const chaos = loadRuntimeConfig({
    env: {
      GANA_RUNTIME_PROFILE: "chaos-provider",
    },
  });
  const humanQa = loadRuntimeConfig({
    env: {
      GANA_RUNTIME_PROFILE: "human-qa-demo",
    },
  });

  assert.equal(hybrid.app.profile, "hybrid");
  assert.equal(hybrid.provider.source, "live-readonly");
  assert.equal(chaos.app.profile, "chaos-provider");
  assert.equal(chaos.provider.source, "replay");
  assert.equal(humanQa.app.profile, "human-qa-demo");
  assert.equal(humanQa.provider.source, "mock");
  assert.equal(humanQa.flags.demoMode, true);
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

test("loadRuntimeConfig rejects remote databases for local-dev profiles", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          GANA_RUNTIME_PROFILE: "local-dev",
          DATABASE_URL:
            "mysql://doadmin:secret@db-mysql-nyc3-67864-do-user-16803165-0.f.db.ondigitalocean.com:25060/gana_v8_ops?sslaccept=accept_invalid_certs",
        },
      }),
    /local-dev.*must not use a remote database host/i,
  );
});

test("loadRuntimeConfig rejects localhost databases for production profile", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          GANA_RUNTIME_PROFILE: "production",
          DATABASE_URL: "mysql://gana:secret@localhost:3306/gana_v8_local_dev",
        },
      }),
    /production.*must not use a local database host/i,
  );
});
