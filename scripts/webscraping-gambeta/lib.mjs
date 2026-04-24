import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

export const DEFAULT_DATABASE_NAME = "webscraping_gambeta";

export const sanitizeDatabaseName = (databaseName) => {
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Invalid MySQL database name: ${databaseName}`);
  }
  return databaseName;
};

export const parseMysqlUrl = (mysqlUrl) => {
  const parsed = new URL(mysqlUrl);
  if (parsed.protocol !== "mysql:") {
    throw new Error(`Expected a mysql:// URL, received ${parsed.protocol}`);
  }

  return {
    host: parsed.hostname,
    port: parsed.port || "3306",
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  };
};

export const databaseUrlForName = (mysqlUrl, databaseName) => {
  const safeDatabaseName = sanitizeDatabaseName(databaseName);
  const parsed = new URL(mysqlUrl);
  parsed.pathname = `/${safeDatabaseName}`;
  return parsed.toString();
};

export const parseTargetUrls = (input) =>
  String(input ?? "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const decodeHtmlEntities = (value) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const normalizeWhitespace = (value) => decodeHtmlEntities(value).replace(/\s+/g, " ").trim();

const extractTagContent = (html, tagName) => {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? normalizeWhitespace(match[1]) : null;
};

const extractMetaContent = (html, name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${escapedName}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escapedName}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+property=["']${escapedName}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escapedName}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return normalizeWhitespace(match[1]);
  }

  return null;
};

const extractVisibleText = (html) =>
  normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );

export const buildScrapeRecord = ({ url, statusCode, contentType, fetchedAt, html, keepRawHtml = false }) => {
  const title = extractTagContent(html, "title") ?? extractMetaContent(html, "og:title");
  const description = extractMetaContent(html, "description") ?? extractMetaContent(html, "og:description");
  const visibleText = extractVisibleText(html);

  return {
    id: `scr_${sha256(`${url}:${fetchedAt}`).slice(0, 24)}`,
    url,
    urlHash: sha256(url),
    statusCode,
    contentType: contentType || null,
    title,
    description,
    textSample: visibleText.slice(0, 12000),
    contentHash: sha256(html),
    fetchedAt,
    rawHtml: keepRawHtml ? html : null,
    metadata: {
      byteLength: Buffer.byteLength(html),
      textLength: visibleText.length,
    },
  };
};

const toMysqlDatetime = (isoValue) => isoValue.replace("T", " ").replace("Z", "");

const sqlLiteral = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "object") return sqlLiteral(JSON.stringify(value));
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
};

export const runMysql = async ({ mysqlUrl, sql, database }) => {
  const config = parseMysqlUrl(mysqlUrl);
  const args = [
    "--batch",
    "--raw",
    "--ssl",
    "--skip-ssl-verify-server-cert",
    "--host",
    config.host,
    "--port",
    config.port,
    "--user",
    config.user,
  ];

  if (database ?? config.database) {
    args.push(database ?? config.database);
  }

  return new Promise((resolve, reject) => {
    const child = spawn("mysql", args, {
      env: { ...process.env, MYSQL_PWD: config.password },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`mysql exited with ${code}: ${stderr || stdout}`));
    });
    child.stdin.end(sql);
  });
};

export const ensureScrapingDatabase = async ({ adminUrl, databaseName = DEFAULT_DATABASE_NAME, schemaPath }) => {
  const safeDatabaseName = sanitizeDatabaseName(databaseName);
  await runMysql({
    mysqlUrl: adminUrl,
    sql: `CREATE DATABASE IF NOT EXISTS \`${safeDatabaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  });

  const schemaSql = await readFile(schemaPath, "utf8");
  await runMysql({ mysqlUrl: adminUrl, database: safeDatabaseName, sql: schemaSql });

  return databaseUrlForName(adminUrl, safeDatabaseName);
};

export const insertRunStarted = async ({ mysqlUrl, runId, startedAt, sourceCount, metadata }) => {
  await runMysql({
    mysqlUrl,
    sql: `INSERT INTO scrape_runs (id, started_at, source_count, status, metadata)
VALUES (${sqlLiteral(runId)}, ${sqlLiteral(toMysqlDatetime(startedAt))}, ${sourceCount}, 'running', ${sqlLiteral(metadata)})
ON DUPLICATE KEY UPDATE started_at=VALUES(started_at), source_count=VALUES(source_count), status='running', error=NULL, metadata=VALUES(metadata);`,
  });
};

export const insertScrapedPage = async ({ mysqlUrl, runId, record }) => {
  await runMysql({
    mysqlUrl,
    sql: `INSERT INTO scraped_pages
(id, run_id, url_hash, url, status_code, content_type, title, description, text_sample, content_hash, fetched_at, raw_html, metadata)
VALUES (
  ${sqlLiteral(record.id)},
  ${sqlLiteral(runId)},
  ${sqlLiteral(record.urlHash)},
  ${sqlLiteral(record.url)},
  ${record.statusCode},
  ${sqlLiteral(record.contentType)},
  ${sqlLiteral(record.title)},
  ${sqlLiteral(record.description)},
  ${sqlLiteral(record.textSample)},
  ${sqlLiteral(record.contentHash)},
  ${sqlLiteral(toMysqlDatetime(record.fetchedAt))},
  ${sqlLiteral(record.rawHtml)},
  ${sqlLiteral(record.metadata)}
)
ON DUPLICATE KEY UPDATE
  status_code=VALUES(status_code),
  content_type=VALUES(content_type),
  title=VALUES(title),
  description=VALUES(description),
  text_sample=VALUES(text_sample),
  content_hash=VALUES(content_hash),
  fetched_at=VALUES(fetched_at),
  raw_html=VALUES(raw_html),
  metadata=VALUES(metadata);`,
  });
};

export const markRunCompleted = async ({ mysqlUrl, runId, completedAt, status = "succeeded", error = null }) => {
  await runMysql({
    mysqlUrl,
    sql: `UPDATE scrape_runs
SET completed_at=${sqlLiteral(toMysqlDatetime(completedAt))}, status=${sqlLiteral(status)}, error=${sqlLiteral(error)}
WHERE id=${sqlLiteral(runId)};`,
  });
};

export const scrapeUrl = async ({ url, keepRawHtml = false, timeoutMs = 20000 }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "gana-v8-webscraping-gambeta/0.1 (+https://github.com/1u1s4/gana-v8)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const html = await response.text();
    return buildScrapeRecord({
      url,
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
      fetchedAt: new Date().toISOString(),
      html,
      keepRawHtml,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const createRunId = () => `run_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17)}_${randomUUID().slice(0, 8)}`;
