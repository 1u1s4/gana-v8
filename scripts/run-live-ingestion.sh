#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-both}"
REPO_ROOT="/root/work/gana-v8"
cd "$REPO_ROOT"

if [[ ! -f apps/ingestion-worker/dist/src/index.js ]] || [[ ! -f packages/orchestration-sdk/dist/src/index.js ]] || [[ ! -f packages/storage-adapters/dist/src/index.js ]]; then
  pnpm --filter @gana-v8/source-connectors build
  pnpm --filter @gana-v8/orchestration-sdk build
  pnpm --filter @gana-v8/storage-adapters build
  pnpm --filter @gana-v8/ingestion-worker build
fi

node scripts/run-live-ingestion.mjs "$MODE"
