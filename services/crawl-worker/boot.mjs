/**
 * Crawl worker boot — proves local process can load Crawlee + Playwright.
 * Does NOT equal PRODUCT PASS.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const crawleeVersion = require("crawlee/package.json").version;
const playwrightVersion = require("playwright/package.json").version;

const report = {
  ok: true,
  workerLocation: "services/crawl-worker (local Node process)",
  node: process.version,
  cwd: process.cwd(),
  crawlee: crawleeVersion,
  playwright: playwrightVersion,
  vercelFunctionHost: false,
  productPass: false,
  note: "BOOT only — not board fidelity, not DIBAY publish",
};

console.log(JSON.stringify(report, null, 2));

// Smoke-import Crawlee entrypoints
const crawlee = await import("crawlee");
if (!crawlee.CheerioCrawler || !crawlee.PlaywrightCrawler) {
  console.error("Crawlee crawlers missing");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      cheerioCrawler: typeof crawlee.CheerioCrawler,
      playwrightCrawler: typeof crawlee.PlaywrightCrawler,
      requestQueue: typeof crawlee.RequestQueue,
      sessionPool: typeof crawlee.SessionPool,
    },
    null,
    2
  )
);
