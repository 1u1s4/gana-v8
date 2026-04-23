#!/usr/bin/env node
import process from "node:process";

import { runOpsHistoryRetentionCli } from "../packages/storage-adapters/src/ops-history-retention.js";

const loadEnvFile = process.loadEnvFile?.bind(process);
if (loadEnvFile) {
  try {
    loadEnvFile();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ENOENT")) {
      throw error;
    }
  }
}

runOpsHistoryRetentionCli(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
