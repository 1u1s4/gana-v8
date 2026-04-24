import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScrapeRecord,
  parseMysqlUrl,
  parseTargetUrls,
  sanitizeDatabaseName,
} from "../scripts/webscraping-gambeta/lib.mjs";

test("parseTargetUrls accepts comma and newline separated URLs", () => {
  assert.deepEqual(
    parseTargetUrls("https://example.com, https://gambeta.test/a\nhttps://gambeta.test/b"),
    ["https://example.com", "https://gambeta.test/a", "https://gambeta.test/b"],
  );
});

test("sanitizeDatabaseName only accepts a safe MySQL identifier", () => {
  assert.equal(sanitizeDatabaseName("webscraping_gambeta"), "webscraping_gambeta");
  assert.throws(() => sanitizeDatabaseName("webscraping-gambeta"), /Invalid MySQL database name/);
});

test("parseMysqlUrl extracts mysql connection settings without leaking query params", () => {
  const parsed = parseMysqlUrl(
    "mysql://doadmin:secret@example-do-host:25060/defaultdb?sslaccept=accept_invalid_certs",
  );

  assert.deepEqual(parsed, {
    host: "example-do-host",
    port: "25060",
    user: "doadmin",
    password: "secret",
    database: "defaultdb",
  });
});

test("buildScrapeRecord extracts title, description and visible text sample", () => {
  const record = buildScrapeRecord({
    url: "https://example.com/article",
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    fetchedAt: "2026-04-24T20:00:00.000Z",
    html: `<!doctype html>
      <html>
        <head>
          <title> Partido confirmado | Gambeta </title>
          <meta name="description" content="Resumen previo del partido" />
        </head>
        <body>
          <script>ignored()</script>
          <nav>Menu</nav>
          <main><h1>Partido confirmado</h1><p>El equipo local llega con ventaja.</p></main>
        </body>
      </html>`,
  });

  assert.equal(record.title, "Partido confirmado | Gambeta");
  assert.equal(record.description, "Resumen previo del partido");
  assert.match(record.textSample, /Partido confirmado/);
  assert.match(record.contentHash, /^[a-f0-9]{64}$/);
});
