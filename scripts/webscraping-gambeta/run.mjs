#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_DATABASE_NAME,
  createRunId,
  databaseUrlForName,
  ensureScrapingDatabase,
  insertRunStarted,
  insertScrapedPage,
  markRunCompleted,
  parseTargetUrls,
  scrapeUrl,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "schema.sql");

const readArg = (name) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.GANA_DATABASE_ADMIN_URL;
const rawDatabaseUrl = process.env.WEBSCRAPING_DATABASE_URL ?? process.env.DATABASE_URL;
const databaseName = readArg("database") ?? process.env.WEBSCRAPING_DATABASE_NAME ?? DEFAULT_DATABASE_NAME;
const targets = parseTargetUrls(readArg("urls") ?? process.env.WEBSCRAPING_TARGET_URLS);
const keepRawHtml = process.env.WEBSCRAPING_KEEP_RAW_HTML === "1" || process.argv.includes("--keep-raw-html");

if (!adminUrl && !rawDatabaseUrl) {
  throw new Error("Set DATABASE_ADMIN_URL or WEBSCRAPING_DATABASE_URL before running webscraping-gambeta");
}

if (targets.length === 0) {
  throw new Error("Set WEBSCRAPING_TARGET_URLS or pass --urls=https://example.com,https://example.org");
}

const mysqlUrl = adminUrl
  ? await ensureScrapingDatabase({ adminUrl, databaseName, schemaPath })
  : databaseUrlForName(rawDatabaseUrl, databaseName);

const runId = createRunId();
const startedAt = new Date().toISOString();
await insertRunStarted({
  mysqlUrl,
  runId,
  startedAt,
  sourceCount: targets.length,
  metadata: { databaseName, keepRawHtml, targetCount: targets.length },
});

const records = [];
try {
  for (const url of targets) {
    const record = await scrapeUrl({ url, keepRawHtml });
    await insertScrapedPage({ mysqlUrl, runId, record });
    records.push({
      id: record.id,
      url: record.url,
      statusCode: record.statusCode,
      title: record.title,
      contentHash: record.contentHash,
      textSampleLength: record.textSample.length,
    });
  }

  await markRunCompleted({ mysqlUrl, runId, completedAt: new Date().toISOString(), status: "succeeded" });
  console.log(
    JSON.stringify(
      {
        status: "succeeded",
        databaseName,
        runId,
        targetCount: targets.length,
        persistedCount: records.length,
        records,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await markRunCompleted({
    mysqlUrl,
    runId,
    completedAt: new Date().toISOString(),
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
